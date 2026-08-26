// The operational checklist is intentionally a single, ordered workflow for
// both driver types. Ownership changes after Step 6, not based on driver type.
export const OPERATIONAL_CHECKLIST_TEMPLATE = [
  { gateKey: "application_esign", label: "Application", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 1 },
  { gateKey: "clearinghouse_consent", label: "Clearinghouse", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 2 },
  { gateKey: "drug_test_scheduled", label: "Drug Test Scheduled", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 3 },
  { gateKey: "medical_card", label: "Medical Card", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 4 },
  { gateKey: "drug_test_completed", label: "Drug Test Completed", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 5 },
  { gateKey: "annual_inspection", label: "Annual Inspection", gateCategory: "specialist_operations", appliesTo: "both", isMandatory: true, sortOrder: 6 },
  { gateKey: "contract", label: "Contract", gateCategory: "manager_operations", appliesTo: "both", isMandatory: true, sortOrder: 7 },
  { gateKey: "tag", label: "Tag", gateCategory: "manager_operations", appliesTo: "both", isMandatory: true, sortOrder: 8 },
  { gateKey: "form_2290", label: "Form 2290", gateCategory: "manager_operations", appliesTo: "both", isMandatory: true, sortOrder: 9 },
  { gateKey: "registration", label: "Registration", gateCategory: "manager_operations", appliesTo: "both", isMandatory: true, sortOrder: 10 },
  { gateKey: "plate_number", label: "Plate Number", gateCategory: "manager_operations", appliesTo: "both", isMandatory: true, sortOrder: 11 },
] as const;

export const MANDATORY_OPERATIONAL_GATES = OPERATIONAL_CHECKLIST_TEMPLATE.map((step) => step.gateKey);

export function getMandatoryGatesForDriver(_driverType: string): string[] {
  return [...MANDATORY_OPERATIONAL_GATES];
}

export function getChecklistTemplateForDriver(_driverType: string) {
  return [...OPERATIONAL_CHECKLIST_TEMPLATE];
}
