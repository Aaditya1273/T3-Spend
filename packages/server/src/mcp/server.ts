// Per-card MCP server: the tool list IS the capability surface (locked pattern).
// A pay-only card never sees `execute`; sub-cards-off never sees issue/revoke_subcard.
// Stateless: a fresh McpServer per request (cheap; no session state to corrupt).
//
// Typed refusals come back as isError:true + structured JSON so agents can explain
// themselves ("over_period_limit, remaining 3.20, resets at ...") instead of crashing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData, parseAbi, toFunctionSelector } from "viem";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import {
  EngineError,
  RefusalError,
  agentRevokeSubcard,
  atomsToUsdc,
  buildAttestationMessage,
  buildAttestedReceipt,
  buildSubCardAuthMessage,
  buildX402Payload,
  canonicalSelector,
  cardState,
  declaredContractScope,
  finalizeX402Charge,
  issueCardForDID,
  issueSubCard,
  isValidT3NDID,
  parseAtoms,
  prepareSubCardForDID,
  finalizeSubCardForDID,
  requirementMatchesRail,
  spend,
  usdcToAtoms,
  type Address,
  type CardRow,
  type CardTerms,
  type Hex,
  type SpendDeps,
  type WireExecution,
  type X402Requirement,
} from "@t3spend/engine";
import { recoverMessageAddress } from "viem";
import type { AppDeps } from "../deps";
import { spendDeps, spendKey } from "../deps";


const SERVER_INFO = { name: "t3-spend", version: "0.17.2" };

// Surfaced to clients at initialize. Claude Code's tool search (default-on since mid-2026)
// keys discovery on this text and truncates at 2KB: keep it a compact routing guide.
const INSTRUCTIONS = [
  "T3 Spend is the agent's spending card: a scoped, revocable spending authority granted by the card owner. The connection itself is the card; it holds no funds of its own and every action is checked against the card's terms (per-payment cap, period budget, expiry, allowlists).",
  "Tools: `card` reports status, terms and remaining budget (check it before the first spend). `pay` sends USDC to a recipient or settles an x402 payment requirement. `paid_fetch` fetches an HTTP resource and pays its 402 challenge automatically. `execute` calls an allowlisted contract within the card's contract terms. `issue_subcard` mints a narrower child card for a sub-agent and returns its connection URL (treat it as a secret). `revoke_subcard` kills a child card and its descendants instantly. On fiat-linked cards, `fiat_pay` buys over Visa rails (simulated, test mode) from the same budget and `card_credentials` reveals the linked test Visa for merchant checkouts.",
  "A frozen card still answers `card` but refuses spends. Refusals name the violated term; read the message before retrying.",
].join("\n\n");

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function refused(e: RefusalError): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }], isError: true };
}

