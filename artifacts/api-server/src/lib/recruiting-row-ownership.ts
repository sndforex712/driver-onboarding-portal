export const MAIN_JIDO_ROW_OWNERS = [
  { ownerId: 22, ownerName: "Hardy", firstRow: 2, lastRow: 23, responsibility: "SETUP + PACKAGE SENDING" },
  { ownerId: 32, ownerName: "Mason", firstRow: 25, lastRow: 48, responsibility: "APPLICATION / CLEARINGHOUSE / DRUG TEST" },
  { ownerId: 25, ownerName: "Wayne", firstRow: 49, lastRow: 71, responsibility: "APPLICATION / CLEARINGHOUSE / DRUG TEST" },
] as const;

export type MainJidoRowOwner = typeof MAIN_JIDO_ROW_OWNERS[number];

export function ownerForMainJidoRow(rowNumber: number): MainJidoRowOwner | null {
  return MAIN_JIDO_ROW_OWNERS.find(owner => rowNumber >= owner.firstRow && rowNumber <= owner.lastRow) ?? null;
}

export interface RowOwnershipSourceRow {
  rowNumber: number;
  name: string | null;
  sourceStatus: string;
  normalizedPhone: string | null;
  mappedCaseId: number | null;
}

export interface RowOwnershipCase {
  id: number;
  caseOwnerId: number | null;
  taskOwnerId: number | null;
}

export function isQualifyingOwnedSourceRow(row: RowOwnershipSourceRow): boolean {
  return ownerForMainJidoRow(row.rowNumber) !== null
    && ["active", "conflict"].includes(row.sourceStatus)
    && Boolean(row.name?.trim())
    && Boolean(row.normalizedPhone);
}

export function summarizeMainJidoOwnership(rows: RowOwnershipSourceRow[], cases: RowOwnershipCase[]) {
  const qualifyingRows = rows.filter(isQualifyingOwnedSourceRow);
  const assignments = qualifyingRows.map(row => ({
    ...row,
    owner: ownerForMainJidoRow(row.rowNumber)!,
  }));
  const byCase = new Map<number, typeof assignments>();
  for (const assignment of assignments) {
    if (assignment.mappedCaseId === null) continue;
    const existing = byCase.get(assignment.mappedCaseId) ?? [];
    existing.push(assignment);
    byCase.set(assignment.mappedCaseId, existing);
  }
  const crossRangeConflicts = [...byCase.entries()]
    .map(([caseId, caseRows]) => ({
      caseId,
      rows: caseRows,
      owners: [...new Map(caseRows.map(row => [row.owner.ownerId, row.owner])).values()],
    }))
    .filter(group => group.owners.length > 1);
  const unmatchedRows = qualifyingRows.filter(row => row.mappedCaseId === null);
  const caseById = new Map(cases.map(item => [item.id, item]));
  const proposed = [...byCase.entries()]
    .filter(([, caseRows]) => new Set(caseRows.map(row => row.owner.ownerId)).size === 1)
    .map(([caseId, caseRows]) => {
      const owner = caseRows[0]!.owner;
      const current = caseById.get(caseId);
      return {
        caseId,
        owner,
        sourceRows: caseRows,
        currentOwnerId: current?.caseOwnerId ?? null,
        taskOwnerId: current?.taskOwnerId ?? null,
        proposedOwnerId: owner.ownerId,
        alreadyCompliant: current?.caseOwnerId === owner.ownerId,
      };
    });
  const perWorker = MAIN_JIDO_ROW_OWNERS.map(owner => {
    const sourceRows = assignments.filter(row => row.owner.ownerId === owner.ownerId);
    const uniqueCases = new Set(sourceRows.flatMap(row => row.mappedCaseId === null ? [] : [row.mappedCaseId]));
    return {
      ...owner,
      qualifyingSourceRowCount: sourceRows.length,
      uniqueCaseCount: uniqueCases.size,
    };
  });
  return {
    qualifyingRows,
    assignments,
    byCase,
    crossRangeConflicts,
    unmatchedRows,
    proposed,
    perWorker,
    proposedChanges: proposed.filter(item => !item.alreadyCompliant),
    alreadyCompliant: proposed.filter(item => item.alreadyCompliant),
    taskOwnerChanges: 0,
    policyViolations: crossRangeConflicts.length,
  };
}