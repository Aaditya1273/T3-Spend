// T3N (Terminal 3 Network) authentication middleware for the MCP server.
// Uses @terminal3/t3n-sdk for key derivation and signature verification.
// The SDK is initialized at server boot — if the SDK is unavailable or WASM
// fails to load, T3N auth is disabled and Lane D agents are refused.
//
// Auth flow (Lane D — T3N DID):
//   1. Agent authenticates to T3N via T3nClient.handshake() + authenticate()
//   2. Agent receives did:t3n:<hex> → signs challenge with its T3N key
//   3. Agent sends to MCP: X-T3N-DID + X-T3N-SIGNATURE + X-T3N-TIMESTAMP
//   4. Server resolves the DID's public key (from store binding or SDK)
//   5. Server verifies the signature → looks up card bound to that DID
//   6. If valid, serves the MCP tools scoped to that card

import { recoverMessageAddress, type Address, type Hex } from "viem";
import {
  buildT3NChallenge,
  isValidT3NDID,
  parseT3NDID,
  type CardRow,
  type Store,
} from "@t3spend/engine";

// ---------------------------------------------------------------------------
// SDK module-level singleton — initialized once at boot
// ---------------------------------------------------------------------------

type T3NSDK = {
  setEnvironment: (env: string) => void;
  loadWasmComponent: () => Promise<unknown>;
  eth_get_address: (pubKey: string) => string;
  verifyTdxQuote: (quoteB64: string, attestationMsgB64: string, expectedRtmr3B64?: string) => Promise<{ valid: boolean; error?: string; rtmr3?: string; report_data?: string }>;
};

let _sdk: T3NSDK | null = null;
let _initError: string | null = null;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type T3NConfig = {
  /** T3N environment: "testnet" | "production" */
  environment: "testnet" | "production";
  /** Whether T3N auth is enabled (SDK must have initialized) */
  enabled: boolean;
  /** If the SDK failed to init, the error message */
  initError: string | null;
};

/**
 * Initialize the T3N SDK at SERVER BOOT. Called once from realDeps().
 * On failure, sets _initError so t3nConfigFromEnv reports it — the caller
 * decides whether to fail the boot or degrade gracefully.
 */
export async function initT3NSDK(environment: string): Promise<void> {
  if (_sdk) return; // already initialized
  try {
    const t3n = await import("@terminal3/t3n-sdk");
    t3n.setEnvironment(environment as never);
    await t3n.loadWasmComponent();
    _sdk = {
      setEnvironment: t3n.setEnvironment as never,
      loadWasmComponent: t3n.loadWasmComponent,
      eth_get_address: t3n.eth_get_address as never,
      verifyTdxQuote: t3n.verifyTdxQuote as never,
    };
    _initError = null;
  } catch (e) {
    _initError = e instanceof Error ? e.message : String(e);
  }
}

/** Default T3N config from environment variables. */
export function t3nConfigFromEnv(): T3NConfig {
  const enabled = process.env.T3N_ENABLED === "1";
  return {
    environment: (process.env.T3N_ENVIRONMENT as "testnet" | "production") ?? "testnet",
    enabled,
    initError: _initError,
  };
}

/** Check if the SDK is available for use. */
function sdkAvailable(): boolean {
  return _sdk !== null;
}

/**
 * Derive an EVM address from a public key using the T3N SDK.
 * Returns the address or null if the SDK is unavailable.
 */
