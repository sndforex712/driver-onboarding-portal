---
name: Empty DEV workspace resets
description: The DEV operational bootstrap recreates fixtures after a data-only reset unless empty-workspace mode is enabled.
---

For an intentionally empty Franklin development workspace, enable `FRANKLINS_DEMO_EMPTY_WORKSPACE=1` before restarting the API.

**Why:** The normal startup bootstrap treats missing operational records as a migration/backfill condition and recreates the Manager Board demo fixtures. A data-only deletion therefore does not persist across a restart.

**How to apply:** Use this mode only for explicitly authorized DEV reset scenarios. It preserves workspace and authentication infrastructure while skipping operational-data bootstrap; unset it before intentionally reseeding fixture data.