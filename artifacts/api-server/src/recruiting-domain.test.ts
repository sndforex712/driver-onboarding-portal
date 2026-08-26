import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLOSED_LOST_REASONS,
  RECRUITING_STAGES,
  applyRecruitingTransition,
  assertActiveCaseFields,
  assertCanCreateRecruitingCase,
  getRecruitingSla,
  makeRecruitingTransitionIdempotencyKey,
  returnFromFutureFollowUp,
  type RecruitingCase,
  type RecruitingStage,
} from "./lib/recruiting-domain.ts";

const now = new Date("2026-08-20T12:00:00.000Z");
const freshDueAt = new Date("2026-08-20T18:00:00.000Z");

const baseCase = (overrides: Partial<RecruitingCase> = {}): RecruitingCase => ({
  id: "case_001",
  workspaceId: "workspace_001",
  driverId: "driver_001",
  caseOwnerId: "recruiter_001",
  taskOwnerId: "recruiter_001",
  stage: "new_lead",
  nextAction: "Make first contact",
  nextActionDueAt: new Date("2026-08-20T16:00:00.000Z"),
  version: 1,
  ...overrides,
});

function transition(
  current: RecruitingCase,
  targetStage: RecruitingStage,
  options: Parameters<typeof applyRecruitingTransition>[2] = {},
) {
  return applyRecruitingTransition(current, targetStage, {
    ...options,
  });
}

describe("Recruiting stages", () => {
  it("defines the complete 16-stage Recruiting pipeline", () => {
    assert.deepEqual(RECRUITING_STAGES, [
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
    ]);
  });

  it("allows every defined forward transition", () => {
    const allowed: Array<[RecruitingStage, RecruitingStage]> = [
      ["new_lead", "contact_attempted"],
      ["contact_attempted", "connected_prequalified"],
      ["connected_prequalified", "application_sent"],
      ["application_sent", "application_received"],
      ["application_received", "manager_review"],
      ["manager_review", "clearinghouse_pending"],
      ["manager_review", "application_received"],
      ["clearinghouse_pending", "drug_test_scheduled"],
      ["drug_test_scheduled", "drug_test_passed"],
      ["drug_test_passed", "compliance_documents_pending"],
      ["compliance_documents_pending", "contract_sent"],
      ["contract_sent", "contract_signed"],
      ["contract_signed", "ready_for_onboarding"],
      ["ready_for_onboarding", "hired_transferred_to_onboarding"],
    ];

    for (const [from, to] of allowed) {
      const managerDecision =
        from === "manager_review" && to === "clearinghouse_pending" ? "approve"
          : from === "manager_review" && to === "application_received" ? "return"
            : undefined;
      const result = transition(baseCase({ stage: from }), to, {
        managerId: "manager_001",
        managerDecision,
        nextAction: `${to} next action`,
        nextActionDueAt: freshDueAt,
      });
      assert.equal(result.case.stage, to, `${from} should allow ${to}`);
      if (to !== "hired_transferred_to_onboarding") {
        assert.equal(result.case.nextAction, `${to} next action`);
        assert.equal(result.case.nextActionDueAt, freshDueAt);
      }
    }
  });

  it("rejects skips, backwards moves, terminal re-entry, and direct Future Follow-up entry", () => {
    const rejected: Array<[RecruitingStage, RecruitingStage]> = [
      ["new_lead", "application_received"],
      ["application_received", "application_sent"],
      ["manager_review", "contract_signed"],
      ["contract_signed", "drug_test_passed"],
      ["hired_transferred_to_onboarding", "new_lead"],
      ["closed_lost", "new_lead"],
      ["future_follow_up", "contact_attempted"],
    ];

    for (const [from, to] of rejected) {
      const current = from === "future_follow_up"
        ? baseCase({
            stage: "future_follow_up",
            resumeStage: "contact_attempted",
            followUpDueAt: new Date("2026-08-21T12:00:00.000Z"),
          })
        : baseCase({ stage: from });
      assert.throws(
        () => transition(current, to),
        /invalid|not allowed|requires/i,
        `${from} should reject ${to}`,
      );
    }

    assert.throws(
      () => transition(
        baseCase({
          stage: "future_follow_up",
          resumeStage: "contact_attempted",
          followUpDueAt: new Date("2026-08-21T12:00:00.000Z"),
        }),
        "future_follow_up",
        {
          followUpDueAt: new Date("2026-08-22T12:00:00.000Z"),
          resumeStage: "contact_attempted",
        },
      ),
      /not allowed/i,
      "Future Follow-up must return through its due-date function, not transition into itself",
    );
  });
});

