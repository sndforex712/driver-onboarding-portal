---
name: Seed Idempotency Guard
description: How the demo seed guard works and what to do if it fires incorrectly
---

# Seed Idempotency Guard

## How it works
`artifacts/api-server/src/lib/seed.ts` checks `SELECT * FROM app_users` before seeding.
If any rows exist, it logs "already seeded" and exits immediately.

## When it fires incorrectly
If a previous seed run inserted users but then failed partway through (e.g. template_steps null constraint),
the guard will prevent a re-seed even though data is incomplete.

## Fix
Truncate all tables in dependency order (children before parents), then restart the API server:

```sql
TRUNCATE TABLE datatruck_syncs, comments, activity_entries, onboarding_tasks, driver_documents, checklist_items, drivers, template_steps, workflow_templates, app_users RESTART IDENTITY CASCADE;
```

The seed runs automatically on server start via `seedDatabase()` in `artifacts/api-server/src/index.ts`.

**Why:** Partial seed failure is silent if you don't check logs — the guard makes it look like success.
