export interface FranklinWorkflowSyncDriver {
  completionPercent: number;
  operationalOwnerId: number | null;
  hardyHandoffAt: Date | null;
}

export function canReplaceUntouchedFranklinWorkflow(
  drivers: FranklinWorkflowSyncDriver[],
  checklistStatuses: string[],
  handoffCount: number,
): boolean {
  return handoffCount === 0
    && drivers.every((driver) => (
      driver.completionPercent === 0
      && driver.operationalOwnerId == null
      && driver.hardyHandoffAt == null
    ))
    && checklistStatuses.every((status) => status === "pending");
}