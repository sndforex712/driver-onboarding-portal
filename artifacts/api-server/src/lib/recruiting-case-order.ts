import { asc, desc, sql, type SQL } from "drizzle-orm";
import { recruitingCasesTable } from "@workspace/db";
import { RECRUITING_STAGE_ORDER } from "@workspace/api-zod";

export const RECRUITING_CASE_SORTS = ["progress", "sla", "deadline", "newest"] as const;
export type RecruitingCaseSort = (typeof RECRUITING_CASE_SORTS)[number];

export type RecruitingCaseOrderRow = {
  id: number;
  stage: string | null | undefined;
  slaDeadlineAt: Date | null;
  nextActionDueAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

export function stageProgressRank(stage: string | null | undefined): number {
  const rank = RECRUITING_STAGE_ORDER.indexOf(stage as typeof RECRUITING_STAGE_ORDER[number]);
  return rank;
}

function slaUrgency(deadline: Date | null, now: Date): number {
  if (!deadline) return 3;
  if (deadline.getTime() <= now.getTime()) return 0;
  if (deadline.getTime() <= now.getTime() + 4 * 60 * 60 * 1000) return 1;
  return 2;
}

function ascendingDate(date: Date | null): number {
  return date?.getTime() ?? Number.POSITIVE_INFINITY;
}

function descendingDate(date: Date): number {
  return -date.getTime();
}

export function compareRecruitingCases(
  left: RecruitingCaseOrderRow,
  right: RecruitingCaseOrderRow,
  sort: RecruitingCaseSort = "progress",
  now = new Date(),
): number {
  if (sort === "sla") {
    return ascendingDate(left.slaDeadlineAt) - ascendingDate(right.slaDeadlineAt)
      || descendingDate(left.updatedAt) - descendingDate(right.updatedAt);
  }
  if (sort === "deadline") {
    return ascendingDate(left.nextActionDueAt) - ascendingDate(right.nextActionDueAt)
      || descendingDate(left.updatedAt) - descendingDate(right.updatedAt);
  }
  if (sort === "newest") {
    return descendingDate(left.createdAt) - descendingDate(right.createdAt)
      || left.id - right.id;
  }

  return stageProgressRank(right.stage) - stageProgressRank(left.stage)
    || slaUrgency(left.slaDeadlineAt, now) - slaUrgency(right.slaDeadlineAt, now)
    || ascendingDate(left.nextActionDueAt) - ascendingDate(right.nextActionDueAt)
    || descendingDate(left.updatedAt) - descendingDate(right.updatedAt)
    || descendingDate(left.createdAt) - descendingDate(right.createdAt)
    || left.id - right.id;
}

export function sortRecruitingCases<T extends RecruitingCaseOrderRow>(
  rows: readonly T[],
  sort: RecruitingCaseSort = "progress",
  now = new Date(),
): T[] {
  return [...rows].sort((left, right) => compareRecruitingCases(left, right, sort, now));
}

function stageProgressRankSql(): SQL {
  const stageCases = RECRUITING_STAGE_ORDER.map((stage, index) => sql`when ${stage} then ${index}`);
  return sql`case ${recruitingCasesTable.stage} ${sql.join(stageCases, sql.raw(" "))} else -1 end`;
}

function slaUrgencySql(now: Date): SQL {
  const atRiskBefore = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return sql`case
    when ${recruitingCasesTable.slaDeadlineAt} is null then 3
    when ${recruitingCasesTable.slaDeadlineAt} <= ${now} then 0
    when ${recruitingCasesTable.slaDeadlineAt} <= ${atRiskBefore} then 1
    else 2
  end`;
}

export function recruitingCaseOrderBy(sort: RecruitingCaseSort = "progress", now = new Date()): SQL[] {
  if (sort === "sla") {
    return [asc(recruitingCasesTable.slaDeadlineAt), desc(recruitingCasesTable.updatedAt)];
  }
  if (sort === "deadline") {
    return [asc(recruitingCasesTable.nextActionDueAt), desc(recruitingCasesTable.updatedAt)];
  }
  if (sort === "newest") {
    return [desc(recruitingCasesTable.createdAt), asc(recruitingCasesTable.id)];
  }
  return [
    desc(stageProgressRankSql()),
    asc(slaUrgencySql(now)),
    asc(recruitingCasesTable.nextActionDueAt),
    desc(recruitingCasesTable.updatedAt),
    desc(recruitingCasesTable.createdAt),
    asc(recruitingCasesTable.id),
  ];
}