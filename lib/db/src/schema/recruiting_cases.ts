import { sql } from "drizzle-orm";
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
import { driversTable } from "./drivers";
import { leadsTable } from "./leads";
import { workspaceMembershipsTable, workspacesTable } from "./workspaces";

export const recruitingCasesTable = pgTable("recruiting_cases", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  // Franklin server-to-server intake creates a Recruiting candidate before an
  // Onboarding driver exists. Established cases retain their linked driver.
  driverId: integer("driver_id").references(() => driversTable.id),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id),

  caseNumber: text("case_number").notNull(),
  sourceId: text("source_id"),
  stage: text("stage").notNull().default("new_lead"),
  lifecycle: text("lifecycle").notNull().default("active"),

  caseOwnerId: integer("case_owner_id").notNull(),
  taskOwnerId: integer("task_owner_id"),
  nextAction: text("next_action"),
  nextActionDueAt: timestamp("next_action_due_at", { withTimezone: true }),
  slaDeadlineAt: timestamp("sla_deadline_at", { withTimezone: true }),

  followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
  resumeStage: text("resume_stage"),
  closedLostReason: text("closed_lost_reason"),
  closedLostNote: text("closed_lost_note"),

  version: integer("version").notNull().default(1),
  transferStatus: text("transfer_status").notNull().default("not_requested"),
  transferRequestedAt: timestamp("transfer_requested_at", { withTimezone: true }),
  transferredAt: timestamp("transferred_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("recruiting_cases_workspace_case_number_uidx").on(table.workspaceId, table.caseNumber),
  uniqueIndex("recruiting_cases_workspace_source_id_uidx").on(table.workspaceId, table.sourceId),
  uniqueIndex("recruiting_cases_workspace_id_uidx").on(table.workspaceId, table.id),
  uniqueIndex("recruiting_cases_one_active_per_driver_workspace_uidx")
    .on(table.workspaceId, table.driverId)
    .where(sql`${table.lifecycle} = 'active'`),
  foreignKey({
    columns: [table.workspaceId, table.caseOwnerId],
    foreignColumns: [workspaceMembershipsTable.workspaceId, workspaceMembershipsTable.userId],
    name: "recruiting_cases_case_owner_membership_fk",
  }),
  foreignKey({
    columns: [table.workspaceId, table.taskOwnerId],
    foreignColumns: [workspaceMembershipsTable.workspaceId, workspaceMembershipsTable.userId],
    name: "recruiting_cases_task_owner_membership_fk",
  }),
  check("recruiting_cases_stage_ck", sql`
    ${table.stage} IN (
      'new_lead', 'contact_attempted', 'connected_prequalified', 'application_sent',
      'application_received', 'manager_review', 'clearinghouse_pending',
      'drug_test_scheduled', 'drug_test_passed', 'compliance_documents_pending',
      'contract_sent', 'contract_signed', 'ready_for_onboarding',
      'hired_transferred_to_onboarding', 'future_follow_up', 'closed_lost'
    )
  `),
  check("recruiting_cases_stage_lifecycle_ck", sql`
    (
      (${table.lifecycle} = 'active' AND ${table.stage} NOT IN ('hired_transferred_to_onboarding', 'closed_lost'))
      OR (${table.lifecycle} = 'hired_transferred' AND ${table.stage} = 'hired_transferred_to_onboarding')
      OR (${table.lifecycle} = 'closed_lost' AND ${table.stage} = 'closed_lost')
    )
  `),
  check("recruiting_cases_active_fields_ck", sql`
    ${table.lifecycle} <> 'active' OR (
      ${table.taskOwnerId} IS NOT NULL
      AND ${table.nextAction} IS NOT NULL
      AND btrim(${table.nextAction}) <> ''
      AND ${table.nextActionDueAt} IS NOT NULL
      AND ${table.slaDeadlineAt} IS NOT NULL
    )
  `),
  check("recruiting_cases_follow_up_fields_ck", sql`
    (
      ${table.stage} = 'future_follow_up'
      AND ${table.followUpDueAt} IS NOT NULL
      AND ${table.resumeStage} IN (
        'new_lead', 'contact_attempted', 'connected_prequalified', 'application_sent',
        'application_received', 'manager_review', 'clearinghouse_pending',
        'drug_test_scheduled', 'drug_test_passed', 'compliance_documents_pending',
        'contract_sent', 'contract_signed', 'ready_for_onboarding'
      )
    )
    OR (
      ${table.stage} <> 'future_follow_up'
      AND ${table.followUpDueAt} IS NULL
      AND ${table.resumeStage} IS NULL
    )
  `),
  check("recruiting_cases_closed_lost_fields_ck", sql`
    (
      ${table.stage} = 'closed_lost'
      AND ${table.closedLostReason} IN (
        'qualification_not_met', 'clearinghouse_issue', 'drug_test_issue',
        'compliance_document_issue', 'contract_declined', 'compensation_or_role_mismatch',
        'withdrew', 'no_response', 'duplicate_or_merged', 'other'
      )
      AND (
        ${table.closedLostReason} <> 'other'
        OR (${table.closedLostNote} IS NOT NULL AND btrim(${table.closedLostNote}) <> '')
      )
    )
    OR (
      ${table.stage} <> 'closed_lost'
      AND ${table.closedLostReason} IS NULL
      AND ${table.closedLostNote} IS NULL
    )
  `),
  check("recruiting_cases_version_ck", sql`${table.version} >= 1`),
  check("recruiting_cases_transfer_fields_ck", sql`
    (
      ${table.transferStatus} = 'not_requested'
      AND ${table.transferRequestedAt} IS NULL
      AND ${table.transferredAt} IS NULL
    )
    OR (
      ${table.transferStatus} = 'pending'
      AND ${table.transferRequestedAt} IS NOT NULL
      AND ${table.transferredAt} IS NULL
    )
    OR (
      ${table.transferStatus} = 'completed'
      AND ${table.transferRequestedAt} IS NOT NULL
      AND ${table.transferredAt} IS NOT NULL
    )
    OR (
      ${table.transferStatus} = 'failed'
      AND ${table.transferRequestedAt} IS NOT NULL
      AND ${table.transferredAt} IS NULL
    )
  `),
]);

