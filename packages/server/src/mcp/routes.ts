// MCP endpoints, three auth lanes (locked):
//   Lane A (universal): secret in the URL PATH — /c/<secret>/mcp  (Zapier pattern;
//          NEVER query string; the only lane claude.ai-web can use credential-free)
//   Lane B (header-capable clients): generic /mcp + Authorization: Bearer <secret>
//   Lane C (OAuth 2.1, additive Jun 7 2026): /mcp + Bearer rmt_at_<...> access token
//          minted by the self-hosted AS (oauth/routes.ts) after card-picker consent.
//          The rmt_at_ prefix disambiguates from card secrets without a second lookup.
// Discovery: ONLY the bare /mcp 401 advertises the OAuth lane via WWW-Authenticate
// (RFC 9728); the per-card secret path stays header-free — a valid credential never
// 401s, so existing static-secret clients never see OAuth at all.
// Stateless transport: fresh McpServer + transport per request, no session map.

import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import {
  hashCardSecret,
  type CardKind,
  type CardRow,
  type CompiledCard,
  type WireDelegation,
} from "@t3spend/engine";
import type { Context } from "hono";
import type { Address } from "viem";
import { envInt, type AppDeps } from "../deps";
import { RateLimiter, clientIp } from "../ratelimit";
import { acceptedResources, resourceMetadataUrl } from "../oauth/routes";
import { ACCESS_TOKEN_PREFIX, type OAuthStore } from "../oauth/store";
import { buildMcpServer, type T3NAttestationContext } from "./server";
import { T3N_HEADERS, verifyT3NRequest } from "./t3n-auth";

/** Build a minimal virtual card for T3N issuance-only sessions where the agent
 * authenticates before any card is bound. The virtual card has empty terms so
 * only the `issue_card` tool registers; all other spend/execute/subcard tools
 * are absent. The virtual card is NEVER stored — it exists only for the lifetime
 * of this one MCP request. */
function virtualCard(agentAddress: Address): CardRow {
  return {
    id: "t3n-issuance-session",
    user_id: "t3n-issuance",
    parent_card_id: null,
    name: "t3n issuance session",
    secret_hash: "",
    secret_enc: null,
    terms: { subcards: false },
    kind: "pay" as CardKind,
    compiled: { kind: "pay", rootCaveats: [], orGroups: null, carvePolicy: { perTxMaxAtoms: null, merchants: null }, periodStartDate: null, terms: { subcards: false } } as CompiledCard,
    delegation: { delegate: agentAddress, delegator: agentAddress, authority: "0x", caveats: [], salt: "0x", signature: "0x" } as WireDelegation,
    k_agent_enc: new Uint8Array(0), // treated as DID-bound (no server-custodied key)
    k_agent_address: agentAddress,
    t3n_did: null,
    t3n_binding_json: null,
    status: "active",
    created_at: 0,
  };
}

// Reject oversized MCP bodies before parsing (cheap DoS guard). 1 MiB is generous for
// JSON-RPC tool calls; paid_fetch returns are server-fetched, never request bodies.
const MAX_BODY_BYTES = 1 << 20;

