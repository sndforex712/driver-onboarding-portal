import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { portalReviewersTable } from "./portal_reviewers";

/**
 * portal_documents — files a driver uploads through the Driver Portal
 * (Phase 2). Distinct from driver_documents (documents.ts), which is the
 * recruiter-side document tracker seeded/managed from the recruiting
 * pipeline — this table is specifically the driver-facing upload record.
 *
 * status never advances past "under_review" on its own — only an explicit
 * reviewer action (not yet built) moves it to "approved" or "rejected".
 * A "rejected" document requires rejectionReason so the driver knows what
 * to fix.
 */
export const portalDocumentsTable = pgTable("portal_documents", {
  id:              serial("id").primaryKey(),
  driverId:        integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  documentType:    text("document_type").notNull(),
  storageKey:      text("storage_key").notNull(),
  fileName:        text("file_name").notNull(),
  mimeType:        text("mime_type").notNull(),
  sizeBytes:       integer("size_bytes").notNull(),
  status:          text("status").notNull().default("under_review"),
  rejectionReason: text("rejection_reason"),
  uploadedAt:      timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt:      timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy:      integer("reviewed_by").references(() => portalReviewersTable.id),
});

export type PortalDocument = typeof portalDocumentsTable.$inferSelect;
