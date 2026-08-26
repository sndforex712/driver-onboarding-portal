import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { driversTable } from "./drivers";
import { appUsersTable } from "./users";

/**
 * Append-only, one-per-driver ledger for the Step 6 handoff to Hardy.
 * The unique workspace/driver constraint provides the exact-once guarantee.
 */
export const driverOperationalHandoffsTable = pgTable("driver_operational_handoffs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  fromOwnerId: integer("from_owner_id"),
  fromOwnerName: text("from_owner_name"),
  toOwnerId: integer("to_owner_id").notNull().references(() => appUsersTable.id),
  toOwnerName: text("to_owner_name").notNull(),
  completedByUserId: integer("completed_by_user_id").notNull().references(() => appUsersTable.id),
  idempotencyKey: text("idempotency_key").notNull(),
  handedOffAt: timestamp("handed_off_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("driver_operational_handoffs_workspace_driver_uidx").on(table.workspaceId, table.driverId),
  uniqueIndex("driver_operational_handoffs_idempotency_uidx").on(table.idempotencyKey),
]);

export type DriverOperationalHandoff = typeof driverOperationalHandoffsTable.$inferSelect;