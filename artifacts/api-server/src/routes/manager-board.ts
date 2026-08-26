/**
 * Manager Board API
 *
 * GET  /manager-board          — 36-hour sprint board (owner_admin + manager)
 * POST /drivers/:id/push       — manager acceleration push (owner_admin + manager)
 *
 * Authorization: view_manager_board / manager_push capabilities only.
 * Workspace isolation: all queries scoped to auth.workspaceId (never from body/params).
 * Phone masking: only last 4 digits are sent to the client — never the full number.
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driversTable,
  onboardingCasesTable,
  activityEntriesTable,
  managerPushesTable,
  checklistItemsTable,
} from "@workspace/db";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound, unprocessable } from "../lib/api-errors";
import {
  type SlaColor,
  type BoardColumn,
  type OperationalBoardColumn,
  OPERATIONAL_BOARD_COLUMNS,
  BOARD_COLUMN_ORDER,
  BOARD_COLUMN_LABELS,
  getBoardColumn,
  getSlaColor,
  maskPhone,
  warRoomSortKey,
} from "../lib/manager-board-utils.js";
import { deriveOperationalProjection } from "../lib/driver-operational-projection";

// Re-export pure helpers (testable standalone — no DB deps)
export {
  type SlaColor,
  type BoardColumn,
  type OperationalBoardColumn,
  OPERATIONAL_BOARD_COLUMNS,
  BOARD_COLUMN_ORDER,
  BOARD_COLUMN_LABELS,
  getBoardColumn,
  getSlaColor,
  maskPhone,
  warRoomSortKey,
} from "../lib/manager-board-utils.js";

const router: IRouter = Router();

// ─── GET /manager-board ───────────────────────────────────────────────────────

router.get("/manager-board", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_manager_board", async (auth) => {
    // Fetch all active drivers in this workspace, joined with their case
    const rows = await db
      .select({
        // driver fields
        driverId:         driversTable.id,
        fullName:         driversTable.fullName,
        phone:            driversTable.phone,
        state:            driversTable.state,
        truckYear:        driversTable.truckYear,
        truckMake:        driversTable.truckMake,
        truckInfo:        driversTable.truckInfo,
        driverType:       driversTable.driverType,
        stage:            driversTable.stage,
        status:           driversTable.status,
        completionPercent:driversTable.completionPercent,
        readyForDispatch: driversTable.readyForDispatch,
        recruiterName:    driversTable.recruiterName,
        sourceChannel:    driversTable.sourceChannel,
        assigneeName:     driversTable.assigneeName,       // task owner
        blockers:         driversTable.blockers,
        nextBestAction:   driversTable.nextBestAction,
        nextActionDue:    driversTable.nextActionDue,
        lastContact:      driversTable.lastContact,
        waitingOnExternal:driversTable.waitingOnExternal,
        pushCount:        driversTable.pushCount,
        operationalOwnerName: driversTable.operationalOwnerName,
        // case fields
        caseNumber:       onboardingCasesTable.caseNumber,
        caseOwnerId:      onboardingCasesTable.caseOwnerId,
        caseOwnerName:    onboardingCasesTable.caseOwnerName,
        hiredAt:          onboardingCasesTable.hiredAt,
      })
      .from(driversTable)
      .leftJoin(
        onboardingCasesTable,
        eq(onboardingCasesTable.driverId, driversTable.id),
      )
      .where(eq(driversTable.workspaceId, auth.workspaceId))
      .orderBy(driversTable.createdAt);
    const checklist = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.workspaceId, auth.workspaceId));
    const checklistByDriver = new Map<number, typeof checklist>();
    for (const item of checklist) {
      const items = checklistByDriver.get(item.driverId) ?? [];
      items.push(item);
      checklistByDriver.set(item.driverId, items);
    }

    // Build driver cards with computed fields
    const cards = rows.map((r) => {
      const projection = deriveOperationalProjection({
        driverId: r.driverId,
        fullName: r.fullName,
        driverType: r.driverType,
        stage: r.stage,
        status: r.status,
        readyForDispatch: r.readyForDispatch,
        completionPercent: r.completionPercent,
        checklist: checklistByDriver.get(r.driverId) ?? [],
      });
      const hiredAt = r.hiredAt ?? new Date(r.hiredAt ?? Date.now());
      const boardColumn = getBoardColumn(
        r.stage,
        r.status,
        r.readyForDispatch,
        projection.currentStepKey as OperationalBoardColumn,
      );
      const slaColor = getSlaColor(
        r.hiredAt ?? new Date(),
        r.waitingOnExternal,
      );
      const sprintDeadline = new Date(
        (r.hiredAt?.getTime() ?? Date.now()) + 36 * 60 * 60 * 1000,
      );
      const countdownMs =
        sprintDeadline.getTime() - Date.now();

      // Derive truckYear/truckMake from truckInfo if not stored separately
      let displayYear = r.truckYear ?? null;
      let displayMake = r.truckMake ?? null;
      if ((!displayYear || !displayMake) && r.truckInfo) {
        const parts = r.truckInfo.split(" ");
        if (!displayYear && /^\d{4}$/.test(parts[0] ?? "")) displayYear = parts[0] ?? null;
        if (!displayMake && parts[1]) displayMake = parts[1] ?? null;
      }

      return {
        driverId:      r.driverId,
        fullName:      r.fullName,
        maskedPhone:   maskPhone(r.phone),
        state:         r.state,
        truckYear:     displayYear,
        truckMake:     displayMake,
        driverType:    r.driverType,
        recruiterName: r.recruiterName,
        sourceChannel: r.sourceChannel,
        caseOwnerName: r.caseOwnerName ?? null,
        taskOwnerName: r.assigneeName ?? null,  // current assignee = Task Owner
        operationalOwnerName: r.operationalOwnerName ?? projection.recommendedOwnerName,
        currentStepNumber: projection.currentStepNumber,
        currentStepLabel: projection.currentStepLabel,
        stage:         r.stage,
        status:        r.status,
        hiredAt:       r.hiredAt?.toISOString() ?? null,
        countdownMs,
        slaColor,
        boardColumn,
        lastContact:   r.lastContact?.toISOString() ?? null,
        nextAction:    r.nextBestAction ?? null,
        nextActionDue: r.nextActionDue?.toISOString() ?? null,
        blockers:      r.blockers ?? null,
        pushCount:     r.pushCount,
        caseNumber:    r.caseNumber ?? null,
      };
    });

    // ── KPI counters ──────────────────────────────────────────────────────
    const SPRINT_MS = 36 * 60 * 60 * 1000;
    const now = Date.now();

    // Exclude blocked_fallout from sprint KPIs
    const sprintCards = cards.filter((c) => c.boardColumn !== "blocked_fallout");

    const kpis = {
      totalSprint: sprintCards.length,
      onTrack:     sprintCards.filter((c) => c.slaColor === "green").length,
      under12h:    sprintCards.filter((c) => c.slaColor === "yellow" || c.slaColor === "orange").length,
      under6h:     sprintCards.filter((c) => c.slaColor === "red").length,
      breached:    sprintCards.filter((c) => c.slaColor === "black").length,
      unassigned:  sprintCards.filter((c) => !c.caseOwnerName).length,
      readyToday:  cards.filter((c) => c.boardColumn === "ready_for_dispatch").length,
    };

    // ── Group by column ───────────────────────────────────────────────────
    const columns = Object.fromEntries(
      [...OPERATIONAL_BOARD_COLUMNS, "ready_for_dispatch", "blocked_fallout"].map((column) => [column, []]),
    ) as unknown as Record<BoardColumn, typeof cards>;

    for (const card of cards) {
      columns[card.boardColumn as BoardColumn].push(card);
    }

    res.json({ kpis, columns, columnOrder: BOARD_COLUMN_ORDER, columnLabels: BOARD_COLUMN_LABELS });
  });
});

// ─── POST /drivers/:id/push ───────────────────────────────────────────────────

router.post("/drivers/:id/push", async (req, res): Promise<void> => {
  await withAuth(req, res, "manager_push", async (auth) => {
    const driverId = parseInt(req.params.id ?? "", 10);
    if (isNaN(driverId)) { badRequest(res, "driverId must be a number"); return; }

    // Validate required push fields
    const { reason, nextAction, taskOwnerName, dueTime } = req.body ?? {};
    const missing: string[] = [];
    if (!reason?.trim())        missing.push("reason");
    if (!nextAction?.trim())    missing.push("nextAction");
    if (!taskOwnerName?.trim()) missing.push("taskOwnerName");
    if (!dueTime)               missing.push("dueTime");
    if (missing.length > 0) {
      badRequest(res, `Missing required fields: ${missing.join(", ")}`);
      return;
    }

    const dueDate = new Date(dueTime);
    if (isNaN(dueDate.getTime())) {
      badRequest(res, "dueTime must be a valid ISO date string");
      return;
    }

    // Load driver — scoped to workspace (never trust client-supplied workspaceId)
    const [driver] = await db
      .select()
      .from(driversTable)
      .where(
        and(
          eq(driversTable.id, driverId),
          eq(driversTable.workspaceId, auth.workspaceId),
        ),
      );

    if (!driver) { notFound(res, `Driver ${driverId} not found`); return; }

    // Cannot push on a fallout/disqualified driver
    if (driver.stage === "fallout" || driver.status === "fallout" || driver.status === "disqualified") {
      unprocessable(res, "Cannot push a driver in fallout or disqualified status", {
        code: "BUSINESS_RULE_VIOLATION",
        reason: "fallout_or_disqualified",
        retryable: false,
      });
      return;
    }

    // ── Append-only push record ───────────────────────────────────────────
    const [push] = await db
      .insert(managerPushesTable)
      .values({
        workspaceId:   auth.workspaceId,
        driverId,
        actorId:       auth.userId,
        actorName:     auth.userName,
        actorRole:     auth.workspaceRole,
        reason:        reason.trim(),
        nextAction:    nextAction.trim(),
        taskOwnerName: taskOwnerName.trim(),
        dueTime:       dueDate,
      })
      .returning();

    // ── Increment push count on driver ───────────────────────────────────
    await db
      .update(driversTable)
      .set({
        pushCount:     (driver.pushCount ?? 0) + 1,
        nextBestAction: nextAction.trim(),
        nextActionDue:  dueDate,
        assigneeName:   taskOwnerName.trim(),  // update task owner
      })
      .where(eq(driversTable.id, driverId));

    // ── Activity log (append-only) ────────────────────────────────────────
    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      "manager_push",
      detail:      `PUSH #${(driver.pushCount ?? 0) + 1} by ${auth.userName} — Reason: ${reason.trim()} | Next: ${nextAction.trim()} | Owner: ${taskOwnerName.trim()} | Due: ${dueDate.toISOString()}`,
    });

    // ── Reload case to confirm caseOwnerName is unchanged ────────────────
    const [kase] = await db
      .select({ caseOwnerName: onboardingCasesTable.caseOwnerName })
      .from(onboardingCasesTable)
      .where(eq(onboardingCasesTable.driverId, driverId));

    res.status(201).json({
      push,
      pushCount:        (driver.pushCount ?? 0) + 1,
      taskOwnerName:    taskOwnerName.trim(),
      caseOwnerName:    kase?.caseOwnerName ?? null,  // must equal pre-push value
      caseOwnerChanged: false,                         // invariant: always false
    });
  });
});

export default router;
