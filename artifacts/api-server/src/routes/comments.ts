import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { commentsTable, driversTable } from "@workspace/db";
import {
  ListDriverCommentsParams,
  CreateDriverCommentParams,
  CreateDriverCommentBody,
} from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/drivers/:id/comments", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverCommentsParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const rows = await db.select().from(commentsTable)
      .where(and(eq(commentsTable.driverId, params.data.id), eq(commentsTable.workspaceId, auth.workspaceId)))
      .orderBy(desc(commentsTable.createdAt));
    res.json(rows);
  });
});

router.post("/drivers/:id/comments", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = CreateDriverCommentParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = CreateDriverCommentBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const [comment] = await db.insert(commentsTable).values({
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      authorName:  body.data.authorName ?? auth.userName,
      authorRole:  body.data.authorRole ?? auth.workspaceRole,
      body:        body.data.body,
    }).returning();

    res.status(201).json(comment);
  });
});

export default router;
