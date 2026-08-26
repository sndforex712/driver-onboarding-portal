---
name: Isolated Repository Tests
description: Running repository unit tests without loading the shared Drizzle package or database.
---

**Rule:** Keep production TypeScript imports extensionless for the project compiler, but run pure repository tests from a temporary copy that rewrites only the direct local domain import to include `.ts`.

**Why:** Node's strip-types runner cannot resolve the workspace database package's extensionless schema directory imports, and it also cannot resolve the repository's extensionless local domain import. Enabling `.ts` imports in production source conflicts with the current TypeScript configuration.

**How to apply:** Keep database-dependent adapters behind lazy runtime imports and exercise the pure transaction-port service with the in-memory adapter. For direct Node tests, copy the repository module and its pure local dependency into `/tmp`, rewrite the one local import in that copy, then run the unchanged test file. Typecheck and build the real Drizzle adapter separately; never point this test path at shared data.