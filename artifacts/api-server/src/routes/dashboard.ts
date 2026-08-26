import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  driversTable,
  activityEntriesTable,
  driverDocumentsTable,
  checklistItemsTable,
} from "@workspace/db";
import { withAuth } from "../lib/authorize";

const router: IRouter = Router();

router.get("/dashboard/metrics", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const wsId = auth.workspaceId;

    const allDrivers = await db.select().from(driversTable).where(eq(driversTable.workspaceId, wsId));

    const totalActive      = allDrivers.filter((d) => !["dispatched", "fallout"].includes(d.status)).length;
    const readyForDispatch = allDrivers.filter((d) => d.status === "ready_for_dispatch").length;
    const inProgress       = allDrivers.filter((d) => d.status === "in_progress").length;
    const pendingApproval  = allDrivers.filter((d) => d.status === "pending_approval").length;
    const fallout          = allDrivers.filter((d) => d.status === "fallout").length;
    const criticalSla      = allDrivers.filter((d) => d.priority === "critical" && !["dispatched", "fallout", "ready_for_dispatch"].includes(d.status)).length;
    const ownerOperators   = allDrivers.filter((d) => d.driverType === "owner_operator").length;
    const companyDrivers   = allDrivers.filter((d) => d.driverType === "company_driver").length;

    const percents = allDrivers.map((d) => d.completionPercent).filter((p) => p > 0);
    const avgCompletionPercent = percents.length > 0
      ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;

    const allDocs      = await db.select().from(driverDocumentsTable).where(eq(driverDocumentsTable.workspaceId, wsId));
    const expiredDocs  = allDocs.filter((d) => d.expiryDate && new Date(d.expiryDate) < new Date());
    const allChecklist = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.workspaceId, wsId));
    const failedGates  = allChecklist.filter((i) => i.status === "failed" && i.isMandatory);
    const complianceExceptionCount = expiredDocs.length + failedGates.length;

    const byStatusMap: Record<string, number> = {};
    for (const d of allDrivers) byStatusMap[d.status] = (byStatusMap[d.status] ?? 0) + 1;
    const byStatus = Object.entries(byStatusMap).map(([label, count]) => ({ label, count }));

    const byStageMap: Record<string, number> = {};
    for (const d of allDrivers) byStageMap[d.stage] = (byStageMap[d.stage] ?? 0) + 1;
    const byStage = Object.entries(byStageMap).map(([label, count]) => ({ label, count }));

    const weeklyHired = [];
    for (let i = 5; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = allDrivers.filter((d) => {
        const c = new Date(d.createdAt);
        return c >= weekStart && c < weekEnd;
      }).length;
      weeklyHired.push({ week: weekStart.toISOString().slice(0, 10), count });
    }

    res.json({
      totalActive, readyForDispatch, inProgress, pendingApproval, fallout,
      criticalSla, ownerOperators, companyDrivers, avgCompletionPercent,
      complianceExceptionCount, byStatus, byStage, weeklyHired,
    });
  });
});

router.get("/dashboard/activity-feed", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const wsId = auth.workspaceId;

    const rows = await db.select().from(activityEntriesTable)
      .where(eq(activityEntriesTable.workspaceId, wsId))
      .orderBy(desc(activityEntriesTable.createdAt))
      .limit(50);

    const driverIds = [...new Set(rows.map((r) => r.driverId).filter(Boolean))];
    const driverMap = new Map<number, string>();
    if (driverIds.length > 0) {
      const drivers = await db.select({ id: driversTable.id, fullName: driversTable.fullName })
        .from(driversTable).where(eq(driversTable.workspaceId, wsId));
      for (const d of drivers) driverMap.set(d.id, d.fullName);
    }

    res.json(rows.map((r) => ({ ...r, driverName: driverMap.get(r.driverId) ?? null })));
  });
});

export default router;
