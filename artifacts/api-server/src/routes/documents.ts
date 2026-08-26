import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { driverDocumentsTable, activityEntriesTable, driversTable } from "@workspace/db";
import {
  ListDriverDocumentsParams,
  CreateDriverDocumentParams,
  CreateDriverDocumentBody,
  UpdateDriverDocumentParams,
  UpdateDriverDocumentBody,
} from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/drivers/:id/documents", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = ListDriverDocumentsParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const rows = await db.select().from(driverDocumentsTable)
      .where(and(eq(driverDocumentsTable.driverId, params.data.id), eq(driverDocumentsTable.workspaceId, auth.workspaceId)))
      .orderBy(driverDocumentsTable.createdAt);
    res.json(rows);
  });
});

router.post("/drivers/:id/documents", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_documents", async (auth) => {
    const params = CreateDriverDocumentParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = CreateDriverDocumentBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [driver] = await db.select({ id: driversTable.id }).from(driversTable)
      .where(and(eq(driversTable.id, params.data.id), eq(driversTable.workspaceId, auth.workspaceId)));
    if (!driver) { notFound(res, "Driver not found"); return; }

    const [doc] = await db.insert(driverDocumentsTable).values({
      ...body.data,
      workspaceId: auth.workspaceId,
      driverId:    params.data.id,
      expiryDate:  body.data.expiryDate ?? null,
      notes:       body.data.notes ?? null,
      uploadedAt:  new Date().toISOString(),
    }).returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId, driverId: params.data.id,
      actorName: auth.userName, actorRole: auth.workspaceRole,
      action: `Document uploaded: ${doc.docName}`, detail: `Type: ${doc.docType} · Status: ${doc.status}`,
    });

    res.status(201).json(doc);
  });
});

router.patch("/drivers/:id/documents/:docId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_documents", async (auth) => {
    const params = UpdateDriverDocumentParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    const body = UpdateDriverDocumentBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const [existing] = await db.select().from(driverDocumentsTable)
      .where(and(
        eq(driverDocumentsTable.id, params.data.docId),
        eq(driverDocumentsTable.driverId, params.data.id),
        eq(driverDocumentsTable.workspaceId, auth.workspaceId),
      ));
    if (!existing) { notFound(res, "Document not found"); return; }

    const updateData: Record<string, unknown> = { ...body.data };
    if (body.data.status === "verified" && !existing.verifiedAt) updateData.verifiedAt = new Date().toISOString();

    const [updated] = await db.update(driverDocumentsTable).set(updateData)
      .where(and(eq(driverDocumentsTable.id, params.data.docId), eq(driverDocumentsTable.workspaceId, auth.workspaceId)))
      .returning();

    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId, driverId: params.data.id,
      actorName: auth.userName, actorRole: auth.workspaceRole,
      action: `Document updated: ${existing.docName}`, detail: body.data.status ? `Status → ${body.data.status.toUpperCase()}` : "Details updated",
    });

    res.json(updated);
  });
});

export default router;
