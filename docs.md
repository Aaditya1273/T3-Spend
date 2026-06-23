Terminal 3 Overview
About
Terminal 3 is a data freedom company.
We want to empower a more equitable digital future, where users and enterprises have equal rights and protections across all platforms. Our technology makes fully private data freely composable, securing the world’s most important asset while realizing its full value.
Terminal 3 powers identity and trust infrastructure across enterprises, governments, and Web3 platforms worldwide.
​
Common Use Cases
Identity verification for humans and agents
Verifiable identity management — for humans and AI agents alike — without the data risks, facilitating universal ID, cryptographic credentials, and private data storage.
Reusable KYC
Interoperable KYC/AML credentials accepted across institutions, jurisdictions, and borders. Verify once, and share the proof, not the underlying data.
AI Agent Governance
Hardware-attested mandates for AI agents, so every agentic action is bounded, logged, and provable for increased security and privacy.
National Digital ID
Verifiable national ID credentials that can be accepted at borders, airline check-ins, and public service access points withoutc physical document checks.


erminal 3 Overview
Platform Overview
The Terminal 3 (T3) trust infrastructure platform is a comprehensive solution for developers and enterprises managing users and agents at scale, with privacy at its core.
​
T3 Network (T3N)
At the foundation, the T3 Network (T3N) is a confidential compute network for all your most important data. Store, process, and compute on sensitive data inside hardware-secured Trusted Execution Environments (TEEs). Receive verified results and power secure agentic actions without raw data ever leaving the secure enclave.
Built on top of T3N are Terminal 3’s products that provide verifiable identity, privacy, and security for both humans and AI agents:
T3 Identity 
T3 Verify 
T3 Agent Developer Kit (ADK)
T3 Agent Command (coming soon)
​
Human Identity and Privacy
T3 Identity and T3 Verify are enterprise-grade products that let you onboard users, manage access, and engage verified audiences — without storing, handling, or exposing personal data.
Portable identity across platforms: One interoperable Decentralized ID (DID) that follows your users across products, partners, and jurisdictions. No re-onboarding, no data copies between systems.
Store and process customer data without holding PII: Store user profiles, credentials, and preferences securely and privately. Every process executes against encrypted data inside a TEE so applications receive answers, never raw records.
Anchor and validate Smart Verifiable Credentials (VCs): Issue portable claims once, verify everywhere. Anchor credentials in T3N’s on-chain Issuer and Revocation Registries. Every credential presentation is validated against live registry state, so no credential reaches a platform without confirmation the issuer is trusted and the credential is unrevoked.
​
AI Agent Security and Governance
Discover, govern, and audit every AI agent across your organization. Runtime policy enforcement, sensitive data processed in hardware enclaves, and tamper-proof audit trails ready for any regulator.
Runtime policy enforcement: Define exactly what agents can access and do. Policies are evaluated at request time — not just at provisioning — so scope creep is blocked in flight.
Tamper-proof audit trail: Every agent action is cryptographically signed and logged to an immutable Merkle-backed ledger. Export ready for any regulator, any time.
Give every agent a verifiable identity, scoped authorization, and hardware-secured payment execution. Drop in beside your existing agent with no architecture changes required.
Assign every agent a cryptographically verifiable DID. Portable across systems, provenance-linked to the authorizing human operator.
Sensitive data (e.g. payment credentials) stays in T3N, resolved inside a TEE, and never enter agent memory, context, or prompt history.



omponents
Decentralized ID (DID)
Decentralized Identities and their methods

Terminal 3 provides universal identities for both humans and AI agents based on W3C’s Decentralized Identifiers (DID) global standard specs.
​
What is a Decentralized Identifier (DID)?
DIDs are identifiers that enable verifiable, decentralized digital identities. A DID refers to any subject (e.g. a person, group, organization, abstract entity, etc.) as determined by the controller of the DID.
Specifically, DIDs are URIs (unique digital addresses) that associate a DID subject with a DID document allowing trustable interactions associated with that subject. Similar to a URL, when you resolve a DID, you receive a DID document in JSON, JSON-LD, or similar format.
​
A simple DID example
A DID is a simple unique text string consisting of three parts:
the did URI scheme identifier;
the identifier for the DID method; and
the DID method-specific identifier.
DID-method specifier identifier
The example DID above resolves to a DID document.
​
Multiple DIDs
A subject may have as many DIDs as they want for different use cases, such as:
a DID for educational certificates; or
a DID for verified identity / KYC documents; or
a DID for online gaming accounts.
​
What is a DID Document?
A DID document contains information associated with the DID, such as ways to cryptographically authenticate a DID controller.
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ]
  "id": "did:example:123456789abcdefghi",
  "authentication": [{
    "id": "did:example:123456789abcdefghi#keys-1",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:example:123456789abcdefghi",
    "publicKeyMultibase": "zH3C2AVvLMv6gmMNam3uVAjZpfkcJCwDwnZn6z3wXmqPV"
  }]
}
​
DID Methods
A DID method (and its spec) defines the precise operations by which DIDs and DID documents are created, resolved, updated, and deactivated.
There are currently more than 150 DID methods out there, which can be categorized into 4 main types based on their storage method:
Centralized: relies on a Web2 server
Blockchain-based: the “original” DID method involving a blockchain
Hybrid: uses decentralized storage to store its documents
Static: no data registry is required; can be created and resolved by encoding/decoding data directly.
Terminal 3 currently provides a custom did:t3n DID.
Centralized	Blockchain-based	Hybrid	Static
Privacy	low	high	high	medium
Self-Sovereign?	no	yes	yes	yes
Data Registry Required?	yes	yes	yes	no
(web2 server)	yes			
(Blockchain)		yes	yes	
(L2 storage)			yes	
Decentralized?	no	yes	yes	yes
Complexity	simple	complex	medium	simple
Transaction Fee Required?	no	yes	yes	no
(when updating)			yes	
Mutable?	yes	no	no	no
Supported Operations	create
read
update
delete	create
read
update
delete	create
read
update
delete	create
read
Example	did:web	did:ethr
did:btcr
did:dock	did:3
did:ion
did:elem	did:key
did:pkh
​
DID System Architecture
​
Generic DID Architecture
Generic DID architecture



