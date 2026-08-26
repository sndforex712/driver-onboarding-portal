import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { appUsersTable } from "@workspace/db";
import { notFound } from "../lib/api-errors";
import { withSession } from "../lib/authorize";

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  await withSession(req, res, async () => {
    const rows = await db.select({
      id: appUsersTable.id,
      name: appUsersTable.name,
      role: appUsersTable.role,
      avatarInitials: appUsersTable.avatarInitials,
    }).from(appUsersTable).orderBy(appUsersTable.id);
    res.json(rows);
  });
});

router.get("/users/me", async (req, res): Promise<void> => {
  await withSession(req, res, async (session) => {
    const [current] = await db.select({
      id: appUsersTable.id,
      name: appUsersTable.name,
      email: appUsersTable.email,
      role: appUsersTable.role,
      avatarInitials: appUsersTable.avatarInitials,
    }).from(appUsersTable).where(eq(appUsersTable.id, session.userId));
    if (!current) { notFound(res, "Current user not found"); return; }
    res.json(current);
  });
});

router.post("/users/me/switch-role", async (_req, res): Promise<void> => {
  res.status(410).json({
    code: "GONE",
    message: "Role switching was removed. Sign in with the intended DEV/DEMO user.",
    retryable: false,
  });
});

export default router;
