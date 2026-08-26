import { eq } from "drizzle-orm";
import {
  appUsersTable,
  db,
  workspaceMembershipsTable,
  workspacesTable,
} from "@workspace/db";
import { DEMO_IDENTITIES, isDemoProvisioningEnabled } from "./lib/demo-auth";

export async function provisionDemoUsers(): Promise<void> {
  if (!isDemoProvisioningEnabled()) {
    throw new Error("DEV/DEMO provisioning requires a development/test runtime and DEMO_USER_PROVISION=1.");
  }

  await db.transaction(async (tx) => {
    const [workspace] = await tx
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.slug, "franklin"));
    if (!workspace || workspace.status !== "active") {
      throw new Error("An active Franklin DEV/DEMO workspace is required before provisioning demo users.");
    }

    for (const spec of DEMO_IDENTITIES) {
      const [existing] = await tx.select().from(appUsersTable).where(eq(appUsersTable.email, spec.email));
      const user = existing
        ? (await tx.update(appUsersTable).set({
          name: spec.name,
          role: spec.role,
          avatarInitials: spec.avatarInitials,
          passwordHash: null,
          passwordUpdatedAt: null,
          isCurrentSession: "false",
        }).where(eq(appUsersTable.id, existing.id)).returning())[0]!
        : (await tx.insert(appUsersTable).values({
          name: spec.name,
          email: spec.email,
          role: spec.role,
          avatarInitials: spec.avatarInitials,
          passwordHash: null,
          passwordUpdatedAt: null,
          isCurrentSession: "false",
        }).returning())[0]!;

      await tx.insert(workspaceMembershipsTable).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: spec.role,
      }).onConflictDoUpdate({
        target: [workspaceMembershipsTable.workspaceId, workspaceMembershipsTable.userId],
        set: { role: spec.role },
      });
    }
  });

  console.log("Provisioned fixed DEV/DEMO identities.");
}

await provisionDemoUsers();