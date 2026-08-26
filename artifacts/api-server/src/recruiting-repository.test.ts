import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InMemoryRecruitingStore,
  RecruitingAuthorizationError,
  RecruitingConflictError,
  RecruitingRepository,
  type RecruitingWorkspaceContext,
} from "./lib/recruiting-repository.ts";
import {
  serializeRecruitingMutationResponse,
  serializeRecruitingTransferResponse,
} from "./routes/recruiting-response-contract.ts";
import { ListRecruitingCasesQueryParams } from "@workspace/api-zod";
import {
  buildRecruiterRoutingPreview,
  routeRecruitingCaseOwner,
} from "./lib/recruiter-owner-routing.ts";
import {
  isOperationallyEligibleCase,
  isQualifyingMainJidoDriverRow,
} from "./lib/recruiting-operational-visibility.ts";

const workspaceOne: RecruitingWorkspaceContext = { workspaceId: 1, userId: 10 };
const workspaceTwo: RecruitingWorkspaceContext = { workspaceId: 2, userId: 20 };

function makeStore(options: { includeWorkspaceOneTarget?: boolean; enableRouting?: boolean } = {}) {
  return new InMemoryRecruitingStore({
    workspaces: [{ id: 1 }, { id: 2 }],
    memberships: [
      { workspaceId: 1, userId: 10, role: "owner_admin" },
      { workspaceId: 1, userId: 11, role: "manager" },
      { workspaceId: 1, userId: 12, role: "manager" },
      { workspaceId: 1, userId: 13, role: "recruiter" },
      ...(options.enableRouting ? [
        { workspaceId: 1, userId: 22, role: "recruiter" },
        { workspaceId: 1, userId: 25, role: "recruiter" },
        { workspaceId: 1, userId: 32, role: "recruiter" },
      ] : []),
      { workspaceId: 2, userId: 20, role: "owner_admin" },
      { workspaceId: 2, userId: 21, role: "manager" },
    ],
    leads: [
      { id: 200, workspaceId: 1 },
      { id: 202, workspaceId: 1 },
      { id: 201, workspaceId: 2 },
    ],
    drivers: [
      { id: 100, workspaceId: 1, leadId: 200 },
      { id: 102, workspaceId: 1, leadId: 202 },
      { id: 101, workspaceId: 2, leadId: 201 },
    ],
    onboardingCases: [
      {
        id: 900,
        workspaceId: 2,
        driverId: 101,
        leadId: 201,
        recruitingCaseId: null,
      },
      ...(options.includeWorkspaceOneTarget ? [{
        id: 901,
        workspaceId: 1,
        driverId: 100,
        leadId: 200,
        recruitingCaseId: null,
      }] : []),
    ],
    ...(options.enableRouting ? { routingOwners: { masonId: 32, wayneId: 25, hardyId: 22 } } : {}),
  });
}

function createInput(context = workspaceOne) {
  return {
    context,
    driverId: 100,
    leadId: 200,
    caseNumber: "REC-00001",
    sourceId: "source-001",
    caseOwnerId: 10,
    taskOwnerId: 10,
    stage: "application_received" as const,
    nextAction: "Submit application for manager review",
    nextActionDueAt: new Date("2026-08-21T12:00:00.000Z"),
    slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z"),
  };
}

function makeFranklinTransferStore() {
  return new InMemoryRecruitingStore({
    workspaces: [{ id: 1 }],
    memberships: [{ workspaceId: 1, userId: 10, role: "owner_admin" }],
    leads: [{
      id: 203,
      workspaceId: 1,
      fullName: "Franklin Intake Driver",
      phoneNormalized: "+15551234567",
      recruiterName: "Franklin Recruiter",
      sourceChannel: "franklins.ai",
    }],
    drivers: [],
    franklinDriverTypes: [{ workspaceId: 1, recruitingCaseId: 300, driverType: "company_driver" }],
    onboardingCases: [],
    recruitingCases: [{
      id: 300,
      workspaceId: 1,
      driverId: null,
      leadId: 203,
      caseNumber: "FRANKLIN-test-001",
      sourceId: "franklins.ai:recruiting:new-lead:v1:test-001",
      stage: "hired_transferred_to_onboarding",
      lifecycle: "hired_transferred",
      caseOwnerId: 10,
      taskOwnerId: 10,
      nextAction: "Transfer to Onboarding",
      nextActionDueAt: new Date("2026-08-24T12:00:00.000Z"),
      slaDeadlineAt: new Date("2026-08-25T12:00:00.000Z"),
      followUpDueAt: null,
      resumeStage: null,
      closedLostReason: null,
      closedLostNote: null,
      version: 1,
      transferStatus: "not_requested",
      transferRequestedAt: null,
      transferredAt: null,
      createdAt: new Date("2026-08-24T08:00:00.000Z"),
      updatedAt: new Date("2026-08-24T08:00:00.000Z"),
    }],
  });
}

