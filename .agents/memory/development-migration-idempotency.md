---
name: Development migration idempotency
description: Development schema may contain an additive change missing from the Drizzle journal.
---

When an existing development database has an additive column but lacks the matching Drizzle journal entry, make that unapplied additive migration idempotent with `IF NOT EXISTS` and then use the normal migrator.

**Why:** A historical development schema can be ahead of its migration journal; a duplicate-column failure rolls back the entire forward migration chain.

**How to apply:** Confirm the discrepancy against the development journal and schema first. Preserve the forward-only migration chain, patch only an unapplied additive migration, and never bypass the journal or alter production manually.