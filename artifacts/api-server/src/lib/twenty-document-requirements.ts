import { asc, and, eq } from "drizzle-orm";
import { db, twentyDocumentRequirementsTable } from "@workspace/db";
import { TWENTY_DRIVER_STEPS } from "./twenty-driver-candidates";

export const DEFAULT_TWENTY_DOCUMENT_REQUIREMENTS = [
  { stepKey: "APPLICATION", requirementKey: "SIGNED_APPLICATION", label: "Signed driver application", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "APPLICATION", requirementKey: "CDL_COPY", label: "CDL copy", isMandatory: true, allowsManualCompletion: false, sortOrder: 2 },
  { stepKey: "CLEARINGHOUSE", requirementKey: "CLEARINGHOUSE_RESULT", label: "FMCSA Clearinghouse query / consent result", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "DRUG_TEST", requirementKey: "DRUG_TEST_RESULT", label: "Pre-employment drug test result / MRO report", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "CONTRACT", requirementKey: "SIGNED_CONTRACT", label: "Signed owner-operator / lease agreement", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "MEDICAL_CARD", requirementKey: "MEDICAL_CARD", label: "DOT medical examiner certificate", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "TITLE", requirementKey: "TITLE_OR_LEASE", label: "Vehicle title or lease copy", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "ANNUAL_INSPECTION", requirementKey: "ANNUAL_INSPECTION", label: "Annual DOT inspection report", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "SHIPMENT_NEED_TO_SEND", requirementKey: "NO_DOCUMENT", label: "No document required", isMandatory: false, allowsManualCompletion: true, sortOrder: 1 },
  { stepKey: "SHIPMENT_SENT", requirementKey: "SHIPMENT_CONFIRMATION", label: "Bill of Lading or shipment confirmation", isMandatory: false, allowsManualCompletion: true, sortOrder: 1 },
  { stepKey: "TWO_TWENTY_NINE", requirementKey: "FORM_2290", label: "IRS Form 2290 Schedule 1", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "PLATE_NUMBER", requirementKey: "PLATE_DOCUMENT", label: "Registration / plate document", isMandatory: true, allowsManualCompletion: false, sortOrder: 1 },
  { stepKey: "TELEGRAM_GROUP", requirementKey: "NO_DOCUMENT", label: "No document required", isMandatory: false, allowsManualCompletion: true, sortOrder: 1 },
] as const;

const CANONICAL_STEP_KEYS = new Set<string>(TWENTY_DRIVER_STEPS.map((step) => step.key));

export function assertCanonicalTwentyStepKey(stepKey: string): void {
  if (!CANONICAL_STEP_KEYS.has(stepKey)) {
    throw new Error(`Unsupported Twenty step key: ${stepKey}`);
  }
}

export async function seedTwentyDocumentRequirements(workspaceId: number): Promise<void> {
  await db.insert(twentyDocumentRequirementsTable).values(
    DEFAULT_TWENTY_DOCUMENT_REQUIREMENTS.map((requirement) => ({ workspaceId, ...requirement })),
  ).onConflictDoNothing();
}

export async function listTwentyDocumentRequirements(workspaceId: number) {
  const rows = await db.select().from(twentyDocumentRequirementsTable)
    .where(eq(twentyDocumentRequirementsTable.workspaceId, workspaceId))
    .orderBy(asc(twentyDocumentRequirementsTable.sortOrder), asc(twentyDocumentRequirementsTable.id));
  for (const row of rows) assertCanonicalTwentyStepKey(row.stepKey);
  return rows;
}

export async function getTwentyStepRequirements(workspaceId: number, stepKey: string) {
  assertCanonicalTwentyStepKey(stepKey);
  return db.select().from(twentyDocumentRequirementsTable)
    .where(and(
      eq(twentyDocumentRequirementsTable.workspaceId, workspaceId),
      eq(twentyDocumentRequirementsTable.stepKey, stepKey),
    ))
    .orderBy(asc(twentyDocumentRequirementsTable.sortOrder), asc(twentyDocumentRequirementsTable.id));
}