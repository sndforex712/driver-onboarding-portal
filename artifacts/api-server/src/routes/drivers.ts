import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driversTable,
  activityEntriesTable,
  checklistItemsTable,
  datatruckSyncsTable,
  leadsTable,
  onboardingCasesTable,
} from "@workspace/db";
import {
  ListDriversQueryParams,
  CreateDriverBody,
  GetDriverParams,
  UpdateDriverBody,
  UpdateDriverParams,
  MarkReadyForDispatchParams,
  TriggerDatatruckSyncParams,
  GetDatatruckSyncHistoryParams,
  ListDriverOperationalQueueQueryParams,
} from "@workspace/api-zod";
import { getChecklistTemplateForDriver } from "../lib/checklist-gates";
import { deriveOperationalProjection, operationalOwnerForStep, OPERATIONAL_STEPS } from "../lib/driver-operational-projection";
import { buildOperationalQueue, normalizeOperationalFilterValue } from "../lib/driver-operational-queue";
import { withAuth } from "../lib/authorize";
import {
  hasManagerWideOperationalAccess,
  mayAccessOperationalDriver,
  operationalOwnersForWorkspace,
  ownerForOperationalStep,
} from "../lib/operational-ownership";
import { badRequest, notFound, conflict, unprocessable } from "../lib/api-errors";
import { recordStageTransition } from "./stage";

const router: IRouter = Router();

function safePhoneLast4(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function safeOperationalText(value: string | null, fallback: string | null = null): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  // A phone number or email in a list-level field is not safe to return.
  if (/@|\d[\d\s().-]{6,}\d/.test(text)) return fallback;
  return text ? text.slice(0, 180) : fallback;
}

function safeDriverRecord(driver: typeof driversTable.$inferSelect) {
  const {
    phone,
    email,
    truckVin,
    externalRecruitId,
    blockers,
    ...safe
  } = driver;
  return {
    ...safe,
    phoneLast4: safePhoneLast4(phone),
    nextBestAction: safeOperationalText(driver.nextBestAction),
    blockerCode: driver.blockerCode ?? (driver.blockers ? "blocked" : null),
  };
}

// ─── GET /drivers ─────────────────────────────────────────────────────────────
router.get("/drivers", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriversQueryParams.safeParse(req.query);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const conditions: ReturnType<typeof eq>[] = [eq(driversTable.workspaceId, auth.workspaceId)];
    if (params.data.status)      conditions.push(eq(driversTable.status, params.data.status));
    if (params.data.driverType)  conditions.push(eq(driversTable.driverType, params.data.driverType));
    if (params.data.search) {
      const term = `%${params.data.search}%`;
      conditions.push(or(ilike(driversTable.fullName, term), ilike(driversTable.recruiterName, term), ilike(driversTable.email, term)) as any);
    }
    if (params.data.assigneeId != null) conditions.push(eq(driversTable.assigneeId, params.data.assigneeId));

    const rows = await db.select().from(driversTable).where(and(...conditions)).orderBy(driversTable.createdAt);
    const visibleRows = hasManagerWideOperationalAccess(auth)
      ? rows
      : rows.filter((driver) => mayAccessOperationalDriver(auth, driver.operationalOwnerId));
    res.json(visibleRows.map(safeDriverRecord));
  });
});

