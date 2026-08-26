import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";

/**
 * leads — one lead per person of interest, created before or at the hired event.
 * Every driver must be linked to exactly one lead via drivers.lead_id.
 * Duplicate detection runs on phone_normalized (exact) and full_name+state (fuzzy).
 */
export const leadsTable = pgTable("leads", {
  id:               serial("id").primaryKey(),
  workspaceId:      integer("workspace_id").references(() => workspacesTable.id),

  // ── Identity ───────────────────────────────────────────────────────────────
  fullName:         text("full_name").notNull(),
  phoneRaw:         text("phone_raw"),
  /** Last 10 digits of phone — used for exact duplicate detection */
  phoneNormalized:  text("phone_normalized"),
  email:            text("email"),
  state:            text("state"),

  // ── Source ─────────────────────────────────────────────────────────────────
  recruiterName:    text("recruiter_name").notNull(),
  sourceChannel:    text("source_channel").notNull(),
  /** Matches drivers.external_recruit_id — used to de-dup hired events */
  externalRecruitId: text("external_recruit_id"),

  // ── Status ─────────────────────────────────────────────────────────────────
  /** pending | hired | disqualified | merged */
  status:           text("status").notNull().default("pending"),

  // ── Duplicate tracking ─────────────────────────────────────────────────────
  isDuplicate:           boolean("is_duplicate").notNull().default(false),
  /** exact_phone | fuzzy_name_location | fuzzy_name */
  duplicateConfidence:   text("duplicate_confidence"),
  /** The lead this one may be a duplicate of (nullable self-ref) */
  duplicateOfLeadId:     integer("duplicate_of_lead_id"),

  // ── Merge tracking (set on the lead that was merged AWAY) ─────────────────
  mergedIntoLeadId:  integer("merged_into_lead_id"),
  mergedAt:          timestamp("merged_at", { withTimezone: true }),
  mergedByUserId:    integer("merged_by_user_id"),

  notes:      text("notes"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Lead = typeof leadsTable.$inferSelect;
