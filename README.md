# T3 Spend

**Enterprise agent identity & authorization infrastructure. Govern every agent action with verifiable identity, scoped delegation, and cryptographically attested audit trails.**

---


Everything runs on Base mainnet with real USDC. The fiat leg (Stripe test-mode Issuing) is simulated and labeled honestly.

---

## The problem: enterprises cannot govern agent workforces

Every enterprise adopting AI agents faces the same wall:

- **No agent identity.** You cannot prove which agent did what. Agents authenticate as "bearer of a key," not as a verifiable entity with an identity that survives session boundaries.
- **No scoped authorization.** An agent either has full access to a wallet or no access. There is no middle ground — no per-agent budgets, no per-transaction caps, no time-bound permits.
- **No auditability.** When an agent acts, there is no cryptographically verifiable record of *which* agent authorized *which* action at *which* time, signed by that agent's unique identity.
- **No delegation chain.** An agent cannot issue narrower authority to a sub-agent and have that delegation be verifiable end to end.
- **No policy-as-code.** Authorization is all-or-nothing, not expressed as composable terms (budget per period, contract scoping, merchant allowlists, expiry, usage counts) that both the server and the blockchain enforce.

T3 Spend solves this by applying the model enterprise governance has relied on for decades — **identity, card-based authorization, and audit** — to the AI agent workforce.

```
enterprise wallet (EIP-7702 smart account)
   └── card ($25/week, expires Jul 6)
        ├── agent A authenticates over MCP
        └── sub-card ($1/week, one protocol)
             └── sub-agent B authenticates
```

Every card IS a governed identity binding: the agent's verifiable DID (`did:t3n`) is cryptographically linked to a scoped ERC-7710 delegation signed by the enterprise wallet. The agent never holds a key capable of moving funds — it holds only an authorization that can be revoked, narrowed, or attested at any time.

---

## Governance primitives

T3 Spend is built on three primitives that map directly to enterprise governance requirements:

| Primitive | Enterprise requirement | How T3 Spend delivers |
|---|---|---|
| **Verifiable agent identity** | Know which agent is acting; agent identity must survive session boundaries and be provable to third parties | Every agent authenticates with a `did:t3n` DID. The server resolves the DID, verifies EIP-191 challenge signatures, and binds the session to a specific authorization. After any action, the agent can produce a cryptographically attested receipt signed by its DID key. |
| **Scoped, revocable authorization** | Authorizations must carry terms (budget, scope, time) and be revocable independently | Each authorization IS an ERC-7710 delegation wrapped in caveats: budget-per-period, per-transaction cap, contract target/method allowlist, merchant allowlist, expiry, usage count. Revoke any authorization instantly — server-side and on-chain. |
| **Cryptographic audit trail** | Every agent action must be attributable to a specific agent identity, verifiable off-chain by a third party | After `pay`/`execute`, the agent calls `attest_charge` to sign `t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>` with its T3N key. The server returns a receipt (agent DID, agent address, charge ID, tx hash, amount, fee, TEE quote, signature) that any third party can verify. |

These primitives form the foundation for **agent workforce governance**: identity-provisioning, policy-as-code authorization, usage metering, audit, and revocation — all the controls an enterprise needs to let agents act autonomously without losing oversight.

---

## How a governed action works

1. **Provision identity.** You sign in to the dashboard (Privy embedded wallet, Google or email) and issue a card — a scoped authorization — with policy terms set by hand in the composer or drafted from plain language by the Venice-powered policy compiler. The model names only entities (tokens, protocols, merchants); addresses are resolved server-side from a verified registry.

2. **Bind policy.** The dashboard compiles the terms into on-chain caveats (delegation-framework enforcers). Your wallet signs the delegation in the browser. The server stores it alongside a fresh agent key that holds nothing — the key can sign sub-delegations but cannot move funds.

3. **Authenticate the agent.** The agent connects using its verifiable DID (`did:t3n`) over MCP, or via a card-specific credential. The server resolves the DID, verifies the agent's identity, and binds the session to the card's authorization.

