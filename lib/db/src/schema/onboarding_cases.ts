import {
  foreignKey,
  check,
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspacesTable } from "./workspaces";
import { driversTable } from "./drivers";
import { leadsTable } from "./leads";
import { recruitingCasesTable } from "./recruiting_cases";

/**
 * onboarding_cases — one case per driver, created by the Hired event.
 *
 * The externalRecruitId is the idempotency key: a second Hired event with the
 * same key returns this case without creating a new driver or checklist.
 *
 * Fields that are "preserved":
 *   recruiterName, sourceChannel, initialNotes
 * These are set on first creation and NEVER overwritten, even on replay.
 *
 * Fields that are "merged on replay":
 *   documents  — new docTypes are appended via driver_documents; duplicates skipped
 *   notes      — new text is appended as an activity_entries row
 */
export const onboardingCasesTable = pgTable("onboarding_cases", {
  id:                serial("id").primaryKey(),
  workspaceId:       integer("workspace_id").references(() => workspacesTable.id),

  /** FK to driver — unique: exactly one case per driver */
  driverId:          integer("driver_id").notNull().references(() => driversTable.id),
  leadId:            integer("lead_id").references(() => leadsTable.id),
  /** Nullable until a Recruiting transfer creates this onboarding attempt. */
  recruitingCaseId:  integer("recruiting_case_id"),

  /** Human-readable identifier: CASE-00001. Set after insert. */
  caseNumber:        text("case_number"),

  /**
   * Idempotency key — matches drivers.external_recruit_id.
   * Unique per workspace (enforced by unique constraint + workspace filter in queries).
   */
  externalRecruitId: text("external_recruit_id").notNull(),

  // ── Preserved from the very first Hired event ─────────────────────────────
  recruiterName:    text("recruiter_name").notNull(),
  sourceChannel:    text("source_channel").notNull(),
  /** First notes from the recruiter. Never overwritten — replays append via activity. */
  initialNotes:     text("initial_notes"),

  // ── Assignment / SLA ──────────────────────────────────────────────────────
  assignedSpecialistId: integer("assigned_specialist_id"),
  slaDeadline:      text("sla_deadline"),

  /**
   * Permanent Case Owner — set when the case is first created (Hired event),
   * NEVER changed automatically. A manager PUSH does not modify this field.
   * Represents who owns the entire onboarding case from start to finish.
   */
  caseOwnerId:      integer("case_owner_id"),
  caseOwnerName:    text("case_owner_name"),

  /**
   * Case status — kept in sync with driver stage:
   *   open       → hired stage
   *   onboarding → pre_hire or onboarding stage
   *   completed  → dispatch_ready or active
   *   fallout    → fallout stage
   *   closed     → manually closed
   */
  status:           text("status").notNull().default("open"),

  hiredAt:          timestamp("hired_at",     { withTimezone: true }).notNull().defaultNow(),
  completedAt:      timestamp("completed_at", { withTimezone: true }),

  /** Number of times an idempotent replay was received for this case */
  replayCount:      integer("replay_count").notNull().default(0),
  lastReplayAt:     timestamp("last_replay_at", { withTimezone: true }),

  createdAt:  timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("onboarding_cases_recruiting_case_id_uidx").on(table.recruitingCaseId),
  foreignKey({
    columns: [table.workspaceId, table.recruitingCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "onboarding_cases_recruiting_case_workspace_fk",
  }),
  check(
    "onboarding_cases_recruiting_case_workspace_ck",
    sql`${table.recruitingCaseId} IS NULL OR ${table.workspaceId} IS NOT NULL`,
  ),
]);

export type OnboardingCase = typeof onboardingCasesTable.$inferSelect;
