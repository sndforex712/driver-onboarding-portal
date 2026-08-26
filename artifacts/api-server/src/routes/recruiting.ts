import { Router, type IRouter, type Response } from "express";
import { and, asc, count, desc, eq, exists, gt, ilike, inArray, isNull, lte, lt, notLike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import {
  appUsersTable,
  driversTable,
  franklinLeadIngestsTable,
  leadsTable,
  onboardingCasesTable,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  recruitingOnboardingTransfersTable,
  recruitingSheetRowsTable,
  recruitingTransitionEffectsTable,
  workspaceMembershipsTable,
} from "@workspace/db";
import {
  CreateRecruitingCaseBody,
  CreateRecruitingCaseHeader,
  DecideRecruitingManagerReviewBody,
  DecideRecruitingManagerReviewHeader,
  DecideRecruitingManagerReviewParams,
  GetRecruitingCaseParams,
  GetRecruitingQueueQueryParams,
  ListRecruitingCaseTimelineParams,
  ListRecruitingCaseTimelineQueryParams,
  ListRecruitingCasesQueryParams,
  ReturnRecruitingFutureFollowUpBody,
  ReturnRecruitingFutureFollowUpHeader,
  ReturnRecruitingFutureFollowUpParams,
  TransferRecruitingCaseToOnboardingBody,
  TransferRecruitingCaseToOnboardingHeader,
  TransferRecruitingCaseToOnboardingParams,
  TransitionRecruitingCaseBody,
  TransitionRecruitingCaseHeader,
  TransitionRecruitingCaseParams,
} from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, conflict, notFound, unprocessable } from "../lib/api-errors";
import {
  DrizzleRecruitingStore,
  RecruitingAuthorizationError,
  RecruitingConflictError,
  RecruitingRepository,
} from "../lib/recruiting-repository";
import {
  serializeRecruitingMutationResponse,
  serializeRecruitingTransferResponse,
} from "./recruiting-response-contract";
import { legacyDriverInfo } from "../lib/recruiting-list-item";
import { recruitingCaseOrderBy, type RecruitingCaseSort } from "../lib/recruiting-case-order";
import {
  hasImportedLegacyProfiles as hasImportedLegacyProfilesForQuery,
  withOperationalVisibilityFilters as withOperationalVisibilityFiltersForQuery,
} from "../lib/recruiting-operational-visibility";

const router: IRouter = Router();
const repository = new RecruitingRepository(new DrizzleRecruitingStore());
const caseOwner = alias(appUsersTable, "recruiting_case_owner");
const taskOwner = alias(appUsersTable, "recruiting_task_owner");

const caseSelection = {
  id: recruitingCasesTable.id,
  workspaceId: recruitingCasesTable.workspaceId,
  driverId: recruitingCasesTable.driverId,
  leadId: recruitingCasesTable.leadId,
  caseNumber: recruitingCasesTable.caseNumber,
  sourceId: recruitingCasesTable.sourceId,
  stage: recruitingCasesTable.stage,
  lifecycle: recruitingCasesTable.lifecycle,
  caseOwnerId: recruitingCasesTable.caseOwnerId,
  taskOwnerId: recruitingCasesTable.taskOwnerId,
  nextAction: recruitingCasesTable.nextAction,
  nextActionDueAt: recruitingCasesTable.nextActionDueAt,
  slaDeadlineAt: recruitingCasesTable.slaDeadlineAt,
  followUpDueAt: recruitingCasesTable.followUpDueAt,
  resumeStage: recruitingCasesTable.resumeStage,
  closedLostReason: recruitingCasesTable.closedLostReason,
  closedLostNote: recruitingCasesTable.closedLostNote,
  version: recruitingCasesTable.version,
  transferStatus: recruitingCasesTable.transferStatus,
  transferRequestedAt: recruitingCasesTable.transferRequestedAt,
  transferredAt: recruitingCasesTable.transferredAt,
  createdAt: recruitingCasesTable.createdAt,
  updatedAt: recruitingCasesTable.updatedAt,
};

