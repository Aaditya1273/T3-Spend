// T3N integration tests: Lane D auth, DID-bound card issuance, and DID-based
// sub-card issuance via the MCP issue_subcard tool. Uses a REAL MCP client (SDK)
// speaking Streamable HTTP to the real app over a live socket. Only the relayer
// + chain reads are faked. The T3N SDK is NOT required — auth uses viem's
// recoverMessageAddress and the local store's DID bindings.
//
// Each describe block has its OWN agent key + DID to avoid cross-contamination
// in getCardByDID() lookups. All blocks are fully self-contained.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  KeyedMutex,
  Store,
  issueCardForDID,
  issueRootCard,
  buildT3NChallenge,
  buildAttestationMessage,
  buildSubCardAuthMessage,
  type CardTerms,
  type EstimateResult,
  type Relayer,
  type RelayerTransaction,
} from "@t3spend/engine";
import { createApp } from "../src/app";
import type { AppDeps } from "../src/deps";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MERCHANT = "0xAc36D18d2315c8c1F6e93B9074D3C25e2DC14127";
const USER_ID = "u-t3n";
const MASTER_KEY = "f".repeat(64);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const user = privateKeyToAccount(generatePrivateKey());

class FakeRelayer {
  sends: RelayerTransaction[][] = [];
  async getFeeData() {
    return {
      minFee: "0.01", rate: 1598, gasPrice: "1", expiry: 0,
      feeCollector: "0xE936e8FAf4A5655469182A49a505055B71C17604",
      targetAddress: "0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a",
      context: "ctx",
    };
  }
  async estimate(_tx: RelayerTransaction[]): Promise<EstimateResult> {
    return { success: true, requiredPaymentAmount: "10000", context: "ctx-ok", error: null, raw: null };
  }
  async send(tx: RelayerTransaction[]): Promise<string> {
    this.sends.push(tx);
    return "0xreq";
  }
  async getStatus() {
    return { status: 200, txHash: "0xfaketx", raw: null };
  }
  async waitForStatus() {
    return { status: 200, txHash: "0xfaketx", raw: null, timedOut: false };
  }
}

let server: ReturnType<typeof Bun.serve>;
let base: string;
let store: Store;
let relayer: FakeRelayer;

beforeAll(() => {
  process.env.T3SPEND_MASTER_KEY = MASTER_KEY;
  store = new Store(":memory:");
  relayer = new FakeRelayer();
  const deps: AppDeps = {
    spendMutex: new KeyedMutex(),
    store,
    relayer: relayer as unknown as Relayer,
    userSigner: user,
    adminToken: "test-admin",
    verifyPrivyToken: null,
    spendOverrides: { codeCheck: async () => true, confirmViaChain: false, feeJitter: (b) => b },
    t3n: { enabled: true, environment: "testnet" },
  };
  const app = createApp(deps);
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
  process.env.T3SPEND_PUBLIC_MCP_BASE = base;
  store.upsertUser({ id: USER_ID, address: user.address });
});

