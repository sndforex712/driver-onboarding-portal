---
name: Operational milestone access
description: Ownership rules for reading drivers and changing operational checklist milestones.
---

Specialist access to operational driver data is default-restricted: a non-manager may view a driver or its checklist only when they are the current operational owner. A specialist may change a checklist item only when they own both the driver and the canonical milestone being edited. Owner-admin and manager roles retain the intentional operational override.

**Why:** Filtering the queue alone leaves direct-ID reads and early edits of another owner's milestone exposed. The current-driver check also cannot enforce the Mason/Wayne-to-Hardy step boundary by itself.

**How to apply:** Preserve both checks for any new driver-scoped route or checklist mutation. Resolve checklist ownership from the canonical gate-to-step mapping; do not infer it from client input or merely from the current driver owner.