describe("Recruiting ownership handoffs", () => {
  it("keeps Application Sent → Application Received recruiter-owned", () => {
    const current = baseCase({
      stage: "application_sent",
      caseOwnerId: "recruiter_001",
      taskOwnerId: "recruiter_001",
    });

    const result = transition(current, "application_received", {
      managerId: "manager_001",
      nextAction: "Verify received application completeness",
      nextActionDueAt: freshDueAt,
    });

    assert.equal(result.case.stage, "application_received");
    assert.equal(result.case.caseOwnerId, "recruiter_001");
    assert.equal(result.case.taskOwnerId, "recruiter_001");
    assert.equal(result.effects.filter(effect => effect.kind === "manager_review_task").length, 0);
  });

  it("creates exactly one manager-review handoff on Application Received → Manager Review", () => {
    const current = baseCase({ stage: "application_received" });
    const first = transition(current, "manager_review", {
      managerId: "manager_001",
      nextAction: "Review application",
      nextActionDueAt: freshDueAt,
    });

    assert.equal(first.case.stage, "manager_review");
    assert.equal(first.case.caseOwnerId, "recruiter_001");
    assert.equal(first.case.taskOwnerId, "manager_001");
    assert.equal(first.effects.filter(effect => effect.kind === "manager_review_task").length, 1);
    assert.equal(first.effects.length, 2);
    assert.notEqual(first.effects[0].idempotencyKey, first.effects[1].idempotencyKey);
    assert.equal(
      first.effects[0].idempotencyKey.replace(/:stage_transition$/, ""),
      first.effects[1].idempotencyKey.replace(/:manager_review_task$/, ""),
    );
    assert.equal(first.transitionIdempotencyKey, first.effects[0].idempotencyKey.replace(/:stage_transition$/, ""));

    const replay = transition(current, "manager_review", {
      managerId: "manager_001",
      nextAction: "Review application",
      nextActionDueAt: freshDueAt,
      appliedIdempotencyKeys: first.appliedIdempotencyKeys,
    });

    assert.deepEqual(replay.case, current);
    assert.equal(replay.effects.length, 0);
    assert.deepEqual(replay.appliedIdempotencyKeys, first.appliedIdempotencyKeys);
  });

  it("returns task ownership to the Case Owner on manager approval", () => {
    const current = baseCase({
      stage: "manager_review",
      taskOwnerId: "manager_001",
    });

    const result = transition(current, "clearinghouse_pending", {
      managerId: "manager_001",
      managerDecision: "approve",
      nextAction: "Submit Clearinghouse request",
      nextActionDueAt: freshDueAt,
    });

    assert.equal(result.case.stage, "clearinghouse_pending");
    assert.equal(result.case.caseOwnerId, "recruiter_001");
    assert.equal(result.case.taskOwnerId, "recruiter_001");
  });

  it("returns task ownership to the Case Owner on manager return", () => {
    const current = baseCase({
      stage: "manager_review",
      taskOwnerId: "manager_001",
    });

    const result = transition(current, "application_received", {
      managerId: "manager_001",
      managerDecision: "return",
      nextAction: "Complete missing application details",
      nextActionDueAt: freshDueAt,
    });

    assert.equal(result.case.stage, "application_received");
    assert.equal(result.case.caseOwnerId, "recruiter_001");
    assert.equal(result.case.taskOwnerId, "recruiter_001");
  });

  it("rejects a successful active-stage transition without a fresh action or due time", () => {
    const current = baseCase({ stage: "contact_attempted" });

    for (const options of [
      { nextAction: undefined, nextActionDueAt: freshDueAt },
      { nextAction: "   ", nextActionDueAt: freshDueAt },
      { nextAction: "Call candidate", nextActionDueAt: undefined },
      { nextAction: "Call candidate", nextActionDueAt: new Date("invalid") },
      {
        nextAction: current.nextAction,
        nextActionDueAt: current.nextActionDueAt,
      },
    ]) {
      assert.throws(
        () => transition(current, "connected_prequalified", options),
        /nextAction|nextActionDueAt/i,
      );
    }
  });
});

