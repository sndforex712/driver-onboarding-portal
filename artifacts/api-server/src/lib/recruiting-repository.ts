import type {
  driversTable,
  franklinLeadIngestsTable,
  leadsTable,
  onboardingCasesTable,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  recruitingOnboardingTransfersTable,
  recruitingTransitionEffectsTable,
  workspaceMembershipsTable,
  workspacesTable,
} from "@workspace/db";
import {
  applyRecruitingTransition,
  assertActiveCaseFields,
  returnFromFutureFollowUp,
  type FutureFollowUpReturnResult,
  type RecruitingCase as DomainRecruitingCase,
  type RecruitingStage,
  type RecruitingTransitionEffectKind,
  type RecruitingTransitionOptions,
} from "./recruiting-domain";
import {
  buildRecruiterRoutingPreview,
  type RecruiterRoutingOwners,
  type RecruiterRoutingPreview,
} from "./recruiter-owner-routing";
import {
  hasImportedLegacyProfiles,
  withOperationalVisibilityFilters,
  type OperationalVisibilityQuery,
} from "./recruiting-operational-visibility";

export interface RecruitingWorkspaceContext {
  workspaceId: number;
  userId: number;
  workspaceRole?: "owner_admin" | "manager" | "recruiter" | "onboarding_specialist" | "compliance_reviewer" | "dispatcher_readonly";
}

export interface RecruitingCaseRecord {
  id: number;
  workspaceId: number;
  driverId: number | null;
  leadId: number;
  caseNumber: string;
  sourceId: string | null;
  stage: RecruitingStage;
  lifecycle: string;
  caseOwnerId: number;
  taskOwnerId: number | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  slaDeadlineAt: Date | null;
  followUpDueAt: Date | null;
  resumeStage: RecruitingStage | null;
  closedLostReason: string | null;
  closedLostNote: string | null;
  version: number;
  transferStatus: string;
  transferRequestedAt: Date | null;
  transferredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecruitingCaseEventRecord {
  id: number;
  workspaceId: number;
  recruitingCaseId: number;
  transitionIdempotencyKey: string;
  eventType: string;
  fromStage: RecruitingStage | null;
  toStage: RecruitingStage;
  actorUserId: number;
  caseVersion: number;
  requestFingerprint: string;
  resultCase: RecruitingCaseRecord;
  effects: RecruitingEffectRecord[];
}

export interface RecruitingEffectRecord {
  id: number;
  workspaceId: number;
  recruitingCaseId: number;
  transitionIdempotencyKey: string;
  effectKind: RecruitingTransitionEffectKind;
  effectIdempotencyKey: string;
  status: string;
}

export interface RecruitingOnboardingTransferRecord {
  id: number;
  workspaceId: number;
  recruitingCaseId: number;
  transferIdempotencyKey: string;
  status: string;
  onboardingCaseId: number | null;
}

export interface RecruitingOnboardingCaseRecord {
  id: number;
  workspaceId: number;
  driverId: number;
  leadId: number | null;
  recruitingCaseId: number | null;
  externalRecruitId: string;
  recruiterName: string;
  sourceChannel: string;
  initialNotes: string | null;
  caseOwnerId: number | null;
  caseOwnerName: string | null;
  status: string;
}

interface WorkspaceRecord {
  id: number;
}

interface MembershipRecord {
  workspaceId: number;
  userId: number;
  role: string;
}

interface DriverRecord {
  id: number;
  workspaceId: number | null;
  leadId: number | null;
}

interface LeadRecord {
  id: number;
  workspaceId: number | null;
  fullName?: string;
  phoneNormalized?: string | null;
  recruiterName?: string;
  sourceChannel?: string;
}

interface NewRecruitingCase {
  workspaceId: number;
  driverId: number;
  leadId: number;
  caseNumber: string;
  sourceId: string | null;
  stage: RecruitingStage;
  lifecycle: "active";
  caseOwnerId: number;
  taskOwnerId: number;
  nextAction: string;
  nextActionDueAt: Date;
  slaDeadlineAt: Date;
  followUpDueAt: Date | null;
  resumeStage: RecruitingStage | null;
  closedLostReason: string | null;
  closedLostNote: string | null;
  version: number;
  transferStatus: "not_requested";
  transferRequestedAt: null;
  transferredAt: null;
}

interface CaseUpdate {
  driverId?: number | null;
  caseOwnerId?: number;
  stage?: RecruitingStage;
  lifecycle?: string;
  taskOwnerId?: number | null;
  nextAction?: string | null;
  nextActionDueAt?: Date | null;
  followUpDueAt?: Date | null;
  resumeStage?: RecruitingStage | null;
  closedLostReason?: string | null;
  closedLostNote?: string | null;
  transferStatus?: string;
  transferRequestedAt?: Date | null;
  transferredAt?: Date | null;
}

interface NewDriver {
  workspaceId: number;
  leadId: number;
  fullName: string;
  phone: string | null;
  driverType: "owner_operator" | "company_driver";
  recruiterName: string;
  sourceChannel: string;
  externalRecruitId: string;
  assigneeId: number | null;
}

interface NewEvent {
  workspaceId: number;
  recruitingCaseId: number;
  transitionIdempotencyKey: string;
  eventType: string;
  fromStage: RecruitingStage | null;
  toStage: RecruitingStage;
  actorUserId: number;
  caseVersion: number;
  requestFingerprint: string;
  resultCase: RecruitingCaseRecord;
  effects: RecruitingEffectRecord[];
}

interface NewEffect {
  workspaceId: number;
  recruitingCaseId: number;
  transitionIdempotencyKey: string;
  effectKind: RecruitingTransitionEffectKind;
  effectIdempotencyKey: string;
  status: "planned";
}

interface NewTransfer {
  workspaceId: number;
  recruitingCaseId: number;
  transferIdempotencyKey: string;
  status: "pending";
  onboardingCaseId: number | null;
}

interface NewOnboardingCase {
  workspaceId: number;
  driverId: number;
  leadId: number;
  recruitingCaseId: number;
  externalRecruitId: string;
  recruiterName: string;
  sourceChannel: string;
  initialNotes: string | null;
  caseOwnerId: number;
  caseOwnerName: string | null;
}

export interface RecruitingTransaction {
  findWorkspace(id: number): Promise<WorkspaceRecord | null>;
  findMembership(workspaceId: number, userId: number): Promise<MembershipRecord | null>;
  findRecruiterRoutingOwners(workspaceId: number): Promise<RecruiterRoutingOwners | null>;
  listRecruiterRoutingCases(workspaceId: number): Promise<RecruitingCaseRecord[]>;
  findDriver(id: number): Promise<DriverRecord | null>;
  findFranklinDriverType(workspaceId: number, recruitingCaseId: number): Promise<NewDriver["driverType"] | null>;
  insertDriver(input: NewDriver): Promise<DriverRecord>;
  findLead(id: number): Promise<LeadRecord | null>;
  findCase(workspaceId: number, id: number): Promise<RecruitingCaseRecord | null>;
  findCaseBySourceId(workspaceId: number, sourceId: string): Promise<RecruitingCaseRecord | null>;
  findActiveCase(workspaceId: number, driverId: number): Promise<RecruitingCaseRecord | null>;
  updateCase(
    workspaceId: number,
    id: number,
    expectedVersion: number,
    patch: CaseUpdate,
  ): Promise<RecruitingCaseRecord | null>;
  insertCase(input: NewRecruitingCase): Promise<RecruitingCaseRecord>;
  findEventByTransitionKey(key: string): Promise<RecruitingCaseEventRecord | null>;
  listEventsByTypeAndKeyPrefix(workspaceId: number, eventType: string, keyPrefix: string): Promise<RecruitingCaseEventRecord[]>;
  insertEvent(input: NewEvent): Promise<RecruitingCaseEventRecord>;
  setEventEffects(id: number, effects: RecruitingEffectRecord[]): Promise<void>;
  insertEffects(input: NewEffect[]): Promise<RecruitingEffectRecord[]>;
  findTransferByKey(key: string): Promise<RecruitingOnboardingTransferRecord | null>;
  findTransferByCase(workspaceId: number, recruitingCaseId: number): Promise<RecruitingOnboardingTransferRecord | null>;
  insertTransfer(input: NewTransfer): Promise<RecruitingOnboardingTransferRecord>;
  completeTransfer(id: number, onboardingCaseId: number): Promise<RecruitingOnboardingTransferRecord>;
  findOnboardingById(id: number): Promise<RecruitingOnboardingCaseRecord | null>;
  findOnboardingByRecruitingCase(
    workspaceId: number,
    recruitingCaseId: number,
  ): Promise<RecruitingOnboardingCaseRecord | null>;
  linkOnboardingCase(
    workspaceId: number,
    onboardingCaseId: number,
    recruitingCaseId: number,
  ): Promise<RecruitingOnboardingCaseRecord | null>;
  insertOnboardingCase(input: NewOnboardingCase): Promise<RecruitingOnboardingCaseRecord>;
}

export interface RecruitingTransactionPort {
  transaction<T>(work: (transaction: RecruitingTransaction) => Promise<T>): Promise<T>;
}

export class RecruitingAuthorizationError extends Error {
  readonly code = "WORKSPACE_ACCESS_DENIED";

  constructor(message = "Recruiting resource is outside the authenticated workspace") {
    super(message);
    this.name = "RecruitingAuthorizationError";
  }
}

export class RecruitingConflictError extends Error {
  readonly code: "ACTIVE_CASE_EXISTS" | "STALE_CASE_VERSION" | "IDEMPOTENCY_CONFLICT" | "TRANSFER_EXISTS";

