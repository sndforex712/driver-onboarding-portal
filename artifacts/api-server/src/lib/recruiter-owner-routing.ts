import type { RecruitingStage } from "./recruiting-domain";

export const EARLY_RECRUITING_STAGES = [
  "new_lead",
  "contact_attempted",
  "connected_prequalified",
  "application_sent",
  "application_received",
  "manager_review",
  "clearinghouse_pending",
  "drug_test_scheduled",
  "drug_test_passed",
] as const satisfies readonly RecruitingStage[];

export const LATER_RECRUITING_STAGES = [
  "compliance_documents_pending",
  "contract_sent",
  "contract_signed",
  "ready_for_onboarding",
] as const satisfies readonly RecruitingStage[];

const EARLY_STAGES = new Set<string>(EARLY_RECRUITING_STAGES);
const LATER_STAGES = new Set<string>(LATER_RECRUITING_STAGES);

export interface RecruiterRoutingOwners {
  masonId: number;
  wayneId: number;
  hardyId: number;
}

export interface RecruiterRoutingCase {
  id: number;
  stage: RecruitingStage;
  lifecycle: string;
  caseOwnerId: number;
  taskOwnerId: number | null;
}

export type RecruiterRoutingGroup = "early" | "later" | "excluded";

export interface RecruiterRoutingAssignment {
  caseId: number;
  stage: RecruitingStage;
  group: RecruiterRoutingGroup;
  currentOwnerId: number;
  proposedOwnerId: number;
  taskOwnerId: number | null;
}

export interface RecruiterRoutingPreview {
  assignments: RecruiterRoutingAssignment[];
  stageCounts: Record<string, number>;
  changed: number;
  skipped: number;
  excluded: number;
  /** Cases whose current Case Owner is outside policy; informational only. */
  currentOutOfPolicy: number;
  /** Proposed assignments outside policy. This must always be zero. */
  outOfPolicy: number;
  managerReviewTaskOwnerChanges: number;
  proposedTotals: { mason: number; wayne: number; hardy: number };
  masonWayneDifference: number;
}

export function getRecruiterRoutingGroup(stage: RecruitingStage): RecruiterRoutingGroup {
  if (EARLY_STAGES.has(stage)) return "early";
  if (LATER_STAGES.has(stage)) return "later";
  return "excluded";
}

function isEarlyOwner(ownerId: number, owners: RecruiterRoutingOwners): boolean {
  return ownerId === owners.masonId || ownerId === owners.wayneId;
}

function countEarlyOwners(
  cases: readonly RecruiterRoutingCase[],
  owners: RecruiterRoutingOwners,
): { mason: number; wayne: number } {
  return cases.reduce((counts, item) => {
    if (getRecruiterRoutingGroup(item.stage) !== "early") return counts;
    if (item.caseOwnerId === owners.masonId) counts.mason += 1;
    if (item.caseOwnerId === owners.wayneId) counts.wayne += 1;
    return counts;
  }, { mason: 0, wayne: 0 });
}

/**
 * Resolves a live create/transition owner. It intentionally returns only a Case
 * Owner; Task Owner is a separate domain responsibility.
 */
export function routeRecruitingCaseOwner(
  targetStage: RecruitingStage,
  currentOwnerId: number,
  activeCases: readonly RecruiterRoutingCase[],
  owners: RecruiterRoutingOwners,
): number {
  const group = getRecruiterRoutingGroup(targetStage);
  if (group === "later") return owners.hardyId;
  if (group === "excluded") return currentOwnerId;
  if (isEarlyOwner(currentOwnerId, owners)) return currentOwnerId;

  const counts = countEarlyOwners(activeCases, owners);
  return counts.mason <= counts.wayne ? owners.masonId : owners.wayneId;
}

/**
 * Plans the approved one-time rebalance. Stable case-ID order assigns Mason on
 * ties, producing an exact whole-set split (difference <= 1) with repeatable
 * output. The plan never proposes a Task Owner change.
 */
export function buildRecruiterRoutingPreview(
  cases: readonly RecruiterRoutingCase[],
  owners: RecruiterRoutingOwners,
): RecruiterRoutingPreview {
  const orderedCases = [...cases].sort((left, right) => left.id - right.id);
  const stageCounts: Record<string, number> = {};
  let earlyIndex = 0;
  let changed = 0;
  let excluded = 0;
  let currentOutOfPolicy = 0;
  const assignments = orderedCases.map((item) => {
    const group = getRecruiterRoutingGroup(item.stage);
    stageCounts[item.stage] = (stageCounts[item.stage] ?? 0) + 1;

    const proposedOwnerId = group === "early"
      ? (earlyIndex++ % 2 === 0 ? owners.masonId : owners.wayneId)
      : group === "later"
        ? owners.hardyId
        : item.caseOwnerId;

    if (group === "excluded") excluded += 1;
    if (
      (group === "early" && !isEarlyOwner(item.caseOwnerId, owners))
      || (group === "later" && item.caseOwnerId !== owners.hardyId)
    ) {
      currentOutOfPolicy += 1;
    }
    if (item.caseOwnerId !== proposedOwnerId) changed += 1;

    return {
      caseId: item.id,
      stage: item.stage,
      group,
      currentOwnerId: item.caseOwnerId,
      proposedOwnerId,
      taskOwnerId: item.taskOwnerId,
    };
  });

  const proposedTotals = assignments.reduce((totals, assignment) => {
    if (assignment.group === "early" && assignment.proposedOwnerId === owners.masonId) totals.mason += 1;
    if (assignment.group === "early" && assignment.proposedOwnerId === owners.wayneId) totals.wayne += 1;
    if (assignment.group === "later" && assignment.proposedOwnerId === owners.hardyId) totals.hardy += 1;
    return totals;
  }, { mason: 0, wayne: 0, hardy: 0 });

  return {
    assignments,
    stageCounts,
    changed,
    skipped: assignments.length - changed,
    excluded,
    currentOutOfPolicy,
    outOfPolicy: assignments.filter(assignment =>
      (assignment.group === "early" && !isEarlyOwner(assignment.proposedOwnerId, owners))
      || (assignment.group === "later" && assignment.proposedOwnerId !== owners.hardyId),
    ).length,
    managerReviewTaskOwnerChanges: 0,
    proposedTotals,
    masonWayneDifference: Math.abs(proposedTotals.mason - proposedTotals.wayne),
  };
}