Components
Smart VCs
Verifiable Credentials

Credentials are a regular part of our lives. For example, university degrees, passports, and certifications are all examples of credentials that assert some claim about us.
Based on W3C’s Verifiable Credentials Data Model specs, Terminal 3 provides a set of REST APIs and SDKs for the issuance and verification of digital credentials that are cryptographically secure, privacy-preserving, and machine-verifiable.
​
Claims
A claim is a statement about a subject. A subject is a thing (typically a person) about which claims can be made.
Basic structure of a claim:
Property

Subject

value

A claim expressing that Terry is an alumni of “OC University”:
alumniOf

Terry

OC University

Multiple claims can be combined to express a graph of information:







alumniOf

knows

jobTitle

Terry

OC University

Gary

Professor

​
Verifiable Credentials (VC)
A credential is a set of one or more claims made by an issuer. A verifiable credential (VC) is a tamper-evident credential and metadata that cryptographically proves who issued it.
“Verifiable” means a credential can be verified by a verifier. It only implies that an issuer signed the VC; it does not imply the truthfulness of claims.
A VC typically includes credential metadata, claim(s), and proof(s).
Specifically, a VC is a hash presentation in either JSON or JSON-LD format. Here is an example of a VC in JSON-LD:
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1"
  ],
  "id": "https://app.terminal3.io/credentials/58473",
  "type": ["VerifiableCredential", "UniversityDegreeCredential"],
  "issuer": "did:key:terminal3",
  "issuanceDate": "2023-01-01T00:00:00Z",
  "credentialSubject": {
		"id": "did:ethr:0xebfeb1f712ebc6f1c276e12ec21",
	    "degree": {
	      "type": "BachelorDegree",
	      "name": "Bachelor of Science and Arts"
	    }
	},
  "proof": { ... }
}
Notes:
DIDs are used to represent credential subjects
Proofs establishing that the issuer generated the credential are required for a VC/VP to be verifiable
To maximize data privacy and security, VCs are typically stored off-chain
​
Verifiable Presentations (VP)
A VP expresses data derived from one or more VCs, issued by one or more issuers, that is shared with a specific verifier. It is a tamper-evident presentation encoded in such a way that authorship of the data is cryptographically verifiable.
VPs consist of presentation metadata, VC(s), and proof(s).
We also leverage zero-knowledge (ZK) proofs to enable selective disclosure in VPs.
A verifiable presentation example
​
Triangle of Trust
There are three primary roles — known as the Triangle of Trust — that make up a VC ecosystem: issuers, holders, and verifiers.







use identifiers and schemas

Verifiable Data Registry

issue VCs

present VP

Issuer

Holder

Verifier

​
Issuer
Asserts claims about one or more subjects, and creates VCs from these claims
Examples: enterprises, organizations, and governments
​
Holder (Subject)
The entity (typically a user) about whom a claim is issued
Acquires and possesses one or more VCs, and consents to when, and with whom, they are shared
May bundle VCs to generate VPs
Holders may either self-custody VCs themselves, or store VCs in Terminal 3’s decentralized storage
Examples: consumers and end users
​
Verifier
Receives one or more VCs, usually inside a VP, for processing and verification
Checks that VCs were issued by a legitimate issuer
This is done via on-chain DID Resolution; the signature and signing keys in the VC must match the issuer
This implies that the Issuer and Verifier do not need to have a direct relationship with each other
Checks that VCs have not been tampered with, expired, nor been revoked
Examples: banks, employers, and applications
​
Verifiable Data Registry
A system that mediates the creation and verification of identifiers, keys, and other relevant data, such as VC schemas, revocation registries, issuer public keys, etc. which might be required to use VCs.
Example: blockchains and distributed ledgers.
​
VC Lifecycle
The lifecycle of a VC (and VP) can be simplified into the following journey:
1
Register Issuer DIDs

Issuers publish their public keys in an on-chain DID Registry, managed by Terminal 3.
A DID is used to hold the Issuer’s public key
2
An Issuer creates and signs a VC

Create a VC and digitally sign it with their private cryptographic key
3
The Issuer transfers the VC to Terminal 3 for storage

