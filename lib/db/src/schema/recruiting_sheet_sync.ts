import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspacesTable } from "./workspaces";
import { recruitingCasesTable } from "./recruiting_cases";

export const recruitingSheetSyncRunsTable = pgTable("recruiting_sheet_sync_runs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  workbookId: text("workbook_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  rowsFetched: integer("rows_fetched").notNull().default(0),
  rowsCreated: integer("rows_created").notNull().default(0),
  rowsUpdated: integer("rows_updated").notNull().default(0),
  rowsUnchanged: integer("rows_unchanged").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  rowsConflicted: integer("rows_conflicted").notNull().default(0),
  rowsMissing: integer("rows_missing").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorMessage: text("error_message"),
  sourceFingerprint: text("source_fingerprint"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("recruiting_sheet_sync_runs_status_ck", sql`${table.status} IN ('running', 'succeeded', 'failed', 'busy')`),
]);

export const recruitingSheetRowsTable = pgTable("recruiting_sheet_rows", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  workbookId: text("workbook_id").notNull(),
  tabName: text("tab_name").notNull(),
  rowNumber: integer("row_number").notNull(),
  externalRowIdentity: text("external_row_identity").notNull(),
  normalizedPhone: text("normalized_phone"),
  rawFingerprint: text("raw_fingerprint").notNull(),
  sourceStatus: text("source_status").notNull().default("active"),
  readinessText: text("readiness_text"),
  name: text("name"),
  phoneRaw: text("phone_raw"),
  truckYearMake: text("truck_year_make"),
  driverType: text("driver_type"),
  legacyNote: text("legacy_note"),
  recruiterDisplayName: text("recruiter_display_name"),
  sourceText: text("source_text"),
  application: text("application"),
  clearingHouse: text("clearing_house"),
  drugTest: text("drug_test"),
  plateNumber: text("plate_number"),
  tg: text("tg"),
  title: text("title"),
  annInsp: text("ann_insp"),
  twoTwentyNine: text("two_twenty_nine"),
  contract: text("contract"),
  medCard: text("med_card"),
  trackingNumber: text("tracking_number"),
  email: text("email"),
  address: text("address"),
  rawPayload: jsonb("raw_payload").notNull(),
  mappedCaseId: integer("mapped_case_id"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  missingSince: timestamp("missing_since", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("recruiting_sheet_rows_workspace_identity_uidx")
    .on(table.workspaceId, table.workbookId, table.externalRowIdentity),
  uniqueIndex("recruiting_sheet_rows_workspace_fingerprint_uidx")
    .on(table.workspaceId, table.workbookId, table.tabName, table.rowNumber),
  foreignKey({
    columns: [table.workspaceId, table.mappedCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "recruiting_sheet_rows_case_workspace_fk",
  }),
  check("recruiting_sheet_rows_status_ck", sql`${table.sourceStatus} IN ('active', 'missing', 'conflict', 'skipped', 'historical')`),
]);

export type RecruitingSheetSyncRun = typeof recruitingSheetSyncRunsTable.$inferSelect;
export type RecruitingSheetRow = typeof recruitingSheetRowsTable.$inferSelect;