4. **Act under policy.** When the agent calls `pay`, `execute`, `paid_fetch`, or `fiat_pay`, the server validates every term (budget, expiry, scope, usage count) before redeeming the delegation chain through the 1Shot Public Relayer on Base mainnet — gasless, settled in USDC from your wallet.

5. **Attest.** The agent calls `attest_charge` to produce a cryptographically signed receipt proving which agent DID authorized which on-chain transaction at what time, verifiable by any third party.

The agent never sees a private key, never holds a balance, never needs ETH. Every action is attributable to a specific agent identity, within known policy limits, with a verifiable audit trail.

---

## Governed agent capabilities (MCP tools)

The tool list a card exposes **is** its policy surface. A pay-only card never sees `execute`; a contract-only card never sees `pay`; a no-sub-cards card never sees `issue_subcard`. The policy is self-describing — the agent discovers its permitted actions at connect time.

| Tool | Scope | Governance purpose |
|---|---|---|
| `card` | all cards | Query live state: remaining budget, terms, expiry, recent charges, sub-cards, and the card's on-chain `account` |
| `pay` | pay cards | Send USDC within policy limits; blocks until confirmed on-chain |
| `paid_fetch` | pay cards | Fetch a URL; on HTTP 402 (x402), pay automatically — governed spend with no agent wallet |
| `fiat_pay` | pay + Stripe | Buy over Visa rails against the same policy budget |
| `card_credentials` | pay + Stripe | Reveal the test-mode virtual Visa for merchant checkout |
| `execute` | contract cards | Run scoped contract calls (approve + swap, stake, mint) atomically within policy scope |
| `issue_subcard` | sub-cards on | Delegate narrower authority to a sub-agent; policy must nest inside parent's |
| `revoke_subcard` | sub-cards on | Instantly revoke a sub-card and its descendants |
| `issue_card` | Lane D only | Self-issue a DID-bound card from an unbound agent session; the card's on-chain delegate is the agent's own T3N address |
| `attest_charge` | Lane D only | Produce a cryptographically attested receipt proving agent DID → on-chain action |

Refusals are typed (`over_period_limit`, `merchant_not_allowed`, `price_exceeds_max`, `target_not_allowed`, `method_not_allowed`, `per_trade_exceeded`, `exceeds_parent_terms`, `not_your_subcard`, `card_frozen`, ...) so agents can report policy violations honestly instead of guessing.

**Contract cards.** An authorization can be scoped to specific contract targets and method selectors. The agent calls `execute` with `{target, method, args}` (server ABI-encodes) or raw `{target, data}` calldata. Targets and selectors outside policy scope are refused before anything reaches the chain — and the on-chain `AllowedTargets`/`AllowedMethods` enforcers check the same scope again at redemption. A contract card can carry an allowance token list (`contract.tokens`: the only tokens it may `approve`) and a per-trade ceiling (`contract.perTradeMax`). Both narrow subset-only on sub-cards.

---

## Agent identity & authorization lanes

Four lanes, escalating in identity strength. Every lane is governed by the same policy engine — only the authentication mechanism differs.

### Lane A: credentials in the path

The simplest lane: a per-card secret embedded in the URL path. Works everywhere, including credential-free clients like claude.ai web.

```bash
claude mcp add --transport http remit https://<host>/c/<card-secret>/mcp
```

### Lane B: credentials in the header

The same credential, sent as a Bearer header to the bare endpoint.

```bash
claude mcp add --transport http remit https://<host>/mcp \
  --header "Authorization: Bearer <card-secret>"
```

Lanes A and B work in Cursor, VS Code, Gemini CLI, Windsurf, claude.ai, or any MCP client. Rotate the secret any time; the old credential dies instantly.

### Lane C: OAuth 2.1 (card-picker consent)

The agent adds the bare endpoint with no credential. The client discovers the OAuth lane (RFC 9728), registers itself (RFC 7591 Dynamic Client Registration), and opens a browser. You sign in with your dashboard login and **pick which authorization to grant**. The agent receives a short-lived, card-scoped, independently revocable access token — never the raw secret.

```bash
claude mcp add --transport http remit https://<host>/mcp
```

