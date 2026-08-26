---
name: Role System
description: Six workspace roles with their capability sets; migration from old role names
---

## Roles (current)
| Role | Key capabilities |
|---|---|
| `owner_admin` | All capabilities including `manage_settings` |
| `manager` | Everything except `manage_settings` (no workspace/membership control) |
| `onboarding_specialist` | Full onboarding workflow; no settings |
| `recruiter` | `view_drivers` + `simulate_hired` only |
| `compliance_reviewer` | `view_drivers` + `manage_documents` + `manage_checklists` |
| `dispatcher_readonly` | `view_drivers` + `ready_for_dispatch` + `datatruck_sync` |

## Old → new name map (migration applied in ensureWorkspaceData)
- `admin` → `owner_admin`
- `recruiter_readonly` → `recruiter`
- `compliance` → `compliance_reviewer`
- `dispatch` → `dispatcher_readonly`

## Demo users (seed)
- Alex Martinez — `owner_admin` (current session by default)
- Jordan Kim — `manager` (added in ensureWorkspaceData if absent)
- Sarah Chen — `onboarding_specialist`
- Marcus Williams — `recruiter`
- Diana Patel — `compliance_reviewer`
- James Rivera — `dispatcher_readonly`

## Source of truth
`artifacts/api-server/src/lib/role-guard.ts` — `ROLE_CAPABILITIES` record.
Frontend mirror: `artifacts/franklins-onboarding/src/lib/permissions.ts` — client-side UI gates only; server enforces independently.