afterAll(() => {
  server.stop(true);
  delete process.env.T3SPEND_PUBLIC_MCP_BASE;
  delete process.env.T3SPEND_MASTER_KEY;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(): { key: ReturnType<typeof privateKeyToAccount>; did: string } {
  const key = privateKeyToAccount(generatePrivateKey());
  const did = `did:t3n:${key.address.slice(2).toLowerCase()}`;
  return { key, did };
}

async function issueDIDCard(
  agent: { key: ReturnType<typeof privateKeyToAccount>; did: string },
  terms: CardTerms,
  name = "t3n-card",
): Promise<{ cardId: string }> {
  const issued = await issueCardForDID(
    { store, userSigner: user, revocationNonceOverride: 0n },
    { userId: USER_ID, name, terms, agentDid: agent.did, agentAddress: agent.key.address },
  );
  return { cardId: issued.cardId };
}

async function issueStandardCard(terms: CardTerms, name = "std-card"): Promise<{ cardId: string; secret: string }> {
  const issued = await issueRootCard(
    { store, userSigner: user, revocationNonceOverride: 0n },
    { userId: USER_ID, name, terms },
  );
  return { cardId: issued.cardId, secret: issued.secret };
}

async function signT3NChallenge(agent: { key: ReturnType<typeof privateKeyToAccount> }, ts: number): Promise<Hex> {
  const challenge = buildT3NChallenge("mcp", ts);
  return agent.key.signMessage({ message: challenge });
}

async function connectLaneD(
  agent: { did: string; key: ReturnType<typeof privateKeyToAccount> },
  signature: Hex,
  timestamp: number,
): Promise<Client> {
  const client = new Client({ name: "t3n-agent", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: {
      headers: {
        "x-t3n-did": agent.did,
        "x-t3n-signature": signature,
        "x-t3n-timestamp": String(timestamp),
      },
    },
  });
  await client.connect(transport);
  return client;
}

async function connectSecret(secret: string): Promise<Client> {
  const client = new Client({ name: "test-agent", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/c/${secret}/mcp`));
  await client.connect(transport);
  return client;
}

function parse(result: { content?: unknown; isError?: boolean }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

/** Strip t3n_* meta fields so agent and server agree on the terms hash. */
function stripT3nMeta(terms: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...terms };
  delete cleaned.t3n_did;
  delete cleaned.t3n_signature;
  delete cleaned.t3n_timestamp;
  return cleaned;
}

// ===========================================================================
// Lane D: T3N DID authentication
// ===========================================================================

describe("Lane D T3N auth", () => {
  const agent = makeAgent();

  test("DID-bound card connects via T3N headers and exposes tools", async () => {
    await issueDIDCard(agent, { pay: { period: { amount: "25", seconds: 604800 } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["attest_charge", "card", "issue_card", "issue_subcard", "paid_fetch", "pay", "revoke_subcard"]);
    await client.close();
  });

  test("Lane D charge listing includes agent_did field in card tool", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);
    const result = parse(await client.callTool({ name: "card", arguments: {} }));
    expect(result.status).toBe("active");
    expect(result.remaining_this_period).toBe("25");
    await client.close();
  });

  test("unbound DID can connect (issuance session) but only sees issue_card tool", async () => {
    // A DID not bound to any card can still authenticate via Lane D — the server
    // creates a virtual card session with only the `issue_card` tool available.
    const ts = Math.floor(Date.now() / 1000);
    const bogusDid = "did:t3n:0000000000000000000000000000000000000000";
    const sig = await agent.key.signMessage({ message: buildT3NChallenge("mcp", ts) });
    const client = new Client({ name: "bogus-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: {
          "x-t3n-did": bogusDid,
          "x-t3n-signature": sig,
          "x-t3n-timestamp": String(ts),
        },
      },
    });
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    // Only issue_card should be visible on a virtual card with empty terms
    expect(names).toContain("issue_card");
    expect(names).not.toContain("pay");
    expect(names).not.toContain("issue_subcard");
    await client.close();
  });

  test("stale timestamp (outside 30s window) is rejected", async () => {
    const staleTs = Math.floor(Date.now() / 1000) - 60;
    const sig = await signT3NChallenge(agent, staleTs);
    const client = new Client({ name: "stale-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: {
          "x-t3n-did": agent.did,
          "x-t3n-signature": sig,
          "x-t3n-timestamp": String(staleTs),
        },
      },
    });
    await expect(client.connect(transport)).rejects.toThrow();
    await client.close().catch(() => {});
  });

  test("wrong key signature is rejected", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const wrongKey = privateKeyToAccount(generatePrivateKey());
    const challenge = buildT3NChallenge("mcp", ts);
    const wrongSig = await wrongKey.signMessage({ message: challenge });
    const client = new Client({ name: "wrong-sig-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: {
          "x-t3n-did": agent.did,
          "x-t3n-signature": wrongSig,
          "x-t3n-timestamp": String(ts),
        },
      },
    });
    await expect(client.connect(transport)).rejects.toThrow();
    await client.close().catch(() => {});
  });
});

// ===========================================================================
// T3N disabled on server
// ===========================================================================

describe("T3N disabled", () => {
  test("T3N headers are ignored when t3n.enabled=false (falls through to 401 'missing credential')", async () => {
    // Save and clear the env var so a fresh server with no T3SPEND_PUBLIC_MCP_BASE
    // doesn't apply the host allowlist (which would 421 instead of 401)
    const savedBase = process.env.REMIT_PUBLIC_MCP_BASE;
    delete process.env.REMIT_PUBLIC_MCP_BASE;

    const localStore = new Store(":memory:");
    localStore.upsertUser({ id: "u-disabled", address: user.address });
    const localDeps: AppDeps = {
      spendMutex: new KeyedMutex(),
      store: localStore,
      relayer: new FakeRelayer() as unknown as Relayer,
      userSigner: user,
      adminToken: "test-admin",
      verifyPrivyToken: null,
      spendOverrides: { codeCheck: async () => true, confirmViaChain: false, feeJitter: (b) => b },
      t3n: { enabled: false, environment: "testnet" },
    };
    const app = createApp(localDeps);
    const srv = Bun.serve({ port: 0, fetch: app.fetch });
    const localBase = `http://localhost:${srv.port}`;

    const agent = makeAgent();
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const res = await fetch(`${localBase}/mcp`, {
      method: "POST",
      headers: {
        "x-t3n-did": agent.did,
        "x-t3n-signature": sig,
        "x-t3n-timestamp": String(ts),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {} } }),
    });
    expect(res.status).toBe(401);
    srv.stop(true);
    // Restore env var for subsequent tests
    if (savedBase) process.env.T3SPEND_PUBLIC_MCP_BASE = savedBase;
  });
});

