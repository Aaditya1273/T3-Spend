// @t3spend/server: the one always-on process (Railway).
// Hostname routing on a single Hono app:
//   mcp.t3spend.s0nderlabs.xyz        -> MCP endpoint (/c/<secret>/mcp) + dashboard API + webhooks
//   facilitator.t3spend.s0nderlabs.xyz -> erc7710 x402 facilitator (verify/settle/supported) + demo seller
// Facilitator routes use fetch + WebCrypto ONLY (portability rule: 20-min Workers escape hatch).

import { reconcilePending } from "@t3spend/engine";
import { createApp } from "./app";
import { envInt, realDeps } from "./deps";

// Catch background Worker crashes from bytecodealliance shims (Bun compat)
// without killing the server. Log and continue.
process.on("uncaughtException", (err) => {
  console.error("[uncaught] non-fatal:", err.message);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandled] non-fatal:", String(err));
});

const deps = await realDeps();
const app = createApp(deps);
const port = envInt("PORT", 4070);

// Initialize the T3N SDK at boot (async)
// realDeps() now initializes the SDK and returns a Promise

// Reconcile sweep: charges left "pending" (confirm timed out) hold budget until
// settled. Re-check them against chain logs periodically. 0 disables (tests).
const reconcileMs = envInt("T3SPEND_RECONCILE_INTERVAL_MS", 300_000);
if (reconcileMs > 0) {
  setInterval(() => {
    reconcilePending({ store: deps.store, relayer: deps.relayer }).then(
      (r) => {
        if (r.reconciled) console.log(`[reconcile] settled ${r.reconciled} stuck charge(s)`);
      },
      () => {}, // sweep errors are non-fatal; next tick retries
    );
  }, reconcileMs);
} else {
  console.log("[reconcile] sweep DISABLED (T3SPEND_RECONCILE_INTERVAL_MS=0): stuck pending charges will hold budget");
}



Bun.serve({ port, fetch: app.fetch, idleTimeout: 120 });

console.log(`T3 Spend server listening on :${port}`);
