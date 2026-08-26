export type OperationalQueueView =
  | "all"
  | "due_today"
  | "overdue"
  | "waiting_blocked"
  | "no_next_action"
  | "needs_review";

export interface OperationalQueueRow {
  id: number;
  fullName: string;
  driverType: string;
  status: string;
  recruiterName: string;
  recruiterNameNormalized: string;
  sourceChannel: string;
  sourceChannelNormalized: string;
  operationalOwnerId: number | null;
  operationalOwnerName: string | null;
  recommendedOwnerId: number;
  recommendedOwnerName: string;
  currentStepNumber: number;
  currentStepKey: string;
  currentStepLabel: string;
  completedStepNumbers: number[];
  quality: "ok" | "needs_review";
  qualityReasons: string[];
  nextAction: string | null;
  nextActionDue: string | null;
  blockers: string | null;
  waitingOnExternal: boolean;
  phone: string | null;
  phoneLast4: string | null;
  completionPercent: number;
  updatedAt: string;
}

export interface OperationalQueueFilters {
  view?: OperationalQueueView;
  status?: string;
  driverType?: string;
  search?: string;
  operationalOwner?: string;
  step?: number;
  source?: string;
}

export function normalizeOperationalFilterValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function datesForToday(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function buildOperationalQueue<T extends OperationalQueueRow>(
  rows: T[],
  filters: OperationalQueueFilters,
  now = new Date(),
) {
  const search = normalizeOperationalFilterValue(filters.search ?? "");
  const matchingBase = rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.driverType && row.driverType !== filters.driverType) return false;
    if (filters.operationalOwner && normalizeOperationalFilterValue(row.operationalOwnerName ?? "") !== normalizeOperationalFilterValue(filters.operationalOwner)) return false;
    if (filters.step && row.currentStepNumber !== filters.step) return false;
    if (filters.source && row.sourceChannelNormalized !== normalizeOperationalFilterValue(filters.source)) return false;
    if (!search) return true;
    return [
      row.fullName,
      row.recruiterName,
      row.recruiterNameNormalized,
      row.sourceChannel,
      row.sourceChannelNormalized,
      row.operationalOwnerName ?? "",
      row.currentStepLabel,
    ].some((value) => normalizeOperationalFilterValue(value).includes(search));
  });
  const { start, end } = datesForToday(now);
  const hasDueToday = (row: T) => {
    if (!row.nextActionDue) return false;
    const due = new Date(row.nextActionDue);
    return due >= start && due < end;
  };
  const hasOverdue = (row: T) => Boolean(row.nextActionDue && new Date(row.nextActionDue) < start);
  const isWaitingOrBlocked = (row: T) => row.waitingOnExternal || Boolean(row.blockers?.trim()) || row.status === "on_hold";
  const hasNoNextAction = (row: T) => !row.nextAction?.trim();
  const matchesView = (row: T) => {
    switch (filters.view ?? "all") {
      case "due_today": return hasDueToday(row);
      case "overdue": return hasOverdue(row);
      case "waiting_blocked": return isWaitingOrBlocked(row);
      case "no_next_action": return hasNoNextAction(row);
      case "needs_review": return row.quality === "needs_review";
      default: return true;
    }
  };
  return {
    items: matchingBase.filter(matchesView),
    counts: {
      all: matchingBase.length,
      dueToday: matchingBase.filter(hasDueToday).length,
      overdue: matchingBase.filter(hasOverdue).length,
      waitingBlocked: matchingBase.filter(isWaitingOrBlocked).length,
      noNextAction: matchingBase.filter(hasNoNextAction).length,
      needsReview: matchingBase.filter((row) => row.quality === "needs_review").length,
    },
    baseRows: matchingBase,
  };
}