function slaColor(deadline: Date | null): "green" | "yellow" | "red" {
  if (!deadline) return "red";
  const remaining = deadline.getTime() - Date.now();
  if (remaining <= 0) return "red";
  return remaining <= 4 * 60 * 60 * 1000 ? "yellow" : "green";
}

function toListItem(row: any) {
  return {
    ...Object.fromEntries(Object.entries(caseSelection).map(([key]) => [key, row[key]])),
    driverName: row.driverName,
    leadName: row.leadName,
    caseOwnerName: row.caseOwnerName ?? null,
    taskOwnerName: row.taskOwnerName ?? null,
    slaColor: slaColor(row.slaDeadlineAt),
    ...legacyDriverInfo(row),
    franklinIntake: row.franklinIntakeId == null ? null : {
      phone: row.franklinPhoneNormalized,
      driverType: row.franklinDriverType,
      cdlFrontReceived: row.franklinCdlFrontReceived,
      cdlBackReceived: row.franklinCdlBackReceived,
      medicalCardReceived: row.franklinMedicalCardReceived,
      docsReceived: row.franklinDocsReceived,
      displayedRecruiter: row.franklinDisplayedRecruiter,
      requestedAt: row.franklinRequestedAt,
    },
  };
}

function sendRecruitingError(res: Response, error: unknown): void {
  if (error instanceof RecruitingAuthorizationError) {
    // Never disclose whether a foreign workspace owns a valid Recruiting case.
    notFound(res, "Recruiting case was not found");
    return;
  }
  if (error instanceof RecruitingConflictError) {
    conflict(res, error.message, { conflictCode: error.code });
    return;
  }
  if (error instanceof Error) {
    unprocessable(res, error.message);
    return;
  }
  throw error;
}

function activeStageOnly(stage: string | undefined): boolean {
  return !stage || !["hired_transferred_to_onboarding", "future_follow_up", "closed_lost"].includes(stage);
}

async function hasImportedLegacyProfiles(workspaceId: number): Promise<boolean> {
  return hasImportedLegacyProfilesForQuery(db, workspaceId);
}

function withOperationalVisibilityFilters(workspaceId: number, conditions: SQL[], excludeDemo: boolean): SQL[] {
  return withOperationalVisibilityFiltersForQuery(db, workspaceId, conditions, excludeDemo);
}

function legacyProfileSelection(workspaceId: number) {
  const mainProfileConditions = and(
    eq(recruitingSheetRowsTable.workspaceId, workspaceId),
    eq(recruitingSheetRowsTable.mappedCaseId, recruitingCasesTable.id),
    eq(recruitingSheetRowsTable.tabName, "MAIN JIDO FREIGHT LLC"),
    inArray(recruitingSheetRowsTable.sourceStatus, ["active", "conflict"]),
  );
  return {
    legacyPhone: sql<string | null>`(
      select ${recruitingSheetRowsTable.normalizedPhone}
      from ${recruitingSheetRowsTable}
      where ${mainProfileConditions}
      order by ${recruitingSheetRowsTable.id} asc
      limit 1
    )`.as("legacy_phone"),
    legacyDriverType: sql<string | null>`(
      select ${recruitingSheetRowsTable.driverType}
      from ${recruitingSheetRowsTable}
      where ${mainProfileConditions}
      order by ${recruitingSheetRowsTable.id} asc
      limit 1
    )`.as("legacy_driver_type"),
    legacyTruckYearMake: sql<string | null>`(
      select ${recruitingSheetRowsTable.truckYearMake}
      from ${recruitingSheetRowsTable}
      where ${mainProfileConditions}
      order by ${recruitingSheetRowsTable.id} asc
      limit 1
    )`.as("legacy_truck_year_make"),
  };
}