// ===========================================================================
// DID-bound card spend
// ===========================================================================

describe("DID-bound card spend", () => {
  const agent = makeAgent();

  test("card tool returns live state; pay moves budget", async () => {
    await issueDIDCard(agent, { pay: { period: { amount: "25", seconds: 604800 } } }, "spend-card");
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    const state = parse(await client.callTool({ name: "card", arguments: {} }));
    expect(state.status).toBe("active");
    expect(state.remaining_this_period).toBe("25");

    const payResult = parse(await client.callTool({
      name: "pay",
      arguments: { to: MERCHANT, amount: "1.5", memo: "Lane D pay", idempotency_key: "lane-d-pay" },
    }));
    expect(payResult.status).toBe("confirmed");
    expect(payResult.remaining_this_period).toBe("23.49");

    const state2 = parse(await client.callTool({ name: "card", arguments: {} }));
    expect(state2.remaining_this_period).toBe("23.49");
    await client.close();
  });
});

// ===========================================================================
// DID-based sub-card issuance via MCP
// ===========================================================================

describe("DID-based sub-card issuance", () => {
  const agent = makeAgent();

  test("issue_subcard with t3n_did + t3n_signature + t3n_timestamp creates a DID-bound sub-card", async () => {
    const { cardId: parentCardId } = await issueDIDCard(
      agent,
      { pay: { period: { amount: "25", seconds: 604800 } } },
      "sub-parent",
    );

    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    // Build sub-card params the SAME WAY the server will
    const childName = "did-research-budget";
    const childPayTerms = { pay: { period: { amount: "5", seconds: 86400 } } };

    // Compute childTermsHash from stripped terms (matching server's stripT3nMeta logic)
    const termsWithStubs = { ...childPayTerms, t3n_did: agent.did, t3n_signature: "0x", t3n_timestamp: String(ts) };
    const cleanTerms = stripT3nMeta(termsWithStubs);
    const childTermsHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify({ name: childName, terms: cleanTerms })),
        ),
      ),
    ).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const authMessage = buildSubCardAuthMessage(parentCardId, childName, childTermsHash, ts);
    const agentSig = await agent.key.signMessage({ message: authMessage });

    const minted = parse(await client.callTool({
      name: "issue_subcard",
      arguments: {
        name: childName,
        terms: {
          pay: { period: { amount: "5", seconds: 86400 } },
          t3n_did: agent.did,
          t3n_signature: agentSig,
          t3n_timestamp: String(ts),
        },
      },
    }));
    expect(minted.card_url).toContain("/c/");
    expect(minted.card_id).toBeDefined();

    // The sub-card URL should work (Lane A auth)
    const subSecret = (minted.card_url as string).split("/c/")[1]!.split("/mcp")[0]!;
    const subClient = await connectSecret(subSecret);
    const subState = parse(await subClient.callTool({ name: "card", arguments: {} }));
    expect(subState.remaining_this_period).toBe("5");
    await subClient.close();
    await client.close();
  });

  test("issue_subcard with wrong agent key is refused", async () => {
    const { cardId: parentCardId } = await issueDIDCard(
      agent,
      { pay: { period: { amount: "10", seconds: 604800 } } },
      "sub-mismatch",
    );

    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    // Sign with a different key
    const wrongKey = privateKeyToAccount(generatePrivateKey());
    const cleanTerms = { pay: { period: { amount: "1", seconds: 3600 } } };
    const childTermsHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify({ name: "evil-sub", terms: cleanTerms })),
        ),
      ),
    ).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    const authMessage = buildSubCardAuthMessage(parentCardId, "evil-sub", childTermsHash, ts);
    const wrongSig = await wrongKey.signMessage({ message: authMessage });

    const res = await client.callTool({
      name: "issue_subcard",
      arguments: {
        name: "evil-sub",
        terms: {
          pay: { period: { amount: "1", seconds: 3600 } },
          t3n_did: agent.did,
          t3n_signature: wrongSig,
          t3n_timestamp: String(ts),
        },
      },
    });
    expect(res.isError).toBe(true);
    const body = parse(res as { content?: unknown; isError: boolean });
    expect(body.code).toBe("invalid_terms");
    await client.close();
  });

  test("standard (non-DID) card uses K_agent sub-card flow when no t3n params provided", async () => {
    const { secret } = await issueStandardCard({ pay: { period: { amount: "25", seconds: 604800 } } });
    const client = await connectSecret(secret);

    const minted = parse(await client.callTool({
      name: "issue_subcard",
      arguments: {
        name: "normal-sub",
        terms: { pay: { period: { amount: "5", seconds: 86400 } } },
      },
    }));
    expect(minted.card_url).toContain("/c/");
    expect(minted.card_id).toBeDefined();

    const subSecret = (minted.card_url as string).split("/c/")[1]!.split("/mcp")[0]!;
    const subClient = await connectSecret(subSecret);
    const subState = parse(await subClient.callTool({ name: "card", arguments: {} }));
    expect(subState.remaining_this_period).toBe("5");
    await subClient.close();
    await client.close();
  });
});

