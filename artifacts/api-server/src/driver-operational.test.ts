import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalQueue, type OperationalQueueRow } from "./lib/driver-operational-queue";
import {
  deriveOperationalProjection,
  hasCompletedPrecedingOperationalSteps,
  hasCompletedSubsequentOperationalSteps,
  OPERATIONAL_STEPS,
} from "./lib/driver-operational-projection";
import { getChecklistTemplateForDriver, OPERATIONAL_CHECKLIST_TEMPLATE } from "./lib/checklist-gates";

const item = (gateKey: string, status = "pending", isMandatory = true) => ({ gateKey, status, isMandatory });

test("uses the exact 11-step sequence with Form 2290 once in Hardy's segment", () => {
  assert.deepEqual(
    OPERATIONAL_STEPS.map((step) => step.label),
    [
      "Application",
      "Clearinghouse",
      "Drug Test Scheduled",
      "Medical Card",
      "Drug Test Completed",
      "Annual Inspection",
      "Contract",
      "Tag",
      "Form 2290",
      "Registration",
      "Plate Number",
    ],
  );
  assert.equal(OPERATIONAL_STEPS.filter((step) => step.key === "form_2290").length, 1);
  assert.equal(OPERATIONAL_STEPS.find((step) => step.key === "form_2290")?.number, 9);
  assert.equal(OPERATIONAL_CHECKLIST_TEMPLATE.filter((step) => step.gateKey === "form_2290").length, 1);
  assert.ok(OPERATIONAL_CHECKLIST_TEMPLATE.slice(0, 6).every((step) => step.gateCategory === "specialist_operations"));
  assert.ok(OPERATIONAL_CHECKLIST_TEMPLATE.slice(6).every((step) => step.gateCategory === "manager_operations"));
});

test("routes Steps 1–6 to Mason or Wayne and Step 7 to Hardy", () => {
  const projection = deriveOperationalProjection({
    driverId: 32,
    fullName: "Taylor Driver",
    driverType: "owner_operator",
    stage: "hired",
    status: "pre_hire",
    readyForDispatch: false,
    completionPercent: 0,
    checklist: [
      item("application_esign", "passed"),
      item("clearinghouse_consent", "passed"),
      item("drug_test_scheduled", "passed"),
      item("medical_card", "passed"),
      item("drug_test_completed", "passed"),
      item("annual_inspection", "pending"),
    ],
  });
  assert.equal(projection.currentStepNumber, 6);
  assert.equal(projection.currentStepLabel, "Annual Inspection");
  assert.equal(projection.recommendedOwnerName, "Mason");
  assert.deepEqual(projection.completedStepNumbers, [1, 2, 3, 4, 5]);

  const handedOff = deriveOperationalProjection({
    driverId: 32,
    fullName: "Taylor Driver",
    driverType: "owner_operator",
    stage: "onboarding",
    status: "in_progress",
    readyForDispatch: false,
    completionPercent: 55,
    checklist: OPERATIONAL_CHECKLIST_TEMPLATE.slice(0, 6).map((entry) => item(entry.gateKey, "passed")),
  });
  assert.equal(handedOff.currentStepNumber, 7);
  assert.equal(handedOff.currentStepLabel, "Contract");
  assert.equal(handedOff.recommendedOwnerName, "Hardy");
});

test("requires every earlier milestone before a later step can be passed", () => {
  const checklist = OPERATIONAL_STEPS.map((step) => item(
    step.gateKeys[0],
    step.number === 1 ? "passed" : "pending",
  ));

  assert.equal(hasCompletedPrecedingOperationalSteps(checklist, 2), true);
  assert.equal(hasCompletedPrecedingOperationalSteps(checklist, 6), false);
  assert.equal(hasCompletedPrecedingOperationalSteps(checklist, 11), false);
});

test("does not allow an earlier completed milestone to regress after later work", () => {
  const checklist = OPERATIONAL_STEPS.map((step) => item(
    step.gateKeys[0],
    step.number <= 7 ? "passed" : "pending",
  ));

  assert.equal(hasCompletedSubsequentOperationalSteps(checklist, 1), true);
  assert.equal(hasCompletedSubsequentOperationalSteps(checklist, 7), false);
});

test("flags unsafe ready claims and multi-person legacy imports for review", () => {
  const projection = deriveOperationalProjection({
    driverId: 25,
    fullName: "Ava Driver & Ben Driver",
    driverType: "company_driver",
    stage: "dispatch_ready",
    status: "ready_for_dispatch",
    readyForDispatch: true,
    completionPercent: 100,
    checklist: [item("application_esign", "passed"), item("clearinghouse_consent", "pending")],
  });
  assert.equal(projection.quality, "needs_review");
  assert.deepEqual(projection.qualityReasons.sort(), ["invalid_ready", "multi_person_import"]);
  assert.equal(projection.recommendedOwnerName, "Wayne");
});