This is the lane OAuth-only clients such as **ChatGPT** require. Self-hosted authorization server: PKCE S256, rotating refresh tokens, RFC 7009 revocation. Revoking the card kills every token issued for it.

### Lane D: T3N DID authentication (verifiable agent identity)

The agent authenticates with its `did:t3n` identity — a **verifiable, cryptographically bound agent identity** that survives session boundaries. The agent signs an EIP-191 challenge with its T3N key, proving DID possession:

```bash
# Lane D: verifiable agent identity over MCP
claude mcp add --transport http remit https://<host>/mcp \
  --header "x-t3n-did: did:t3n:<agent-hex>" \
  --header "x-t3n-signature: <eip191-sig>" \
  --header "x-t3n-timestamp: <unix-seconds>"
```

The server resolves the DID, verifies the signature, and binds the session to the card whose `t3n_did` matches. After every action, the agent can produce a **cryptographically attested receipt** — the agent signs `t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>` with its T3N key, proving chain-of-custody. Any third party can verify the receipt off-chain.

**Issuance-only sessions:** an unbound agent (no card linked to its DID) authenticates over Lane D and receives a transient session exposing one tool: `issue_card`. The agent self-issues a DID-bound card whose on-chain delegate is its own T3N address — no server-custodied key.

---

## Attested charge receipts

After a `pay` or `execute` confirms, the agent produces a **cryptographically attested receipt** by calling `attest_charge`. The agent signs `t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>` with its T3N key; the server verifies the signature recovers to the card's bound DID and returns:

- Agent DID (`did:t3n:<hex>`)
- Agent address (EVM address of the T3N key)
- Charge ID
- On-chain transaction hash
- Amount + fee
- TEE quote (when available)
- Agent's signature over the charge

The receipt is **chain-of-custody verifiable off-chain**: a third party can independently verify that a specific agent DID authorized a specific on-chain transaction, without any additional server state. Every `pay`/`execute` receipt includes a `charge_id` field so the agent can reference it in the subsequent `attest_charge` call.

---

## Policy architecture

Three packages sharing a single policy engine:

```
packages/
  engine/     policy core: caveat compiler, issuance, spend, redelegation, revocation
  server/     Hono: MCP endpoint + REST API + x402 facilitator + Stripe webhook
  dashboard/  Next.js: Privy login, one-screen policy cockpit, NL policy compiler, demo shop
```

Key pieces:

- **Policy compiler** (`engine/src/compiler.ts`): turns human terms (`{"pay": {"period": {"amount": "25", "seconds": 604800}}}`) into delegation-framework enforcer caveats — the same policy enforced server-side and on-chain.
- **NL policy compiler** (`server/src/venice/`): Venice AI turns plain language ("$25/week for Uniswap trading, max $5 per trade") into a named-entity plan; every address is resolved server-side from a verified registry — model output can never place a raw address in a draft.
- **Identity-provisioned issuance**: the server prepares an unsigned delegation, the user's wallet signs it in the browser (prepare/finalize) — the server never holds the user's key. For Lane D, `issueCardForDID` issues a card whose on-chain delegate is the agent's own T3N address, so the agent holds its own key.
- **Policy enforcement** (`engine/src/spend.ts`): validates every term server-side, then redeems the delegation chain through the 1Shot Public Relayer (which calls `DelegationManager.redeemDelegations` on-chain), attaching the user's EIP-7702 authorization on first spend.
- **Sub-card redelegation**: ERC-7710 redelegations. Caps only narrow. Revoking a parent kills the subtree. Sub-cards bound to T3N DIDs inherit attestation and signature verification.
- **Two enforcement rails off one delegation**: x402 (real USDC, live) and Stripe Issuing real-time auth (test mode, fiat leg simulated honestly). Both metered by the same enforcer caveats.
- **OAuth authorization server** (`server/src/oauth/`): self-hosted OAuth 2.1 (RFC 9728 + 8414 + 7591 + 8707 + 7009). Login and the card-picker consent reuse the existing Privy dashboard session.

### Contracts (Base mainnet)

