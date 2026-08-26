import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  appUsersTable,
  franklinLeadIngestsTable,
  leadsTable,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  workspacesTable,
  workspaceMembershipsTable,
} from "@workspace/db";
import { FranklinLeadIngestBody, type FranklinLeadIngest } from "@workspace/api-zod";
import {
  createFranklinLeadIngestRouter,
  franklinPayloadHash,
  type FranklinIngestResult as IngestResult,
  type FranklinLeadIngestService,
} from "./franklin-lead-ingest-http";


function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

async function replayOrConflict(
  workspaceId: number,
  key: string,
  payload: FranklinLeadIngest,
  payloadHash: string,
): Promise<IngestResult | null> {
  const [existing] = await db.select().from(franklinLeadIngestsTable).where(and(
    eq(franklinLeadIngestsTable.workspaceId, workspaceId),
    or(
      eq(franklinLeadIngestsTable.idempotencyKey, key),
      and(
        eq(franklinLeadIngestsTable.sourceSystem, payload.source_system),
        eq(franklinLeadIngestsTable.sourceTenant, payload.source_tenant),
        eq(franklinLeadIngestsTable.sourceLeadId, payload.source_lead_id),
      ),
    ),
  ));
  if (!existing) return null;
  if (
    existing.payloadHash !== payloadHash
    || existing.idempotencyKey !== key
    || existing.sourceSystem !== payload.source_system
    || existing.sourceTenant !== payload.source_tenant
    || existing.sourceLeadId !== payload.source_lead_id
  ) {
    return { status: "idempotency_conflict" };
  }
  return {
    status: "already_exists",
    targetLeadId: existing.leadId,
    targetCaseId: existing.recruitingCaseId,
  };
}

async function ingest(
  key: string,
  payload: FranklinLeadIngest,
  payloadHash: string,
): Promise<IngestResult> {
  const [workspace] = await db.select({ id: workspacesTable.id })
    .from(workspacesTable)
    .where(eq(workspacesTable.slug, "franklin"));
  if (!workspace) throw new Error("Franklin workspace is not configured");

  const replay = await replayOrConflict(workspace.id, key, payload, payloadHash);
  if (replay) return replay;

  const owners = await db.select({ userId: workspaceMembershipsTable.userId, role: workspaceMembershipsTable.role })
    .from(workspaceMembershipsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, workspaceMembershipsTable.userId))
    .where(and(
      eq(workspaceMembershipsTable.workspaceId, workspace.id),
      inArray(workspaceMembershipsTable.role, ["recruiter", "manager", "owner_admin"]),
    ))
    .orderBy(asc(workspaceMembershipsTable.role), asc(workspaceMembershipsTable.userId));
  const owner = owners.find(item => item.role === "recruiter") ?? owners[0];
  if (!owner) throw new Error("Franklin workspace has no eligible Recruiting intake owner");

  const requestedAt = new Date(payload.requested_at);
  const nextActionDueAt = new Date(requestedAt.getTime() + 4 * 60 * 60 * 1000);
  const slaDeadlineAt = new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000);

  try {
    return await db.transaction(async (tx) => {
      const insideReplay = await tx.select().from(franklinLeadIngestsTable).where(and(
        eq(franklinLeadIngestsTable.workspaceId, workspace.id),
        or(
          eq(franklinLeadIngestsTable.idempotencyKey, key),
          and(
            eq(franklinLeadIngestsTable.sourceSystem, payload.source_system),
            eq(franklinLeadIngestsTable.sourceTenant, payload.source_tenant),
            eq(franklinLeadIngestsTable.sourceLeadId, payload.source_lead_id),
          ),
        ),
      ));
      if (insideReplay[0]) {
        const current = insideReplay[0];
        if (current.payloadHash !== payloadHash || current.idempotencyKey !== key) {
          return { status: "idempotency_conflict" };
        }
        return { status: "already_exists", targetLeadId: current.leadId, targetCaseId: current.recruitingCaseId };
      }

      const [lead] = await tx.insert(leadsTable).values({
        workspaceId: workspace.id,
        fullName: payload.driver_name,
        phoneRaw: payload.phone,
        phoneNormalized: payload.phone,
        recruiterName: payload.displayed_recruiter,
        sourceChannel: "franklins.ai",
        externalRecruitId: payload.external_id,
        notes: `Franklin intake ${payload.source_lead_id}; requested by ${payload.requested_by.full_name}.`,
        status: "pending",
      }).returning();

      const [caseRecord] = await tx.insert(recruitingCasesTable).values({
        workspaceId: workspace.id,
        driverId: null,
        leadId: lead.id,
        caseNumber: `FRANKLIN-${payload.source_lead_id}`,
        sourceId: key,
        stage: "new_lead",
        lifecycle: "active",
        caseOwnerId: owner.userId,
        taskOwnerId: owner.userId,
        nextAction: "Review Franklin intake",
        nextActionDueAt,
        slaDeadlineAt,
        version: 1,
        transferStatus: "not_requested",
      }).returning();

      await tx.insert(recruitingCaseEventsTable).values({
        workspaceId: workspace.id,
        recruitingCaseId: caseRecord.id,
        transitionIdempotencyKey: `franklin-intake:${key}`,
        eventType: "franklin_lead_ingested",
        fromStage: null,
        toStage: "new_lead",
        actorUserId: null,
        caseVersion: 1,
        payload: { sourceSystem: payload.source_system, sourceLeadId: payload.source_lead_id, payloadHash },
      });

      await tx.insert(franklinLeadIngestsTable).values({
        workspaceId: workspace.id,
        sourceSystem: payload.source_system,
        sourceTenant: payload.source_tenant,
        sourceLeadId: payload.source_lead_id,
        externalId: payload.external_id,
        idempotencyKey: key,
        payloadHash,
        requestPayload: payload,
        leadId: lead.id,
        recruitingCaseId: caseRecord.id,
        driverName: payload.driver_name,
        phoneNormalized: payload.phone,
        driverType: payload.driver_type,
        cdlFrontReceived: payload.documents.cdl_front,
        cdlBackReceived: payload.documents.cdl_back,
        medicalCardReceived: payload.documents.medical_card,
        docsReceived: payload.docs_received,
        displayedRecruiter: payload.displayed_recruiter,
        requestedByAccountId: payload.requested_by.account_id,
        requestedByFullName: payload.requested_by.full_name,
        requestedAt,
      });
      return { status: "created", targetLeadId: lead.id, targetCaseId: caseRecord.id };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await replayOrConflict(workspace.id, key, payload, payloadHash))
      ?? { status: "idempotency_conflict" };
  }
}

export { createFranklinLeadIngestRouter, franklinPayloadHash, type FranklinLeadIngestService };
export default createFranklinLeadIngestRouter({ ingest, parse: body => FranklinLeadIngestBody.safeParse(body) as any });