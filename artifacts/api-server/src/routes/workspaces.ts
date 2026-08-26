import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { workspacesTable, workspaceMembershipsTable, appUsersTable } from "@workspace/db";
import { withAuth, withSession, AuthorizationError } from "../lib/authorize";
import { badRequest, notFound, conflict } from "../lib/api-errors";

const router: IRouter = Router();

// ─── GET /workspaces ──────────────────────────────────────────────────────────
router.get("/workspaces", async (_req, res): Promise<void> => {
  const workspaces = await db.select().from(workspacesTable).orderBy(workspacesTable.createdAt);
  const withCounts = await Promise.all(
    workspaces.map(async (ws) => {
      const members = await db.select({ id: workspaceMembershipsTable.id })
        .from(workspaceMembershipsTable).where(eq(workspaceMembershipsTable.workspaceId, ws.id));
      return { ...ws, memberCount: members.length };
    }),
  );
  res.json(withCounts);
});

// ─── GET /workspaces/:slug ────────────────────────────────────────────────────
router.get("/workspaces/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
  if (!ws) { notFound(res, `Workspace '${slug}' not found`); return; }

  const members = await db
    .select({
      membershipId:   workspaceMembershipsTable.id,
      workspaceRole:  workspaceMembershipsTable.role,
      joinedAt:       workspaceMembershipsTable.joinedAt,
      userId:         appUsersTable.id,
      name:           appUsersTable.name,
      email:          appUsersTable.email,
      globalRole:     appUsersTable.role,
      avatarInitials: appUsersTable.avatarInitials,
    })
    .from(workspaceMembershipsTable)
    .innerJoin(appUsersTable, eq(workspaceMembershipsTable.userId, appUsersTable.id))
    .where(eq(workspaceMembershipsTable.workspaceId, ws.id))
    .orderBy(workspaceMembershipsTable.joinedAt);

  res.json({ ...ws, members, memberCount: members.length });
});

// ─── POST /workspaces — create (owner_admin only) ─────────────────────────────
router.post("/workspaces", async (req, res): Promise<void> => {
  await withSession(req, res, async (session) => {
    if (session.globalRole !== "owner_admin") {
      throw new AuthorizationError(403, "Only owner_admin may create workspaces.", { globalRole: session.globalRole });
    }
    const { name, slug, description, status } = req.body ?? {};
    if (!name || !slug) { badRequest(res, "name and slug are required"); return; }

    const dup = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
    if (dup.length > 0) { conflict(res, `Workspace slug '${slug}' already taken`); return; }

    const [created] = await db.insert(workspacesTable).values({ name, slug, description: description ?? null, status: status ?? "active" }).returning();
    res.status(201).json(created);
  });
});

// ─── GET /workspaces/:slug/members ────────────────────────────────────────────
router.get("/workspaces/:slug/members", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
  if (!ws) { notFound(res, `Workspace '${slug}' not found`); return; }

  const members = await db
    .select({
      membershipId:   workspaceMembershipsTable.id,
      workspaceRole:  workspaceMembershipsTable.role,
      joinedAt:       workspaceMembershipsTable.joinedAt,
      userId:         appUsersTable.id,
      name:           appUsersTable.name,
      email:          appUsersTable.email,
      globalRole:     appUsersTable.role,
      avatarInitials: appUsersTable.avatarInitials,
    })
    .from(workspaceMembershipsTable)
    .innerJoin(appUsersTable, eq(workspaceMembershipsTable.userId, appUsersTable.id))
    .where(eq(workspaceMembershipsTable.workspaceId, ws.id))
    .orderBy(workspaceMembershipsTable.joinedAt);

  res.json(members);
});

// ─── POST /workspaces/:slug/members — add/upsert member (manage_settings) ────
router.post("/workspaces/:slug/members", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_settings", async (auth) => {
    const { slug } = req.params;
    const { userId, role } = req.body ?? {};
    if (!userId || !role) { badRequest(res, "userId and role are required"); return; }

    const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
    if (!ws) { notFound(res, `Workspace '${slug}' not found`); return; }

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, Number(userId)));
    if (!user) { notFound(res, "User not found"); return; }

    const existing = await db.select().from(workspaceMembershipsTable)
      .where(and(eq(workspaceMembershipsTable.workspaceId, ws.id), eq(workspaceMembershipsTable.userId, Number(userId))));

    if (existing.length > 0) {
      const [updated] = await db.update(workspaceMembershipsTable).set({ role })
        .where(eq(workspaceMembershipsTable.id, existing[0].id)).returning();
      res.json({ ...updated, name: user.name, email: user.email });
      return;
    }

    const [membership] = await db.insert(workspaceMembershipsTable)
      .values({ workspaceId: ws.id, userId: Number(userId), role }).returning();
    res.status(201).json({ ...membership, name: user.name, email: user.email });
  });
});

// ─── PATCH /workspaces/:slug/members/:userId — update role (manage_settings) ──
router.patch("/workspaces/:slug/members/:userId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_settings", async (auth) => {
    const { slug, userId } = req.params;
    const { role } = req.body ?? {};
    if (!role) { badRequest(res, "role is required"); return; }

    const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
    if (!ws) { notFound(res, `Workspace '${slug}' not found`); return; }

    const [membership] = await db.select().from(workspaceMembershipsTable)
      .where(and(eq(workspaceMembershipsTable.workspaceId, ws.id), eq(workspaceMembershipsTable.userId, Number(userId))));
    if (!membership) { notFound(res, "Membership not found"); return; }

    const [updated] = await db.update(workspaceMembershipsTable).set({ role })
      .where(eq(workspaceMembershipsTable.id, membership.id)).returning();
    res.json(updated);
  });
});

// ─── DELETE /workspaces/:slug/members/:userId (manage_settings) ───────────────
router.delete("/workspaces/:slug/members/:userId", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_settings", async (auth) => {
    const { slug, userId } = req.params;

    const [ws] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
    if (!ws) { notFound(res, `Workspace '${slug}' not found`); return; }

    const [membership] = await db.select().from(workspaceMembershipsTable)
      .where(and(eq(workspaceMembershipsTable.workspaceId, ws.id), eq(workspaceMembershipsTable.userId, Number(userId))));
    if (!membership) { notFound(res, "Membership not found"); return; }

    await db.delete(workspaceMembershipsTable).where(eq(workspaceMembershipsTable.id, membership.id));
    res.json({ deleted: true, workspaceId: ws.id, userId: Number(userId) });
  });
});

// ─── GET /users/me/workspaces ─────────────────────────────────────────────────
router.get("/users/me/workspaces", async (req, res): Promise<void> => {
  await withSession(req, res, async (session) => {
    const memberships = await db
      .select({
        membershipId:    workspaceMembershipsTable.id,
        workspaceRole:   workspaceMembershipsTable.role,
        joinedAt:        workspaceMembershipsTable.joinedAt,
        workspaceId:     workspacesTable.id,
        workspaceName:   workspacesTable.name,
        workspaceSlug:   workspacesTable.slug,
        workspaceStatus: workspacesTable.status,
      })
      .from(workspaceMembershipsTable)
      .innerJoin(workspacesTable, eq(workspaceMembershipsTable.workspaceId, workspacesTable.id))
      .where(eq(workspaceMembershipsTable.userId, session.userId))
      .orderBy(workspacesTable.name);
    res.json(memberships);
  });
});

export default router;