  constructor(code: "ACTIVE_CASE_EXISTS" | "STALE_CASE_VERSION" | "IDEMPOTENCY_CONFLICT" | "TRANSFER_EXISTS", message: string) {
    super(message);
    this.name = "RecruitingConflictError";
    this.code = code;
  }
}

export interface CreateRecruitingCaseInput {
  context: RecruitingWorkspaceContext;
  driverId: number;
  leadId: number;
  caseNumber: string;
  sourceId?: string | null;
  caseOwnerId: number;
  taskOwnerId: number;
  stage?: RecruitingStage;
  nextAction: string;
  nextActionDueAt: Date;
  slaDeadlineAt: Date;
  followUpDueAt?: Date | null;
  resumeStage?: RecruitingStage | null;
  closedLostReason?: string | null;
  closedLostNote?: string | null;
}

export type CreateRecruitingCaseResult =
  | { status: "created"; case: RecruitingCaseRecord }
  | { status: "duplicate"; case: RecruitingCaseRecord; conflictCode: "ACTIVE_CASE_EXISTS" };

export interface TransitionCaseInput {
  caseId: number;
  targetStage: RecruitingStage;
  expectedVersion?: number;
  transitionIdempotencyKey?: string;
  options: RecruitingTransitionOptions;
}

export type TransitionCaseResult =
  | {
      status: "committed" | "replayed";
      case: RecruitingCaseRecord;
      effects: RecruitingEffectRecord[];
      transitionIdempotencyKey: string;
    }
  | never;

export interface ReturnFutureFollowUpInput {
  caseId: number;
  expectedVersion?: number;
  now: Date;
  nextAction?: string;
  nextActionDueAt?: Date;
  transitionIdempotencyKey?: string;
}

export type FutureFollowUpRepositoryResult =
  | { status: "not_due"; case: RecruitingCaseRecord }
  | { status: "returned" | "replayed"; case: RecruitingCaseRecord; effects: RecruitingEffectRecord[]; transitionIdempotencyKey: string };

export interface TransferToOnboardingInput {
  caseId: number;
  expectedVersion?: number;
  transferIdempotencyKey: string;
  targetOnboardingCaseId?: number;
  recruiterName: string;
  sourceChannel: string;
  initialNotes?: string | null;
  caseOwnerName?: string | null;
}

export type TransferToOnboardingResult = {
  status: "completed" | "replayed";
  transfer: RecruitingOnboardingTransferRecord;
  onboardingCase: RecruitingOnboardingCaseRecord;
};

export interface RecruiterOwnerRebalanceResult {
  status: "applied" | "noop";
  preview: RecruiterRoutingPreview;
  changedCaseIds: number[];
}

export const RECRUITER_OWNER_REBALANCE_OPERATION_KEY = "recruiter-owner-routing-rebalance:v1";
export const RECRUITER_OWNER_REBALANCE_ROLLBACK_OPERATION_KEY = "recruiter-owner-routing-rebalance-rollback:v1";

export interface RecruiterOwnerRollbackPreview {
  auditEvents: number;
  exactBeforeValues: number;
  plannedRestorations: Array<{ caseId: number; previousOwnerId: number; proposedOwnerId: number }>;
  alreadyRestoredCaseIds: number[];
  unavailable: Array<{ caseId: number; reason: string }>;
  taskOwnerChanges: number;
}

export interface RecruiterOwnerRollbackResult {
  status: "rolled_back" | "noop";
  preview: RecruiterOwnerRollbackPreview;
  restoredCaseIds: number[];
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function isReplayableConflict(error: unknown): boolean {
  return isUniqueViolation(error)
    || (error instanceof RecruitingConflictError && error.code === "STALE_CASE_VERSION");
}

function lifecycleForStage(stage: RecruitingStage): string {
  if (stage === "hired_transferred_to_onboarding") return "hired_transferred";
  if (stage === "closed_lost") return "closed_lost";
  return "active";
}

function asNumericId(value: string | null, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new RecruitingAuthorizationError(`${field} is not a valid workspace member`);
  return parsed;
}

function optionalFingerprintValue(value: unknown): { present: boolean; value?: unknown } {
  return value === undefined ? { present: false } : { present: true, value };
}

function dateFingerprintValue(value: Date | null | undefined): { present: boolean; value?: string | null } {
  return value === undefined
    ? { present: false }
    : { present: true, value: value === null ? null : value.toISOString() };
}

function transitionFingerprint(input: TransitionCaseInput): string {
  return JSON.stringify({
    operation: "transition",
    caseId: input.caseId,
    expectedVersion: optionalFingerprintValue(input.expectedVersion),
    targetStage: input.targetStage,
    options: {
      managerId: optionalFingerprintValue(input.options.managerId),
      managerDecision: optionalFingerprintValue(input.options.managerDecision),
      nextAction: optionalFingerprintValue(input.options.nextAction),
      nextActionDueAt: dateFingerprintValue(input.options.nextActionDueAt),
      followUpDueAt: dateFingerprintValue(input.options.followUpDueAt),
      resumeStage: optionalFingerprintValue(input.options.resumeStage),
      closedLostReason: optionalFingerprintValue(input.options.closedLostReason),
      closedLostNote: optionalFingerprintValue(input.options.closedLostNote),
    },
  });
}

function createFingerprint(input: CreateRecruitingCaseInput): string {
  return JSON.stringify({
    operation: "case_created",
    driverId: input.driverId,
    leadId: input.leadId,
    caseNumber: input.caseNumber,
    caseOwnerId: input.caseOwnerId,
    taskOwnerId: input.taskOwnerId,
    stage: optionalFingerprintValue(input.stage),
    nextAction: input.nextAction,
    nextActionDueAt: dateFingerprintValue(input.nextActionDueAt),
    slaDeadlineAt: dateFingerprintValue(input.slaDeadlineAt),
    followUpDueAt: dateFingerprintValue(input.followUpDueAt),
    resumeStage: optionalFingerprintValue(input.resumeStage),
    closedLostReason: optionalFingerprintValue(input.closedLostReason),
    closedLostNote: optionalFingerprintValue(input.closedLostNote),
  });
}

function futureFollowUpFingerprint(input: ReturnFutureFollowUpInput): string {
  return JSON.stringify({
    operation: "future_follow_up_return",
    caseId: input.caseId,
    expectedVersion: optionalFingerprintValue(input.expectedVersion),
    nextAction: optionalFingerprintValue(input.nextAction),
    nextActionDueAt: dateFingerprintValue(input.nextActionDueAt),
  });
}

function transferFingerprint(input: TransferToOnboardingInput): string {
  return JSON.stringify({
    operation: "onboarding_transfer",
    caseId: input.caseId,
    expectedVersion: optionalFingerprintValue(input.expectedVersion),
    targetOnboardingCaseId: optionalFingerprintValue(input.targetOnboardingCaseId),
    recruiterName: input.recruiterName,
    sourceChannel: input.sourceChannel,
    initialNotes: optionalFingerprintValue(input.initialNotes),
    caseOwnerName: optionalFingerprintValue(input.caseOwnerName),
  });
}

function assertReplayFingerprint(
  replay: RecruitingCaseEventRecord,
  eventType: string,
  fingerprint: string,
): void {
  if (replay.eventType !== eventType || replay.requestFingerprint !== fingerprint) {
    throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
  }
}

async function replayTransferOrConflict(
  transaction: RecruitingTransaction,
  context: RecruitingWorkspaceContext,
  input: TransferToOnboardingInput,
  replay: RecruitingOnboardingTransferRecord,
  replayEvent: RecruitingCaseEventRecord,
): Promise<RecruitingOnboardingCaseRecord> {
  assertReplayFingerprint(replayEvent, "onboarding_transfer", transferFingerprint(input));
  if (!replay.onboardingCaseId) throw new RecruitingConflictError("TRANSFER_EXISTS", "Transfer is still pending");
  if (input.targetOnboardingCaseId !== undefined && replay.onboardingCaseId !== input.targetOnboardingCaseId) {
    throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different OnboardingCase");
  }
  const [current, onboarding] = await Promise.all([
    transaction.findCase(context.workspaceId, input.caseId),
    transaction.findOnboardingById(replay.onboardingCaseId),
  ]);
  if (!current || !onboarding) throw new RecruitingConflictError("TRANSFER_EXISTS", "Completed transfer target is missing");
  if (
    (input.expectedVersion !== undefined && current.version !== input.expectedVersion + 2) ||
    onboarding.recruiterName !== input.recruiterName ||
    onboarding.sourceChannel !== input.sourceChannel ||
    onboarding.initialNotes !== (input.initialNotes ?? null) ||
    onboarding.caseOwnerName !== (input.caseOwnerName ?? null)
  ) {
    throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different transfer");
  }
  return onboarding;
}

function toDomainCase(record: RecruitingCaseRecord): DomainRecruitingCase {
  return {
    id: String(record.id),
    workspaceId: String(record.workspaceId),
    driverId: String(record.driverId),
    caseOwnerId: String(record.caseOwnerId),
    taskOwnerId: record.taskOwnerId === null ? null : String(record.taskOwnerId),
    stage: record.stage,
    nextAction: record.nextAction,
    nextActionDueAt: record.nextActionDueAt,
    version: record.version,
    ...(record.followUpDueAt ? { followUpDueAt: record.followUpDueAt } : {}),
    ...(record.resumeStage ? { resumeStage: record.resumeStage } : {}),
    ...(record.closedLostReason ? { closedLostReason: record.closedLostReason as DomainRecruitingCase["closedLostReason"] } : {}),
    ...(record.closedLostNote ? { closedLostNote: record.closedLostNote } : {}),
  };
}

function serializeEffects(
  workspaceId: number,
  caseId: number,
  transitionIdempotencyKey: string,
  effects: Array<{ kind: RecruitingTransitionEffectKind; idempotencyKey: string }>,
): NewEffect[] {
  return effects.map(effect => ({
    workspaceId,
    recruitingCaseId: caseId,
    transitionIdempotencyKey,
    effectKind: effect.kind,
    effectIdempotencyKey: effect.idempotencyKey,
    status: "planned",
  }));
}

export class RecruitingRepository {
  private readonly store: RecruitingTransactionPort;

