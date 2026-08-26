# Recruiting repository test boundary

`src/lib/recruiting-repository.ts` contains both the production Drizzle adapter
and an in-memory transaction adapter. The in-memory adapter is deliberately
used for the focused repository tests because Increment 2B must not migrate,
clean, or otherwise mutate the shared development or production databases.

## Remaining database integration test

Before exposing this repository through a route, run the focused suite against
an isolated PostgreSQL database that has only the approved checked-in Drizzle
migrations applied. It must verify:

1. a PostgreSQL unique-index conflict during concurrent active-case creation
   returns the deterministic duplicate outcome;
2. a duplicate transition/effect key or stale optimistic-version race rolls
   back the losing transaction and then replays the existing successful event;
3. the unique `recruiting_case_id` transfer link permits exactly one completed
   OnboardingCase under concurrent transfer attempts, including a supplied
   same-workspace target; and
4. a forced SQL error after each write position rolls back the complete
   transaction, without exposing a different workspace's replay result.

Do not run that integration suite against the shared development database or
against production. The in-memory suite covers the same transactional contract
until an isolated database is provisioned.