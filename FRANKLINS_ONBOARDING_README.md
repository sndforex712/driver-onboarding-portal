# Franklins AI Driver Onboarding — Development / Demo App

> ⚠️ **DEV / DEMO ONLY** — This app uses seeded fictional data. It is not connected to production Franklins systems, the production database, Telegram bots, DataTruck TMS, DocuSign, or any live credentials.

---

## Overview

A full-stack development app for Franklins AI's driver onboarding pipeline. It provides a professional dark-green operations interface for managing the journey from "Recruiter Hired" event to "Ready for Dispatch," covering both Owner Operator and Company Driver tracks.

Built as a pnpm monorepo with a React/Vite frontend (`/artifacts/franklins-onboarding`) and an Express 5 API server (`/artifacts/api-server`).

---

## Architecture

```
artifacts/
  api-server/          Express 5 API server (Node.js 24)
    src/
      routes/          Route handlers per domain
        drivers.ts     Driver CRUD, ready-for-dispatch, DataTruck sync
        tasks.ts       Onboarding task management
        documents.ts   Document upload and status
        checklist.ts   Compliance gate checklist
        activity.ts    Audit timeline
        comments.ts    Driver comments
        events.ts      Hired event simulation (idempotent)
        dashboard.ts   Metrics, activity feed, compliance exceptions, work queue, recruiter report
        users.ts       Demo user management and role switcher
        templates.ts   Workflow template definitions
        integrations.ts  Demo adapter catalog
      lib/
        seed.ts        Database seed with demo data
        checklist-gates.ts  Gate definitions and readiness logic
        logger.ts      Pino structured logging
      tests/
        readiness-gates.test.ts  Automated tests

  franklins-onboarding/  React + Vite frontend
    src/
      pages/           Route-level page components
      components/      Shared UI components

lib/
  api-spec/            OpenAPI 3.1 spec (source of truth)
    openapi.yaml       Full API contract
  api-client-react/    Generated React Query hooks (Orval)
  api-zod/             Generated Zod validation schemas (Orval)
  db/                  Drizzle ORM + PostgreSQL
    src/schema/        Table definitions
```

---

## Data Model

### `drivers` table
Core onboarding record created on every Hired event.

| Column | Type | Description |
|---|---|---|
| id | serial PK | Internal ID |
| fullName | text | Driver's full name |
| phone / email / state | text (nullable) | Contact and location |
| driverType | text | `owner_operator` or `company_driver` |
| status | text | `pre_hire`, `in_progress`, `pending_approval`, `approved`, `ready_for_dispatch`, `dispatched`, `fallout`, `on_hold` |
| stage | text | Human-readable current stage label |
| priority | text | `critical`, `high`, `medium`, `low` |
| recruiterName / sourceChannel | text | Attribution (preserved forever) |
| assigneeId / assigneeName | integer / text | Onboarding owner |
| externalRecruitId | text (unique) | Idempotency key from recruiter event |
| telegramGroupLinked | boolean | Required for dispatch unlock |
| readyForDispatch | boolean | Computed when all gates pass |
| complianceGatesPassed | boolean | Set when mandatory checklist completes |
| completionPercent | integer | 0–100 auto-calculated from checklist |
| datatruckSyncStatus | text (nullable) | `pending`, `synced`, `failed`, `retry` |
| nextBestAction / blockers | text (nullable) | Ops queue guidance |
| slaDeadline / startDate | text (nullable) | YYYY-MM-DD strings |

### `checklist_items` table
One row per compliance gate per driver. Auto-seeded on record creation from `checklist-gates.ts`.

| Column | Type | Description |
|---|---|---|
| gateKey | text | Unique identifier (e.g. `cdl_front`) |
| label | text | Human label |
| gateCategory | text | `shared_pre_hire`, `owner_operator`, `company_driver` |
| appliesTo | text | `both`, `owner_operator`, `company_driver` |
| status | text | `pending`, `in_progress`, `passed`, `failed`, `na` |
| isMandatory | boolean | Gates ReadyForDispatch if true |
| sortOrder | integer | Display order |