  constructor(store: RecruitingTransactionPort) {
    this.store = store;
  }

  async createCase(input: CreateRecruitingCaseInput): Promise<CreateRecruitingCaseResult> {
    const requestFingerprint = createFingerprint(input);
    const work = async (transaction: RecruitingTransaction): Promise<CreateRecruitingCaseResult> => {
      await this.assertContext(transaction, input.context);
      await this.assertWorkspaceIdentity(transaction, input.context.workspaceId, input.driverId, input.leadId);

      if (input.sourceId) {
        const replayCase = await transaction.findCaseBySourceId(input.context.workspaceId, input.sourceId);
        if (replayCase) {
          const replayEvent = await transaction.findEventByTransitionKey(input.sourceId);
          if (!replayEvent || replayEvent.recruitingCaseId !== replayCase.id) {
            throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Recruiting case idempotency ledger is missing");
          }
          assertReplayFingerprint(replayEvent, "case_created", requestFingerprint);
          return { status: "duplicate", case: replayEvent.resultCase, conflictCode: "ACTIVE_CASE_EXISTS" };
        }
      }
      const duplicate = await transaction.findActiveCase(input.context.workspaceId, input.driverId);
      if (duplicate) {
        return { status: "duplicate", case: duplicate, conflictCode: "ACTIVE_CASE_EXISTS" };
      }

      const stage = input.stage ?? "new_lead";
      // Case Owner changes are paused until a corrected-scope rebalance is
      // explicitly approved. Creation preserves the submitted owner.
      const routedCaseOwnerId = input.caseOwnerId;
      await this.assertMemberships(transaction, input.context.workspaceId, routedCaseOwnerId, input.taskOwnerId);
      const record = await transaction.insertCase({
        workspaceId: input.context.workspaceId,
        driverId: input.driverId,
        leadId: input.leadId,
        caseNumber: input.caseNumber,
        sourceId: input.sourceId ?? null,
        stage,
        lifecycle: "active",
        caseOwnerId: routedCaseOwnerId,
        taskOwnerId: input.taskOwnerId,
        nextAction: input.nextAction,
        nextActionDueAt: input.nextActionDueAt,
        slaDeadlineAt: input.slaDeadlineAt,
        followUpDueAt: input.followUpDueAt ?? null,
        resumeStage: input.resumeStage ?? null,
        closedLostReason: input.closedLostReason ?? null,
        closedLostNote: input.closedLostNote ?? null,
        version: 1,
        transferStatus: "not_requested",
        transferRequestedAt: null,
        transferredAt: null,
      });
      assertActiveCaseFields(toDomainCase(record));
      if (input.sourceId) {
        await transaction.insertEvent({
          workspaceId: input.context.workspaceId,
          recruitingCaseId: record.id,
          transitionIdempotencyKey: input.sourceId,
          eventType: "case_created",
          fromStage: null,
          toStage: record.stage,
          actorUserId: input.context.userId,
          caseVersion: record.version,
          requestFingerprint,
          resultCase: record,
          effects: [],
        });
      }
      return { status: "created", case: record };
    };

    try {
      return await this.store.transaction(work);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.store.transaction(async transaction => {
        const replayCase = input.sourceId
          ? await transaction.findCaseBySourceId(input.context.workspaceId, input.sourceId)
          : null;
        const replayEvent = input.sourceId
          ? await transaction.findEventByTransitionKey(input.sourceId)
          : null;
        return { replayCase, replayEvent };
      });
      if (replay.replayCase && replay.replayEvent) {
        assertReplayFingerprint(replay.replayEvent, "case_created", requestFingerprint);
        return { status: "duplicate", case: replay.replayEvent.resultCase, conflictCode: "ACTIVE_CASE_EXISTS" };
      }
      const duplicate = await this.store.transaction(transaction => transaction.findActiveCase(input.context.workspaceId, input.driverId));
      if (duplicate) return { status: "duplicate", case: duplicate, conflictCode: "ACTIVE_CASE_EXISTS" };
      throw new RecruitingConflictError(
        "IDEMPOTENCY_CONFLICT",
        "Recruiting case source or idempotency key belongs to another case",
      );
    }
  }

  async transitionCase(
    context: RecruitingWorkspaceContext,
    input: TransitionCaseInput,
  ): Promise<TransitionCaseResult> {
    let attemptedTransitionIdempotencyKey = input.transitionIdempotencyKey;
    const requestFingerprint = transitionFingerprint(input);
    const work = async (transaction: RecruitingTransaction): Promise<TransitionCaseResult> => {
      await this.assertContext(transaction, context);

      if (input.transitionIdempotencyKey) {
        const replay = await transaction.findEventByTransitionKey(input.transitionIdempotencyKey);
        if (replay) {
          this.assertSameWorkspace(context.workspaceId, replay.workspaceId);
          if (replay.recruitingCaseId !== input.caseId) {
            throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transition idempotency key belongs to another RecruitingCase");
          }
          assertReplayFingerprint(replay, "stage_transition", requestFingerprint);
          return {
            status: "replayed",
            case: replay.resultCase,
            effects: replay.effects,
            transitionIdempotencyKey: replay.transitionIdempotencyKey,
          };
        }
      }

      const current = await transaction.findCase(context.workspaceId, input.caseId);
      if (!current) throw new RecruitingAuthorizationError("Recruiting case is outside the authenticated workspace");
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case version is stale");
      }
      if (input.options.managerId) {
        const managerId = asNumericId(input.options.managerId, "managerId");
        await this.assertManagerReviewAssignee(transaction, context.workspaceId, managerId);
      }
      if (
        current.stage === "manager_review" &&
        input.options.managerDecision &&
        context.userId !== current.taskOwnerId &&
        context.workspaceRole !== "owner_admin"
      ) {
        throw new RecruitingAuthorizationError("Only the assigned manager or a workspace owner can decide this Manager Review");
      }

      const plan = applyRecruitingTransition(
        toDomainCase(current),
        input.targetStage,
        input.options,
      );
      const transitionIdempotencyKey = input.transitionIdempotencyKey ?? plan.transitionIdempotencyKey;
      attemptedTransitionIdempotencyKey = transitionIdempotencyKey;
      // Case Owner changes are paused until a corrected-scope rebalance is
      // explicitly approved. Stage transitions preserve the planned owner.
      const routedCaseOwnerId = asNumericId(plan.case.caseOwnerId, "caseOwnerId");

      const next = await transaction.updateCase(
        context.workspaceId,
        input.caseId,
        current.version,
        {
          caseOwnerId: routedCaseOwnerId,
          stage: plan.case.stage,
          lifecycle: lifecycleForStage(plan.case.stage),
          taskOwnerId: plan.case.taskOwnerId === null ? null : asNumericId(plan.case.taskOwnerId, "taskOwnerId"),
          nextAction: plan.case.nextAction,
          nextActionDueAt: plan.case.nextActionDueAt,
          followUpDueAt: plan.case.followUpDueAt ?? null,
          resumeStage: plan.case.resumeStage ?? null,
          closedLostReason: plan.case.closedLostReason ?? null,
          closedLostNote: plan.case.closedLostNote ?? null,
        },
      );
      if (!next) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during transition");

      const effects = serializeEffects(
        context.workspaceId,
        input.caseId,
        transitionIdempotencyKey,
        plan.effects,
      );
      const event = await transaction.insertEvent({
        workspaceId: context.workspaceId,
        recruitingCaseId: input.caseId,
        transitionIdempotencyKey,
        eventType: "stage_transition",
        fromStage: current.stage,
        toStage: plan.case.stage,
        actorUserId: context.userId,
        caseVersion: next.version,
        requestFingerprint,
        resultCase: next,
        effects: [],
      });
      const persistedEffects = await transaction.insertEffects(effects);
      await transaction.setEventEffects(event.id, persistedEffects);
      return {
        status: "committed",
        case: next,
        effects: persistedEffects,
        transitionIdempotencyKey,
      };
    };

    try {
      return await this.store.transaction(work);
    } catch (error) {
      if (!isReplayableConflict(error) || !attemptedTransitionIdempotencyKey) throw error;
      const replay = await this.store.transaction(async transaction => {
        await this.assertContext(transaction, context);
        return transaction.findEventByTransitionKey(attemptedTransitionIdempotencyKey!);
      });
      if (!replay) throw error;
      this.assertSameWorkspace(context.workspaceId, replay.workspaceId);
      if (replay.recruitingCaseId !== input.caseId) {
        throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transition idempotency key belongs to another RecruitingCase");
      }
      assertReplayFingerprint(replay, "stage_transition", requestFingerprint);
      return {
        status: "replayed",
        case: replay.resultCase,
        effects: replay.effects,
        transitionIdempotencyKey: replay.transitionIdempotencyKey,
      };
    }
  }

