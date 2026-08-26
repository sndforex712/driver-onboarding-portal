import { and, count, eq, exists, gte, inArray, isNotNull, isNull, lte, notLike, or, type SQL } from "drizzle-orm";
import {
  db,
  recruitingCasesTable,
  recruitingSheetRowsTable,
} from "@workspace/db";

export type OperationalVisibilityQuery = Pick<typeof db, "select">;

export const MAIN_JIDO_WORKBOOK_ID = "1x0P28BzXkX1tAMCxGEc7p1_DFHDO8cAuIqTs3TyMfTc";
export const MAIN_JIDO_TAB_NAME = "MAIN JIDO FREIGHT LLC";
export const MAIN_JIDO_FIRST_DRIVER_ROW = 2;
export const MAIN_JIDO_LAST_DRIVER_ROW = 71;

export interface SheetRowEligibility {
  workbookId: string;
  tabName: string;
  rowNumber: number;
  sourceStatus: string;
  name: string | null;
  normalizedPhone: string | null;
}

export function isQualifyingMainJidoDriverRow(row: SheetRowEligibility): boolean {
  return row.workbookId === MAIN_JIDO_WORKBOOK_ID
    && row.tabName === MAIN_JIDO_TAB_NAME
    && row.rowNumber >= MAIN_JIDO_FIRST_DRIVER_ROW
    && row.rowNumber <= MAIN_JIDO_LAST_DRIVER_ROW
    && ["active", "conflict"].includes(row.sourceStatus)
    && Boolean(row.name?.trim())
    && Boolean(row.normalizedPhone);
}

export function isOperationallyEligibleCase(input: {
  sourceId: string | null;
  qualifyingSheetRow: boolean;
}): boolean {
  if (input.sourceId?.startsWith("dev-demo-recruiting:")) return false;
  if (input.sourceId?.startsWith("google-sheet:")) return input.qualifyingSheetRow;
  return true;
}

export async function hasImportedLegacyProfiles(query: OperationalVisibilityQuery, workspaceId: number): Promise<boolean> {
  const [result] = await query.select({ total: count() })
    .from(recruitingSheetRowsTable)
    .where(and(
      eq(recruitingSheetRowsTable.workspaceId, workspaceId),
      inArray(recruitingSheetRowsTable.sourceStatus, ["active", "historical", "conflict"]),
    ));
  return (result?.total ?? 0) > 0;
}

/**
 * The canonical operational scope used by Recruiting list, queue, detail,
 * counts, sync reruns, and any future rebalance. Sheet data is read only; this
 * only filters visibility.
 */
export function withOperationalVisibilityFilters(
  query: OperationalVisibilityQuery,
  workspaceId: number,
  conditions: SQL[],
  excludeDemo: boolean,
): SQL[] {
  const qualifyingMainJidoSource = query.select({ id: recruitingSheetRowsTable.id })
    .from(recruitingSheetRowsTable)
    .where(and(
      eq(recruitingSheetRowsTable.workspaceId, workspaceId),
      eq(recruitingSheetRowsTable.mappedCaseId, recruitingCasesTable.id),
      eq(recruitingSheetRowsTable.workbookId, MAIN_JIDO_WORKBOOK_ID),
      eq(recruitingSheetRowsTable.tabName, MAIN_JIDO_TAB_NAME),
      gte(recruitingSheetRowsTable.rowNumber, MAIN_JIDO_FIRST_DRIVER_ROW),
      lte(recruitingSheetRowsTable.rowNumber, MAIN_JIDO_LAST_DRIVER_ROW),
      inArray(recruitingSheetRowsTable.sourceStatus, ["active", "conflict"]),
      isNotNull(recruitingSheetRowsTable.name),
      isNotNull(recruitingSheetRowsTable.normalizedPhone),
    ));
  const filters: SQL[] = [
    or(
      isNull(recruitingCasesTable.sourceId),
      notLike(recruitingCasesTable.sourceId, "dev-demo-recruiting:%"),
    ) as SQL,
    or(
      isNull(recruitingCasesTable.sourceId),
      and(
        notLike(recruitingCasesTable.sourceId, "google-sheet:%"),
      ),
      exists(qualifyingMainJidoSource),
    ) as SQL,
  ];
  // Kept as an argument so existing callers retain their interface. Demo
  // source IDs are always excluded by the canonical predicate above.
  void excludeDemo;
  return [...conditions, ...filters];
}