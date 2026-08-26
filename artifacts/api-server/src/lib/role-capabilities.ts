export type AppRole =
  | "owner_admin"
  | "manager"
  | "recruiter"
  | "onboarding_specialist"
  | "compliance_reviewer"
  | "dispatcher_readonly";

export type Capability =
  | "view_drivers"
  | "create_driver"
  | "update_driver"
  | "simulate_hired"
  | "manage_tasks"
  | "manage_documents"
  | "manage_checklists"
  | "ready_for_dispatch"
  | "datatruck_sync"
  | "view_settings"
  | "manage_settings"
  | "view_manager_board"
  | "manager_push"
  | "view_recruiting"
  | "create_recruiting_case"
  | "manage_recruiting"
  | "decide_recruiting_manager_review"
  | "transfer_recruiting"
  | "manage_recruiting_sheet_sync";

export const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  owner_admin: [
    "view_drivers", "create_driver", "update_driver", "simulate_hired", "manage_tasks",
    "manage_documents", "manage_checklists", "ready_for_dispatch", "datatruck_sync",
    "view_settings", "manage_settings", "view_manager_board", "manager_push",
    "view_recruiting", "create_recruiting_case", "manage_recruiting",
    "decide_recruiting_manager_review", "transfer_recruiting", "manage_recruiting_sheet_sync",
  ],
  manager: [
    "view_drivers", "create_driver", "update_driver", "simulate_hired", "manage_tasks",
    "manage_documents", "manage_checklists", "ready_for_dispatch", "datatruck_sync",
    "view_settings", "view_manager_board", "manager_push", "view_recruiting",
    "create_recruiting_case", "manage_recruiting", "decide_recruiting_manager_review",
    "transfer_recruiting", "manage_recruiting_sheet_sync",
  ],
  recruiter: [
    "view_drivers", "simulate_hired", "view_recruiting", "create_recruiting_case", "manage_recruiting",
  ],
  onboarding_specialist: [
    "view_drivers", "create_driver", "update_driver", "simulate_hired", "manage_tasks",
    "manage_documents", "manage_checklists", "ready_for_dispatch", "datatruck_sync",
    "view_recruiting", "transfer_recruiting",
  ],
  compliance_reviewer: ["view_drivers", "manage_documents", "manage_checklists"],
  dispatcher_readonly: ["view_drivers", "ready_for_dispatch", "datatruck_sync"],
};