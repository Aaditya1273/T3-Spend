// T3N (Terminal 3 Network) identity integration module.
// Pure types + verification logic — no @terminal3/t3n-sdk dependency in the engine.
// The SDK lives only in the server package; this module provides the data model
// and cryptographic verification primitives that both engine and server share.
//
// Integration pattern:
//   Agent authenticates to T3N via T3nClient.handshake() + authenticate() →
//   receives did:t3n:<hex> → signs a challenge (cardId + timestamp) with its key →
//   presents DID + signature to remit MCP → server verifies via DID resolution →
//   resolves the bound card → serves the MCP tools.
//
// DID format: did:t3n:<40-hex-chars> (random hex, not derived from key material).
// The DID Document (resolved via T3N) contains the agent's public verification key.

import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// T3N Identity types
// ---------------------------------------------------------------------------

/** A resolved T3N agent identity after authentication. */
export type T3NIdentity = {
  /** The agent's full DID string, e.g. did:t3n:a1b2c3d4e5f6... */
  did: string;
  /** The public key resolved from the DID Document (EVM address). */
  publicKey: Address;
  /** Whether the TEE attestation was verified for this session. */
  attested: boolean;
  /** Unix timestamp when this identity was verified. */
  verifiedAt: number;
};

/** TEE remote attestation payload from the agent. */
export type T3NAttestation = {
  /** Base64-encoded TEE quote (SGX/TDX). */
  quote: string;
  /** Enclave measurement hash (MRENCLAVE). */
  enclave: string;
  /** Unix timestamp of attestation generation. */
  timestamp: number;
};

/** A DID→card binding record stored alongside the card. */
export type T3NBinding = {
  /** The agent's did:t3n identifier. */
  agentDid: string;
  /** The agent's resolved EVM address from the DID Document. */
  agentAddress: Address;
  /** Unix timestamp when the binding was created. */
  boundAt: number;
  /** The user's DID that authorized the binding (agent-auth-update grant). */
  authorizedByDID?: string | null;
  /** Whether the binding is active (revocable independently). */
  active: boolean;
};

// ---------------------------------------------------------------------------
// DID parsing
// ---------------------------------------------------------------------------

const T3N_DID_PATTERN = /^did:t3n:([0-9a-fA-F]{40})$/;

/** Parse a did:t3n string and return the hex identifier, or null if invalid. */
export function parseT3NDID(did: string): string | null {
  const m = did.match(T3N_DID_PATTERN);
  return m?.[1] ?? null;
}

/** Validate that a string is a well-formed did:t3n identifier. */
export function isValidT3NDID(did: string): boolean {
  return T3N_DID_PATTERN.test(did);
}

// ---------------------------------------------------------------------------
// Challenge-response verification
// ---------------------------------------------------------------------------

/** Build the challenge message an agent must sign to prove DID possession.
 * Follows EIP-191 personal_sign format for broad wallet compatibility. */
export function buildT3NChallenge(cardId: string, timestamp: number): string {
  return `t3spend:t3n-auth:${cardId}:${timestamp}`;
}

// Signature verification is performed server-side using viem's recoverMessageAddress.
// This module provides only the message format; the server handles the crypto.

// ---------------------------------------------------------------------------
// DID→card binding (pure data helpers)
// ---------------------------------------------------------------------------

/** Create a binding record for an agent DID and a card. */
export function createBinding(
  agentDid: string,
  agentAddress: Address,
  authorizedByDID?: string | null,
): T3NBinding {
  return {
    agentDid,
    agentAddress,
    boundAt: Math.floor(Date.now() / 1000),
    authorizedByDID,
    active: true,
  };
}

/** Serialize a T3N binding for JSON storage. */
export function serializeBinding(b: T3NBinding): string {
  return JSON.stringify(b);
}

/** Deserialize a T3N binding from JSON. */
export function deserializeBinding(json: string): T3NBinding {
  return JSON.parse(json) as T3NBinding;
}

// ---------------------------------------------------------------------------
// TEE-attested charge receipts
// ---------------------------------------------------------------------------

/** A cryptographically attested charge receipt proving which agent DID authorized
 * a transaction. The attestation is an EIP-191 personal_sign message signed by
 * the agent's T3N key after the spend confirms on-chain. */
export type AttestedReceipt = {
  /** The agent's did:t3n that authorized this spend. */
  agent_did: string;
  /** The agent's resolved EVM address (the signer). */
  agent_address: Address;
  /** The charge ID this attestation proves. */
  charge_id: string;
  /** The card ID that was charged. */
  card_id: string;
  /** The on-chain transaction hash. */
  tx_hash: Hex | null;
  /** USDC amount charged (decimal string). */
  amount: string;
  /** Fee in USDC (decimal string). */
  fee: string;
  /** Unix timestamp of attestation creation. */
  attested_at: number;
  /** TEE attestation quote from the agent's session (when available). */
  tee_quote?: string | null;
  /** Whether the TEE attestation quote was cryptographically verified. */
  tee_verified: boolean;
};

/** Build the EIP-191 message the agent signs to attest a charge.
 * The message format is: t3spend:t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>
 * so it's unique per charge, non-replayable, and chain-of-custody verifiable. */
export function buildAttestationMessage(
  chargeId: string,
  cardId: string,
  txHash: string | null,
  timestamp: number,
): string {
  return `t3spend:t3n-attest:${chargeId}:${cardId}:${txHash ?? "null"}:${timestamp}`;
}

/** Build an attested receipt payload (before signing). The agent signs
 * `buildAttestationMessage(...)` with its T3N key, and the result (signature)
 * is added as the cryptographic proof. */
export function buildAttestedReceipt(
  agentDid: string,
  agentAddress: Address,
  chargeId: string,
  cardId: string,
  txHash: Hex | null,
  amount: string,
  fee: string,
  teeQuote?: string | null,
  teeVerified?: boolean,
): AttestedReceipt {
  return {
    agent_did: agentDid,
    agent_address: agentAddress,
    charge_id: chargeId,
    card_id: cardId,
    tx_hash: txHash,
    amount,
    fee,
    attested_at: Math.floor(Date.now() / 1000),
    tee_quote: teeQuote ?? null,
    tee_verified: teeVerified ?? false,
  };
}

/** Build the sub-card authorization challenge message.
 * The agent signs this to prove it authorizes the parent to create a sub-card
 * on its behalf. Format: t3spend:t3n-subauth:<parentCardId>:<childName>:<timestamp> */
export function buildSubCardAuthMessage(
  parentCardId: string,
  childName: string,
  childTermsHash: string,
  timestamp: number,
): string {
  return `t3spend:t3n-subauth:${parentCardId}:${childName}:${childTermsHash}:${timestamp}`;
}
