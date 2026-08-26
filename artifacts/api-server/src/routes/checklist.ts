import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  checklistItemsTable,
  driversTable,
  activityEntriesTable,
  driverOperationalHandoffsTable,
} from "@workspace/db";
import { recordStageTransition } from "./stage";
import {
  ListDriverChecklistParams,
  UpdateChecklistItemParams,
  UpdateChecklistItemBody,
} from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";
import {
  deriveOperationalProjection,
  hasCompletedPrecedingOperationalSteps,
  hasCompletedSubsequentOperationalSteps,
  operationalStepForGate,
} from "../lib/driver-operational-projection";
import {
  mayAccessOperationalDriver,
  mayUpdateOperationalDriverGate,
  operationalOwnersForWorkspace,
  ownerForOperationalStep,
} from "../lib/operational-ownership";

const router: IRouter = Router();

router.get("/drivers/:id/checklist", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverChecklistParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({
      id: driversTable.id,
      operationalOwnerId: driversTable.operationalOwnerId,
    }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }
    if (!mayAccessOperationalDriver(auth, driver.operationalOwnerId)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Staff may view only their assigned operational work.", retryable: false });
      return;
    }

    const rows = await db.select().from(checklistItemsTable)
      .where(and(eq(checklistItemsTable.driverId, params.data.id), eq(checklistItemsTable.workspaceId, auth.workspaceId)))
      .orderBy(checklistItemsTable.sortOrder);
    res.json(rows);
  });
});

