import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./users";

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspacesTable = pgTable("workspaces", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  /** active | coming_soon | archived */
  status:      text("status").notNull().default("active"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspacesTable.$inferSelect;

// ─── Workspace memberships ────────────────────────────────────────────────────

export const workspaceMembershipsTable = pgTable("workspace_memberships", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  userId:      integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  /** Per-workspace role — overrides app_users.role within this workspace context */
  role:        text("role").notNull(),
  joinedAt:    timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workspace_memberships_workspace_user_uidx").on(t.workspaceId, t.userId),
]);

export const insertWorkspaceMembershipSchema = createInsertSchema(workspaceMembershipsTable).omit({ id: true, joinedAt: true });
export type InsertWorkspaceMembership = z.infer<typeof insertWorkspaceMembershipSchema>;
export type WorkspaceMembership = typeof workspaceMembershipsTable.$inferSelect;
