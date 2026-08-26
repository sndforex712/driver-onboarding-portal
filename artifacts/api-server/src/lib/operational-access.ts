export function hasManagerWideOperationalAccessForRole(workspaceRole: string): boolean {
  return workspaceRole === "owner_admin" || workspaceRole === "manager";
}

export function mayAccessOperationalOwner(
  workspaceRole: string,
  userId: number,
  operationalOwnerId: number | null,
): boolean {
  return hasManagerWideOperationalAccessForRole(workspaceRole) || operationalOwnerId === userId;
}

export function mayUpdateOperationalGate(
  workspaceRole: string,
  userId: number,
  driverOperationalOwnerId: number | null,
  gateOperationalOwnerId: number | null,
): boolean {
  if (hasManagerWideOperationalAccessForRole(workspaceRole)) return true;
  return driverOperationalOwnerId === userId && gateOperationalOwnerId === userId;
}