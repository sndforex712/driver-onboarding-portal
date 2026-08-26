import { and, eq } from "drizzle-orm";
import {
  checklistItemsTable,
  db,
  driverOperationalHandoffsTable,
  driversTable,
  templateStepsTable,
  workflowTemplatesTable,
  workspacesTable,
} from "@workspace/db";
import { OPERATIONAL_CHECKLIST_TEMPLATE } from "./lib/checklist-gates";
import { canReplaceUntouchedFranklinWorkflow } from "./lib/franklin-workflow-sync-safety";

const FRANKLIN_WORKSPACE_ID = 1;

function assertDevOnlyInvocation(): void {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    throw new Error("Franklin workflow synchronization is DEV/DEMO-only.");
  }
  if (process.env.FRANKLINS_WORKFLOW_SYNC !== "1") {
    throw new Error("Set FRANKLINS_WORKFLOW_SYNC=1 to synchronize the DEV/DEMO workflow.");
  }
}

function legacyResetIsExplicitlyAllowed(): boolean {
  return process.env.FRANKLINS_WORKFLOW_SYNC_RESET_LEGACY === "1";
}

export async function syncFranklinOperationalWorkflow(): Promise<void> {
  assertDevOnlyInvocation();

  const [workspace, drivers, checklist, handoffs, templates] = await Promise.all([
    db.select().from(workspacesTable).where(eq(workspacesTable.id, FRANKLIN_WORKSPACE_ID)),
    db.select({
      id: driversTable.id,
      completionPercent: driversTable.completionPercent,
      operationalOwnerId: driversTable.operationalOwnerId,
      hardyHandoffAt: driversTable.hardyHandoffAt,
    }).from(driversTable).where(eq(driversTable.workspaceId, FRANKLIN_WORKSPACE_ID)),
    db.select({ id: checklistItemsTable.id, status: checklistItemsTable.status }).from(checklistItemsTable)
      .where(eq(checklistItemsTable.workspaceId, FRANKLIN_WORKSPACE_ID)),
    db.select({ id: driverOperationalHandoffsTable.id }).from(driverOperationalHandoffsTable)
      .where(eq(driverOperationalHandoffsTable.workspaceId, FRANKLIN_WORKSPACE_ID)),
    db.select().from(workflowTemplatesTable)
      .where(eq(workflowTemplatesTable.workspaceId, FRANKLIN_WORKSPACE_ID)),
  ]);
  const franklin = workspace[0];
  if (!franklin || franklin.slug !== "franklin") {
    throw new Error("Refusing workflow synchronization: workspace 1 is not Franklin.");
  }
  if (drivers.length !== 55) {
    throw new Error(`Refusing workflow synchronization: expected 55 imported drivers, found ${drivers.length}.`);
  }
  const safelyUntouched = canReplaceUntouchedFranklinWorkflow(
    drivers,
    checklist.map((item) => item.status),
    handoffs.length,
  );
  if (!safelyUntouched && !legacyResetIsExplicitlyAllowed()) {
    throw new Error(
      "Refusing workflow synchronization: stored operational progress requires FRANKLINS_WORKFLOW_SYNC_RESET_LEGACY=1.",
    );
  }

  const ownerOperatorTemplate = templates.find((template) => template.driverType === "owner_operator");
  const companyDriverTemplate = templates.find((template) => template.driverType === "company_driver");
  if (templates.length !== 2 || !ownerOperatorTemplate || !companyDriverTemplate) {
    throw new Error("Refusing workflow synchronization: Franklin must have exactly one owner-operator and one company-driver template.");
  }

  await db.transaction(async (tx) => {
    // Legacy seeded rows are safe to clear only when every row is still pending
    // and no driver has operational progress, an owner, or a handoff. This is a
    // DEV/DEMO template replacement, never a completion-data migration.
    await tx.delete(checklistItemsTable)
      .where(eq(checklistItemsTable.workspaceId, FRANKLIN_WORKSPACE_ID));

    if (!safelyUntouched) {
      // This path is intentionally opt-in and DEV/DEMO-only. It clears a legacy
      // demo's operational state so every imported driver starts the authorized
      // 11-step workflow from Step 1; it is never an automatic production migration.
      await tx.delete(driverOperationalHandoffsTable)
        .where(eq(driverOperationalHandoffsTable.workspaceId, FRANKLIN_WORKSPACE_ID));
      await tx.update(driversTable).set({
        completionPercent: 0,
        operationalOwnerId: null,
        operationalOwnerName: null,
        hardyHandoffAt: null,
      }).where(eq(driversTable.workspaceId, FRANKLIN_WORKSPACE_ID));
    }

    await tx.delete(templateStepsTable)
      .where(eq(templateStepsTable.workspaceId, FRANKLIN_WORKSPACE_ID));

    const templateDetails = [
      { template: ownerOperatorTemplate, name: "Owner Operator Onboarding", driverType: "owner_operator" },
      { template: companyDriverTemplate, name: "Company Driver Onboarding", driverType: "company_driver" },
    ] as const;
    for (const detail of templateDetails) {
      await tx.update(workflowTemplatesTable).set({
        name: detail.name,
        driverType: detail.driverType,
        description: "Franklin's 11-step operational workflow. Steps 1–6 are Mason/Wayne work; Steps 7–11 are Hardy work.",
      }).where(and(
        eq(workflowTemplatesTable.id, detail.template.id),
        eq(workflowTemplatesTable.workspaceId, FRANKLIN_WORKSPACE_ID),
      ));

      await tx.insert(templateStepsTable).values(
        OPERATIONAL_CHECKLIST_TEMPLATE.map((step) => ({
          templateId: detail.template.id,
          workspaceId: FRANKLIN_WORKSPACE_ID,
          sortOrder: step.sortOrder,
          gateKey: step.gateKey,
          label: step.label,
          category: step.gateCategory,
          isMandatory: step.isMandatory,
          appliesTo: step.appliesTo,
        })),
      );
    }
  });

  console.log("Synchronized Franklin DEV/DEMO templates to the 11-step operational workflow.");
}

await syncFranklinOperationalWorkflow();