### Other tables
- `onboarding_tasks` — Structured tasks (type, priority, assignee, due date, mandatory flag)
- `driver_documents` — Document records with status and expiry
- `activity_entries` — Immutable audit trail per driver
- `comments` — Threaded comments on driver records
- `datatruck_syncs` — Sync attempt log per driver (idempotent)
- `app_users` — Demo users with role (session managed via `is_current_session`)
- `workflow_templates` + `template_steps` — OO and CD template definitions

---

## Workflow Rules

### Hired Event Idempotency
- Endpoint: `POST /api/events/hired`
- Required field: `externalRecruitId` (unique string from recruiter system)
- If a driver record already exists with that `externalRecruitId`, the existing record is returned with HTTP 200 (no duplicate created)
- A new record returns HTTP 201
- Checklist gates are auto-populated from the driver's template on creation

### Ready for Dispatch Gate
- Endpoint: `POST /api/drivers/:id/ready-for-dispatch`
- Blocked until ALL of the following are `passed` in `checklist_items`:
  - All **shared pre-hire** mandatory gates (application, CDL front/back, medical, employment history, MVR, PSP, Clearinghouse, drug test, road test, qualification approval)
  - All **driver-type-specific** mandatory gates (see `checklist-gates.ts`)
  - `telegramGroupLinked === true` on the driver record
- On success: sets `readyForDispatch = true`, `status = 'ready_for_dispatch'`, `completionPercent = 100`
- Returns a `ReadinessResult` with `failedGates[]` on failure (HTTP 400)

### DataTruck Sync (Simulated)
- Endpoint: `POST /api/drivers/:id/datatruck-sync`
- **Idempotent**: If a `synced` record already exists for the driver, returns it without creating a new attempt
- Simulated outcomes: ~60% synced, ~20% retry, ~20% failed on attempt 1; ~80% synced on attempt 2; always synced on attempt 3+
- Each attempt is recorded in `datatruck_syncs` with `attemptNumber`, `syncStatus`, `errorMessage`, and `syncedAt`
- Does not make any real external API call

### Completion Percent
- Recalculated on every `PATCH /api/drivers/:id/checklist/:itemId`
- `percent = (passedMandatoryItems / totalMandatoryItems) * 100`

---

## Owner Operator vs Company Driver — Checklist Branches

### Shared Pre-Hire Gates (both types)
1. Application & E-Sign Consent
2. CDL Front
3. CDL Back
4. Medical Status / Card
5. Employment History (10 yr)
6. MVR Request (Placeholder)
7. PSP Request (Placeholder)
8. Clearinghouse Consent / Query (Placeholder)
9. Drug Test Order / Result (Placeholder)
10. Road Test / Equivalent
11. Qualification File Approval

### Owner Operator Additional
Company/W-9/EIN → Truck VIN/Title/Registration → Insurance (with expiry) → DOT Inspection → Lease Agreement → Plate/IRP/IFTA → ELD Setup → Fuel Card → Equipment Shipment → **Telegram Onboarding** (mandatory) → Dispatch Handoff

### Company Driver Additional
Offer Letter → I-9/W-4/Direct Deposit → Orientation & Policy Training → Road Test (Company) → Payroll Profile → Truck Assignment → ELD Credentials → Equipment Shipment → **Telegram Onboarding** (mandatory) → Dispatch Handoff

---

## External Adapter Interfaces

These adapters are shown in the Integrations page as **demo/disconnected** only. No real secrets are requested or stored.

| Adapter | Purpose | Key Config Fields |
|---|---|---|
| Franklins CRM | Receive Hired events, sync records | `api_base_url`, `api_key`, `webhook_secret` |
| Telegram Bot | Add drivers to onboarding groups, notify dispatch | `bot_token`, `onboarding_group_id`, `dispatch_group_id` |
| DocuSign | Send/track e-signature envelopes | `account_id`, `integration_key`, `user_id`, `base_path` |
| FMCSA Clearinghouse | Submit consent, query CDL drug history | `employer_id`, `api_key` |
| Drug Testing Provider | Order and receive DOT drug tests | `provider`, `account_number`, `api_key` |
| UPS Shipping | Track equipment shipment to drivers | `client_id`, `client_secret`, `shipper_number` |
| DataTruck TMS | Sync approved drivers into TMS | `api_base_url`, `carrier_id`, `api_key`, `environment` |

