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

export const checklistItemsTable = pgTable("checklist_items", {
  id:           serial("id").primaryKey(),
  workspaceId:  integer("workspace_id").references(() => workspacesTable.id),
  driverId:     integer("driver_id").notNull(),
  gateKey:      text("gate_key").notNull(),
  label:        text("label").notNull(),
  gateCategory: text("gate_category").notNull(),
  appliesTo:    text("applies_to").notNull().default("both"),
  status:       text("status").notNull().default("pending"),
  isMandatory:  boolean("is_mandatory").notNull().default(true),
  notes:        text("notes"),
  completedAt:  text("completed_at"),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChecklistItemSchema = createInsertSchema(checklistItemsTable).omit({ id: true, createdAt: true });
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
