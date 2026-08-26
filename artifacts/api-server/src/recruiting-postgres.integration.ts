import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import {
  appUsersTable,
  db,
  driversTable,
  leadsTable,
  onboardingCasesTable,
  pool,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  recruitingOnboardingTransfersTable,
  recruitingTransitionEffectsTable,
  workspaceMembershipsTable,
  workspacesTable,
} from "@workspace/db";
import {
  DrizzleRecruitingStore,
  RecruitingAuthorizationError,
  RecruitingConflictError,
  RecruitingRepository,
  type RecruitingWorkspaceContext,
} from "./lib/recruiting-repository";

const runId = `pgit-${Date.now()}-${process.pid}`;
let fixtureIndex = 0;
const repository = new RecruitingRepository(new DrizzleRecruitingStore());

type Fixture = {
  context: RecruitingWorkspaceContext;
  workspaceId: number;
  ownerId: number;
  managerId: number;
  driverId: number;
  leadId: number;
};

function nextLabel(label: string): string {
  fixtureIndex += 1;
  return `${runId}-${label}-${fixtureIndex}`;
}

async function expectReject(work: () => Promise<unknown>, type: new (...args: any[]) => Error): Promise<void> {
  let thrown: unknown;
  try {
    await work();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof type, `expected ${type.name}, received ${String(thrown)}`);
}

async function createFixture(label: string): Promise<Fixture> {
  const token = nextLabel(label);
  const [owner] = await db.insert(appUsersTable).values({
    name: `PG ${token} owner`,
    email: `${token}-owner@example.test`,
    role: "owner_admin",
    avatarInitials: "PO",
    isCurrentSession: "false",
  }).returning();
  const [manager] = await db.insert(appUsersTable).values({
    name: `PG ${token} manager`,
    email: `${token}-manager@example.test`,
    role: "manager",
    avatarInitials: "PM",
    isCurrentSession: "false",
  }).returning();
  const [workspace] = await db.insert(workspacesTable).values({
    name: `PG ${token}`,
    slug: token,
    status: "active",
  }).returning();
  await db.insert(workspaceMembershipsTable).values([
    { workspaceId: workspace.id, userId: owner.id, role: "owner_admin" },
    { workspaceId: workspace.id, userId: manager.id, role: "manager" },
  ]);
  const [lead] = await db.insert(leadsTable).values({
    workspaceId: workspace.id,
    fullName: `Driver ${token}`,
    recruiterName: "Integration recruiter",
    sourceChannel: "postgres-integration",
    status: "pending",
  }).returning();
  const [driver] = await db.insert(driversTable).values({
    workspaceId: workspace.id,
    leadId: lead.id,
    fullName: `Driver ${token}`,
    driverType: "owner_operator",
    status: "pre_hire",
    stage: "Application",
    priority: "medium",
    recruiterName: "Integration recruiter",
    sourceChannel: "postgres-integration",
  }).returning();
  return {
    context: { workspaceId: workspace.id, userId: owner.id },
    workspaceId: workspace.id,
    ownerId: owner.id,
    managerId: manager.id,
    driverId: driver.id,
    leadId: lead.id,
  };
}

function caseInput(fixture: Fixture, label: string, stage: "application_received" | "ready_for_onboarding" = "application_received") {
  return {
    context: fixture.context,
    driverId: fixture.driverId,
    leadId: fixture.leadId,
    caseNumber: `REC-${nextLabel(label)}`,
    sourceId: `source-${nextLabel(label)}`,
    caseOwnerId: fixture.ownerId,
    taskOwnerId: fixture.ownerId,
    stage,
    nextAction: "Complete Recruiting action",
    nextActionDueAt: new Date("2035-01-02T00:00:00.000Z"),
    slaDeadlineAt: new Date("2035-01-03T00:00:00.000Z"),
  };
}

