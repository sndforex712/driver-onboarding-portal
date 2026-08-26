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

export const datatruckSyncsTable = pgTable("datatruck_syncs", {
  id:            serial("id").primaryKey(),
  workspaceId:   integer("workspace_id").references(() => workspacesTable.id),
  driverId:      integer("driver_id").notNull(),
  syncStatus:    text("sync_status").notNull().default("pending"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  errorMessage:  text("error_message"),
  syncedAt:      text("synced_at"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDatatruckSyncSchema = createInsertSchema(datatruckSyncsTable).omit({ id: true, createdAt: true });
export type InsertDatatruckSync = z.infer<typeof insertDatatruckSyncSchema>;
export type DatatruckSync = typeof datatruckSyncsTable.$inferSelect;
