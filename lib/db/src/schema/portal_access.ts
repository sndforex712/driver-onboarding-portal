import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";

/**
 * portal_access — secure Driver Portal links (Phase 2).
 *
 * Only a hash of the token is stored, mirroring app_sessions — the raw
 * token exists only in the link sent to the driver and is never persisted
 * or queryable back out of the database.
 *
 * expiresAt is recalculated on every successful access (30-day inactivity
 * window, not 30 days from issue). revokedAt overrides expiresAt
 * immediately when set — used to kill a link before it would otherwise
 * expire (wrong person reached, lost phone, etc).
 */
export const portalAccessTable = pgTable("portal_access", {
  id:             serial("id").primaryKey(),
  driverId:       integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  tokenHash:      text("token_hash").notNull(),
  issuedAt:       timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  revokedAt:      timestamp("revoked_at", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("portal_access_token_hash_uidx").on(table.tokenHash),
  index("portal_access_driver_idx").on(table.driverId),
]);

export type PortalAccess = typeof portalAccessTable.$inferSelect;