| Contract | Address | Chain |
|---|---|---|
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` | Both (shared) |
| Stateless7702 delegator impl | `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` | Both (shared) |
| LOGICAL_OR_WRAPPER | `0xE1302607a3251AF54c3a6e69318d6aa07F5eB46c` | Both (shared) |
| FEE_COLLECTOR | `0xE936e8FAf4A5655469182A49a505055B71C17604` | Both (shared EOA) |
| USDC | Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`<br>Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Base |
| 1Shot target | Mainnet: `0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a`<br>Sepolia: `0xf1ef956eff4181Ce913b664713515996858B9Ca9` | Base (managed by 1Shot) |

---

## Proving the governance model: the demo merchant

`/shop` (also at [shop.s0nderlabs.xyz](https://shop.s0nderlabs.xyz)) is a storefront, "s0nder supply co.," that exists to prove the governance model end to end with nothing mocked on our side of the rail:

1. An agent authenticates, requests its card credentials (`card_credentials`), and fills the checkout form.
2. The shop fires a real Stripe test-mode authorization. Stripe calls our real-time auth webhook, which answers approve/decline from the card's on-chain state within Stripe's 2-second window.
3. A decline (e.g. an item over the card's weekly budget) comes back typed — from the card's policy terms, not from the merchant.
4. With settlement enabled, the approved charge settles as a real delegated USDC transfer on Base — the same enforcers meter both rails against one policy budget.

Catalog prices are $5 or less because approved purchases move real USDC.

---

## Terminal 3 Bounty Submission (June 2026)

This project is submitted to the **Terminal 3's Bounty Challenge** — the best implementation of the T3N Agent Auth SDK, focusing on completeness, integration depth, and creative agentic solutions.

### What we built

T3 Spend is a full-stack enterprise agent governance platform: issue scoped, revocable authorization from any wallet and let any MCP agent authenticate with verifiable identity and act within policy. The **T3N Agent Auth SDK** is integrated as **Lane D** — a first-class agent identity and authentication lane alongside OAuth and bearer secrets.

| Criterion | How T3 Spend delivers |
|---|---|
| **SDK completeness** | Agents authenticate with their `did:t3n` identity via HTTP headers (`x-t3n-did`, `x-t3n-signature`, `x-t3n-timestamp`). The server resolves the DID from Terminal 3's registry and verifies EIP-191 signed challenges. Lane D works on the same `/mcp` endpoint as all other auth lanes. |
| **Issuance-only entry** | An unbound agent (no card yet linked to its DID) gets a transient virtual card exposing one tool: `issue_card`. The agent self-issues a DID-bound root card whose on-chain delegate is the agent's own T3N address — no server-custodied key. |
| **Attested charge receipts** | After any `pay` or `execute`, the agent calls `attest_charge` to cryptographically sign `t3n-attest:<chargeId>:<cardId>:<txHash>:<timestamp>` with its T3N key. The server verifies the signature recovers to the card's bound DID and returns the full receipt (agent DID, agent address, charge ID, tx hash, amount, fee, TEE quote, signature). This is chain-of-custody verifiable off-chain. |
| **Agent-to-agent delegation** | `issue_subcard` redelegates narrower terms to a sub-agent (caps only narrow); `revoke_subcard` kills a subtree. Sub-cards bound to T3N DIDs inherit the same attestation and signature verification. |
| **Real on-chain action** | Every `pay`/`execute` call validates terms server-side, then redeems the ERC-7710 delegation chain through the 1Shot Public Relayer on Base mainnet — real USDC, no keys exposed to the agent. The action surface plus a demo merchant (`/shop`) and x402 `paid_fetch` show the full governed-agent cycle. |
| **TEE attestation support** | Agents may present a TEE quote via the `x-t3n-attestation` header during authentication. The server verifies the quote using the T3N SDK's `verifyTdxQuote` and surfaces `tee_verified: true/false` alongside the quote in attested charge receipts — demonstrating hardware-backed agent identity verification alongside Terminal 3's infrastructure. |

### Key code locations

- **T3N DID auth flow (server-side):** [`server/src/mcp/t3n-auth.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/server/src/mcp/t3n-auth.ts) — validates `x-t3n-did`, `x-t3n-signature`, `x-t3n-timestamp` headers; resolves DID; verifies EIP-191 challenge signatures.
- **Issue card for T3N DID (issuance):** [`engine/src/issuance.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/engine/src/issuance.ts) — `issueCardForDID` and `finalizeSubCardForDID` bind cards to agent DIDs without server-custodied keys.
- **Attested charge receipts:** [`server/src/mcp/routes.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/server/src/mcp/routes.ts) — `attest_charge` handler that verifies agent signatures and returns full receipts.
- **Virtual card for issuance-only sessions:** [`server/src/mcp/server.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/server/src/mcp/server.ts) — transient virtual cards that expose `issue_card` to unbound agents.
- **Delegation chain + real on-chain action:** [`engine/src/spend.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/engine/src/spend.ts) — validates terms and redeems through the 1Shot relayer.
- **Sub-card redelegation:** [`engine/src/delegations.ts`](https://github.com/s0nderlabs/remit/blob/main/packages/engine/src/delegations.ts) — `buildChildDelegation` narrows caps for agent-to-agent delegation.

Everything in this README is reproducible end to end. T3 Spend is an enterprise agent governance platform: issue verifiable identity, enforce policy as code, and audit every action with cryptographic receipts.

---

## Running it

Requires [bun](https://bun.sh). Runs on Base Sepolia by default (CHAIN_ID 84532).

```bash
bun install
cp .env.example .env                       # then fill in required vars:
# T3SPEND_MASTER_KEY=<64 hex chars>         encrypts agent keys + card secrets at rest
# T3SPEND_ADMIN_TOKEN=<random token>        protects the management API
# VENICE_API_KEY=<key>                      enables NL policy drafting (optional)
# T3N_ENABLED=1                            enables T3N DID auth lane (optional)

bun dev                                    # server on :4070
bun run --cwd packages/dashboard dev       # dashboard on :4071
```

Issue a card from the dashboard (Privy login), or via the admin API:

```bash
curl -X POST localhost:4070/api/cards \
  -H "Authorization: Bearer $T3SPEND_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"my agent card","terms":{"pay":{"period":{"amount":"5","seconds":604800}}}}'
# -> { "card_id": ..., "card_url": "http://localhost:4070/c/<secret>/mcp" }
```

Plug the `card_url` into an agent and it can act within policy.

### Tests

```bash
bun test                 # engine + server suites
bun run typecheck        # per-package tsc
```

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `T3SPEND_MASTER_KEY` | yes | 32-byte hex key; encrypts agent keys and card secrets at rest |
| `T3SPEND_ADMIN_TOKEN` | yes | ops bearer token for the management API (`/api/*`): full access, server-side scripts only, never shipped to a browser |
| `T3SPEND_PRIVY_APP_ID` | dashboard lane | enables per-user API auth: Privy access tokens verified offline against the app's JWKS; every route scoped to the authenticated user |
| `PORT` | no | server port (default 4070) |
| `T3SPEND_DB_PATH` | no | SQLite path (default `.dev/t3spend.sqlite`) |
| `T3SPEND_RPC_URL` | no | Base RPC (default `https://mainnet.base.org`) |
| `T3SPEND_PUBLIC_MCP_BASE` | prod | public origin used when rendering card URLs (unset = localhost; also arms the MCP Host allowlist) |
| `T3SPEND_ALLOWED_HOSTS` | no | extra Host headers accepted on the MCP endpoint (comma-separated; e.g. a platform fallback domain) |
| `T3SPEND_CORS_ORIGINS` | no | comma-separated allowed origins for the API |
| `T3SPEND_DEV_USER_PK` | no | dev-only server-custodied user key (server-signed issuance lane) |
| `T3SPEND_FACILITATOR_BASE` | no | x402 facilitator base URL (defaults to self) |
| `T3SPEND_SELLER_PAYTO` | no | payout address for the built-in demo seller |
| `T3SPEND_PAID_FETCH_ALLOW_LOCAL` | no | allow `paid_fetch` to hit local/private hosts (dev only) |
| `T3SPEND_STRIPE_WEBHOOK_SECRET` | no | Stripe real-time auth webhook signing secret (test mode); unset = the fiat leg answers 503 (disabled) |
| `STRIPE_SECRET_KEY` | no | Stripe TEST-mode secret key (`sk_test_`/`rk_test_` only; anything else is refused); enables `fiat_pay`, `card_credentials`, and the demo shop |
| `T3SPEND_FIAT_SETTLEMENT` | no | `1` = approved Visa charges settle on-chain as real delegated USDC transfers (see `T3SPEND_SETTLEMENT_ADDRESS`, `T3SPEND_FIAT_FEE_HEADROOM`, `T3SPEND_FIAT_SETTLE_INTERVAL_MS`) |
| `T3SPEND_SETTLEMENT_ADDRESS` | settlement | recipient of the fiat settlement transfers (validated at boot; default = the fee collector) |
| `VENICE_API_KEY` | no | enables `POST /cards/compile` (plain-language policy drafting); unset = the compile endpoint refuses (disabled) |
| `VENICE_MODEL` | with key | Venice model id for the NL policy compiler; pin it (the fallback default is unvalidated) |
| `VENICE_BASE_URL` | no | Venice API base override (defaults to the public Venice endpoint) |
| `T3N_ENABLED` | no | `1` = enable T3N DID auth lane (Lane D); unset = T3N disabled |
| `T3N_ENVIRONMENT` | with key | T3N network: `testnet` (default) or `production` |
| `T3N_API_KEY` | no | T3N developer private key from the claim page; used for T3nClient authentication |
| `DID_KEY` | no | Tenant DID (`did:t3n:...`) from the authenticated T3N session |
| `BASESCAN_API_KEY` | no | enables verified-contract labels from Basescan when resolving compiled drafts |
| `T3SPEND_DASHBOARD_BASE` | OAuth lane | dashboard origin that hosts the OAuth consent (card-picker) page (default `http://localhost:4071`) |
| `T3SPEND_RECONCILE_INTERVAL_MS` | no | stuck-pending-charge reconcile sweep interval (default 300000; 0 disables) |
| `T3SPEND_MCP_RATE_LIMIT` / `T3SPEND_MCP_BAD_SECRET_LIMIT` | no | per-card and per-IP-bad-secret request ceilings per minute (defaults 240 / 30) |
| `T3SPEND_OAUTH_ACCESS_TTL` / `T3SPEND_OAUTH_REFRESH_TTL` | no | OAuth access / refresh token lifetimes in seconds (defaults 3600 / 2592000) |
| `T3SPEND_OAUTH_REDIRECT_HOSTS` | no | if set, restricts OAuth `https` redirect-URI hosts to this allowlist (loopback + custom schemes always allowed; recommended in prod) |
| `T3SPEND_OAUTH_ACCEPTED_RESOURCES` | no | extra RFC 8707 resource URIs still honored (legacy values during a base-URL migration) |
| `T3SPEND_TRUST_PROXY_HOPS` | no | trusted proxy hops for client-IP rate limiting (default 1 = Railway edge; 0 disables XFF trust) |
| `NEXT_PUBLIC_PRIVY_APP_ID` / `NEXT_PUBLIC_PRIVY_CLIENT_ID` | dashboard | Privy app credentials (public identifiers, not secrets) |
| `NEXT_PUBLIC_T3SPEND_API` | dashboard | server API base, e.g. `http://localhost:4070/api` |
| `NEXT_PUBLIC_BASE_RPC` | dashboard | Base RPC for client-side reads |

The dashboard carries **no shared secret**: every API call sends the signed-in user's Privy session token, which the server verifies and scopes. The deployed dashboard origin must be listed in the server's `T3SPEND_CORS_ORIGINS`.

### T3N SDK initialization

The T3N SDK (`@terminal3/t3n-sdk`) is initialized at server boot when `T3N_ENABLED=1`. It loads the WASM crypto component and exposes key derivation (`eth_get_address`) and TEE quote verification (`verifyTdxQuote`). The SDK is configured for the `testnet` environment by default. The SDK is NOT required for Lane D auth — signature verification uses `viem.recoverMessageAddress` against locally stored DID bindings. See the 21-test T3N integration suite at `packages/server/test/t3n.test.ts`.

