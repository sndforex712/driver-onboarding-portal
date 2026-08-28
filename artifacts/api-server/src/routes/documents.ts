import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driverDocumentsTable,
  activityEntriesTable,
  driversTable,
  twentyDocumentRequirementsTable,
  twentyStepAdvancementAttemptsTable,
} from "@workspace/db";
import {
  ListDriverDocumentsParams,
  CreateDriverDocumentParams,
  CreateDriverDocumentBody,
  UpdateDriverDocumentParams,
  UpdateDriverDocumentBody,
  GetTwentyDocumentWorkflowParams,
  DownloadTwentyDriverDocumentParams,
  ReviewTwentyDriverDocumentParams,
  ReviewTwentyDriverDocumentBody,
  CompleteTwentyDriverStepParams,
  CompleteTwentyDriverStepBody,
  UpdateTwentyDocumentRequirementParams,
  UpdateTwentyDocumentRequirementBody,
} from "@workspace/api-zod";
import { withAuth, type AuthContext } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";
import { hasManagerWideOperationalAccess } from "../lib/operational-ownership";
import {
  getTwentyDriverCandidate,
  TwentyApiError,
  TWENTY_DRIVER_STEPS,
  type TwentyDriverCandidate,
} from "../lib/twenty-driver-candidates";
import {
  assertCanonicalTwentyStepKey,
  getTwentyStepRequirements,
  listTwentyDocumentRequirements,
} from "../lib/twenty-document-requirements";
import {
  createDocumentStorageKey,
  deleteDocument,
  DocumentStorageUnavailableError,
  MAX_DOCUMENT_BYTES,
  readDocument,
  storeDocument,
  validateDocumentFile,
} from "../lib/document-storage";
import {
  guardedAdvanceTwentyStep,
  TwentyDocumentWorkflowError,
  type TwentyAdvancementResult,
} from "../lib/twenty-document-advancement";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 5 },
});

function parseDocumentUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    badRequest(res, error instanceof Error ? error.message : "Invalid multipart upload.");
  });
}

function assignedRecruiterForUser(userName: string): string {
  const normalized = userName.trim().toLowerCase();
  if (normalized.includes("marcus")) return "Marcus";
  if (normalized.includes("sarah")) return "Sarah";
  return userName.trim();
}

function canAccessCandidate(auth: AuthContext, candidate: TwentyDriverCandidate): boolean {
  return hasManagerWideOperationalAccess(auth)
    || candidate.recruiterLabel.trim().toLowerCase() === assignedRecruiterForUser(auth.userName).toLowerCase();
}

async function loadVisibleCandidate(
  auth: AuthContext,
  candidateId: string,
  res: Response,
): Promise<TwentyDriverCandidate | null> {
  const candidate = await getTwentyDriverCandidate(candidateId);
  if (!candidate) {
    notFound(res, "Twenty Driver Candidate not found");
    return null;
  }
  if (!canAccessCandidate(auth, candidate)) {
    res.status(403).json({ message: "You do not have access to this Twenty Driver Candidate." });
    return null;
  }
  return candidate;
}

function documentDto(document: typeof driverDocumentsTable.$inferSelect) {
  return {
    id: document.id,
    candidateId: document.twentyCandidateId ?? "",
    stepKey: document.stepKey ?? "",
    requirementKey: document.requirementKey ?? "",
    docName: document.docName,
    status: document.status,
    mimeType: document.mimeType ?? "application/octet-stream",
    sizeBytes: document.sizeBytes ?? 0,
    notes: document.notes,
    rejectionReason: document.rejectionReason,
    uploadedAt: document.uploadedAt,
    reviewedAt: document.reviewedAt?.toISOString() ?? null,
    verifiedAt: document.verifiedAt,
    downloadUrl: `/api/drivers/operational-queue/${document.twentyCandidateId}/documents/${document.id}/download`,
    createdAt: document.createdAt.toISOString(),
  };
}