  async returnFromFutureFollowUp(
    context: RecruitingWorkspaceContext,
    input: ReturnFutureFollowUpInput,
  ): Promise<FutureFollowUpRepositoryResult> {
    let attemptedTransitionIdempotencyKey = input.transitionIdempotencyKey;
    const requestFingerprint = futureFollowUpFingerprint(input);
    const work = async (transaction: RecruitingTransaction): Promise<FutureFollowUpRepositoryResult> => {
      await this.assertContext(transaction, context);
      if (input.transitionIdempotencyKey) {
        const replay = await transaction.findEventByTransitionKey(input.transitionIdempotencyKey);
        if (replay) {
          this.assertSameWorkspace(context.workspaceId, replay.workspaceId);
          if (replay.recruitingCaseId !== input.caseId) {
            throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Future Follow-up idempotency key belongs to another RecruitingCase");
          }
          assertReplayFingerprint(replay, "future_follow_up_return", requestFingerprint);
          return {
            status: "replayed",
            case: replay.resultCase,
            effects: replay.effects,
            transitionIdempotencyKey: replay.transitionIdempotencyKey,
          };
        }
      }

      const current = await transaction.findCase(context.workspaceId, input.caseId);
      if (!current) throw new RecruitingAuthorizationError("Recruiting case is outside the authenticated workspace");
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case version is stale");
      }

      const result = returnFromFutureFollowUp(toDomainCase(current), input.now, {
        nextAction: input.nextAction,
        nextActionDueAt: input.nextActionDueAt,
      });
      if (result.status === "not_due") return { status: "not_due", case: current };
      const transitionIdempotencyKey = input.transitionIdempotencyKey ?? result.transitionIdempotencyKey;
      attemptedTransitionIdempotencyKey = transitionIdempotencyKey;

      const next = await transaction.updateCase(
        context.workspaceId,
        input.caseId,
        current.version,
        {
          // Future Follow-up is deliberately excluded from owner routing. On
          // return, retain the recruiter who owned the paused case.
          caseOwnerId: asNumericId(result.case.caseOwnerId, "caseOwnerId"),
          stage: result.case.stage,
          lifecycle: lifecycleForStage(result.case.stage),
          taskOwnerId: result.case.taskOwnerId === null ? null : asNumericId(result.case.taskOwnerId, "taskOwnerId"),
          nextAction: result.case.nextAction,
          nextActionDueAt: result.case.nextActionDueAt,
          followUpDueAt: null,
          resumeStage: null,
        },
      );
      if (!next) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during Future Follow-up return");

      const effects = serializeEffects(
        context.workspaceId,
        input.caseId,
        transitionIdempotencyKey,
        result.effects,
      );
      const event = await transaction.insertEvent({
        workspaceId: context.workspaceId,
        recruitingCaseId: input.caseId,
        transitionIdempotencyKey,
        eventType: "future_follow_up_return",
        fromStage: current.stage,
        toStage: result.case.stage,
        actorUserId: context.userId,
        caseVersion: next.version,
        requestFingerprint,
        resultCase: next,
        effects: [],
      });
      const persistedEffects = await transaction.insertEffects(effects);
      await transaction.setEventEffects(event.id, persistedEffects);
      return {
        status: "returned",
        case: next,
        effects: persistedEffects,
        transitionIdempotencyKey,
      };
    };

    try {
      return await this.store.transaction(work);
    } catch (error) {
      if (!isReplayableConflict(error) || !attemptedTransitionIdempotencyKey) throw error;
      const replay = await this.store.transaction(async transaction => {
        await this.assertContext(transaction, context);
        return transaction.findEventByTransitionKey(attemptedTransitionIdempotencyKey!);
      });
      if (!replay) throw error;
      this.assertSameWorkspace(context.workspaceId, replay.workspaceId);
      if (replay.recruitingCaseId !== input.caseId) {
        throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Future Follow-up idempotency key belongs to another RecruitingCase");
      }
      assertReplayFingerprint(replay, "future_follow_up_return", requestFingerprint);
      return {
        status: "replayed",
        case: replay.resultCase,
        effects: replay.effects,
        transitionIdempotencyKey: replay.transitionIdempotencyKey,
      };
    }
  }

  async previewRecruiterOwnerRouting(context: RecruitingWorkspaceContext): Promise<RecruiterRoutingPreview> {
    return this.store.transaction(async transaction => {
      await this.assertContext(transaction, context);
      const owners = await transaction.findRecruiterRoutingOwners(context.workspaceId);
      if (!owners) {
        throw new RecruitingAuthorizationError("Mason, Wayne, and Hardy must be unique Recruiting members of the workspace");
      }
      return buildRecruiterRoutingPreview(
        await transaction.listRecruiterRoutingCases(context.workspaceId),
        owners,
      );
    });
  }

  async rebalanceRecruiterOwners(context: RecruitingWorkspaceContext): Promise<RecruiterOwnerRebalanceResult> {
    return this.store.transaction(async transaction => {
      await this.assertContext(transaction, context);
      const actor = await transaction.findMembership(context.workspaceId, context.userId);
      if (actor?.role !== "owner_admin") {
        throw new RecruitingAuthorizationError("Only a workspace owner can run the recruiter owner rebalance");
      }
      const owners = await transaction.findRecruiterRoutingOwners(context.workspaceId);
      if (!owners) {
        throw new RecruitingAuthorizationError("Mason, Wayne, and Hardy must be unique Recruiting members of the workspace");
      }

      const cases = await transaction.listRecruiterRoutingCases(context.workspaceId);
      const preview = buildRecruiterRoutingPreview(cases, owners);
      const casesById = new Map(cases.map(item => [item.id, item]));
      const changedCaseIds: number[] = [];

      for (const assignment of preview.assignments) {
        if (assignment.currentOwnerId === assignment.proposedOwnerId) continue;
        const current = casesById.get(assignment.caseId);
        if (!current) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case disappeared during rebalance");
        const eventKey = `${RECRUITER_OWNER_REBALANCE_OPERATION_KEY}:workspace:${context.workspaceId}:case:${current.id}`;
        const existing = await transaction.findEventByTransitionKey(eventKey);
        if (existing) {
          throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Recruiter owner rebalance was already recorded for this case");
        }

        const next = await transaction.updateCase(
          context.workspaceId,
          current.id,
          current.version,
          { caseOwnerId: assignment.proposedOwnerId },
        );
        if (!next) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during rebalance");

        await transaction.insertEvent({
          workspaceId: context.workspaceId,
          recruitingCaseId: current.id,
          transitionIdempotencyKey: eventKey,
          eventType: "recruiter_owner_rebalanced",
          fromStage: current.stage,
          toStage: current.stage,
          actorUserId: context.userId,
          caseVersion: next.version,
          requestFingerprint: JSON.stringify({
            operation: RECRUITER_OWNER_REBALANCE_OPERATION_KEY,
            previousOwnerId: current.caseOwnerId,
            proposedOwnerId: assignment.proposedOwnerId,
          }),
          resultCase: next,
          effects: [],
        });
        changedCaseIds.push(current.id);
      }

      return {
        status: changedCaseIds.length > 0 ? "applied" : "noop",
        preview,
        changedCaseIds,
      };
    });
  }

  async previewRecruiterOwnerRollback(context: RecruitingWorkspaceContext): Promise<RecruiterOwnerRollbackPreview> {
    return this.store.transaction(async transaction => {
      await this.assertOwnerAdmin(transaction, context);
      return this.buildRecruiterOwnerRollbackPreview(transaction, context);
    });
  }

  async rollbackRecruiterOwnerRebalance(context: RecruitingWorkspaceContext): Promise<RecruiterOwnerRollbackResult> {
    return this.store.transaction(async transaction => {
      await this.assertOwnerAdmin(transaction, context);
      const preview = await this.buildRecruiterOwnerRollbackPreview(transaction, context);
      if (preview.unavailable.length > 0) {
        throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Recruiter owner rollback evidence is incomplete or stale");
      }
      if (preview.plannedRestorations.length === 0) {
        return { status: "noop", preview, restoredCaseIds: [] };
      }

      const restoredCaseIds: number[] = [];
      for (const restoration of preview.plannedRestorations) {
        const current = await transaction.findCase(context.workspaceId, restoration.caseId);
        if (!current || current.caseOwnerId !== restoration.proposedOwnerId) {
          throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during owner rollback");
        }
        const rollbackKey = `${RECRUITER_OWNER_REBALANCE_ROLLBACK_OPERATION_KEY}:workspace:${context.workspaceId}:case:${current.id}`;
        if (await transaction.findEventByTransitionKey(rollbackKey)) {
          throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Recruiter owner rollback was already recorded for this case");
        }
        const next = await transaction.updateCase(
          context.workspaceId,
          current.id,
          current.version,
          { caseOwnerId: restoration.previousOwnerId },
        );
        if (!next) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during owner rollback");
        await transaction.insertEvent({
          workspaceId: context.workspaceId,
          recruitingCaseId: current.id,
          transitionIdempotencyKey: rollbackKey,
          eventType: "recruiter_owner_rebalance_rolled_back",
          fromStage: current.stage,
          toStage: current.stage,
          actorUserId: context.userId,
          caseVersion: next.version,
          requestFingerprint: JSON.stringify({
            operation: RECRUITER_OWNER_REBALANCE_ROLLBACK_OPERATION_KEY,
            originalOperation: RECRUITER_OWNER_REBALANCE_OPERATION_KEY,
            previousOwnerId: restoration.previousOwnerId,
            revertedOwnerId: restoration.proposedOwnerId,
          }),
          resultCase: next,
          effects: [],
        });
        restoredCaseIds.push(current.id);
      }
      return { status: "rolled_back", preview, restoredCaseIds };
    });
  }

