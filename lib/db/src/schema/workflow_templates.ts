import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const workflowTemplatesTable = pgTable("workflow_templates", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspacesTable.id),
  name:        text("name").notNull(),
  driverType:  text("driver_type").notNull(),
  description: text("description").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templateStepsTable = pgTable("template_steps", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspacesTable.id),
  templateId:  integer("template_id").notNull(),
  sortOrder:   integer("sort_order").notNull().default(0),
  gateKey:     text("gate_key").notNull(),
  label:       text("label").notNull(),
  category:    text("category").notNull(),
  isMandatory: boolean("is_mandatory").notNull().default(true),
  appliesTo:   text("applies_to").notNull().default("both"),
  description: text("description"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(workflowTemplatesTable).omit({ id: true, createdAt: true });
export const insertTemplateStepSchema = createInsertSchema(templateStepsTable).omit({ id: true, createdAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type InsertTemplateStep = z.infer<typeof insertTemplateStepSchema>;
export type WorkflowTemplate = typeof workflowTemplatesTable.$inferSelect;
export type TemplateStep = typeof templateStepsTable.$inferSelect;