export function mcpRoutes(deps: AppDeps, oauth: OAuthStore): Hono {
  const app = new Hono();
  // bad-credential brute-force guard (per IP): 30 rejected attempts / minute
  const badSecret = new RateLimiter(envInt("T3SPEND_MCP_BAD_SECRET_LIMIT", 30), 60_000);
  // per-card request ceiling: 240 calls / minute (well above any real agent loop)
  const perCard = new RateLimiter(envInt("T3SPEND_MCP_RATE_LIMIT", 240), 60_000);

  // host allowlist (DNS-rebinding): enforced only when an explicit public base is set.
  // T3SPEND_ALLOWED_HOSTS (comma-separated) widens it, e.g. the Railway fallback domain.
  // Evaluated per request (cheap) so env changes don't require a route rebuild.
  const allowedHosts = (): Set<string> | null => {
    try {
      const fromBase = process.env.T3SPEND_PUBLIC_MCP_BASE ? [new URL(process.env.T3SPEND_PUBLIC_MCP_BASE).host] : [];
      const extra = (process.env.T3SPEND_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
      const all = [...fromBase, ...extra];
      return all.length ? new Set(all) : null;
    } catch {
      return null;
    }
  };

  // Drain the (small) request body before an early-return response: an unconsumed POST
  // body left on a keep-alive connection can desync the NEXT request that reuses it.
  // Never used for 413 — not reading the oversized body is the whole point there.
  const drain = (c: Context) => c.req.text().catch(() => {});

  // 401 helper. `advertise` (bare /mcp only) attaches the WWW-Authenticate header that
  // triggers OAuth discovery in spec-compliant clients; without it the 401 is "dead".
  const unauthorized = (c: Context, error: string, advertise: boolean) => {
    if (advertise) {
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl()}", error="invalid_token", error_description="${error}"`,
      );
    }
    return c.json({ error }, 401);
  };

  const serve = async (c: Context, credential: string | undefined, oauthLane: boolean) => {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    let card: CardRow | null = null;
    let miss = "unknown card";
    let t3nCtx: T3NAttestationContext | null = null;

    // DNS-rebinding guard: when a canonical host is configured, reject mismatched Host
    // headers (a rebinding attack points a victim's browser DNS at our IP with its own
    // Host). Non-browser agents send the correct Host, so this is transparent to them.
    // A MISSING Host is rejected too — every legitimate HTTP/1.1+ client sends one.
    const hosts = allowedHosts();
    if (hosts) {
      const host = c.req.header("host");
      if (!host || !hosts.has(host)) {
        await drain(c);
        return c.json({ error: "host not allowed" }, 421);
      }
    }

    // body-size cap (Content-Length fast path; chunked bodies are bounded by the
    // edge/runtime request buffer — this is the cheap pre-parse guard, not the only one).
    // The oversized body is deliberately never read, which leaves its bytes on the
    // keep-alive socket; a client that reuses that socket parses its next response
    // against garbage (431s, empirically reproduced). Connection: close tells the
    // client not to reuse it — spec-compliant HTTP stacks honor the header and drop
    // the socket from their pool (Bun's server won't force-close on its own; a client
    // that ignores the header desyncs only itself).
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) return c.json({ error: "payload too large" }, 413, { Connection: "close" });

    if (!credential) {
      // --- Lane D: T3N DID authentication (no bearer credential) ---
      const t3nDid = c.req.header(T3N_HEADERS.DID);
      const t3nSig = c.req.header(T3N_HEADERS.SIGNATURE);
      const t3nTs = c.req.header(T3N_HEADERS.TIMESTAMP);

      if (t3nDid && t3nSig && t3nTs && deps.t3n?.enabled) {
        const result = await verifyT3NRequest(deps.store, {
          did: t3nDid,
          signature: t3nSig,
          timestamp: t3nTs,
          attestation: c.req.header(T3N_HEADERS.ATTESTATION),
        }, nowSec);

        if (result.authenticated) {
          // Always set t3nCtx when T3N auth succeeds — even without a bound card,
          // so the agent can use the `issue_card` tool to create one.
          if (result.identity.publicKey) {
            t3nCtx = {
              agentDid: result.identity.did,
              agentAddress: result.identity.publicKey,
              teeQuote: c.req.header(T3N_HEADERS.ATTESTATION) ?? null,
              teeVerified: result.teeVerified,
            };
          }
          if (result.card) {
            card = result.card;
          } else {
            // No card bound yet — use a virtual card for the issuance session.
            // Only the `issue_card` tool will be visible (others require real terms).
            card = virtualCard(
              (result.identity.publicKey ?? "0x0000000000000000000000000000000000000000") as Address,
            );
          }
        } else {
          if (!badSecret.allow(clientIp(c), nowMs)) return c.json({ error: "too many requests" }, 429);
          return unauthorized(c, result.error ?? "t3n auth failed", oauthLane);
        }
      } else {
        await drain(c);
        return unauthorized(c, "missing credential", oauthLane);
      }
    } else {
      // --- Existing auth lanes: secret URL (Lane A/B) or OAuth (Lane C) ---
      if (oauthLane && credential.startsWith(ACCESS_TOKEN_PREFIX)) {
        const row = oauth.getByAccessToken(credential);
        card = row && (!row.resource || acceptedResources().includes(row.resource)) ? deps.store.getCard(row.card_id) : null;
        miss = "invalid or expired access token";
      } else {
        card = deps.store.getCardBySecretHash(hashCardSecret(credential));
      }
      if (!card && credential.startsWith(ACCESS_TOKEN_PREFIX)) {
        card = deps.store.getCardBySecretHash(hashCardSecret(credential));
      }
      if (!card) {
        await drain(c);
        if (!badSecret.allow(clientIp(c), nowMs)) return c.json({ error: "too many requests" }, 429);
        return unauthorized(c, miss, oauthLane);
      }
    }
    if (!card) {
      await drain(c);
      // never echo the attempted credential; rate-limit the source
      if (!badSecret.allow(clientIp(c), nowMs)) return c.json({ error: "too many requests" }, 429);
      return unauthorized(c, miss, oauthLane);
    }
    if (card.status === "revoked" || card.status === "nuked") {
      await drain(c);
      return unauthorized(c, "card revoked", oauthLane);
    }
    // Stateless transport: there is no server->client notification stream to attach a
    // GET to, and letting the per-request transport take the GET leaves the client
    // hanging with no response headers at all (empirically verified). 405 is the spec
    // answer for "no stream offered"; SDK clients log it and continue over POSTs.
    if (c.req.method === "GET") {
      return c.json({ error: "method not allowed" }, 405, { Allow: "POST, DELETE" });
    }
    // POST = the actual JSON-RPC calls; the per-card ceiling applies to those only.
    if (c.req.method === "POST" && !perCard.allow(card.id, nowMs)) {
      await drain(c);
      return c.json({ error: "rate limit exceeded for this card" }, 429);
    }
    // Buffer the body NOW (Hono memoizes it, the transport's own read hits the cache):
    // if the transport bails before reading — e.g. 406 on a client that omits the SSE
    // Accept value — the unread bytes would desync this keep-alive socket and 431 the
    // next pooled request (empirically reproduced in the conformance suite).
    if (c.req.method === "POST") await drain(c);
    // frozen cards still ANSWER (locked): `card` reports status, spend tools refuse
    const server = buildMcpServer(deps, card, t3nCtx);
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return transport.handleRequest(c);
  };

  app.all("/c/:secret/mcp", (c) => serve(c, c.req.param("secret"), false));

  app.all("/mcp", (c) => {
    const m = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
    return serve(c, m?.[1], true);
  });

  return app;
}
