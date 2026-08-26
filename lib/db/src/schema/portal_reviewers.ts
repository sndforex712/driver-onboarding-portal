import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * portal_reviewers — who may act on the Driver Portal document review
 * queue (Phase 2). Deliberately separate from app_users (the recruiter
 * app's own demo login) and from Twenty Cloud, which is not connected.
 *
 * role: "hardy" | "recruiter"
 *   - both roles may approve a document
 *   - only "hardy" may reject a document (enforced in application code,
 *     not by a DB constraint, at this schema-only stage)
 *
 * This table holds no credentials — it is a permissions lookup only.
 * Real reviewer authentication is a separate, still-open, blocking
 * requirement (see below) before any reviewer UI is built on top of it.
 */
export const portalReviewersTable = pgTable("portal_reviewers", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  role:      text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("portal_reviewers_name_uidx").on(table.name),
]);

export type PortalReviewer = typeof portalReviewersTable.$inferSelect;