// ─── GET /drivers/operational-queue ───────────────────────────────────────────
// This queue deliberately builds counts and rows from one workspace-scoped
// projection. It never returns legacy Sheet notes, addresses, or raw payloads.
router.get("/drivers/operational-queue", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverOperationalQueueQueryParams.safeParse(req.query);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [drivers, checklist] = await Promise.all([
      db.select().from(driversTable)
        .where(eq(driversTable.workspaceId, auth.workspaceId))
        .orderBy(driversTable.createdAt),
      db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.workspaceId, auth.workspaceId)),
    ]);
    const checklistByDriver = new Map<number, typeof checklist>();
    for (const item of checklist) {
      const items = checklistByDriver.get(item.driverId) ?? [];
      items.push(item);
      checklistByDriver.set(item.driverId, items);
    }

    const operationalOwners = await operationalOwnersForWorkspace(auth.workspaceId);
    const projected = drivers.map((driver) => {
      const projection = deriveOperationalProjection({
        driverId: driver.id,
        fullName: driver.fullName,
        driverType: driver.driverType,
        stage: driver.stage,
        status: driver.status,
        readyForDispatch: driver.readyForDispatch,
        completionPercent: driver.completionPercent,
        checklist: checklistByDriver.get(driver.id) ?? [],
      });
      const recommendedOwner = ownerForOperationalStep(
        operationalOwners,
        projection.currentStepNumber,
        driver.id,
      );
      const qualityReasons = [
        ...projection.qualityReasons,
        ...(driver.operationalOwnerId == null ? ["missing_operational_owner"] : []),
      ];
      return {
        id: driver.id,
        fullName: driver.fullName,
        driverType: driver.driverType,
        status: driver.status,
        recruiterName: driver.recruiterName,
        recruiterNameNormalized: normalizeOperationalFilterValue(driver.recruiterName),
        sourceChannel: driver.sourceChannel,
        sourceChannelNormalized: normalizeOperationalFilterValue(driver.sourceChannel),
        operationalOwnerId: driver.operationalOwnerId,
        operationalOwnerName: driver.operationalOwnerName,
        recommendedOwnerId: recommendedOwner?.id ?? projection.recommendedOwnerId,
        recommendedOwnerName: recommendedOwner?.name ?? projection.recommendedOwnerName,
        currentStepNumber: projection.currentStepNumber,
        currentStepKey: projection.currentStepKey,
        currentStepLabel: projection.currentStepLabel,
        completedStepNumbers: projection.completedStepNumbers,
        quality: qualityReasons.length > 0 ? "needs_review" as const : "ok" as const,
        qualityReasons,
        nextAction: safeOperationalText(driver.nextBestAction),
        nextActionDue: driver.nextActionDue?.toISOString() ?? null,
        blockers: driver.blockerCode ?? (driver.blockers ? "blocked" : null),
        waitingOnExternal: driver.waitingOnExternal,
        phone: driver.phone,
        phoneLast4: safePhoneLast4(driver.phone),
        completionPercent: driver.completionPercent,
        updatedAt: driver.updatedAt.toISOString(),
      };
    });
    const visibleProjected = hasManagerWideOperationalAccess(auth)
      ? projected
      : projected.filter((row) => mayAccessOperationalDriver(auth, row.operationalOwnerId));
    const queue = buildOperationalQueue(visibleProjected, params.data);
    const ownerMap = new Map<number, string>();
    for (const row of queue.baseRows) {
      if (row.operationalOwnerId != null && row.operationalOwnerName) ownerMap.set(row.operationalOwnerId, row.operationalOwnerName);
    }

    res.json({
      items: queue.items,
      counts: queue.counts,
      total: queue.items.length,
      stepCount: OPERATIONAL_STEPS.length,
      filterOptions: {
        owners: [...ownerMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        steps: OPERATIONAL_STEPS.map(({ number, key, label }) => ({ number, key, label })),
        sources: [...new Set(queue.baseRows.map((row) => row.sourceChannelNormalized).filter(Boolean))].sort(),
      },
    });
  });
});

// ─── POST /drivers ────────────────────────────────────────────────────────────
router.post("/drivers", async (req, res): Promise<void> => {
  await withAuth(req, res, "create_driver", async (auth) => {
    const parsed = CreateDriverBody.safeParse(req.body);
    if (!parsed.success) { badRequest(res, parsed.error.message); return; }

    if (parsed.data.externalRecruitId) {
      const dup = await db.select().from(driversTable)
        .where(and(eq(driversTable.externalRecruitId, parsed.data.externalRecruitId), eq(driversTable.workspaceId, auth.workspaceId)));
      if (dup.length > 0) { conflict(res, "Driver with this externalRecruitId already exists"); return; }
    }

    const [driver] = await db.insert(driversTable).values({
      ...parsed.data,
      workspaceId:       auth.workspaceId,
      assigneeId:        parsed.data.assigneeId ?? null,
      phone:             parsed.data.phone ?? null,
      email:             parsed.data.email ?? null,
      state:             parsed.data.state ?? null,
      truckVin:          parsed.data.truckVin ?? null,
      startDate:         parsed.data.startDate ?? null,
      externalRecruitId: parsed.data.externalRecruitId ?? null,
      priority:          parsed.data.priority ?? "medium",
      status:            "pre_hire",
      stage:             "Application",
      completionPercent: 0,
    }).returning();
    const initialProjection = deriveOperationalProjection({
      driverId: driver.id,
      fullName: driver.fullName,
      driverType: driver.driverType,
      stage: driver.stage,
      status: driver.status,
      readyForDispatch: driver.readyForDispatch,
      completionPercent: driver.completionPercent,
      checklist: [],
    });
    const initialOwner = ownerForOperationalStep(
      await operationalOwnersForWorkspace(auth.workspaceId),
      initialProjection.currentStepNumber,
      driver.id,
    );
    if (initialOwner) {
      await db.update(driversTable).set({
        operationalOwnerId: initialOwner.id,
        operationalOwnerName: initialOwner.name,
      }).where(and(eq(driversTable.id, driver.id), eq(driversTable.workspaceId, auth.workspaceId)));
    }

    const template = getChecklistTemplateForDriver(driver.driverType);
    if (template.length > 0) {
      await db.insert(checklistItemsTable).values(
        template.map((t) => ({ ...t, workspaceId: auth.workspaceId, driverId: driver.id })),
      );
    }

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    driver.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      "Onboarding record created",
      detail:      `Driver ${driver.fullName} added directly`,
    });

    res.status(201).json(safeDriverRecord(driver));
  });
});