async function listRows(
  workspaceId: number,
  conditions: SQL[],
  limit: number,
  offset = 0,
  excludeDemo = false,
  sort: RecruitingCaseSort = "progress",
) {
  return db
    .select({
      ...caseSelection,
      ...legacyProfileSelection(workspaceId),
      franklinIntakeId: franklinLeadIngestsTable.id,
      franklinPhoneNormalized: franklinLeadIngestsTable.phoneNormalized,
      franklinDriverType: franklinLeadIngestsTable.driverType,
      franklinCdlFrontReceived: franklinLeadIngestsTable.cdlFrontReceived,
      franklinCdlBackReceived: franklinLeadIngestsTable.cdlBackReceived,
      franklinMedicalCardReceived: franklinLeadIngestsTable.medicalCardReceived,
      franklinDocsReceived: franklinLeadIngestsTable.docsReceived,
      franklinDisplayedRecruiter: franklinLeadIngestsTable.displayedRecruiter,
      franklinRequestedAt: franklinLeadIngestsTable.requestedAt,
      driverName: sql<string>`coalesce(${driversTable.fullName}, ${leadsTable.fullName})`.as("driver_name"),
      leadName: leadsTable.fullName,
      caseOwnerName: caseOwner.name,
      taskOwnerName: taskOwner.name,
    })
    .from(recruitingCasesTable)
    .leftJoin(driversTable, and(
      eq(driversTable.id, recruitingCasesTable.driverId),
      eq(driversTable.workspaceId, workspaceId),
    ))
    .innerJoin(leadsTable, and(
      eq(leadsTable.id, recruitingCasesTable.leadId),
      eq(leadsTable.workspaceId, workspaceId),
    ))
    .leftJoin(franklinLeadIngestsTable, and(
      eq(franklinLeadIngestsTable.workspaceId, workspaceId),
      eq(franklinLeadIngestsTable.recruitingCaseId, recruitingCasesTable.id),
    ))
    .leftJoin(caseOwner, eq(caseOwner.id, recruitingCasesTable.caseOwnerId))
    .leftJoin(taskOwner, eq(taskOwner.id, recruitingCasesTable.taskOwnerId))
    .where(and(eq(recruitingCasesTable.workspaceId, workspaceId), ...withOperationalVisibilityFilters(workspaceId, conditions, excludeDemo)))
    .orderBy(...recruitingCaseOrderBy(sort))
    .limit(limit)
    .offset(offset);
}

async function countRows(workspaceId: number, conditions: SQL[], excludeDemo = false) {
  const [result] = await db
    .select({ total: count() })
    .from(recruitingCasesTable)
    .leftJoin(driversTable, and(
      eq(driversTable.id, recruitingCasesTable.driverId),
      eq(driversTable.workspaceId, workspaceId),
    ))
    .innerJoin(leadsTable, and(
      eq(leadsTable.id, recruitingCasesTable.leadId),
      eq(leadsTable.workspaceId, workspaceId),
    ))
    .where(and(eq(recruitingCasesTable.workspaceId, workspaceId), ...withOperationalVisibilityFilters(workspaceId, conditions, excludeDemo)));
  return result?.total ?? 0;
}

// ─── Read endpoints ────────────────────────────────────────────────────────────

