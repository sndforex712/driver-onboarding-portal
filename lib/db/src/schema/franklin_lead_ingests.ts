import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";
import { recruitingCasesTable } from "./recruiting_cases";
import { workspacesTable } from "./workspaces";

/**
 * Immutable ledger for server-to-server Franklin new-lead intake.
 *
 * The source payload is retained for audit and replay comparison. Operational
 * fields are projected separately so the Recruiting queue never needs to parse
 * untrusted source JSON.
 */
export const franklinLeadIngestsTable = pgTable("franklin_lead_ingests", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  sourceSystem: text("source_system").notNull(),
  sourceTenant: text("source_tenant").notNull(),
  sourceLeadId: text("source_lead_id").notNull(),
  externalId: text("external_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  requestPayload: jsonb("request_payload").notNull().default(sql`'{}'::jsonb`),

  leadId: integer("lead_id").notNull().references(() => leadsTable.id),
  recruitingCaseId: integer("recruiting_case_id").notNull(),
  driverName: text("driver_name").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  driverType: text("driver_type").notNull(),
  cdlFrontReceived: boolean("cdl_front_received").notNull().default(false),
  cdlBackReceived: boolean("cdl_back_received").notNull().default(false),
  medicalCardReceived: boolean("medical_card_received").notNull().default(false),
  docsReceived: boolean("docs_received").notNull().default(false),
  displayedRecruiter: text("displayed_recruiter").notNull(),
  requestedByAccountId: text("requested_by_account_id").notNull(),
  requestedByFullName: text("requested_by_full_name").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("franklin_lead_ingests_workspace_key_uidx").on(table.workspaceId, table.idempotencyKey),
  uniqueIndex("franklin_lead_ingests_workspace_source_uidx")
    .on(table.workspaceId, table.sourceSystem, table.sourceTenant, table.sourceLeadId),
  uniqueIndex("franklin_lead_ingests_workspace_case_uidx").on(table.workspaceId, table.recruitingCaseId),
  foreignKey({
    columns: [table.workspaceId, table.recruitingCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "franklin_lead_ingests_case_workspace_fk",
  }),
]);

export type FranklinLeadIngest = typeof franklinLeadIngestsTable.$inferSelect;