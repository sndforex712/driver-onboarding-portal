---
name: Legacy Sheet Import Boundary
description: The legacy Google Sheet importer is permanently scoped to the JIDO main tab and preserves other historical tabs as inactive snapshots.
---

Only `MAIN JIDO FREIGHT LLC` may feed active operational Recruiting records. The importer must use an explicit allowlist for that exact tab; configuration must not widen it to other workbook tabs.

**Why:** The operational JIDO board represents the workbook’s first tab only. Other tabs are legacy/referral/history material and must not influence active queue, pipeline, dashboard, or war-room counts.

**How to apply:** If non-main rows were imported previously, retain their snapshots and audit history, mark them source-missing/inactive on a corrected pull, and hide their imported cases from active operational views. Never delete or merge them, and never modify the source workbook.