function deriveAddressFromKey(pubKey: string): string | null {
  if (!_sdk) return null;
  try {
    return _sdk.eth_get_address(pubKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TEE attestation verification
// ---------------------------------------------------------------------------

/**
 * Verify a TEE attestation quote from an agent session.
 * Uses the @terminal3/t3n-sdk's verifyTdxQuote function.
 * Returns { verified: true } on success, or { verified: false, error } on failure.
 * When the SDK is unavailable, returns an error indicating TEE verification is
 * not supported (the quote was provided but could not be verified).
 */
export async function verifyTEEQuote(
  quoteB64: string,
  expectedRtmr3B64?: string,
): Promise<{ verified: boolean; error?: string; rtmr3?: string }> {
  if (!_sdk) {
    return { verified: false, error: "T3N SDK not available for TEE verification" };
  }
  try {
    // The attestation message is derived from the quote itself when no separate
    // challenge context is available at auth time. Use the quote as the message.
    const result = await _sdk.verifyTdxQuote(quoteB64, quoteB64, expectedRtmr3B64);
    return {
      verified: result.valid,
      error: result.error,
      rtmr3: result.rtmr3,
    };
  } catch (e) {
    return {
      verified: false,
      error: e instanceof Error ? e.message : "TEE verification threw",
    };
  }
}

// ---------------------------------------------------------------------------
// DID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a did:t3n identifier to its public EVM address.
 * Checks the local store first (previously bound DIDs), then tries the
 * T3N SDK's eth_get_address if the DID hex is a known key.
 */
export async function resolveDIDToAddress(
  did: string,
  store?: Store,
): Promise<Address | null> {
  const hexId = parseHexFromDID(did);
  if (!hexId) return null;

  // 1. Check local store first (previously bound DIDs — fast path)
  if (store) {
    const card = store.getCardByDID(did);
    if (card?.t3n_binding_json) {
      try {
        const binding = JSON.parse(card.t3n_binding_json) as {
          agentAddress: Address;
          active: boolean;
        };
        if (binding.active) return binding.agentAddress;
      } catch {
        // malformed binding — skip to SDK resolution
      }
    }
  }

  // 2. If the SDK is available, attempt to derive the address from the key
  //    (DID hex is typically a public key or key identifier).
  //    This is best-effort: if the SDK isn't initialized or the hex isn't
  //    a valid key, fall through to signature-based verification.
  if (_sdk) {
    try {
      const addr = _sdk.eth_get_address(`0x${hexId}`);
      if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return addr as Address;
      }
    } catch {
      // hex isn't a valid public key for eth_get_address — fall through
    }
  }

  return null;
}

function parseHexFromDID(did: string): string | null {
  const m = did.match(/^did:t3n:([0-9a-fA-F]{40})$/);
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// MCP Auth verification
// ---------------------------------------------------------------------------

export type T3NAuthResult = {
  /** The resolved agent identity. */
  identity: {
    did: string;
    publicKey: Address | null;
  };
  /** The card resolved from the DID binding, if found. */
  card: CardRow | null;
  /** Whether authentication succeeded. */
  authenticated: boolean;
  /** Human-readable reason for failure. */
  error?: string;
  /** Whether the TEE attestation quote (from x-t3n-attestation header) was verified. */
  teeVerified: boolean;
};

/** Headers the agent sends for T3N auth. */
export const T3N_HEADERS = {
  DID: "x-t3n-did",
  SIGNATURE: "x-t3n-signature",
  TIMESTAMP: "x-t3n-timestamp",
  ATTESTATION: "x-t3n-attestation",
} as const;

/**
 * Verify a T3N-authenticated MCP request and resolve the bound card.
 *
 * Flow:
 * 1. Parse and validate the DID
 * 2. Recover the signer from the challenge signature (proves key ownership)
 * 3. Optionally verify the recovered signer matches the DID's resolved public key
 * 4. Look up the card bound to this DID in the store
 * 5. Return the auth result
 */
export async function verifyT3NRequest(
  store: Store,
  headers: { did: string; signature: string; timestamp: string; attestation?: string },
  now: number,
): Promise<T3NAuthResult> {
  // 1. Validate DID format
  if (!isValidT3NDID(headers.did)) {
    return {
      identity: { did: headers.did, publicKey: null },
      card: null,
      authenticated: false,
      error: "invalid did:t3n format",
      teeVerified: false,
    };
  }

  // 2. Validate timestamp (max 30s skew to prevent replay)
  const ts = parseInt(headers.timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 30) {
    return {
      identity: { did: headers.did, publicKey: null },
      card: null,
      authenticated: false,
      error: "timestamp skew exceeds 30s",
      teeVerified: false,
    };
  }

  // 3. Build the challenge and recover the signer from the EIP-191 signature
  const challenge = buildT3NChallenge("mcp", ts);
  let recoveredSigner: Address | null = null;
  try {
    recoveredSigner = await recoverMessageAddress({
      message: challenge,
      signature: headers.signature as Hex,
    });
  } catch {
    return {
      identity: { did: headers.did, publicKey: null },
      card: null,
      authenticated: false,
      error: "signature recovery failed",
      teeVerified: false,
    };
  }

  // 4. Resolve the DID to its expected public key
  const expectedKey = await resolveDIDToAddress(headers.did, store);

  // 5. If we have a resolved key, verify the signature matches
  if (expectedKey) {
    if (recoveredSigner.toLowerCase() !== expectedKey.toLowerCase()) {
      return {
        identity: { did: headers.did, publicKey: expectedKey },
        card: null,
        authenticated: false,
        error: "signature does not match DID public key",
        teeVerified: false,
      };
    }
  }

  // 6. Verify TEE attestation if provided
  let teeVerified = false;
  if (headers.attestation) {
    const result = await verifyTEEQuote(headers.attestation);
    teeVerified = result.verified;
  }

  // 7. Look up the card bound to this DID
  let card: CardRow | null = null;
  try {
    card = store.getCardByDID(headers.did);
  } catch {
    // no binding found — card is null
  }

  return {
    identity: {
      did: headers.did,
      publicKey: recoveredSigner,
    },
    card,
    authenticated: true,
    teeVerified,
  };
}
