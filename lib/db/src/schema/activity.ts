import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const activityEntriesTable = pgTable("activity_entries", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspacesTable.id),
  driverId:    integer("driver_id").notNull(),
  actorName:   text("actor_name").notNull(),
  actorRole:   text("actor_role"),
  action:      text("action").notNull(),
  detail:      text("detail"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activityEntriesTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type ActivityEntry = typeof activityEntriesTable.$inferSelect;