Encrypt the VC - Store the encrypted VC in an off-chain Credential Repository, managed by Terminal 3
4
The Verifier verifies the credential from the Holder

Request the VC from Holder - Extract DID from the VC - Extract the Issuer’s public key
Use the Issuer’s public key to verify:
1. The Issuer has the authority to issue the VC, via the DID Registry
2. The VC is still valid (not expired nor revoked, via the Revocation Registry)
​
Can VCs be revoked or deleted?
Issuers can revoke a VC, by posting to an on-chain Revocation Registry via our SDK
Holders can delete a VC
Was this page helpful?


Yes











What is T3 Agent Developer Kit (ADK)?
An SDK suite that allows developers to build safe and secure AI agents

​
Overview
T3 Agent Developer Kit (ADK) is a client SDK that allows developers to build agent tenant applications on the T3 Network (T3N). It lets developers onboard an agent tenant identity, manage tenant-scoped data and TEE contracts, and execute TEE contracts inside T3N.
The current SDK only supports TypeScript / JavaScript. Support for more languages is coming soon.
​
Key Capabilities
Capability	What it does
Authenticated session	One call signs in with your Ethereum wallet and opens an encrypted channel to the TEE node.
Tenant onboarding (client.tenant)	claim() registers your DID as a tenant; me() returns your record.
Tenant data (client.maps)	Create, update, delete key-value maps under your private z:<tid>:… prefix, with per-map read/write access rules.
Tenant contracts (client.contracts)	publish a Rust→WASM contract, then execute it. enable / disable / unregister manage its lifecycle.
Cross-tenant calls	executeBusinessContract() invokes any tenant’s published contract by (tenant, contract, function).
Hardware-enforced isolation	Every read and write is checked against your tenant prefix inside T3N — no ACL to misconfigure.



Overview
Why T3 ADK?
Give AI agents real-world capabilities without compromising user privacy, security and compliance

T3 Agent Developer Kit (ADK) helps developers build AI agents that can securely identify themselves, access user-authorized data, and perform real-world actions on behalf of users—without exposing sensitive information to the model, application, or agent runtime.
With the ADK, developers can:
Build faster using pre-built infrastructure for identity, confidential computing, secure data access, and agent governance.
Protect user privacy by design by keeping sensitive data out of prompts, context windows, and application servers.
Reduce compliance burden with architecture designed to support privacy and regulatory requirements such as GDPR.
Enable trusted agent actions including transactions, approvals, and interactions with external services using verifiable permissions and auditability.
Connect to a network of users and agents through portable identities and verifiable credentials that work across applications and ecosystems.



Request Test Tokens
Claim your account, key, and test tokens in one step.

Eager to start building on our ADK? You will need test tokens to use in your contracts and for interactions with the T3 Network.
1
Submit a test token claim request

Head over to the claim page and sign in with your work email.
claim-page-image
Coming from an event or a campaign? Enter your campaign code to receive additional tokens (the amount depends on the campaign).
2
Copy and store your developer key

Once you submit the form, your developer key appears immediately. This is the key the SDK uses to authenticate as you — save it somewhere safe.
During the test phase, the key is shown only once and can’t be retrieved after you leave the page. Copy it before you navigate away.
api-success-image
Your unique T3N ID (did:t3n) and test tokens are generated and linked to this key automatically.
3
Start building

That’s it — you’re ready to build. Let’s set up your development environment, then follow the walkthrough.
If you encounter any issues during this process, please refer to Common errors or do not hesitate to drop us an email at devrel@terminal3.io.Set Up Development Environment
Quick 4 steps to set up your development environment

1
Get your API key and DID

If you haven’t already, get your DID, download your API key, and request test tokens from the claim page.
2
Install Rust + WASM toolchain

TEE contracts are compiled to WebAssembly (WASM) binaries. We suggest using the Rust toolchain to build them:
rustup target add wasm32-wasip2          # WASI Preview 2 build target
cargo install wasm-tools                 # optional — inspect/verify the component
3
Install the SDK

npm install @terminal3/t3n-sdk
Node >=18 is required
4
Set up the SDK

Set up a T3nClient from @terminal3/t3n-sdk — it handles the encrypted session, SIWE auth, and the low-level execute transport. You build it once here and reuse it through the rest of the walkthrough.
import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  getNodeUrl,
} from "@terminal3/t3n-sdk";

setEnvironment("testnet");   // "testnet" | "production" — the SDK resolves the node URL for every client

const T3N_API_KEY = process.env.T3N_API_KEY!;   // your developer key from the claim page

const wasmComponent = await loadWasmComponent();   // all crypto runs inside the WASM component
const address = eth_get_address(T3N_API_KEY);

const t3n = new T3nClient({
  wasmComponent,   // no baseUrl — resolved from the active environment
  // EthSign is the only handler you provide — it signs the login challenge with
  // your key. The client adds the MlKemPublicKey and Random handlers itself.
  handlers: {
    EthSign: metamask_sign(address, undefined, T3N_API_KEY),
  },
});
5
Authenticate to T3N testnet

