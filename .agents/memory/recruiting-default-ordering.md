---
name: Recruiting Default Ordering
description: Default and explicit sort semantics for paginated Recruiting cases and the active work queue.
---

Active Recruiting views default to the canonical stage-progress order descending. Unknown stages rank last. Ties resolve by SLA urgency, next-action deadline, recency, then stable case ID. This ordering is applied by the database before pagination.

**Why:** Operators need furthest-progress drivers first, and client-side sorting only one fetched page makes pagination misleading.

**How to apply:** Preserve progress as the no-parameter/default order for active queues and lists. Keep explicit SLA, due-date, and newest modes as their own server-side sort behavior; do not replace them with the default progress order.