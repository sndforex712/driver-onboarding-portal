export type RecruitingLegacyProfileRow = {
  legacyPhone?: string | null;
  legacyDriverType?: string | null;
  legacyTruckYearMake?: string | null;
};

/**
 * Keeps legacy profile data explicit and nullable in operational case payloads.
 * Manually created cases have no Sheet profile and must never receive invented values.
 */
export function legacyDriverInfo(row: RecruitingLegacyProfileRow) {
  return {
    legacyPhone: row.legacyPhone ?? null,
    legacyDriverType: row.legacyDriverType ?? null,
    legacyTruckYearMake: row.legacyTruckYearMake ?? null,
  };
}