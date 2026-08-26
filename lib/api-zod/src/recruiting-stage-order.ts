/**
 * Canonical Recruiting sequence used by every progress visualization and
 * server-side progress ordering. Keep this aligned with the OpenAPI
 * RecruitingStage enum.
 */
export const RECRUITING_STAGE_ORDER = [
  "new_lead",
  "contact_attempted",
  "connected_prequalified",
  "application_sent",
  "application_received",
  "manager_review",
  "clearinghouse_pending",
  "drug_test_scheduled",
  "drug_test_passed",
  "compliance_documents_pending",
  "contract_sent",
  "contract_signed",
  "ready_for_onboarding",
  "hired_transferred_to_onboarding",
  "future_follow_up",
  "closed_lost",
] as const;

export type RecruitingProgressStage = (typeof RECRUITING_STAGE_ORDER)[number];