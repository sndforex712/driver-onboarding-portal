# Database migration policy

This project uses checked-in, forward-only Drizzle migrations in this directory.

- Create a reviewed migration with `pnpm --filter @workspace/db run generate`.
- Apply checked-in migrations only in development with `pnpm --filter @workspace/db run migrate`.
- Do not use `drizzle-kit push` or `drizzle-kit push --force`.
- Do not run local migration commands against production; use Replit's Publish schema-diff flow.

`0000_recruiting_foundation.sql` is intentionally additive: it creates Recruiting
tables and a nullable `onboarding_cases.recruiting_case_id` link without altering
existing rows, backfilling data, or changing existing Onboarding behavior.

Drizzle's standard migration journal supports forward application only, not native
down migrations. A rollback must therefore be a separately reviewed compensating
migration; it must not be an automatic destructive script.

## Increment 2B transaction checks

The database enforces Case Owner and Task Owner workspace membership through
composite foreign keys. Existing `drivers`, `leads`, and `onboarding_cases` do not
expose the composite workspace keys needed to enforce every relationship at the
database level. Before inserting or transferring a RecruitingCase, the transaction
layer must verify that:

1. the selected driver and lead belong to the RecruitingCase workspace; and
2. a completed transfer's target OnboardingCase belongs to that same workspace.