// ─── GET /drivers/:id ─────────────────────────────────────────────────────────
router.get("/drivers/:id", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = GetDriverParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select().from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, driver.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may view only their assigned operational work.", retryable: false });
      return;
    }

    // Attach lead
    let lead: { id: number; fullName: string; state: string | null; sourceChannel: string; status: string } | null = null;
    if (driver.leadId != null) {
      const [l] = await db.select().from(leadsTable)
        .where(and(eq(leadsTable.id, driver.leadId), eq(leadsTable.workspaceId, auth.workspaceId)));
      lead = l ? {
        id: l.id,
        fullName: l.fullName,
        state: l.state,
        sourceChannel: l.sourceChannel,
        status: l.status,
      } : null;
    }

    // Attach onboarding case
    const [onboardingCase] = await db.select().from(onboardingCasesTable)
      .where(and(eq(onboardingCasesTable.driverId, driver.id), eq(onboardingCasesTable.workspaceId, auth.workspaceId)));

    const safeCase = onboardingCase ? {
      id: onboardingCase.id,
      caseNumber: onboardingCase.caseNumber,
      status: onboardingCase.status,
      recruiterName: onboardingCase.recruiterName,
      sourceChannel: onboardingCase.sourceChannel,
      hiredAt: onboardingCase.hiredAt,
      completedAt: onboardingCase.completedAt,
      slaDeadline: onboardingCase.slaDeadline,
      replayCount: onboardingCase.replayCount,
      lastReplayAt: onboardingCase.lastReplayAt,
    } : null;
    res.json({ ...safeDriverRecord(driver), lead, onboardingCase: safeCase });
  });
});

// ─── PATCH /drivers/:id ───────────────────────────────────────────────────────
router.patch("/drivers/:id", async (req, res): Promise<void> => {
  await withAuth(req, res, "update_driver", async (auth) => {
    const params = UpdateDriverParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = UpdateDriverBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [existing] = await db.select().from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!existing) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, existing.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may update only their assigned operational work.", retryable: false });
      return;
    }
    if (!hasManagerWideOperationalAccess(auth)) {
      const allowedStaffFields = new Set(["nextBestAction", "blockers", "waitingOnExternal"]);
      const forbiddenFields = Object.keys(body.data).filter((field) => !allowedStaffFields.has(field));
      if (forbiddenFields.length > 0) {
        res.status(403).json({
          code: "FORBIDDEN",
          message: "Staff may update only safe operational action and blocker fields.",
          retryable: false,
          fields: forbiddenFields,
        });
        return;
      }
    }

    const [updated] = await db.update(driversTable).set(body.data)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)))
      .returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      "Driver record updated",
      detail:      `Fields changed: ${Object.keys(body.data).join(", ")}`,
    });

    res.json(safeDriverRecord(updated));
  });
});

