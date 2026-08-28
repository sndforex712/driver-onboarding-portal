export type DriverOwnerSectionKey = "recruiter_a" | "recruiter_b" | "hardy";

export const DRIVER_OWNER_SECTIONS = [
  { key: "hardy", label: "HARDY", stepRange: "Steps 1–12" },
  { key: "recruiter_a", label: "RECRUITER A", stepRange: "Steps 1–12" },
  { key: "recruiter_b", label: "RECRUITER B", stepRange: "Steps 1–12" },
] as const satisfies ReadonlyArray<{
  key: DriverOwnerSectionKey;
  label: string;
  stepRange: string;
}>;

export interface DriverOwnerGroupingRow {
  operationalOwnerName: string | null;
}

function sectionKeyForOwner(ownerName: string | null | undefined): DriverOwnerSectionKey | null {
  switch (ownerName?.trim().toLowerCase()) {
    case "recruiter a":
      return "recruiter_a";
    case "recruiter b":
      return "recruiter_b";
    case "hardy":
      return "hardy";
    default:
      return null;
  }
}

export function groupDriverRows<T extends DriverOwnerGroupingRow>(
  rows: readonly T[],
): Record<DriverOwnerSectionKey, T[]> {
  const grouped: Record<DriverOwnerSectionKey, T[]> = {
    recruiter_a: [],
    recruiter_b: [],
    hardy: [],
  };
  for (const row of rows) {
    const section = sectionKeyForOwner(row.operationalOwnerName);
    if (section) grouped[section].push(row);
  }
  return grouped;
}