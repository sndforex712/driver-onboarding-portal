import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const driverDocumentsTable = pgTable("driver_documents", {
  id:               serial("id").primaryKey(),
  workspaceId:      integer("workspace_id").references(() => workspacesTable.id),
  driverId:         integer("driver_id"),
  twentyCandidateId:text("twenty_candidate_id"),
  stepKey:          text("step_key"),
  requirementKey:   text("requirement_key"),
  docType:          text("doc_type").notNull(),
  docName:          text("doc_name").notNull(),
  status:           text("status").notNull().default("pending"),
  storageKey:       text("storage_key"),
  mimeType:         text("mime_type"),
  sizeBytes:        integer("size_bytes"),
  expiryDate:       text("expiry_date"),
  notes:            text("notes"),
  rejectionReason:  text("rejection_reason"),
  uploadedAt:       text("uploaded_at"),
  uploadedByUserId: integer("uploaded_by_user_id"),
  uploadedByName:   text("uploaded_by_name"),
  reviewedAt:       timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedByName:   text("reviewed_by_name"),
  verifiedAt:       text("verified_at"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("driver_documents_workspace_candidate_step_idx").on(
    table.workspaceId,
    table.twentyCandidateId,
    table.stepKey,
  ),
  index("driver_documents_workspace_requirement_idx").on(
    table.workspaceId,
    table.requirementKey,
  ),
  uniqueIndex("driver_documents_storage_key_uidx").on(table.storageKey),
]);

export const twentyDocumentRequirementsTable = pgTable("twenty_document_requirements", {
  id:                     serial("id").primaryKey(),
  workspaceId:            integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  stepKey:                text("step_key").notNull(),
  requirementKey:         text("requirement_key").notNull(),
  label:                  text("label").notNull(),
  isMandatory:            boolean("is_mandatory").notNull().default(true),
  allowsManualCompletion: boolean("allows_manual_completion").notNull().default(false),
  sortOrder:              integer("sort_order").notNull().default(0),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("twenty_document_requirements_workspace_step_requirement_uidx").on(
    table.workspaceId,
    table.stepKey,
    table.requirementKey,
  ),
  index("twenty_document_requirements_workspace_step_idx").on(table.workspaceId, table.stepKey),
]);

export const twentyStepAdvancementAttemptsTable = pgTable("twenty_step_advancement_attempts", {
  id:             serial("id").primaryKey(),
  workspaceId:    integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  candidateId:    text("candidate_id").notNull(),
  fromStepKey:    text("from_step_key").notNull(),
  toStepKey:      text("to_step_key"),
  idempotencyKey: text("idempotency_key").notNull(),
  status:         text("status").notNull().default("started"),
  errorMessage:   text("error_message"),
  actorUserId:    integer("actor_user_id"),
  actorName:      text("actor_name"),
  actorRole:      text("actor_role"),
  completedAt:    timestamp("completed_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("twenty_step_advancement_attempts_transition_uidx").on(
    table.workspaceId,
    table.candidateId,
    table.fromStepKey,
  ),
  uniqueIndex("twenty_step_advancement_attempts_idempotency_uidx").on(table.idempotencyKey),
]);

export const insertDocumentSchema = createInsertSchema(driverDocumentsTable).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DriverDocument = typeof driverDocumentsTable.$inferSelect;