  async transferToOnboarding(
    context: RecruitingWorkspaceContext,
    input: TransferToOnboardingInput,
  ): Promise<TransferToOnboardingResult> {
    const requestFingerprint = transferFingerprint(input);
    const work = async (transaction: RecruitingTransaction): Promise<TransferToOnboardingResult> => {
      await this.assertContext(transaction, context);
      const replayTransfer = await transaction.findTransferByKey(input.transferIdempotencyKey);
      if (replayTransfer) {
        this.assertSameWorkspace(context.workspaceId, replayTransfer.workspaceId);
        if (replayTransfer.recruitingCaseId !== input.caseId) {
          throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transfer idempotency key belongs to another RecruitingCase");
        }
        const replayEvent = await transaction.findEventByTransitionKey(input.transferIdempotencyKey);
        if (!replayEvent) throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transfer idempotency ledger is missing");
        const onboarding = await replayTransferOrConflict(transaction, context, input, replayTransfer, replayEvent);
        return { status: "replayed", transfer: replayTransfer, onboardingCase: onboarding };
      }
      const collidingEvent = await transaction.findEventByTransitionKey(input.transferIdempotencyKey);
      if (collidingEvent) {
        this.assertSameWorkspace(context.workspaceId, collidingEvent.workspaceId);
        throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another Recruiting operation");
      }

      const current = await transaction.findCase(context.workspaceId, input.caseId);
      if (!current) throw new RecruitingAuthorizationError("Recruiting case is outside the authenticated workspace");
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case version is stale");
      }
      if (current.stage !== "hired_transferred_to_onboarding") {
        throw new RecruitingConflictError("TRANSFER_EXISTS", "Only a hired RecruitingCase can transfer to Onboarding");
      }

      let onboarding = input.targetOnboardingCaseId
        ? await transaction.findOnboardingById(input.targetOnboardingCaseId)
        : await transaction.findOnboardingByRecruitingCase(context.workspaceId, current.id);
      if (onboarding) {
        this.assertSameWorkspace(context.workspaceId, onboarding.workspaceId);
        if (onboarding.recruitingCaseId !== null && onboarding.recruitingCaseId !== current.id) {
          throw new RecruitingConflictError("TRANSFER_EXISTS", "OnboardingCase already belongs to another RecruitingCase");
        }
      }

      let driverId = current.driverId;
      if (driverId == null) {
        if (!isFranklinIntakeSource(current.sourceId)) {
          throw new RecruitingConflictError("TRANSFER_EXISTS", "Recruiting case is missing its required driver link");
        }
        const lead = await transaction.findLead(current.leadId);
        if (!lead || lead.workspaceId !== context.workspaceId || !lead.fullName || !lead.recruiterName || !lead.sourceChannel) {
          throw new RecruitingConflictError("TRANSFER_EXISTS", "Franklin intake lead cannot be safely linked to a driver");
        }
        const driverType = await transaction.findFranklinDriverType(context.workspaceId, current.id);
        if (!driverType) {
          throw new RecruitingConflictError("TRANSFER_EXISTS", "Franklin intake ledger is missing the driver type");
        }
        driverId = (await transaction.insertDriver({
          workspaceId: context.workspaceId,
          leadId: lead.id,
          fullName: lead.fullName,
          phone: lead.phoneNormalized ?? null,
          driverType,
          recruiterName: lead.recruiterName,
          sourceChannel: lead.sourceChannel,
          externalRecruitId: `${current.sourceId}:driver`,
          assigneeId: current.taskOwnerId,
        })).id;
      }

      const pendingCase = await transaction.updateCase(
        context.workspaceId,
        current.id,
        current.version,
        {
          driverId,
          transferStatus: "pending",
          transferRequestedAt: new Date(),
          transferredAt: null,
        },
      );
      if (!pendingCase) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during transfer");

      const transfer = await transaction.insertTransfer({
        workspaceId: context.workspaceId,
        recruitingCaseId: current.id,
        transferIdempotencyKey: input.transferIdempotencyKey,
        status: "pending",
        onboardingCaseId: null,
      });

      if (!onboarding) {
        onboarding = await transaction.insertOnboardingCase({
          workspaceId: context.workspaceId,
          driverId,
          leadId: current.leadId,
          recruitingCaseId: current.id,
          externalRecruitId: current.sourceId ?? input.transferIdempotencyKey,
          recruiterName: input.recruiterName,
          sourceChannel: input.sourceChannel,
          initialNotes: input.initialNotes ?? null,
          caseOwnerId: current.caseOwnerId,
          caseOwnerName: input.caseOwnerName ?? null,
        });
      } else if (onboarding.recruitingCaseId === null) {
        const linked = await transaction.linkOnboardingCase(
          context.workspaceId,
          onboarding.id,
          current.id,
        );
        if (!linked) throw new RecruitingAuthorizationError("Target OnboardingCase is outside the authenticated workspace");
        onboarding = linked;
      }

      const completedCase = await transaction.updateCase(
        context.workspaceId,
        current.id,
        pendingCase.version,
        {
          transferStatus: "completed",
          transferredAt: new Date(),
        },
      );
      if (!completedCase) throw new RecruitingConflictError("STALE_CASE_VERSION", "Recruiting case changed during transfer completion");
      const completedTransfer = await transaction.completeTransfer(transfer.id, onboarding.id);
      await transaction.insertEvent({
        workspaceId: context.workspaceId,
        recruitingCaseId: current.id,
        transitionIdempotencyKey: input.transferIdempotencyKey,
        eventType: "onboarding_transfer",
        fromStage: current.stage,
        toStage: current.stage,
        actorUserId: context.userId,
        caseVersion: completedCase.version,
        requestFingerprint,
        resultCase: completedCase,
        effects: [],
      });
      return { status: "completed", transfer: completedTransfer, onboardingCase: onboarding };
    };

    try {
      return await this.store.transaction(work);
    } catch (error) {
      if (!isReplayableConflict(error)) throw error;
      const replay = await this.store.transaction(async transaction => {
        await this.assertContext(transaction, context);
        return transaction.findTransferByKey(input.transferIdempotencyKey);
      });
      if (!replay?.onboardingCaseId) throw error;
      this.assertSameWorkspace(context.workspaceId, replay.workspaceId);
      if (replay.recruitingCaseId !== input.caseId) {
        throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transfer idempotency key belongs to another RecruitingCase");
      }
      const onboarding = await this.store.transaction(async transaction => {
        const replayEvent = await transaction.findEventByTransitionKey(input.transferIdempotencyKey);
        if (!replayEvent) throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transfer idempotency ledger is missing");
        return replayTransferOrConflict(transaction, context, input, replay, replayEvent);
      });
      return { status: "replayed", transfer: replay, onboardingCase: onboarding };
    }
  }

  private async assertContext(transaction: RecruitingTransaction, context: RecruitingWorkspaceContext): Promise<void> {
    const workspace = await transaction.findWorkspace(context.workspaceId);
    const membership = await transaction.findMembership(context.workspaceId, context.userId);
    if (!workspace || !membership) throw new RecruitingAuthorizationError();
  }

  private async assertOwnerAdmin(transaction: RecruitingTransaction, context: RecruitingWorkspaceContext): Promise<void> {
    await this.assertContext(transaction, context);
    const actor = await transaction.findMembership(context.workspaceId, context.userId);
    if (actor?.role !== "owner_admin") {
      throw new RecruitingAuthorizationError("Only a workspace owner can run the recruiter owner operation");
    }
  }

  private async buildRecruiterOwnerRollbackPreview(
    transaction: RecruitingTransaction,
    context: RecruitingWorkspaceContext,
  ): Promise<RecruiterOwnerRollbackPreview> {
    const events = await transaction.listEventsByTypeAndKeyPrefix(
      context.workspaceId,
      "recruiter_owner_rebalanced",
      `${RECRUITER_OWNER_REBALANCE_OPERATION_KEY}:workspace:${context.workspaceId}:`,
    );
    const plannedRestorations: RecruiterOwnerRollbackPreview["plannedRestorations"] = [];
    const alreadyRestoredCaseIds: number[] = [];
    const unavailable: RecruiterOwnerRollbackPreview["unavailable"] = [];
    const seenCaseIds = new Set<number>();
    let exactBeforeValues = 0;

    for (const event of events) {
      if (seenCaseIds.has(event.recruitingCaseId)) {
        unavailable.push({ caseId: event.recruitingCaseId, reason: "duplicate rebalance audit record" });
        continue;
      }
      seenCaseIds.add(event.recruitingCaseId);
      let fingerprint: { previousOwnerId?: unknown; proposedOwnerId?: unknown } | null = null;
      try { fingerprint = JSON.parse(event.requestFingerprint) as { previousOwnerId?: unknown; proposedOwnerId?: unknown }; } catch { /* handled below */ }
      const previousOwnerId = fingerprint?.previousOwnerId;
      const proposedOwnerId = fingerprint?.proposedOwnerId;
      if (
        !Number.isInteger(previousOwnerId) || Number(previousOwnerId) < 1
        || !Number.isInteger(proposedOwnerId) || Number(proposedOwnerId) < 1
        || previousOwnerId === proposedOwnerId
      ) {
        unavailable.push({ caseId: event.recruitingCaseId, reason: "missing exact prior-owner audit value" });
        continue;
      }
      exactBeforeValues += 1;
      const current = await transaction.findCase(context.workspaceId, event.recruitingCaseId);
      if (!current) {
        unavailable.push({ caseId: event.recruitingCaseId, reason: "case no longer exists" });
        continue;
      }
      const rollbackKey = `${RECRUITER_OWNER_REBALANCE_ROLLBACK_OPERATION_KEY}:workspace:${context.workspaceId}:case:${current.id}`;
      const rollbackEvent = await transaction.findEventByTransitionKey(rollbackKey);
      if (rollbackEvent && current.caseOwnerId === Number(previousOwnerId)) {
        alreadyRestoredCaseIds.push(current.id);
      } else if (!rollbackEvent && current.caseOwnerId === Number(proposedOwnerId)) {
        plannedRestorations.push({
          caseId: current.id,
          previousOwnerId: Number(previousOwnerId),
          proposedOwnerId: Number(proposedOwnerId),
        });
      } else {
        unavailable.push({ caseId: current.id, reason: "current owner no longer matches audited rebalance state" });
      }
    }

    return {
      auditEvents: events.length,
      exactBeforeValues,
      plannedRestorations,
      alreadyRestoredCaseIds,
      unavailable,
      taskOwnerChanges: 0,
    };
  }

  private async assertWorkspaceIdentity(
    transaction: RecruitingTransaction,
    workspaceId: number,
    driverId: number,
    leadId: number,
  ): Promise<void> {
    const driver = await transaction.findDriver(driverId);
    const lead = await transaction.findLead(leadId);
    if (!driver || driver.workspaceId !== workspaceId || driver.leadId !== leadId) {
      throw new RecruitingAuthorizationError("Driver is outside the authenticated workspace or Lead");
    }
    if (!lead || lead.workspaceId !== workspaceId) {
      throw new RecruitingAuthorizationError("Lead is outside the authenticated workspace");
    }
  }

  private async assertMemberships(
    transaction: RecruitingTransaction,
    workspaceId: number,
    caseOwnerId: number,
    taskOwnerId: number,
  ): Promise<void> {
    const [caseOwner, taskOwner] = await Promise.all([
      transaction.findMembership(workspaceId, caseOwnerId),
      transaction.findMembership(workspaceId, taskOwnerId),
    ]);
    if (!caseOwner || !taskOwner) {
      throw new RecruitingAuthorizationError("Case Owner and Task Owner must belong to the workspace");
    }
  }

  private async assertManagerReviewAssignee(
    transaction: RecruitingTransaction,
    workspaceId: number,
    managerId: number,
  ): Promise<void> {
    const membership = await transaction.findMembership(workspaceId, managerId);
    if (!membership || !["owner_admin", "manager"].includes(membership.role)) {
      throw new RecruitingAuthorizationError("Manager Review must be assigned to a workspace manager or owner");
    }
  }

  private assertSameWorkspace(expectedWorkspaceId: number, actualWorkspaceId: number): void {
    if (expectedWorkspaceId !== actualWorkspaceId) throw new RecruitingAuthorizationError();
  }
}