router.get("/recruiting/cases", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const parsed = ListRecruitingCasesQueryParams.safeParse(req.query);
    if (!parsed.success) { badRequest(res, parsed.error.message); return; }

    const conditions: SQL[] = [];
    if (parsed.data.stage) conditions.push(eq(recruitingCasesTable.stage, parsed.data.stage));
    if (parsed.data.lifecycle) conditions.push(eq(recruitingCasesTable.lifecycle, parsed.data.lifecycle));
    if (parsed.data.caseOwnerId != null) conditions.push(eq(recruitingCasesTable.caseOwnerId, parsed.data.caseOwnerId));
    if (parsed.data.taskOwnerId != null) conditions.push(eq(recruitingCasesTable.taskOwnerId, parsed.data.taskOwnerId));
    if (parsed.data.driverId != null) conditions.push(eq(recruitingCasesTable.driverId, parsed.data.driverId));
    if (parsed.data.leadId != null) conditions.push(eq(recruitingCasesTable.leadId, parsed.data.leadId));
    if (parsed.data.dueBefore) conditions.push(lte(recruitingCasesTable.nextActionDueAt, parsed.data.dueBefore));
    if (parsed.data.search) {
      const term = `%${parsed.data.search}%`;
      conditions.push(or(
        ilike(driversTable.fullName, term),
        ilike(leadsTable.fullName, term),
        ilike(recruitingCasesTable.caseNumber, term),
      ) as SQL);
    }

    const offset = (parsed.data.page - 1) * parsed.data.limit;
    const excludeDemo = await hasImportedLegacyProfiles(auth.workspaceId);
    const [rows, total] = await Promise.all([
      listRows(auth.workspaceId, conditions, parsed.data.limit, offset, excludeDemo, parsed.data.sort),
      countRows(auth.workspaceId, conditions, excludeDemo),
    ]);
    res.json({ items: rows.map(toListItem), page: parsed.data.page, limit: parsed.data.limit, total });
  });
});

router.get("/recruiting/cases/:id", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const params = GetRecruitingCaseParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [row] = await db
      .select({
        ...caseSelection,
        ...legacyProfileSelection(auth.workspaceId),
        franklinIntakeId: franklinLeadIngestsTable.id,
        franklinPhoneNormalized: franklinLeadIngestsTable.phoneNormalized,
        franklinDriverType: franklinLeadIngestsTable.driverType,
        franklinCdlFrontReceived: franklinLeadIngestsTable.cdlFrontReceived,
        franklinCdlBackReceived: franklinLeadIngestsTable.cdlBackReceived,
        franklinMedicalCardReceived: franklinLeadIngestsTable.medicalCardReceived,
        franklinDocsReceived: franklinLeadIngestsTable.docsReceived,
        franklinDisplayedRecruiter: franklinLeadIngestsTable.displayedRecruiter,
        franklinRequestedAt: franklinLeadIngestsTable.requestedAt,
        driverName: sql<string>`coalesce(${driversTable.fullName}, ${leadsTable.fullName})`.as("driver_name"),
        leadName: leadsTable.fullName,
        caseOwnerName: caseOwner.name,
        taskOwnerName: taskOwner.name,
        onboardingCaseId: onboardingCasesTable.id,
        onboardingCaseNumber: onboardingCasesTable.caseNumber,
        transferIdempotencyKey: recruitingOnboardingTransfersTable.transferIdempotencyKey,
      })
      .from(recruitingCasesTable)
      .leftJoin(driversTable, and(eq(driversTable.id, recruitingCasesTable.driverId), eq(driversTable.workspaceId, auth.workspaceId)))
      .innerJoin(leadsTable, and(eq(leadsTable.id, recruitingCasesTable.leadId), eq(leadsTable.workspaceId, auth.workspaceId)))
      .leftJoin(caseOwner, eq(caseOwner.id, recruitingCasesTable.caseOwnerId))
      .leftJoin(taskOwner, eq(taskOwner.id, recruitingCasesTable.taskOwnerId))
      .leftJoin(franklinLeadIngestsTable, and(
        eq(franklinLeadIngestsTable.workspaceId, auth.workspaceId),
        eq(franklinLeadIngestsTable.recruitingCaseId, recruitingCasesTable.id),
      ))
      .leftJoin(recruitingOnboardingTransfersTable, and(
        eq(recruitingOnboardingTransfersTable.workspaceId, auth.workspaceId),
        eq(recruitingOnboardingTransfersTable.recruitingCaseId, recruitingCasesTable.id),
      ))
      .leftJoin(onboardingCasesTable, and(
        eq(onboardingCasesTable.id, recruitingOnboardingTransfersTable.onboardingCaseId),
        eq(onboardingCasesTable.workspaceId, auth.workspaceId),
      ))
      .where(and(
        eq(recruitingCasesTable.workspaceId, auth.workspaceId),
        eq(recruitingCasesTable.id, params.data.id),
        ...withOperationalVisibilityFilters(auth.workspaceId, [], false),
      ));

    if (!row) { notFound(res, "Recruiting case was not found"); return; }
    res.json({ ...toListItem(row), onboardingCaseId: row.onboardingCaseId ?? null, onboardingCaseNumber: row.onboardingCaseNumber ?? null, transferIdempotencyKey: row.transferIdempotencyKey ?? null });
  });
});

