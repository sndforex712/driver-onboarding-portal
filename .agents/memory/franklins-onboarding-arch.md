---
name: Franklins Onboarding Architecture
description: Stack decisions, key files, and integration points for the Franklins AI driver onboarding dev/demo app
---

# Franklins AI Driver Onboarding — Architecture

## Stack
- Frontend: `artifacts/franklins-onboarding` — React + Vite, Orval-generated hooks from `lib/api-client-react`
- API: `artifacts/api-server` — Express 5, Pino logging, routes in `src/routes/`
- DB: Drizzle ORM + PostgreSQL, schema in `lib/db/src/schema/`
- OpenAPI spec: `lib/api-spec/openapi.yaml` — source of truth; run `pnpm --filter @workspace/api-spec run codegen` after changes
- All integer types in OpenAPI spec use `number` (not `integer`) because Orval + Zod v3 generates `z.int()` (Zod v4 API) for `integer`

## Key constraints
- DEV/DEMO only — no real credentials, no real external integrations
- All integration adapters in `/api/integrations` return `status: "demo"` — never accept or store real secrets
- DataTruck sync is fully simulated (weighted random outcomes)
- `externalRecruitId` unique constraint on drivers table enforces one-record-per-hire idempotency at DB level

## Routes registered (all under /api)
drivers, tasks, documents, checklist, activity, comments, events, dashboard, users, templates, integrations, health

**Why:** Full reference so future sessions don't re-explore the route tree.
