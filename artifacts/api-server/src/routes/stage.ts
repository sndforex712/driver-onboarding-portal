import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { driversTable, driverStageHistoryTable, onboardingCasesTable } from "@workspace/db";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound, conflict, unprocessable } from "../lib/api-errors";
import {
  DRIVER_STAGES, STAGE_LABELS, STAGE_ORDER, isValidStage, isForwardStage,
  type DriverStage, type TransitionType,
} from "../lib/stages";

/** Map a formal driver stage to the corresponding onboarding case status. */
function stageToCaseStatus(stage: DriverStage): string {
  if (stage === "fallout")                                    return "fallout";
  if (stage === "dispatch_ready" || stage === "active")       return "completed";
  if (stage === "onboarding"    || stage === "pre_hire")      return "onboarding";
  return "open"; // hired
}

const router: IRouter = Router();

// ─── Shared helper ────────────────────────────────────────────────────────────

export async function recordStageTransition(params: {
  workspaceId:    number;
  driverId:       number;
  fromStage:      string | null;
  toStage:        DriverStage;
  actorName:      string;
  actorRole:      string;
  transitionType: TransitionType;
  note?:          string;
}): Promise<typeof driverStageHistoryTable.$inferSelect> {
  // Update driver.stage (denormalized current stage)
  await db
    .update(driversTable)
    .set({ stage: params.toStage })
    .where(
      and(
        eq(driversTable.id, params.driverId),
        eq(driversTable.workspaceId, params.workspaceId),
      ),
    );

  // Sync case status (no-op if no case exists for this driver yet)
  const caseStatus = stageToCaseStatus(params.toStage);
  const caseUpdate: Record<string, unknown> = { status: caseStatus };
  if (caseStatus === "completed") caseUpdate.completedAt = new Date();
  await db
    .update(onboardingCasesTable)
    .set(caseUpdate)
    .where(
      and(
        eq(onboardingCasesTable.driverId, params.driverId),
        eq(onboardingCasesTable.workspaceId, params.workspaceId),
      ),
    );

  // Append history row
  const [entry] = await db
    .insert(driverStageHistoryTable)
    .values({
      workspaceId:    params.workspaceId,
      driverId:       params.driverId,
      fromStage:      params.fromStage,
      toStage:        params.toStage,
      actorName:      params.actorName,
      actorRole:      params.actorRole,
      transitionType: params.transitionType,
      note:           params.note ?? null,
    })
    .returning();

  return entry;
}

// ─── GET /drivers/:id/stage-history ───────────────────────────────────────────
router.get("/drivers/:id/stage-history", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const driverId = parseInt(req.params.id ?? "");
    if (isNaN(driverId)) { badRequest(res, "Invalid driver id"); return; }

    const [driver] = await db
      .select({ id: driversTable.id, stage: driversTable.stage, fullName: driversTable.fullName })
      .from(driversTable)
      .where(and(eq(driversTable.id, driverId), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const history = await db
      .select()
      .from(driverStageHistoryTable)
      .where(
        and(
          eq(driverStageHistoryTable.driverId, driverId),
          eq(driverStageHistoryTable.workspaceId, auth.workspaceId),
        ),
      )
      .orderBy(asc(driverStageHistoryTable.transitionedAt));

    res.json({
      driverId,
      fullName:     driver.fullName,
      currentStage: driver.stage,
      stageLabel:   isValidStage(driver.stage) ? STAGE_LABELS[driver.stage] : driver.stage,
      pipeline:     DRIVER_STAGES.map((s) => ({
        key:   s,
        label: STAGE_LABELS[s],
        order: STAGE_ORDER[s],
      })),
      history,
    });
  });
});

// ─── POST /drivers/:id/stage — manual stage transition ────────────────────────
/**
 * Requires manage_tasks (onboarding_specialist, manager, owner_admin).
 * Body: { toStage: DriverStage, note?: string }
 * Rules:
 *  - toStage must be a valid stage key
 *  - Cannot transition to same stage
 *  - Can only go forward (or to fallout from any stage)
 *  - Does NOT re-run mandatory gate checks (use /ready-for-dispatch for that)
 */
