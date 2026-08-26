import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driversTable,
  checklistItemsTable,
  activityEntriesTable,
  leadsTable,
  driverDocumentsTable,
  onboardingCasesTable,
} from "@workspace/db";
import { SimulateHiredEventBody } from "@workspace/api-zod";
import { getChecklistTemplateForDriver } from "../lib/checklist-gates";
import { withAuth } from "../lib/authorize";
import { badRequest } from "../lib/api-errors";
import { normalizePhone, detectDuplicates, type LeadCandidate } from "../lib/duplicate-detection";
import { operationalOwnerForStep } from "../lib/driver-operational-projection";
import { recordStageTransition } from "./stage";

const router: IRouter = Router();

// ─── Extra fields beyond the generated schema ────────────────────────────────
interface DocStub {
  docType:    string;
  docName:    string;
  notes?:     string;
  expiryDate?: string;
}

interface HiredEventExtras {
  /** Initial recruiter notes — stored on case.initialNotes, never overwritten */
  notes?:       string;
  /** Document stubs submitted with the application — deduplicated on replay */
  documents?:   DocStub[];
  slaDeadline?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractExtras(body: Record<string, unknown>): HiredEventExtras {
  const extras: HiredEventExtras = {};
  if (typeof body.notes === "string") extras.notes = body.notes;
  if (typeof body.slaDeadline === "string") extras.slaDeadline = body.slaDeadline;
  if (Array.isArray(body.documents)) {
    extras.documents = (body.documents as unknown[]).flatMap((d) => {
      if (typeof d === "object" && d !== null) {
        const item = d as Record<string, unknown>;
        if (typeof item.docType === "string" && typeof item.docName === "string") {
          const stub: DocStub = { docType: item.docType, docName: item.docName };
          if (typeof item.notes === "string")     stub.notes      = item.notes;
          if (typeof item.expiryDate === "string") stub.expiryDate = item.expiryDate;
          return [stub];
        }
      }
      return [];
    });
  }
  return extras;
}

async function getDuplicateWarnings(lead: typeof leadsTable.$inferSelect, workspaceId: number) {
  const allLeads = await db
    .select({
      id:              leadsTable.id,
      fullName:        leadsTable.fullName,
      phoneNormalized: leadsTable.phoneNormalized,
      state:           leadsTable.state,
      status:          leadsTable.status,
    })
    .from(leadsTable)
    .where(eq(leadsTable.workspaceId, workspaceId));
  return detectDuplicates(
    { fullName: lead.fullName, phoneNormalized: lead.phoneNormalized, state: lead.state },
    allLeads.filter((l) => l.id !== lead.id),
  );
}

async function insertDocumentStubs(
  docs: DocStub[],
  driverId: number,
  workspaceId: number,
  existingDocTypes: Set<string>,
): Promise<number> {
  const newDocs = docs.filter((d) => !existingDocTypes.has(d.docType));
  if (newDocs.length === 0) return 0;
  await db.insert(driverDocumentsTable).values(
    newDocs.map((d) => ({
      workspaceId,
      driverId,
      docType:    d.docType,
      docName:    d.docName,
      notes:      d.notes ?? null,
      expiryDate: d.expiryDate ?? null,
      status:     "pending" as const,
    })),
  );
  return newDocs.length;
}

// ─── POST /events/hired ───────────────────────────────────────────────────────
/**
 * Idempotency contract
 * ────────────────────
 * Gate key: (externalRecruitId, workspaceId) on the onboarding_cases table.
 *
 * First call  → creates lead + driver + case + checklist + stage history + docs.
 *               Returns 201 { wasIdempotent: false, case, driver, lead, duplicateWarnings }.
 *
 * Replay call → NEVER creates new records.
 *               Preserves: recruiterName, sourceChannel, initialNotes (on case).
 *               Merges:    notes  → new activity entry if text differs from initialNotes.
 *               Merges:    docs   → inserts only docTypes absent from driver_documents.
 *               Returns 200 { wasIdempotent: true, replayCount, case, driver, lead, duplicateWarnings }.
 *
 * workspace_id is always server-derived — never trusted from the request body.
 */
router.post("/events/hired", async (req, res): Promise<void> => {
  await withAuth(req, res, "simulate_hired", async (auth) => {
    const body = SimulateHiredEventBody.safeParse(req.body);
    if (!body.success) { badRequest(res, body.error.message); return; }

    const data = body.data;
    const extras = extractExtras(req.body as Record<string, unknown>);

    // ── IDEMPOTENCY CHECK — case is the single source of truth ────────────────
    const [existingCase] = await db
      .select()
      .from(onboardingCasesTable)
      .where(
        and(
          eq(onboardingCasesTable.externalRecruitId, data.externalRecruitId),
          eq(onboardingCasesTable.workspaceId, auth.workspaceId),
        ),
      );

    if (existingCase) {
      // ── REPLAY PATH ─────────────────────────────────────────────────────────
      const [driver] = await db
        .select()
        .from(driversTable)
        .where(and(eq(driversTable.id, existingCase.driverId), eq(driversTable.workspaceId, auth.workspaceId)));

      const [lead] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.id, existingCase.leadId!), eq(leadsTable.workspaceId, auth.workspaceId)));

      // Merge: append new notes as activity if text is new
      const incomingNotes = extras.notes?.trim() ?? "";
      const originalNotes = (existingCase.initialNotes ?? "").trim();
      if (incomingNotes && incomingNotes !== originalNotes) {
        await db.insert(activityEntriesTable).values({
          workspaceId: auth.workspaceId,
          driverId:    driver.id,
          actorName:   auth.userName,
          actorRole:   auth.workspaceRole,
          action:      "Hired event replay — additional recruiter notes received",
          detail:      extras.notes!,
        });
      }

      // Merge: append new document stubs (deduplicate by docType)
      let docsAdded = 0;
      if (extras.documents?.length) {
        const existingDocs = await db
          .select({ docType: driverDocumentsTable.docType })
          .from(driverDocumentsTable)
          .where(
            and(
              eq(driverDocumentsTable.driverId, driver.id),
              eq(driverDocumentsTable.workspaceId, auth.workspaceId),
            ),
          );
        docsAdded = await insertDocumentStubs(
          extras.documents,
          driver.id,
          auth.workspaceId,
          new Set(existingDocs.map((d) => d.docType)),
        );
      }

      // Update replay metadata
      const newReplayCount = existingCase.replayCount + 1;
      const [updatedCase] = await db
        .update(onboardingCasesTable)
        .set({ replayCount: newReplayCount, lastReplayAt: new Date() })
        .where(eq(onboardingCasesTable.id, existingCase.id))
        .returning();

      const duplicateWarnings = await getDuplicateWarnings(lead, auth.workspaceId);

      res.status(200).json({
        wasIdempotent:  true,
        replayCount:    newReplayCount,
        docsAdded,
        case:           updatedCase,
        driver,
        lead,
        duplicateWarnings,
      });
      return;
    }

    // ── CREATE PATH (first time) ──────────────────────────────────────────────
    const phoneNormalized = normalizePhone(data.phone);

    // 1. Find or create Lead
    let lead: typeof leadsTable.$inferSelect;
    const [existingLead] = await db
      .select()
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.externalRecruitId, data.externalRecruitId),
          eq(leadsTable.workspaceId, auth.workspaceId),
        ),
      );

    if (existingLead) {
      lead = existingLead;
    } else {
      const allLeads: LeadCandidate[] = await db
        .select({
          id:              leadsTable.id,
          fullName:        leadsTable.fullName,
          phoneNormalized: leadsTable.phoneNormalized,
          state:           leadsTable.state,
          status:          leadsTable.status,
        })
        .from(leadsTable)
        .where(eq(leadsTable.workspaceId, auth.workspaceId));

      const dupeMatches = detectDuplicates(
        { fullName: data.fullName, phoneNormalized, state: data.state ?? null },
        allLeads,
      );
      const topDupe = dupeMatches[0];

      const [newLead] = await db
        .insert(leadsTable)
        .values({
          workspaceId:         auth.workspaceId,
          fullName:            data.fullName,
          phoneRaw:            data.phone ?? null,
          phoneNormalized:     phoneNormalized ?? null,
          email:               data.email ?? null,
          state:               data.state ?? null,
          recruiterName:       data.recruiterName,
          sourceChannel:       data.sourceChannel,
          externalRecruitId:   data.externalRecruitId,
          status:              "hired",
          isDuplicate:         dupeMatches.length > 0,
          duplicateConfidence: topDupe?.confidence ?? null,
          duplicateOfLeadId:   topDupe?.leadId ?? null,
        })
        .returning();
      lead = newLead;
    }

    // 2. Create Driver
    const [driver] = await db
      .insert(driversTable)
      .values({
        workspaceId:       auth.workspaceId,
        leadId:            lead.id,
        fullName:          data.fullName,
        phone:             data.phone ?? null,
        email:             data.email ?? null,
        state:             data.state ?? null,
        driverType:        data.driverType,
        recruiterName:     data.recruiterName,
        sourceChannel:     data.sourceChannel,
        externalRecruitId: data.externalRecruitId,
        assigneeId:        data.assigneeId ?? null,
        truckVin:          data.truckVin ?? null,
        priority:          data.priority ?? "medium",
        status:            "pre_hire",
        stage:             "hired",
        completionPercent: 0,
        nextBestAction:    "Collect application & e-sign consent",
      })
      .returning();
    const initialOperationalOwner = operationalOwnerForStep(1, driver.id);
    await db.update(driversTable).set({
      operationalOwnerId: initialOperationalOwner.id,
      operationalOwnerName: initialOperationalOwner.name,
    }).where(and(eq(driversTable.id, driver.id), eq(driversTable.workspaceId, auth.workspaceId)));

    // 3. Create OnboardingCase
    // caseOwnerName is permanent — taken from request or defaults to the acting user.
    // A manager PUSH never changes it.
    const caseOwnerNameFromBody = typeof (req.body as Record<string,unknown>).caseOwnerName === "string"
      ? ((req.body as Record<string,unknown>).caseOwnerName as string).trim() || auth.userName
      : auth.userName;

    const [newCase] = await db
      .insert(onboardingCasesTable)
      .values({
        workspaceId:          auth.workspaceId,
        driverId:             driver.id,
        leadId:               lead.id,
        externalRecruitId:    data.externalRecruitId,
        recruiterName:        data.recruiterName,   // ← preserved, never overwritten
        sourceChannel:        data.sourceChannel,   // ← preserved, never overwritten
        initialNotes:         extras.notes ?? null, // ← preserved, never overwritten
        assignedSpecialistId: data.assigneeId ?? null,
        slaDeadline:          extras.slaDeadline ?? null,
        status:               "open",
        caseOwnerId:          auth.userId,
        caseOwnerName:        caseOwnerNameFromBody,
      })
      .returning();

    // Set human-readable case number
    const caseNumber = `CASE-${newCase.id.toString().padStart(5, "0")}`;
    const [theCase] = await db
      .update(onboardingCasesTable)
      .set({ caseNumber })
      .where(eq(onboardingCasesTable.id, newCase.id))
      .returning();

    // 4. Checklist template
    const template = getChecklistTemplateForDriver(driver.driverType);
    if (template.length > 0) {
      await db.insert(checklistItemsTable).values(
        template.map((t) => ({ ...t, workspaceId: auth.workspaceId, driverId: driver.id })),
      );
    }

    // 5. Initial document stubs from body
    let docsAdded = 0;
    if (extras.documents?.length) {
      docsAdded = await insertDocumentStubs(extras.documents, driver.id, auth.workspaceId, new Set());
    }

    // 6. Activity entry
    await db.insert(activityEntriesTable).values({
      workspaceId: auth.workspaceId,
      driverId:    driver.id,
      actorName:   auth.userName,
      actorRole:   auth.workspaceRole,
      action:      `Hired event received — case ${caseNumber} created`,
      detail:      `${driver.fullName} hired via ${data.sourceChannel}. ${template.length} gates created. ${docsAdded} document stubs attached.${extras.notes ? ` Recruiter notes: ${extras.notes}` : ""}`,
    });

    // 7. Initial stage history
    await recordStageTransition({
      workspaceId:    auth.workspaceId,
      driverId:       driver.id,
      fromStage:      null,
      toStage:        "hired",
      actorName:      "System",
      actorRole:      "system",
      transitionType: "hired_event",
      note:           `Case ${caseNumber} opened — source: ${data.sourceChannel}, recruiter: ${data.recruiterName}`,
    });

    const duplicateWarnings = await getDuplicateWarnings(lead, auth.workspaceId);

    res.status(201).json({
      wasIdempotent: false,
      replayCount:   0,
      docsAdded,
      case:          theCase,
      driver,
      lead,
      duplicateWarnings,
    });
  });
});

export default router;