describe("Recruiter owner routing policy", () => {
  const owners = { masonId: 32, wayneId: 25, hardyId: 22 };

  it("plans an exactly balanced active batch, routes later stages to Hardy, and excludes Future Follow-up and terminal cases", () => {
    const preview = buildRecruiterRoutingPreview([
      { id: 9, stage: "new_lead", lifecycle: "active", caseOwnerId: 15, taskOwnerId: 15 },
      { id: 2, stage: "manager_review", lifecycle: "active", caseOwnerId: 16, taskOwnerId: 11 },
      { id: 8, stage: "drug_test_passed", lifecycle: "active", caseOwnerId: 17, taskOwnerId: 17 },
      { id: 4, stage: "compliance_documents_pending", lifecycle: "active", caseOwnerId: 25, taskOwnerId: 25 },
      { id: 3, stage: "contract_signed", lifecycle: "active", caseOwnerId: 32, taskOwnerId: 32 },
      { id: 5, stage: "future_follow_up", lifecycle: "active", caseOwnerId: 16, taskOwnerId: 16 },
      { id: 6, stage: "hired_transferred_to_onboarding", lifecycle: "hired_transferred", caseOwnerId: 16, taskOwnerId: 16 },
      { id: 7, stage: "closed_lost", lifecycle: "closed_lost", caseOwnerId: 17, taskOwnerId: 17 },
    ], owners);

    assert.equal(preview.proposedTotals.mason, 2);
    assert.equal(preview.proposedTotals.wayne, 1);
    assert.equal(preview.proposedTotals.hardy, 2);
    assert.equal(preview.masonWayneDifference, 1);
    assert.deepEqual(preview.assignments.map(assignment => assignment.caseId), [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(
      preview.assignments.filter(assignment => assignment.group === "early").map(assignment => assignment.proposedOwnerId),
      [32, 25, 32],
    );
    assert.deepEqual(
      preview.assignments.filter(assignment => assignment.group === "later").map(assignment => assignment.proposedOwnerId),
      [22, 22],
    );
    assert.deepEqual(
      preview.assignments.filter(assignment => assignment.group === "excluded").map(assignment => [assignment.proposedOwnerId, assignment.currentOwnerId]),
      [[16, 16], [16, 16], [17, 17]],
    );
    assert.equal(preview.managerReviewTaskOwnerChanges, 0);
    assert.equal(preview.currentOutOfPolicy, 5);
    assert.equal(preview.outOfPolicy, 0);
  });

  it("routes new and returned early cases to the least-loaded recruiter, preserves compliant owners and task owners, and never routes exclusions to Hardy", () => {
    const activeCases = [
      { id: 1, stage: "new_lead", lifecycle: "active", caseOwnerId: 32, taskOwnerId: 32 },
      { id: 2, stage: "application_sent", lifecycle: "active", caseOwnerId: 32, taskOwnerId: 32 },
      { id: 3, stage: "manager_review", lifecycle: "active", caseOwnerId: 25, taskOwnerId: 11 },
    ] as const;

    assert.equal(routeRecruitingCaseOwner("application_received", 15, activeCases, owners), 25);
    assert.equal(routeRecruitingCaseOwner("manager_review", 32, activeCases, owners), 32);
    assert.equal(routeRecruitingCaseOwner("compliance_documents_pending", 25, activeCases, owners), 22);
    assert.equal(routeRecruitingCaseOwner("future_follow_up", 15, activeCases, owners), 15);
    assert.equal(routeRecruitingCaseOwner("hired_transferred_to_onboarding", 15, activeCases, owners), 15);
  });
});

describe("Corrected MAIN JIDO operational scope", () => {
  const workbookId = "1x0P28BzXkX1tAMCxGEc7p1_DFHDO8cAuIqTs3TyMfTc";
  const mainRow = {
    workbookId,
    tabName: "MAIN JIDO FREIGHT LLC",
    rowNumber: 2,
    sourceStatus: "active",
    name: "Driver",
    normalizedPhone: "5555555555",
  } as const;

  it("includes only real MAIN JIDO rows 2–71 and excludes header, 72+, other tabs, and section rows", () => {
    assert.equal(isQualifyingMainJidoDriverRow(mainRow), true);
    assert.equal(isQualifyingMainJidoDriverRow({ ...mainRow, rowNumber: 1 }), false);
    assert.equal(isQualifyingMainJidoDriverRow({ ...mainRow, rowNumber: 72 }), false);
    assert.equal(isQualifyingMainJidoDriverRow({ ...mainRow, tabName: "ARCHIVE" }), false);
    assert.equal(isQualifyingMainJidoDriverRow({ ...mainRow, name: null, normalizedPhone: null, sourceStatus: "skipped" }), false);
  });

  it("keeps legitimate manual cases eligible while permanently hiding out-of-scope sheet and demo cases", () => {
    assert.equal(isOperationallyEligibleCase({ sourceId: null, qualifyingSheetRow: false }), true);
    assert.equal(isOperationallyEligibleCase({ sourceId: "manual-import:42", qualifyingSheetRow: false }), true);
    assert.equal(isOperationallyEligibleCase({ sourceId: "google-sheet:workbook:MAIN JIDO FREIGHT LLC:71", qualifyingSheetRow: true }), true);
    assert.equal(isOperationallyEligibleCase({ sourceId: "google-sheet:workbook:MAIN JIDO FREIGHT LLC:72", qualifyingSheetRow: false }), false);
    assert.equal(isOperationallyEligibleCase({ sourceId: "dev-demo-recruiting:sample", qualifyingSheetRow: false }), false);
    assert.equal(isOperationallyEligibleCase({ sourceId: "dev-demo-recruiting:sample", qualifyingSheetRow: true }), false);
  });
});

describe("Recruiting repository recruiter owner routing", () => {
  it("preserves Case Owner on new and transitioned cases while automatic routing is paused", async () => {
    const repository = new RecruitingRepository(makeStore({ enableRouting: true }));
    const created = await repository.createCase(createInput());
    assert.equal(created.case.caseOwnerId, 10);
    assert.equal(created.case.taskOwnerId, 10);

    const managerReview = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review",
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    });
    assert.equal(managerReview.case.caseOwnerId, 10);
    assert.equal(managerReview.case.taskOwnerId, 11);

    const laterRepository = new RecruitingRepository(makeStore({ enableRouting: true }));
    const later = await laterRepository.createCase({
      ...createInput(),
      stage: "compliance_documents_pending",
      sourceId: "later-owner-route",
    });
    assert.equal(later.case.caseOwnerId, 10);
    assert.equal(later.case.taskOwnerId, 10);

    const future = await laterRepository.createCase({
      ...createInput(),
      driverId: 102,
      leadId: 202,
      caseNumber: "REC-FOLLOW-UP",
      sourceId: "future-owner-route",
      stage: "future_follow_up",
      caseOwnerId: 13,
      taskOwnerId: 13,
      followUpDueAt: new Date("2026-08-22T12:00:00.000Z"),
      resumeStage: "application_received",
    });
    assert.equal(future.case.caseOwnerId, 13);
    const returned = await laterRepository.returnFromFutureFollowUp(workspaceOne, {
      caseId: future.case.id,
      expectedVersion: future.case.version,
      now: new Date("2026-08-22T12:00:00.000Z"),
      nextAction: "Resume candidate contact",
      nextActionDueAt: new Date("2026-08-22T16:00:00.000Z"),
    });
    assert.notEqual(returned.status, "not_due");
    assert.equal(returned.case.caseOwnerId, 13);
  });

  it("applies an audited one-time rebalance atomically and makes reruns no-ops", async () => {
    const baseCase = (id: number, stage: "new_lead" | "manager_review" | "compliance_documents_pending", caseOwnerId: number, taskOwnerId: number) => ({
      id,
      workspaceId: 1,
      driverId: id,
      leadId: id,
      caseNumber: `RB-${id}`,
      sourceId: null,
      stage,
      lifecycle: "active",
      caseOwnerId,
      taskOwnerId,
      nextAction: "Continue Recruiting work",
      nextActionDueAt: new Date("2026-08-21T12:00:00.000Z"),
      slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z"),
      followUpDueAt: null,
      resumeStage: null,
      closedLostReason: null,
      closedLostNote: null,
      version: 1,
      transferStatus: "not_requested",
      transferRequestedAt: null,
      transferredAt: null,
      createdAt: new Date("2026-08-20T12:00:00.000Z"),
      updatedAt: new Date("2026-08-20T12:00:00.000Z"),
    });
    const store = new InMemoryRecruitingStore({
      workspaces: [{ id: 1 }],
      memberships: [
        { workspaceId: 1, userId: 10, role: "owner_admin" },
        { workspaceId: 1, userId: 11, role: "manager" },
        { workspaceId: 1, userId: 22, role: "recruiter" },
        { workspaceId: 1, userId: 25, role: "recruiter" },
        { workspaceId: 1, userId: 32, role: "recruiter" },
      ],
      routingOwners: { masonId: 32, wayneId: 25, hardyId: 22 },
      recruitingCases: [
        baseCase(1, "new_lead", 15, 15),
        baseCase(2, "manager_review", 16, 11),
        baseCase(3, "compliance_documents_pending", 25, 25),
      ],
    });
    const repository = new RecruitingRepository(store);
    const applied = await repository.rebalanceRecruiterOwners(workspaceOne);
    assert.equal(applied.status, "applied");
    assert.deepEqual(applied.changedCaseIds, [1, 2, 3]);
    assert.equal(store.snapshot().recruitingCases.find(item => item.id === 2)?.taskOwnerId, 11);
    assert.deepEqual(store.snapshot().recruitingCases.map(item => item.caseOwnerId), [32, 25, 22]);
    assert.equal(store.snapshot().recruitingCaseEvents.filter(item => item.eventType === "recruiter_owner_rebalanced").length, 3);

    const replay = await repository.rebalanceRecruiterOwners(workspaceOne);
    assert.equal(replay.status, "noop");
    assert.equal(replay.changedCaseIds.length, 0);
    assert.equal(store.snapshot().recruitingCaseEvents.filter(item => item.eventType === "recruiter_owner_rebalanced").length, 3);

    const rollbackStore = new InMemoryRecruitingStore({
      workspaces: [{ id: 1 }],
      memberships: [
        { workspaceId: 1, userId: 10, role: "owner_admin" },
        { workspaceId: 1, userId: 22, role: "recruiter" },
        { workspaceId: 1, userId: 25, role: "recruiter" },
        { workspaceId: 1, userId: 32, role: "recruiter" },
      ],
      routingOwners: { masonId: 32, wayneId: 25, hardyId: 22 },
      recruitingCases: [baseCase(4, "new_lead", 15, 15)],
    });
    rollbackStore.failNext("insert_event");
    await assert.rejects(() => new RecruitingRepository(rollbackStore).rebalanceRecruiterOwners(workspaceOne));
    assert.equal(rollbackStore.snapshot().recruitingCases[0].caseOwnerId, 15);
    assert.equal(rollbackStore.snapshot().recruitingCaseEvents.length, 0);
  });

  it("rolls back audited Case Owners transactionally, idempotently, and without changing Task Owner", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    store.setRoutingOwners({ masonId: 32, wayneId: 25, hardyId: 22 });
    const rebalanced = await repository.rebalanceRecruiterOwners(workspaceOne);
    assert.equal(rebalanced.status, "applied");
    const beforeRollbackTaskOwner = store.snapshot().recruitingCases[0].taskOwnerId;

    const rolledBack = await repository.rollbackRecruiterOwnerRebalance(workspaceOne);
    assert.equal(rolledBack.status, "rolled_back");
    assert.equal(rolledBack.restoredCaseIds.length, 1);
    assert.equal(store.snapshot().recruitingCases[0].caseOwnerId, 10);
    assert.equal(store.snapshot().recruitingCases[0].taskOwnerId, beforeRollbackTaskOwner);
    assert.equal(store.snapshot().recruitingCaseEvents.filter(item => item.eventType === "recruiter_owner_rebalance_rolled_back").length, 1);

    const replay = await repository.rollbackRecruiterOwnerRebalance(workspaceOne);
    assert.equal(replay.status, "noop");
    assert.equal(replay.restoredCaseIds.length, 0);

    const failingStore = makeStore();
    const failingRepository = new RecruitingRepository(failingStore);
    const failingCreated = await failingRepository.createCase({ ...createInput(), sourceId: "rollback-failure" });
    failingStore.setRoutingOwners({ masonId: 32, wayneId: 25, hardyId: 22 });
    await failingRepository.rebalanceRecruiterOwners(workspaceOne);
    failingStore.failNext("insert_event");
    await assert.rejects(() => failingRepository.rollbackRecruiterOwnerRebalance(workspaceOne));
    assert.equal(failingStore.snapshot().recruitingCases[0].caseOwnerId, 32);
    assert.equal(failingStore.snapshot().recruitingCaseEvents.filter(item => item.eventType === "recruiter_owner_rebalance_rolled_back").length, 0);
  });
});

