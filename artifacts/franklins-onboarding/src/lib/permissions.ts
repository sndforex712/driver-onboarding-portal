import type { AppUser } from "@workspace/api-client-react";

/**
 * Client-side permission checks — mirrors the server-side ROLE_CAPABILITIES matrix.
 * These guard UI affordances only. The server independently enforces every action.
 */

export type AppRole =
  | "owner_admin"
  | "manager"
  | "recruiter"
  | "onboarding_specialist"
  | "compliance_reviewer"
  | "dispatcher_readonly";

const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  owner_admin: [
    "view_drivers", "edit_driver", "create_driver", "simulate_hired",
    "manage_tasks", "manage_documents", "manage_checklists",
    "dispatch", "trigger_sync", "view_settings", "manage_settings",
  ],
  manager: [
    "view_drivers", "edit_driver", "create_driver", "simulate_hired",
    "manage_tasks", "manage_documents", "manage_checklists",
    "dispatch", "trigger_sync", "view_settings",
  ],
  recruiter: [
    "view_drivers", "simulate_hired",
  ],
  onboarding_specialist: [
    "view_drivers", "edit_driver", "create_driver", "simulate_hired",
    "manage_tasks", "manage_documents", "manage_checklists",
    "dispatch", "trigger_sync",
  ],
  compliance_reviewer: [
    "view_drivers", "manage_documents", "manage_checklists",
  ],
  dispatcher_readonly: [
    "view_drivers", "dispatch", "trigger_sync",
  ],
};

export function hasPermission(
  user: AppUser | undefined | null,
  permission: string,
): boolean {
  if (!user) return false;
  const role = user.role as AppRole;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** True if the user can access any settings page */
export function canAccessSettings(user: AppUser | undefined | null): boolean {
  return hasPermission(user, "view_settings");
}

/** True if the user can manage workspace membership and billing */
export function canManageSettings(user: AppUser | undefined | null): boolean {
  return hasPermission(user, "manage_settings");
}
