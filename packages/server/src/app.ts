// The app factory: ONE Hono process, hostname-routed (locked all-in-Railway shape).
//   mcp.*          -> MCP endpoints + dashboard API + webhooks
//   facilitator.*  -> erc7710 x402 facilitator + demo seller (P3)
// In dev (localhost) every route is reachable on the single host.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ENGINE_VERSION } from "@t3spend/engine";
import type { AppDeps } from "./deps";
import { mcpRoutes } from "./mcp/routes";
import { apiRoutes } from "./api/routes";
import { oauthRoutes } from "./oauth/routes";
import { OAuthStore } from "./oauth/store";

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  // OAuth lane storage rides the same sqlite database as the engine store
  const oauth = new OAuthStore(deps.store.db);

  app.get("/", (c) =>
    c.json({
      ok: true,
      service: "T3 Spend",
      engine: ENGINE_VERSION,
      docs: "/docs",
      health: "/health",
      mcp: "/mcp",
      api: "/api",
    }),
  );

  app.get("/health", (c) =>
    c.json({ ok: true, engine: ENGINE_VERSION, host: c.req.header("host") ?? null }),
  );

  // dashboard API is browser-consumed (the Netlify/Vercel/any origin). Secured by
  // bearer tokens (not cookies), so permissive CORS is safe — the token gates access.
  // An explicit T3SPEND_CORS_ORIGINS env var narrows it down if needed.
  app.use(
    "/api/*",
    cors({
      origin: (origin) => {
        if (!origin) return null; // server-to-server, no browser CORS needed
        const explicit = (process.env.T3SPEND_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (explicit.length === 0) return origin; // no explicit list = any origin works
        return explicit.includes(origin) ? origin : null;
      },
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  );

  app.route("/", oauthRoutes(deps, oauth));
  app.route("/", mcpRoutes(deps, oauth));
  app.route("/api", apiRoutes(deps, oauth));

  return app;
}