function requirementDto(requirement: typeof twentyDocumentRequirementsTable.$inferSelect) {
  return {
    id: requirement.id,
    stepKey: requirement.stepKey,
    requirementKey: requirement.requirementKey,
    label: requirement.label,
    isMandatory: requirement.isMandatory,
    allowsManualCompletion: requirement.allowsManualCompletion,
    sortOrder: requirement.sortOrder,
  };
}

function handleTwentyDocumentError(res: Response, error: unknown): void {
  if (error instanceof TwentyDocumentWorkflowError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof TwentyApiError) {
    res.status(error.status === 404 ? 404 : 502).json({ message: error.message });
    return;
  }
  if (error instanceof DocumentStorageUnavailableError) {
    res.status(503).json({ message: "App Storage is not provisioned for this project yet." });
    return;
  }
  throw error;
}

router.get("/drivers/operational-queue/:id/document-workflow", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = GetTwentyDocumentWorkflowParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    try {
      const candidate = await loadVisibleCandidate(auth, params.data.id, res);
      if (!candidate) return;
      const [requirements, documents, finalAttempts] = await Promise.all([
        listTwentyDocumentRequirements(auth.workspaceId),
        db.select().from(driverDocumentsTable).where(and(
          eq(driverDocumentsTable.workspaceId, auth.workspaceId),
          eq(driverDocumentsTable.twentyCandidateId, candidate.id),
        )).orderBy(asc(driverDocumentsTable.createdAt)),
        db.select().from(twentyStepAdvancementAttemptsTable).where(and(
          eq(twentyStepAdvancementAttemptsTable.workspaceId, auth.workspaceId),
          eq(twentyStepAdvancementAttemptsTable.candidateId, candidate.id),
          eq(twentyStepAdvancementAttemptsTable.status, "succeeded"),
        )),
      ]);
      const currentIndex = TWENTY_DRIVER_STEPS.findIndex((step) => step.key === candidate.currentStep);
      const completedFinalStep = finalAttempts.some((attempt) => attempt.fromStepKey === "TELEGRAM_GROUP");
      res.json({
        candidateId: candidate.id,
        candidateName: candidate.fullName,
        canManageDocuments: ["owner_admin", "manager", "onboarding_specialist", "compliance_reviewer"].includes(auth.workspaceRole),
        currentStepKey: candidate.currentStep,
        currentStepNumber: candidate.currentStepNumber,
        currentStepLabel: candidate.currentStepLabel,
        steps: TWENTY_DRIVER_STEPS.map((step, index) => {
          const stepRequirements = requirements.filter((requirement) => requirement.stepKey === step.key);
          return {
            number: step.number,
            key: step.key,
            label: step.label,
            state: index < currentIndex || (step.key === "TELEGRAM_GROUP" && completedFinalStep)
              ? "complete"
              : index === currentIndex ? "current" : "upcoming",
            allowsManualCompletion: stepRequirements.some((requirement) => requirement.allowsManualCompletion),
            requirements: stepRequirements.map(requirementDto),
            documents: documents.filter((document) => document.stepKey === step.key).map(documentDto),
          };
        }),
      });
    } catch (error) {
      handleTwentyDocumentError(res, error);
    }
  });
});

