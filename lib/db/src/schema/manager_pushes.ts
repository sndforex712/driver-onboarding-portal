import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { driversTable } from "./drivers";

/**
 * manager_pushes — append-only audit log for manager Push actions.
 *
 * A Push is a manager-initiated acceleration/escalation that:
 *  - Records the reason, required next action, current Task Owner, and due time
 *  - Increments drivers.push_count
 *  - Logs an activity_entries row
 *  - NEVER changes the Case Owner on onboarding_cases
 *
 * Rows in this table are immutable after insert.
 */
export const managerPushesTable = pgTable("manager_pushes", {
  id:            serial("id").primaryKey(),
  workspaceId:   integer("workspace_id").references(() => workspacesTable.id),
  driverId:      integer("driver_id").notNull().references(() => driversTable.id),

  /** User who triggered the push */
  actorId:       integer("actor_id").notNull(),
  actorName:     text("actor_name").notNull(),
  actorRole:     text("actor_role").notNull(),

  /** Required: why the push was needed */
  reason:        text("reason").notNull(),

  /** Required: what must happen next */
  nextAction:    text("next_action").notNull(),

  /** Who is responsible for the next action at push time (simple label, not a FK) */
  taskOwnerName: text("task_owner_name").notNull(),

  /** When the next action must be completed */
  dueTime:       timestamp("due_time", { withTimezone: true }).notNull(),

  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ManagerPush = typeof managerPushesTable.$inferSelect;
