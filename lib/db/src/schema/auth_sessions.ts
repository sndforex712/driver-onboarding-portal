import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { appUsersTable } from "./users";

/**
 * Opaque server-side sessions for the DEV/DEMO portal. Only a hash of the
 * browser token is persisted, so a database read cannot be replayed as a login.
 */
export const appSessionsTable = pgTable("app_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("app_sessions_token_hash_uidx").on(table.tokenHash),
  index("app_sessions_user_idx").on(table.userId),
]);

export type AppSession = typeof appSessionsTable.$inferSelect;