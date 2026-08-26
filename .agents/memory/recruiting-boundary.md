---
name: Recruiting Boundary
description: Product boundary between the separate Recruiting module and preserved Onboarding system.
---

**Rule:** Build Recruiting as a separate pre-Onboarding module. Do not change the existing Onboarding Manager Board as part of Recruiting work. The conceptual flow's second “Recruiter” represents automatic task-owner return from manager review, not another Recruiting stage. `Application Sent → Application Received` stays recruiter-owned; the manager handoff occurs exactly once, only on `Application Received → Manager Review`. A transactional transition plus unique/idempotency key must prevent duplicate manager tasks. One durable Driver may have many historical RecruitingCases, but only one active RecruitingCase per workspace; a later rehire creates a new RecruitingCase and, after success, a new OnboardingCase. External integrations remain manual-first behind adapter interfaces.

**Why:** The product owner explicitly distinguished the conceptual handoff diagram from the final stage list, clarified that the recruiter must explicitly submit a complete received application, and defined the default rehire and integration strategy.

**How to apply:** Keep Recruiting data, pages, queues, SLAs, and War Room projections in a separate namespace. Create exactly one manager task at the Application Received → Manager Review transition, guarded by a transaction and unique key. Create the existing Onboarding case only through an idempotent handoff after a RecruitingCase reaches Hired/Transferred to Onboarding; adapter interfaces may simulate provider outcomes until integrations are connected.