This step is different from agent authentication. Here you authenticate to manage your own deployment, so the DID you authenticate as must equal the DID that was admitted as a tenant in idx:_tenants. The golden rule: read your tenant DID back from the authenticated session — never hard-code or derive it.
Your tenant DID is an opaque, random did:t3n:<40 hex>, minted when you first signed in (Step 1). It is not derived from your wallet or any key material — your sign-in credential (and any key you later link) is just an authenticator on that DID. Authenticate, then read your DID straight off the session:
await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value; // did:t3n:<your-random-hex> — your onboarding DID
Build the TenantClient around that DID — never construct it yourself:
const tenant = new TenantClient({
  t3n,
  baseUrl: getNodeUrl(),   // the active node from setEnvironment(); Call `setEnvironment("testnet")` (or `"production"`) — the SDK resolves the cluster URL for every client, so you never hardcode a node URL.
  tenantDid,
});





Walkthrough
1. Write your TEE contract
You may follow the sample flight booking project to get started quickly — change the host calls and flight-specific logic to match your needs. Below is a walkthrough of the relevant pieces, matching that repo.
A TEE contract is a Rust crate compiled to a WASM component. It exports its functions through a contracts WIT interface and imports only the host capabilities it needs.
Key concepts and tips before starting:
Storage namespace
Host API
Create Tenant KV maps
Capabilities come from your WIT imports
​
Repository Structure
z-tenant-flight/
├── src/
│   ├── lib.rs          ← wit-bindgen entry point + Guest impl that dispatches to each fn
│   ├── search.rs       ← search-offers — Duffel search (no PII)
│   └── booking.rs      ← book-offer — Duffel booking (PII via http-with-placeholders)
├── wit/
│   ├── world.wit       ← the world your contract exports + the host interfaces it imports
│   └── deps/           ← vendored host interface packages (host-interfaces, host-tenant)
└── Cargo.toml
The packages under wit/deps/ define the host ABI your contract links against — vendor the versions your target cluster provides (here, host-interfaces-2.1.0/ and host-tenant-1.0.0/).
​
Files
​
world.wit — declare your interface + host imports
package z:tenant-flight@0.4.0;

world tenant-flight {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http@2.1.0;                    // search (no PII)
  import host:interfaces/http-with-placeholders@2.1.0;  // booking (PII via placeholders)

  export contracts;
}

interface contracts {
  // Uniform 3-field envelope used by every node-callable contract.
  //   input        — JSON arguments for this function, as bytes
  //   user-profile — None for tenant contracts (profile is resolved host-side)
  //   context      — node-minted DynamicContext (trusted), as bytes
  record generic-input {
    input:        option<list<u8>>,
    user-profile: option<list<u8>>,
    context:      option<list<u8>>,
  }

  // One func per operation. Each takes generic-input and returns JSON bytes on
  // success, or an error string. There is no central `dispatch` function and no
  // `ContractError` enum — the function name *is* the export.
  search-offers: func(req: generic-input) -> result<list<u8>, string>;
  book-offer:    func(req: generic-input) -> result<list<u8>, string>;
}
The interfaces you import here are your contract’s entire capability set — there is no separate manifest. The host links your contract against the matching tenant world and refuses to load it if it imports an interface that world does not provide.
​
Cargo.toml — compile to a WASM component
[package]
name = "z-tenant-flight"
version = "0.4.1"
edition = "2021"