router.post(
  "/drivers/operational-queue/:id/documents",
  parseDocumentUpload,
  async (req, res): Promise<void> => {
    await withAuth(req, res, "manage_documents", async (auth) => {
      const candidateId = String(req.params.id ?? "");
      const stepKey = typeof req.body.stepKey === "string" ? req.body.stepKey.trim() : "";
      const requirementKey = typeof req.body.requirementKey === "string" ? req.body.requirementKey.trim() : "";
      const notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null;
      if (!candidateId || !stepKey || !requirementKey || !req.file) {
        badRequest(res, "file, stepKey, and requirementKey are required.");
        return;
      }
      try {
        assertCanonicalTwentyStepKey(stepKey);
        validateDocumentFile(req.file);
        const candidate = await loadVisibleCandidate(auth, candidateId, res);
        if (!candidate) return;
        if (candidate.currentStep !== stepKey) {
          res.status(409).json({ message: `Candidate is now on ${candidate.currentStepLabel}; refresh before uploading.` });
          return;
        }
        const requirements = await getTwentyStepRequirements(auth.workspaceId, stepKey);
        const requirement = requirements.find((entry) => entry.requirementKey === requirementKey);
        if (!requirement) {
          badRequest(res, "The selected document is not configured for this step.");
          return;
        }

        const storageKey = createDocumentStorageKey(auth.workspaceId, candidate.id);
        await storeDocument(storageKey, req.file.buffer);
        try {
          const [document] = await db.insert(driverDocumentsTable).values({
            workspaceId: auth.workspaceId,
            driverId: null,
            twentyCandidateId: candidate.id,
            stepKey,
            requirementKey,
            docType: requirementKey.toLowerCase(),
            docName: req.file.originalname.slice(0, 255),
            status: "under_review",
            storageKey,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            notes,
            uploadedAt: new Date().toISOString(),
            uploadedByUserId: auth.userId,
            uploadedByName: auth.userName,
          }).returning();
          if (!document) throw new Error("Failed to save document metadata.");
          res.status(201).json(documentDto(document));
        } catch (error) {
          await deleteDocument(storageKey);
          throw error;
        }
      } catch (error) {
        if (error instanceof Error && (
          error.message.startsWith("Only PDF")
          || error.message.startsWith("Document size")
          || error.message.startsWith("Unsupported Twenty step")
        )) {
          badRequest(res, error.message);
          return;
        }
        handleTwentyDocumentError(res, error);
      }
    });
  },
);

router.get("/drivers/operational-queue/:id/documents/:docId/download", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = DownloadTwentyDriverDocumentParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }
    try {
      const candidate = await loadVisibleCandidate(auth, params.data.id, res);
      if (!candidate) return;
      const [document] = await db.select().from(driverDocumentsTable).where(and(
        eq(driverDocumentsTable.id, params.data.docId),
        eq(driverDocumentsTable.workspaceId, auth.workspaceId),
        eq(driverDocumentsTable.twentyCandidateId, candidate.id),
      ));
      if (!document?.storageKey) { notFound(res, "Document file not found"); return; }
      const bytes = await readDocument(document.storageKey);
      const safeName = document.docName.replace(/[\r\n"]/g, "_");
      res.setHeader("Content-Type", document.mimeType ?? "application/octet-stream");
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(bytes);
    } catch (error) {
      handleTwentyDocumentError(res, error);
    }
  });
});

