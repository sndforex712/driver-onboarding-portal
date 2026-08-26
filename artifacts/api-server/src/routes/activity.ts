import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { activityEntriesTable, driversTable } from "@workspace/db";
import { ListDriverActivityParams } from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/drivers/:id/activity", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverActivityParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const rows = await db.select().from(activityEntriesTable)
      .where(and(eq(activityEntriesTable.driverId, params.data.id), eq(activityEntriesTable.workspaceId, auth.workspaceId)))
      .orderBy(desc(activityEntriesTable.createdAt))
      .limit(100);
    res.json(rows);
  });
});

export default router;
