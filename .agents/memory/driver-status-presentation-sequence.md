---
name: Driver Status Presentation Sequence
description: Presentation-only omission of two Recruiting stages from driver-status rails.
---

Driver-status rails intentionally display a 14-stage presentation sequence: `connected_prequalified` and `manager_review` are omitted, while the canonical Recruiting stage order retains all 16 workflow stages. If a case is currently at an omitted stage, its displayed progress resolves to the preceding visible milestone.

**Why:** Operators need a compact, gap-free status rail without altering workflow states, API contracts, audit history, or transitions that still depend on the canonical order.

**How to apply:** Use the visible driver-status sequence for case-detail and queue progress labels, step totals, connectors, and milestone buttons. Preserve the canonical sequence for workflow logic and non-rail operational views.