async function createHiredCase(fixture: Fixture) {
  const created = await repository.createCase(caseInput(fixture, "hired", "ready_for_onboarding"));
  assert.equal(created.status, "created");
  const hired = await repository.transitionCase(fixture.context, {
    caseId: created.case.id,
    expectedVersion: created.case.version,
    targetStage: "hired_transferred_to_onboarding",
    options: {},
    transitionIdempotencyKey: nextLabel("hire-transition"),
  });
  return hired.case;
}

async function installFailpoint(
  table: "recruiting_case_events" | "recruiting_transition_effects" | "recruiting_onboarding_transfers" | "onboarding_cases",
  workspaceId: number,
): Promise<void> {
  const name = `recruiting_fail_${runId.replaceAll("-", "_")}_${fixtureIndex}`;
  await db.execute(sql.raw(`
    CREATE FUNCTION ${name}() RETURNS trigger AS $$
    BEGIN
      IF NEW.workspace_id = ${workspaceId}
         AND current_setting('app.recruiting_failpoint', true) = TG_TABLE_NAME
      THEN RAISE EXCEPTION 'recruiting integration failpoint'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}();
  `));
}

function failpointRepository(table: string): RecruitingRepository {
  return new RecruitingRepository(new DrizzleRecruitingStore(async transaction => {
    await transaction.execute(sql.raw(`set local app.recruiting_failpoint = '${table}'`));
  }));
}