// ─── POST /drivers/:id/ready-for-dispatch ─────────────────────────────────────
router.post("/drivers/:id/ready-for-dispatch", async (req, res): Promise<void> => {
  await withAuth(req, res, "ready_for_dispatch", async (auth) => {
    const params = MarkReadyForDispatchParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select().from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, driver.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may update only their assigned operational work.", retryable: false });
      return;
    }

    // Block dispatch for fallout (stage-system) and disqualified (legacy status).
    // Use 422 Unprocessable Entity — the request is structurally valid but the
    // business rule permanently forbids this action for this record.
    const isFallout      = driver.stage === "fallout" || driver.status === "fallout";
    const isDisqualified = driver.status === "disqualified";
    if (isFallout || isDisqualified) {
      const reason = isFallout ? "fallout" : "disqualified";
      unprocessable(
        res,
        `Driver is ${reason} — dispatch eligibility permanently blocked. Update the driver record or open a new case to proceed.`,
        { ready: false, driverId: driver.id, reason },
      );
      return;
    }

    const allChecklist = await db.select().from(checklistItemsTable)
      .where(and(eq(checklistItemsTable.driverId, params.data.id), eq(checklistItemsTable.workspaceId, auth.workspaceId)));

    // Use the driver’s persisted checklist so newly-added template gates do
    // not rewrite or silently block historical records.
    const mandatoryGates = allChecklist.filter((item) => item.isMandatory).map((item) => item.gateKey);
    if (mandatoryGates.length === 0) {
      unprocessable(res, "Checklist is not initialized.", { ready: false, driverId: driver.id, failedGates: ["checklist_not_initialized"] });
      return;
    }
    const failedGates = mandatoryGates.filter((gateKey) => {
      const item = allChecklist.find((c) => c.gateKey === gateKey);
      return !item || item.status !== "passed";
    });

    if (failedGates.length > 0) {
      unprocessable(res, "Mandatory compliance gates not completed.", { ready: false, driverId: driver.id, failedGates });
      return;
    }

    const readyOwner = ownerForOperationalStep(
      await operationalOwnersForWorkspace(auth.workspaceId),
      OPERATIONAL_STEPS.length,
      driver.id,
    );
    const [updated] = await db.update(driversTable)
      .set({
        status: "ready_for_dispatch",
        readyForDispatch: true,
        complianceGatesPassed: true,
        operationalOwnerId: readyOwner?.id ?? driver.operationalOwnerId,
        operationalOwnerName: readyOwner?.name ?? driver.operationalOwnerName,
      })
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)))
      .returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      "Driver marked Ready for Dispatch",
      detail:      "All mandatory compliance gates passed.",
    });

    // Write stage history — dispatch check clears to dispatch_ready
    await recordStageTransition({
      workspaceId:    auth.workspaceId,
      driverId:       params.data.id,
      fromStage:      driver.stage,
      toStage:        "dispatch_ready",
      actorName:      auth.userName,
      actorRole:      auth.workspaceRole,
      transitionType: "dispatch_check",
      note:           "All mandatory compliance gates passed — cleared for dispatch",
    });

    res.json({ ready: true, driverId: driver.id, driver: updated });
  });
});

// ─── POST /drivers/:id/datatruck-sync ─────────────────────────────────────────
router.post("/drivers/:id/datatruck-sync", async (req, res): Promise<void> => {
  await withAuth(req, res, "datatruck_sync", async (auth) => {
    const params = TriggerDatatruckSyncParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select().from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, driver.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may update only their assigned operational work.", retryable: false });
      return;
    }

    const existingSyncs = await db.select().from(datatruckSyncsTable)
      .where(and(eq(datatruckSyncsTable.driverId, params.data.id), eq(datatruckSyncsTable.workspaceId, auth.workspaceId)));
    const attemptNumber = existingSyncs.length + 1;

    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

    const rand = Math.random();
    let syncStatus: string;
    if      (attemptNumber === 1) syncStatus = rand < 0.6 ? "synced" : rand < 0.8 ? "retry" : "failed";
    else if (attemptNumber === 2) syncStatus = rand < 0.8 ? "synced" : "failed";
    else                          syncStatus = "synced";

    const syncedAt     = syncStatus === "synced" ? new Date().toISOString() : null;
    const errorMessage = syncStatus === "failed" ? "DataTruck TMS connection timeout (simulated)"
                       : syncStatus === "retry"  ? "Transient error — queued for retry (simulated)" : null;

    const [syncRecord] = await db.insert(datatruckSyncsTable).values({
      workspaceId: auth.workspaceId, driverId: params.data.id,
      syncStatus, attemptNumber, errorMessage, syncedAt,
    }).returning();

    await db.update(driversTable).set({ datatruckSyncStatus: syncStatus })
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      `DataTruck sync attempt #${attemptNumber}: ${syncStatus.toUpperCase()}`,
      detail:      errorMessage ?? "Sync completed successfully — driver record live in DataTruck TMS",
    });

    res.json(syncRecord);
  });
});

// ─── GET /drivers/:id/datatruck-sync/history ──────────────────────────────────
router.get("/drivers/:id/datatruck-sync/history", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = GetDatatruckSyncHistoryParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id, operationalOwnerId: driversTable.operationalOwnerId }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, driver.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may view only their assigned operational work.", retryable: false });
      return;
    }

    const rows = await db.select().from(datatruckSyncsTable)
      .where(and(eq(datatruckSyncsTable.driverId, params.data.id), eq(datatruckSyncsTable.workspaceId, auth.workspaceId)))
      .orderBy(datatruckSyncsTable.createdAt);
    res.json(rows);
  });
});

export default router;
