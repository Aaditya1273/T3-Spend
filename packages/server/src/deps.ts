// Server dependency wiring. ONE process serves MCP + dashboard API + (P3) facilitator
// + seller + webhooks, routed by hostname. Engine objects are singletons here;
// tests build their own AppDeps with fakes.

import { privateKeyToAccount } from "viem/accounts";
import { isAddress } from "viem";
import type { Hex } from "viem";
import { KeyedMutex, Relayer, Store, type DelegationSigner, type FinalizeOpsDeps, type SpendDeps } from "@t3spend/engine";
import { makePrivyVerifier, type PrivyVerifier } from "./api/privy";
import { initT3NSDK, t3nConfigFromEnv, type T3NConfig } from "./mcp/t3n-auth";

import { veniceChat, type ChatFn } from "./venice/client";

export type AppDeps = {
  store: Store;
  relayer: Relayer;
  /** dev-mode server-side signer for A_user (local key); P4 adds the pre-signed Privy path */
  userSigner: DelegationSigner | null;
  /** ops bearer token (server-side curl/scripts lane; full access) */
  adminToken: string | null;
  /** Privy session verifier (per-user dashboard lane); null = lane disabled */
  verifyPrivyToken: PrivyVerifier | null;
  /** serializes spends per card tree (root id) so concurrent spends can't double-approve a budget */
  spendMutex: KeyedMutex;
  spendOverrides?: Partial<SpendDeps>;
  /** test seams for the client-signed admin ops (codeCheck/confirmViaChain/nonce) */
  opsOverrides?: Partial<FinalizeOpsDeps>;
  /** Venice NL->CardTerms compiler brain; null/absent = /cards/compile disabled (no VENICE_API_KEY) */
  veniceChat?: ChatFn | null;
  /** Basescan API key for verified-contract labels in compiled drafts (optional) */
  basescanKey?: string | null;
  /** T3N client configuration for verifying agent DID sessions */
  t3n?: T3NConfig | null;
};

/** Numeric env with a default that survives the empty string. `Number(x ?? d)` is a trap:
 * `.env.example` ships optional vars as `KEY=` and Bun loads them as "", which `??`
 * passes through and Number("") coerces to 0 — silently zeroing rate limits and
 * intervals. Empty/missing/non-numeric all fall back to the default. */
export function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

export async function realDeps(): Promise<AppDeps> {
  const store = new Store(); // T3SPEND_DB_PATH or :memory:
  const relayer = new Relayer();
  const pk = process.env.T3SPEND_DEV_USER_PK as Hex | undefined;
  const privyAppId = process.env.T3SPEND_PRIVY_APP_ID;

  // Initialize the T3N SDK at boot if enabled
  if (process.env.T3N_ENABLED === "1") {
    try {
      const env = (process.env.T3N_ENVIRONMENT as string) ?? "testnet";
      await initT3NSDK(env);
    } catch (e) {
      console.warn("[t3n] SDK init failed (non-fatal):", String(e));
    }
    const t3nConfig = t3nConfigFromEnv();
    if (t3nConfig.initError) {
      console.warn("[t3n] SDK initialization warning — Lane D may not work:", t3nConfig.initError);
    }
  }

  const deps: AppDeps = {
    store,
    relayer,
    userSigner: pk ? privateKeyToAccount(pk) : null,
    adminToken: process.env.T3SPEND_ADMIN_TOKEN ?? null,
    verifyPrivyToken: privyAppId ? makePrivyVerifier(privyAppId) : null,
    spendMutex: new KeyedMutex(),
    veniceChat: process.env.VENICE_API_KEY ? veniceChat() : null,
    basescanKey: process.env.BASESCAN_API_KEY ?? null,
    t3n: t3nConfigFromEnv(),
  };
  return deps;
}

/** The card-tree key a spend serializes on: the root ancestor (whole subtree shares budget). */
export function spendKey(store: Store, cardId: string): string {
  const chain = store.ancestorChain(cardId);
  return chain.length ? chain[chain.length - 1]!.id : cardId;
}

export function spendDeps(deps: AppDeps): SpendDeps {
  return { store: deps.store, relayer: deps.relayer, ...deps.spendOverrides };
}
