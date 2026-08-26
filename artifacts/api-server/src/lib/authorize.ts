/**
 * Default-deny authorization for Franklins OS API.
 *
 * Architecture principles:
 *  1. INDEPENDENT — authorize() is called explicitly in every route handler.
 *     It never relies on req.currentUser, req.workspaceId, or any middleware
 *     having run before it. Forgetting middleware cannot open a data leak.
 *  2. DEFAULT-DENY — any missing session, membership, or capability throws
 *     AuthorizationError. The caller must prove access; absence → 401/403.
 *  3. WORKSPACE-DERIVED — workspaceId is always read from DB after validating
 *     the user's membership. A client-supplied workspaceId in the body is
 *     structurally ignored; the X-Workspace-Slug header is just a routing hint,
 *     validated server-side before use.
 *  4. ROW-LEVEL — every DB query uses auth.workspaceId from the AuthContext
 *     returned by authorize(). There is no other source of workspace scope.
 */

import { Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { appSessionsTable, appUsersTable, workspacesTable, workspaceMembershipsTable } from "@workspace/db";
import { ROLE_CAPABILITIES, type AppRole, type Capability } from "./role-guard";
import type { ErrorCode } from "./api-errors";
import { hashSessionToken, SESSION_COOKIE_NAME } from "./session-security";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthContext {
  /** Database ID of the authenticated session user */
  userId: number;
  userName: string;
  /** Global role from app_users — informational only; use workspaceRole for decisions */
  globalRole: string;
  /** Server-derived workspace ID — always from DB, never from client */
  workspaceId: number;
  workspaceSlug: string;
  /** Effective role in this workspace — used for all capability checks */
  workspaceRole: AppRole;
}

// ─── AuthorizationError ───────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthorizationError";
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }

  toJSON(): Record<string, unknown> {
    const code: ErrorCode = this.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
    return { code, message: this.message, retryable: false, ...(this.extra ?? {}) };
  }
}

// ─── authorize() — workspace-scoped ──────────────────────────────────────────

/**
 * Core default-deny authorization gate.
 *
 * Makes two fresh DB queries on every call:
 *   1. Session user from a signed-in opaque cookie and app_sessions
 *   2. Workspace memberships joined with workspaces (validates slug + capability)
 *
 * Returns AuthContext on success. Throws AuthorizationError on any failure.
 * Never reads req.currentUser, req.workspaceId, or any prior middleware state.
 */
export async function authorize(
  req: Request,
  capability: Capability,
): Promise<AuthContext> {
  // ── 1. Session user ─────────────────────────────────────────────────────────
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string" || !token) {
    throw new AuthorizationError(401, "Sign in to continue.");
  }
  const [session] = await db
    .select({ user: appUsersTable })
    .from(appSessionsTable)
    .innerJoin(appUsersTable, eq(appSessionsTable.userId, appUsersTable.id))
    .where(and(
      eq(appSessionsTable.tokenHash, hashSessionToken(token)),
      isNull(appSessionsTable.revokedAt),
      gt(appSessionsTable.expiresAt, new Date()),
    ));
  const user = session?.user;

  if (!user) {
    throw new AuthorizationError(401, "Your session is expired or invalid. Sign in again.");
  }

  // ── 2. Workspace membership (server-derived, never from body/params) ────────
  const requestedSlug = (req.headers["x-workspace-slug"] as string | undefined)
    ?.trim()
    .toLowerCase();

  const memberships = await db
    .select({
      workspaceId:     workspacesTable.id,
      workspaceSlug:   workspacesTable.slug,
      workspaceStatus: workspacesTable.status,
      workspaceRole:   workspaceMembershipsTable.role,
    })
    .from(workspaceMembershipsTable)
    .innerJoin(
      workspacesTable,
      eq(workspaceMembershipsTable.workspaceId, workspacesTable.id),
    )
    .where(eq(workspaceMembershipsTable.userId, user.id));

  if (memberships.length === 0) {
    throw new AuthorizationError(403, "User has no workspace memberships.");
  }

  let ws: (typeof memberships)[0];
  if (requestedSlug) {
    const found = memberships.find((m) => m.workspaceSlug === requestedSlug);
    if (!found) {
      throw new AuthorizationError(
        403,
        `User is not a member of workspace '${requestedSlug}'.`,
        { availableWorkspaces: memberships.map((m) => m.workspaceSlug) },
      );
    }
    ws = found;
  } else {
    ws = memberships[0]!;
  }

  // ── 3. Capability check — workspace role (not global role) ─────────────────
  if (ws.workspaceStatus !== "active") {
    throw new AuthorizationError(403, `Workspace '${ws.workspaceSlug}' is not active.`);
  }
  const role = ws.workspaceRole as AppRole;
  const allowed = ROLE_CAPABILITIES[role];

  if (!allowed || !allowed.includes(capability)) {
    throw new AuthorizationError(
      403,
      `Role '${role}' does not have permission: ${capability}`,
      { requiredCapability: capability, workspaceRole: role },
    );
  }

  return {
    userId:        user.id,
    userName:      user.name,
    globalRole:    user.role,
    workspaceId:   ws.workspaceId,
    workspaceSlug: ws.workspaceSlug,
    workspaceRole: role,
  };
}

