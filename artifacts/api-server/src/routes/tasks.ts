import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { onboardingTasksTable, activityEntriesTable, driversTable } from "@workspace/db";
import {
  ListDriverTasksParams,
  CreateDriverTaskParams,
  CreateDriverTaskBody,
  UpdateDriverTaskParams,
  UpdateDriverTaskBody,
} from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/drivers/:id/tasks", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverTasksParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const rows = await db.select().from(onboardingTasksTable)
      .where(and(eq(onboardingTasksTable.driverId, params.data.id), eq(onboardingTasksTable.workspaceId, auth.workspaceId)))
      .orderBy(onboardingTasksTable.createdAt);
    res.json(rows);
  });
});

router.post("/drivers/:id/tasks", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_tasks", async (auth) => {
    const params = CreateDriverTaskParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = CreateDriverTaskBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const [task] = await db.insert(onboardingTasksTable).values({
      ...body.data,
      workspaceId:  auth.workspaceId,
      driverId:     params.data.id,
      assigneeId:   body.data.assigneeId ?? null,
      assigneeName: null,
      dueDate:      body.data.dueDate ?? null,
    }).returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId, driverId: params.data.id,
      actorName: auth.userName, actorRole: auth.workspaceRole,
      action: `Task created: ${task.title}`, detail: `Type: ${task.taskType} · Priority: ${task.priority}`,
    });

    res.status(201).json(task);
  });
});

router.patch("/drivers/:id/tasks/:taskId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_tasks", async (auth) => {
    const params = UpdateDriverTaskParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = UpdateDriverTaskBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [existing] = await db.select().from(onboardingTasksTable)
      .where(and(
        eq(onboardingTasksTable.id, params.data.taskId),
        eq(onboardingTasksTable.driverId, params.data.id),
        eq(onboardingTasksTable.workspaceId, auth.workspaceId),
      ));
    if (!existing) { notFound(res, "Task not found"); return; }

    const updateData: Record<string, unknown> = { ...body.data };
    if (body.data.status === "completed" && !existing.completedAt) updateData.completedAt = new Date().toISOString();

    const [updated] = await db.update(onboardingTasksTable).set(updateData)
      .where(and(eq(onboardingTasksTable.id, params.data.taskId), eq(onboardingTasksTable.workspaceId, auth.workspaceId)))
      .returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId, driverId: params.data.id,
      actorName: auth.userName, actorRole: auth.workspaceRole,
      action: `Task updated: ${existing.title}`, detail: body.data.status ? `Status → ${body.data.status.toUpperCase()}` : "Task details updated",
    });

    res.json(updated);
  });
});

export default router;
