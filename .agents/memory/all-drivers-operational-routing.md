---
name: All Drivers operational routing
description: Product rules for the hardened All Drivers operational queue and its checklist-based owner routing.
---

All Drivers uses a 13-milestone operational projection. Steps 1–6 route to Mason or Wayne deterministically, while Steps 7–13 (including Ready) route to Hardy. “Shipment Need to Send” and “Shipment Sent” are distinct persisted checklist milestones; the latter must never be inferred from the former.

**Why:** The operational queue needs an auditable assignment state, not a display-only recruiter label or a lossy snapshot projection. Legacy Sheet records can be incomplete, so they should surface as review exceptions rather than be rewritten.

**How to apply:** Derive queue rows from workspace-scoped persisted checklists and CRM fields. Preserve Sheet data as provenance only; do not let refreshes overwrite operational assignment, next action, blockers, or status. Treat known supporting compliance gates as normal non-milestone work, but flag true contradictions to both canonical and persisted checklist order.