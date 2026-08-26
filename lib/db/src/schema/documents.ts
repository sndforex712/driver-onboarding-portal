import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

export const driverDocumentsTable = pgTable("driver_documents", {
  id:          serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspacesTable.id),
  driverId:    integer("driver_id").notNull(),
  docType:     text("doc_type").notNull(),
  docName:     text("doc_name").notNull(),
  status:      text("status").notNull().default("pending"),
  expiryDate:  text("expiry_date"),
  notes:       text("notes"),
  uploadedAt:  text("uploaded_at"),
  verifiedAt:  text("verified_at"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(driverDocumentsTable).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DriverDocument = typeof driverDocumentsTable.$inferSelect;