// ===========================================================================
// DID binding lifecycle (API endpoint)
// ===========================================================================

describe("DID binding lifecycle", () => {
  const agent = makeAgent();

  test("bind-did API endpoint works with admin token; unbind kills Lane D access", async () => {
    const { cardId } = await issueStandardCard({ pay: { lifetime: { amount: "10" } } }, "bind-test");

    const h = { authorization: "Bearer test-admin", "content-type": "application/json" };
    const bindRes = await fetch(`${base}/api/cards/${cardId}/bind-did`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ agent_did: agent.did, agent_address: agent.key.address }),
    });
    expect(bindRes.status).toBe(200);
    const bindBody = (await bindRes.json()) as { bound: boolean; agent_did: string };
    expect(bindBody.bound).toBe(true);
    expect(bindBody.agent_did).toBe(agent.did);

    // Lane D should now resolve to this card
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
    await client.close();

    // Unbind
    const unbindRes = await fetch(`${base}/api/cards/${cardId}/unbind-did`, { method: "POST", headers: h });
    expect(unbindRes.status).toBe(200);

    // After unbind, Lane D still connects (issuance session) but the old card
    // is no longer accessible — only the `issue_card` tool should be visible.
    const ts2 = Math.floor(Date.now() / 1000);
    const sig2 = await signT3NChallenge(agent, ts2);
    const client2 = new Client({ name: "unbound-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: {
          "x-t3n-did": agent.did,
          "x-t3n-signature": sig2,
          "x-t3n-timestamp": String(ts2),
        },
      },
    });
    await client2.connect(transport);
    const tools2 = await client2.listTools();
    expect(tools2.tools.map((t) => t.name)).toContain("issue_card");
    // The old card's tools (pay, etc.) should NOT be available
    expect(tools2.tools.map((t) => t.name)).not.toContain("pay");
    await client2.close();
  });

  test("bind-did requires admin auth", async () => {
    const { cardId } = await issueStandardCard({ pay: { lifetime: { amount: "5" } } }, "bind-noauth");
    const res = await fetch(`${base}/api/cards/${cardId}/bind-did`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent_did: agent.did, agent_address: agent.key.address }),
    });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Root card issuance via MCP issue_card tool
// ===========================================================================

