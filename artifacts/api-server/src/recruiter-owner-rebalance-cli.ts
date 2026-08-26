import { and, eq, inArray, like } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  db,
  driversTable,
  leadsTable,
  recruitingCasesTable,
  recruitingCaseEventsTable,
  recruitingSheetRowsTable,
  workspaceMembershipsTable,
  workspacesTable,
} from "@workspace/db";
import {
  DrizzleRecruitingStore,
  RecruitingRepository,
} from "./lib/recruiting-repository";
import {
  hasImportedLegacyProfiles,
  withOperationalVisibilityFilters,
} from "./lib/recruiting-operational-visibility";
import { summarizeMainJidoOwnership } from "./lib/recruiting-row-ownership";

const mode = process.env.RECRUITER_OWNER_REBALANCE_MODE;
const workspaceSlug = process.env.RECRUITER_OWNER_REBALANCE_WORKSPACE ?? "franklins";
const workspaceId = process.env.RECRUITER_OWNER_REBALANCE_WORKSPACE_ID
  ? Number(process.env.RECRUITER_OWNER_REBALANCE_WORKSPACE_ID)
  : null;

if (!["preview", "apply", "audit", "source-proof", "rollback-proof", "rollback-preview", "rollback-apply", "row-ownership-preview", "row-ownership-apply", "collapsed-mapping-audit", "source-repair-preview", "source-repair-apply"].includes(mode ?? "")) {
  throw new Error("RECRUITER_OWNER_REBALANCE_MODE must be preview, audit, source-proof, rollback-proof, rollback-preview, rollback-apply, row-ownership-preview, row-ownership-apply, collapsed-mapping-audit, source-repair-preview, source-repair-apply, or apply");
}

const workspaceQuery = db
  .select({ id: workspacesTable.id, slug: workspacesTable.slug })
  .from(workspacesTable);
const [workspace] = workspaceId
  ? await workspaceQuery.where(eq(workspacesTable.id, workspaceId))
  : await workspaceQuery.where(eq(workspacesTable.slug, workspaceSlug));
if (!workspace) throw new Error(workspaceId ? `Workspace '${workspaceId}' was not found` : `Workspace '${workspaceSlug}' was not found`);

const [owner] = await db
  .select({ userId: workspaceMembershipsTable.userId })
  .from(workspaceMembershipsTable)
  .where(and(
    eq(workspaceMembershipsTable.workspaceId, workspace.id),
    eq(workspaceMembershipsTable.role, "owner_admin"),
  ));
if (!owner) throw new Error(`Workspace '${workspace.slug}' has no owner_admin membership`);