async function main(): Promise<void> {
  const migrationCheck = await db.execute(sql`select to_regclass('public.recruiting_cases') as recruiting_cases`);
  assert.equal(migrationCheck.rows[0]?.recruiting_cases, "recruiting_cases", "approved Recruiting migration must be applied");

  // PostgreSQL's partial unique index wins a true concurrent insert race and the repository returns one duplicate outcome.
  const duplicateFixture = await createFixture("duplicate");
  const duplicateInput = caseInput(duplicateFixture, "duplicate");
  const duplicates = await Promise.all([
    repository.createCase(duplicateInput),
    repository.createCase(duplicateInput),
  ]);
  assert.deepEqual(duplicates.map(result => result.status).sort(), ["created", "duplicate"]);
  await expectReject(
    () => repository.createCase({ ...duplicateInput, caseNumber: `${duplicateInput.caseNumber}-changed` }),
    RecruitingConflictError,
  );

  // A real stale version rolls back the losing transaction; a shared key replays the committed event.
  const transitionFixture = await createFixture("transition");
  const transitionCreated = await repository.createCase(caseInput(transitionFixture, "transition"));
  assert.equal(transitionCreated.status, "created");
  const transitionKey = nextLabel("transition-key");
  const transitionInput = {
    caseId: transitionCreated.case.id,
    expectedVersion: transitionCreated.case.version,
    targetStage: "manager_review" as const,
    transitionIdempotencyKey: transitionKey,
    options: {
      managerId: String(transitionFixture.managerId),
      nextAction: "Manager reviews application",
      nextActionDueAt: new Date("2035-01-04T00:00:00.000Z"),
    },
  };
  const transitionResults = await Promise.all([
    repository.transitionCase(transitionFixture.context, transitionInput),
    repository.transitionCase(transitionFixture.context, transitionInput),
  ]);
  assert.deepEqual(transitionResults.map(result => result.status).sort(), ["committed", "replayed"]);
  await expectReject(
    () => repository.transitionCase(transitionFixture.context, { ...transitionInput, transitionIdempotencyKey: nextLabel("stale-key") }),
    RecruitingConflictError,
  );
  const events = await db.select().from(recruitingCaseEventsTable)
    .where(eq(recruitingCaseEventsTable.recruitingCaseId, transitionCreated.case.id));
  const effects = await db.select().from(recruitingTransitionEffectsTable)
    .where(eq(recruitingTransitionEffectsTable.recruitingCaseId, transitionCreated.case.id));
  assert.equal(events.length, 2);
  assert.equal(effects.length, 2);

  // A due Future Follow-up return replays before considering its original optimistic version.
  const followUpFixture = await createFixture("future-follow-up");
  const futureCreated = await repository.createCase({
    ...caseInput(followUpFixture, "future-follow-up"),
    stage: "future_follow_up",
    followUpDueAt: new Date("2034-01-01T00:00:00.000Z"),
    resumeStage: "contact_attempted",
  });
  assert.equal(futureCreated.status, "created");
  const futureReturnInput = {
    caseId: futureCreated.case.id,
    expectedVersion: futureCreated.case.version,
    now: new Date("2035-01-04T00:00:00.000Z"),
    nextAction: "Resume candidate contact",
    nextActionDueAt: new Date("2035-01-05T00:00:00.000Z"),
    transitionIdempotencyKey: nextLabel("future-return"),
  };
  const futureReturned = await repository.returnFromFutureFollowUp(followUpFixture.context, futureReturnInput);
  const futureReplayed = await repository.returnFromFutureFollowUp(followUpFixture.context, futureReturnInput);
  assert.equal(futureReturned.status, "returned");
  assert.equal(futureReplayed.status, "replayed");
  const futureEvents = await db.select().from(recruitingCaseEventsTable)
    .where(eq(recruitingCaseEventsTable.recruitingCaseId, futureCreated.case.id));
  assert.equal(futureEvents.length, 2);

  // Triggered SQL failures prove all earlier transition writes roll back together.
  for (const table of ["recruiting_case_events", "recruiting_transition_effects"] as const) {
    const fixture = await createFixture(`rollback-${table}`);
    const created = await repository.createCase(caseInput(fixture, "rollback"));
    assert.equal(created.status, "created");
    await installFailpoint(table, fixture.workspaceId);
    await expectReject(() => failpointRepository(table).transitionCase(fixture.context, {
      caseId: created.case.id,
      expectedVersion: created.case.version,
      targetStage: "manager_review",
      transitionIdempotencyKey: nextLabel(`fail-${table}`),
      options: {
        managerId: String(fixture.managerId),
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2035-01-04T00:00:00.000Z"),
      },
    }), Error);
    const [after] = await db.select().from(recruitingCasesTable).where(eq(recruitingCasesTable.id, created.case.id));
    assert.equal(after.stage, "application_received");
    assert.equal(after.version, 1);
    const [eventCount] = await db.select({ count: sql<number>`count(*)` }).from(recruitingCaseEventsTable)
      .where(eq(recruitingCaseEventsTable.recruitingCaseId, created.case.id));
    assert.equal(Number(eventCount.count), 1);
  }

  // Same-workspace supplied target receives exactly one transfer under a concurrent replay.
  const transferFixture = await createFixture("transfer-target");
  const hired = await createHiredCase(transferFixture);
  const [target] = await db.insert(onboardingCasesTable).values({
    workspaceId: transferFixture.workspaceId,
    driverId: transferFixture.driverId,
    leadId: transferFixture.leadId,
    recruitingCaseId: null,
    externalRecruitId: nextLabel("target"),
    recruiterName: "Integration recruiter",
    sourceChannel: "postgres-integration",
    status: "open",
  }).returning();
  const transferInput = {
    caseId: hired.id,
    expectedVersion: hired.version,
    transferIdempotencyKey: nextLabel("transfer-key"),
    targetOnboardingCaseId: target.id,
    recruiterName: "Integration recruiter",
    sourceChannel: "postgres-integration",
  };
  const transfers = await Promise.all([
    repository.transferToOnboarding(transferFixture.context, transferInput),
    repository.transferToOnboarding(transferFixture.context, transferInput),
  ]);
  assert.deepEqual(transfers.map(result => result.status).sort(), ["completed", "replayed"]);
  assert.equal(transfers[0].onboardingCase.id, target.id);
  const [transferCount] = await db.select({ count: sql<number>`count(*)` }).from(recruitingOnboardingTransfersTable)
    .where(eq(recruitingOnboardingTransfersTable.recruitingCaseId, hired.id));
  assert.equal(Number(transferCount.count), 1);

  // A transition key cannot be reused for a transfer, even when both writes target the same case.
  const collisionFixture = await createFixture("transfer-key-collision");
  const collisionCreated = await repository.createCase(caseInput(collisionFixture, "transfer-key-collision", "ready_for_onboarding"));
  const collisionKey = nextLabel("shared-transition-transfer-key");
  const collisionHired = await repository.transitionCase(collisionFixture.context, {
    caseId: collisionCreated.case.id,
    expectedVersion: collisionCreated.case.version,
    targetStage: "hired_transferred_to_onboarding",
    transitionIdempotencyKey: collisionKey,
    options: {},
  });
  await expectReject(
    () => repository.transferToOnboarding(collisionFixture.context, {
      caseId: collisionHired.case.id,
      expectedVersion: collisionHired.case.version,
      transferIdempotencyKey: collisionKey,
      recruiterName: "Integration recruiter",
      sourceChannel: "postgres-integration",
    }),
    RecruitingConflictError,
  );

  // An SQL failure after the transfer ledger write does not leak a pending transfer or an Onboarding case.
  const rollbackTransferFixture = await createFixture("transfer-rollback");
  const rollbackHired = await createHiredCase(rollbackTransferFixture);
  await installFailpoint("onboarding_cases", rollbackTransferFixture.workspaceId);
  await expectReject(() => failpointRepository("onboarding_cases").transferToOnboarding(rollbackTransferFixture.context, {
    caseId: rollbackHired.id,
    expectedVersion: rollbackHired.version,
    transferIdempotencyKey: nextLabel("transfer-fail"),
    recruiterName: "Integration recruiter",
    sourceChannel: "postgres-integration",
  }), Error);
  const [transferAfterFailure] = await db.select().from(recruitingCasesTable)
    .where(eq(recruitingCasesTable.id, rollbackHired.id));
  assert.equal(transferAfterFailure.transferStatus, "not_requested");
  const [failedTransferCount] = await db.select({ count: sql<number>`count(*)` }).from(recruitingOnboardingTransfersTable)
    .where(eq(recruitingOnboardingTransfersTable.recruitingCaseId, rollbackHired.id));
  assert.equal(Number(failedTransferCount.count), 0);

  // Reusing a transition key from another workspace must never reveal its replay result.
  const foreignFixture = await createFixture("foreign");
  const foreignCreated = await repository.createCase(caseInput(foreignFixture, "foreign"));
  assert.equal(foreignCreated.status, "created");
  await expectReject(
    () => repository.transitionCase(foreignFixture.context, {
      caseId: foreignCreated.case.id,
      expectedVersion: foreignCreated.case.version,
      targetStage: "manager_review",
      transitionIdempotencyKey: transitionKey,
      options: {
        managerId: String(foreignFixture.managerId),
        nextAction: "Manager reviews application",
        nextActionDueAt: new Date("2035-01-04T00:00:00.000Z"),
      },
    }),
    RecruitingAuthorizationError,
  );

  // The permanent triggers must be inert for ordinary transactions once the local setting is absent.
  const inertFixture = await createFixture("inert");
  const inertCreated = await repository.createCase(caseInput(inertFixture, "inert"));
  assert.equal(inertCreated.status, "created");
  const inertTransition = await repository.transitionCase(inertFixture.context, {
    caseId: inertCreated.case.id,
    expectedVersion: inertCreated.case.version,
    targetStage: "manager_review",
    transitionIdempotencyKey: nextLabel("inert-transition"),
    options: {
      managerId: String(inertFixture.managerId),
      nextAction: "Manager reviews application",
      nextActionDueAt: new Date("2035-01-04T00:00:00.000Z"),
    },
  });
  assert.equal(inertTransition.status, "committed");

  console.log("Recruiting PostgreSQL integration suite passed");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });