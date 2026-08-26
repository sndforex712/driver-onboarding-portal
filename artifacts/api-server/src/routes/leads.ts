import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, driversTable, appUsersTable } from "@workspace/db";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound, conflict } from "../lib/api-errors";
import { normalizePhone, detectDuplicates, type LeadCandidate } from "../lib/duplicate-detection";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWorkspaceLeads(workspaceId: number): Promise<LeadCandidate[]> {
  return db
    .select({
      id:              leadsTable.id,
      fullName:        leadsTable.fullName,
      phoneNormalized: leadsTable.phoneNormalized,
      state:           leadsTable.state,
      status:          leadsTable.status,
    })
    .from(leadsTable)
    .where(eq(leadsTable.workspaceId, workspaceId));
}

/** Enrich a list of leads with their linked driver and duplicate-of name.
 *  Fetches all workspace leads for the name map so cross-subset references resolve. */
async function enrichLeads(leads: typeof leadsTable.$inferSelect[], workspaceId: number) {
  if (leads.length === 0) return [];

  const [drivers, allWsLeads] = await Promise.all([
    db
      .select({ leadId: driversTable.leadId, fullName: driversTable.fullName, id: driversTable.id, status: driversTable.status })
      .from(driversTable)
      .where(eq(driversTable.workspaceId, workspaceId)),
    db
      .select({ id: leadsTable.id, fullName: leadsTable.fullName })
      .from(leadsTable)
      .where(eq(leadsTable.workspaceId, workspaceId)),
  ]);

  const driverMap = new Map<number, { id: number; fullName: string; status: string }>();
  for (const d of drivers) {
    if (d.leadId != null) driverMap.set(d.leadId, { id: d.id, fullName: d.fullName, status: d.status });
  }

  // Name map from ALL workspace leads so cross-subset duplicateOfLeadId refs resolve
  const leadIdToName = new Map<number, string>(allWsLeads.map((l) => [l.id, l.fullName]));

  return leads.map((lead) => ({
    ...lead,
    driver:              driverMap.get(lead.id) ?? null,
    duplicateOfLeadName: lead.duplicateOfLeadId != null ? (leadIdToName.get(lead.duplicateOfLeadId) ?? null) : null,
  }));
}

// ─── GET /leads ───────────────────────────────────────────────────────────────
router.get("/leads", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const leads = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.workspaceId, auth.workspaceId))
      .orderBy(leadsTable.createdAt);

    res.json(await enrichLeads(leads, auth.workspaceId));
  });
});

// ─── GET /leads/duplicates ────────────────────────────────────────────────────
router.get("/leads/duplicates", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const leads = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.workspaceId, auth.workspaceId), eq(leadsTable.isDuplicate, true)));

    res.json(await enrichLeads(leads, auth.workspaceId));
  });
});

// ─── GET /leads/:id ───────────────────────────────────────────────────────────
router.get("/leads/:id", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { badRequest(res, "Invalid lead id"); return; }

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, id), eq(leadsTable.workspaceId, auth.workspaceId)));
    if (!lead) { notFound(res, "Lead not found"); return; }

    // Linked driver
    const [driver] = await db
      .select()
      .from(driversTable)
      .where(and(eq(driversTable.leadId, id), eq(driversTable.workspaceId, auth.workspaceId)));

    // Run live duplicate detection
    const allLeads = await getWorkspaceLeads(auth.workspaceId);
    const others   = allLeads.filter((l) => l.id !== id);
    const potentialDuplicates = detectDuplicates(
      { fullName: lead.fullName, phoneNormalized: lead.phoneNormalized, state: lead.state },
      others,
    );

    res.json({ ...lead, driver: driver ?? null, potentialDuplicates });
  });
});

// ─── GET /leads/:id/potential-duplicates ──────────────────────────────────────
router.get("/leads/:id/potential-duplicates", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const id = parseInt(req.params.id ?? "");
    if (isNaN(id)) { badRequest(res, "Invalid lead id"); return; }

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, id), eq(leadsTable.workspaceId, auth.workspaceId)));
    if (!lead) { notFound(res, "Lead not found"); return; }

    const allLeads = await getWorkspaceLeads(auth.workspaceId);
    const potentialDuplicates = detectDuplicates(
      { fullName: lead.fullName, phoneNormalized: lead.phoneNormalized, state: lead.state },
      allLeads.filter((l) => l.id !== id),
    );

    res.json({ leadId: id, potentialDuplicates });
  });
});

// ─── POST /leads/:id/merge — owner_admin only ─────────────────────────────────
/**
 * Merges lead `:id` (source) INTO `mergeIntoLeadId` (target).
 * Source is marked status=merged. All drivers linked to source are re-linked to target.
 * Requires manage_settings capability (owner_admin only).
 */
router.post("/leads/:id/merge", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_settings", async (auth) => {
    const sourceId = parseInt(req.params.id ?? "");
    const { mergeIntoLeadId } = req.body ?? {};

    if (isNaN(sourceId)) { badRequest(res, "Invalid source lead id"); return; }
    if (!mergeIntoLeadId || isNaN(parseInt(mergeIntoLeadId))) {
      badRequest(res, "mergeIntoLeadId is required");
      return;
    }
    const targetId = parseInt(mergeIntoLeadId);
    if (sourceId === targetId) { badRequest(res, "Cannot merge a lead into itself"); return; }

    // Validate source
    const [source] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, sourceId), eq(leadsTable.workspaceId, auth.workspaceId)));
    if (!source) { notFound(res, "Source lead not found in this workspace"); return; }
    if (source.status === "merged") {
      conflict(res, "Source lead is already merged", { mergedIntoLeadId: source.mergedIntoLeadId });
      return;
    }

    // Validate target
    const [target] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, targetId), eq(leadsTable.workspaceId, auth.workspaceId)));
    if (!target) { notFound(res, "Target lead not found in this workspace"); return; }
    if (target.status === "merged") {
      conflict(res, "Target lead is itself already merged. Choose a different target.");
      return;
    }

    // Re-link any drivers from source → target
    const relinked = await db
      .update(driversTable)
      .set({ leadId: targetId })
      .where(and(eq(driversTable.leadId, sourceId), eq(driversTable.workspaceId, auth.workspaceId)))
      .returning({ id: driversTable.id });

    // Fetch actor name
    const [actor] = await db
      .select({ name: appUsersTable.name })
      .from(appUsersTable)
      .where(eq(appUsersTable.id, auth.userId));

    // Mark source as merged
    const now = new Date();
    const [mergedSource] = await db
      .update(leadsTable)
      .set({
        status:           "merged",
        mergedIntoLeadId: targetId,
        mergedAt:         now,
        mergedByUserId:   auth.userId,
      })
      .where(eq(leadsTable.id, sourceId))
      .returning();

    // Clear duplicate flag on target (it's now the canonical record)
    const [updatedTarget] = await db
      .update(leadsTable)
      .set({ isDuplicate: false, duplicateConfidence: null, duplicateOfLeadId: null })
      .where(eq(leadsTable.id, targetId))
      .returning();

    // Clear duplicate flags on any other leads that pointed at source → redirect to target
    await db
      .update(leadsTable)
      .set({ duplicateOfLeadId: targetId })
      .where(
        and(
          eq(leadsTable.duplicateOfLeadId, sourceId),
          eq(leadsTable.workspaceId, auth.workspaceId),
        ),
      );

    res.json({
      merged:           true,
      sourceLeadId:     sourceId,
      targetLeadId:     targetId,
      driversRelinked:  relinked.length,
      mergedBy:         actor?.name ?? auth.userName,
      mergedAt:         now,
      source:           mergedSource,
      target:           updatedTarget,
    });
  });
});

export default router;