# crate-type cdylib is what makes the wasm32-wasip2 target emit a WASM
# *component* (not a bare module). Keep "lib" too so the business logic
# stays unit-testable natively.
[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
# wit-bindgen's macro generates the bindings from wit/ at compile time.
wit-bindgen = { version = "0.49", default-features = false, features = ["macros", "realloc"] }
serde = { version = "1.0", default-features = false, features = ["derive", "alloc"] }
serde_json = { version = "1.0", default-features = false, features = ["alloc"] }
hex = { version = "0.4", default-features = false, features = ["alloc"] }

# Small, self-contained artifact — keeps registration under the size cap.
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
​
lib.rs — generate bindings + dispatch to each function
wit_bindgen::generate!({
    world: "tenant-flight",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod booking;
mod search;

struct Component;

// Implement the exported `contracts` interface. Each generated method unwraps
// the input bytes and hands off to the module that does the work.
#[cfg(target_arch = "wasm32")]
impl exports::z::tenant_flight::contracts::Guest for Component {
    fn search_offers(req: exports::z::tenant_flight::contracts::GenericInput) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("search-offers: missing input")?;
        search::search_offers(&input)
    }

    fn book_offer(req: exports::z::tenant_flight::contracts::GenericInput) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("book-offer: missing input")?;
        booking::book_offer(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
The host bindings live under crate::host::* and the exported interface under crate::exports::* — both generated by the macro from wit/.
​
search.rs — search_offers (synchronous http, no PII)
The http interface is synchronous: the response is available before the call returns. Build a Request with a Verb, headers, and an optional payload.
use crate::host::interfaces::{http as http_iface, logging};

let resp = http_iface::call(&http_iface::Request {
    method: http_iface::Verb::Post,
    url: format!("{DUFFEL_BASE}/air/offer_requests?return_offers=false"),
    headers: Some(duffel_headers(&api_key)),         // Vec<(String, String)>
    payload: Some(serde_json::to_vec(&offer_request_body).map_err(|e| e.to_string())?),
})
.map_err(|e| format!("duffel offer-request: {e}"))?;

if resp.code != 201 {
    let body = String::from_utf8_lossy(&resp.payload);
    return Err(format!("Duffel offer-request failed: HTTP {} — {body}", resp.code));
}
let _ = logging::info("offer request created");
// resp.payload holds the response bytes — parse with serde_json.
Outbound HTTP is authorized by the user, not the contract — the hosts a contract may reach are resolved per-call from the calling user’s grant.
​
booking.rs — book_offer (PII via http-with-placeholders)
For calls that carry user PII, use http-with-placeholders. Put {{profile.<field>}} markers in the request body; the host resolves them from the calling user’s profile at dispatch time, so plaintext PII never enters WASM memory.
use crate::host::interfaces::http_with_placeholders as hwp;
use serde_json::json;

let order_body = json!({
    "data": {
        "type": "instant",
        "selected_offers": [req.offer_id],
        "passengers": [{
            "id": req.passenger_id,                              // opaque Duffel id — not PII
            // Resolved host-side from the user's profile (PII never enters WASM):
            "given_name":  "{{profile.first_name}}",
            "family_name": "{{profile.last_name}}",
            "born_on":     "{{profile.date_of_birth}}",
            "email":       "{{profile.verified_contacts.email.value}}",
        }],
        "payments": [{ "type": "balance", "amount": req.total_amount, "currency": req.total_currency }]
    }
});

let resp = hwp::call(&hwp::Request {
    method: hwp::Verb::Post,
    url: format!("{DUFFEL_BASE}/air/orders"),
    headers: Some(duffel_headers(&api_key)),
    payload: Some(serde_json::to_vec(&order_body).map_err(|e| e.to_string())?),
})
.map_err(|e| format!("duffel create-order: {}", format_http_error(e)))?;
hwp::call returns a typed HttpError so failures never leak resolved PII — match on it for clear messages:
fn format_http_error(e: hwp::HttpError) -> String {
    match e {
        hwp::HttpError::EgressDenied(host)        => format!("egress denied for host {host}"),
        hwp::HttpError::PlaceholderDenied(marker) => format!("placeholder not permitted: {marker}"),
        hwp::HttpError::PlaceholderUnknown(field) => format!("user profile missing field: {field}"),
        hwp::HttpError::PlaceholderNoUserContext  => "no user context bound for placeholder resolution".to_string(),
        hwp::HttpError::UpstreamError(reason)     => format!("upstream: {reason}"),
    }
}
See Placeholders in outbound calls.
​
Reading secrets from the secrets KV map
The API key is read from the tenant’s secrets KV map at runtime. The key is seeded by the tenant SDK before the contract runs — there is no set-credentials host function. kv-store calls take the full z:<tid>:<map> name; build it from tenant-context at runtime (the host enforces the prefix):
use crate::host::{interfaces::kv_store, tenant::tenant_context};

fn get_api_key() -> Result<String, String> {
    let tid = tenant_context::tenant_did();
    let map_name = format!("z:{}:secrets", hex::encode(&tid));
    let bytes = kv_store::get(&map_name, b"duffel_api_key")
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or("duffel_api_key not found in z:<tid>:secrets — populate it via the tenant SDK before use")?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
​
Key Design Rules
Export functions on the contracts interface. Each takes generic-input and returns result<list<u8>, string> — JSON bytes on success, an error string on failure. There is no dispatch function and no ContractError enum.
kv-store calls take the full z:<tid>:<map> name. Build it at runtime from tenant_context::tenant_did(); the host enforces the prefix. The map must exist (created and populated by the tenant SDK) before the contract reads or writes it.
Import only the host interfaces you use — they are your contract’s entire capability set. The host refuses to load a contract that imports an interface its tenant world does not provide.
http::call is synchronous; you get the response back before the function returns. Its egress is authorized per-call by the calling user’s grant.
For calls carrying user PII, use http-with-placeholders: put {{profile.<field>}} markers in the request and the host resolves them inside the enclave, so plaintext PII never enters your contract.







Walkthrough
2. Build your TEE contract
This step turns the Rust contract from Step 1 into a WASM component. Run these commands below from the contract repository root, where Cargo.toml and wit/world.wit live.
You do not need cargo-component. With crate-type = ["cdylib", "lib"] in Cargo.toml, the wasm32-wasip2 target emits a WASM component that T3N can inspect and register.
​
Build the release artifact
Install the WASI Preview 2 target once per machine, then build the release artifact:
rustup target add wasm32-wasip2
cargo build --target wasm32-wasip2 --release
Cargo writes the component to target/wasm32-wasip2/release/. If your package name contains hyphens, Cargo converts them to underscores in the file name. The z-tenant-flight package therefore builds to:
target/wasm32-wasip2/release/z_tenant_flight.wasm
Confirm the file exists before moving on:
ls -lh target/wasm32-wasip2/release/*.wasm
The .wasm file is the artifact you pass to tenant.contracts.register in Step 3.
​
Verify the component interface
Use wasm-tools to print the component’s WIT interface:
wasm-tools component wit target/wasm32-wasip2/release/z_tenant_flight.wasm
The output should include the host interfaces you imported in wit/world.wit, such as host:interfaces/kv-store, and your exported interface:
export contracts;
If wasm-tools is not installed yet:
cargo install wasm-tools










3. Register your TEE contract
Registration uploads the WASM component you built in Step 2 and gives it a tenant-local name. After this step, T3N knows about your contract and gives you a numeric contract_id that you use when creating map ACLs.
Before you run this code, make sure you have:
An authenticated TenantClient named tenant. If you have not created one yet, complete step 4 and 5 of set up the dev environment first.
A compiled WASM file at target/wasm32-wasip2/release/z_tenant_flight.wasm.
Your tenantDid, for example did:t3n:abcdef0123456789abcdef0123456789abcdef01.
​
Choose a contract tail
The tail is the local name of your contract inside your tenant namespace. Pass only the part after z:<tid>:. For example, the tail travel-contracts becomes:
z:<tid>:travel-contracts
Do not include z:<tid>: in the tail; the SDK and host derive that from the authenticated tenant.
A tail may contain letters, digits, _, -, and . — but not /. The SDK rejects slashes (tail must match /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,127}$/).
Pick a stable tail for each contract you plan to maintain. When you register a new build at the same tail, increase the version value; changing the tail creates a separate contract entry.
​
Register the WASM
import { readFile } from "fs/promises";

const WASM_PATH = "target/wasm32-wasip2/release/z_tenant_flight.wasm";
const CONTRACT_TAIL = "travel-contracts";
const CONTRACT_VERSION = "0.1.0";

const wasmBytes = await readFile(WASM_PATH);

const result = await tenant.contracts.register({
  tail: CONTRACT_TAIL,
  version: CONTRACT_VERSION,
  wasm: wasmBytes,
});

// This numeric ID is required in the next setup step when you create map ACLs.
const contractId = result.contract_id;
const tenantId = tenantDid.slice("did:t3n:".length);
const scriptName = `z:${tenantId}:${CONTRACT_TAIL}`;

console.log(`registered ${scriptName} as contract id ${contractId}`);
Run this from the same repository root you used to build the contract. If your management script lives somewhere else, update WASM_PATH to point at the .wasm file.
Registration does not run your code, create maps, seed secrets, or grant outbound HTTP access. It only stores the component and records the versioned contract entry for your tenant.
​
What T3N stores
The register payload is just { tail, version, wasm }; there is no manifest.
Host-side, T3N:
Stores the WASM blob in content-addressed storage.
Allocates a numeric ContractId.
Records the contract under your tenant registry.
Your contract’s capabilities come from the host interfaces it imports in world.wit, not from this registration request. See Capabilities come from your WIT imports.
Outbound hosts are also not declared here. They come from the calling user’s authorization grant at invoke time. See Outbound HTTP is authorized by the user, not the contract.
​
First-run troubleshooting
Error or symptom	What it usually means	What to do
ENOENT: no such file or directory	The WASM path is wrong, or the contract was not built yet.	Re-run Step 2 and confirm the path with ls -lh target/wasm32-wasip2/release/*.wasm.
tenant not found	The session DID does not match an admitted tenant — you constructed or derived tenantDid instead of reading it from the session.	Read tenantDid from did.value after authenticating (see Step 5 in set up dev env), then rebuild TenantClient with it. Confirm with tenant.me().
version <x> is not higher than current version <y>	You already registered this tail with the same or a higher version.	Bump CONTRACT_VERSION, for example from 0.1.0 to 0.1.1.
The contract registers, but later cannot read secrets	The map does not exist yet, or its ACL does not include this contractId.	Use the returned contractId when creating the secrets map ACLs.
The contract is now registered. It still cannot complete the full end-to-end flow until the maps and secrets it reads at runtime exist.
Was this page helpful?







4. Invoke your TEE contract
Agents call your contract via the same execute transport as any other T3N contract. The only difference is the script_name starts with z:<tid>:.
Agents authenticate as themselves, not as tenants. Like every T3N session, an agent reads its own DID back from the authenticated session — there’s nothing tenant-specific to set.
​
1. Authorize the contract’s egress
Before any function that makes an outbound HTTP call can run, the user (data owner) must authorize it. A tenant contract’s allowed hosts are resolved per-call from the user’s authorization grant — not from the contract. The user signs an agent-auth-update scoping the agent to your contract, its functions, and the hosts it may reach:
// Signed by the USER (data owner), not the agent.
const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");
await userClient.execute({
  script_name: "tee:user/contracts",
  script_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: agentDid,                               // the agent being authorized
      scripts: [{
        scriptName: TENANT_SCRIPT,                      // z:<tid>:travel-contracts
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],
        allowedHosts: ["api.duffel.com"],               // hosts the contract may dial
      }],
    }],
  },
});
For a direct (self) call — where the user invokes the contract themselves rather than through a separate agent. Set agentDid to the user’s own DID (a self-grant). Without a matching grant the contract still runs, but any outbound call is denied with host/http.egress_denied. See Outbound HTTP is authorized by the user, not the contract.
​
2. Invoke your contract
import {
  T3nClient,
  loadWasmComponent,
  createEthAuthInput,
  eth_get_address,
  metamask_sign,
  getScriptVersion,
  getNodeUrl,
} from "@terminal3/t3n-sdk";

const agentKey = process.env.AGENT_KEY!;
const agentAddress = eth_get_address(agentKey);

const agentClient = new T3nClient({
  wasmComponent,   // node URL resolved from setEnvironment() — see set-up-dev-env
  handlers: {
    EthSign: metamask_sign(agentAddress, undefined, agentKey),
  },
});

await agentClient.handshake();
await agentClient.authenticate(createEthAuthInput(agentAddress));

const TENANT_SCRIPT = `z:${tenantDid.slice("did:t3n:".length)}:travel-contracts`;
const scriptVersion = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);

// 1. Search for offers (no PII)
const search = await agentClient.executeAndDecode({
  script_name: TENANT_SCRIPT,
  script_version: scriptVersion,
  function_name: "search-offers",
  input: { origin: "LHR", destination: "JFK", departure_date: "2026-07-15", cabin_class: "economy", adult_count: 1 },
});
const offer = search.offers[0];

// 2. Book the chosen offer. No PII in the input — name, DOB and email are
//    resolved host-side from the user's profile via http-with-placeholders,
//    and only when the user's grant authorizes this agent (see the grant above).
const booking = await agentClient.executeAndDecode({
  script_name: TENANT_SCRIPT,
  script_version: scriptVersion,
  function_name: "book-offer",
  input: {
    offer_id:       offer.id,
    passenger_id:   offer.passenger_ids[0],  // opaque Duffel id from search — not PII
    total_amount:   offer.total_amount,
    total_currency: offer.total_currency,
  },
});
// booking.pnr → the flight booking reference. The passenger's name never left the enclave.




Create Tenant KV Maps
A TEE contract needs one map before it can run: secrets, holding the API key. Create it with the TenantClient. The tail is the per-map local name; the host stores it as z:<tid>:<tail>.
await tenant.maps.create({
  tail: "secrets",
  visibility: "private",
  writers: { only: [contractId] },
  readers: { only: [contractId] },  // REQUIRED — the kv-governor denies reads when omitted
});
readers must be set explicitly — the KV governor defaults to deny, so leaving it off makes the contract’s own secret read fail with AccessDenied. MapAlreadyExists is idempotent — safe to re-run when re-deploying.
Map visibility quick reference:
"private" — only your contracts can access this map (default, use it for everything sensitive).
"public" — world-readable via /api/dev/public-kv/<tid>/<tail>. Map tail must start with public:. Never put PII in a public map.
Was this page helpful?


Yes




Seed API key into secrets map
Seed the API key into the secrets map using the map-entry-set control call.

Your contract reads the API key from z:<tid>:secrets at runtime. There’s no set-credentials function — the tenant SDK writes the key straight into the map with the map-entry-set control call, on the authenticated tee:tenant/contracts path (not an agent call).
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key:      "duffel_api_key",
  value:    process.env.DUFFEL_API_KEY!,
});

console.log("API key sealed in z:<tid>:secrets — not visible outside the TEE");
What happens:
map-entry-set writes the value into z:<tid>:secrets. It is a control-plane write, so it bypasses the map’s writers ACL — the key lands even though the map is read/write-restricted to the contract alone (see Create tenant KV maps).
At call time your contract reads it back with kv_store::get("secrets", "duffel_api_key") inside the TDX enclave.
The only path to the key is through your contract code — no external observer, not the agent, not the calling developer, can read it back out.




Capabilities come from your WIT imports
Capabilities are determined by the host interfaces imported in your contract’s world.wit

You don’t declare capabilities in a manifest — there isn’t one. What your TEE contract can do is decided in two places, both enforced inside the TEE at call time.
Your contract runs in one of the tenant-* linker worlds, chosen from the host interfaces it imports in world.wit. Import http and your contract is linked against the tenant-http world; import nothing beyond the base and you get tenant-base (kv-store, logging, tenant-context).
world your-contract {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http@2.1.0;   // ← opting into outbound HTTP
}
On top of that, the TEE runtime enforces a capability ceiling — privileged interfaces (signing, user profile, …) are never linked into tenant worlds. See Host API → z-namespace for the full list.



Outbound HTTP calls are authorized by the user, not the contract
Your TEE contract does not declare which hosts it may call. A tenant contract’s outbound HTTP egress is resolved, on every call, from the calling user’s authorization grant — the allowed hosts the user grants when they delegate to your agent or contract:
Delegated call → the subject user’s grant.
Direct (self) call → the caller’s own self-grant.
If the target host (for example api.duffel.com) isn’t on the grant’s allowed-hosts list, the contract still runs but the outbound call is denied with host/http.egress_denied.
This is the most common reason a working contract can’t reach its API: the code is fine, but no grant authorizes the host. Set the grant before you invoke — see Invoke your contract and Delegate access.



Placeholders in outbound calls
Send private data to a third-party API without it ever entering your contract, using http-with-placeholders.

When your contract needs to send private data (e.g., PII — name, date of birth, email, etc.) to a third-party API, it does not read the values and inline them. Instead it uses the http-with-placeholders host interface: you put {{profile.<field>}} markers in the request, and the host resolves them from the calling user’s profile inside the enclave, just before the request goes out. The plaintext never enters your WASM.
  Agent  →  z:<tid>:contract              →  host (http-with-placeholders)  →  Duffel
   book-offer      templates {{profile.*}}        resolves the markers from        POST /orders
                   into the order body            the calling user's profile,      (real PII)
                                                  then sends the rendered request
   { id, pnr } ◀───────────────────────────────────────────────────────────────  { id, pnr }
Your contract in Rust:
use crate::bindings::t3n::host::http_with_placeholders as hwp;

// The {{profile.<path>}} markers are resolved host-side from the calling
// user's profile — this contract never sees the plaintext values.
let body = serde_json::json!({
    "data": {
        "type": "instant",
        "selected_offers": [req.offer_id],
        "passengers": [{
            "id": "passenger_0",
            "given_name":  "{{profile.first_name}}",
            "family_name": "{{profile.last_name}}",
            "born_on":     "{{profile.date_of_birth}}",
            "email":       "{{profile.verified_contacts.email.value}}",
        }]
    }
});

let resp = hwp::call(&hwp::Request {
    method:  "POST".to_string(),
    url:     "https://api.duffel.com/air/orders".to_string(),
    headers: vec![
        ("Authorization".to_string(), format!("Bearer {api_key}")),
        ("Duffel-Version".to_string(), "v2".to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
    ],
    body: Some(serde_json::to_vec(&body)?),
})?;
// resp.body — Duffel's response (booking id + PNR). The passport/name/DOB
// were substituted by the host; your WASM never held them.
Key points:
Synchronous. Like plain http, you get the upstream response back in the same invocation — there’s no deferred queue.
Profile access is gated by the user’s delegation. The markers resolve only when the calling agent is authorized to act for that user (see Invoke your contract). A marker your contract isn’t permitted to resolve fails with placeholder not permitted: <marker>.
Egress is the same rule as http. The target host must be on the user’s allowed-hosts grant, or the call is denied (host/http.egress_denied).
Markers reference the user profile schema — e.g. {{profile.first_name}}, {{profile.date_of_birth}}, {{profile.verified_contacts.email.value}}. Fields the schema doesn’t carry yet (passport, title) are supplied by your contract directly.




ommon errors
Errors come back as a JSON-RPC bad_request (HTTP 400) with { code: "bad_request", detail, request_id }. The SDK throws with detail — a human-readable message string, not a typed error object. Match on the substring shown below.
User-authentication failures additionally carry a machine code at the front of detail (e.g. eth_authenticator_limit: …), so the SDK can branch with a single startsWith.
​
Tenant operations — register, maps, dispatch
You’ll see in detail	Cause	Fix
version <x> is not higher than current version <y>	Re-registering a contract at a version that isn’t greater than the deployed one	Bump the version passed to contracts.register
map already exists	Re-running maps.create against an already-provisioned tenant	Idempotent — safe to ignore on re-runs
map not found	A map tail in kv_store::get / put doesn’t match what maps.create created	Match the tails exactly between Create tenant KV maps and your Rust
canonical map name invalid: <reason>	tail is empty, contains .., or starts with z:	Pass only the local tail (e.g. "secrets") — the SDK prefixes z:<tid>:
quota exceeded: <dim> (e.g. quota exceeded: max_contracts)	Hit a per-tenant quota	Ask the cluster operator to raise the quota
access denied: <caller> cannot <op> map "<map>"	The contract isn’t on the map’s readers / writers ACL	tenant.maps.update to add the contract id to readers / writers
tenant is suspended	The operator suspended your tenant	Ask the operator to resume
host/http.egress_denied: host '<host>' is not in the authorised_hosts allowlist	The contract called a host the caller’s agent_auth grant doesn’t authorize	Add the host to the user’s grant (see Invoke your contract)
Contract-authored errors are whatever your contract returns. The flight example, for instance, surfaces duffel_api_key not found in z:<tid>:secrets — populate it via the tenant SDK when the secrets map wasn’t seeded (see Seed API key into secrets map) — that’s the contract’s own message, not a platform error.
​
Authentication & wallet linking
These come from the user/session contract during sign-in and addAuthMethod, with the code at the front of detail:
Code (prefix of detail)	When
eth_authenticator_limit	Hit the cap on wallets linked to one DID (e.g. trying to add an 11th)
eth_auth_map_conflict	The wallet is already linked to a different DID — resolve via account merge
email_not_verified	A profile upsert ran before the email OTP was verified
user_not_found	The DID has no profile yet
legacy_field	A pre-2.0.0 dispatch field was sent (e.g. otp_code on user-upsert)


Payroll Agent
See Delete Access to AI Agents
Was this page helpful?




Dev Community Support
This section provides the various channels for developer community support from Terminal 3.

We are dedicated to supporting developers building on the T3 Network. We have a few channels dedicated for developers to ask questions, share ideas, and get help.
​
Official Developer Telegram Group
You can join in the conversation and interact with other developers building on the T3 Network via  terminal3developer
We will never DM you personally for payment or ask for any sensitive information. Please report any suspicious attempts via the group and we will advise accordingly.
​
Official Developer Email
In the case where more details need to be provided or if you prefer to send an email, you can reach out to us at devrel@terminal3.io.