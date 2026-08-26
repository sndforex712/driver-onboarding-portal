---
name: Recruiting Stage Entry Audit
description: Authoritative audit-event rules for displaying a Recruiting stage entry timestamp.
---

Use only `case_created`, `stage_transition`, and `future_follow_up_return` events as evidence that a Recruiting case entered a stage. For a re-entered stage, use the latest matching authoritative event and label it as the most recent entry. If no such event exists, distinguish an unreached stage from missing recorded history; never infer a date. A failed or paginated/incomplete timeline must instead be identified as unavailable or incomplete, not as a confirmed missing timestamp.

**Why:** Legacy Sheet import/snapshot and onboarding-transfer events can carry the current `toStage` for bookkeeping but their timestamps represent ingestion or transfer activity, not entry into that Recruiting stage.

**How to apply:** Any stage-info UI, export, or automation that exposes “entered this stage” must filter the audit timeline to those authoritative event types before selecting a timestamp.