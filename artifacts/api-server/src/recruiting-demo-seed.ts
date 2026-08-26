import { and, eq, inArray } from "drizzle-orm";
import {
  appUsersTable,
  db,
  driversTable,
  leadsTable,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  workspaceMembershipsTable,
  workspacesTable,
} from "@workspace/db";

const workspaceSlug = "franklin";
const sourcePrefix = "dev-demo-recruiting:";

const demoUsers = [
  { email: "priya.nair+recruiting-demo@franklins.ai", name: "Priya Nair", role: "recruiter", avatarInitials: "PN" },
  { email: "maya.thompson+recruiting-demo@franklins.ai", name: "Maya Thompson", role: "manager", avatarInitials: "MT" },
] as const;

const cases = [
  { key: "dmitri-new-lead", externalRecruitId: "recruit_dmitri_volkov_001", stage: "new_lead", lifecycle: "active", owner: "marcus.w@demo.franklins.ai", taskOwner: "marcus.w@demo.franklins.ai", action: "Place first qualification call", dueHours: 3, slaHours: 36 },
  { key: "amir-manager-review", externalRecruitId: "recruit_amir_rashidov_002", stage: "manager_review", lifecycle: "active", owner: "priya.nair+recruiting-demo@franklins.ai", taskOwner: "jordan.kim@demo.franklins.ai", action: "Review application and approve handoff", dueHours: 2, slaHours: 8 },
  { key: "carlos-follow-up", externalRecruitId: "recruit_carlos_medina_003", stage: "future_follow_up", lifecycle: "active", owner: "marcus.w@demo.franklins.ai", taskOwner: "priya.nair+recruiting-demo@franklins.ai", action: "Reconnect after current employer notice", dueHours: -2, slaHours: -2, followUpHours: -1, resumeStage: "application_received" },
  { key: "oleksiy-drug-test", externalRecruitId: "recruit_oleksiy_bond_004", stage: "drug_test_scheduled", lifecycle: "active", owner: "priya.nair+recruiting-demo@franklins.ai", taskOwner: "maya.thompson+recruiting-demo@franklins.ai", action: "Confirm clinic appointment completion", dueHours: 6, slaHours: 30 },
  { key: "javier-compliance", externalRecruitId: "recruit_javier_torres_005", stage: "compliance_documents_pending", lifecycle: "active", owner: "marcus.w@demo.franklins.ai", taskOwner: "maya.thompson+recruiting-demo@franklins.ai", action: "Collect CDL medical card and MVR release", dueHours: 4, slaHours: 10 },
  { key: "mykola-contract", externalRecruitId: "recruit_mykola_petren_006", stage: "contract_sent", lifecycle: "active", owner: "priya.nair+recruiting-demo@franklins.ai", taskOwner: "jordan.kim@demo.franklins.ai", action: "Review contract questions with driver", dueHours: 1, slaHours: -4 },
  { key: "rahim-ready", externalRecruitId: "recruit_rahim_nazarov_007", stage: "ready_for_onboarding", lifecycle: "active", owner: "marcus.w@demo.franklins.ai", taskOwner: "jordan.kim@demo.franklins.ai", action: "Confirm onboarding transfer readiness", dueHours: 2, slaHours: 28 },
  { key: "elena-closed-lost", externalRecruitId: "recruit_elena_koval_008", stage: "closed_lost", lifecycle: "closed_lost", owner: "priya.nair+recruiting-demo@franklins.ai", taskOwner: "maya.thompson+recruiting-demo@franklins.ai", action: "Record compensation feedback", dueHours: 0, slaHours: 0, closedLostReason: "other", closedLostNote: "DEV/DEMO: driver accepted another regional position with a home-time schedule." },
] as const;

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export async function seedRecruitingDemo() {
  if (process.env.RECRUITING_DEMO_SEED !== "1") {
    throw new Error("Set RECRUITING_DEMO_SEED=1 to run the manual DEV/DEMO Recruiting seed.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("The DEV/DEMO Recruiting seed cannot run in production.");
  }

  const result = await db.transaction(async (tx) => {
    const [workspace] = await tx.select().from(workspacesTable).where(eq(workspacesTable.slug, workspaceSlug));
    if (!workspace) throw new Error(`Workspace ${workspaceSlug} is required before seeding Recruiting.`);

    for (const user of demoUsers) {
      await tx.insert(appUsersTable).values({ ...user, isCurrentSession: "false" }).onConflictDoNothing();
    }

    const userEmails = [
      "marcus.w@demo.franklins.ai",
      "jordan.kim@demo.franklins.ai",
      ...demoUsers.map((user) => user.email),
    ];
    const users = await tx.select().from(appUsersTable).where(inArray(appUsersTable.email, userEmails));
    const usersByEmail = new Map(users.map((user) => [user.email, user]));
    if (usersByEmail.size !== userEmails.length) throw new Error("Required Franklin demo users are missing.");

    await tx.insert(workspaceMembershipsTable).values(
      users.map((user) => ({ workspaceId: workspace.id, userId: user.id, role: user.role })),
    ).onConflictDoNothing();

    const recruitIds = cases.map((item) => item.externalRecruitId);
    const [drivers, leads] = await Promise.all([
      tx.select().from(driversTable).where(and(eq(driversTable.workspaceId, workspace.id), inArray(driversTable.externalRecruitId, recruitIds))),
      tx.select().from(leadsTable).where(and(eq(leadsTable.workspaceId, workspace.id), inArray(leadsTable.externalRecruitId, recruitIds))),
    ]);
    const driversByRecruitId = new Map(drivers.map((driver) => [driver.externalRecruitId, driver]));
    const leadsByRecruitId = new Map(leads.map((lead) => [lead.externalRecruitId, lead]));
    if (driversByRecruitId.size !== cases.length || leadsByRecruitId.size !== cases.length) {
      throw new Error("Required Franklin driver/lead fixtures are missing; run the base development seed first.");
    }

    let insertedCases = 0;
    let insertedEvents = 0;
    for (const item of cases) {
      const sourceId = `${sourcePrefix}${item.key}`;
      const [existing] = await tx.select().from(recruitingCasesTable).where(
        and(eq(recruitingCasesTable.workspaceId, workspace.id), eq(recruitingCasesTable.sourceId, sourceId)),
      );
      const driver = driversByRecruitId.get(item.externalRecruitId)!;
      const lead = leadsByRecruitId.get(item.externalRecruitId)!;
      const owner = usersByEmail.get(item.owner)!;
      const taskOwner = usersByEmail.get(item.taskOwner)!;
      const insertedCase = existing ? undefined : (await tx.insert(recruitingCasesTable).values({
        workspaceId: workspace.id,
        driverId: driver.id,
        leadId: lead.id,
        caseNumber: `DEV-RC-${item.key.toUpperCase()}`,
        sourceId,
        stage: item.stage,
        lifecycle: item.lifecycle,
        caseOwnerId: owner.id,
        taskOwnerId: taskOwner.id,
        nextAction: item.action,
        nextActionDueAt: plusHours(item.dueHours),
        slaDeadlineAt: plusHours(item.slaHours),
        followUpDueAt: "followUpHours" in item ? plusHours(item.followUpHours) : null,
        resumeStage: "resumeStage" in item ? item.resumeStage : null,
        closedLostReason: "closedLostReason" in item ? item.closedLostReason : null,
        closedLostNote: "closedLostNote" in item ? item.closedLostNote : null,
      }).onConflictDoNothing().returning())[0];
      const caseRow = existing ?? insertedCase ?? (await tx.select().from(recruitingCasesTable).where(
        and(eq(recruitingCasesTable.workspaceId, workspace.id), eq(recruitingCasesTable.sourceId, sourceId)),
      ))[0];
      if (!caseRow) throw new Error(`Could not resolve seeded Recruiting case ${sourceId}.`);
      if (insertedCase) insertedCases += 1;

      const eventKey = `${sourceId}:created`;
      const [event] = await tx.select().from(recruitingCaseEventsTable).where(
        eq(recruitingCaseEventsTable.transitionIdempotencyKey, eventKey),
      );
      if (!event) {
        const insertedEvent = (await tx.insert(recruitingCaseEventsTable).values({
          workspaceId: workspace.id,
          recruitingCaseId: caseRow.id,
          transitionIdempotencyKey: eventKey,
          eventType: "case_seeded",
          fromStage: null,
          toStage: item.stage,
          actorUserId: owner.id,
          caseVersion: 1,
          payload: { devDemo: true, sourceId },
        }).onConflictDoNothing().returning())[0];
        if (insertedEvent) insertedEvents += 1;
      }
    }

    return { workspace: workspace.slug, insertedCases, insertedEvents, totalCases: cases.length };
  });

  console.log(`Recruiting DEV/DEMO seed complete for ${result.workspace}: ${result.insertedCases} cases and ${result.insertedEvents} timeline events added (${result.totalCases} deterministic cases).`);
}

await seedRecruitingDemo();