const repository = new RecruitingRepository(new DrizzleRecruitingStore());
const context = { workspaceId: workspace.id, userId: owner.userId, workspaceRole: "owner_admin" as const };
const workbookId = "1x0P28BzXkX1tAMCxGEc7p1_DFHDO8cAuIqTs3TyMfTc";
const mainTab = "MAIN JIDO FREIGHT LLC";
if (mode === "source-proof") {
  const rows = await db.select({
    id: recruitingSheetRowsTable.id,
    rowNumber: recruitingSheetRowsTable.rowNumber,
    externalRowIdentity: recruitingSheetRowsTable.externalRowIdentity,
    sourceStatus: recruitingSheetRowsTable.sourceStatus,
    name: recruitingSheetRowsTable.name,
    normalizedPhone: recruitingSheetRowsTable.normalizedPhone,
    mappedCaseId: recruitingSheetRowsTable.mappedCaseId,
  }).from(recruitingSheetRowsTable).where(and(
    eq(recruitingSheetRowsTable.workspaceId, workspace.id),
    eq(recruitingSheetRowsTable.workbookId, workbookId),
    eq(recruitingSheetRowsTable.tabName, mainTab),
  )).orderBy(recruitingSheetRowsTable.rowNumber);
  const inRange = rows.filter(row => row.rowNumber >= 2 && row.rowNumber <= 71);
  const qualifying = inRange.filter(row =>
    ["active", "conflict"].includes(row.sourceStatus)
    && Boolean(row.name?.trim())
    && Boolean(row.normalizedPhone),
  );
  const rowNumbers = new Set(inRange.map(row => row.rowNumber));
  const missingRows = Array.from({ length: 70 }, (_, index) => index + 2).filter(rowNumber => !rowNumbers.has(rowNumber));
  const mappedCounts = qualifying.reduce((counts, row) => {
    if (row.mappedCaseId !== null) counts.set(row.mappedCaseId, (counts.get(row.mappedCaseId) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
  const duplicateMappedCases = [...mappedCounts.entries()].filter(([, total]) => total > 1).map(([caseId, total]) => ({ caseId, total }));
  const sectionOrBlankRows = inRange
    .filter(row => !row.name?.trim() || !row.normalizedPhone || row.sourceStatus === "skipped")
    .map(row => ({ rowNumber: row.rowNumber, sourceStatus: row.sourceStatus, hasName: Boolean(row.name?.trim()), hasPhone: Boolean(row.normalizedPhone) }));
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    workbookId,
    tabName: mainTab,
    importedMainRows: rows.length,
    inRangeRows: inRange.length,
    qualifyingRows: qualifying.map(row => ({
      rowNumber: row.rowNumber,
      externalRowIdentity: row.externalRowIdentity,
      sourceStatus: row.sourceStatus,
      mappedCaseId: row.mappedCaseId,
    })),
    qualifyingCount: qualifying.length,
    missingRows,
    sectionOrBlankRows,
    unmatchedQualifyingRows: qualifying.filter(row => row.mappedCaseId === null).map(row => row.rowNumber),
    duplicateMappedCases,
    outsideRangeRows: rows.filter(row => row.rowNumber < 2 || row.rowNumber > 71).map(row => ({
      rowNumber: row.rowNumber,
      sourceStatus: row.sourceStatus,
      mappedCaseId: row.mappedCaseId,
    })),
  }, null, 2));
  process.exit(0);
}
if (mode === "row-ownership-preview" || mode === "row-ownership-apply") {
  const rows = await db.select({
    rowNumber: recruitingSheetRowsTable.rowNumber,
    name: recruitingSheetRowsTable.name,
    sourceStatus: recruitingSheetRowsTable.sourceStatus,
    normalizedPhone: recruitingSheetRowsTable.normalizedPhone,
    mappedCaseId: recruitingSheetRowsTable.mappedCaseId,
  }).from(recruitingSheetRowsTable).where(and(
    eq(recruitingSheetRowsTable.workspaceId, workspace.id),
    eq(recruitingSheetRowsTable.workbookId, workbookId),
    eq(recruitingSheetRowsTable.tabName, mainTab),
  )).orderBy(recruitingSheetRowsTable.rowNumber);
  const cases = await db.select({
    id: recruitingCasesTable.id,
    caseOwnerId: recruitingCasesTable.caseOwnerId,
    taskOwnerId: recruitingCasesTable.taskOwnerId,
    version: recruitingCasesTable.version,
    stage: recruitingCasesTable.stage,
  }).from(recruitingCasesTable).where(eq(recruitingCasesTable.workspaceId, workspace.id));
  const summary = summarizeMainJidoOwnership(rows, cases);
  const duplicateMappings = [...summary.byCase.values()]
    .filter(caseRows => caseRows.length > 1)
    .map(caseRows => ({
      caseId: caseRows[0]!.mappedCaseId,
      rows: caseRows.map(row => ({
        rowNumber: row.rowNumber,
        name: row.name,
        owner: row.owner.ownerName,
      })),
      crossesWorkerRanges: new Set(caseRows.map(row => row.owner.ownerId)).size > 1,
    }));
  const safeToApply = summary.crossRangeConflicts.length === 0
    && summary.unmatchedRows.length === 0
    && summary.policyViolations === 0
    && summary.taskOwnerChanges === 0
    && summary.perWorker.every(worker => worker.qualifyingSourceRowCount === worker.uniqueCaseCount)
    && summary.perWorker.map(worker => worker.uniqueCaseCount).join(",") === "21,23,23";
  if (mode === "row-ownership-apply" && !safeToApply) {
    throw new Error("Row ownership safety gate failed; no Case Owners were changed");
  }
  const changedCaseIds = mode === "row-ownership-apply" ? await db.transaction(async tx => {
    const changed: number[] = [];
    for (const assignment of summary.proposedChanges) {
      const current = cases.find(item => item.id === assignment.caseId);
      if (!current) throw new Error(`Case ${assignment.caseId} disappeared before assignment`);
      const eventKey = `main-jido-row-ownership:v1:workspace:${workspace.id}:case:${current.id}`;
      const [existing] = await tx.select({ id: recruitingCaseEventsTable.id }).from(recruitingCaseEventsTable)
        .where(eq(recruitingCaseEventsTable.transitionIdempotencyKey, eventKey));
      if (existing) continue;
      const [next] = await tx.update(recruitingCasesTable).set({
        caseOwnerId: assignment.proposedOwnerId,
        version: current.version + 1,
      }).where(and(
        eq(recruitingCasesTable.workspaceId, workspace.id),
        eq(recruitingCasesTable.id, current.id),
        eq(recruitingCasesTable.version, current.version),
      )).returning();
      if (!next) throw new Error(`Case ${current.id} became stale during assignment`);
      await tx.insert(recruitingCaseEventsTable).values({
        workspaceId: workspace.id, recruitingCaseId: current.id, transitionIdempotencyKey: eventKey,
        eventType: "main_jido_row_owner_assigned", fromStage: current.stage, toStage: current.stage,
        actorUserId: owner.userId, caseVersion: next.version,
        payload: { operation: "main-jido-row-ownership:v1", previousOwnerId: current.caseOwnerId, proposedOwnerId: assignment.proposedOwnerId, sourceRows: assignment.sourceRows.map(row => row.rowNumber) },
      });
      changed.push(current.id);
    }
    return changed;
  }) : [];
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    workbookId,
    tabName: mainTab,
    safeToApply,
    perWorker: summary.perWorker,
    duplicateMappings,
    crossRangeConflicts: summary.crossRangeConflicts.map(group => ({
      caseId: group.caseId,
      rows: group.rows.map(row => ({ rowNumber: row.rowNumber, name: row.name, owner: row.owner.ownerName })),
    })),
    proposedChanges: summary.proposedChanges,
    alreadyCompliant: summary.alreadyCompliant,
    taskOwnerChanges: summary.taskOwnerChanges,
    missingRows: [],
    unmatchedRows: summary.unmatchedRows.map(row => row.rowNumber),
    policyViolations: summary.policyViolations,
    ...(mode === "row-ownership-apply" ? { status: changedCaseIds.length > 0 ? "applied" : "noop", changedCaseIds } : {}),
  }, null, 2));
  process.exit(0);
}
if (mode === "collapsed-mapping-audit") {
  const rows = await db.select({
    rowNumber: recruitingSheetRowsTable.rowNumber,
    externalRowIdentity: recruitingSheetRowsTable.externalRowIdentity,
    name: recruitingSheetRowsTable.name,
    normalizedPhone: recruitingSheetRowsTable.normalizedPhone,
    sourceStatus: recruitingSheetRowsTable.sourceStatus,
    mappedCaseId: recruitingSheetRowsTable.mappedCaseId,
  }).from(recruitingSheetRowsTable).where(and(
    eq(recruitingSheetRowsTable.workspaceId, workspace.id),
    eq(recruitingSheetRowsTable.workbookId, workbookId),
    eq(recruitingSheetRowsTable.tabName, mainTab),
  )).orderBy(recruitingSheetRowsTable.rowNumber);
  const duplicateGroups = [...rows
    .filter(row => row.mappedCaseId !== null && row.rowNumber >= 2 && row.rowNumber <= 71)
    .reduce((groups, row) => {
      const caseId = row.mappedCaseId!;
      groups.set(caseId, [...(groups.get(caseId) ?? []), row]);
      return groups;
    }, new Map<number, typeof rows>())
    .entries()]
    .filter(([, group]) => group.length > 1);
  const caseIds = duplicateGroups.map(([caseId]) => caseId);
  const cases = caseIds.length === 0 ? [] : await db.select({
    id: recruitingCasesTable.id,
    driverId: recruitingCasesTable.driverId,
    leadId: recruitingCasesTable.leadId,
    sourceId: recruitingCasesTable.sourceId,
  }).from(recruitingCasesTable).where(and(
    eq(recruitingCasesTable.workspaceId, workspace.id),
    inArray(recruitingCasesTable.id, caseIds),
  ));
  const casesById = new Map(cases.map(item => [item.id, item]));
  const normalizeName = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    groups: duplicateGroups.map(([caseId, group]) => ({
      canonicalCase: casesById.get(caseId),
      mergeReason: "Phone-first legacy matching found an already mapped Sheet profile before creating a source-row case.",
      rows: group.map(row => ({
        rowNumber: row.rowNumber,
        externalRowIdentity: row.externalRowIdentity,
        name: row.name,
        normalizedName: normalizeName(row.name),
        normalizedPhone: row.normalizedPhone,
        sourceStatus: row.sourceStatus,
      })),
      allDistinctNormalizedNames: new Set(group.map(row => normalizeName(row.name))).size === group.length,
    })),
  }, null, 2));
  process.exit(0);
}
if (mode === "source-repair-preview" || mode === "source-repair-apply") {
  const rows = await db.select().from(recruitingSheetRowsTable).where(and(
    eq(recruitingSheetRowsTable.workspaceId, workspace.id),
    eq(recruitingSheetRowsTable.workbookId, workbookId),
    eq(recruitingSheetRowsTable.tabName, mainTab),
  ));
  const cases = await db.select().from(recruitingCasesTable).where(eq(recruitingCasesTable.workspaceId, workspace.id));
  const casesById = new Map(cases.map(item => [item.id, item]));
  const normalizeName = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const repairs = rows.filter(row => {
    if (row.rowNumber < 2 || row.rowNumber > 71 || !row.mappedCaseId || !row.name?.trim() || !row.normalizedPhone) return false;
    const mapped = casesById.get(row.mappedCaseId);
    const sourceId = `google-sheet:${workbookId}:${row.externalRowIdentity}`;
    return Boolean(mapped && mapped.sourceId !== sourceId);
  }).map(row => ({
    row,
    mapped: casesById.get(row.mappedCaseId!)!,
    sourceId: `google-sheet:${workbookId}:${row.externalRowIdentity}`,
  }));
  const namesDistinct = repairs.every(repair => {
    const siblings = rows.filter(row => row.mappedCaseId === repair.mapped.id);
    return new Set(siblings.map(row => normalizeName(row.name))).size === siblings.length;
  });
  const safeToRepair = namesDistinct && (repairs.length === 5 || repairs.length === 0);
  if (mode === "source-repair-apply" && !safeToRepair) {
    throw new Error("Distinct-source repair safety gate failed; no records were changed");
  }
  const repaired = mode === "source-repair-apply" ? await db.transaction(async tx => {
    const created: Array<{ rowNumber: number; oldCaseId: number; newCaseId: number }> = [];
    for (const repair of repairs) {
      const eventKey = `main-jido-distinct-source-repair:v1:workspace:${workspace.id}:row:${repair.row.externalRowIdentity}`;
      const [priorEvent] = await tx.select({ id: recruitingCaseEventsTable.id }).from(recruitingCaseEventsTable)
        .where(eq(recruitingCaseEventsTable.transitionIdempotencyKey, eventKey));
      if (priorEvent) continue;
      if (repair.mapped.driverId == null) throw new Error(`Missing driver for collapsed case ${repair.mapped.id}`);
      const [oldDriver] = await tx.select().from(driversTable).where(eq(driversTable.id, repair.mapped.driverId));
      if (!oldDriver) throw new Error(`Missing driver for collapsed case ${repair.mapped.id}`);
      const sourceName = repair.row.name!;
      const [lead] = await tx.insert(leadsTable).values({
        workspaceId: workspace.id,
        fullName: sourceName,
        phoneRaw: repair.row.phoneRaw,
        phoneNormalized: repair.row.normalizedPhone,
        recruiterName: oldDriver.recruiterName,
        sourceChannel: oldDriver.sourceChannel,
        externalRecruitId: repair.sourceId,
        notes: repair.row.legacyNote,
      }).returning();
      const [driver] = await tx.insert(driversTable).values({
        workspaceId: workspace.id,
        leadId: lead!.id,
        fullName: sourceName,
        phone: repair.row.phoneRaw,
        email: repair.row.email,
        driverType: oldDriver.driverType,
        status: oldDriver.status,
        stage: oldDriver.stage,
        priority: oldDriver.priority,
        recruiterName: oldDriver.recruiterName,
        sourceChannel: oldDriver.sourceChannel,
        assigneeId: oldDriver.assigneeId,
        assigneeName: oldDriver.assigneeName,
        truckInfo: repair.row.truckYearMake,
        externalRecruitId: repair.sourceId,
        nextBestAction: oldDriver.nextBestAction,
      }).returning();
      const suffix = createHash("sha256").update(repair.sourceId).digest("hex").slice(0, 12).toUpperCase();
      const [next] = await tx.insert(recruitingCasesTable).values({
        workspaceId: workspace.id,
        driverId: driver!.id,
        leadId: lead!.id,
        caseNumber: `GS-${suffix}`,
        sourceId: repair.sourceId,
        stage: repair.mapped.stage,
        lifecycle: repair.mapped.lifecycle,
        caseOwnerId: repair.mapped.caseOwnerId,
        taskOwnerId: repair.mapped.taskOwnerId,
        nextAction: repair.mapped.nextAction,
        nextActionDueAt: repair.mapped.nextActionDueAt,
        slaDeadlineAt: repair.mapped.slaDeadlineAt,
        followUpDueAt: repair.mapped.followUpDueAt,
        resumeStage: repair.mapped.resumeStage,
        closedLostReason: repair.mapped.closedLostReason,
        closedLostNote: repair.mapped.closedLostNote,
      }).returning();
      await tx.update(recruitingSheetRowsTable).set({ mappedCaseId: next!.id, sourceStatus: "active" })
        .where(eq(recruitingSheetRowsTable.id, repair.row.id));
      await tx.insert(recruitingCaseEventsTable).values({
        workspaceId: workspace.id, recruitingCaseId: next!.id, transitionIdempotencyKey: eventKey,
        eventType: "main_jido_distinct_source_repaired", fromStage: next!.stage, toStage: next!.stage,
        actorUserId: owner.userId, caseVersion: next!.version,
        payload: { priorCaseId: repair.mapped.id, sourceRow: repair.row.externalRowIdentity, sourceId: repair.sourceId },
      });
      created.push({ rowNumber: repair.row.rowNumber, oldCaseId: repair.mapped.id, newCaseId: next!.id });
    }
    return created;
  }) : [];
  console.log(JSON.stringify({
    workspace: workspace.slug, mode, safeToRepair, repairCount: repairs.length,
    namesDistinct, repairs: repairs.map(repair => ({ rowNumber: repair.row.rowNumber, name: repair.row.name, oldCaseId: repair.mapped.id, sourceId: repair.sourceId })),
    ...(mode === "source-repair-apply" ? { repaired } : {}),
  }, null, 2));
  process.exit(0);
}
if (mode === "rollback-proof") {
  const events = await db.select({
    id: recruitingCaseEventsTable.id,
    recruitingCaseId: recruitingCaseEventsTable.recruitingCaseId,
    payload: recruitingCaseEventsTable.payload,
  }).from(recruitingCaseEventsTable).where(and(
    eq(recruitingCaseEventsTable.workspaceId, workspace.id),
    eq(recruitingCaseEventsTable.eventType, "recruiter_owner_rebalanced"),
    like(recruitingCaseEventsTable.transitionIdempotencyKey, "recruiter-owner-routing-rebalance:v1:%"),
  ));
  const cases = await db.select({ id: recruitingCasesTable.id, caseOwnerId: recruitingCasesTable.caseOwnerId })
    .from(recruitingCasesTable)
    .where(eq(recruitingCasesTable.workspaceId, workspace.id));
  const currentOwners = new Map(cases.map(row => [row.id, row.caseOwnerId]));
  const records = events.map(event => {
    const payload = event.payload as { requestFingerprint?: unknown };
    let fingerprint: { previousOwnerId?: unknown; proposedOwnerId?: unknown } | null = null;
    try { fingerprint = typeof payload.requestFingerprint === "string" ? JSON.parse(payload.requestFingerprint) : null; } catch { fingerprint = null; }
    const previousOwnerId = fingerprint?.previousOwnerId;
    const proposedOwnerId = fingerprint?.proposedOwnerId;
    const exact = Number.isInteger(previousOwnerId) && Number(previousOwnerId) > 0
      && Number.isInteger(proposedOwnerId) && Number(proposedOwnerId) > 0;
    return {
      caseId: event.recruitingCaseId,
      exact,
      previousOwnerId: exact ? Number(previousOwnerId) : null,
      proposedOwnerId: exact ? Number(proposedOwnerId) : null,
      currentOwnerId: currentOwners.get(event.recruitingCaseId) ?? null,
    };
  });
  const seen = new Set<number>();
  const duplicateCaseIds = records.filter(record => {
    if (seen.has(record.caseId)) return true;
    seen.add(record.caseId);
    return false;
  }).map(record => record.caseId);
  const unavailable = records.filter(record =>
    !record.exact || record.currentOwnerId === null || record.currentOwnerId !== record.proposedOwnerId,
  );
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    operationKey: "recruiter-owner-routing-rebalance:v1",
    auditEvents: records.length,
    distinctCases: seen.size,
    duplicateCaseIds,
    exactBeforeValues: records.length - unavailable.length,
    unavailableCount: unavailable.length,
    unavailable: unavailable.slice(0, 20),
  }, null, 2));
  process.exit(0);
}
if (mode === "rollback-preview" || mode === "rollback-apply") {
  const preview = await repository.previewRecruiterOwnerRollback(context);
  const safeToRestore = preview.auditEvents === 867
    && preview.exactBeforeValues === 867
    && preview.unavailable.length === 0
    && preview.taskOwnerChanges === 0
    && (
      preview.plannedRestorations.length === 867
      || (preview.plannedRestorations.length === 0 && preview.alreadyRestoredCaseIds.length === 867)
    );
  if (mode === "rollback-apply" && !safeToRestore) {
    throw new Error("Rollback safety gate failed; no Case Owners were changed");
  }
  const result = mode === "rollback-apply"
    ? await repository.rollbackRecruiterOwnerRebalance(context)
    : null;
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    operationKey: "recruiter-owner-routing-rebalance-rollback:v1",
    safeToRestore,
    preview: {
      auditEvents: preview.auditEvents,
      exactBeforeValues: preview.exactBeforeValues,
      plannedRestorations: preview.plannedRestorations.length,
      alreadyRestored: preview.alreadyRestoredCaseIds.length,
      unavailable: preview.unavailable,
      taskOwnerChanges: preview.taskOwnerChanges,
    },
    ...(result ? { status: result.status, restoredCaseIds: result.restoredCaseIds } : {}),
  }, null, 2));
  process.exit(0);
}
if (mode === "audit") {
  const rawCases = await db.select({
    id: recruitingCasesTable.id,
    stage: recruitingCasesTable.stage,
    lifecycle: recruitingCasesTable.lifecycle,
    sourceId: recruitingCasesTable.sourceId,
    driverId: recruitingCasesTable.driverId,
    leadId: recruitingCasesTable.leadId,
  }).from(recruitingCasesTable).where(and(
    eq(recruitingCasesTable.workspaceId, workspace.id),
    eq(recruitingCasesTable.lifecycle, "active"),
  ));
  const excludeDemo = await hasImportedLegacyProfiles(db, workspace.id);
  const boardRows = await db.select({ id: recruitingCasesTable.id })
    .from(recruitingCasesTable)
    .innerJoin(driversTable, and(eq(driversTable.id, recruitingCasesTable.driverId), eq(driversTable.workspaceId, workspace.id)))
    .innerJoin(leadsTable, and(eq(leadsTable.id, recruitingCasesTable.leadId), eq(leadsTable.workspaceId, workspace.id)))
    .where(and(
      eq(recruitingCasesTable.workspaceId, workspace.id),
      ...withOperationalVisibilityFilters(db, workspace.id, [eq(recruitingCasesTable.lifecycle, "active")], excludeDemo),
    ));
  const boardIds = new Set(boardRows.map(row => row.id));
  const validRelationRows = await db.select({ id: recruitingCasesTable.id })
    .from(recruitingCasesTable)
    .innerJoin(driversTable, and(eq(driversTable.id, recruitingCasesTable.driverId), eq(driversTable.workspaceId, workspace.id)))
    .innerJoin(leadsTable, and(eq(leadsTable.id, recruitingCasesTable.leadId), eq(leadsTable.workspaceId, workspace.id)))
    .where(and(eq(recruitingCasesTable.workspaceId, workspace.id), eq(recruitingCasesTable.lifecycle, "active")));
  const validRelationIds = new Set(validRelationRows.map(row => row.id));
  const activeMainRows = await db.select({ caseId: recruitingSheetRowsTable.mappedCaseId })
    .from(recruitingSheetRowsTable)
    .where(and(
      eq(recruitingSheetRowsTable.workspaceId, workspace.id),
      eq(recruitingSheetRowsTable.tabName, "MAIN JIDO FREIGHT LLC"),
      inArray(recruitingSheetRowsTable.sourceStatus, ["active", "conflict"]),
    ));
  const activeMainIds = new Set(activeMainRows.flatMap(row => row.caseId === null ? [] : [row.caseId]));
  const difference = rawCases.filter(row => !boardIds.has(row.id));
  const countBy = (key: (row: typeof difference[number]) => string) =>
    Object.fromEntries([...difference.reduce((map, row) => map.set(key(row), (map.get(key(row)) ?? 0) + 1), new Map<string, number>())].sort());
  console.log(JSON.stringify({
    workspace: workspace.slug,
    mode,
    rawActive: rawCases.length,
    boardActive: boardRows.length,
    difference: difference.length,
    byStage: countBy(row => row.stage),
    byLifecycle: countBy(row => row.lifecycle),
    sourceKinds: countBy(row => row.sourceId === null ? "null" : row.sourceId.startsWith("dev-demo-recruiting:") ? "dev_demo" : row.sourceId.startsWith("google-sheet:") ? "google_sheet" : "other"),
    visibilityFlags: {
      invalidDriverOrLeadWorkspaceJoin: difference.filter(row => !validRelationIds.has(row.id)).length,
      demoSuppressed: excludeDemo ? difference.filter(row => row.sourceId?.startsWith("dev-demo-recruiting:")).length : 0,
      googleSheetNotVisibleFromMainTab: difference.filter(row => row.sourceId?.startsWith("google-sheet:") && !activeMainIds.has(row.id)).length,
    },
  }, null, 2));
  process.exit(0);
}
const result = mode === "preview"
  ? { status: "preview", preview: await repository.previewRecruiterOwnerRouting(context), changedCaseIds: [] }
  : await repository.rebalanceRecruiterOwners(context);

console.log(JSON.stringify({
  workspace: workspace.slug,
  mode,
  operationKey: "recruiter-owner-routing-rebalance:v1",
  ...result,
}, null, 2));