router.post("/drivers/:id/stage", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_tasks", async (auth) => {
    const driverId = parseInt(req.params.id ?? "");
    if (isNaN(driverId)) { badRequest(res, "Invalid driver id"); return; }

    const { toStage, note } = req.body ?? {};
    if (!toStage || !isValidStage(toStage)) {
      badRequest(res, `toStage must be one of: ${DRIVER_STAGES.join(", ")}`, { validStages: DRIVER_STAGES });
      return;
    }

    const [driver] = await db
      .select()
      .from(driversTable)
      .where(and(eq(driversTable.id, driverId), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const currentStage = driver.stage as DriverStage;
    if (currentStage === toStage) {
      conflict(res, `Driver is already in stage '${toStage}'`);
      return;
    }
    if (isValidStage(currentStage) && !isForwardStage(currentStage, toStage)) {
      unprocessable(
        res,
        `Cannot move from '${currentStage}' to '${toStage}' — only forward transitions are allowed (or fallout from any stage)`,
        { currentStage, toStage },
      );
      return;
    }

    const entry = await recordStageTransition({
      workspaceId:    auth.workspaceId,
      driverId,
      fromStage:      driver.stage,
      toStage,
      actorName:      auth.userName,
      actorRole:      auth.workspaceRole,
      transitionType: "stage_advance",
      note,
    });

    res.json({
      transitioned: true,
      fromStage:    driver.stage,
      toStage,
      stageLabel:   STAGE_LABELS[toStage],
      entry,
    });
  });
});

// ─── GET /drivers/:id/case ───────────────────────────────────────────────────
router.get("/drivers/:id/case", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const driverId = parseInt(req.params.id ?? "");
    if (isNaN(driverId)) { badRequest(res, "Invalid driver id"); return; }

    const [theCase] = await db
      .select()
      .from(onboardingCasesTable)
      .where(
        and(
          eq(onboardingCasesTable.driverId, driverId),
          eq(onboardingCasesTable.workspaceId, auth.workspaceId),
        ),
      );
    if (!theCase) { notFound(res, "No onboarding case found for this driver"); return; }

    res.json(theCase);
  });
});

// ─── PATCH /drivers/:id/case ──────────────────────────────────────────────────
// Allows updating mutable case fields: status, slaDeadline, assignedSpecialistId.
// recruiterName, sourceChannel, initialNotes are intentionally NOT patchable here.
const VALID_CASE_STATUSES = ["open", "onboarding", "completed", "fallout", "closed"] as const;
type CaseStatus = typeof VALID_CASE_STATUSES[number];

function parseCasePatch(body: unknown): { status?: CaseStatus; slaDeadline?: string; assignedSpecialistId?: number } | string {
  if (typeof body !== "object" || body === null) return "Request body must be an object";
  const b = body as Record<string, unknown>;
  const result: { status?: CaseStatus; slaDeadline?: string; assignedSpecialistId?: number } = {};
  if (b.status !== undefined) {
    if (!VALID_CASE_STATUSES.includes(b.status as CaseStatus)) {
      return `status must be one of: ${VALID_CASE_STATUSES.join(", ")}`;
    }
    result.status = b.status as CaseStatus;
  }
  if (b.slaDeadline !== undefined) {
    if (typeof b.slaDeadline !== "string") return "slaDeadline must be a string";
    result.slaDeadline = b.slaDeadline;
  }
  if (b.assignedSpecialistId !== undefined) {
    if (typeof b.assignedSpecialistId !== "number") return "assignedSpecialistId must be a number";
    result.assignedSpecialistId = b.assignedSpecialistId;
  }
  return result;
}

router.patch("/drivers/:id/case", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_tasks", async (auth) => {
    const driverId = parseInt(req.params.id ?? "");
    if (isNaN(driverId)) { badRequest(res, "Invalid driver id"); return; }

    const parsed = parseCasePatch(req.body);
    if (typeof parsed === "string") { badRequest(res, parsed); return; }

    const [existing] = await db
      .select()
      .from(onboardingCasesTable)
      .where(
        and(
          eq(onboardingCasesTable.driverId, driverId),
          eq(onboardingCasesTable.workspaceId, auth.workspaceId),
        ),
      );
    if (!existing) { notFound(res, "No onboarding case found for this driver"); return; }

    const updatePayload: Record<string, unknown> = { ...parsed };
    if (parsed.status === "completed" && !existing.completedAt) {
      updatePayload.completedAt = new Date();
    }

    const [updated] = await db
      .update(onboardingCasesTable)
      .set(updatePayload)
      .where(eq(onboardingCasesTable.id, existing.id))
      .returning();

    res.json(updated);
  });
});

export default router;
