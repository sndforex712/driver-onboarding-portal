/**
 * Role and capability definitions for Franklins OS.
 *
 * Six roles with independent per-workspace authorization:
 *   owner_admin       — full control of workspace, users, settings
 *   manager           — operational control; no workspace/billing management
 *   recruiter         — can view drivers and fire hired events only
 *   onboarding_specialist — full onboarding workflow, no settings
 *   compliance_reviewer   — view drivers + manage documents/checklists
 *   dispatcher_readonly   — view drivers + trigger dispatch/sync
 *
 * Authorization is enforced by authorize() in lib/authorize.ts — NOT by
 * Express middleware. Every route handler calls authorize() independently.
 */

export { ROLE_CAPABILITIES } from "./role-capabilities";
export type { AppRole, Capability } from "./role-capabilities";
import { ROLE_CAPABILITIES, type AppRole, type Capability } from "./role-capabilities";

// ─── Legacy middleware shims ───────────────────────────────────────────────────
// Kept for routes that haven't been migrated yet.
// New routes must use authorize() from lib/authorize.ts directly.

import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { appUsersTable, workspacesTable, workspaceMembershipsTable } from "@workspace/db";

export async function attachCurrentUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [user] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.isCurrentSession, "true"));
    if (!user) {
      res.status(401).json({ error: "No active session user." });
      return;
    }
    (req as any).currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [user] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.isCurrentSession, "true"));
    if (!user) {
      res.status(401).json({ error: "No active session user." });
      return;
    }
    (req as any).currentUser = user;

    const slug = (req.headers["x-workspace-slug"] as string | undefined)?.trim().toLowerCase();
    const memberships = await db
      .select({
        workspaceId:   workspacesTable.id,
        workspaceSlug: workspacesTable.slug,
        workspaceRole: workspaceMembershipsTable.role,
      })
      .from(workspaceMembershipsTable)
      .innerJoin(workspacesTable, eq(workspaceMembershipsTable.workspaceId, workspacesTable.id))
      .where(eq(workspaceMembershipsTable.userId, user.id));

    if (memberships.length === 0) {
      res.status(403).json({ error: "User has no workspace memberships." });
      return;
    }

    let ws = slug ? memberships.find((m) => m.workspaceSlug === slug) : memberships[0];
    if (!ws) {
      res.status(403).json({ error: `Not a member of workspace '${slug}'.` });
      return;
    }

    (req as any).workspaceId   = ws.workspaceId;
    (req as any).workspaceSlug = ws.workspaceSlug;
    (req as any).workspaceRole = ws.workspaceRole;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireCapability(capability: Capability) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).currentUser;
    const role = ((req as any).workspaceRole ?? user?.role) as AppRole;
    const allowed = ROLE_CAPABILITIES[role];
    if (!allowed || !allowed.includes(capability)) {
      res.status(403).json({
        error: `Role '${role}' does not have permission: ${capability}`,
        requiredCapability: capability,
        workspaceRole: role,
      });
      return;
    }
    next();
  };
}
