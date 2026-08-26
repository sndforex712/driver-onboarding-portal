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

export const onboardingTasksTable = pgTable("onboarding_tasks", {
  id:           serial("id").primaryKey(),
  workspaceId:  integer("workspace_id").references(() => workspacesTable.id),
  driverId:     integer("driver_id").notNull(),
  title:        text("title").notNull(),
  description:  text("description"),
  taskType:     text("task_type").notNull().default("admin"),
  status:       text("status").notNull().default("pending"),
  priority:     text("priority").notNull().default("medium"),
  assigneeId:   integer("assignee_id"),
  assigneeName: text("assignee_name"),
  dueDate:      text("due_date"),
  completedAt:  text("completed_at"),
  isMandatory:  boolean("is_mandatory").notNull().default(false),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(onboardingTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type OnboardingTask = typeof onboardingTasksTable.$inferSelect;
