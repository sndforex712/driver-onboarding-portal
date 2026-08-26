import { Router, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { appSessionsTable, appUsersTable, db, workspacesTable, workspaceMembershipsTable } from "@workspace/db";
import { notFound } from "../lib/api-errors";
import { authorizeSession } from "../lib/authorize";
import { demoIdentityForAccount, isDemoLoginEnabled, parseDemoAccount } from "../lib/demo-auth";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "../lib/session-security";

const router: IRouter = Router();

function publicUser(user: typeof appUsersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarInitials: user.avatarInitials,
  };
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

async function createAuthenticatedSession(res: Response, user: typeof appUsersTable.$inferSelect): Promise<void> {
  const token = createSessionToken();
  const now = new Date();
  await db.insert(appSessionsTable).values({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS),
  });
  setSessionCookie(res, token);
  res.json({ user: publicUser(user), expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS).toISOString() });
}

router.post("/auth/demo-login", async (req, res): Promise<void> => {
  if (!isDemoLoginEnabled()) {
    notFound(res, "Not found.");
    return;
  }

  const account = parseDemoAccount(req.body);
  if (!account) {
    res.status(403).json({ code: "FORBIDDEN", message: "This demo account is not available.", retryable: false });
    return;
  }

  const identity = demoIdentityForAccount(account);
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, identity.email));
  if (!user || user.role !== identity.role) {
    res.status(403).json({ code: "FORBIDDEN", message: "This demo account is not available.", retryable: false });
    return;
  }

  const [membership] = await db
    .select({ role: workspaceMembershipsTable.role })
    .from(workspaceMembershipsTable)
    .innerJoin(workspacesTable, eq(workspaceMembershipsTable.workspaceId, workspacesTable.id))
    .where(and(
      eq(workspaceMembershipsTable.userId, user.id),
      eq(workspacesTable.slug, "franklin"),
      eq(workspaceMembershipsTable.role, identity.role),
    ));
  if (!membership) {
    res.status(403).json({ code: "FORBIDDEN", message: "This demo account is not available.", retryable: false });
    return;
  }

  await createAuthenticatedSession(res, user);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token === "string" && token) {
    await db.update(appSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(appSessionsTable.tokenHash, hashSessionToken(token)));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).end();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const session = await authorizeSession(req);
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, session.userId));
    if (!user) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Session user no longer exists.", retryable: false });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 401 : 500;
    res.status(status).json({ code: "UNAUTHORIZED", message: "Sign in to continue.", retryable: false });
  }
});

export default router;