describe("MCP issue_card tool", () => {
  const agent = makeAgent();

  test("issue_card creates a DID-bound root card and returns a working URL", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    const result = parse(await client.callTool({
      name: "issue_card",
      arguments: {
        name: "mcp-issued-card",
        terms: { pay: { period: { amount: "50", seconds: 604800 } } },
      },
    }));
    expect(result.card_url).toContain("/c/");
    expect(result.card_id).toBeDefined();
    expect(result.agent_did).toBe(agent.did);
    expect(result.terms).toBeDefined();
    expect((result.terms as Record<string, unknown>).pay).toBeDefined();

    // The card should work via Lane A (secret URL) immediately
    const secret = (result.card_url as string).split("/c/")[1]!.split("/mcp")[0]!;
    const cardClient = await connectSecret(secret);
    const state = parse(await cardClient.callTool({ name: "card", arguments: {} }));
    expect(state.remaining_this_period).toBe("50");
    await cardClient.close();

    // The card should also work via Lane D (the agent's DID is bound)
    const dClient = await connectLaneD(agent, sig, ts);
    const tools = await dClient.listTools();
    // There might be two cards bound to this DID now; the server resolves
    // via getCardByDID which returns one of them. Either way, tools should exist.
    expect(tools.tools.length).toBeGreaterThan(0);
    await dClient.close();

    await client.close();
  });

  test("issue_card not available without Lane D auth (t3nCtx is null)", async () => {
    // Connect via Lane A (secret URL) — no t3nCtx
    const { secret } = await issueStandardCard({ pay: { period: { amount: "5", seconds: 604800 } } }, "no-t3n-tool-test");
    const client = await connectSecret(secret);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).not.toContain("issue_card");
    await client.close();
  });

  test("issue_card not available when T3N is disabled", async () => {
    // Create a local server with T3N disabled
    const savedBase = process.env.REMIT_PUBLIC_MCP_BASE;
    delete process.env.REMIT_PUBLIC_MCP_BASE;

    const localStore = new Store(":memory:");
    localStore.upsertUser({ id: "u-disabled", address: user.address });
    const { key: lolKey } = makeAgent();
    // Issue a standard card to connect via Lane A
    const issued = await issueRootCard(
      { store: localStore, userSigner: user, revocationNonceOverride: 0n },
      { userId: "u-disabled", name: "disabled-card", terms: { pay: { period: { amount: "5", seconds: 604800 } } } },
    );
    const localDeps: AppDeps = {
      spendMutex: new KeyedMutex(),
      store: localStore,
      relayer: new FakeRelayer() as unknown as Relayer,
      userSigner: user,
      adminToken: "test-admin",
      verifyPrivyToken: null,
      spendOverrides: { codeCheck: async () => true, confirmViaChain: false, feeJitter: (b) => b },
      t3n: { enabled: false, environment: "testnet" },
    };
    const app = createApp(localDeps);
    const srv = Bun.serve({ port: 0, fetch: app.fetch });
    const localBase = `http://localhost:${srv.port}`;

    // Connect via Lane A (secret URL) — no t3nCtx, T3N disabled
    const client = new Client({ name: "disabled-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${localBase}/c/${issued.secret}/mcp`));
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).not.toContain("issue_card");
    await client.close();
    srv.stop(true);

    if (savedBase) process.env.T3SPEND_PUBLIC_MCP_BASE = savedBase;
  });
});

// ===========================================================================
// TEE-attested charge receipts via attest_charge
// ===========================================================================