export const recruitingCaseEventsTable = pgTable("recruiting_case_events", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  recruitingCaseId: integer("recruiting_case_id").notNull(),
  transitionIdempotencyKey: text("transition_idempotency_key").notNull(),
  eventType: text("event_type").notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  actorUserId: integer("actor_user_id"),
  caseVersion: integer("case_version").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("recruiting_case_events_transition_key_uidx").on(table.transitionIdempotencyKey),
  foreignKey({
    columns: [table.workspaceId, table.recruitingCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "recruiting_case_events_case_workspace_fk",
  }),
  check("recruiting_case_events_version_ck", sql`${table.caseVersion} >= 1`),
]);

export const recruitingTransitionEffectsTable = pgTable("recruiting_transition_effects", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id),
  recruitingCaseId: integer("recruiting_case_id").notNull(),
  transitionIdempotencyKey: text("transition_idempotency_key").notNull(),
  effectKind: text("effect_kind").notNull(),
  effectIdempotencyKey: text("effect_idempotency_key").notNull(),
  status: text("status").notNull().default("planned"),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("recruiting_transition_effects_effect_key_uidx").on(table.effectIdempotencyKey),
  uniqueIndex("recruiting_transition_effects_transition_kind_uidx")
    .on(table.recruitingCaseId, table.transitionIdempotencyKey, table.effectKind),
  foreignKey({
    columns: [table.workspaceId, table.recruitingCaseId],
    foreignColumns: [recruitingCasesTable.workspaceId, recruitingCasesTable.id],
    name: "recruiting_transition_effects_case_workspace_fk",
  }),
  check(
    "recruiting_transition_effects_kind_ck",
    sql`${table.effectKind} IN ('stage_transition', 'manager_review_task', 'onboarding_transfer')`,
  ),
  check(
    "recruiting_transition_effects_status_ck",
    sql`${table.status} IN ('planned', 'applied', 'failed')`,
  ),
]);

export type RecruitingCase = typeof recruitingCasesTable.$inferSelect;
export type RecruitingCaseEvent = typeof recruitingCaseEventsTable.$inferSelect;
export type RecruitingTransitionEffect = typeof recruitingTransitionEffectsTable.$inferSelect;