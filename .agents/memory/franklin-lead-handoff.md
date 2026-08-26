---
name: Franklin Lead Handoff
description: Rules for moving a Franklin server-ingested lead-only Recruiting case into Onboarding.
---

Franklin intake cases intentionally have no driver during active Recruiting. Only a trusted Franklin source case with an immutable, workspace-scoped intake ledger may create its driver during the existing Recruiting-to-Onboarding transfer transaction. The transaction must bind that driver to the Recruiting case before creating the Onboarding case, preserve the ledger driver type, and roll back all work on failure.

**Why:** The intake boundary must not create an Onboarding driver prematurely, while the established transfer model requires a driver and must remain exact-once under retries or concurrent requests.

**How to apply:** Keep ordinary Recruiting cases driver-required. A missing driver outside the trusted Franklin source/ledger combination is a fail-closed transfer error; never infer the driver type from caller-provided transfer input.