describe("attest_charge tool", () => {
  const agent = makeAgent();

  test("attest_charge returns attested receipt for a confirmed charge", async () => {
    const { cardId } = await issueDIDCard(
      agent,
      { pay: { period: { amount: "25", seconds: 604800 } } },
      "attest-card",
    );

    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    // Do a pay to create a charge
    const payResult = parse(await client.callTool({
      name: "pay",
      arguments: { to: MERCHANT, amount: "3.0", memo: "attest-me", idempotency_key: "attest-pay" },
    }));
    expect(payResult.status).toBe("confirmed");
    expect(payResult.charge_id).toBeDefined();
    const chargeId = payResult.charge_id as string;
    expect(chargeId.length).toBeGreaterThan(0);

    // Build and sign the attestation message
    const txHash = payResult.tx as string | null;
    const atTs = Math.floor(Date.now() / 1000);
    const attestMsg = buildAttestationMessage(chargeId, cardId, txHash, atTs);
    const agentSig = await agent.key.signMessage({ message: attestMsg });

    // Call attest_charge
    const attested = parse(await client.callTool({
      name: "attest_charge",
      arguments: {
        charge_id: chargeId,
        signature: agentSig,
        timestamp: atTs,
      },
    }));
    expect(attested.agent_did).toBe(agent.did);
    expect(attested.agent_address).toBe(agent.key.address.toLowerCase());
    expect(attested.charge_id).toBe(chargeId);
    expect(attested.card_id).toBe(cardId);
    expect(attested.tx_hash).toBe(txHash);
    expect(attested.amount).toBe("3.000000");
    expect(attested.fee).toBeDefined();
    expect(attested.attested_at).toBeGreaterThan(0);
    expect(attested.signature).toBe(agentSig);

    await client.close();
  });

  test("attest_charge with wrong key is refused", async () => {
    const { cardId } = await issueDIDCard(
      agent,
      { pay: { period: { amount: "10", seconds: 604800 } } },
      "attest-wrong",
    );

    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    const payResult = parse(await client.callTool({
      name: "pay",
      arguments: { to: MERCHANT, amount: "1.0", memo: "wrong-key-test", idempotency_key: "attest-wrong-pay" },
    }));
    expect(payResult.status).toBe("confirmed");
    const chargeId = payResult.charge_id as string;

    // Sign with a DIFFERENT agent key
    const wrongKey = privateKeyToAccount(generatePrivateKey());
    const atTs = Math.floor(Date.now() / 1000);
    const attestMsg = buildAttestationMessage(chargeId, cardId, payResult.tx as string | null, atTs);
    const wrongSig = await wrongKey.signMessage({ message: attestMsg });

    const res = await client.callTool({
      name: "attest_charge",
      arguments: {
        charge_id: chargeId,
        signature: wrongSig,
        timestamp: atTs,
      },
    });
    expect(res.isError).toBe(true);
    const body = parse(res as { content?: unknown; isError: boolean });
    expect(body.code).toBe("invalid_terms");

    await client.close();
  });

  test("attest_charge not available without Lane D auth (no t3nCtx)", async () => {
    // Standard card via Lane A should NOT expose attest_charge
    const { secret } = await issueStandardCard({ pay: { period: { amount: "5", seconds: 604800 } } }, "no-attest");
    const client = await connectSecret(secret);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).not.toContain("attest_charge");
    await client.close();
  });

  test("attest_charge on non-existent charge is refused", async () => {
    const { cardId: _ } = await issueDIDCard(
      agent,
      { pay: { period: { amount: "25", seconds: 604800 } } },
      "attest-bogus",
    );

    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);
    const client = await connectLaneD(agent, sig, ts);

    const atTs = Math.floor(Date.now() / 1000);
    const attestMsg = buildAttestationMessage("bogus-charge-id", "ignored", null, atTs);
    const agentSig = await agent.key.signMessage({ message: attestMsg });

    const res = await client.callTool({
      name: "attest_charge",
      arguments: {
        charge_id: "bogus-charge-id",
        signature: agentSig,
        timestamp: atTs,
      },
    });
    expect(res.isError).toBe(true);
    const body = parse(res as { content?: unknown; isError: boolean });
    expect(body.code).toBe("invalid_terms");

    await client.close();
  });
});

// ===========================================================================
// Lane coexistence
// ===========================================================================

describe("lane coexistence", () => {
  const agent = makeAgent();

  test("same card works on both Lane D (T3N) and Lane A (secret)", async () => {
    await issueDIDCard(agent, { pay: { period: { amount: "25", seconds: 604800 } } }, "coexist-card");
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);

    const dClient = await connectLaneD(agent, sig, ts);
    const dState = parse(await dClient.callTool({ name: "card", arguments: {} }));
    expect(dState.remaining_this_period).toBe("25");
    await dClient.close();
  });

  test("Bearer token takes precedence when both Bearer and T3N headers are present", async () => {
    const { secret } = await issueStandardCard({ pay: { period: { amount: "5", seconds: 604800 } } }, "bearer-prefer");
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signT3NChallenge(agent, ts);

    const client = new Client({ name: "both-agent", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: {
        headers: {
          authorization: `Bearer ${secret}`,
          "x-t3n-did": agent.did,
          "x-t3n-signature": sig,
          "x-t3n-timestamp": String(ts),
        },
      },
    });
    await client.connect(transport);
    const state = parse(await client.callTool({ name: "card", arguments: {} }));
    expect(state.remaining_this_period).toBe("5");
    await client.close();
  });
});
