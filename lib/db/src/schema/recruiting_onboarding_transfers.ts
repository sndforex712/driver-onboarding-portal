import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { onboardingCasesTable } from "./onboarding_cases";
import { recruitingCasesTable } from "./recruiting_cases";
import { workspacesTable } from "./workspaces";

export const recruitingOnboardingTransfersTable = pgTable("recruiting_onboarding_transfers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  recruitingCaseId: integer("recruiting_case_id").notNull(),
  transferIdempotencyKey: text("transfer_idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  onboardingCaseId: integer("onboarding_case_id").references(() => onboardingCasesTable.id),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("recruiting_onboarding_transfers_case_uidx").on(table.recruitingCaseId),
  uniqueIndex("recruiting_onboarding_transfers_idempotency_key_uidx").on(table.transferIdempotencyKey),
  uniqueIndex("recruiting_onboarding_transfers_onboarding_case_uidx")
    .on(table.onboardingCaseId)
    .where(sql`${table.onboardingCaseId} IS NOT NULL`),
  foreignKey({
    columns: [table.workspaceId, table.recruitingCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "recruiting_onboarding_transfers_case_workspace_fk",
  }),
  check("recruiting_onboarding_transfers_status_ck", sql`
    (
      ${table.status} = 'pending'
      AND ${table.onboardingCaseId} IS NULL
      AND ${table.completedAt} IS NULL
      AND ${table.failedAt} IS NULL
      AND ${table.failureReason} IS NULL
    )
    OR (
      ${table.status} = 'completed'
      AND ${table.onboardingCaseId} IS NOT NULL
      AND ${table.completedAt} IS NOT NULL
      AND ${table.failedAt} IS NULL
      AND ${table.failureReason} IS NULL
    )
    OR (
      ${table.status} = 'failed'
      AND ${table.onboardingCaseId} IS NULL
      AND ${table.completedAt} IS NULL
      AND ${table.failedAt} IS NOT NULL
      AND ${table.failureReason} IS NOT NULL
      AND btrim(${table.failureReason}) <> ''
    )
  `),
]);

export type RecruitingOnboardingTransfer = typeof recruitingOnboardingTransfersTable.$inferSelect;