router.get("/recruiting/cases/:id/timeline", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const path = ListRecruitingCaseTimelineParams.safeParse(req.params);
    const query = ListRecruitingCaseTimelineQueryParams.safeParse(req.query);
    if (!path.success || !query.success) { badRequest(res, "Invalid Recruiting timeline request"); return; }

    const [caseRow] = await db.select({ id: recruitingCasesTable.id }).from(recruitingCasesTable)
      .where(and(
        eq(recruitingCasesTable.workspaceId, auth.workspaceId),
        eq(recruitingCasesTable.id, path.data.id),
        ...withOperationalVisibilityFilters(auth.workspaceId, [], false),
      ));
    if (!caseRow) { notFound(res, "Recruiting case was not found"); return; }

    const eventConditions: SQL[] = [
      eq(recruitingCaseEventsTable.workspaceId, auth.workspaceId),
      eq(recruitingCaseEventsTable.recruitingCaseId, path.data.id),
    ];
    if (query.data.beforeId) eventConditions.push(lt(recruitingCaseEventsTable.id, query.data.beforeId));
    const events = await db.select().from(recruitingCaseEventsTable).where(and(...eventConditions))
      .orderBy(desc(recruitingCaseEventsTable.id)).limit(query.data.limit + 1);
    const visible = events.slice(0, query.data.limit);
    const eventIds = visible.map(event => event.id);
    const effects = eventIds.length === 0 ? [] : await db.select().from(recruitingTransitionEffectsTable)
      .where(and(eq(recruitingTransitionEffectsTable.workspaceId, auth.workspaceId), inArray(recruitingTransitionEffectsTable.recruitingCaseId, [path.data.id])));
    const effectsByTransition = new Map<string, typeof effects>();
    for (const effect of effects) {
      const existing = effectsByTransition.get(effect.transitionIdempotencyKey) ?? [];
      existing.push(effect);
      effectsByTransition.set(effect.transitionIdempotencyKey, existing);
    }
    res.json({
      items: visible.map(event => ({
        ...event,
        actorName: null,
        effects: effectsByTransition.get(event.transitionIdempotencyKey) ?? [],
      })),
      limit: query.data.limit,
      nextBeforeId: events.length > query.data.limit ? visible.at(-1)?.id ?? null : null,
    });
  });
});

router.get("/recruiting/dashboard", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const excludeDemo = await hasImportedLegacyProfiles(auth.workspaceId);
    const rows = await db.select().from(recruitingCasesTable).where(and(
      eq(recruitingCasesTable.workspaceId, auth.workspaceId),
      ...withOperationalVisibilityFilters(auth.workspaceId, [], excludeDemo),
    ));
    const now = Date.now();
    const byStage = new Map<string, number>();
    const byLifecycle = new Map<string, number>();
    for (const row of rows) {
      byStage.set(row.stage, (byStage.get(row.stage) ?? 0) + 1);
      byLifecycle.set(row.lifecycle, (byLifecycle.get(row.lifecycle) ?? 0) + 1);
    }
    res.json({
      total: rows.length,
      active: rows.filter(row => row.lifecycle === "active").length,
      overdue: rows.filter(row => row.lifecycle === "active" && row.slaDeadlineAt && row.slaDeadlineAt.getTime() <= now).length,
      dueSoon: rows.filter(row => row.lifecycle === "active" && row.slaDeadlineAt && row.slaDeadlineAt.getTime() > now && row.slaDeadlineAt.getTime() - now <= 4 * 60 * 60 * 1000).length,
      unassigned: rows.filter(row => row.lifecycle === "active" && row.taskOwnerId === null).length,
      byStage: [...byStage].map(([label, count]) => ({ label, count })),
      byLifecycle: [...byLifecycle].map(([label, count]) => ({ label, count })),
    });
  });
});