router.patch("/drivers/operational-queue/:id/documents/:docId/review", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_documents", async (auth) => {
    const params = ReviewTwentyDriverDocumentParams.safeParse(req.params);
    const body = ReviewTwentyDriverDocumentBody.safeParse(req.body);
    if (!params.success) { badRequest(res, params.error.message); return; }
    if (!body.success) { badRequest(res, body.error.message); return; }
    if (body.data.status === "rejected" && !body.data.rejectionReason?.trim()) {
      badRequest(res, "A rejection reason is required.");
      return;
    }
    try {
      const candidate = await loadVisibleCandidate(auth, params.data.id, res);
      if (!candidate) return;
      const [existing] = await db.select().from(driverDocumentsTable).where(and(
        eq(driverDocumentsTable.id, params.data.docId),
        eq(driverDocumentsTable.workspaceId, auth.workspaceId),
        eq(driverDocumentsTable.twentyCandidateId, candidate.id),
      ));
      if (!existing) { notFound(res, "Document not found"); return; }
      if (existing.status !== "under_review" && existing.status !== body.data.status) {
        res.status(409).json({ message: `Document was already ${existing.status}.` });
        return;
      }

      const now = new Date();
      const [document] = existing.status === body.data.status
        ? [existing]
        : await db.update(driverDocumentsTable).set({
            status: body.data.status,
            rejectionReason: body.data.status === "rejected" ? body.data.rejectionReason!.trim() : null,
            reviewedAt: now,
            reviewedByUserId: auth.userId,
            reviewedByName: auth.userName,
            verifiedAt: body.data.status === "verified" ? now.toISOString() : null,
          }).where(and(
            eq(driverDocumentsTable.id, existing.id),
            eq(driverDocumentsTable.status, "under_review"),
          )).returning();
      if (!document) {
        res.status(409).json({ message: "Document review state changed; refresh and try again." });
        return;
      }

      let advancement: TwentyAdvancementResult = {
        advanced: false,
        finalCompleted: false,
        currentStepKey: candidate.currentStep,
        nextStepKey: TWENTY_DRIVER_STEPS[candidate.currentStepNumber]?.key ?? null,
        message: body.data.status === "rejected"
          ? "Document rejected; the candidate remains on the current step."
          : "Document verified.",
      };
      if (body.data.status === "verified" && document.stepKey === candidate.currentStep) {
        advancement = await guardedAdvanceTwentyStep({
          workspaceId: auth.workspaceId,
          candidateId: candidate.id,
          expectedStepKey: candidate.currentStep,
          idempotencyKey: typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : undefined,
          mode: "verified_documents",
          actor: auth,
        });
      }
      res.json({ document: documentDto(document), advancement });
    } catch (error) {
      handleTwentyDocumentError(res, error);
    }
  });
});

router.post("/drivers/operational-queue/:id/complete-step", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_documents", async (auth) => {
    const params = CompleteTwentyDriverStepParams.safeParse(req.params);
    const body = CompleteTwentyDriverStepBody.safeParse(req.body);
    if (!params.success) { badRequest(res, params.error.message); return; }
    if (!body.success) { badRequest(res, body.error.message); return; }
    try {
      const candidate = await loadVisibleCandidate(auth, params.data.id, res);
      if (!candidate) return;
      const result = await guardedAdvanceTwentyStep({
        workspaceId: auth.workspaceId,
        candidateId: candidate.id,
        expectedStepKey: body.data.expectedStepKey,
        idempotencyKey: typeof req.headers["idempotency-key"] === "string"
          ? req.headers["idempotency-key"]
          : undefined,
        mode: "manual",
        actor: auth,
      });
      res.json(result);
    } catch (error) {
      handleTwentyDocumentError(res, error);
    }
  });
});

router.get("/document-requirements", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_settings", async (auth) => {
    res.json((await listTwentyDocumentRequirements(auth.workspaceId)).map(requirementDto));
  });
});

router.patch("/document-requirements/:requirementId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_settings", async (auth) => {
    const params = UpdateTwentyDocumentRequirementParams.safeParse(req.params);
    const body = UpdateTwentyDocumentRequirementBody.safeParse(req.body);
    if (!params.success) { badRequest(res, params.error.message); return; }
    if (!body.success || Object.keys(body.data).length === 0) {
      badRequest(res, body.success ? "At least one setting is required." : body.error.message);
      return;
    }
    const [existing] = await db.select().from(twentyDocumentRequirementsTable).where(and(
      eq(twentyDocumentRequirementsTable.id, params.data.requirementId),
      eq(twentyDocumentRequirementsTable.workspaceId, auth.workspaceId),
    ));
    if (!existing) { notFound(res, "Document requirement not found"); return; }
    assertCanonicalTwentyStepKey(existing.stepKey);
    const [updated] = await db.update(twentyDocumentRequirementsTable).set(body.data).where(and(
      eq(twentyDocumentRequirementsTable.id, existing.id),
      eq(twentyDocumentRequirementsTable.workspaceId, auth.workspaceId),
    )).returning();
    res.json(requirementDto(updated));
  });
});

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
