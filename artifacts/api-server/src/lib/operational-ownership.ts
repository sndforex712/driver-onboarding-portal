import { eq } from "drizzle-orm";
import { appUsersTable, db, workspaceMembershipsTable } from "@workspace/db";
import type { AuthContext } from "./authorize";
import { operationalOwnerNameForStep } from "./driver-operational-projection";
import {
  hasManagerWideOperationalAccessForRole,
  mayAccessOperationalOwner,
  mayUpdateOperationalGate,
} from "./operational-access";

export type OperationalOwner = { id: number; name: "Hardy" | "Mason" | "Wayne" };

export async function operationalOwnersForWorkspace(workspaceId: number): Promise<Map<string, OperationalOwner>> {
  const members = await db.select({
    id: appUsersTable.id,
    name: appUsersTable.name,
  })
    .from(workspaceMembershipsTable)
    .innerJoin(appUsersTable, eq(workspaceMembershipsTable.userId, appUsersTable.id))
    .where(eq(workspaceMembershipsTable.workspaceId, workspaceId));

  const expected = new Set(["hardy", "mason", "wayne"]);
  const owners = new Map<string, OperationalOwner>();
  for (const member of members) {
    const normalized = member.name.trim().toLowerCase();
    if (expected.has(normalized)) {
      owners.set(normalized, { id: member.id, name: member.name as OperationalOwner["name"] });
    }
  }
  return owners;
}

export function ownerForOperationalStep(
  owners: Map<string, OperationalOwner>,
  stepNumber: number,
  driverId: number,
): OperationalOwner | null {
  return owners.get(operationalOwnerNameForStep(stepNumber, driverId).toLowerCase()) ?? null;
}

export function hasManagerWideOperationalAccess(auth: AuthContext): boolean {
  return hasManagerWideOperationalAccessForRole(auth.workspaceRole);
}

export function mayAccessOperationalDriver(auth: AuthContext, operationalOwnerId: number | null): boolean {
  return mayAccessOperationalOwner(auth.workspaceRole, auth.userId, operationalOwnerId);
}

export function mayUpdateOperationalDriverGate(
  auth: AuthContext,
  driverOperationalOwnerId: number | null,
  gateOperationalOwnerId: number | null,
): boolean {
  return mayUpdateOperationalGate(
    auth.workspaceRole,
    auth.userId,
    driverOperationalOwnerId,
    gateOperationalOwnerId,
  );
}