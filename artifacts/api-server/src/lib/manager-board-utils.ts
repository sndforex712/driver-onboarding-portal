/**
 * Pure, side-effect-free helpers for the Manager Board.
 * No DB or Express dependencies — safe to import from unit tests.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlaColor = "green" | "yellow" | "orange" | "red" | "black" | "gray";

export const OPERATIONAL_BOARD_COLUMNS = [
  "application",
  "clearinghouse",
  "drug_test_scheduled",
  "medical_card",
  "drug_test_completed",
  "annual_inspection",
  "contract",
  "tag",
  "form_2290",
  "registration",
  "plate_number",
] as const;

export type OperationalBoardColumn = typeof OPERATIONAL_BOARD_COLUMNS[number];
export type BoardColumn = OperationalBoardColumn | "ready_for_dispatch" | "blocked_fallout";

export const BOARD_COLUMN_ORDER: BoardColumn[] = [
  ...OPERATIONAL_BOARD_COLUMNS,
  "ready_for_dispatch",
  "blocked_fallout",
];

export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  application:         "Application",
  clearinghouse:       "Clearinghouse",
  drug_test_scheduled: "Drug Test Scheduled",
  medical_card:        "Medical Card",
  drug_test_completed: "Drug Test Completed",
  annual_inspection:   "Annual Inspection",
  contract:            "Contract",
  tag:                 "Tag",
  form_2290:           "Form 2290",
  registration:        "Registration",
  plate_number:        "Plate Number",
  ready_for_dispatch:  "Ready for Dispatch",
  blocked_fallout:     "Blocked / Fallout",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Compute which Kanban column this driver belongs in. */
export function getBoardColumn(
  stage: string,
  status: string,
  readyForDispatch: boolean,
  currentStepKey: OperationalBoardColumn,
): BoardColumn {
  if (stage === "fallout" || status === "fallout" || status === "disqualified")
    return "blocked_fallout";

  if (readyForDispatch || stage === "active") return "ready_for_dispatch";
  return currentStepKey;
}

/** Compute SLA color from hiredAt + waitingOnExternal.
 *  Sprint window: 36 hours from hiredAt. */
export function getSlaColor(hiredAt: Date, waitingOnExternal: boolean): SlaColor {
  if (waitingOnExternal) return "gray";
  const SPRINT_MS = 36 * 60 * 60 * 1000;
  const remaining = hiredAt.getTime() + SPRINT_MS - Date.now();
  if (remaining <= 0)                        return "black";
  if (remaining <= 6  * 60 * 60 * 1000) return "red";
  if (remaining <= 12 * 60 * 60 * 1000) return "orange";
  if (remaining <= 24 * 60 * 60 * 1000) return "yellow";
  return "green";
}

/** Mask phone — expose last 4 digits only. Never sends full number to client. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "••••";
  const digits = phone.replace(/\D/g, "");
  const last4  = digits.slice(-4);
  return last4.length === 4 ? `••••${last4}` : "••••";
}

/** Sort key for War Room mode.
 *  Priority: breached (black=0) → red (1) → unassigned (2) → orange (3) → yellow (4) → rest (5) */
export function warRoomSortKey(slaColor: SlaColor, caseOwnerName: string | null): number {
  if (slaColor === "black")  return 0;
  if (slaColor === "red")    return 1;
  if (!caseOwnerName)        return 2;
  if (slaColor === "orange") return 3;
  if (slaColor === "yellow") return 4;
  return 5;
}