router.get("/recruiting/managers", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const rows = await db
      .select({
        id: appUsersTable.id,
        name: appUsersTable.name,
        role: workspaceMembershipsTable.role,
      })
      .from(workspaceMembershipsTable)
      .innerJoin(appUsersTable, eq(appUsersTable.id, workspaceMembershipsTable.userId))
      .where(and(
        eq(workspaceMembershipsTable.workspaceId, auth.workspaceId),
        inArray(workspaceMembershipsTable.role, ["owner_admin", "manager"]),
      ));
    res.json(rows);
  });
});

router.get("/recruiting/queue", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_recruiting", async (auth) => {
    const parsed = GetRecruitingQueueQueryParams.safeParse(req.query);
    if (!parsed.success) { badRequest(res, parsed.error.message); return; }
    const conditions: SQL[] = [eq(recruitingCasesTable.lifecycle, "active")];
    if (parsed.data.stage) conditions.push(eq(recruitingCasesTable.stage, parsed.data.stage));
    const now = new Date();
    if (parsed.data.filter === "due_soon") {
      conditions.push(gt(recruitingCasesTable.slaDeadlineAt, now));
      conditions.push(lte(recruitingCasesTable.slaDeadlineAt, new Date(now.getTime() + 4 * 60 * 60 * 1000)));
    }
    if (parsed.data.filter === "overdue") conditions.push(lte(recruitingCasesTable.slaDeadlineAt, now));
    if (parsed.data.filter === "unassigned") conditions.push(isNull(recruitingCasesTable.taskOwnerId));
    const offset = (parsed.data.page - 1) * parsed.data.limit;
    const excludeDemo = await hasImportedLegacyProfiles(auth.workspaceId);
    const [rows, total] = await Promise.all([
      listRows(auth.workspaceId, conditions, parsed.data.limit, offset, excludeDemo, "progress"),
      countRows(auth.workspaceId, conditions, excludeDemo),
    ]);
    res.json({ items: rows.map(toListItem), page: parsed.data.page, limit: parsed.data.limit, total });
  });
});

// ─── Write endpoints ───────────────────────────────────────────────────────────

router.post("/recruiting/cases", async (req, res): Promise<void> => {
  await withAuth(req, res, "create_recruiting_case", async (auth) => {
    const body = CreateRecruitingCaseBody.safeParse(req.body);
    const header = CreateRecruitingCaseHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
    if (!body.success || !header.success) { badRequest(res, "Invalid Recruiting case creation request"); return; }
    if (!activeStageOnly(body.data.stage)) { badRequest(res, "New Recruiting cases must begin in an active stage"); return; }

    try {
      const result = await repository.createCase({
        context: auth,
        ...body.data,
        sourceId: header.data["Idempotency-Key"],
      });
      res.status(result.status === "created" ? 201 : 200).json(serializeRecruitingMutationResponse(result));
    } catch (error) {
      sendRecruitingError(res, error);
    }
  });
});

router.post("/recruiting/cases/:id/transitions", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_recruiting", async (auth) => {
    const params = TransitionRecruitingCaseParams.safeParse(req.params);
    const body = TransitionRecruitingCaseBody.safeParse(req.body);
    const header = TransitionRecruitingCaseHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
    if (!params.success || !body.success || !header.success) { badRequest(res, "Invalid Recruiting transition request"); return; }
    if (body.data.managerDecision) { badRequest(res, "Use the manager-decision endpoint for Manager Review decisions"); return; }
    try {
      const result = await repository.transitionCase(auth, {
        caseId: params.data.id,
        expectedVersion: body.data.expectedVersion,
        targetStage: body.data.targetStage,
        transitionIdempotencyKey: header.data["Idempotency-Key"],
        options: {
          nextAction: body.data.nextAction,
          nextActionDueAt: body.data.nextActionDueAt,
          managerId: body.data.managerId?.toString(),
          followUpDueAt: body.data.followUpDueAt,
          resumeStage: body.data.resumeStage,
          closedLostReason: body.data.closedLostReason,
          closedLostNote: body.data.closedLostNote,
        },
      });
      res.json(serializeRecruitingMutationResponse(result));
    } catch (error) {
      sendRecruitingError(res, error);
    }
  });
});