describe("RecruitingCase invariants", () => {
  it("requires Case Owner, Task Owner, next action, and due time for active cases", () => {
    const requiredFields: Array<keyof RecruitingCase> = [
      "caseOwnerId",
      "taskOwnerId",
      "nextAction",
      "nextActionDueAt",
    ];

    for (const field of requiredFields) {
      const invalid = baseCase({ [field]: null } as Partial<RecruitingCase>);
      assert.throws(
        () => assertActiveCaseFields(invalid),
        new RegExp(field),
        `${field} must be required for active cases`,
      );
    }

    assert.doesNotThrow(() => assertActiveCaseFields(baseCase()));
    assert.doesNotThrow(() =>
      assertActiveCaseFields(baseCase({ stage: "hired_transferred_to_onboarding" })),
    );
  });

  it("requires Future Follow-up due time and resume stage", () => {
    assert.throws(
      () => transition(baseCase(), "future_follow_up", {
        nextAction: "Call candidate after follow-up",
        nextActionDueAt: new Date("2026-08-21T12:00:00.000Z"),
      }),
      /follow.?up.*due|resume.*stage/i,
    );

    const result = transition(baseCase(), "future_follow_up", {
      followUpDueAt: new Date("2026-08-21T12:00:00.000Z"),
      resumeStage: "contact_attempted",
      nextAction: "Call candidate after follow-up",
      nextActionDueAt: new Date("2026-08-21T12:00:00.000Z"),
    });

    assert.equal(result.case.stage, "future_follow_up");
    assert.equal(result.case.resumeStage, "contact_attempted");
    assert.equal(result.case.followUpDueAt?.toISOString(), "2026-08-21T12:00:00.000Z");
    assert.equal(result.case.nextAction, "Call candidate after follow-up");
  });

  it("returns Future Follow-up to its resume stage only when due", () => {
    const followUp = baseCase({
      stage: "future_follow_up",
      resumeStage: "contact_attempted",
      followUpDueAt: new Date("2026-08-21T12:00:00.000Z"),
    });

    const early = returnFromFutureFollowUp(followUp, new Date("2026-08-21T11:59:59.999Z"));
    assert.equal(early.status, "not_due");
    assert.deepEqual(early.case, followUp);
    assert.equal(early.effects.length, 0);

    assert.throws(
      () => returnFromFutureFollowUp(followUp, new Date("2026-08-21T12:00:00.000Z")),
      /nextAction|nextActionDueAt/i,
    );

    const due = returnFromFutureFollowUp(
      followUp,
      new Date("2026-08-21T12:00:00.000Z"),
      {
        nextAction: "Resume contact attempt",
        nextActionDueAt: new Date("2026-08-21T16:00:00.000Z"),
      },
    );
    assert.equal(due.status, "returned");
    assert.equal(due.case.stage, "contact_attempted");
    assert.equal(due.case.resumeStage, undefined);
    assert.equal(due.case.followUpDueAt, undefined);
    assert.equal(due.case.nextAction, "Resume contact attempt");
    assert.equal(due.case.nextActionDueAt?.toISOString(), "2026-08-21T16:00:00.000Z");
    assert.equal(due.effects.length, 1);
  });

  it("requires a structured reason for closed-lost", () => {
    assert.ok(CLOSED_LOST_REASONS.length > 1);
    assert.throws(
      () => transition(baseCase(), "closed_lost"),
      /closed.?lost.*reason/i,
    );

    const result = transition(baseCase(), "closed_lost", {
      closedLostReason: "no_response",
    });
    assert.equal(result.case.stage, "closed_lost");
    assert.equal(result.case.closedLostReason, "no_response");
  });

  it("validates the current active case before terminal transitions", () => {
    const invalidCurrent = baseCase({
      stage: "new_lead",
      taskOwnerId: null,
    });

    assert.throws(
      () => transition(invalidCurrent, "closed_lost", {
        closedLostReason: "no_response",
      }),
      /taskOwnerId/i,
    );

    const invalidBeforeHire = baseCase({
      stage: "ready_for_onboarding",
      nextAction: null,
    });
    assert.throws(
      () => transition(invalidBeforeHire, "hired_transferred_to_onboarding"),
      /nextAction/i,
    );
  });
});

