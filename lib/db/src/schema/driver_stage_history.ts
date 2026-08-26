import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { driversTable } from "./drivers";

/**
 * driver_stage_history — append-only log of every stage transition.
 * Never update rows — only insert. One row per transition.
 *
 * Stage pipeline:
 *   hired → pre_hire → onboarding → dispatch_ready → active
 *   fallout (terminal, reachable from any stage)
 */
export const driverStageHistoryTable = pgTable("driver_stage_history", {
  id:               serial("id").primaryKey(),
  workspaceId:      integer("workspace_id").references(() => workspacesTable.id),
  driverId:         integer("driver_id").notNull().references(() => driversTable.id),

  /** Null only for the very first entry (the hired event) */
  fromStage:        text("from_stage"),
  /** The stage entered by this transition */
  toStage:          text("to_stage").notNull(),

  actorName:        text("actor_name").notNull(),
  actorRole:        text("actor_role").notNull(),

  /**
   * hired_event    — POST /events/hired fired
   * stage_advance  — manual advance via POST /drivers/:id/stage
   * auto_gate      — all mandatory checklist gates passed; auto-advanced
   * dispatch_check — POST /drivers/:id/ready-for-dispatch gate check passed
   * system         — internal/seed
   */
  transitionType:   text("transition_type").notNull(),
  note:             text("note"),

  transitionedAt:   timestamp("transitioned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DriverStageHistory = typeof driverStageHistoryTable.$inferSelect;