router.patch("/drivers/:id/checklist/:itemId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_checklists", async (auth) => {
    const params = UpdateChecklistItemParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = UpdateChecklistItemBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [existing] = await db.select().from(checklistItemsTable)
      .where(and(
        eq(checklistItemsTable.id, params.data.itemId),
        eq(checklistItemsTable.driverId, params.data.id),
        eq(checklistItemsTable.workspaceId, auth.workspaceId),
      ));
    if (!existing) { notFound(res, "Checklist item not found"); return; }
    const [driverRec] = await db.select()
      .from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driverRec) { notFound(res, "Driver not found"); return; }
    const targetStep = operationalStepForGate(existing.gateKey, driverRec.driverType);
    const targetOwner = targetStep == null
      ? null
      : ownerForOperationalStep(
        await operationalOwnersForWorkspace(auth.workspaceId),
        targetStep,
        driverRec.id,
      );
    if (!mayUpdateOperationalDriverGate(auth, driverRec.operationalOwnerId, targetOwner?.id ?? null)) {
      res.status(403).json({
        code: "FORBIDDEN",
        message: "Staff may update only their assigned operational milestone.",
        retryable: false,
      });
      return;
    }

    const allItems = await db.select().from(checklistItemsTable)
      .where(and(eq(checklistItemsTable.driverId, params.data.id), eq(checklistItemsTable.workspaceId, auth.workspaceId)));
    const marksTargetComplete = body.data.status === "passed" || body.data.status === "na";
    const targetWasComplete = existing.status === "passed" || existing.status === "na";
    if (
      marksTargetComplete
      && targetStep != null
      && !hasCompletedPrecedingOperationalSteps(allItems, targetStep)
    ) {
      res.status(409).json({
        code: "CONFLICT",
        message: "Complete each earlier operational milestone before passing this step.",
        retryable: false,
      });
      return;
    }
    if (
      body.data.status != null
      && !marksTargetComplete
      && targetWasComplete
      && targetStep != null
      && hasCompletedSubsequentOperationalSteps(allItems, targetStep)
    ) {
      res.status(409).json({
        code: "CONFLICT",
        message: "Reopen later milestones before changing an earlier completed step.",
        retryable: false,
      });
      return;
    }

    const completesStepSix = marksTargetComplete
      && targetStep === 6;
    const hardy = completesStepSix
      ? ownerForOperationalStep(await operationalOwnersForWorkspace(auth.workspaceId), 7, driverRec.id)
      : null;
    if (completesStepSix && !hardy) {
      res.status(409).json({
        code: "CONFLICT",
        message: "Hardy must be provisioned in this DEV/DEMO workspace before Step 6 can hand off.",
        retryable: false,
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (body.data.status != null) {
      updateData.status = body.data.status;
      if (body.data.status === "passed") updateData.completedAt = new Date().toISOString();
    }
    if (body.data.notes != null) updateData.notes = body.data.notes;

    const [updated] = await db.update(checklistItemsTable).set(updateData)
      .where(and(eq(checklistItemsTable.id, params.data.itemId), eq(checklistItemsTable.workspaceId, auth.workspaceId)))
      .returning();

    const mandatory  = allItems.filter((i) => i.isMandatory);
    const passed     = mandatory.filter((i) => i.id === params.data.itemId ? body.data.status === "passed" : i.status === "passed");
    const pct        = mandatory.length > 0 ? Math.round((passed.length / mandatory.length) * 100) : 0;
    await db.update(driversTable).set({ completionPercent: pct })
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));

    // Operational ownership is CRM-owned and changes only through canonical
    // persisted checklist completion, never from a Sheet refresh or list read.
    if (driverRec) {
      const projection = deriveOperationalProjection({
        driverId: driverRec.id,
        fullName: driverRec.fullName,
        driverType: driverRec.driverType,
        stage: driverRec.stage,
        status: driverRec.status,
        readyForDispatch: driverRec.readyForDispatch,
        completionPercent: pct,
        checklist: allItems.map((item) => ({
          ...item,
          status: item.id === params.data.itemId && body.data.status != null ? body.data.status : item.status,
        })),
      });
      if (completesStepSix) {
        const handoffKey = `driver:${driverRec.id}:step-6-to-hardy`;
        await db.transaction(async (tx) => {
          const [handoff] = await tx.insert(driverOperationalHandoffsTable).values({
            workspaceId: auth.workspaceId,
            driverId: driverRec.id,
            fromOwnerId: driverRec.operationalOwnerId,
            fromOwnerName: driverRec.operationalOwnerName,
            toOwnerId: hardy!.id,
            toOwnerName: hardy!.name,
            completedByUserId: auth.userId,
            idempotencyKey: handoffKey,
          }).onConflictDoNothing().returning();

          // If this call replays after a successful handoff, ownership remains
          // Hardy and no second audit row is created.
          await tx.update(driversTable).set({
            operationalOwnerId: hardy!.id,
            operationalOwnerName: hardy!.name,
            hardyHandoffAt: handoff?.handedOffAt ?? driverRec.hardyHandoffAt ?? new Date(),
          }).where(and(eq(driversTable.id, driverRec.id), eq(driversTable.workspaceId, auth.workspaceId)));

          if (handoff) {
            await tx.insert(activityEntriesTable).values({
              workspaceId: auth.workspaceId,
              driverId: driverRec.id,
              actorName: auth.userName,
              actorRole: auth.workspaceRole,
              action: "Step 6 completed — handed off to Hardy",
              detail: `Exact-once operational handoff ${handoff.idempotencyKey}`,
            });
          }
        });
      } else if (projection.quality === "ok" && !driverRec.hardyHandoffAt) {
        const nextOwner = ownerForOperationalStep(
          await operationalOwnersForWorkspace(auth.workspaceId),
          projection.currentStepNumber,
          driverRec.id,
        );
        if (nextOwner) {
        await db.update(driversTable).set({
            operationalOwnerId: nextOwner.id,
            operationalOwnerName: nextOwner.name,
        }).where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
        }
      }
    }

    // Auto-advance to onboarding when the first gate is touched and driver is still at "hired"
    if (driverRec?.stage === "hired" && body.data.status != null) {
      await recordStageTransition({
        workspaceId:    auth.workspaceId,
        driverId:       params.data.id,
        fromStage:      "hired",
        toStage:        "onboarding",
        actorName:      "System",
        actorRole:      "system",
        transitionType: "auto_gate",
        note:           `First checklist gate touched — auto-advanced to Onboarding`,
      });
    }

    // Auto-advance to dispatch_ready when ALL mandatory gates pass while in onboarding
    if (
      pct === 100 &&
      mandatory.length > 0 &&
      driverRec?.stage === "onboarding"
    ) {
      await recordStageTransition({
        workspaceId:    auth.workspaceId,
        driverId:       params.data.id,
        fromStage:      "onboarding",
        toStage:        "dispatch_ready",
        actorName:      "System",
        actorRole:      "system",
        transitionType: "auto_gate",
        note:           `All ${mandatory.length} mandatory gates passed — auto-advanced to Ready for Dispatch`,
      });
    }

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      `Checklist gate updated: ${existing.label}`,
      detail:      body.data.status ? `Status → ${body.data.status.toUpperCase()}` : "Notes updated",
    });

    res.json(updated);
  });
});

export default router;
