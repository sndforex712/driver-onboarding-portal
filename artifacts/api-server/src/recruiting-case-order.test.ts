import assert from "node:assert/strict";
import test from "node:test";
import {
  sortRecruitingCases,
  type RecruitingCaseOrderRow,
} from "./lib/recruiting-case-order";

const NOW = new Date("2026-08-21T12:00:00.000Z");

function row(id: number, stage: string | null, overrides: Partial<RecruitingCaseOrderRow> = {}): RecruitingCaseOrderRow {
  return {
    id,
    stage,
    slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z"),
    nextActionDueAt: new Date("2026-08-22T12:00:00.000Z"),
    updatedAt: new Date("2026-08-20T12:00:00.000Z"),
    createdAt: new Date("2026-08-19T12:00:00.000Z"),
    ...overrides,
  };
}

test("default progress sort puts furthest active stages first", () => {
  const rows = [
    row(1, "new_lead"),
    row(2, "application_sent"),
    row(3, "manager_review"),
    row(4, "ready_for_onboarding"),
  ];
  assert.deepEqual(sortRecruitingCases(rows, "progress", NOW).map(item => item.id), [4, 3, 2, 1]);
});

test("default progress sort keeps unknown and null stages at the bottom", () => {
  const rows = [
    row(1, "unexpected_stage"),
    row(2, null),
    row(3, "contact_attempted"),
    row(4, "application_sent"),
  ];
  assert.deepEqual(sortRecruitingCases(rows, "progress", NOW).map(item => item.id), [4, 3, 1, 2]);
});

test("same-stage progress ties use SLA urgency, action due time, recency, then case id", () => {
  const rows = [
    row(1, "manager_review", { slaDeadlineAt: new Date("2026-08-21T15:00:00.000Z") }),
    row(2, "manager_review", { slaDeadlineAt: new Date("2026-08-21T11:00:00.000Z"), nextActionDueAt: new Date("2026-08-22T11:00:00.000Z") }),
    row(3, "manager_review", { slaDeadlineAt: new Date("2026-08-21T11:00:00.000Z"), nextActionDueAt: new Date("2026-08-22T10:00:00.000Z") }),
    row(5, "manager_review", {
      slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z"),
      nextActionDueAt: new Date("2026-08-22T12:00:00.000Z"),
      updatedAt: new Date("2026-08-21T11:00:00.000Z"),
    }),
    row(4, "manager_review", {
      slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z"),
      nextActionDueAt: new Date("2026-08-22T12:00:00.000Z"),
      updatedAt: new Date("2026-08-21T11:00:00.000Z"),
    }),
  ];
  assert.deepEqual(sortRecruitingCases(rows, "progress", NOW).map(item => item.id), [3, 2, 1, 4, 5]);
});

test("progress ordering is global before a page boundary is applied", () => {
  const rows = [
    row(1, "new_lead"),
    row(2, "contact_attempted"),
    row(3, "application_sent"),
    row(4, "application_received"),
    row(5, "manager_review"),
    row(6, "ready_for_onboarding"),
    row(7, "unexpected_stage"),
  ];
  const globallySorted = sortRecruitingCases(rows, "progress", NOW);
  assert.deepEqual(globallySorted.slice(0, 3).map(item => item.id), [6, 5, 4]);
  assert.deepEqual(globallySorted.slice(3, 6).map(item => item.id), [3, 2, 1]);
  assert.deepEqual(globallySorted.slice(6).map(item => item.id), [7]);
});

test("explicit SLA sort preserves SLA deadline ordering independently of progress", () => {
  const rows = [
    row(1, "ready_for_onboarding", { slaDeadlineAt: new Date("2026-08-23T12:00:00.000Z") }),
    row(2, "new_lead", { slaDeadlineAt: new Date("2026-08-21T13:00:00.000Z") }),
    row(3, "manager_review", { slaDeadlineAt: new Date("2026-08-22T12:00:00.000Z") }),
  ];
  assert.deepEqual(sortRecruitingCases(rows, "sla", NOW).map(item => item.id), [2, 3, 1]);
});