type DrizzleModule = typeof import("drizzle-orm");
type DbModule = typeof import("@workspace/db");
type DrizzleTransaction = Parameters<Parameters<DbModule["db"]["transaction"]>[0]>[0];

function mapCase(row: typeof recruitingCasesTable.$inferSelect): RecruitingCaseRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    driverId: row.driverId,
    leadId: row.leadId,
    caseNumber: row.caseNumber,
    sourceId: row.sourceId,
    stage: row.stage as RecruitingStage,
    lifecycle: row.lifecycle,
    caseOwnerId: row.caseOwnerId,
    taskOwnerId: row.taskOwnerId,
    nextAction: row.nextAction,
    nextActionDueAt: row.nextActionDueAt,
    slaDeadlineAt: row.slaDeadlineAt,
    followUpDueAt: row.followUpDueAt,
    resumeStage: row.resumeStage as RecruitingStage | null,
    closedLostReason: row.closedLostReason,
    closedLostNote: row.closedLostNote,
    version: row.version,
    transferStatus: row.transferStatus,
    transferRequestedAt: row.transferRequestedAt,
    transferredAt: row.transferredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOnboarding(row: typeof onboardingCasesTable.$inferSelect): RecruitingOnboardingCaseRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId ?? 0,
    driverId: row.driverId,
    leadId: row.leadId,
    recruitingCaseId: row.recruitingCaseId,
    externalRecruitId: row.externalRecruitId,
    recruiterName: row.recruiterName,
    sourceChannel: row.sourceChannel,
    initialNotes: row.initialNotes,
    caseOwnerId: row.caseOwnerId,
    caseOwnerName: row.caseOwnerName,
    status: row.status,
  };
}

export class DrizzleRecruitingStore implements RecruitingTransactionPort {
  private readonly beforeTransaction?: (transaction: {
    execute(query: unknown): Promise<unknown>;
  }) => Promise<void>;

  constructor(beforeTransaction?: (transaction: {
    execute(query: unknown): Promise<unknown>;
  }) => Promise<void>) {
    this.beforeTransaction = beforeTransaction;
  }

  async transaction<T>(work: (transaction: RecruitingTransaction) => Promise<T>): Promise<T> {
    const [schema, operators] = await Promise.all([
      import("@workspace/db"),
      import("drizzle-orm"),
    ]);
    return schema.db.transaction(async tx => {
      await this.beforeTransaction?.(tx);
      return work(new DrizzleRecruitingTransaction(tx, schema, operators));
    });
  }
}

class DrizzleRecruitingTransaction implements RecruitingTransaction {
  private readonly tx: DrizzleTransaction;
  private readonly schema: DbModule;
  private readonly operators: DrizzleModule;

  constructor(tx: DrizzleTransaction, schema: DbModule, operators: DrizzleModule) {
    this.tx = tx;
    this.schema = schema;
    this.operators = operators;
  }