describe("Recruiting repository create boundary", () => {
  it("atomically creates a case only when every related identity belongs to the workspace", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);

    const result = await repository.createCase(createInput());

    assert.equal(result.status, "created");
    assert.equal(result.case.workspaceId, 1);
    assert.equal(result.case.driverId, 100);
    assert.equal(result.case.leadId, 200);
    assert.equal(result.case.caseOwnerId, 10);
    assert.equal(result.case.taskOwnerId, 10);
    const response = serializeRecruitingMutationResponse(result);
    assert.equal(typeof (response.case as { createdAt: unknown }).createdAt, "string");
    assert.equal(typeof (response.case as { updatedAt: unknown }).updatedAt, "string");
  });

  it("rejects an unauthenticated workspace context and every cross-workspace related identity", async () => {
    const cases = [
      { context: { workspaceId: 1, userId: 999 }, patch: {} },
      { context: workspaceOne, patch: { driverId: 101 } },
      { context: workspaceOne, patch: { leadId: 201 } },
      { context: workspaceOne, patch: { caseOwnerId: 21 } },
      { context: workspaceOne, patch: { taskOwnerId: 21 } },
    ];

    for (const testCase of cases) {
      const repository = new RecruitingRepository(makeStore());
      await assert.rejects(
        () => repository.createCase({ ...createInput(testCase.context), ...testCase.patch }),
        RecruitingAuthorizationError,
      );
    }
  });

  it("returns a deterministic duplicate outcome and serializes concurrent active-case creation", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);

    const results = await Promise.all([
      repository.createCase(createInput()),
      repository.createCase(createInput()),
    ]);

    assert.deepEqual(results.map(result => result.status).sort(), ["created", "duplicate"]);
    assert.equal(store.snapshot().recruitingCases.length, 1);
    assert.equal(results.find(result => result.status === "duplicate")?.conflictCode, "ACTIVE_CASE_EXISTS");
  });

  it("rejects a creation idempotency key reused with changed or omitted request fields", async () => {
    const repository = new RecruitingRepository(makeStore());
    const input = {
      ...createInput(),
      sourceId: "create-semantic-conflict",
      stage: "new_lead" as const,
    };
    await repository.createCase(input);
    await assert.rejects(
      () => repository.createCase({ ...input, caseNumber: "REC-CHANGED" }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      () => repository.createCase({ ...input, stage: undefined }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });
});

describe("Recruiting repository transitions", () => {
  it("updates the case, appends one event, and persists both handoff effects atomically", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());

    const result = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review",
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    });

    assert.equal(result.status, "committed");
    assert.equal(result.case.stage, "manager_review");
    assert.equal(result.case.caseOwnerId, 10);
    assert.equal(result.case.taskOwnerId, 11);
    assert.equal(result.effects.length, 2);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 2);
    assert.equal(store.snapshot().recruitingTransitionEffects.length, 2);
  });

  it("replays the same transition idempotency key without duplicating events or effects", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    const input = {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review" as const,
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    };

    const first = await repository.transitionCase(workspaceOne, input);
    const replay = await repository.transitionCase(workspaceOne, {
      ...input,
      transitionIdempotencyKey: first.transitionIdempotencyKey,
    });

    assert.equal(replay.status, "replayed");
    assert.equal(replay.transitionIdempotencyKey, first.transitionIdempotencyKey);
    assert.deepEqual(replay.effects, first.effects);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 2);
    assert.equal(store.snapshot().recruitingTransitionEffects.length, 2);
  });

  it("rejects a transition idempotency key reused with a different semantic request", async () => {
    const repository = new RecruitingRepository(makeStore());
    const created = await repository.createCase(createInput());
    const input = {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review" as const,
      transitionIdempotencyKey: "transition-semantic-conflict",
      options: { managerId: "11", nextAction: "Manager reviews application", nextActionDueAt: new Date("2026-08-21T13:00:00.000Z") },
    };
    await repository.transitionCase(workspaceOne, input);
    await assert.rejects(
      () => repository.transitionCase(workspaceOne, { ...input, targetStage: "clearinghouse_pending" }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      () => repository.transitionCase(workspaceOne, { ...input, options: { ...input.options, managerId: "12" } }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        ...input,
        options: {
          nextAction: "Manager reviews application",
          nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
        },
      }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects replay when a previously supplied closed-lost field is omitted", async () => {
    const repository = new RecruitingRepository(makeStore());
    const created = await repository.createCase(createInput());
    const input = {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "closed_lost" as const,
      transitionIdempotencyKey: "closed-lost-omission-conflict",
      options: { closedLostReason: "other" as const, closedLostNote: "Candidate declined" },
    };
    await repository.transitionCase(workspaceOne, input);
    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        ...input,
        options: { closedLostNote: "Candidate declined" },
      }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("replays one successful transition when concurrent callers use the same key", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    const transitionIdempotencyKey = [
      "recruiting-transition",
      workspaceOne.workspaceId,
      created.case.id,
      `v${created.case.version}`,
      "application_received",
      "manager_review",
    ].join(":");
    const input = {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      transitionIdempotencyKey,
      targetStage: "manager_review" as const,
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    };

    const results = await Promise.all([
      repository.transitionCase(workspaceOne, input),
      repository.transitionCase(workspaceOne, input),
    ]);

    assert.deepEqual(results.map(result => result.status).sort(), ["committed", "replayed"]);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 2);
    assert.equal(store.snapshot().recruitingTransitionEffects.length, 2);
  });

  it("rejects a Manager Review assignee from another workspace before writing", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());

    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        caseId: created.case.id,
        expectedVersion: created.case.version,
        targetStage: "manager_review",
        options: {
          managerId: "21",
          nextAction: "Manager reviews application",
          nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
        },
      }),
      RecruitingAuthorizationError,
    );
    assert.equal(store.snapshot().recruitingCaseEvents.length, 1);
    assert.equal(store.snapshot().recruitingCases[0].taskOwnerId, 10);
  });

  it("requires a workspace manager assignee and the assigned manager's decision", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());

    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        caseId: created.case.id,
        expectedVersion: created.case.version,
        targetStage: "manager_review",
        options: {
          managerId: "13",
          nextAction: "Manager reviews application",
          nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
        },
      }),
      RecruitingAuthorizationError,
    );

    const handoff = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review",
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    });

    await assert.rejects(
      () => repository.transitionCase({ workspaceId: 1, userId: 12, workspaceRole: "manager" }, {
        caseId: handoff.case.id,
        expectedVersion: handoff.case.version,
        targetStage: "clearinghouse_pending",
        options: {
          managerDecision: "approve",
          nextAction: "Submit Clearinghouse request",
          nextActionDueAt: new Date("2026-08-21T14:00:00.000Z"),
        },
      }),
      RecruitingAuthorizationError,
    );
  });

  it("preserves Case Owner and returns Task Owner on manager approval and return", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    const handoff = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review",
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    });

    const approved = await repository.transitionCase({ workspaceId: 1, userId: 11, workspaceRole: "manager" }, {
      caseId: handoff.case.id,
      expectedVersion: handoff.case.version,
      targetStage: "clearinghouse_pending",
      options: {
        managerDecision: "approve",
        nextAction: "Submit Clearinghouse request",
        nextActionDueAt: new Date("2026-08-21T14:00:00.000Z"),
      },
    });
    assert.equal(approved.case.caseOwnerId, 10);
    assert.equal(approved.case.taskOwnerId, 10);

    const secondStore = makeStore();
    const secondRepository = new RecruitingRepository(secondStore);
    const secondCreated = await secondRepository.createCase(createInput());
    const secondHandoff = await secondRepository.transitionCase(workspaceOne, {
      caseId: secondCreated.case.id,
      expectedVersion: secondCreated.case.version,
      targetStage: "manager_review",
      options: {
        managerId: "11",
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
      },
    });
    const returned = await secondRepository.transitionCase({ workspaceId: 1, userId: 11, workspaceRole: "manager" }, {
      caseId: secondHandoff.case.id,
      expectedVersion: secondHandoff.case.version,
      targetStage: "application_received",
      options: {
        managerDecision: "return",
        nextAction: "Complete missing application details",
        nextActionDueAt: new Date("2026-08-21T15:00:00.000Z"),
      },
    });
    assert.equal(returned.case.caseOwnerId, 10);
    assert.equal(returned.case.taskOwnerId, 10);
  });

  it("rejects stale optimistic versions and rolls back a failed event/effect write", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    store.failNext("insert_effects");

    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        caseId: created.case.id,
        expectedVersion: created.case.version,
        targetStage: "manager_review",
        options: {
          managerId: "11",
          nextAction: "Manager reviews application",
          nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
        },
      }),
    );

    const afterRollback = store.snapshot().recruitingCases[0];
    assert.equal(afterRollback.stage, "application_received");
    assert.equal(afterRollback.version, created.case.version);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 1);
    assert.equal(store.snapshot().recruitingTransitionEffects.length, 0);

    await assert.rejects(
      () => repository.transitionCase(workspaceOne, {
        caseId: created.case.id,
        expectedVersion: created.case.version - 1,
        targetStage: "manager_review",
        options: {
          managerId: "11",
          nextAction: "Manager reviews application",
          nextActionDueAt: new Date("2026-08-21T13:00:00.000Z"),
        },
      }),
      RecruitingConflictError,
    );
  });
});

