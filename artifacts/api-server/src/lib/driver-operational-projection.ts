import type { DriverStage } from "./stages";

export const OPERATIONAL_STEPS = [
  { number: 1, key: "application", label: "Application", gateKeys: ["application_esign"] },
  { number: 2, key: "clearinghouse", label: "Clearinghouse", gateKeys: ["clearinghouse_consent"] },
  { number: 3, key: "drug_test_scheduled", label: "Drug Test Scheduled", gateKeys: ["drug_test_scheduled"] },
  { number: 4, key: "medical_card", label: "Medical Card", gateKeys: ["medical_card"] },
  { number: 5, key: "drug_test_completed", label: "Drug Test Completed", gateKeys: ["drug_test_completed"] },
  { number: 6, key: "annual_inspection", label: "Annual Inspection", gateKeys: ["annual_inspection"] },
  { number: 7, key: "contract", label: "Contract", gateKeys: ["contract"] },
  { number: 8, key: "tag", label: "Tag", gateKeys: ["tag"] },
  { number: 9, key: "form_2290", label: "Form 2290", gateKeys: ["form_2290"] },
  { number: 10, key: "registration", label: "Registration", gateKeys: ["registration"] },
  { number: 11, key: "plate_number", label: "Plate Number", gateKeys: ["plate_number"] },
] as const;

export type OperationalStep = typeof OPERATIONAL_STEPS[number];
export type OperationalStepKey = OperationalStep["key"];
export type OperationalQuality = "ok" | "needs_review";
export type OperationalQualityReason =
  | "invalid_ready"
  | "non_sequential_completion"
  | "multi_person_import"
  | "missing_completion_data"
  | "missing_operational_owner";

export interface OperationalChecklistItem {
  gateKey: string;
  status: string;
  isMandatory?: boolean | null;
  sortOrder?: number | null;
}

export interface OperationalProjection {
  currentStepNumber: number;
  currentStepKey: OperationalStepKey;
  currentStepLabel: string;
  completedStepNumbers: number[];
  quality: OperationalQuality;
  qualityReasons: OperationalQualityReason[];
  recommendedOwnerId: number;
  recommendedOwnerName: string;
}

export const OPERATIONAL_WORKERS = {
  hardy: { id: 22, name: "Hardy" },
  mason: { id: 32, name: "Mason" },
  wayne: { id: 25, name: "Wayne" },
} as const;

export function operationalOwnerNameForStep(stepNumber: number, driverId: number): "Hardy" | "Mason" | "Wayne" {
  if (stepNumber >= 7) return "Hardy";
  return driverId % 2 === 0 ? "Mason" : "Wayne";
}

// These legacy/persisted checklist gates are routine supporting compliance
// work, but do not correspond to one of the 11 operational queue milestones.
// They must
// not turn every new driver into a data-quality exception.
const SUPPORTING_CHECKLIST_GATES = new Set([
  "drug_test_order",
  "medical_status",
  "road_test_cd",
  "dot_inspection",
  "lease_agreement",
  "offer_letter",
  "truck_vin_title",
  "truck_assignment",
  "equipment_shipment",
  "equipment_shipment_cd",
  "shipment_sent",
  "company_w9_ein",
  "plate_irp_ifta",
  "telegram_onboarding",
  "cdl_front",
  "cdl_back",
  "employment_history",
  "mvr_placeholder",
  "psp_placeholder",
  "road_test",
  "qualification_approval",
  "insurance",
  "eld_setup",
  "fuel_card",
  "dispatch_handoff",
  "i9_w4_direct_deposit",
  "orientation_training",
  "payroll_profile",
  "eld_credentials",
  "dispatch_handoff_cd",
]);

function isComplete(item: OperationalChecklistItem | undefined): boolean {
  return item?.status === "passed" || item?.status === "na";
}

export function hasCompletedPrecedingOperationalSteps(
  checklist: OperationalChecklistItem[],
  targetStepNumber: number,
): boolean {
  const byGate = new Map(checklist.map((item) => [item.gateKey, item]));
  return OPERATIONAL_STEPS
    .filter((step) => step.number < targetStepNumber)
    .every((step) => step.gateKeys.some((gateKey) => isComplete(byGate.get(gateKey))));
}

export function hasCompletedSubsequentOperationalSteps(
  checklist: OperationalChecklistItem[],
  targetStepNumber: number,
): boolean {
  const byGate = new Map(checklist.map((item) => [item.gateKey, item]));
  return OPERATIONAL_STEPS
    .filter((step) => step.number > targetStepNumber)
    .some((step) => step.gateKeys.some((gateKey) => isComplete(byGate.get(gateKey))));
}