test("keeps Form 2290 as one Hardy-owned milestone", () => {
  const projection = deriveOperationalProjection({
    driverId: 32,
    fullName: "Taylor Driver",
    driverType: "owner_operator",
    stage: "onboarding",
    status: "in_progress",
    readyForDispatch: false,
    completionPercent: 65,
    checklist: [
      item("application_esign", "passed"),
      item("clearinghouse_consent", "passed"),
      item("drug_test_scheduled", "passed"),
      item("medical_card", "passed"),
      item("drug_test_completed", "passed"),
      item("annual_inspection", "passed"),
      item("contract", "passed"),
      item("tag", "passed"),
      item("form_2290", "pending"),
    ],
  });
  assert.equal(projection.currentStepNumber, 9);
  assert.equal(projection.currentStepLabel, "Form 2290");
  assert.equal(projection.recommendedOwnerName, "Hardy");
});

test("default owner-operator and company-driver templates are not false data-quality exceptions", () => {
  for (const [driverId, driverType] of [[32, "owner_operator"], [25, "company_driver"]] as const) {
    const projection = deriveOperationalProjection({
      driverId,
      fullName: "Taylor Driver",
      driverType,
      stage: "hired",
      status: "pre_hire",
      readyForDispatch: false,
      completionPercent: 0,
      checklist: getChecklistTemplateForDriver(driverType).map((entry) => item(entry.gateKey)),
    });
    assert.equal(projection.quality, "ok");
    assert.equal(projection.currentStepNumber, 1);
    assert.equal(projection.recommendedOwnerName, driverId === 32 ? "Mason" : "Wayne");
  }
});

test("uses persisted checklist ordering to avoid false sequence anomalies", () => {
  for (const driverType of ["owner_operator", "company_driver"] as const) {
    const normalOrder = getChecklistTemplateForDriver(driverType).map((entry) => ({
      ...item(entry.gateKey),
      sortOrder: entry.sortOrder,
      status: entry.gateKey === "application_esign" ? "passed" : "pending",
    }));
    const projection = deriveOperationalProjection({
      driverId: 32,
      fullName: "Taylor Driver",
      driverType,
      stage: "hired",
      status: "pre_hire",
      readyForDispatch: false,
      completionPercent: 10,
      checklist: normalOrder,
    });
    assert.equal(projection.qualityReasons.includes("non_sequential_completion"), false);
  }

  const contradiction = getChecklistTemplateForDriver("owner_operator").map((entry) => ({
    ...item(entry.gateKey),
    sortOrder: entry.sortOrder,
    status: ["application_esign", "drug_test_scheduled"].includes(entry.gateKey) ? "passed" : "pending",
  }));
  const projection = deriveOperationalProjection({
    driverId: 32,
    fullName: "Taylor Driver",
    driverType: "owner_operator",
    stage: "hired",
    status: "pre_hire",
    readyForDispatch: false,
    completionPercent: 10,
    checklist: contradiction,
  });
  assert.equal(projection.qualityReasons.includes("non_sequential_completion"), true);
});

const row = (overrides: Partial<OperationalQueueRow>): OperationalQueueRow => ({
  id: 1,
  fullName: "Taylor Driver",
  driverType: "owner_operator",
  status: "pre_hire",
  recruiterName: "Jordan",
  recruiterNameNormalized: "jordan",
  sourceChannel: "Indeed",
  sourceChannelNormalized: "indeed",
  operationalOwnerId: 32,
  operationalOwnerName: "Mason",
  recommendedOwnerId: 32,
  recommendedOwnerName: "Mason",
  currentStepNumber: 1,
  currentStepKey: "application",
  currentStepLabel: "Application",
  completedStepNumbers: [],
  quality: "ok",
  qualityReasons: [],
  nextAction: "Call driver",
  nextActionDue: "2026-08-25T14:00:00.000Z",
  blockers: null,
  waitingOnExternal: false,
  phone: "(404) 563-9729",
  phoneLast4: "3333",
  completionPercent: 0,
  updatedAt: "2026-08-25T12:00:00.000Z",
  ...overrides,
});

test("uses one filtered dataset for queue counts and visible views", () => {
  const now = new Date("2026-08-25T15:00:00.000Z");
  const rows = [
    row({ id: 1, nextActionDue: "2026-08-25T19:00:00.000Z" }),
    row({ id: 2, nextActionDue: "2026-08-24T19:00:00.000Z", sourceChannelNormalized: "referral" }),
    row({ id: 3, waitingOnExternal: true, nextAction: null }),
    row({ id: 4, quality: "needs_review", qualityReasons: ["invalid_ready"], sourceChannelNormalized: "referral", nextAction: null }),
  ];
  const result = buildOperationalQueue(rows, { source: "referral", view: "needs_review" }, now);
  assert.equal(result.counts.all, 2);
  assert.equal(result.counts.overdue, 1);
  assert.equal(result.counts.noNextAction, 1);
  assert.equal(result.counts.needsReview, 1);
  assert.deepEqual(result.items.map((candidate) => candidate.id), [4]);
});