describe("Recruiting repository Future Follow-up and transfer", () => {
  it("treats not-due Future Follow-up as a no-op and atomically applies a due return", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase(createInput());
    const followUp = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "future_follow_up",
      options: {
        followUpDueAt: new Date("2026-08-22T12:00:00.000Z"),
        resumeStage: "contact_attempted",
        nextAction: "Call candidate later",
        nextActionDueAt: new Date("2026-08-21T16:00:00.000Z"),
      },
    });

    const early = await repository.returnFromFutureFollowUp(workspaceOne, {
      caseId: followUp.case.id,
      now: new Date("2026-08-22T11:59:59.000Z"),
    });
    assert.equal(early.status, "not_due");
    assert.equal(early.case.version, followUp.case.version);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 2);

    const returnInput = {
      caseId: followUp.case.id,
      expectedVersion: followUp.case.version,
      now: new Date("2026-08-22T12:00:00.000Z"),
      nextAction: "Resume contact attempt",
      nextActionDueAt: new Date("2026-08-22T16:00:00.000Z"),
      transitionIdempotencyKey: "future-return-replay",
    };
    const due = await repository.returnFromFutureFollowUp(workspaceOne, returnInput);
    assert.equal(due.status, "returned");
    assert.equal(due.case.stage, "contact_attempted");
    assert.equal(due.case.nextAction, "Resume contact attempt");
    assert.equal(store.snapshot().recruitingCaseEvents.length, 3);

    const replay = await repository.returnFromFutureFollowUp(workspaceOne, returnInput);
    assert.equal(replay.status, "replayed");
    assert.equal(replay.case.version, due.case.version);
    assert.equal(store.snapshot().recruitingCaseEvents.length, 3);
    const response = serializeRecruitingMutationResponse(replay);
    assert.equal(typeof (response.case as { createdAt: unknown }).createdAt, "string");
  });

  it("does not disclose another workspace's Future Follow-up replay", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const workspaceOneCase = await repository.createCase({
      ...createInput(),
      stage: "future_follow_up",
      followUpDueAt: new Date("2026-08-22T12:00:00.000Z"),
      resumeStage: "contact_attempted",
    });
    const workspaceTwoCase = await repository.createCase({
      ...createInput(workspaceTwo),
      driverId: 101,
      leadId: 201,
      caseNumber: "REC-00002",
      sourceId: "source-002",
      caseOwnerId: 20,
      taskOwnerId: 20,
      stage: "future_follow_up",
      followUpDueAt: new Date("2026-08-21T12:00:00.000Z"),
      resumeStage: "contact_attempted",
    });
    const returned = await repository.returnFromFutureFollowUp(workspaceTwo, {
      caseId: workspaceTwoCase.case.id,
      now: new Date("2026-08-22T12:00:00.000Z"),
      nextAction: "Resume candidate contact",
      nextActionDueAt: new Date("2026-08-22T16:00:00.000Z"),
    });
    assert.notEqual(returned.status, "not_due");
    if (returned.status === "not_due") throw new Error("expected a due Future Follow-up return");

    await assert.rejects(
      () => repository.returnFromFutureFollowUp(workspaceOne, {
        caseId: workspaceOneCase.case.id,
        now: new Date("2026-08-22T12:00:00.000Z"),
        nextAction: "Resume candidate contact",
        nextActionDueAt: new Date("2026-08-22T16:00:00.000Z"),
        transitionIdempotencyKey: returned.transitionIdempotencyKey,
      }),
      RecruitingAuthorizationError,
    );
  });

  it("rejects a Future Follow-up replay key reused with a different action", async () => {
    const repository = new RecruitingRepository(makeStore());
    const created = await repository.createCase({ ...createInput(), stage: "future_follow_up", followUpDueAt: new Date("2026-08-21T12:00:00.000Z"), resumeStage: "contact_attempted" });
    const input = {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      now: new Date("2026-08-22T12:00:00.000Z"),
      nextAction: "Resume candidate contact",
      nextActionDueAt: new Date("2026-08-22T16:00:00.000Z"),
      transitionIdempotencyKey: "follow-up-semantic-conflict",
    };
    await repository.returnFromFutureFollowUp(workspaceOne, input);
    await assert.rejects(
      () => repository.returnFromFutureFollowUp(workspaceOne, { ...input, nextAction: "A different action" }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("transfers to Onboarding exactly once, is workspace-safe, and rolls back partial transfer work", async () => {
    const store = makeStore();
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase({
      ...createInput(),
      stage: "ready_for_onboarding",
    });
    const hired = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "hired_transferred_to_onboarding",
      options: {},
    });

    await assert.rejects(
      () => repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        transferIdempotencyKey: "transfer-cross-workspace",
        targetOnboardingCaseId: 900,
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
      RecruitingAuthorizationError,
    );

    store.failNext("insert_onboarding_case");
    await assert.rejects(
      () => repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        transferIdempotencyKey: "transfer-001",
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
    );
    assert.equal(store.snapshot().recruitingOnboardingTransfers.length, 0);
    assert.equal(store.snapshot().onboardingCases.filter(item => item.workspaceId === 1).length, 0);
    assert.equal(store.snapshot().recruitingCases[0].transferStatus, "not_requested");

    const attempts = await Promise.all([
      repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        transferIdempotencyKey: "transfer-001",
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
      repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        transferIdempotencyKey: "transfer-001",
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
    ]);
    assert.equal(store.snapshot().recruitingOnboardingTransfers.length, 1);
    assert.equal(store.snapshot().onboardingCases.filter(item => item.workspaceId === 1).length, 1);
    assert.equal(attempts[0].onboardingCase.id, attempts[1].onboardingCase.id);
    const transferResponse = serializeRecruitingTransferResponse(attempts[0]);
    assert.equal(transferResponse.status, "completed");
    await assert.rejects(
      () => repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        expectedVersion: hired.case.version,
        transferIdempotencyKey: "transfer-001",
        recruiterName: "Different recruiter",
        sourceChannel: "manual",
      }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );

    const secondCreated = await repository.createCase({
      ...createInput(),
      caseNumber: "REC-00002",
      sourceId: "source-002",
      stage: "ready_for_onboarding",
    });
    const secondHired = await repository.transitionCase(workspaceOne, {
      caseId: secondCreated.case.id,
      expectedVersion: secondCreated.case.version,
      targetStage: "hired_transferred_to_onboarding",
      options: {},
    });
    await assert.rejects(
      () => repository.transferToOnboarding(workspaceOne, {
        caseId: secondHired.case.id,
        transferIdempotencyKey: "transfer-001",
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
      RecruitingConflictError,
    );
  });

  it("creates and binds one driver for a Franklin-only case atomically before its first Onboarding case", async () => {
    const store = makeFranklinTransferStore();
    const repository = new RecruitingRepository(store);
    const input = {
      caseId: 300,
      transferIdempotencyKey: "franklin-transfer-001",
      recruiterName: "Franklin Recruiter",
      sourceChannel: "franklins.ai",
    };

    store.failNext("insert_onboarding_case");
    await assert.rejects(() => repository.transferToOnboarding(workspaceOne, input));
    assert.equal(store.snapshot().drivers.length, 0);
    assert.equal(store.snapshot().recruitingCases[0].driverId, null);
    assert.equal(store.snapshot().onboardingCases.length, 0);

    const results = await Promise.all([
      repository.transferToOnboarding(workspaceOne, input),
      repository.transferToOnboarding(workspaceOne, input),
    ]);
    const state = store.snapshot();
    assert.equal(state.drivers.length, 1);
    assert.equal(state.onboardingCases.length, 1);
    assert.equal(state.recruitingOnboardingTransfers.length, 1);
    assert.equal(state.recruitingCases[0].driverId, state.drivers[0].id);
    assert.equal(state.onboardingCases[0].driverId, state.drivers[0].id);
    assert.equal(state.drivers[0].leadId, 203);
    assert.equal(results[0].onboardingCase.id, results[1].onboardingCase.id);
  });

  it("rejects an idempotency key already used by a stage transition before transfer writes", async () => {
    const repository = new RecruitingRepository(makeStore());
    const created = await repository.createCase({ ...createInput(), stage: "ready_for_onboarding" });
    const hired = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "hired_transferred_to_onboarding",
      transitionIdempotencyKey: "shared-transition-transfer-key",
      options: {},
    });
    await assert.rejects(
      () => repository.transferToOnboarding(workspaceOne, {
        caseId: hired.case.id,
        expectedVersion: hired.case.version,
        transferIdempotencyKey: "shared-transition-transfer-key",
        recruiterName: "Recruiter",
        sourceChannel: "manual",
      }),
      (error: unknown) => error instanceof RecruitingConflictError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });

  it("accepts ISO dueBefore query strings", () => {
    const parsed = ListRecruitingCasesQueryParams.safeParse({ dueBefore: "2026-08-22T16:00:00.000Z" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.ok(parsed.data.dueBefore instanceof Date);
  });

  it("completes a same-workspace transfer to an existing target only after the pending ledger row", async () => {
    const store = makeStore({ includeWorkspaceOneTarget: true });
    const repository = new RecruitingRepository(store);
    const created = await repository.createCase({
      ...createInput(),
      stage: "ready_for_onboarding",
    });
    const hired = await repository.transitionCase(workspaceOne, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "hired_transferred_to_onboarding",
      options: {},
    });

    const transfer = await repository.transferToOnboarding(workspaceOne, {
      caseId: hired.case.id,
      transferIdempotencyKey: "transfer-existing-target",
      targetOnboardingCaseId: 901,
      recruiterName: "Recruiter",
      sourceChannel: "manual",
    });

    assert.equal(transfer.status, "completed");
    assert.equal(transfer.onboardingCase.id, 901);
    assert.equal(transfer.onboardingCase.recruitingCaseId, hired.case.id);
    assert.equal(store.snapshot().recruitingOnboardingTransfers.length, 1);
    assert.equal(store.snapshot().recruitingOnboardingTransfers[0].onboardingCaseId, 901);
  });
});