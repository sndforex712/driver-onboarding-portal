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
import { leadsTable } from "./leads";

export const driversTable = pgTable("drivers", {
  id:                    serial("id").primaryKey(),
  workspaceId:           integer("workspace_id").references(() => workspacesTable.id),
  /** FK to leads — every driver must be linked to exactly one lead */
  leadId:                integer("lead_id").references(() => leadsTable.id),
  fullName:              text("full_name").notNull(),
  phone:                 text("phone"),
  email:                 text("email"),
  state:                 text("state"),
  driverType:            text("driver_type").notNull().default("owner_operator"),
  status:                text("status").notNull().default("pre_hire"),
  stage:                 text("stage").notNull().default("Application"),
  priority:              text("priority").notNull().default("medium"),
  recruiterName:         text("recruiter_name").notNull(),
  sourceChannel:         text("source_channel").notNull(),
  assigneeId:            integer("assignee_id"),
  assigneeName:          text("assignee_name"),
  /** CRM-owned operational owner; recruiterName remains source attribution. */
  operationalOwnerId:     integer("operational_owner_id"),
  operationalOwnerName:   text("operational_owner_name"),
  /** active | waiting | blocked | needs_review — safe operational presentation. */
  operationalStatus:      text("operational_status").notNull().default("active"),
  /** Short controlled reason code, never raw Sheet notes or an address. */
  blockerCode:            text("blocker_code"),
  truckVin:              text("truck_vin"),
  truckInfo:             text("truck_info"),
  telegramGroupLinked:   boolean("telegram_group_linked").notNull().default(false),
  readyForDispatch:      boolean("ready_for_dispatch").notNull().default(false),
  datatruckSyncStatus:   text("datatruck_sync_status"),
  startDate:             text("start_date"),
  slaDeadline:           text("sla_deadline"),
  blockers:              text("blockers"),
  nextBestAction:        text("next_best_action"),
  externalRecruitId:     text("external_recruit_id").unique(),
  complianceGatesPassed: boolean("compliance_gates_passed").notNull().default(false),
  completionPercent:     integer("completion_percent").notNull().default(0),

  // ── Manager Board fields ─────────────────────────────────────────────────────
  /** Year of truck (e.g. "2022") — separate from free-text truckInfo */
  truckYear:             text("truck_year"),
  /** Make of truck (e.g. "Freightliner") */
  truckMake:             text("truck_make"),
  /** ISO timestamp of last recorded contact with driver */
  lastContact:           timestamp("last_contact", { withTimezone: true }),
  /** When the required next action must be completed */
  nextActionDue:         timestamp("next_action_due", { withTimezone: true }),
  /** Set exactly once when Step 6 is completed and ownership moves to Hardy. */
  hardyHandoffAt:        timestamp("hardy_handoff_at", { withTimezone: true }),
  /** True when the hold-up is on the driver or an external party (turns SLA indicator gray) */
  waitingOnExternal:     boolean("waiting_on_external").notNull().default(false),
  /** Total number of manager Push actions ever recorded for this driver */
  pushCount:             integer("push_count").notNull().default(0),

  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
