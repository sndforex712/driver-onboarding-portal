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

export const commentsTable = pgTable("comments", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspacesTable.id),
  driverId:    integer("driver_id").notNull(),
  authorName:  text("author_name").notNull(),
  authorRole:  text("author_role"),
  body:        text("body").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommentSchema = createInsertSchema(commentsTable).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof commentsTable.$inferSelect;