router.post("/recruiting/cases/:id/manager-decision", async (req, res): Promise<void> => {
  await withAuth(req, res, "decide_recruiting_manager_review", async (auth) => {
    const params = DecideRecruitingManagerReviewParams.safeParse(req.params);
    const body = DecideRecruitingManagerReviewBody.safeParse(req.body);
    const header = DecideRecruitingManagerReviewHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
    if (!params.success || !body.success || !header.success) { badRequest(res, "Invalid Manager Review decision request"); return; }
    try {
      const result = await repository.transitionCase(auth, {
        caseId: params.data.id,
        expectedVersion: body.data.expectedVersion,
        targetStage: body.data.decision === "approve" ? "clearinghouse_pending" : "application_received",
        transitionIdempotencyKey: header.data["Idempotency-Key"],
        options: {
          managerId: String(auth.userId),
          managerDecision: body.data.decision,
          nextAction: body.data.nextAction,
          nextActionDueAt: body.data.nextActionDueAt,
        },
      });
      res.json(serializeRecruitingMutationResponse(result));
    } catch (error) {
      sendRecruitingError(res, error);
    }
  });
});

router.post("/recruiting/cases/:id/future-follow-up/return", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_recruiting", async (auth) => {
    const params = ReturnRecruitingFutureFollowUpParams.safeParse(req.params);
    const body = ReturnRecruitingFutureFollowUpBody.safeParse(req.body);
    const header = ReturnRecruitingFutureFollowUpHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
    if (!params.success || !body.success || !header.success) { badRequest(res, "Invalid Future Follow-up return request"); return; }
    try {
      const result = await repository.returnFromFutureFollowUp(auth, {
        caseId: params.data.id,
        expectedVersion: body.data.expectedVersion,
        now: new Date(),
        nextAction: body.data.nextAction,
        nextActionDueAt: body.data.nextActionDueAt,
        transitionIdempotencyKey: header.data["Idempotency-Key"],
      });
      res.json(serializeRecruitingMutationResponse(result));
    } catch (error) {
      sendRecruitingError(res, error);
    }
  });
});

router.post("/recruiting/cases/:id/transfer", async (req, res): Promise<void> => {
  await withAuth(req, res, "transfer_recruiting", async (auth) => {
    const params = TransferRecruitingCaseToOnboardingParams.safeParse(req.params);
    const body = TransferRecruitingCaseToOnboardingBody.safeParse(req.body);
    const header = TransferRecruitingCaseToOnboardingHeader.safeParse({ "Idempotency-Key": req.header("Idempotency-Key") });
    if (!params.success || !body.success || !header.success) { badRequest(res, "Invalid Recruiting transfer request"); return; }
    try {
      const result = await repository.transferToOnboarding(auth, {
        caseId: params.data.id,
        expectedVersion: body.data.expectedVersion,
        transferIdempotencyKey: header.data["Idempotency-Key"],
        targetOnboardingCaseId: body.data.targetOnboardingCaseId,
        recruiterName: body.data.recruiterName,
        sourceChannel: body.data.sourceChannel,
        initialNotes: body.data.initialNotes,
        caseOwnerName: body.data.caseOwnerName,
      });
      res.json(serializeRecruitingTransferResponse(result));
    } catch (error) {
      sendRecruitingError(res, error);
    }
  });
});

export default router;