describe("one active RecruitingCase per Driver/workspace", () => {
  it("rejects a second active case for the same Driver in the same workspace", () => {
    assert.throws(
      () =>
        assertCanCreateRecruitingCase({
          workspaceId: "workspace_001",
          driverId: "driver_001",
          existingCases: [
            baseCase({ stage: "application_received" }),
          ],
        }),
      /active.*case/i,
    );
  });

  it("allows a historical case to be rehired and creates a new active attempt", () => {
    assert.doesNotThrow(() =>
      assertCanCreateRecruitingCase({
        workspaceId: "workspace_001",
        driverId: "driver_001",
        existingCases: [
          baseCase({ stage: "hired_transferred_to_onboarding" }),
        ],
      }),
    );
  });

  it("allows the same Driver to have an active case in another workspace", () => {
    assert.doesNotThrow(() =>
      assertCanCreateRecruitingCase({
        workspaceId: "workspace_002",
        driverId: "driver_001",
        existingCases: [
          baseCase({ stage: "application_received" }),
        ],
      }),
    );
  });
});

describe("Recruiting SLA", () => {
  it("calculates configurable green, yellow, and red states", () => {
    const config = { yellowThresholdMs: 2 * 60 * 60 * 1000 };

    assert.equal(
      getRecruitingSla({
        dueAt: new Date("2026-08-20T16:00:00.000Z"),
        now,
        config,
        assigned: true,
      }).color,
      "green",
    );
    assert.equal(
      getRecruitingSla({
        dueAt: new Date("2026-08-20T13:00:00.000Z"),
        now,
        config,
        assigned: true,
      }).color,
      "yellow",
    );
    assert.equal(
      getRecruitingSla({
        dueAt: new Date("2026-08-20T11:59:59.999Z"),
        now,
        config,
        assigned: true,
      }).color,
      "red",
    );
  });

  it("escalates overdue and unassigned work to the Manager War Room", () => {
    const config = { yellowThresholdMs: 2 * 60 * 60 * 1000 };
    assert.equal(
      getRecruitingSla({
        dueAt: new Date("2026-08-20T11:00:00.000Z"),
        now,
        config,
        assigned: true,
      }).escalateToWarRoom,
      true,
    );
    assert.equal(
      getRecruitingSla({
        dueAt: new Date("2026-08-20T16:00:00.000Z"),
        now,
        config,
        assigned: false,
      }).escalateToWarRoom,
      true,
    );
  });
});

describe("Recruiting transition idempotency", () => {
  it("generates the same key for the same logical transition", () => {
    const input = {
      workspaceId: "workspace_001",
      caseId: "case_001",
      fromStage: "application_received" as const,
      toStage: "manager_review" as const,
      version: 7,
    };

    assert.equal(
      makeRecruitingTransitionIdempotencyKey(input),
      makeRecruitingTransitionIdempotencyKey({ ...input }),
    );
  });

  it("changes the key when the case version or transition changes", () => {
    const key = makeRecruitingTransitionIdempotencyKey({
      workspaceId: "workspace_001",
      caseId: "case_001",
      fromStage: "application_received",
      toStage: "manager_review",
      version: 7,
    });

    assert.notEqual(
      key,
      makeRecruitingTransitionIdempotencyKey({
        workspaceId: "workspace_001",
        caseId: "case_001",
        fromStage: "application_received",
        toStage: "manager_review",
        version: 8,
      }),
    );
    assert.notEqual(
      key,
      makeRecruitingTransitionIdempotencyKey({
        workspaceId: "workspace_001",
        caseId: "case_001",
        fromStage: "manager_review",
        toStage: "clearinghouse_pending",
        version: 7,
      }),
    );
  });
});