---
name: Authorization Architecture
description: Default-deny independent per-handler authorization pattern; why lib package declarations must be rebuilt after source changes
---

## Rule
Every route handler calls `authorize(req, capability)` from `lib/authorize.ts` at the top of its body — not as Express middleware. No route relies on `req.currentUser`, `req.workspaceId`, or any middleware having run before it.

**Why:** Middleware-based authorization can be accidentally omitted from a route registration. Independent per-handler auth means forgetting middleware cannot open a data leak — there is simply no path that bypasses the `authorize()` call.

## How to apply
- New routes: use `withAuth(req, res, "capability_name", async (auth) => { ... })` — all DB queries use `auth.workspaceId` as the sole scope.
- Session-only routes (no workspace): use `withSession(res, async (ctx) => { ... })`.
- The old `requireWorkspace` / `requireCapability` middleware shims remain in `role-guard.ts` but should not be used for new routes.
- `auth.workspaceId` is the ONLY source of row-level workspace scope. Never use `req.params.workspaceId`, `req.body.workspaceId`, or `req.query` workspace values.

## Lib package declaration rebuild
TypeScript project references mean the frontend and API server compile against `dist/*.d.ts` files, not source.
After editing any source file in a lib package, run `npx tsc --build` inside that package to regenerate declarations:
- `lib/db` — after schema changes
- `lib/api-zod` — after OpenAPI/Zod schema changes
- `lib/api-client-react` — after custom-fetch or generated API changes

Stale declarations produce "Module has no exported member" errors in consuming packages even though the source is correct.