// ─── authorizeSession() — session-only (no workspace required) ────────────────

/**
 * Lightweight gate for routes that need a valid session but no workspace context
 * (e.g. GET /users/me, GET /users, user switching).
 * Optionally checks global role against an allowlist.
 */
export async function authorizeSession(
  req: Request,
  allowedGlobalRoles?: AppRole[],
): Promise<{ userId: number; userName: string; globalRole: AppRole }> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string" || !token) {
    throw new AuthorizationError(401, "Sign in to continue.");
  }
  const [session] = await db
    .select({ user: appUsersTable })
    .from(appSessionsTable)
    .innerJoin(appUsersTable, eq(appSessionsTable.userId, appUsersTable.id))
    .where(and(
      eq(appSessionsTable.tokenHash, hashSessionToken(token)),
      isNull(appSessionsTable.revokedAt),
      gt(appSessionsTable.expiresAt, new Date()),
    ));
  const user = session?.user;

  if (!user) {
    throw new AuthorizationError(401, "No active session user.");
  }

  if (allowedGlobalRoles && !allowedGlobalRoles.includes(user.role as AppRole)) {
    throw new AuthorizationError(
      403,
      `Global role '${user.role}' cannot perform this operation.`,
      { allowedRoles: allowedGlobalRoles },
    );
  }

  return { userId: user.id, userName: user.name, globalRole: user.role as AppRole };
}

// ─── withAuth() — route handler wrapper ──────────────────────────────────────

/**
 * Execute a route handler after authorizing the request.
 * Sends 401/403 on AuthorizationError. Re-throws everything else.
 *
 * Usage:
 *   router.get("/drivers", async (req, res) => {
 *     await withAuth(req, res, "view_drivers", async (auth) => {
 *       const rows = await db.select().from(driversTable)
 *         .where(eq(driversTable.workspaceId, auth.workspaceId)); // <-- only source of scope
 *       res.json(rows);
 *     });
 *   });
 */
export async function withAuth(
  req: Request,
  res: Response,
  capability: Capability,
  handler: (auth: AuthContext) => Promise<void>,
): Promise<void> {
  let auth: AuthContext;
  try {
    auth = await authorize(req, capability);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      res.status(err.status).json(err.toJSON());
      return;
    }
    throw err;
  }
  await handler(auth);
}

/**
 * withSession() — same pattern but for session-only routes (no workspace).
 */
export async function withSession(
  req: Request,
  res: Response,
  handler: (ctx: { userId: number; userName: string; globalRole: AppRole }) => Promise<void>,
  allowedGlobalRoles?: AppRole[],
): Promise<void> {
  let ctx: { userId: number; userName: string; globalRole: AppRole };
  try {
    ctx = await authorizeSession(req, allowedGlobalRoles);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      res.status(err.status).json(err.toJSON());
      return;
    }
    throw err;
  }
  await handler(ctx);
}