  async findWorkspace(id: number) {
    const { workspacesTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select({ id: workspacesTable.id }).from(workspacesTable).where(eq(workspacesTable.id, id));
    return row ?? null;
  }

  async findMembership(workspaceId: number, userId: number) {
    const { workspaceMembershipsTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx
      .select({
        workspaceId: workspaceMembershipsTable.workspaceId,
        userId: workspaceMembershipsTable.userId,
        role: workspaceMembershipsTable.role,
      })
      .from(workspaceMembershipsTable)
      .where(and(eq(workspaceMembershipsTable.workspaceId, workspaceId), eq(workspaceMembershipsTable.userId, userId)));
    return row ?? null;
  }

  async findRecruiterRoutingOwners(workspaceId: number): Promise<RecruiterRoutingOwners | null> {
    const { appUsersTable, workspaceMembershipsTable } = this.schema;
    const { and, eq, inArray } = this.operators;
    const rows = await this.tx
      .select({ id: appUsersTable.id, name: appUsersTable.name })
      .from(workspaceMembershipsTable)
      .innerJoin(appUsersTable, eq(appUsersTable.id, workspaceMembershipsTable.userId))
      .where(and(
        eq(workspaceMembershipsTable.workspaceId, workspaceId),
        inArray(appUsersTable.name, ["Mason", "Wayne", "Hardy"]),
      ));
    const byName = new Map(rows.map(row => [row.name, row.id]));
    if (rows.length !== 3 || byName.size !== 3) return null;
    const masonId = byName.get("Mason");
    const wayneId = byName.get("Wayne");
    const hardyId = byName.get("Hardy");
    return masonId && wayneId && hardyId ? { masonId, wayneId, hardyId } : null;
  }

  async listRecruiterRoutingCases(workspaceId: number) {
    const { driversTable, leadsTable, recruitingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const visibilityQuery = this.tx as unknown as OperationalVisibilityQuery;
    const excludeDemo = await hasImportedLegacyProfiles(visibilityQuery, workspaceId);
    const rows = await this.tx.select().from(recruitingCasesTable)
      .innerJoin(driversTable, and(
        eq(driversTable.id, recruitingCasesTable.driverId),
        eq(driversTable.workspaceId, workspaceId),
      ))
      .innerJoin(leadsTable, and(
        eq(leadsTable.id, recruitingCasesTable.leadId),
        eq(leadsTable.workspaceId, workspaceId),
      ))
      .where(and(
        eq(recruitingCasesTable.workspaceId, workspaceId),
        ...withOperationalVisibilityFilters(
          visibilityQuery,
          workspaceId,
          [eq(recruitingCasesTable.lifecycle, "active")],
          excludeDemo,
        ),
      ));
    return rows.map(row => mapCase(row.recruiting_cases));
  }

  async findDriver(id: number) {
    const { driversTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select({
      id: driversTable.id,
      workspaceId: driversTable.workspaceId,
      leadId: driversTable.leadId,
    }).from(driversTable).where(eq(driversTable.id, id));
    return row ?? null;
  }

  async findFranklinDriverType(workspaceId: number, recruitingCaseId: number): Promise<NewDriver["driverType"] | null> {
    const { franklinLeadIngestsTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select({ driverType: franklinLeadIngestsTable.driverType })
      .from(franklinLeadIngestsTable)
      .where(and(
        eq(franklinLeadIngestsTable.workspaceId, workspaceId),
        eq(franklinLeadIngestsTable.recruitingCaseId, recruitingCaseId),
      ));
    return row?.driverType === "company_driver" || row?.driverType === "owner_operator" ? row.driverType : null;
  }

  async findLead(id: number) {
    const { leadsTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select({
      id: leadsTable.id,
      workspaceId: leadsTable.workspaceId,
      fullName: leadsTable.fullName,
      phoneNormalized: leadsTable.phoneNormalized,
      recruiterName: leadsTable.recruiterName,
      sourceChannel: leadsTable.sourceChannel,
    }).from(leadsTable).where(eq(leadsTable.id, id));
    return row ?? null;
  }

  async insertDriver(input: NewDriver) {
    const { driversTable } = this.schema;
    const [row] = await this.tx.insert(driversTable).values({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      fullName: input.fullName,
      phone: input.phone,
      driverType: input.driverType,
      status: "pre_hire",
      stage: "Application",
      priority: "medium",
      recruiterName: input.recruiterName,
      sourceChannel: input.sourceChannel,
      assigneeId: input.assigneeId,
      externalRecruitId: input.externalRecruitId,
    }).returning({ id: driversTable.id, workspaceId: driversTable.workspaceId, leadId: driversTable.leadId });
    return row;
  }

  async findCase(workspaceId: number, id: number) {
    const { recruitingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingCasesTable)
      .where(and(eq(recruitingCasesTable.workspaceId, workspaceId), eq(recruitingCasesTable.id, id)));
    return row ? mapCase(row) : null;
  }

  async findCaseBySourceId(workspaceId: number, sourceId: string) {
    const { recruitingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingCasesTable)
      .where(and(eq(recruitingCasesTable.workspaceId, workspaceId), eq(recruitingCasesTable.sourceId, sourceId)));
    return row ? mapCase(row) : null;
  }

  async findActiveCase(workspaceId: number, driverId: number) {
    const { recruitingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingCasesTable)
      .where(and(
        eq(recruitingCasesTable.workspaceId, workspaceId),
        eq(recruitingCasesTable.driverId, driverId),
        eq(recruitingCasesTable.lifecycle, "active"),
      ));
    return row ? mapCase(row) : null;
  }

  async updateCase(workspaceId: number, id: number, expectedVersion: number, patch: CaseUpdate) {
    const { recruitingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.update(recruitingCasesTable).set({
      ...patch,
      version: expectedVersion + 1,
    }).where(and(
      eq(recruitingCasesTable.workspaceId, workspaceId),
      eq(recruitingCasesTable.id, id),
      eq(recruitingCasesTable.version, expectedVersion),
    )).returning();
    return row ? mapCase(row) : null;
  }

  async insertCase(input: NewRecruitingCase) {
    const { recruitingCasesTable } = this.schema;
    const [row] = await this.tx.insert(recruitingCasesTable).values(input).returning();
    return mapCase(row);
  }

  async findEventByTransitionKey(key: string) {
    const { recruitingCaseEventsTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingCaseEventsTable)
      .where(eq(recruitingCaseEventsTable.transitionIdempotencyKey, key));
    return row ? deserializeEvent(row) : null;
  }

  async listEventsByTypeAndKeyPrefix(workspaceId: number, eventType: string, keyPrefix: string) {
    const { recruitingCaseEventsTable } = this.schema;
    const { and, eq, like } = this.operators;
    const rows = await this.tx.select().from(recruitingCaseEventsTable).where(and(
      eq(recruitingCaseEventsTable.workspaceId, workspaceId),
      eq(recruitingCaseEventsTable.eventType, eventType),
      like(recruitingCaseEventsTable.transitionIdempotencyKey, `${keyPrefix}%`),
    ));
    return rows.map(deserializeEvent);
  }

  async insertEvent(input: NewEvent) {
    const { recruitingCaseEventsTable } = this.schema;
    const [row] = await this.tx.insert(recruitingCaseEventsTable).values({
      workspaceId: input.workspaceId,
      recruitingCaseId: input.recruitingCaseId,
      transitionIdempotencyKey: input.transitionIdempotencyKey,
      eventType: input.eventType,
      fromStage: input.fromStage,
      toStage: input.toStage,
      actorUserId: input.actorUserId,
      caseVersion: input.caseVersion,
      payload: {
        requestFingerprint: input.requestFingerprint,
        resultCase: input.resultCase,
        effects: input.effects,
      },
    }).returning();
    return deserializeEvent(row);
  }

  async setEventEffects(id: number, effects: RecruitingEffectRecord[]) {
    const { recruitingCaseEventsTable } = this.schema;
    const { eq } = this.operators;
    const [existing] = await this.tx.select().from(recruitingCaseEventsTable)
      .where(eq(recruitingCaseEventsTable.id, id));
    if (!existing) throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transition event is missing");
    await this.tx.update(recruitingCaseEventsTable).set({
      payload: {
        requestFingerprint: (existing.payload as { requestFingerprint?: string }).requestFingerprint ?? "",
        resultCase: (existing.payload as { resultCase: RecruitingCaseRecord }).resultCase,
        effects,
      },
    }).where(eq(recruitingCaseEventsTable.id, id));
  }

  async insertEffects(input: NewEffect[]) {
    const { recruitingTransitionEffectsTable } = this.schema;
    if (input.length === 0) return [];
    const rows = await this.tx.insert(recruitingTransitionEffectsTable).values(input.map(effect => ({
      ...effect,
      payload: {},
    }))).returning();
    return rows.map(row => ({
      id: row.id,
      workspaceId: row.workspaceId,
      recruitingCaseId: row.recruitingCaseId,
      transitionIdempotencyKey: row.transitionIdempotencyKey,
      effectKind: row.effectKind as RecruitingTransitionEffectKind,
      effectIdempotencyKey: row.effectIdempotencyKey,
      status: row.status,
    }));
  }

  async findTransferByKey(key: string) {
    const { recruitingOnboardingTransfersTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingOnboardingTransfersTable)
      .where(eq(recruitingOnboardingTransfersTable.transferIdempotencyKey, key));
    return row ? mapTransfer(row) : null;
  }

  async findTransferByCase(workspaceId: number, recruitingCaseId: number) {
    const { recruitingOnboardingTransfersTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select().from(recruitingOnboardingTransfersTable)
      .where(and(
        eq(recruitingOnboardingTransfersTable.workspaceId, workspaceId),
        eq(recruitingOnboardingTransfersTable.recruitingCaseId, recruitingCaseId),
      ));
    return row ? mapTransfer(row) : null;
  }

  async insertTransfer(input: NewTransfer) {
    const { recruitingOnboardingTransfersTable } = this.schema;
    const [row] = await this.tx.insert(recruitingOnboardingTransfersTable).values({
      ...input,
      requestedAt: new Date(),
      completedAt: null,
      failedAt: null,
      failureReason: null,
    }).returning();
    return mapTransfer(row);
  }

  async completeTransfer(id: number, onboardingCaseId: number) {
    const { recruitingOnboardingTransfersTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.update(recruitingOnboardingTransfersTable).set({
      status: "completed",
      onboardingCaseId,
      completedAt: new Date(),
    }).where(eq(recruitingOnboardingTransfersTable.id, id)).returning();
    if (!row) throw new RecruitingConflictError("TRANSFER_EXISTS", "Transfer ledger entry is missing");
    return mapTransfer(row);
  }

  async findOnboardingById(id: number) {
    const { onboardingCasesTable } = this.schema;
    const { eq } = this.operators;
    const [row] = await this.tx.select().from(onboardingCasesTable).where(eq(onboardingCasesTable.id, id));
    return row ? mapOnboarding(row) : null;
  }

  async findOnboardingByRecruitingCase(workspaceId: number, recruitingCaseId: number) {
    const { onboardingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.select().from(onboardingCasesTable)
      .where(and(
        eq(onboardingCasesTable.workspaceId, workspaceId),
        eq(onboardingCasesTable.recruitingCaseId, recruitingCaseId),
      ));
    return row ? mapOnboarding(row) : null;
  }

  async linkOnboardingCase(workspaceId: number, onboardingCaseId: number, recruitingCaseId: number) {
    const { onboardingCasesTable } = this.schema;
    const { and, eq } = this.operators;
    const [row] = await this.tx.update(onboardingCasesTable).set({ recruitingCaseId }).where(and(
      eq(onboardingCasesTable.id, onboardingCaseId),
      eq(onboardingCasesTable.workspaceId, workspaceId),
    )).returning();
    return row ? mapOnboarding(row) : null;
  }

  async insertOnboardingCase(input: NewOnboardingCase) {
    const { onboardingCasesTable } = this.schema;
    const [row] = await this.tx.insert(onboardingCasesTable).values({
      workspaceId: input.workspaceId,
      driverId: input.driverId,
      leadId: input.leadId,
      recruitingCaseId: input.recruitingCaseId,
      externalRecruitId: input.externalRecruitId,
      recruiterName: input.recruiterName,
      sourceChannel: input.sourceChannel,
      initialNotes: input.initialNotes,
      caseOwnerId: input.caseOwnerId,
      caseOwnerName: input.caseOwnerName,
      status: "open",
    }).returning();
    return mapOnboarding(row);
  }
}

function deserializeEvent(row: typeof recruitingCaseEventsTable.$inferSelect): RecruitingCaseEventRecord {
  const payload = row.payload as {
    requestFingerprint?: string;
    resultCase: RecruitingCaseRecord;
    effects: RecruitingEffectRecord[];
  };
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recruitingCaseId: row.recruitingCaseId,
    transitionIdempotencyKey: row.transitionIdempotencyKey,
    eventType: row.eventType,
    fromStage: row.fromStage as RecruitingStage | null,
    toStage: row.toStage as RecruitingStage,
    actorUserId: row.actorUserId ?? 0,
    caseVersion: row.caseVersion,
    requestFingerprint: payload.requestFingerprint ?? "",
    resultCase: restoreCaseSnapshot(payload.resultCase),
    effects: payload.effects ?? [],
  };
}

function restoreCaseSnapshot(caseRecord: RecruitingCaseRecord): RecruitingCaseRecord {
  const toDate = (value: Date | string | null): Date | null =>
    typeof value === "string" ? new Date(value) : value;
  return {
    ...caseRecord,
    nextActionDueAt: toDate(caseRecord.nextActionDueAt),
    slaDeadlineAt: toDate(caseRecord.slaDeadlineAt),
    followUpDueAt: toDate(caseRecord.followUpDueAt),
    transferRequestedAt: toDate(caseRecord.transferRequestedAt),
    transferredAt: toDate(caseRecord.transferredAt),
    createdAt: toDate(caseRecord.createdAt) ?? new Date(0),
    updatedAt: toDate(caseRecord.updatedAt) ?? new Date(0),
  };
}

function mapTransfer(row: typeof recruitingOnboardingTransfersTable.$inferSelect): RecruitingOnboardingTransferRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recruitingCaseId: row.recruitingCaseId,
    transferIdempotencyKey: row.transferIdempotencyKey,
    status: row.status,
    onboardingCaseId: row.onboardingCaseId,
  };
}

interface MemoryState {
  workspaces: WorkspaceRecord[];
  memberships: MembershipRecord[];
  drivers: DriverRecord[];
  leads: LeadRecord[];
  recruitingCases: RecruitingCaseRecord[];
  recruitingCaseEvents: RecruitingCaseEventRecord[];
  recruitingTransitionEffects: RecruitingEffectRecord[];
  recruitingOnboardingTransfers: RecruitingOnboardingTransferRecord[];
  onboardingCases: RecruitingOnboardingCaseRecord[];
  franklinDriverTypes: Array<{ workspaceId: number; recruitingCaseId: number; driverType: NewDriver["driverType"] }>;
  routingOwners?: RecruiterRoutingOwners;
}

export type MemoryFailurePoint = "insert_event" | "insert_effects" | "insert_transfer" | "insert_onboarding_case";

export class InMemoryRecruitingStore implements RecruitingTransactionPort {
  private state: MemoryState;
  private queue: Promise<void> = Promise.resolve();
  private failurePoint: MemoryFailurePoint | null = null;

  constructor(seed: Partial<MemoryState>) {
    this.state = {
      workspaces: seed.workspaces ?? [],
      memberships: seed.memberships ?? [],
      drivers: seed.drivers ?? [],
      leads: seed.leads ?? [],
      recruitingCases: seed.recruitingCases ?? [],
      recruitingCaseEvents: seed.recruitingCaseEvents ?? [],
      recruitingTransitionEffects: seed.recruitingTransitionEffects ?? [],
      recruitingOnboardingTransfers: seed.recruitingOnboardingTransfers ?? [],
      onboardingCases: seed.onboardingCases ?? [],
      franklinDriverTypes: seed.franklinDriverTypes ?? [],
      routingOwners: seed.routingOwners,
    };
  }

  failNext(point: MemoryFailurePoint): void {
    this.failurePoint = point;
  }

  setRoutingOwners(owners: RecruiterRoutingOwners | undefined): void {
    this.state.routingOwners = owners;
  }

  snapshot(): MemoryState {
    return structuredClone(this.state);
  }

  transaction<T>(work: (transaction: RecruitingTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      const failurePoint = this.failurePoint;
      this.failurePoint = null;
      const result = await work(new MemoryRecruitingTransaction(draft, failurePoint));
      this.state = draft;
      return result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

class MemoryRecruitingTransaction implements RecruitingTransaction {
  private readonly state: MemoryState;
  private readonly failurePoint: MemoryFailurePoint | null;

  constructor(state: MemoryState, failurePoint: MemoryFailurePoint | null) {
    this.state = state;
    this.failurePoint = failurePoint;
  }

  findWorkspace(id: number) {
    return Promise.resolve(this.state.workspaces.find(row => row.id === id) ?? null);
  }

  findMembership(workspaceId: number, userId: number) {
    return Promise.resolve(this.state.memberships.find(row => row.workspaceId === workspaceId && row.userId === userId) ?? null);
  }

  findRecruiterRoutingOwners() {
    return Promise.resolve(this.state.routingOwners ?? null);
  }

  listRecruiterRoutingCases(workspaceId: number) {
    return Promise.resolve(structuredClone(
      this.state.recruitingCases.filter(row => row.workspaceId === workspaceId && row.lifecycle === "active"),
    ));
  }

  findDriver(id: number) {
    return Promise.resolve(this.state.drivers.find(row => row.id === id) ?? null);
  }

  findFranklinDriverType(workspaceId: number, recruitingCaseId: number) {
    return Promise.resolve(this.state.franklinDriverTypes.find(row =>
      row.workspaceId === workspaceId && row.recruitingCaseId === recruitingCaseId,
    )?.driverType ?? null);
  }

  findLead(id: number) {
    return Promise.resolve(this.state.leads.find(row => row.id === id) ?? null);
  }

  insertDriver(input: NewDriver) {
    if (this.state.drivers.some(row => row.workspaceId === input.workspaceId && row.leadId === input.leadId)) {
      throw Object.assign(new Error("driver already exists for lead"), { code: "23505" });
    }
    const row: DriverRecord = { id: nextId(this.state.drivers), workspaceId: input.workspaceId, leadId: input.leadId };
    this.state.drivers.push(row);
    return Promise.resolve(structuredClone(row));
  }

  findCase(workspaceId: number, id: number) {
    return Promise.resolve(this.state.recruitingCases.find(row => row.workspaceId === workspaceId && row.id === id) ?? null);
  }

  findCaseBySourceId(workspaceId: number, sourceId: string) {
    return Promise.resolve(this.state.recruitingCases.find(row =>
      row.workspaceId === workspaceId && row.sourceId === sourceId,
    ) ?? null);
  }

  findActiveCase(workspaceId: number, driverId: number) {
    return Promise.resolve(this.state.recruitingCases.find(row =>
      row.workspaceId === workspaceId && row.driverId === driverId && row.lifecycle === "active",
    ) ?? null);
  }

  updateCase(workspaceId: number, id: number, expectedVersion: number, patch: CaseUpdate) {
    const row = this.state.recruitingCases.find(item =>
      item.workspaceId === workspaceId && item.id === id && item.version === expectedVersion,
    );
    if (!row) return Promise.resolve(null);
    Object.assign(row, patch, { version: expectedVersion + 1, updatedAt: new Date() });
    return Promise.resolve(structuredClone(row));
  }

  insertCase(input: NewRecruitingCase) {
    if (this.state.recruitingCases.some(row =>
      row.workspaceId === input.workspaceId && row.driverId === input.driverId && row.lifecycle === "active",
    )) {
      throw Object.assign(new Error("active RecruitingCase already exists"), { code: "23505" });
    }
    const row: RecruitingCaseRecord = {
      id: nextId(this.state.recruitingCases),
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.state.recruitingCases.push(row);
    return Promise.resolve(structuredClone(row));
  }

  findEventByTransitionKey(key: string) {
    return Promise.resolve(this.state.recruitingCaseEvents.find(row => row.transitionIdempotencyKey === key) ?? null);
  }

  listEventsByTypeAndKeyPrefix(workspaceId: number, eventType: string, keyPrefix: string) {
    return Promise.resolve(this.state.recruitingCaseEvents.filter(row =>
      row.workspaceId === workspaceId
      && row.eventType === eventType
      && row.transitionIdempotencyKey.startsWith(keyPrefix),
    ).map(row => structuredClone(row)));
  }

  insertEvent(input: NewEvent) {
    this.fail("insert_event");
    const row: RecruitingCaseEventRecord = {
      id: nextId(this.state.recruitingCaseEvents),
      ...input,
    };
    this.state.recruitingCaseEvents.push(row);
    return Promise.resolve(structuredClone(row));
  }

  setEventEffects(id: number, effects: RecruitingEffectRecord[]) {
    const row = this.state.recruitingCaseEvents.find(item => item.id === id);
    if (!row) throw new RecruitingConflictError("IDEMPOTENCY_CONFLICT", "Transition event is missing");
    row.effects = structuredClone(effects);
    return Promise.resolve();
  }

  insertEffects(input: NewEffect[]) {
    this.fail("insert_effects");
    const initialId = nextId(this.state.recruitingTransitionEffects);
    const rows = input.map((effect, index) => ({
      id: initialId + index,
      ...effect,
    }));
    this.state.recruitingTransitionEffects.push(...rows);
    return Promise.resolve(structuredClone(rows));
  }

  findTransferByKey(key: string) {
    return Promise.resolve(this.state.recruitingOnboardingTransfers.find(row => row.transferIdempotencyKey === key) ?? null);
  }

  findTransferByCase(workspaceId: number, recruitingCaseId: number) {
    return Promise.resolve(this.state.recruitingOnboardingTransfers.find(row =>
      row.workspaceId === workspaceId && row.recruitingCaseId === recruitingCaseId,
    ) ?? null);
  }

  insertTransfer(input: NewTransfer) {
    this.fail("insert_transfer");
    const existing = this.state.recruitingOnboardingTransfers.find(row =>
      row.recruitingCaseId === input.recruitingCaseId || row.transferIdempotencyKey === input.transferIdempotencyKey,
    );
    if (existing) throw Object.assign(new Error("transfer already exists"), { code: "23505" });
    const row: RecruitingOnboardingTransferRecord = {
      id: nextId(this.state.recruitingOnboardingTransfers),
      ...input,
    };
    this.state.recruitingOnboardingTransfers.push(row);
    return Promise.resolve(structuredClone(row));
  }

  completeTransfer(id: number, onboardingCaseId: number) {
    const row = this.state.recruitingOnboardingTransfers.find(item => item.id === id);
    if (!row) throw new RecruitingConflictError("TRANSFER_EXISTS", "Transfer ledger entry is missing");
    row.status = "completed";
    row.onboardingCaseId = onboardingCaseId;
    return Promise.resolve(structuredClone(row));
  }

  findOnboardingById(id: number) {
    return Promise.resolve(this.state.onboardingCases.find(row => row.id === id) ?? null);
  }

  findOnboardingByRecruitingCase(workspaceId: number, recruitingCaseId: number) {
    return Promise.resolve(this.state.onboardingCases.find(row =>
      row.workspaceId === workspaceId && row.recruitingCaseId === recruitingCaseId,
    ) ?? null);
  }

  linkOnboardingCase(workspaceId: number, onboardingCaseId: number, recruitingCaseId: number) {
    const row = this.state.onboardingCases.find(item =>
      item.id === onboardingCaseId && item.workspaceId === workspaceId,
    );
    if (!row) return Promise.resolve(null);
    row.recruitingCaseId = recruitingCaseId;
    return Promise.resolve(structuredClone(row));
  }

  insertOnboardingCase(input: NewOnboardingCase) {
    this.fail("insert_onboarding_case");
    if (this.state.onboardingCases.some(row => row.recruitingCaseId === input.recruitingCaseId)) {
      throw Object.assign(new Error("OnboardingCase already linked"), { code: "23505" });
    }
    const row: RecruitingOnboardingCaseRecord = {
      id: nextId(this.state.onboardingCases),
      ...input,
      status: "open",
    };
    this.state.onboardingCases.push(row);
    return Promise.resolve(structuredClone(row));
  }

  private fail(point: MemoryFailurePoint): void {
    if (this.failurePoint === point) throw new Error(`injected failure: ${point}`);
  }
}

function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

function isFranklinIntakeSource(sourceId: string | null): boolean {
  return sourceId?.startsWith("franklins.ai:recruiting:new-lead:v1:") ?? false;
}