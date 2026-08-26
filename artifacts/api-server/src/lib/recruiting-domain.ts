/**
 * Pure Recruiting domain foundation.
 *
 * This module deliberately has no database, Express, onboarding, or integration
 * dependencies. Persistence layers must apply a returned transition plan in one
 * transaction and enforce its idempotency key with a unique constraint.
 */

export const RECRUITING_STAGES = [
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

export type RecruitingStage = (typeof RECRUITING_STAGES)[number];

export const CLOSED_LOST_REASONS = [
  "qualification_not_met",
  "clearinghouse_issue",
  "drug_test_issue",
  "compliance_document_issue",
  "contract_declined",
  "compensation_or_role_mismatch",
  "withdrew",
  "no_response",
  "duplicate_or_merged",
  "other",
] as const;

export type ClosedLostReason = (typeof CLOSED_LOST_REASONS)[number];
export type RecruitingSlaColor = "green" | "yellow" | "red";

export interface RecruitingCase {
  id: string;
  workspaceId: string;
  driverId: string;
  caseOwnerId: string | null;
  taskOwnerId: string | null;
  stage: RecruitingStage;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  version: number;
  followUpDueAt?: Date;
  resumeStage?: RecruitingStage;
  closedLostReason?: ClosedLostReason;
  closedLostNote?: string;
}

export interface RecruitingTransitionOptions {
  nextAction?: string | null;
  nextActionDueAt?: Date | null;
  managerId?: string;
  managerDecision?: "approve" | "return";
  followUpDueAt?: Date;
  resumeStage?: RecruitingStage;
  closedLostReason?: ClosedLostReason;
  closedLostNote?: string;
  appliedIdempotencyKeys?: ReadonlySet<string>;
}

export type RecruitingTransitionEffectKind = "manager_review_task" | "stage_transition";

export interface RecruitingTransitionEffect {
  kind: RecruitingTransitionEffectKind;
  idempotencyKey: string;
}

export interface RecruitingTransitionResult {
  case: RecruitingCase;
  effects: RecruitingTransitionEffect[];
  appliedIdempotencyKeys: ReadonlySet<string>;
  transitionIdempotencyKey: string;
}

export interface FutureFollowUpReturnOptions {
  nextAction?: string | null;
  nextActionDueAt?: Date | null;
}

interface FutureFollowUpReturnBase {
  case: RecruitingCase;
  effects: RecruitingTransitionEffect[];
  appliedIdempotencyKeys: ReadonlySet<string>;
  transitionIdempotencyKey: string | null;
}

export interface FutureFollowUpNotDueResult extends FutureFollowUpReturnBase {
  status: "not_due";
  effects: [];
  transitionIdempotencyKey: null;
}

export interface FutureFollowUpReturnedResult extends FutureFollowUpReturnBase {
  status: "returned";
  transitionIdempotencyKey: string;
}

export type FutureFollowUpReturnResult =
  | FutureFollowUpNotDueResult
  | FutureFollowUpReturnedResult;

export interface RecruitingSlaConfig {
  yellowThresholdMs: number;
}

export interface RecruitingSlaResult {
  color: RecruitingSlaColor;
  escalateToWarRoom: boolean;
  escalationReasons: Array<"overdue" | "unassigned">;
}

export interface ActiveCasePolicyInput {
  workspaceId: string;
  driverId: string;
  existingCases: readonly RecruitingCase[];
}

export interface RecruitingTransitionKeyInput {
  workspaceId: string;
  caseId: string;
  fromStage: RecruitingStage;
  toStage: RecruitingStage;
  version: number;
}

const FORWARD_TRANSITIONS: Readonly<Record<RecruitingStage, readonly RecruitingStage[]>> = {
  new_lead: ["contact_attempted"],
  contact_attempted: ["connected_prequalified"],
  connected_prequalified: ["application_sent"],
  application_sent: ["application_received"],
  application_received: ["manager_review"],
  manager_review: ["clearinghouse_pending", "application_received"],
  clearinghouse_pending: ["drug_test_scheduled"],
  drug_test_scheduled: ["drug_test_passed"],
  drug_test_passed: ["compliance_documents_pending"],
  compliance_documents_pending: ["contract_sent"],
  contract_sent: ["contract_signed"],
  contract_signed: ["ready_for_onboarding"],
  ready_for_onboarding: ["hired_transferred_to_onboarding"],
  hired_transferred_to_onboarding: [],
  future_follow_up: [],
  closed_lost: [],
};

const TERMINAL_STAGES = new Set<RecruitingStage>([
  "hired_transferred_to_onboarding",
  "closed_lost",
]);

function requiredText(field: string, value: string | null): void {
  if (!value?.trim()) throw new Error(`${field} is required for an active RecruitingCase`);
}

function requireFreshNextWork(
  current: RecruitingCase,
  input: Pick<RecruitingTransitionOptions, "nextAction" | "nextActionDueAt">,
): { nextAction: string; nextActionDueAt: Date } {
  const nextAction = input.nextAction?.trim();
  if (!nextAction) throw new Error("nextAction is required for an active-stage transition");

  const nextActionDueAt = input.nextActionDueAt;
  if (!(nextActionDueAt instanceof Date) || Number.isNaN(nextActionDueAt.getTime())) {
    throw new Error("nextActionDueAt is required for an active-stage transition");
  }

  if (
    nextAction === current.nextAction?.trim()
    || nextActionDueAt.getTime() === current.nextActionDueAt?.getTime()
  ) {
    throw new Error("nextAction and nextActionDueAt must both be new for an active-stage transition");
  }

  return { nextAction, nextActionDueAt };
}

function isClosedLostReason(value: string | undefined): value is ClosedLostReason {
  return Boolean(value && (CLOSED_LOST_REASONS as readonly string[]).includes(value));
}

function isValidResumeStage(stage: RecruitingStage | undefined): stage is RecruitingStage {
  return Boolean(stage && stage !== "future_follow_up" && !TERMINAL_STAGES.has(stage));
}

function requiresManagerDecision(
  currentStage: RecruitingStage,
  targetStage: RecruitingStage,
): "approve" | "return" | null {
  if (currentStage !== "manager_review") return null;
  if (targetStage === "clearinghouse_pending") return "approve";
  if (targetStage === "application_received") return "return";
  return null;
}

/** A case is active until it is transferred to Onboarding or closed lost. */
export function isActiveRecruitingCase(caseRecord: RecruitingCase): boolean {
  return !TERMINAL_STAGES.has(caseRecord.stage);
}

/**
 * Validates operational fields that every active RecruitingCase must carry.
 * Terminal records preserve their historical values and are not rejected.
 */
export function assertActiveCaseFields(caseRecord: RecruitingCase): void {
  if (!isActiveRecruitingCase(caseRecord)) return;
  requiredText("caseOwnerId", caseRecord.caseOwnerId);
  requiredText("taskOwnerId", caseRecord.taskOwnerId);
  requiredText("nextAction", caseRecord.nextAction);
  if (!(caseRecord.nextActionDueAt instanceof Date) || Number.isNaN(caseRecord.nextActionDueAt.getTime())) {
    throw new Error("nextActionDueAt is required for an active RecruitingCase");
  }

  if (caseRecord.stage === "future_follow_up") {
    if (!(caseRecord.followUpDueAt instanceof Date) || Number.isNaN(caseRecord.followUpDueAt.getTime())) {
      throw new Error("followUpDueAt is required for Future Follow-up");
    }
    if (!isValidResumeStage(caseRecord.resumeStage)) {
      throw new Error("resumeStage is required for Future Follow-up");
    }
  }
}

/** Enforces the one-active-case-per-driver/workspace policy before creation. */
export function assertCanCreateRecruitingCase(input: ActiveCasePolicyInput): void {
  const existingActiveCase = input.existingCases.find(caseRecord =>
    caseRecord.workspaceId === input.workspaceId
    && caseRecord.driverId === input.driverId
    && isActiveRecruitingCase(caseRecord),
  );

  if (existingActiveCase) {
    throw new Error("Driver already has an active RecruitingCase in this workspace");
  }
}

/**
 * A stable logical transition key. Repositories must create a unique constraint
 * over this value and persist the transition plus any generated task together.
 */
export function makeRecruitingTransitionIdempotencyKey(
  input: RecruitingTransitionKeyInput,
): string {
  return [
    "recruiting-transition",
    input.workspaceId,
    input.caseId,
    `v${input.version}`,
    input.fromStage,
    input.toStage,
  ].join(":");
}

/** A transition correlation key may produce several independently persisted effects. */
export function makeRecruitingEffectIdempotencyKey(
  transitionIdempotencyKey: string,
  effectKind: RecruitingTransitionEffectKind,
): string {
  return `${transitionIdempotencyKey}:${effectKind}`;
}

function assertTransitionAllowed(currentStage: RecruitingStage, targetStage: RecruitingStage): void {
  if (currentStage === "future_follow_up") {
    throw new Error("Transition from Future Follow-up is not allowed; use its due-date return");
  }

  if (targetStage === "future_follow_up" || targetStage === "closed_lost") {
    if (TERMINAL_STAGES.has(currentStage)) {
      throw new Error(`Transition from terminal stage ${currentStage} is not allowed`);
    }
    return;
  }

  if (!FORWARD_TRANSITIONS[currentStage].includes(targetStage)) {
    throw new Error(`Transition ${currentStage} → ${targetStage} is not allowed`);
  }
}

/**
 * Plans one state transition with no side effects. The caller persists the
 * returned case, effects, and idempotency key atomically.
 */
export function applyRecruitingTransition(
  current: RecruitingCase,
  targetStage: RecruitingStage,
  options: RecruitingTransitionOptions = {},
): RecruitingTransitionResult {
  // Validate the current active record before any target can bypass its invariants.
  assertActiveCaseFields(current);

  const key = makeRecruitingTransitionIdempotencyKey({
    workspaceId: current.workspaceId,
    caseId: current.id,
    fromStage: current.stage,
    toStage: targetStage,
    version: current.version,
  });
  const appliedKeys = options.appliedIdempotencyKeys ?? new Set<string>();

  if (appliedKeys.has(key)) {
    return {
      case: current,
      effects: [],
      appliedIdempotencyKeys: appliedKeys,
      transitionIdempotencyKey: key,
    };
  }

  assertTransitionAllowed(current.stage, targetStage);

  const isActiveTarget = !TERMINAL_STAGES.has(targetStage);
  const nextWork = isActiveTarget ? requireFreshNextWork(current, options) : null;
  const nextCase: RecruitingCase = {
    ...current,
    stage: targetStage,
    version: current.version + 1,
    ...(nextWork ?? {}),
  };
  const effects: RecruitingTransitionEffect[] = [{
    kind: "stage_transition",
    idempotencyKey: makeRecruitingEffectIdempotencyKey(key, "stage_transition"),
  }];

  if (targetStage === "future_follow_up") {
    if (!(options.followUpDueAt instanceof Date) || Number.isNaN(options.followUpDueAt.getTime())) {
      throw new Error("followUpDueAt is required for Future Follow-up");
    }
    if (!isValidResumeStage(options.resumeStage)) {
      throw new Error("resumeStage is required for Future Follow-up");
    }
    nextCase.followUpDueAt = options.followUpDueAt;
    nextCase.resumeStage = options.resumeStage;
  } else {
    delete nextCase.followUpDueAt;
    delete nextCase.resumeStage;
  }

  if (targetStage === "closed_lost") {
    if (!isClosedLostReason(options.closedLostReason)) {
      throw new Error("closedLostReason is required for closed-lost");
    }
    nextCase.closedLostReason = options.closedLostReason;
    nextCase.closedLostNote = options.closedLostNote;
  } else {
    delete nextCase.closedLostReason;
    delete nextCase.closedLostNote;
  }

  if (current.stage === "application_received" && targetStage === "manager_review") {
    if (!options.managerId?.trim()) {
      throw new Error("managerId is required for the Manager Review handoff");
    }
    nextCase.taskOwnerId = options.managerId;
    effects.push({
      kind: "manager_review_task",
      idempotencyKey: makeRecruitingEffectIdempotencyKey(key, "manager_review_task"),
    });
  }

  const requiredDecision = requiresManagerDecision(current.stage, targetStage);
  if (requiredDecision) {
    if (options.managerDecision !== requiredDecision) {
      throw new Error(`Manager ${requiredDecision} decision is required for this transition`);
    }
    nextCase.taskOwnerId = current.caseOwnerId;
  }

  assertActiveCaseFields(nextCase);

  const nextAppliedKeys = new Set(appliedKeys);
  nextAppliedKeys.add(key);
  for (const effect of effects) nextAppliedKeys.add(effect.idempotencyKey);

  return {
    case: nextCase,
    effects,
    appliedIdempotencyKeys: nextAppliedKeys,
    transitionIdempotencyKey: key,
  };
}

/**
 * Returns a future-follow-up case to the stored active stage once it is due.
 * No scheduler is embedded here; callers can invoke this from a job or catch-up
 * read path and persist the result transactionally.
 */
export function returnFromFutureFollowUp(
  current: RecruitingCase,
  now: Date,
  options: FutureFollowUpReturnOptions = {},
): FutureFollowUpReturnResult {
  if (current.stage !== "future_follow_up") {
    throw new Error("Only Future Follow-up cases can be returned");
  }
  assertActiveCaseFields(current);

  if ((current.followUpDueAt as Date).getTime() > now.getTime()) {
    return {
      status: "not_due",
      case: current,
      effects: [],
      appliedIdempotencyKeys: new Set(),
      transitionIdempotencyKey: null,
    };
  }

  const resumeStage = current.resumeStage as RecruitingStage;
  const nextWork = requireFreshNextWork(current, options);
  const nextCase: RecruitingCase = {
    ...current,
    stage: resumeStage,
    version: current.version + 1,
    ...nextWork,
  };
  delete nextCase.followUpDueAt;
  delete nextCase.resumeStage;
  assertActiveCaseFields(nextCase);

  const key = makeRecruitingTransitionIdempotencyKey({
    workspaceId: current.workspaceId,
    caseId: current.id,
    fromStage: current.stage,
    toStage: resumeStage,
    version: current.version,
  });

  return {
    status: "returned",
    case: nextCase,
    effects: [{
      kind: "stage_transition",
      idempotencyKey: makeRecruitingEffectIdempotencyKey(key, "stage_transition"),
    }],
    appliedIdempotencyKeys: new Set([
      key,
      makeRecruitingEffectIdempotencyKey(key, "stage_transition"),
    ]),
    transitionIdempotencyKey: key,
  };
}

/** Computes configurable Recruiting SLA and manager escalation independently. */
export function getRecruitingSla(input: {
  dueAt: Date;
  now: Date;
  config: RecruitingSlaConfig;
  assigned: boolean;
}): RecruitingSlaResult {
  if (input.config.yellowThresholdMs < 0) {
    throw new Error("yellowThresholdMs must not be negative");
  }

  const remainingMs = input.dueAt.getTime() - input.now.getTime();
  const color: RecruitingSlaColor =
    remainingMs < 0 ? "red"
      : remainingMs <= input.config.yellowThresholdMs ? "yellow"
        : "green";
  const escalationReasons: Array<"overdue" | "unassigned"> = [];
  if (color === "red") escalationReasons.push("overdue");
  if (!input.assigned) escalationReasons.push("unassigned");

  return {
    color,
    escalateToWarRoom: escalationReasons.length > 0,
    escalationReasons,
  };
}