---

## Environment Variables

### API Server (`artifacts/api-server`)
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | Yes | Injected by workflow |
| `NODE_ENV` | No | `development` (default) or `production` |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |

### Frontend (`artifacts/franklins-onboarding`)
| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Injected by workflow |
| `BASE_PATH` | Yes | URL base path, injected by workflow |

### Future Production Variables (not used in demo)
| Variable | Description |
|---|---|
| `FRANKLINS_API_KEY` | Franklins CRM webhook verification key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `DOCUSIGN_ACCOUNT_ID` | DocuSign account ID |
| `DOCUSIGN_INTEGRATION_KEY` | DocuSign integration key |
| `CLEARINGHOUSE_API_KEY` | FMCSA Clearinghouse API key |
| `DRUG_TEST_API_KEY` | Drug testing provider API key |
| `UPS_CLIENT_ID` / `UPS_CLIENT_SECRET` | UPS shipping credentials |
| `DATATRUCK_API_KEY` | DataTruck TMS API key |
| `DATATRUCK_CARRIER_ID` | DataTruck carrier ID |
| `SESSION_SECRET` | Session signing secret |

---

## Production Migration Checklist

When transitioning from this dev/demo app to production:

1. **Database**
   - [ ] Provision a separate production PostgreSQL instance
   - [ ] Publish through Replit's schema-diff flow; do not run local migration commands in production
   - [ ] Do NOT migrate demo seed data — production starts empty
   - [ ] Add DB connection pooling (PgBouncer recommended for high concurrency)

2. **Authentication**
   - [ ] Replace demo role switcher with real auth (Clerk or Replit Auth)
   - [ ] Implement middleware that attaches authenticated user to `req.user`
   - [ ] Enforce role-based access control server-side (not just UI-layer)

3. **Integrations**
   - [ ] Wire real Franklins CRM webhook receiver (`POST /api/events/hired`)
   - [ ] Configure Telegram bot token and group IDs
   - [ ] Wire DocuSign envelope callbacks to update document status
   - [ ] Implement real Clearinghouse API calls
   - [ ] Implement real drug testing provider API
   - [ ] Implement real DataTruck TMS sync (replace simulated logic in `drivers.ts`)
   - [ ] Store all credentials in environment secrets (never hardcode)

4. **DataTruck Sync**
   - [ ] Replace simulation logic in `POST /api/drivers/:id/datatruck-sync` with real API call
   - [ ] Implement webhook receiver for DataTruck status callbacks
   - [ ] Add retry queue (e.g., Bull/BullMQ or pg-boss) for `retry` and `failed` states

5. **Security**
   - [ ] Add rate limiting (express-rate-limit)
   - [ ] Add CSRF protection
   - [ ] Ensure all secrets from Integration config fields are stored encrypted
   - [ ] Add audit logging for all mutations (already architected via `activity_entries`)
   - [ ] Never log PII — review pino redact config

6. **Compliance**
   - [ ] Ensure CDL/medical/drug test result data is stored with appropriate access controls
   - [ ] FMCSA requires Clearinghouse queries within 3 business days of hire — add enforcement
   - [ ] DOT requires retaining driver qualification files for 3 years after departure

7. **Operational**
   - [ ] Set up monitoring and alerting for DataTruck sync failures
   - [ ] Configure SLA breach notifications (email/Telegram/Slack)
   - [ ] Set up daily/weekly reports for recruiter attribution metrics
   - [ ] Implement automated reminders for expiring docs (insurance, medical card)

---

## Running Tests

```bash
# From the workspace root
pnpm --filter @workspace/api-server run typecheck

# Tests use Jest (requires setup):
cd artifacts/api-server
npx jest src/tests/
```

Tests cover:
- Readiness gate logic (OO vs CD gate sets, template correctness)
- Duplicate Hired event handling (idempotency invariants)
- Role permissions (capability matrix)
- DataTruck sync state machine (pending/synced/failed/retry)

---

## Development Commands

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/franklins-onboarding run dev

# Regenerate API hooks after spec changes
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run migrate

# Typecheck everything
pnpm run typecheck
```
