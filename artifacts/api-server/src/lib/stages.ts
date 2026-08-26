/**
 * Canonical driver stage pipeline.
 *
 * Linear order: hired → pre_hire → onboarding → dispatch_ready → active
 * Terminal:     fallout (reachable from any stage)
 *
 * Use this module everywhere stage values are validated or compared — never
 * hard-code stage string literals in route handlers.
 */

export const DRIVER_STAGES = [
  "hired",
  "pre_hire",
  "onboarding",
  "dispatch_ready",
  "active",
  "fallout",
] as const;

export type DriverStage = (typeof DRIVER_STAGES)[number];

/** Linear order index. fallout is -1 (terminal, not in sequence). */
export const STAGE_ORDER: Record<DriverStage, number> = {
  hired:          0,
  pre_hire:       1,
  onboarding:     2,
  dispatch_ready: 3,
  active:         4,
  fallout:        -1,
};

export const STAGE_LABELS: Record<DriverStage, string> = {
  hired:          "Hired",
  pre_hire:       "Pre-Hire Screening",
  onboarding:     "Onboarding",
  dispatch_ready: "Ready for Dispatch",
  active:         "Active",
  fallout:        "Fallout",
};

export const STAGE_DESCRIPTIONS: Record<DriverStage, string> = {
  hired:          "Hired event received — application submitted, initial record created",
  pre_hire:       "Pre-hire background check, MVR, and initial compliance review underway",
  onboarding:     "Active onboarding — compliance gates being completed",
  dispatch_ready: "All mandatory compliance gates passed — cleared for dispatch",
  active:         "Driver dispatched and active",
  fallout:        "Driver disqualified or dropped from pipeline",
};

/** Return true when `target` is a valid forward move from `current`. */
export function isForwardStage(current: DriverStage, target: DriverStage): boolean {
  if (target === "fallout") return true; // fallout always reachable
  return STAGE_ORDER[target] > STAGE_ORDER[current];
}

export function isValidStage(s: string): s is DriverStage {
  return (DRIVER_STAGES as readonly string[]).includes(s);
}

/**
 * Map the current driver.status to the correct stage.
 * Used when backfilling stage values on drivers that pre-date the stage system.
 */
export function statusToStage(status: string, currentStage: string): DriverStage {
  // If the stored stage already matches the formal set, honour it.
  if (isValidStage(currentStage)) return currentStage;
  if (status === "fallout" || status === "disqualified") return "fallout";
  if (status === "ready_for_dispatch") return "dispatch_ready";
  if (status === "active") return "active";

  // Map free-text stage labels that appear in seed data from before the formal system.
  const legacyMap: Record<string, DriverStage> = {
    application:            "hired",
    "Application":          "hired",
    "Pre-Hire":             "pre_hire",
    "Dispatch Handoff":     "dispatch_ready",
  };
  if (legacyMap[currentStage]) return legacyMap[currentStage];

  // Everything else that's mid-flow: treat as onboarding
  return "onboarding";
}

export type TransitionType =
  | "hired_event"
  | "stage_advance"
  | "auto_gate"
  | "dispatch_check"
  | "system";
