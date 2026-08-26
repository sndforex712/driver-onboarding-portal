import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { workflowTemplatesTable, templateStepsTable } from "@workspace/db";
import { GetWorkflowTemplateParams } from "@workspace/api-zod";
import { withAuth } from "../lib/authorize";
import { badRequest, notFound } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/workflow-templates", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const templates = await db.select().from(workflowTemplatesTable)
      .where(eq(workflowTemplatesTable.workspaceId, auth.workspaceId))
      .orderBy(workflowTemplatesTable.createdAt);

    const allSteps = await db.select().from(templateStepsTable)
      .where(eq(templateStepsTable.workspaceId, auth.workspaceId))
      .orderBy(templateStepsTable.sortOrder);

    res.json(templates.map((t) => ({
      ...t,
      steps: allSteps.filter((s) => s.templateId === t.id).map((s) => ({
        sortOrder: s.sortOrder, gateKey: s.gateKey, label: s.label,
        category: s.category, isMandatory: s.isMandatory, appliesTo: s.appliesTo, description: s.description,
      })),
    })));
  });
});

router.get("/workflow-templates/:id", async (req, res): Promise<void> => {
  await withAuth(req, res, "view_drivers", async (auth) => {
    const params = GetWorkflowTemplateParams.safeParse(req.params);
    if (!params.success) { badRequest(res, params.error.message); return; }

    const [template] = await db.select().from(workflowTemplatesTable)
      .where(and(eq(workflowTemplatesTable.id, params.data.id), eq(workflowTemplatesTable.workspaceId, auth.workspaceId)));
    if (!template) { notFound(res, "Template not found"); return; }

    const steps = await db.select().from(templateStepsTable)
      .where(and(eq(templateStepsTable.templateId, params.data.id), eq(templateStepsTable.workspaceId, auth.workspaceId)))
      .orderBy(templateStepsTable.sortOrder);

    res.json({
      ...template,
      steps: steps.map((s) => ({
        sortOrder: s.sortOrder, gateKey: s.gateKey, label: s.label,
        category: s.category, isMandatory: s.isMandatory, appliesTo: s.appliesTo, description: s.description,
      })),
    });
  });
});

export default router;
