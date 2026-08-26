---
name: Checklist Gate System
description: Unified 11-step Franklin workflow and the naming mismatch between TS objects and DB column
---

# Checklist Gate System

## Key naming mismatch
- In `artifacts/api-server/src/lib/checklist-gates.ts`, each gate entry has a `gateCategory` property
- In the `template_steps` DB table (schema: `lib/db/src/schema/workflow_templates.ts`), the column is `category`
- When inserting into `template_steps`, you MUST map `s.gateCategory → category`. The seed's `mapToStep()` helper does this.

**Why:** The mismatch caused a null-constraint error on first seed run. Easy to regress.

## Operational workflow
- Both driver types use one ordered mandatory sequence: Application, Clearinghouse, Drug Test Scheduled, Medical Card, Drug Test Completed, Annual Inspection, Contract, Tag, Form 2290, Registration, Plate Number.
- Steps 1–6 are specialist operations; Steps 7–11 are manager operations.
- Checklist mutations must enforce canonical order. A later step cannot pass while an earlier operational step remains incomplete.

## How to apply
- `getMandatoryGatesForDriver(driverType)` → array of gateKeys that must be `passed` before ready-for-dispatch
- `getChecklistTemplateForDriver(driverType)` → full ordered list for both seeding checklist_items and template_steps
