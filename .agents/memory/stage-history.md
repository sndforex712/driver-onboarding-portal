---
name: Stage History System
description: Append-only driver_stage_history table; formal stage pipeline; recordStageTransition helper; auto-advance hooks
---

## Stage pipeline (ordered)
hired → pre_hire → onboarding → dispatch_ready → active
fallout: terminal, reachable from any stage

## Key files
- `lib/db/src/schema/driver_stage_history.ts` — append-only table schema
- `artifacts/api-server/src/lib/stages.ts` — DRIVER_STAGES enum, STAGE_LABELS, isForwardStage(), statusToStage() backfill helper
- `artifacts/api-server/src/routes/stage.ts` — GET /drivers/:id/stage-history, POST /drivers/:id/stage (manual advance), exports recordStageTransition()

## recordStageTransition() — shared helper
Exported from `routes/stage.ts`. Imported by events.ts, drivers.ts, and checklist.ts.
Does two things atomically:
1. UPDATE drivers SET stage = toStage
2. INSERT INTO driver_stage_history

**Why not a lib file:** It calls `db` directly and is tightly coupled to DB schema. Routes import it cleanly.

## Auto-trigger points
- POST /events/hired → hired_event (null → hired)
- PATCH /drivers/:id/checklist/:itemId → auto_gate:
  - When driver.stage === "hired" and first gate is touched → hired → onboarding
  - When all mandatory gates pass and driver.stage === "onboarding" → onboarding → dispatch_ready
- POST /drivers/:id/ready-for-dispatch → dispatch_check (currentStage → dispatch_ready)

## Manual advance
POST /drivers/:id/stage requires manage_tasks capability.
Validation: must be forward (or fallout from any). Does NOT re-run gate checks (that's /ready-for-dispatch).

## Backfill rule
ensureWorkspaceData checks existingHistory.length === 0 for workspace.
If 0: normalizes drivers.stage via statusToStage() + inserts synthetic history entries.
statusToStage() in lib/stages.ts handles old free-text values like "CDL Verification" → "onboarding".
