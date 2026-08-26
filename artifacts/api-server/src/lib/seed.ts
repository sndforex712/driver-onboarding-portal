import { eq, isNull, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driversTable,
  checklistItemsTable,
  activityEntriesTable,
  commentsTable,
  driverDocumentsTable,
  onboardingTasksTable,
  appUsersTable,
  workflowTemplatesTable,
  templateStepsTable,
  datatruckSyncsTable,
  workspacesTable,
  workspaceMembershipsTable,
  leadsTable,
  driverStageHistoryTable,
  onboardingCasesTable,
} from "@workspace/db";
import { statusToStage, type DriverStage } from "./stages";
import { normalizePhone } from "./duplicate-detection";
import { logger } from "./logger";
import { getChecklistTemplateForDriver } from "./checklist-gates";
import { OPERATIONAL_CHECKLIST_TEMPLATE } from "./checklist-gates";

export async function seedDatabase() {
  // ── Ensure workspaces exist first (workspace_id is required for all inserts) ──
  await db
    .insert(workspacesTable)
    .values([
      {
        name: "Franklin Trucking",
        slug: "franklin",
        description:
          "Owner Operator and Company Driver onboarding — compliance gates, DataTruck handoff, Telegram onboarding.",
        status: "active",
      },
      {
        name: "DT National Freight",
        slug: "dt-national",
        description: "Multi-state carrier network. Workspace configuration in progress.",
        status: "coming_soon",
      },
    ])
    .onConflictDoNothing();

  const [franklinWs] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.slug, "franklin"));

  if (!franklinWs) {
    throw new Error("Failed to find Franklin workspace after upsert");
  }
  const wsId = franklinWs.id;

  // ── Skip guard ────────────────────────────────────────────────────────────
  const existing = await db.select().from(appUsersTable);
  if (existing.length > 0) {
    logger.info("Database already seeded — skipping");
    return;
  }

  logger.info("Seeding demo database...");

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = await db
    .insert(appUsersTable)
    .values([
      { name: "Alex Martinez",    email: "alex.martinez@demo.franklins.ai",  role: "owner_admin",            avatarInitials: "AM", isCurrentSession: "true" },
      { name: "Sarah Chen",       email: "sarah.chen@demo.franklins.ai",     role: "onboarding_specialist",  avatarInitials: "SC", isCurrentSession: "false" },
      { name: "Marcus Williams",  email: "marcus.w@demo.franklins.ai",       role: "recruiter",              avatarInitials: "MW", isCurrentSession: "false" },
      { name: "Diana Patel",      email: "diana.patel@demo.franklins.ai",    role: "compliance_reviewer",    avatarInitials: "DP", isCurrentSession: "false" },
      { name: "James Rivera",     email: "james.rivera@demo.franklins.ai",   role: "dispatcher_readonly",    avatarInitials: "JR", isCurrentSession: "false" },
      { name: "Jordan Kim",       email: "jordan.kim@demo.franklins.ai",     role: "manager",               avatarInitials: "JK", isCurrentSession: "false" },
    ])
    .returning();

  // ── Workflow Templates ────────────────────────────────────────────────────
  const mapToStep = (
    s: { gateKey: string; label: string; gateCategory: string; appliesTo: string; isMandatory: boolean; sortOrder: number },
    templateId: number,
  ) => ({
    templateId,
    workspaceId: wsId,
    sortOrder:   s.sortOrder,
    gateKey:     s.gateKey,
    label:       s.label,
    category:    s.gateCategory,
    isMandatory: s.isMandatory,
    appliesTo:   s.appliesTo,
  });

  const [ooTemplate] = await db
    .insert(workflowTemplatesTable)
    .values({
      workspaceId: wsId,
      name:        "Owner Operator Onboarding",
      driverType:  "owner_operator",
      description: "Complete onboarding workflow for Owner Operators. Covers pre-hire compliance gates, equipment verification, and carrier setup.",
    })
    .returning();

  const [cdTemplate] = await db
    .insert(workflowTemplatesTable)
    .values({
      workspaceId: wsId,
      name:        "Company Driver Onboarding",
      driverType:  "company_driver",
      description: "Complete onboarding workflow for Company Drivers. Covers pre-hire compliance, employment paperwork, and truck assignment.",
    })
    .returning();

  await db.insert(templateStepsTable).values([
    ...OPERATIONAL_CHECKLIST_TEMPLATE.map((s) => mapToStep(s, ooTemplate.id)),
  ]);
  await db.insert(templateStepsTable).values([
    ...OPERATIONAL_CHECKLIST_TEMPLATE.map((s) => mapToStep(s, cdTemplate.id)),
  ]);

  // ── Leads (must be inserted before drivers so drivers can reference leadId) ─
  const seedLeadsValues = [
    { externalRecruitId: "recruit_dmitri_volkov_001", fullName: "Dmitri Volkov",     phoneRaw: "+1 (555) 012-3456", phoneNormalized: "5550123456", state: "TX", recruiterName: "Marcus Williams", sourceChannel: "Telegram",  status: "hired"        as const },
    { externalRecruitId: "recruit_amir_rashidov_002", fullName: "Amir Rashidov",      phoneRaw: "+1 (555) 023-4567", phoneNormalized: "5550234567", state: "GA", recruiterName: "Marcus Williams", sourceChannel: "Indeed",    status: "hired"        as const },
    { externalRecruitId: "recruit_carlos_medina_003", fullName: "Carlos Medina",      phoneRaw: "+1 (555) 034-5678", phoneNormalized: "5550345678", state: "FL", recruiterName: "Sarah Chen",      sourceChannel: "Facebook",  status: "hired"        as const },
    { externalRecruitId: "recruit_oleksiy_bond_004",  fullName: "Oleksiy Bondarenko", phoneRaw: "+1 (555) 045-6789", phoneNormalized: "5550456789", state: "OH", recruiterName: "Marcus Williams", sourceChannel: "Telegram",  status: "hired"        as const },
    { externalRecruitId: "recruit_javier_torres_005", fullName: "Javier Torres",      phoneRaw: "+1 (555) 056-7890", phoneNormalized: "5550567890", state: "CA", recruiterName: "Sarah Chen",      sourceChannel: "LinkedIn",  status: "pending"      as const },
    { externalRecruitId: "recruit_mykola_petren_006", fullName: "Mykola Petrenko",    phoneRaw: "+1 (555) 067-8901", phoneNormalized: "5550678901", state: "IL", recruiterName: "Marcus Williams", sourceChannel: "Referral",  status: "disqualified" as const },
    { externalRecruitId: "recruit_rahim_nazarov_007", fullName: "Rahim Nazarov",      phoneRaw: "+1 (555) 078-9012", phoneNormalized: "5550789012", state: "TN", recruiterName: "Marcus Williams", sourceChannel: "Telegram",  status: "hired"        as const },
    { externalRecruitId: "recruit_elena_koval_008",   fullName: "Elena Kovalenko",    phoneRaw: "+1 (555) 089-0123", phoneNormalized: "5550890123", state: "AZ", recruiterName: "Sarah Chen",      sourceChannel: "Indeed",    status: "hired"        as const },
  ];

  const insertedLeads = await db
    .insert(leadsTable)
    .values(seedLeadsValues.map((l) => ({ ...l, workspaceId: wsId })))
    .returning();

  // Demo duplicate leads — exact phone + fuzzy name/location
  const dmitriLead = insertedLeads.find((l) => l.externalRecruitId === "recruit_dmitri_volkov_001");
  const mykolaLead = insertedLeads.find((l) => l.externalRecruitId === "recruit_mykola_petren_006");

  await db.insert(leadsTable).values([
    {
      workspaceId:         wsId,
      fullName:            "D. Volkov",
      phoneRaw:            "+1 (555) 012-3456",
      phoneNormalized:     "5550123456",
      state:               "TX",
      recruiterName:       "Marcus Williams",
      sourceChannel:       "Indeed",
      status:              "pending" as const,
      isDuplicate:         true,
      duplicateConfidence: "exact_phone",
      duplicateOfLeadId:   dmitriLead?.id ?? null,
      notes:               "Possible re-entry via different platform — same phone on file",
    },
    {
      workspaceId:         wsId,
      fullName:            "Mykola Petrenkov",
      phoneRaw:            "+1 (555) 078-9001",
      phoneNormalized:     "5550789001",
      state:               "IL",
      recruiterName:       "Marcus Williams",
      sourceChannel:       "Referral",
      status:              "pending" as const,
      isDuplicate:         true,
      duplicateConfidence: "fuzzy_name_location",
      duplicateOfLeadId:   mykolaLead?.id ?? null,
      notes:               "Name very similar to existing IL lead — verify identity before onboarding",
    },
  ]);

  // Map externalRecruitId → lead DB id for driver linking
  const leadIdMap = new Map(insertedLeads.map((l) => [l.externalRecruitId, l.id]));

  // ── Drivers ───────────────────────────────────────────────────────────────
  const driverData = [
    {
      workspaceId:       wsId,
      fullName:          "Dmitri Volkov",
      phone:             "+1 (555) 012-3456",
      email:             "d.volkov.demo@mailtest.dev",
      state:             "TX",
      driverType:        "owner_operator" as const,
      status:            "in_progress",
      stage:             "onboarding",
      priority:          "critical",
      recruiterName:     "Marcus Williams",
      sourceChannel:     "Telegram",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          "1FUJHHDR5BLBF0001",
      truckInfo:         "2022 Freightliner Cascadia",
      telegramGroupLinked: false,
      datatruckSyncStatus: null,
      startDate:         "2026-09-01",
      slaDeadline:       "2026-08-25",
      blockers:          "Insurance certificate not received from broker",
      nextBestAction:    "Follow up with broker for insurance cert — SLA breaching in 3 days",
      externalRecruitId: "recruit_dmitri_volkov_001",
      completionPercent: 45,
    },
    {
      workspaceId:       wsId,
      fullName:          "Amir Rashidov",
      phone:             "+1 (555) 023-4567",
      email:             "a.rashidov.demo@mailtest.dev",
      state:             "GA",
      driverType:        "owner_operator" as const,
      status:            "pending_approval",
      stage:             "onboarding",
      priority:          "high",
      recruiterName:     "Marcus Williams",
      sourceChannel:     "Indeed",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          "1FUJHHDR5BLBF0002",
      truckInfo:         "2021 Kenworth T680",
      telegramGroupLinked: true,
      datatruckSyncStatus: null,
      startDate:         "2026-08-28",
      slaDeadline:       "2026-08-22",
      blockers:          null,
      nextBestAction:    "Awaiting qualification approval from compliance team",
      externalRecruitId: "recruit_amir_rashidov_002",
      completionPercent: 78,
    },
    {
      workspaceId:       wsId,
      fullName:          "Carlos Medina",
      phone:             "+1 (555) 034-5678",
      email:             "c.medina.demo@mailtest.dev",
      state:             "FL",
      driverType:        "company_driver" as const,
      status:            "in_progress",
      stage:             "onboarding",
      priority:          "medium",
      recruiterName:     "Sarah Chen",
      sourceChannel:     "Facebook",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          null,
      truckInfo:         null,
      telegramGroupLinked: false,
      datatruckSyncStatus: null,
      startDate:         "2026-09-05",
      slaDeadline:       "2026-09-01",
      blockers:          null,
      nextBestAction:    "Schedule orientation session — truck assignment pending",
      externalRecruitId: "recruit_carlos_medina_003",
      completionPercent: 55,
    },
    {
      workspaceId:       wsId,
      fullName:          "Oleksiy Bondarenko",
      phone:             "+1 (555) 045-6789",
      email:             "o.bond.demo@mailtest.dev",
      state:             "OH",
      driverType:        "owner_operator" as const,
      status:            "ready_for_dispatch",
      stage:             "dispatch_ready",
      priority:          "medium",
      recruiterName:     "Marcus Williams",
      sourceChannel:     "Telegram",
      assigneeId:        users[4].id,
      assigneeName:      users[4].name,
      truckVin:          "1FUJHHDR5BLBF0003",
      truckInfo:         "2020 Peterbilt 579",
      telegramGroupLinked: true,
      readyForDispatch:  true,
      datatruckSyncStatus: "synced",
      startDate:         "2026-08-18",
      slaDeadline:       "2026-08-20",
      blockers:          null,
      nextBestAction:    null,
      externalRecruitId: "recruit_oleksiy_bond_004",
      complianceGatesPassed: true,
      completionPercent: 100,
    },
    {
      workspaceId:       wsId,
      fullName:          "Javier Torres",
      phone:             "+1 (555) 056-7890",
      email:             "j.torres.demo@mailtest.dev",
      state:             "CA",
      driverType:        "company_driver" as const,
      status:            "pre_hire",
      stage:             "hired",
      priority:          "medium",
      recruiterName:     "Sarah Chen",
      sourceChannel:     "LinkedIn",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          null,
      truckInfo:         null,
      telegramGroupLinked: false,
      datatruckSyncStatus: null,
      startDate:         "2026-09-10",
      slaDeadline:       "2026-09-05",
      blockers:          null,
      nextBestAction:    "Send application link and e-sign consent form",
      externalRecruitId: "recruit_javier_torres_005",
      completionPercent: 8,
    },
    {
      workspaceId:       wsId,
      fullName:          "Mykola Petrenko",
      phone:             "+1 (555) 067-8901",
      email:             "m.petrenko.demo@mailtest.dev",
      state:             "IL",
      driverType:        "owner_operator" as const,
      status:            "fallout",
      stage:             "fallout",
      priority:          "low",
      recruiterName:     "Marcus Williams",
      sourceChannel:     "Referral",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          "1FUJHHDR5BLBF0004",
      truckInfo:         "2019 Volvo VNL 860",
      telegramGroupLinked: false,
      datatruckSyncStatus: "failed",
      startDate:         null,
      slaDeadline:       null,
      blockers:          "Drug test failed — disqualified",
      nextBestAction:    "Mark as fallout — notify recruiter",
      externalRecruitId: "recruit_mykola_petren_006",
      completionPercent: 32,
    },
    {
      workspaceId:       wsId,
      fullName:          "Rahim Nazarov",
      phone:             "+1 (555) 078-9012",
      email:             "r.nazarov.demo@mailtest.dev",
      state:             "TN",
      driverType:        "owner_operator" as const,
      status:            "in_progress",
      stage:             "onboarding",
      priority:          "high",
      recruiterName:     "Marcus Williams",
      sourceChannel:     "Telegram",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          "1FUJHHDR5BLBF0005",
      truckInfo:         "2023 International LT",
      telegramGroupLinked: false,
      datatruckSyncStatus: null,
      startDate:         "2026-08-30",
      slaDeadline:       "2026-08-26",
      blockers:          null,
      nextBestAction:    "Collect CDL front and back — state: TN",
      externalRecruitId: "recruit_rahim_nazarov_007",
      completionPercent: 22,
    },
    {
      workspaceId:       wsId,
      fullName:          "Elena Kovalenko",
      phone:             "+1 (555) 089-0123",
      email:             "e.koval.demo@mailtest.dev",
      state:             "AZ",
      driverType:        "company_driver" as const,
      status:            "approved",
      stage:             "onboarding",
      priority:          "high",
      recruiterName:     "Sarah Chen",
      sourceChannel:     "Indeed",
      assigneeId:        users[1].id,
      assigneeName:      users[1].name,
      truckVin:          null,
      truckInfo:         null,
      telegramGroupLinked: true,
      datatruckSyncStatus: "pending",
      startDate:         "2026-08-22",
      slaDeadline:       "2026-08-21",
      blockers:          "No truck available in AZ terminal — waiting for transfer",
      nextBestAction:    "Assign truck unit #AZ-047 or arrange transfer from NV",
      externalRecruitId: "recruit_elena_koval_008",
      completionPercent: 88,
    },
  ];

  const insertedDrivers = await db
    .insert(driversTable)
    .values(driverData.map((d) => ({ ...d, leadId: leadIdMap.get(d.externalRecruitId) ?? null })))
    .returning();

  // ── Onboarding Cases — one per driver, seeded with realistic data ─────────
  const caseNotes: Record<string, string> = {
    "recruit_dmitri_volkov_001": "OO with 4yr experience. Insurance broker delayed — follow up daily. Target start 09/01.",
    "recruit_amir_rashidov_002": "Smooth pre-hire. Qualification docs complete. Awaiting compliance sign-off.",
    "recruit_carlos_medina_003": "CD onboarding. References verified. Start date aligned with terminal schedule.",
    "recruit_oleksiy_bond_004":  "All gates passed. DataTruck synced. Ready for dispatch.",
    "recruit_javier_torres_005": "New hire — pre-hire screening not yet started. CDL valid thru 2029.",
    "recruit_mykola_petren_006": "Drug test failed — case closed with fallout status.",
    "recruit_rahim_nazarov_007": "Telegram group created. Lease agreement pending e-sign.",
    "recruit_elena_koval_008":   "No truck available at AZ terminal. Holding at 88% — truck transfer from NV pending.",
  };

  const stageToCaseStatusMap: Record<string, string> = {
    hired:          "open",
    pre_hire:       "onboarding",
    onboarding:     "onboarding",
    dispatch_ready: "completed",
    active:         "completed",
    fallout:        "fallout",
  };

  // Case Owner assignment for the original 8 drivers (permanent, never changes)
  const caseOwnerMap: Record<string, { id: number; name: string }> = {
    "recruit_dmitri_volkov_001": { id: users[0].id, name: users[0].name },   // Alex Martinez
    "recruit_amir_rashidov_002": { id: users[5].id, name: users[5].name },   // Jordan Kim
    "recruit_carlos_medina_003": { id: users[5].id, name: users[5].name },   // Jordan Kim
    "recruit_oleksiy_bond_004":  { id: users[0].id, name: users[0].name },   // Alex Martinez
    "recruit_javier_torres_005": { id: users[5].id, name: users[5].name },   // Jordan Kim
    "recruit_mykola_petren_006": { id: users[5].id, name: users[5].name },   // Jordan Kim
    "recruit_rahim_nazarov_007": { id: users[0].id, name: users[0].name },   // Alex Martinez
    "recruit_elena_koval_008":   { id: users[0].id, name: users[0].name },   // Alex Martinez
  };

  // hiredAt offsets (hours ago) to create interesting board countdown colors
  const hiredAtOffsetHours: Record<string, number> = {
    "recruit_dmitri_volkov_001": 18,  // yellow (~18h ago → 18h remaining)
    "recruit_amir_rashidov_002": 22,  // yellow
    "recruit_carlos_medina_003": 16,  // yellow
    "recruit_oleksiy_bond_004":  40,  // breached (but readyForDispatch)
    "recruit_javier_torres_005": 2,   // green (bot/new)
    "recruit_mykola_petren_006": 30,  // red (fallout)
    "recruit_rahim_nazarov_007": 10,  // green (drug test)
    "recruit_elena_koval_008":   28,  // orange
  };

  for (const driver of insertedDrivers) {
    const caseStatus = stageToCaseStatusMap[driver.stage] ?? "open";
    const owner = caseOwnerMap[driver.externalRecruitId!];
    const hoursAgo = hiredAtOffsetHours[driver.externalRecruitId!] ?? 12;
    const hiredAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

    const [insertedCase] = await db.insert(onboardingCasesTable).values({
      workspaceId:          wsId,
      driverId:             driver.id,
      leadId:               driver.leadId ?? null,
      externalRecruitId:    driver.externalRecruitId!,
      recruiterName:        driver.recruiterName,
      sourceChannel:        driver.sourceChannel,
      initialNotes:         caseNotes[driver.externalRecruitId!] ?? null,
      assignedSpecialistId: driver.assigneeId,
      slaDeadline:          driver.slaDeadline,
      status:               caseStatus,
      hiredAt,
      caseOwnerId:          owner?.id ?? users[0].id,
      caseOwnerName:        owner?.name ?? users[0].name,
      completedAt:          caseStatus === "completed" ? new Date(Date.now() - 2 * 24 * 3600000) : null,
    }).returning();

    // Set human-readable case number
    await db.update(onboardingCasesTable)
      .set({ caseNumber: `CASE-${insertedCase.id.toString().padStart(5, "0")}` })
      .where(eq(onboardingCasesTable.id, insertedCase.id));
  }

  // ── Checklist items ───────────────────────────────────────────────────────
  for (const driver of insertedDrivers) {
    const template = getChecklistTemplateForDriver(driver.driverType);
    const itemsToInsert = template.map((t) => {
      let status = "pending";
      if (driver.completionPercent >= 100) status = "passed";
      else if (driver.completionPercent >= 80) status = t.sortOrder <= 10 ? "passed" : "pending";
      else if (driver.completionPercent >= 50) status = t.sortOrder <= 7  ? "passed" : "pending";
      else if (driver.completionPercent >= 30) status = t.sortOrder <= 4  ? "passed" : "pending";
      else if (driver.completionPercent >= 10) status = t.sortOrder <= 2  ? "passed" : "pending";

      if (driver.status === "fallout" && t.gateKey === "drug_test_completed") status = "failed";

      return {
        workspaceId: wsId,
        driverId:    driver.id,
        gateKey:     t.gateKey,
        label:       t.label,
        gateCategory: t.gateCategory,
        appliesTo:   t.appliesTo,
        isMandatory: t.isMandatory,
        status,
        sortOrder:   t.sortOrder,
        completedAt: status === "passed" ? new Date(Date.now() - Math.random() * 7 * 24 * 3600000).toISOString() : null,
      };
    });
    await db.insert(checklistItemsTable).values(itemsToInsert);
  }

  // ── Documents ─────────────────────────────────────────────────────────────
  const readyDriver = insertedDrivers.find((d) => d.status === "ready_for_dispatch");
  if (readyDriver) {
    await db.insert(driverDocumentsTable).values([
      { workspaceId: wsId, driverId: readyDriver.id, docType: "cdl_front",      docName: "CDL Front",                    status: "verified", uploadedAt: "2026-08-10T10:00:00Z", verifiedAt: "2026-08-11T09:00:00Z" },
      { workspaceId: wsId, driverId: readyDriver.id, docType: "cdl_back",       docName: "CDL Back",                     status: "verified", uploadedAt: "2026-08-10T10:05:00Z", verifiedAt: "2026-08-11T09:05:00Z" },
      { workspaceId: wsId, driverId: readyDriver.id, docType: "medical_card",   docName: "Medical Card",                 status: "verified", expiryDate: "2027-08-01", uploadedAt: "2026-08-10T10:10:00Z", verifiedAt: "2026-08-11T09:10:00Z" },
      { workspaceId: wsId, driverId: readyDriver.id, docType: "insurance",      docName: "Liability Insurance Certificate", status: "verified", expiryDate: "2027-06-30", uploadedAt: "2026-08-12T14:00:00Z", verifiedAt: "2026-08-13T10:00:00Z" },
      { workspaceId: wsId, driverId: readyDriver.id, docType: "lease_agreement",docName: "Carrier Lease Agreement",      status: "verified", uploadedAt: "2026-08-14T11:00:00Z", verifiedAt: "2026-08-15T09:00:00Z" },
      { workspaceId: wsId, driverId: readyDriver.id, docType: "dot_inspection", docName: "DOT Annual Inspection",        status: "verified", expiryDate: "2027-08-01", uploadedAt: "2026-08-14T11:30:00Z", verifiedAt: "2026-08-15T09:30:00Z" },
    ]);
    await db.insert(datatruckSyncsTable).values({
      workspaceId:   wsId,
      driverId:      readyDriver.id,
      syncStatus:    "synced",
      attemptNumber: 1,
      syncedAt:      new Date().toISOString(),
    });
  }

  const criticalDriver = insertedDrivers.find((d) => d.priority === "critical");
  if (criticalDriver) {
    await db.insert(driverDocumentsTable).values([
      { workspaceId: wsId, driverId: criticalDriver.id, docType: "cdl_front",    docName: "CDL Front",                    status: "verified",  uploadedAt: "2026-08-14T09:00:00Z", verifiedAt: "2026-08-14T16:00:00Z" },
      { workspaceId: wsId, driverId: criticalDriver.id, docType: "cdl_back",     docName: "CDL Back",                     status: "verified",  uploadedAt: "2026-08-14T09:05:00Z", verifiedAt: "2026-08-14T16:05:00Z" },
      { workspaceId: wsId, driverId: criticalDriver.id, docType: "medical_card", docName: "Medical Card",                 status: "received",  expiryDate: "2026-12-01", uploadedAt: "2026-08-15T10:00:00Z" },
      { workspaceId: wsId, driverId: criticalDriver.id, docType: "insurance",    docName: "Liability Insurance Certificate", status: "pending", notes: "Broker has not responded — follow up required" },
    ]);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const inProgressDrivers = insertedDrivers.filter((d) =>
    ["in_progress", "pending_approval"].includes(d.status)
  );
  for (const driver of inProgressDrivers) {
    await db.insert(onboardingTasksTable).values([
      {
        workspaceId:  wsId,
        driverId:     driver.id,
        title:        "Collect missing documents",
        taskType:     "document_collection",
        status:       "in_progress",
        priority:     driver.priority,
        assigneeId:   driver.assigneeId,
        assigneeName: driver.assigneeName,
        dueDate:      driver.slaDeadline,
        isMandatory:  true,
      },
      {
        workspaceId:  wsId,
        driverId:     driver.id,
        title:        "Verify CDL with state DMV",
        taskType:     "verification",
        status:       "completed",
        priority:     "high",
        assigneeId:   driver.assigneeId,
        assigneeName: driver.assigneeName,
        completedAt:  new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
        isMandatory:  true,
      },
      {
        workspaceId:  wsId,
        driverId:     driver.id,
        title:        `Send Telegram onboarding invite to ${driver.fullName}`,
        taskType:     "communication",
        status:       driver.telegramGroupLinked ? "completed" : "pending",
        priority:     "medium",
        assigneeId:   driver.assigneeId,
        assigneeName: driver.assigneeName,
        dueDate:      driver.slaDeadline,
        isMandatory:  true,
        completedAt:  driver.telegramGroupLinked ? new Date().toISOString() : null,
      },
    ]);
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  for (const driver of insertedDrivers) {
    const activities = [
      { actorName: "System",      actorRole: "system",                 action: "Onboarding record created",     detail: `Driver ${driver.fullName} added via Hired event` },
      { actorName: "Sarah Chen",  actorRole: "onboarding_specialist",  action: "CDL verification initiated",    detail: "Sent to state DMV for verification" },
    ];
    if (driver.status === "ready_for_dispatch") {
      activities.push(
        { actorName: "Alex Martinez", actorRole: "owner_admin",          action: "Qualification file approved",      detail: "All compliance gates passed" },
        { actorName: "James Rivera",  actorRole: "dispatcher_readonly",  action: "Driver marked Ready for Dispatch", detail: "DataTruck sync completed successfully" },
      );
    }
    if (driver.status === "fallout") {
      activities.push({ actorName: "Diana Patel", actorRole: "compliance_reviewer", action: "Driver marked as fallout", detail: "Drug test result failed — disqualified per DOT regulations" });
    }
    await db.insert(activityEntriesTable).values(
      activities.map((a, i) => ({
        ...a,
        workspaceId: wsId,
        driverId:    driver.id,
        createdAt:   new Date(Date.now() - (activities.length - i) * 6 * 3600000),
      })),
    );
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  for (const driver of insertedDrivers.slice(0, 3)) {
    await db.insert(commentsTable).values([
      {
        workspaceId: wsId,
        driverId:    driver.id,
        authorName:  "Sarah Chen",
        authorRole:  "onboarding_specialist",
        body:        `Reached out to ${driver.fullName} via phone — confirmed they have documents ready. Will collect by EOD.`,
      },
      {
        workspaceId: wsId,
        driverId:    driver.id,
        authorName:  "Marcus Williams",
        authorRole:  "recruiter",
        body:        "Driver is motivated and confirmed start date. Source: Telegram group #FL-Drivers. High retention potential.",
      },
    ]);
  }

  // ── Stage History ─────────────────────────────────────────────────────────
  const nowMs  = Date.now();
  const DAY_MS = 24 * 3600 * 1000;

  // Per-driver timeline offsets (days ago) for realistic spacing
  const stageTimings: Record<string, { hired: number; onboarding?: number; dispatch?: number; fallout?: number }> = {
    "recruit_javier_torres_005": { hired: 14 },
    "recruit_rahim_nazarov_007": { hired: 21, onboarding: 18 },
    "recruit_mykola_petren_006": { hired: 20, onboarding: 17, fallout: 7 },
    "recruit_dmitri_volkov_001": { hired: 18, onboarding: 15 },
    "recruit_carlos_medina_003": { hired: 16, onboarding: 13 },
    "recruit_elena_koval_008":   { hired: 12, onboarding: 9 },
    "recruit_amir_rashidov_002": { hired: 15, onboarding: 12 },
    "recruit_oleksiy_bond_004":  { hired: 25, onboarding: 22, dispatch: 3 },
  };

  for (const driver of insertedDrivers) {
    const t = stageTimings[driver.externalRecruitId ?? ""] ?? { hired: 10 };
    const entries: (typeof driverStageHistoryTable.$inferInsert)[] = [];

    entries.push({
      workspaceId:    wsId,
      driverId:       driver.id,
      fromStage:      null,
      toStage:        "hired",
      actorName:      "System",
      actorRole:      "system",
      transitionType: "hired_event",
      note:           `Hired event received — source: ${driver.sourceChannel}, recruiter: ${driver.recruiterName}`,
      transitionedAt: new Date(nowMs - t.hired * DAY_MS),
    });

    if (t.onboarding != null) {
      entries.push({
        workspaceId:    wsId,
        driverId:       driver.id,
        fromStage:      "hired",
        toStage:        "onboarding",
        actorName:      "Sarah Chen",
        actorRole:      "onboarding_specialist",
        transitionType: "stage_advance",
        note:           "Pre-hire screening passed — advancing to active onboarding",
        transitionedAt: new Date(nowMs - t.onboarding * DAY_MS),
      });
    }

    if (t.dispatch != null) {
      entries.push({
        workspaceId:    wsId,
        driverId:       driver.id,
        fromStage:      "onboarding",
        toStage:        "dispatch_ready",
        actorName:      "System",
        actorRole:      "system",
        transitionType: "auto_gate",
        note:           "All mandatory compliance gates passed — auto-advanced to Ready for Dispatch",
        transitionedAt: new Date(nowMs - t.dispatch * DAY_MS),
      });
    }

    if (t.fallout != null) {
      entries.push({
        workspaceId:    wsId,
        driverId:       driver.id,
        fromStage:      "onboarding",
        toStage:        "fallout",
        actorName:      "Diana Patel",
        actorRole:      "compliance_reviewer",
        transitionType: "stage_advance",
        note:           "Driver disqualified — drug test failed per DOT regulations",
        transitionedAt: new Date(nowMs - t.fallout * DAY_MS),
      });
    }

    await db.insert(driverStageHistoryTable).values(entries);
  }

  logger.info("Demo database seeded successfully");
}

/**
 * Idempotent workspace bootstrap — always runs on startup after seedDatabase().
 * Creates workspaces, assigns users to Franklin, and backfills workspace_id
 * on any tenant rows that have a null workspace_id (migration support).
 */
export async function ensureWorkspaceData() {
  // ── Upsert workspaces ─────────────────────────────────────────────────────
  await db
    .insert(workspacesTable)
    .values([
      {
        name: "Franklin Trucking",
        slug: "franklin",
        description: "Owner Operator and Company Driver onboarding — compliance gates, DataTruck handoff, Telegram onboarding.",
        status: "active",
      },
      {
        name: "DT National Freight",
        slug: "dt-national",
        description: "Multi-state carrier network. Workspace configuration in progress.",
        status: "coming_soon",
      },
    ])
    .onConflictDoNothing();

  const [franklin] = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.slug, "franklin"));

  if (!franklin) {
    logger.warn("Franklin workspace not found — skipping workspace data bootstrap");
    return;
  }

  const franklinId = franklin.id;

  // A deliberately empty DEV workspace is used for destructive reset
  // verification. Keep the workspace and auth infrastructure intact, but do
  // not recreate operational records on startup while this opt-in is active.
  if (process.env.FRANKLINS_DEMO_EMPTY_WORKSPACE === "1") {
    logger.info({ franklinId }, "Empty DEV workspace mode enabled — skipping operational bootstrap");
    return;
  }

  // ── Migrate old role names to new names (idempotent) ─────────────────────
  const ROLE_RENAMES: Record<string, string> = {
    admin:              "owner_admin",
    recruiter_readonly: "recruiter",
    compliance:         "compliance_reviewer",
    dispatch:           "dispatcher_readonly",
  };
  for (const [oldRole, newRole] of Object.entries(ROLE_RENAMES)) {
    await db.update(appUsersTable).set({ role: newRole }).where(eq(appUsersTable.role, oldRole));
    await db.update(workspaceMembershipsTable).set({ role: newRole }).where(eq(workspaceMembershipsTable.role, oldRole));
  }

  // ── Add manager demo user if none exists ──────────────────────────────────
  const managers = await db.select().from(appUsersTable).where(eq(appUsersTable.role, "manager"));
  if (managers.length === 0) {
    const [mgr] = await db.insert(appUsersTable).values({
      name: "Jordan Kim", email: "jordan.kim@demo.franklins.ai",
      role: "manager", avatarInitials: "JK", isCurrentSession: "false",
    }).returning();
    if (mgr) {
      await db.insert(workspaceMembershipsTable)
        .values({ workspaceId: franklinId, userId: mgr.id, role: "manager" })
        .onConflictDoNothing();
    }
  }

  // ── Assign existing users to Franklin (new users get workspace role = global role) ──
  const users = await db.select().from(appUsersTable);
  for (const user of users) {
    await db
      .insert(workspaceMembershipsTable)
      .values({ workspaceId: franklinId, userId: user.id, role: user.role })
      .onConflictDoNothing();
  }

  // ── Backfill: set workspace_id on rows that pre-date this migration ───────
  await Promise.all([
    db.update(driversTable).set({ workspaceId: franklinId }).where(isNull(driversTable.workspaceId)),
    db.update(checklistItemsTable).set({ workspaceId: franklinId }).where(isNull(checklistItemsTable.workspaceId)),
    db.update(onboardingTasksTable).set({ workspaceId: franklinId }).where(isNull(onboardingTasksTable.workspaceId)),
    db.update(driverDocumentsTable).set({ workspaceId: franklinId }).where(isNull(driverDocumentsTable.workspaceId)),
    db.update(activityEntriesTable).set({ workspaceId: franklinId }).where(isNull(activityEntriesTable.workspaceId)),
    db.update(commentsTable).set({ workspaceId: franklinId }).where(isNull(commentsTable.workspaceId)),
    db.update(datatruckSyncsTable).set({ workspaceId: franklinId }).where(isNull(datatruckSyncsTable.workspaceId)),
    db.update(workflowTemplatesTable).set({ workspaceId: franklinId }).where(isNull(workflowTemplatesTable.workspaceId)),
    db.update(templateStepsTable).set({ workspaceId: franklinId }).where(isNull(templateStepsTable.workspaceId)),
  ]);

  // ── Lead backfill — create leads for drivers that pre-date the leads table ──
  const existingLeadCount = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.workspaceId, franklinId));

  if (existingLeadCount.length === 0) {
    logger.info("No leads found — backfilling leads for existing drivers");

    const allDrivers = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.workspaceId, franklinId));

    // Create one lead per driver (sequentially to get individual IDs)
    const createdLeadIds: Map<number, number> = new Map(); // driverId → leadId
    for (const driver of allDrivers) {
      const phoneNorm = normalizePhone(driver.phone);
      const leadStatus =
        driver.status === "fallout"            ? "disqualified" as const :
        driver.status === "ready_for_dispatch" ? "hired"        as const :
                                                  "hired"        as const;
      const [lead] = await db
        .insert(leadsTable)
        .values({
          workspaceId:       franklinId,
          fullName:          driver.fullName,
          phoneRaw:          driver.phone,
          phoneNormalized:   phoneNorm,
          email:             driver.email,
          state:             driver.state,
          recruiterName:     driver.recruiterName,
          sourceChannel:     driver.sourceChannel,
          externalRecruitId: driver.externalRecruitId,
          status:            leadStatus,
        })
        .returning();
      if (lead) createdLeadIds.set(driver.id, lead.id);
    }

    // Link drivers → their lead
    for (const [driverId, leadId] of createdLeadIds.entries()) {
      await db.update(driversTable).set({ leadId }).where(eq(driversTable.id, driverId));
    }

    // Add demo duplicate leads for the two canonical test cases
    const dmitriDriver = allDrivers.find((d) => d.externalRecruitId === "recruit_dmitri_volkov_001");
    const mykolaDriver = allDrivers.find((d) => d.externalRecruitId === "recruit_mykola_petren_006");
    const dmitriLeadId = dmitriDriver ? (createdLeadIds.get(dmitriDriver.id) ?? null) : null;
    const mykolaLeadId = mykolaDriver ? (createdLeadIds.get(mykolaDriver.id) ?? null) : null;

    await db.insert(leadsTable).values([
      {
        workspaceId:         franklinId,
        fullName:            "D. Volkov",
        phoneRaw:            "+1 (555) 012-3456",
        phoneNormalized:     "5550123456",
        state:               "TX",
        recruiterName:       "Marcus Williams",
        sourceChannel:       "Indeed",
        status:              "pending" as const,
        isDuplicate:         true,
        duplicateConfidence: "exact_phone",
        duplicateOfLeadId:   dmitriLeadId,
        notes:               "Possible re-entry via different platform — same phone on file",
      },
      {
        workspaceId:         franklinId,
        fullName:            "Mykola Petrenkov",
        phoneRaw:            "+1 (555) 078-9001",
        phoneNormalized:     "5550789001",
        state:               "IL",
        recruiterName:       "Marcus Williams",
        sourceChannel:       "Referral",
        status:              "pending" as const,
        isDuplicate:         true,
        duplicateConfidence: "fuzzy_name_location",
        duplicateOfLeadId:   mykolaLeadId,
        notes:               "Name very similar to existing IL lead — verify identity before onboarding",
      },
    ]);

    logger.info({ driversBackfilled: allDrivers.length }, "Lead backfill complete");
  }

  // ── Stage history backfill ────────────────────────────────────────────────
  const existingHistory = await db
    .select({ id: driverStageHistoryTable.id })
    .from(driverStageHistoryTable)
    .where(eq(driverStageHistoryTable.workspaceId, franklinId));

  if (existingHistory.length === 0) {
    logger.info("No stage history found — backfilling for existing drivers");

    const allDrivers = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.workspaceId, franklinId));

    const nowMs  = Date.now();
    const DAY_MS = 24 * 3600 * 1000;

    for (const driver of allDrivers) {
      // Normalize stage value to formal stage key
      const formalStage = statusToStage(driver.status, driver.stage);
      if (formalStage !== driver.stage) {
        await db.update(driversTable)
          .set({ stage: formalStage })
          .where(eq(driversTable.id, driver.id));
      }

      const baseOffset = 10 + Math.round(Math.random() * 15); // 10-25 days ago
      const entries: (typeof driverStageHistoryTable.$inferInsert)[] = [];

      entries.push({
        workspaceId:    franklinId,
        driverId:       driver.id,
        fromStage:      null,
        toStage:        "hired",
        actorName:      "System",
        actorRole:      "system",
        transitionType: "hired_event",
        note:           `Hired event received — source: ${driver.sourceChannel}, recruiter: ${driver.recruiterName}`,
        transitionedAt: new Date(nowMs - baseOffset * DAY_MS),
      });

      if (["onboarding", "dispatch_ready", "active", "fallout"].includes(formalStage)) {
        entries.push({
          workspaceId:    franklinId,
          driverId:       driver.id,
          fromStage:      "hired",
          toStage:        "onboarding",
          actorName:      "System",
          actorRole:      "system",
          transitionType: "system",
          note:           "Backfilled — driver was in onboarding at time of stage system migration",
          transitionedAt: new Date(nowMs - (baseOffset - 3) * DAY_MS),
        });
      }

      if (formalStage === "dispatch_ready" || formalStage === "active") {
        entries.push({
          workspaceId:    franklinId,
          driverId:       driver.id,
          fromStage:      "onboarding",
          toStage:        "dispatch_ready",
          actorName:      "System",
          actorRole:      "system",
          transitionType: "system",
          note:           "Backfilled — driver was dispatch-ready at time of stage system migration",
          transitionedAt: new Date(nowMs - 2 * DAY_MS),
        });
      }

      if (formalStage === "fallout") {
        entries.push({
          workspaceId:    franklinId,
          driverId:       driver.id,
          fromStage:      "onboarding",
          toStage:        "fallout",
          actorName:      "System",
          actorRole:      "system",
          transitionType: "system",
          note:           `Backfilled — driver status '${driver.status}' at time of stage system migration`,
          transitionedAt: new Date(nowMs - 1 * DAY_MS),
        });
      }

      if (entries.length > 0) {
        await db.insert(driverStageHistoryTable).values(entries);
      }
    }

    logger.info({ driversBackfilled: allDrivers.length }, "Stage history backfill complete");
  }

  // ── Onboarding case backfill — create cases for drivers that pre-date the cases table ──
  const existingCaseCount = await db
    .select({ id: onboardingCasesTable.id })
    .from(onboardingCasesTable)
    .where(eq(onboardingCasesTable.workspaceId, franklinId));

  if (existingCaseCount.length === 0) {
    logger.info("No onboarding cases found — backfilling cases for existing drivers");

    const allDrivers = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.workspaceId, franklinId));

    const stageStatusMap: Record<string, string> = {
      hired:          "open",
      pre_hire:       "onboarding",
      onboarding:     "onboarding",
      dispatch_ready: "completed",
      active:         "completed",
      fallout:        "fallout",
    };

    for (const driver of allDrivers) {
      // Skip if driver has no externalRecruitId (manual entries via POST /drivers)
      const extId = driver.externalRecruitId ?? `manual-${driver.id}`;
      const caseStatus = stageStatusMap[driver.stage ?? "hired"] ?? "open";

      const [insertedCase] = await db.insert(onboardingCasesTable).values({
        workspaceId:          franklinId,
        driverId:             driver.id,
        leadId:               driver.leadId ?? null,
        externalRecruitId:    extId,
        recruiterName:        driver.recruiterName,
        sourceChannel:        driver.sourceChannel,
        initialNotes:         "Backfilled — case created from existing driver record during case system migration",
        assignedSpecialistId: driver.assigneeId,
        slaDeadline:          driver.slaDeadline,
        status:               caseStatus,
        completedAt:          caseStatus === "completed" ? new Date(Date.now() - 2 * 24 * 3600000) : null,
      }).returning();

      await db.update(onboardingCasesTable)
        .set({ caseNumber: `CASE-${insertedCase.id.toString().padStart(5, "0")}` })
        .where(eq(onboardingCasesTable.id, insertedCase.id));
    }

    logger.info({ driversBackfilled: allDrivers.length }, "Onboarding case backfill complete");
  }

  // ── Manager Board demo drivers (idempotent — keyed on externalRecruitId) ─────
  const sentinelId = "mgr_001_cortez_nelson";
  const existingMgrDrivers = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(
      and(
        eq(driversTable.workspaceId, franklinId),
        eq(driversTable.externalRecruitId, sentinelId),
      ),
    );

  if (existingMgrDrivers.length === 0) {
    logger.info("Seeding Manager Board demo drivers...");

    // Resolve demo users (look up by role from DB)
    const allUsers = await db.select().from(appUsersTable);
    const alexUser  = allUsers.find((u) => u.name === "Alex Martinez")  ?? allUsers[0];
    const jordanUser = allUsers.find((u) => u.name === "Jordan Kim")    ?? allUsers[0];
    const marcusUser = allUsers.find((u) => u.name === "Marcus Williams") ?? allUsers[0];
    const sarahUser  = allUsers.find((u) => u.name === "Sarah Chen")    ?? allUsers[0];

    const now = Date.now();
    const H = (h: number) => new Date(now - h * 3600 * 1000); // hoursAgo → Date

    type ColKey = "bot_new"|"application"|"drug_test"|"compliance"|"contract"|"package_eld"|"final_review"|"ready_for_dispatch";
    const colToStage: Record<ColKey, { stage: string; status: string; pct: number; readyForDispatch?: boolean }> = {
      bot_new:            { stage: "hired",          status: "pre_hire",         pct: 5   },
      application:        { stage: "pre_hire",        status: "in_progress",      pct: 15  },
      drug_test:          { stage: "onboarding",      status: "in_progress",      pct: 22  },
      compliance:         { stage: "onboarding",      status: "in_progress",      pct: 42  },
      contract:           { stage: "onboarding",      status: "in_progress",      pct: 62  },
      package_eld:        { stage: "onboarding",      status: "in_progress",      pct: 82  },
      final_review:       { stage: "dispatch_ready",  status: "pending_approval", pct: 95  },
      ready_for_dispatch: { stage: "active",           status: "ready_for_dispatch", pct: 100, readyForDispatch: true },
    };

    // [externalId suffix, fullName, state, driverType, recruiter, source, caseOwner,
    //  truckYear, truckMake, col, hoursAgoHired, nextAction, blockers?, waitingOnExternal?]
    const mgrDrivers: Array<{
      extSuffix: string; fullName: string; state: string;
      driverType: "owner_operator"|"company_driver";
      recruiter: string; source: string;
      caseOwner: { id: number; name: string };
      truckYear?: string; truckMake?: string;
      col: ColKey; hoursAgo: number;
      nextAction: string; blockers?: string; waitingOnExternal?: boolean;
    }> = [
      // ── Bot / New ─────────────────────────────────────────────────────────
      { extSuffix:"039_dordan_matthews",  fullName:"Dordan Matthews",   state:"MS", driverType:"company_driver",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"bot_new",   hoursAgo:1,  nextAction:"Send application link and e-sign consent" },
      { extSuffix:"046_witny_dalmond",    fullName:"Witny Dalmond",     state:"LA", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Facebook",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2021",truckMake:"Kenworth",  col:"bot_new",   hoursAgo:2,  nextAction:"Confirm CDL class and collect basic info" },
      // ── Application ──────────────────────────────────────────────────────
      { extSuffix:"002_kervens_jean",     fullName:"Kervens Jean",      state:"FL", driverType:"company_driver",  recruiter:marcusUser.name, source:"Indeed",    caseOwner:{id:alexUser.id, name:alexUser.name},   col:"application",hoursAgo:5,  nextAction:"Complete pre-hire MVR authorization form" },
      { extSuffix:"006_guillermod_david", fullName:"Guillermod David",  state:"GA", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Referral",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2020",truckMake:"Peterbilt", col:"application",hoursAgo:7,  nextAction:"Verify insurance and registration docs" },
      { extSuffix:"012_martin_washington",fullName:"Martin Washington", state:"SC", driverType:"company_driver",  recruiter:marcusUser.name, source:"LinkedIn",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"application",hoursAgo:6,  nextAction:"Schedule pre-hire screening appointment" },
      { extSuffix:"020_meeckins_orlando", fullName:"Meeckins Orlando",  state:"AL", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2022",truckMake:"Freightliner", col:"application",hoursAgo:9,  nextAction:"Collect MVR and employment history" },
      { extSuffix:"027_lamon_welch",      fullName:"Lamon Welch",       state:"NC", driverType:"company_driver",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"application",hoursAgo:8,  nextAction:"E-sign consent and release forms" },
      { extSuffix:"033_ruben_villalonga", fullName:"Ruben Villalonga",  state:"TX", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2019",truckMake:"Volvo",       col:"application",hoursAgo:10, nextAction:"Confirm FMCSA number and operating authority" },
      { extSuffix:"040_omar_jr_ramirez",  fullName:"Omar Jr Ramirez",   state:"CA", driverType:"company_driver",  recruiter:marcusUser.name, source:"Referral",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"application",hoursAgo:4,  nextAction:"Schedule orientation and drug test" },
      { extSuffix:"045_montrail_howard",  fullName:"Montrail Howard",   state:"OH", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2023",truckMake:"International", col:"application",hoursAgo:6,  nextAction:"Complete FMCSA background check authorization" },
      // ── Drug Test ────────────────────────────────────────────────────────
      { extSuffix:"001_cortez_nelson",    fullName:"Cortez Nelson",     state:"TX", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2022",truckMake:"Kenworth",  col:"drug_test",  hoursAgo:11, nextAction:"Confirm drug test appointment at Quest lab" },
      { extSuffix:"005_david_epting",     fullName:"David Epting",      state:"TN", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"drug_test",  hoursAgo:12, nextAction:"Follow up — test scheduled for today 2pm" },
      { extSuffix:"010_vaughn_keiron",    fullName:"Vaughn Keiron",     state:"VA", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2020",truckMake:"Peterbilt", col:"drug_test",  hoursAgo:14, nextAction:"Confirm result received from lab" },
      { extSuffix:"015_christopher_cherles",fullName:"Christopher Cherles",state:"GA",driverType:"company_driver",recruiter:sarahUser.name, source:"Referral",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"drug_test",  hoursAgo:13, nextAction:"Call driver — missed test window" },
      { extSuffix:"021_krystal_morris",   fullName:"Krystal Morris",    state:"FL", driverType:"company_driver",  recruiter:marcusUser.name, source:"LinkedIn",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"drug_test",  hoursAgo:10, nextAction:"Drug test clear — advance to compliance" },
      { extSuffix:"026_damon_applewhite", fullName:"Damon Applewhite",  state:"NC", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2021",truckMake:"Freightliner", col:"drug_test",  hoursAgo:15, nextAction:"Waiting on lab confirmation", waitingOnExternal:true },
      { extSuffix:"032_shane_honora",     fullName:"Shane Honora",      state:"SC", driverType:"company_driver",  recruiter:marcusUser.name, source:"Indeed",    caseOwner:{id:alexUser.id, name:alexUser.name},   col:"drug_test",  hoursAgo:12, nextAction:"Send test order to Concentra" },
      { extSuffix:"038_john_harper",      fullName:"John Harper",       state:"MO", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Referral",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2018",truckMake:"International", col:"drug_test",  hoursAgo:11, nextAction:"Confirm CDL endorsements before next step" },
      { extSuffix:"047_tanya_erickson",   fullName:"Tanya Erickson",    state:"MI", driverType:"company_driver",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"drug_test",  hoursAgo:9,  nextAction:"Drug test kit mailed — awaiting return" },
      // ── Compliance ───────────────────────────────────────────────────────
      { extSuffix:"008_clifton_gregory",  fullName:"Clifton Gregory",   state:"IL", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2023",truckMake:"Kenworth",  col:"compliance", hoursAgo:16, nextAction:"Collect insurance certificate from broker", blockers:"Insurance broker not responding", waitingOnExternal:true },
      { extSuffix:"016_tolbert_ormond",   fullName:"Tolbert Ormond",    state:"OH", driverType:"company_driver",  recruiter:marcusUser.name, source:"Indeed",    caseOwner:{id:alexUser.id, name:alexUser.name},   col:"compliance", hoursAgo:17, nextAction:"Verify MVR — state DMV 3-day wait", waitingOnExternal:true },
      { extSuffix:"022_terry_tompkins",   fullName:"Terry Tompkins",    state:"PA", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Facebook",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2020",truckMake:"Mack",        col:"compliance", hoursAgo:19, nextAction:"Collect medical card copy" },
      { extSuffix:"028_scott_gregory",    fullName:"Scott Gregory",     state:"CO", driverType:"company_driver",  recruiter:marcusUser.name, source:"Referral",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"compliance", hoursAgo:18, nextAction:"Clear background check — 24h window" },
      { extSuffix:"034_welton_hall",      fullName:"Welton Hall",       state:"NV", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"LinkedIn",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2022",truckMake:"Peterbilt",   col:"compliance", hoursAgo:20, nextAction:"Insurance cert missing — contact broker today", blockers:"Waiting on insurance cert" },
      { extSuffix:"041_jaime_barragan",   fullName:"Jaime Barragan",    state:"NM", driverType:"company_driver",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"compliance", hoursAgo:15, nextAction:"Employment verification from prior carrier" },
      { extSuffix:"048_jackie_smith",     fullName:"Jackie Smith",      state:"WA", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2019",truckMake:"Freightliner", col:"compliance", hoursAgo:17, nextAction:"DOT inspection cert needed before contract" },
      // ── Contract ─────────────────────────────────────────────────────────
      { extSuffix:"011_kurt_germain",     fullName:"Kurt Germain",      state:"NY", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2024",truckMake:"Kenworth",  col:"contract",   hoursAgo:20, nextAction:"Send carrier agreement for e-sign" },
      { extSuffix:"017_michael_mayfield", fullName:"Michael Mayfield",  state:"TX", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Facebook",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"contract",   hoursAgo:22, nextAction:"Follow up on unsigned contract — 2nd notice" },
      { extSuffix:"023_gunter_bernard",   fullName:"Gunter Bernard",    state:"GA", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Referral",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2021",truckMake:"Volvo",       col:"contract",   hoursAgo:21, nextAction:"Lease agreement pending driver review", waitingOnExternal:true },
      { extSuffix:"029_clawson_bailey",   fullName:"Clawson Bailey",    state:"MS", driverType:"company_driver",  recruiter:sarahUser.name,  source:"LinkedIn",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"contract",   hoursAgo:23, nextAction:"Confirm employment agreement details" },
      { extSuffix:"035_jarrod_noble",     fullName:"Jarrod Noble",      state:"AL", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2022",truckMake:"Freightliner", col:"contract",   hoursAgo:19, nextAction:"Send W-9 and banking info form" },
      { extSuffix:"042_malik_mclaurin",   fullName:"Malik McLaurin",    state:"NC", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"contract",   hoursAgo:24, nextAction:"Contract countersigned — process direct deposit" },
      { extSuffix:"049_anthony_lewis",    fullName:"Anthony Lewis",     state:"VA", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2020",truckMake:"International", col:"contract",   hoursAgo:22, nextAction:"Await signed addendum from carrier admin" },
      // ── Package / ELD / TG ───────────────────────────────────────────────
      { extSuffix:"003_bernardo_williams",fullName:"Bernardo Williams", state:"FL", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2023",truckMake:"Peterbilt",   col:"package_eld",hoursAgo:24, nextAction:"Ship ELD device — confirm address" },
      { extSuffix:"007_jhonsly_das",      fullName:"Jhonsly Das",       state:"NJ", driverType:"company_driver",  recruiter:marcusUser.name, source:"Indeed",    caseOwner:{id:alexUser.id, name:alexUser.name},   col:"package_eld",hoursAgo:26, nextAction:"ELD activation code sent — confirm pairing" },
      { extSuffix:"013_david_jones",      fullName:"David Jones",       state:"PA", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Referral",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2021",truckMake:"Western Star",  col:"package_eld",hoursAgo:22, nextAction:"Telegram group created — add driver" },
      { extSuffix:"018_paul_taylor",      fullName:"Paul Taylor",       state:"OH", driverType:"company_driver",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"package_eld",hoursAgo:25, nextAction:"Welcome package mailed — confirm receipt", waitingOnExternal:true },
      { extSuffix:"024_noel_morrison",    fullName:"Noel Morrison",     state:"CO", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"LinkedIn",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2024",truckMake:"Kenworth",  col:"package_eld",hoursAgo:27, nextAction:"ELD installed — run test trip verification" },
      { extSuffix:"030_barry_batchelor",  fullName:"Barry Batchelor",   state:"SC", driverType:"company_driver",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"package_eld",hoursAgo:23, nextAction:"Telegram onboarding flow — pin welcome message" },
      { extSuffix:"036_danny_duke",       fullName:"Danny Duke",        state:"TN", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2020",truckMake:"Mack",        col:"package_eld",hoursAgo:28, nextAction:"Confirm ELD compliance test passed" },
      { extSuffix:"043_willie_howie",     fullName:"Willie Howie",      state:"GA", driverType:"company_driver",  recruiter:marcusUser.name, source:"Referral",  caseOwner:{id:alexUser.id, name:alexUser.name},   col:"package_eld",hoursAgo:26, nextAction:"Ship fuel card and welcome kit" },
      { extSuffix:"050_donald_jones",     fullName:"Donald Jones",      state:"IL", driverType:"owner_operator",  recruiter:sarahUser.name,  source:"Facebook",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, truckYear:"2022",truckMake:"Volvo",       col:"package_eld",hoursAgo:24, nextAction:"Run IFTA account setup call" },
      // ── Final Review ─────────────────────────────────────────────────────
      { extSuffix:"004_mark_dayton",      fullName:"Mark Dayton",       state:"TX", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2022",truckMake:"Freightliner", col:"final_review",hoursAgo:30, nextAction:"Final review sign-off by compliance" },
      { extSuffix:"009_george_ajuruchi",  fullName:"George Ajuruchi",   state:"NY", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Indeed",    caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"final_review",hoursAgo:31, nextAction:"Awaiting compliance team clearance", waitingOnExternal:true },
      { extSuffix:"014_anthony_rich",     fullName:"Anthony Rich",      state:"FL", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Facebook",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2020",truckMake:"Kenworth",  col:"final_review",hoursAgo:32, nextAction:"Review complete — send to dispatch" },
      { extSuffix:"019_jamelle_byard",    fullName:"Jamelle Byard",     state:"OH", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Referral",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"final_review",hoursAgo:33, nextAction:"Manager approval pending — 1 gate open", blockers:"One mandatory gate still open" },
      { extSuffix:"025_bryan_ray",        fullName:"Bryan Ray",         state:"VA", driverType:"owner_operator",  recruiter:marcusUser.name, source:"LinkedIn",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2023",truckMake:"Peterbilt",   col:"final_review",hoursAgo:34, nextAction:"Sign-off complete — ready for dispatch mark", blockers:"Awaiting final manager sign-off" },
      { extSuffix:"031_george_roberts",   fullName:"George Roberts",    state:"CA", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Telegram",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"final_review",hoursAgo:29, nextAction:"Compliance review complete — push to dispatch" },
      { extSuffix:"037_bruce_bell",       fullName:"Bruce Bell",        state:"TN", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Indeed",    caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2021",truckMake:"International", col:"final_review",hoursAgo:35, nextAction:"Final gate — collect signed DOT inspection" },
      { extSuffix:"044_gustavo_guerrero", fullName:"Gustavo Guerrero",  state:"TX", driverType:"company_driver",  recruiter:sarahUser.name,  source:"Facebook",  caseOwner:{id:jordanUser.id,name:jordanUser.name}, col:"final_review",hoursAgo:31, nextAction:"All clear — notify dispatcher" },
      // ── Ready for Dispatch ───────────────────────────────────────────────
      { extSuffix:"051_mahmood_qadri",    fullName:"Mahmood Qadri",     state:"WA", driverType:"owner_operator",  recruiter:marcusUser.name, source:"Telegram",  caseOwner:{id:alexUser.id, name:alexUser.name},   truckYear:"2019",truckMake:"Freightliner", col:"ready_for_dispatch",hoursAgo:42, nextAction:"Assign first load" },
    ];

    for (let i = 0; i < mgrDrivers.length; i++) {
      const d = mgrDrivers[i];
      const phoneNum = String(700001 + i).padStart(6, "0");
      const phoneRaw = `+1 (555) ${phoneNum.slice(0,3)}-${phoneNum.slice(3)}`;
      const extId = `mgr_${d.extSuffix}`;
      const colData = colToStage[d.col];

      // Insert lead
      const [lead] = await db.insert(leadsTable).values({
        workspaceId:         franklinId,
        fullName:            d.fullName,
        phoneRaw,
        phoneNormalized:     phoneRaw.replace(/\D/g, ""),
        state:               d.state,
        recruiterName:       d.recruiter,
        sourceChannel:       d.source,
        externalRecruitId:   extId,
        status:              "hired" as const,
      }).returning();

      // Insert driver
      const truckInfo = d.truckYear && d.truckMake
        ? `${d.truckYear} ${d.truckMake} ${d.driverType === "owner_operator" ? "Cascadia" : ""} `.trim()
        : null;

      const [driver] = await db.insert(driversTable).values({
        workspaceId:       franklinId,
        leadId:            lead.id,
        fullName:          d.fullName,
        phone:             phoneRaw,
        state:             d.state,
        driverType:        d.driverType,
        status:            colData.status,
        stage:             colData.stage,
        priority:          "medium",
        recruiterName:     d.recruiter,
        sourceChannel:     d.source,
        assigneeId:        sarahUser.id,
        assigneeName:      sarahUser.name,
        truckInfo:         truckInfo ?? undefined,
        truckYear:         d.truckYear ?? undefined,
        truckMake:         d.truckMake ?? undefined,
        readyForDispatch:  colData.readyForDispatch ?? false,
        blockers:          d.blockers ?? undefined,
        nextBestAction:    d.nextAction,
        nextActionDue:     new Date(now + 4 * 3600 * 1000), // due in 4h from now
        waitingOnExternal: d.waitingOnExternal ?? false,
        pushCount:         0,
        externalRecruitId: extId,
        completionPercent: colData.pct,
      }).returning();

      // Insert case with hiredAt and permanent caseOwnerName
      const hiredAt = H(d.hoursAgo);
      const caseStatus =
        colData.stage === "fallout"         ? "fallout" :
        colData.readyForDispatch            ? "completed" :
        colData.stage === "dispatch_ready"  ? "completed" :
        colData.stage === "hired"           ? "open" : "onboarding";

      const [insertedCase] = await db.insert(onboardingCasesTable).values({
        workspaceId:          franklinId,
        driverId:             driver.id,
        leadId:               lead.id,
        externalRecruitId:    extId,
        recruiterName:        d.recruiter,
        sourceChannel:        d.source,
        assignedSpecialistId: sarahUser.id,
        status:               caseStatus,
        hiredAt,
        caseOwnerId:          d.caseOwner.id,
        caseOwnerName:        d.caseOwner.name,
        completedAt:          caseStatus === "completed" ? new Date(now - 1 * 3600 * 1000) : null,
      }).returning();

      await db.update(onboardingCasesTable)
        .set({ caseNumber: `CASE-${insertedCase.id.toString().padStart(5, "0")}` })
        .where(eq(onboardingCasesTable.id, insertedCase.id));

      // Minimal activity entry
      await db.insert(activityEntriesTable).values({
        workspaceId: franklinId,
        driverId:    driver.id,
        actorName:   "System",
        actorRole:   "system",
        action:      "Onboarding record created",
        detail:      `${d.fullName} hired via ${d.source} — case opened`,
        createdAt:   hiredAt,
      });
    }

    logger.info({ count: mgrDrivers.length }, "Manager Board demo drivers seeded");
  }

  logger.info({ franklinId, userCount: users.length }, "Workspace data ensured");
}