function hasMultiplePeople(fullName: string): boolean {
  return /\s(?:and|&|\/|\+)\s|,\s/.test(fullName.trim().toLowerCase());
}

export function operationalOwnerForStep(stepNumber: number, driverId: number): { id: number; name: string } {
  const name = operationalOwnerNameForStep(stepNumber, driverId);
  return OPERATIONAL_WORKERS[name.toLowerCase() as keyof typeof OPERATIONAL_WORKERS];
}

export function operationalStepForGate(gateKey: string, _driverType: string): number | null {
  const step = OPERATIONAL_STEPS.find((candidate) => candidate.gateKeys.includes(gateKey as never));
  return step?.number ?? null;
}

export function deriveOperationalProjection(input: {
  driverId: number;
  fullName: string;
  driverType: string;
  stage: string;
  status: string;
  readyForDispatch: boolean;
  completionPercent: number;
  checklist: OperationalChecklistItem[];
}): OperationalProjection {
  const byGate = new Map(input.checklist.map((item) => [item.gateKey, item]));
  const completedStepNumbers = OPERATIONAL_STEPS
    .filter((step) => step.gateKeys.some((gateKey) => isComplete(byGate.get(gateKey))))
    .map((step) => step.number);
  const qualityReasons: OperationalQualityReason[] = [];

  const firstIncomplete = OPERATIONAL_STEPS.find((step) => (
    !step.gateKeys.some((gateKey) => isComplete(byGate.get(gateKey)))
  ));
  // Checklist sort order is the persisted execution sequence. A canonical
  // milestone can legitimately appear later or earlier than another milestone
  // in that sequence, so only flag a contradiction to *both* orders.
  const firstIncompleteItem = firstIncomplete?.gateKeys
    .map((gateKey) => byGate.get(gateKey))
    .find((item) => item != null);
  const contradictsPersistedSequence = OPERATIONAL_STEPS.some((step) => {
    if (!firstIncomplete || step.number <= firstIncomplete.number) return false;
    const completedItem = step.gateKeys.map((gateKey) => byGate.get(gateKey)).find(isComplete);
    return Boolean(
      completedItem
      && firstIncompleteItem
      && completedItem.sortOrder != null
      && firstIncompleteItem.sortOrder != null
      && completedItem.sortOrder > firstIncompleteItem.sortOrder,
    );
  });
  if (contradictsPersistedSequence) qualityReasons.push("non_sequential_completion");
  if (hasMultiplePeople(input.fullName)) qualityReasons.push("multi_person_import");
  if (input.checklist.length === 0 && input.completionPercent > 0) qualityReasons.push("missing_completion_data");

  const allMandatoryPassed = input.checklist.length > 0
    && input.checklist.filter((item) => item.isMandatory !== false).every((item) => isComplete(item));
  const incompleteUnmappedMandatory = input.checklist.some((item) => (
    item.isMandatory !== false
    && !isComplete(item)
    && operationalStepForGate(item.gateKey, input.driverType) === null
    && !SUPPORTING_CHECKLIST_GATES.has(item.gateKey)
  ));
  if (incompleteUnmappedMandatory) qualityReasons.push("missing_completion_data");
  const readyClaimed = input.readyForDispatch
    || input.status === "ready_for_dispatch"
    || input.stage === "dispatch_ready"
    || input.stage === "active";
  if (readyClaimed && !allMandatoryPassed) qualityReasons.push("invalid_ready");

  // Ready for dispatch is a driver status, not a twelfth operational step.
  // Keep the final milestone visible after all 11 steps are complete.
  let currentStep = firstIncomplete ?? OPERATIONAL_STEPS[OPERATIONAL_STEPS.length - 1];
  if (readyClaimed && allMandatoryPassed) currentStep = OPERATIONAL_STEPS[OPERATIONAL_STEPS.length - 1];
  const quality = qualityReasons.length > 0 ? "needs_review" : "ok";
  const owner = operationalOwnerForStep(currentStep.number, input.driverId);
  return {
    currentStepNumber: currentStep.number,
    currentStepKey: currentStep.key,
    currentStepLabel: currentStep.label,
    completedStepNumbers,
    quality,
    qualityReasons,
    recommendedOwnerId: owner.id,
    recommendedOwnerName: owner.name,
  };
}