function failed(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ status: "error", message }, null, 2) }],
    isError: true,
  };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof RefusalError) return refused(e);
    if (e instanceof EngineError) return failed(`${e.stage}: ${e.message}`);
    return failed(e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// The card URL minting (the server's public base for sub-card URLs)
// ---------------------------------------------------------------------------

export function cardUrl(secret: string): string {
  const base = process.env.T3SPEND_PUBLIC_MCP_BASE ?? `http://localhost:${process.env.PORT ?? 4070}`;
  return `${base}/c/${secret}/mcp`;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/** Optional T3N identity context passed from the auth lane for attestation. */
export type T3NAttestationContext = {
  agentDid: string;
  agentAddress: Address;
  teeQuote?: string | null;
  /** Whether the TEE attestation quote was cryptographically verified. */
  teeVerified: boolean;
};

export function buildMcpServer(deps: AppDeps, card: CardRow, t3nCtx?: T3NAttestationContext | null): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  const sd: SpendDeps = spendDeps(deps);
  const now = () => Math.floor(Date.now() / 1000);
  // serialize money-moving sections per card TREE: concurrent spends of the same
  // budget must validate one-at-a-time or both can pass a read-then-write check.
  // The tree-root key is constant for this card (no reparenting): resolve it once.
  const treeKey = spendKey(deps.store, card.id);
  const locked = <T>(fn: () => Promise<T>): Promise<T> => deps.spendMutex.run(treeKey, fn);

  // ---- issue_card (only when authenticated via Lane D / T3N) ----
  // Creates a DID-bound root card on the server. The card gets a server-custodied
  // K_agent for delegation-chain operations; the agent authenticates via Lane D
  // using its T3N DID binding.
  if (t3nCtx) {
    server.registerTool(
      "issue_card",
      {
        title: "Issue a new card (T3N DID-bound)",
        description:
          "Create a new spending card bound to your T3N DID. The card is immediately bound to your DID so you can use it over Lane D (T3N auth headers). Returns the card URL and ID.",
        inputSchema: {
          name: z.string().min(1).max(80).describe("label for the card (shown in the owner's dashboard)"),
          terms: z.object({
            pay: z.object({
              period: z.object({ amount: z.string(), seconds: z.number().int().min(60) }),
              lifetime: z.object({ amount: z.string() }).optional(),
            }).optional(),
            contract: z.object({
              targets: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).min(1),
              selectors: z.array(z.string()).min(1),
              tokens: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).min(1).optional(),
              perTradeMax: z.string().optional(),
            }).optional(),
            expiry: z.number().int().optional(),
            maxUses: z.number().int().min(1).optional(),
            perTxMax: z.string().optional(),
            merchants: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).optional(),
            subcards: z.boolean().optional(),
          }).describe("card terms; only pay, contract, expiry, and basic limits are supported on root cards"),
        },
        annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
      },
      async (args: { name: string; terms: unknown }) =>
        run(async () => {
          if (!deps.userSigner) {
            throw new EngineError("api", "no signer configured (T3SPEND_DEV_USER_PK)");
          }
          // Use the same userId convention as the test helpers: lowercased dev signer address
          const userId = deps.userSigner.address.toLowerCase();
          if (!deps.store.getUser(userId)) {
            deps.store.upsertUser({ id: userId, address: deps.userSigner.address });
          }
          const result = await issueCardForDID(
            { store: deps.store, userSigner: deps.userSigner, revocationNonceOverride: 0n },
            {
              userId,
              name: args.name,
              terms: args.terms as CardTerms,
              agentDid: t3nCtx.agentDid,
              agentAddress: t3nCtx.agentAddress,
            },
          );
          return {
            card_id: result.cardId,
            card_url: cardUrl(result.secret),
            terms: result.terms,
            agent_did: t3nCtx.agentDid,
          };
        }),
    );

    // ---- attest_charge (T3N only: agent signs to prove it authorized a charge) ----
    server.registerTool(
      "attest_charge",
      {
        title: "Attest a charge with your T3N key",          description:
          "After a pay or execute confirms, call this with the charge_id (returned in the receipt) and your EIP-191 signature over the attestation message to produce a cryptographically attested receipt. The attestation proves your agent DID authorized the specific transaction and is chain-of-custody verifiable off-chain.\n\nBuild the EIP-191 message yourself: `t3spend:t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>` (use buildAttestationMessage from @t3spend/engine). Sign it with your T3N key and pass the result + the timestamp you used. The timestamp is REQUIRED for pre-signing (omitting it forces the server to use `now()`, causing signature mismatch due to clock skew).",
        inputSchema: {
          charge_id: z.string().describe("the charge ID from a pay or execute receipt"),
          signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).describe("EIP-191 signature over the attestation message: `t3spend:t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>`"),
          timestamp: z.number().int().min(1e9).describe("Unix seconds you used when building the attestation message (required for pre-signing; server verifies against this value)"),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: { charge_id: string; signature: string; timestamp?: number }) =>
        run(async () => {
          const charge = sd.store.getCharge(args.charge_id);
          if (!charge) {
            throw new RefusalError("invalid_terms", "charge not found");
          }
          if (charge.card_id !== card.id) {
            throw new RefusalError("invalid_terms", "charge does not belong to this card");
          }

          // The agent supplies the timestamp so it can pre-sign the attestation
          // message before sending the request. Use args.timestamp when present
          // (avoids clock-skew mismatch between agent and server).
          const at = args.timestamp ?? now();
          let recovered: Address;
          const message = buildAttestationMessage(
            charge.id,
            card.id,
            charge.tx_hash,
            at,
          );
          try {
            recovered = await recoverMessageAddress({ message, signature: args.signature as Hex });
          } catch {
            throw new RefusalError("invalid_terms", "signature recovery failed");
          }

          if (recovered.toLowerCase() !== t3nCtx.agentAddress.toLowerCase()) {
            throw new RefusalError("invalid_terms", "signature does not match agent DID key");
          }

          const amount = (Number(charge.amount_atoms) / 1e6).toFixed(6);
          const fee = (Number(charge.fee_atoms) / 1e6).toFixed(6);

          const receipt = buildAttestedReceipt(
            t3nCtx.agentDid,
            t3nCtx.agentAddress,
            charge.id,
            card.id,
            charge.tx_hash,
            amount,
            fee,
            t3nCtx.teeQuote ?? null,
            t3nCtx.teeVerified,
          );

          return {
            ...receipt,
            signature: args.signature,
          };
        }),
    );
  }

  // ---- card (always) ----
  server.registerTool(
    "card",
    {
      title: "Card status",
      description:
        "Your spending card's terms and live state: remaining budget this period, lifetime remaining, expiry, recent charges, sub-cards. Call this first to learn what you can spend.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run(async () => {
        const state = cardState(sd.store, card.id, now());
        // Agent-facing timestamps are rendered as ISO 8601, never raw Unix epochs:
        // a bare epoch invites the consuming model to misconvert it (observed: a card
        // expiring Jun 21 read as "Apr 21, already passed"). cardState itself stays
        // epoch-typed for the dashboard + internal callers; the conversion is local here.
        const iso = (sec: number | null | undefined) =>
          sec === null || sec === undefined ? null : new Date(sec * 1000).toISOString();
        const charges = sd.store.listCharges(card.id, 10).map((c) => ({
          charge_id: c.id,
          amount: (Number(c.amount_atoms) / 1e6).toFixed(6),
          fee: (Number(c.fee_atoms) / 1e6).toFixed(6),
          to: c.to_addr,
          status: c.status,
          tx: c.tx_hash,
          memo: c.memo,
          at: iso(c.created_at),
          ...(t3nCtx ? { agent_did: t3nCtx.agentDid } : {}),
        }));
        // The card's funds/execution account: the ROOT delegator, where this card's
        // USDC lives and where any contract output (e.g. swapped WETH) returns. It is
        // the same account the redemption executes from (spend.ts resolves the root
        // user's address identically). Surfaced so an agent can set a swap recipient
        // itself instead of guessing MSG_SENDER or asking the user for an address.
        const root = sd.store.ancestorChain(card.id).at(-1);
        const account = root ? (sd.store.getUser(root.user_id)?.address ?? null) : null;
        return {
          ...state,
          account,
          expires_at: iso(state?.expires_at),
          period_resets_at: iso(state?.period_resets_at),
          recent_charges: charges,
        };
      }),
  );

  // ---- pay (cards with a pay capability) ----
  if (card.terms.pay) {
    server.registerTool(
      "pay",
      {
        title: "Pay USDC",
        description:
          "Send USDC on Base to a recipient address, within this card's limits. Blocks until the payment confirms on-chain (seconds). Refusals are typed (over_period_limit, merchant_not_allowed, ...) — relay them honestly to your user. Use idempotency_key to make retries safe.",
        inputSchema: {
          to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("recipient address"),
          amount: z.string().regex(/^\d+(\.\d{1,6})?$/).describe("USDC amount, decimal string, e.g. \"1.50\""),
          memo: z.string().max(280).optional().describe("what this payment is for"),
          idempotency_key: z.string().max(128).optional().describe("same key -> same charge (safe retries)"),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      async (args: { to: string; amount: string; memo?: string; idempotency_key?: string }) =>
        run(() =>
          locked(() =>
            spend(sd, card.id, {
              kind: "pay",
              mode: "pay",
              to: args.to as Address,
              amountAtoms: usdcToAtoms(args.amount),
              memo: args.memo,
              idempotencyKey: args.idempotency_key,
            }),
          ),
        ),
    );
  }

  // ---- paid_fetch (cards with pay: the zero-x402-knowledge purchase tool) ----
  if (card.terms.pay) {
    server.registerTool(
      "paid_fetch",
      {
        title: "Fetch a paid resource",
        description:
          "Fetch a URL; if it answers 402 (x402 payment required), pay it from this card automatically and return the content. Use max_price to cap what you're willing to pay (refusal: price_exceeds_max). You need zero payment knowledge — the card handles the whole handshake.",
        inputSchema: {
          url: z.string().url().describe("the resource URL"),
          max_price: z.string().regex(/^\d+(\.\d{1,6})?$/).optional().describe("max USDC you allow for this fetch"),
        },
        annotations: { destructiveHint: true, openWorldHint: true },
      },
      async (args: { url: string; max_price?: string }) =>
        run(async () => {
          ssrfGuard(args.url);
          const first = await fetch(args.url, { redirect: "manual" });
          if (first.status !== 402) {
            return { paid: false, status: first.status, content: truncate(await first.text()) };
          }

          // parse the challenge: PAYMENT-REQUIRED header first, JSON body fallback
          let accepts: X402Requirement[] = [];
          const prHeader = first.headers.get("PAYMENT-REQUIRED") ?? first.headers.get("payment-required");
          if (prHeader) {
            accepts = (decodePaymentRequiredHeader(prHeader) as { accepts: X402Requirement[] }).accepts ?? [];
          } else {
            const body = (await first.json().catch(() => ({}))) as { accepts?: X402Requirement[] };
            accepts = body.accepts ?? [];
          }
          const req = accepts.find((r) => requirementMatchesRail(r) === null);
          if (!req) {
            throw new RefusalError(
              "invalid_terms",
              "no compatible payment option (this card pays exact/eip155:8453/USDC via erc7710)",
              { offered: accepts.map((a) => `${a.scheme}/${a.network}`).join(",") || "none" },
            );
          }
          if (args.max_price !== undefined && parseAtoms(req.amount) > usdcToAtoms(args.max_price)) {
            throw new RefusalError("price_exceeds_max", `resource costs ${atomsToUsdc(parseAtoms(req.amount))} USDC, above your max_price`, {
              price: atomsToUsdc(parseAtoms(req.amount)),
              max_price: args.max_price,
            });
          }

          // the budget check + charge reservation inside buildX402Payload must be
          // serialized with other spends of this card tree
          const { body: payload, chargeId, amountAtoms } = await locked(() => buildX402Payload(sd, card.id, req));
          const envelope = { x402Version: 2, accepted: req, payload };
          // From here the reservation is live: ANY throw before finalizeX402Charge would
          // leave the charge stuck 'pending', permanently holding budget (x402 rows are
          // invisible to the relayer reconcile sweep). A thrown retry fetch (DNS reset,
          // seller down between the 402 and the retry) must release it.
          let retry: Response;
          try {
            retry = await fetch(args.url, {
              headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(envelope as never) },
              redirect: "manual",
            });
          } catch (e) {
            finalizeX402Charge(sd.store, chargeId, "failed");
            throw new EngineError("x402", `paid retry fetch failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          if (!retry.ok) {
            finalizeX402Charge(sd.store, chargeId, "failed");
            const detail = truncate(await retry.text().catch(() => ""), 500);
            throw new EngineError("x402", `seller rejected the payment (http ${retry.status}): ${detail}`);
          }

          let tx: string | null = null;
          let feeAtoms = 0n;
          const respHeader = retry.headers.get("PAYMENT-RESPONSE") ?? retry.headers.get("payment-response");
          if (respHeader) {
            try {
              const settled = decodePaymentResponseHeader(respHeader) as {
                transaction?: string;
                extensions?: { feeAtoms?: string };
              };
              tx = settled.transaction ?? null;
              feeAtoms = settled.extensions?.feeAtoms ? BigInt(settled.extensions.feeAtoms) : 0n;
            } catch {
              // malformed receipt header: treat as no receipt (settlement_unconfirmed),
              // never leak the reservation over a decode error
            }
          }
          finalizeX402Charge(sd.store, chargeId, { txHash: (tx as `0x${string}`) ?? null, feeAtoms });

          // Honesty: a settlement is only "confirmed" if the seller echoed a tx in
          // PAYMENT-RESPONSE. A bare 200 with no receipt means the seller served the
          // content but didn't prove on-chain settlement — report it as such (the
          // server-side budget is still reserved either way).
          const status = tx ? "confirmed" : "settlement_unconfirmed";
          const state = cardState(sd.store, card.id, now());
          return {
            paid: true,
            content: truncate(await retry.text()),
            receipt: {
              status,
              tx,
              amount: atomsToUsdc(amountAtoms),
              fee: atomsToUsdc(feeAtoms),
              remaining_this_period: state?.remaining_this_period ?? null,
            },
          };
        }),
    );
  }



  // ---- execute (cards with contract scope ONLY) ----
  if (card.terms.contract) {
    server.registerTool(
      "execute",
      {
        title: "Execute scoped contract calls",
        description:
          "Run one or more contract calls allowed by this card's scope, atomically in one redemption (e.g. approve + swap). Targets and methods outside the card's scope are refused. Pass simple calls as method + args (the server encodes calldata); pass complex calls (tuple/array/multicall args, e.g. Uniswap exactInputSingle) as raw `data` (the 4-byte selector is still checked against the allowlist). ERC-20 allowance calls (approve/increaseAllowance) are extra-gated: the spender must be in the card's scope, the token must be on the card's token list (when one is set), USDC allowances respect perTradeMax (per_trade_exceeded), and every allowance is pinned on-chain to the exact spender + amount you requested. Calls execute from this card's own account (the `account` address returned by the `card` tool), which holds your USDC and receives any output tokens (e.g. a swap's WETH); when a call needs a recipient/destination (e.g. Uniswap exactInputSingle's recipient), use that `account` — you already have it, so never ask the user for an address. Calls carry no native ETH value (value is 0).",
        inputSchema: {
          calls: z
            .array(
              z.object({
                target: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
                method: z.string().optional().describe('human signature, e.g. "approve(address,uint256)". Omit when passing raw `data`.'),
                args: z
                  .array(z.union([z.string(), z.number(), z.boolean()]))
                  .optional()
                  .describe("positional args for `method`; uint256 as decimal strings. Flat scalars only; for tuple/array/bytes args use `data`."),
                data: z
                  .string()
                  .regex(/^0x([0-9a-fA-F]{2}){4,}$/)
                  .optional()
                  .describe("raw ABI-encoded calldata (whole-byte, >= 4-byte selector) for complex methods. Selector is checked against the card's allowlist. Use instead of method + args."),
              }),
            )
            .min(1)
            .max(5),
          memo: z.string().max(280).optional(),
          idempotency_key: z.string().max(128).optional(),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      async (args: { calls: Array<{ target: string; method?: string; args?: Array<string | number | boolean>; data?: string }>; memo?: string; idempotency_key?: string }) =>
        run(() =>
          locked(() => {
            const executions = args.calls.map((call) => encodeScopedCall(card.terms, call));
            return spend(sd, card.id, {
              kind: "execute",
              mode: "contract",
              workExecutions: executions,
              memo: args.memo,
              idempotencyKey: args.idempotency_key,
            });
          }),
        ),
    );
  }

  // ---- sub-cards ----
  if (card.terms.subcards !== false) {
    server.registerTool(
      "issue_subcard",
      {
        title: "Issue a sub-card",
        description:
          "Mint a narrower child card for a sub-agent. Terms must fit inside this card's (exceeds_parent_terms names the violating field); omitted money terms inherit this card's remaining budget. Returns the sub-card's connection URL.",
        inputSchema: {
          name: z.string().min(1).max(80).describe("label shown in the owner's dashboard"),
          terms: z
            .object({
              pay: z
                .object({
                  period: z.object({ amount: z.string(), seconds: z.number().int().min(60) }).optional(),
                  lifetime: z.object({ amount: z.string() }).optional(),
                })
                .optional(),
              contract: z
                .object({
                  targets: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).min(1),
                  selectors: z.array(z.string()).min(1),
                  tokens: z
                    .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/))
                    .min(1)
                    .optional()
                    .describe("ERC-20 tokens the child may grant allowances on; must be a subset of this card's list when one is set"),
                  perTradeMax: z.string().optional().describe("per-allowance USDC ceiling for the child; <= this card's"),
                })
                .optional()
                .describe("contract scope for the child; targets AND selectors must be a SUBSET of this card's"),
              expiry: z.number().int().optional(),
              maxUses: z.number().int().min(1).optional(),
              perTxMax: z.string().optional(),
              merchants: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).optional(),
              subcards: z.boolean().optional(),
              // DID-based sub-card params (for DID-authorized sub-cards)
              t3n_did: z.string().optional().describe("agent's did:t3n for DID-bound sub-cards; pass t3n_signature too"),
              t3n_signature: z.string().optional().describe("EIP-191 signature over the sub-card auth challenge; pass t3n_did too"),
            })
            .describe("child terms; every field must be <= this card's"),
        },
        annotations: { openWorldHint: false },
      },
      async (args: { name: string; terms: unknown }) => {
        const t = args.terms as Record<string, unknown>;
        const t3nDid = (t.t3n_did as string | undefined)?.trim();
        const t3nSig = (t.t3n_signature as string | undefined)?.trim();
        const t3nTs = parseInt((t.t3n_timestamp as string | undefined) ?? "0", 10) || now();

        // DID-authorized sub-card: verify the agent's EIP-191 auth challenge,
        // then issue using the parent's K_agent for on-chain delegation signing.
        if (t3nDid && t3nSig) {
          return run(async () => {
            if (!isValidT3NDID(t3nDid)) {
              throw new RefusalError("invalid_terms", "valid t3n_did required");
            }

            // Resolve the agent's DID address from the card's binding
            const agentCard = sd.store.getCardByDID(t3nDid);
            const bindingJson = agentCard?.t3n_binding_json;
            let agentAddress: Address | null = null;
            if (bindingJson) {
              try {
                const b = JSON.parse(bindingJson);
                agentAddress = b.agentAddress as Address;
              } catch {}
            }
            if (!agentAddress) {
              throw new RefusalError("invalid_terms", "could not resolve t3n_did to an address");
            }

            // Verify the agent's EIP-191 auth challenge signature
            const termsForHash = { ...(args.terms as Record<string, unknown>) };
            delete termsForHash.t3n_did;
            delete termsForHash.t3n_signature;
            delete termsForHash.t3n_timestamp;
            const childTermsHash = Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ name: args.name, terms: termsForHash })))
              )
            ).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
            const message = buildSubCardAuthMessage(card.id, args.name, childTermsHash, t3nTs);
            let recovered: Address;
            try {
              recovered = await recoverMessageAddress({ message, signature: t3nSig as Hex });
            } catch {
              throw new RefusalError("invalid_terms", "t3n_signature recovery failed");
            }
            if (recovered.toLowerCase() !== agentAddress.toLowerCase()) {
              throw new RefusalError("invalid_terms", "t3n_signature does not match agent DID key");
            }

            // Issue the sub-card: prepare + finalize (signs child delegation with
            // the parent's K_agent, stores the sub-card with its own K_agent)
            const prepared = await prepareSubCardForDID(
              { store: sd.store },
              { parentCardId: card.id, name: args.name, terms: args.terms as CardTerms, agentDid: t3nDid, agentAddress },
            );
            const issued = await finalizeSubCardForDID({ store: sd.store }, prepared);

            return { card_id: issued.cardId, card_url: cardUrl(issued.secret), terms: issued.terms };
          });
        }

        // Standard K_agent-signed sub-card
        return run(async () => {
          const issued = await issueSubCard({ store: sd.store }, {
            parentCardId: card.id,
            name: args.name,
            terms: args.terms as CardTerms,
          });

          return { card_id: issued.cardId, card_url: cardUrl(issued.secret), terms: issued.terms };
        });
      },
    );

    server.registerTool(
      "revoke_subcard",
      {
        title: "Revoke a sub-card",
        description:
          "Kill a sub-card you issued (and its descendants): the server stops honoring it instantly and its URL dies. Descendants only — not_your_subcard otherwise.",
        inputSchema: {
          card_id: z.string().describe("the sub-card's id (from issue_subcard or card)"),
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      async (args: { card_id: string }) =>
        run(async () => {
          agentRevokeSubcard(sd.store, card.id, args.card_id);
          return { status: "revoked", card_id: args.card_id };
        }),
    );
  }

  return server;
}

// ---------------------------------------------------------------------------
// execute encoding: structured call -> calldata, scope-checked for typed refusals
// (the chain enforces the same scope again via the leaf + root caveats)
// ---------------------------------------------------------------------------

function encodeScopedCall(
  terms: CardTerms,
  call: { target: string; method?: string; args?: Array<string | number | boolean>; data?: string },
): WireExecution {
  // Validate against the DECLARED scope (NOT the fee-safe one that unions in USDC +
  // transfer for the fee leg) so a card scoped to e.g. Uniswap can't call USDC.transfer.
  // Declared selectors are already canonical (validateTerms normalizes at issue time).
  const scope = declaredContractScope(terms.contract!);
  if (!scope.targets.some((t) => t.toLowerCase() === call.target.toLowerCase())) {
    throw new RefusalError("target_not_allowed", `target ${call.target} is outside the card's scope`, {
      target: call.target,
    });
  }
  if (call.data !== undefined && (call.method !== undefined || call.args !== undefined)) {
    throw new RefusalError("invalid_terms", "pass either method + args or raw data, not both");
  }
  let data: Hex;
  if (call.data !== undefined) {
    // raw calldata path (tuple/array/multicall args): enforce the method allowlist via
    // the canonical 4-byte selector. The on-chain allowedMethods enforcer checks it again.
    const selector = call.data.slice(0, 10).toLowerCase();
    const allowed = scope.selectors.some((s) => {
      try {
        return toFunctionSelector(canonicalSelector(s)).toLowerCase() === selector;
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new RefusalError("method_not_allowed", `selector ${selector} is outside the card's scope`, { selector });
    }
    data = call.data as Hex;
  } else {
    if (!call.method) {
      throw new RefusalError("invalid_terms", "each call needs either method + args or raw data");
    }
    // canonicalize the requested method so "withdraw(uint)" matches a stored "withdraw(uint256)"
    const wanted = canonicalSelector(call.method);
    const sig = scope.selectors.find((s) => s === wanted);
    if (!sig) {
      throw new RefusalError("method_not_allowed", `method ${call.method} is outside the card's scope`, {
        method: call.method,
      });
    }
    try {
      // dynamic signature string -> viem's template-literal abi type collapses; runtime is fine
      const abi = parseAbi([`function ${sig}`] as never) as import("viem").Abi;
      const functionName = sig.slice(0, sig.indexOf("("));
      data = encodeFunctionData({
        abi,
        functionName,
        args: (call.args ?? []).map(coerceAbiArg) as never,
      });
    } catch (e) {
      throw new RefusalError("invalid_terms", `could not encode ${call.method}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Contract calls carry no native ETH value: the carved leaf's FunctionCall scope
  // caps value at 0 on-chain (SDK default), so payable-with-value is a v2 item.
  return { target: call.target as Address, value: "0", data };
}

function coerceAbiArg(v: string | number | boolean): unknown {
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v); // uint as decimal string
  return v;
}

// ---------------------------------------------------------------------------
// paid_fetch helpers
// ---------------------------------------------------------------------------

function truncate(s: string, max = 50_000): string {
  return s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length - max} chars]` : s;
}

function parseIpv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return nums;
}

function ipv4IsPrivate(o: number[]): boolean {
  const a = o[0]!;
  const b = o[1]!;
  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 127 || // loopback
    a === 10 || // RFC1918
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 cloud metadata
    (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64/10
  );
}

/** Expand an IPv6 literal (no brackets) to its 8 16-bit groups, handling :: and an
 * embedded dotted-quad IPv4 tail (e.g. ::ffff:127.0.0.1). Returns null if malformed. */
function expandIpv6(input: string): number[] | null {
  let s = input.toLowerCase();
  const dot = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dot) {
    const v4 = parseIpv4(dot[1]!);
    if (!v4) return null;
    const g1 = ((v4[0]! << 8) | v4[1]!).toString(16);
    const g2 = ((v4[2]! << 8) | v4[3]!).toString(16);
    s = s.slice(0, dot.index) + g1 + ":" + g2;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  if (halves.length === 1) {
    const g = groups(s);
    return g && g.length === 8 ? g : null;
  }
  const head = groups(halves[0]!);
  const tail = groups(halves[1]!);
  if (!head || !tail) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

function ipv6IsPrivate(h: number[]): boolean {
  // ::/128 unspecified and ::1/128 loopback
  if (h.slice(0, 7).every((x) => x === 0) && (h[7] === 0 || h[7] === 1)) return true;
  if ((h[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d -> classify the embedded v4
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    return ipv4IsPrivate([h[6]! >> 8, h[6]! & 0xff, h[7]! >> 8, h[7]! & 0xff]);
  }
  return false;
}

/** True for any host that resolves to a loopback/private/link-local/ULA/metadata target.
 * The WHATWG URL parser canonicalizes numeric IPv4 forms (decimal/octal/hex) to dotted
 * decimal, so url.hostname is already normalized before we get here. */
function hostIsPrivate(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h.startsWith("[") && h.endsWith("]")) {
    const v6 = expandIpv6(h.slice(1, -1));
    return v6 ? ipv6IsPrivate(v6) : true; // unparseable bracketed literal: fail safe
  }
  const v4 = parseIpv4(h);
  if (v4) return ipv4IsPrivate(v4);
  return false; // a regular DNS name (DNS-rebinding is out of scope for this guard)
}

/** SSRF guard on agent-supplied URLs: https only (or http to allowed dev hosts),
 * no private/loopback/link-local targets unless T3SPEND_PAID_FETCH_ALLOW_LOCAL=1 (dev). */
function ssrfGuard(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RefusalError("invalid_terms", "malformed URL");
  }
  const allowLocal = process.env.T3SPEND_PAID_FETCH_ALLOW_LOCAL === "1";
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    throw new RefusalError("invalid_terms", "only https URLs are fetchable");
  }
  if (hostIsPrivate(url.hostname) && !allowLocal) {
    throw new RefusalError("invalid_terms", "private-network URLs are not fetchable");
  }
}
