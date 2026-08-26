---
name: Drizzle Migration Metadata
description: Constraints for checked-in Drizzle migrations in this project.
---

**Rule:** Keep Drizzle migration output configured as the relative path `./drizzle` and commit the generated journal plus snapshot metadata with each migration.

**Why:** Drizzle Kit 0.31 prefixes an absolute `out` path during `check`, which makes it look for a nonexistent nested absolute path. Custom migrations generate a journal but not a schema snapshot; `drizzle-kit check` requires that generated snapshot.

**How to apply:** Generate and review migration metadata without applying SQL, then commit the reviewed additive SQL, `meta/_journal.json`, and matching `meta/<index>_snapshot.json`. Validate with `drizzle-kit check` before using `migrate`; do not use schema push/force workflows.