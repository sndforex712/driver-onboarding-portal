---
name: Onboarding Case System
description: onboarding_cases table — 1:1 with driver, idempotency gate for hired event, preserves recruiter/source/notes, merges docs on replay
---

## Schema: onboarding_cases
One row per driver (driverId FK, unique per workspace). externalRecruitId is the idempotency key checked before creating any records.

Key preserved fields (set once, NEVER overwritten):
- recruiterName, sourceChannel — from first hired event
- initialNotes — recruiter notes from first hired event

Mutable fields (updated on replay or via PATCH):
- status (open → onboarding → completed/fallout)
- replayCount, lastReplayAt — incremented on every idempotent replay
- slaDeadline, assignedSpecialistId

## Idempotency contract (POST /events/hired)
Gate key: (externalRecruitId, workspaceId) on onboarding_cases — checked FIRST before lead/driver lookup.

First call (case absent): creates lead → driver → case → checklist → stage history → docs. Returns 201 { wasIdempotent: false }.

Replay (case exists):
- Preserves: recruiterName, sourceChannel, initialNotes — override attempts in body silently ignored
- Merges notes: if body.notes differs from initialNotes → appended as activity_entry, NOT written to case
- Merges docs: body.documents[] filtered by docType against existing driver_documents; only new docTypes inserted
- Increments: replayCount + 1, lastReplayAt = now
Returns 200 { wasIdempotent: true, replayCount, docsAdded }.

## Extended body fields (not in generated schema)
events.ts defines extractExtras() to pull these from req.body without zod:
- notes?: string — initial recruiter notes
- documents?: {docType, docName, notes?, expiryDate?}[]
- slaDeadline?: string

**Why not zod.extend():** api-server has no direct zod dependency; @workspace/api-zod generated schemas are used for the base body, extra fields extracted via typed JS.

## Case status → driver stage sync
stageToCaseStatus() in routes/stage.ts maps stage → case status.
recordStageTransition() syncs case status automatically after every stage change (no-op if no case exists).
Mapping: hired→open, pre_hire/onboarding→onboarding, dispatch_ready/active→completed, fallout→fallout.

## Endpoints
- POST /events/hired — idempotent create/replay
- GET /drivers/:id (enriched) — includes onboardingCase field
- GET /drivers/:id/case — standalone case read
- PATCH /drivers/:id/case — update status, slaDeadline, assignedSpecialistId (manage_tasks required)

## Backfill
ensureWorkspaceData creates cases for all drivers with zero cases (migration guard).
Case number: CASE-{id padded to 5 digits}, set immediately after insert.
