import { createHash } from "node:crypto";
import { ownerForMainJidoRow } from "./recruiting-row-ownership";
import { operationalOwnerForStep } from "./driver-operational-projection";

// These values are owned by Franklins CRM once a driver record exists. Sheet
// snapshots remain raw provenance only; refreshes must never overwrite them.
export const CRM_OWNED_DRIVER_FIELDS = [
  "operationalOwnerId",
  "operationalOwnerName",
  "assigneeId",
  "assigneeName",
  "nextBestAction",
  "nextActionDue",
  "blockers",
  "waitingOnExternal",
  "status",
] as const;
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";
import {
  appUsersTable,
  db,
  driversTable,
  leadsTable,
  recruitingCaseEventsTable,
  recruitingCasesTable,
  recruitingSheetRowsTable,
  recruitingSheetSyncRunsTable,
  workspaceMembershipsTable,
} from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_WORKBOOK_ID = "1x0P28BzXkX1tAMCxGEc7p1_DFHDO8cAuIqTs3TyMfTc";
export const RECRUITING_SHEET_MAIN_TAB = "MAIN JIDO FREIGHT LLC";
export type SheetSyncCounts = {
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  rowsSkipped: number;
  rowsConflicted: number;
  rowsMissing: number;
  errorCount: number;
};

export type SheetSyncResult = SheetSyncCounts & {
  status: "succeeded" | "failed" | "busy";
  runId: number | null;
  startedAt: string;
  finishedAt: string;
  message?: string;
};

type LegacyRow = {
  tabName: string;
  rowNumber: number;
  externalRowIdentity: string;
  sourceStatus: "active" | "historical" | "skipped";
  name: string | null;
  phoneRaw: string | null;
  normalizedPhone: string | null;
  readinessText: string | null;
  truckYearMake: string | null;
  driverType: string | null;
  legacyNote: string | null;
  recruiterDisplayName: string | null;
  sourceText: string | null;
  application: string | null;
  clearingHouse: string | null;
  drugTest: string | null;
  plateNumber: string | null;
  tg: string | null;
  title: string | null;
  annInsp: string | null;
  twoTwentyNine: string | null;
  contract: string | null;
  medCard: string | null;
  trackingNumber: string | null;
  email: string | null;
  address: string | null;
  rawPayload: Record<string, string>;
  rawFingerprint: string;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
let inFlight = false;

function setting(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

export const recruitingSheetSyncConfig = {
  // External reads are disabled everywhere unless a developer explicitly opts in.
  // This DEV/DEMO portal must never reach a real Sheet merely because it started.
  enabled: flag("RECRUITING_SHEET_SYNC_ENABLED", false),
  workbookId: setting("RECRUITING_SHEET_WORKBOOK_ID", DEFAULT_WORKBOOK_ID),
  // Deliberately explicit: the operational board is sourced from the JIDO
  // first tab only. No environment variable can widen this allowlist.
  tabs: [RECRUITING_SHEET_MAIN_TAB],
  intervalMs: Math.max(60_000, Number(setting("RECRUITING_SHEET_SYNC_INTERVAL_MS", "900000")) || 900_000),
  timeoutMs: Math.max(2_000, Number(setting("RECRUITING_SHEET_FETCH_TIMEOUT_MS", "15000")) || 15_000),
};

export function configuredRecruitingSheetTabs(): string[] {
  return [...recruitingSheetSyncConfig.tabs];
}

function clean(value: string | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

interface ParsedCsvRow {
  cells: string[];
  rowNumber: number;
}

function parseCsv(csv: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let rowNumber = 1;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    const next = csv[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push({ cells: row, rowNumber });
      rowNumber += 1;
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => clean(value))) rows.push({ cells: row, rowNumber });
  return rows;
}

function getValue(
  raw: Record<string, string>,
  aliases: string[],
  fallbackIndex?: number,
): string | null {
  const byHeader = Object.entries(raw).find(([header, value]) =>
    aliases.includes(normalizedHeader(header)) && clean(value),
  )?.[1];
  if (byHeader) return clean(byHeader);
  return fallbackIndex === undefined ? null : clean(raw[`column_${fallbackIndex}`]);
}

function tabKind(tabName: string): "main" | "referral" | "historical" | "fleet" | "unknown" {
  const value = tabName.toLowerCase();
  if (value.includes("refer")) return "referral";
  if (value.includes("eski") || value.includes("old")) return "historical";
  if (value.includes("fleet")) return "fleet";
  if (tabName === RECRUITING_SHEET_MAIN_TAB || value.includes("process") || value.includes("drug")) return "main";
  return "unknown";
}

function buildRows(workbookId: string, tabName: string, csv: string): LegacyRow[] {
  const parsed = parseCsv(csv);
  if (parsed.length <= 1) return [];
  const [headerRow, ...data] = parsed;
  const headers = headerRow!.cells;
  const kind = tabKind(tabName);
  return data.flatMap(({ cells, rowNumber }) => {
    if (!cells.some((value) => clean(value))) return [];
    const raw: Record<string, string> = {};
    cells.forEach((cell, column) => {
      const header = clean(headers[column]) || `column_${column}`;
      raw[header === "column_0" && raw[header] !== undefined ? `column_${column}` : header] = cell;
    });

    const fleet = kind === "fleet";
    const historical = kind === "historical";
    const name = fleet
      ? getValue(raw, ["cdname"], 6)
      : getValue(raw, ["name", "drivername", "a"], 1);
    const phoneRaw = fleet
      ? getValue(raw, ["cdphonenumber"], 7)
      : getValue(raw, ["phonenumber", "phone", "a"], 2);
    const legacyNote = fleet
      ? getValue(raw, ["comment"], 9)
      : historical
        ? [getValue(raw, ["weeks"], 1), getValue(raw, ["whyleft"], 2), getValue(raw, ["whynotbacknimeqiseqaytadi"], 3)]
          .filter(Boolean).join(" | ") || null
        : getValue(raw, ["setupdigidriverla"], 5);
    const recruiter = fleet
      ? "Fleet owner"
      : getValue(raw, ["recruiter"], 6) ?? "Legacy sheet recruiter";
    const sourceText = fleet
      ? getValue(raw, ["fleetownername"], 2) ?? "Fleet owner"
      : getValue(raw, ["source"], 7);
    const row: Omit<LegacyRow, "rawFingerprint"> = {
      tabName,
      rowNumber,
      externalRowIdentity: `${tabName}:${rowNumber}`,
      sourceStatus: historical ? "historical" : name && (phoneRaw || fleet) ? "active" : "skipped",
      name,
      phoneRaw,
      normalizedPhone: normalizePhone(phoneRaw),
      readinessText: getValue(raw, ["readiness", "priority"], 0),
      truckYearMake: fleet ? getValue(raw, ["truck"], 1) : getValue(raw, ["truckyear"], 3),
      driverType: getValue(raw, ["drivertype"], 4),
      legacyNote,
      recruiterDisplayName: recruiter,
      sourceText,
      application: getValue(raw, ["application"], 8),
      clearingHouse: getValue(raw, ["clearinghouse"], 9),
      drugTest: getValue(raw, ["drugtest"], 10),
      plateNumber: getValue(raw, ["platenumber"], 11),
      tg: getValue(raw, ["tg"], 12),
      title: getValue(raw, ["title"], 13),
      annInsp: getValue(raw, ["anninsp"], 14),
      twoTwentyNine: getValue(raw, ["2290"], 15),
      contract: getValue(raw, ["contract"], 16),
      medCard: getValue(raw, ["medcard"], 17),
      trackingNumber: getValue(raw, ["trackingnumber"], 18),
      email: getValue(raw, ["email", "emailaddress"], 19),
      address: getValue(raw, ["address"], 20),
      rawPayload: raw,
    };
    return { ...row, rawFingerprint: fingerprint({ workbookId, ...row }) };
  });
}

function truthyFlag(value: string | null): boolean {
  return value?.trim().toLowerCase() === "true";
}

function stageFor(row: LegacyRow): { stage: string; lifecycle: "active" | "closed_lost"; reason?: string; note?: string } {
  if (row.sourceStatus === "historical") {
    return {
      stage: "closed_lost",
      lifecycle: "closed_lost",
      reason: "other",
      note: row.legacyNote || `Historical record imported from ${row.tabName}.`,
    };
  }
  // Checklist values are evidence from a legacy source, not a replacement for
  // the app's Recruiter → Manager → Recruiter handoff. Keep the case at the
  // review gate while retaining its closest suggested compliance/contract
  // state in the immutable profile snapshot and audit payload.
  if (truthyFlag(row.application) || truthyFlag(row.clearingHouse) || truthyFlag(row.drugTest)
    || truthyFlag(row.contract) || truthyFlag(row.medCard)) {
    return { stage: "manager_review", lifecycle: "active" };
  }
  return { stage: "application_sent", lifecycle: "active" };
}

function dueAt(priority: string | null, now: Date): Date {
  const value = priority?.toLowerCase() ?? "";
  const hours = value.includes("asap") ? 4 : value.includes("week") ? 48 : 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function driverType(value: string | null): "owner_operator" | "company_driver" {
  return value?.toLowerCase().includes("company") ? "company_driver" : "owner_operator";
}

async function fetchTab(tabName: string): Promise<string> {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${recruitingSheetSyncConfig.workbookId}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("sheet", tabName);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), recruitingSheetSyncConfig.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: "text/csv" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Google Sheets export returned HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google Sheets export failed");
}

async function ensureRecruiter(tx: Transaction, workspaceId: number, displayName: string | null): Promise<number> {
  const requested = clean(displayName ?? undefined) || "Legacy sheet recruiter";
  const users = await tx.select().from(appUsersTable);
  let user = users.find((candidate) => candidate.name.trim().toLowerCase() === requested.toLowerCase());
  if (!user) {
    const token = fingerprint(requested).slice(0, 16);
    [user] = await tx.insert(appUsersTable).values({
      name: requested,
      email: `legacy-recruiter-${token}@internal.invalid`,
      role: "recruiter",
      avatarInitials: requested.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LR",
      isCurrentSession: "false",
    }).onConflictDoNothing().returning();
    if (!user) {
      [user] = await tx.select().from(appUsersTable)
        .where(eq(appUsersTable.email, `legacy-recruiter-${token}@internal.invalid`));
    }
  }
  if (!user) throw new Error("Could not resolve internal recruiter identity");
  await tx.insert(workspaceMembershipsTable).values({
    workspaceId,
    userId: user.id,
    role: "recruiter",
  }).onConflictDoNothing();
  return user.id;
}

async function createOrResolveCase(tx: Transaction, workspaceId: number, row: LegacyRow, now: Date): Promise<{ caseId: number; conflict: boolean }> {
  const sourceId = `google-sheet:${recruitingSheetSyncConfig.workbookId}:${row.externalRowIdentity}`;
  const [sameSource] = await tx.select().from(recruitingCasesTable).where(and(
    eq(recruitingCasesTable.workspaceId, workspaceId),
    eq(recruitingCasesTable.sourceId, sourceId),
  ));
  if (sameSource) return { caseId: sameSource.id, conflict: false };

  // A MAIN JIDO physical source row is the authoritative identity. Reused
  // phone/email values may be legitimate distinct in-process entries, so never
  // merge a different source row based on contact fields alone.
  let driver;
  [driver] = await tx.select().from(driversTable).where(and(
    eq(driversTable.workspaceId, workspaceId),
    eq(driversTable.externalRecruitId, sourceId),
  )).limit(1);

  let lead;
  if (driver?.leadId) {
    [lead] = await tx.select().from(leadsTable).where(and(eq(leadsTable.id, driver.leadId), eq(leadsTable.workspaceId, workspaceId)));
  }
  if (!lead) {
    [lead] = await tx.select().from(leadsTable).where(and(
      eq(leadsTable.workspaceId, workspaceId),
      eq(leadsTable.externalRecruitId, sourceId),
    )).limit(1);
  }
  const recruiterId = await ensureRecruiter(tx, workspaceId, row.recruiterDisplayName);
  if (!lead) {
    [lead] = await tx.insert(leadsTable).values({
      workspaceId,
      fullName: row.name || "Unnamed legacy driver",
      phoneRaw: row.phoneRaw,
      phoneNormalized: row.normalizedPhone,
      email: row.email,
      recruiterName: row.recruiterDisplayName || "Legacy sheet recruiter",
      sourceChannel: row.sourceText || `Google Sheet: ${row.tabName}`,
      externalRecruitId: sourceId,
      notes: row.legacyNote,
    }).returning();
  }
  if (!driver) {
    [driver] = await tx.insert(driversTable).values({
      workspaceId,
      leadId: lead.id,
      fullName: row.name || "Unnamed legacy driver",
      phone: row.phoneRaw,
      email: row.email,
      driverType: driverType(row.driverType),
      status: "pre_hire",
      stage: "Application",
      priority: row.readinessText || "medium",
      recruiterName: row.recruiterDisplayName || "Legacy sheet recruiter",
      sourceChannel: row.sourceText || `Google Sheet: ${row.tabName}`,
      assigneeId: recruiterId,
      assigneeName: row.recruiterDisplayName || "Legacy sheet recruiter",
      truckInfo: row.truckYearMake,
      externalRecruitId: sourceId,
      nextBestAction: "Review imported legacy recruiting profile and continue the standard Recruiting handoff.",
    }).returning();
    const initialOperationalOwner = operationalOwnerForStep(1, driver.id);
    await tx.update(driversTable).set({
      operationalOwnerId: initialOperationalOwner.id,
      operationalOwnerName: initialOperationalOwner.name,
    }).where(and(eq(driversTable.id, driver.id), eq(driversTable.workspaceId, workspaceId)));
  }

  const existingCases = await tx.select().from(recruitingCasesTable).where(and(
    eq(recruitingCasesTable.workspaceId, workspaceId),
    eq(recruitingCasesTable.driverId, driver.id),
  )).orderBy(asc(recruitingCasesTable.id)).limit(1);
  if (existingCases[0]) return { caseId: existingCases[0].id, conflict: true };

  const mapping = stageFor(row);
  const nextActionDueAt = dueAt(row.readinessText, now);
  const caseNumber = `GS-${fingerprint(sourceId).slice(0, 12).toUpperCase()}`;
  const [created] = await tx.insert(recruitingCasesTable).values({
    workspaceId,
    driverId: driver.id,
    leadId: lead.id,
    caseNumber,
    sourceId,
    stage: mapping.stage,
    lifecycle: mapping.lifecycle,
    caseOwnerId: recruiterId,
    taskOwnerId: mapping.lifecycle === "active" ? recruiterId : null,
    nextAction: mapping.lifecycle === "active"
      ? "Review imported legacy recruiting profile and continue the standard Recruiting handoff."
      : null,
    nextActionDueAt: mapping.lifecycle === "active" ? nextActionDueAt : null,
    slaDeadlineAt: mapping.lifecycle === "active" ? nextActionDueAt : null,
    closedLostReason: mapping.reason ?? null,
    closedLostNote: mapping.note ?? null,
  }).returning();
  return { caseId: created!.id, conflict: false };
}

async function appendAuditEvent(
  tx: Transaction,
  workspaceId: number,
  caseId: number | null,
  eventType: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!caseId) return;
  const [caseRow] = await tx.select({
    stage: recruitingCasesTable.stage,
    version: recruitingCasesTable.version,
  }).from(recruitingCasesTable).where(and(
    eq(recruitingCasesTable.workspaceId, workspaceId),
    eq(recruitingCasesTable.id, caseId),
  ));
  if (!caseRow) return;
  await tx.insert(recruitingCaseEventsTable).values({
    workspaceId,
    recruitingCaseId: caseId,
    transitionIdempotencyKey: idempotencyKey,
    eventType,
    fromStage: caseRow.stage,
    toStage: caseRow.stage,
    actorUserId: null,
    caseVersion: caseRow.version,
    payload,
  }).onConflictDoNothing();
}

function profileValues(row: LegacyRow, now: Date, sourceStatus: LegacyRow["sourceStatus"] | "conflict" | "missing") {
  return {
    normalizedPhone: row.normalizedPhone,
    rawFingerprint: row.rawFingerprint,
    sourceStatus,
    readinessText: row.readinessText,
    name: row.name,
    phoneRaw: row.phoneRaw,
    truckYearMake: row.truckYearMake,
    driverType: row.driverType,
    legacyNote: row.legacyNote,
    recruiterDisplayName: row.recruiterDisplayName,
    sourceText: row.sourceText,
    application: row.application,
    clearingHouse: row.clearingHouse,
    drugTest: row.drugTest,
    plateNumber: row.plateNumber,
    tg: row.tg,
    title: row.title,
    annInsp: row.annInsp,
    twoTwentyNine: row.twoTwentyNine,
    contract: row.contract,
    medCard: row.medCard,
    trackingNumber: row.trackingNumber,
    email: row.email,
    address: row.address,
    rawPayload: row.rawPayload,
    lastSeenAt: sourceStatus === "missing" ? undefined : now,
    lastSyncedAt: now,
    missingSince: sourceStatus === "missing" ? now : null,
  };
}

function isUnchangedSnapshot(
  existing: { rawFingerprint: string; sourceStatus: string } | undefined,
  row: LegacyRow,
): boolean {
  return existing?.rawFingerprint === row.rawFingerprint
    && (existing.sourceStatus === row.sourceStatus
      || (existing.sourceStatus === "conflict" && ["active", "historical"].includes(row.sourceStatus)));
}

export async function runRecruitingSheetSync(workspaceId: number): Promise<SheetSyncResult> {
  const started = new Date();
  const counts: SheetSyncCounts = {
    rowsFetched: 0, rowsCreated: 0, rowsUpdated: 0, rowsUnchanged: 0,
    rowsSkipped: 0, rowsConflicted: 0, rowsMissing: 0, errorCount: 0,
  };
  if (inFlight) {
    return { ...counts, status: "busy", runId: null, startedAt: started.toISOString(), finishedAt: new Date().toISOString(), message: "A sync is already running in this API process." };
  }
  inFlight = true;
  try {
    const exports = await Promise.all(recruitingSheetSyncConfig.tabs.map(async (tabName) => ({
      tabName,
      csv: await fetchTab(tabName),
    })));
    const rows = exports.flatMap(({ tabName, csv }) => buildRows(recruitingSheetSyncConfig.workbookId, tabName, csv));
    counts.rowsFetched = rows.length;
    const sourceFingerprint = fingerprint(rows.map((row) => [row.externalRowIdentity, row.rawFingerprint]));
    const result = await db.transaction(async (tx) => {
      const lock = await tx.execute<{ acquired: boolean }>(sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`recruiting-sheet:${workspaceId}:${recruitingSheetSyncConfig.workbookId}`})) AS acquired
      `);
      if (!lock.rows[0]?.acquired) return { status: "busy" as const, runId: null };
      const [run] = await tx.insert(recruitingSheetSyncRunsTable).values({
        workspaceId,
        workbookId: recruitingSheetSyncConfig.workbookId,
        status: "running",
        rowsFetched: counts.rowsFetched,
        sourceFingerprint,
      }).returning();
      const now = new Date();
      const seen = new Set<string>();
      for (const row of rows) {
        seen.add(row.externalRowIdentity);
        const [existing] = await tx.select().from(recruitingSheetRowsTable).where(and(
          eq(recruitingSheetRowsTable.workspaceId, workspaceId),
          eq(recruitingSheetRowsTable.workbookId, recruitingSheetSyncConfig.workbookId),
          eq(recruitingSheetRowsTable.externalRowIdentity, row.externalRowIdentity),
        ));
        if (row.sourceStatus === "skipped") {
          counts.rowsSkipped += 1;
          if (!existing) {
            await tx.insert(recruitingSheetRowsTable).values({
              workspaceId,
              workbookId: recruitingSheetSyncConfig.workbookId,
              tabName: row.tabName,
              rowNumber: row.rowNumber,
              externalRowIdentity: row.externalRowIdentity,
              ...profileValues(row, now, "skipped"),
            });
          } else if (existing.rawFingerprint !== row.rawFingerprint || existing.sourceStatus !== "skipped") {
            await tx.update(recruitingSheetRowsTable).set(profileValues(row, now, "skipped")).where(eq(recruitingSheetRowsTable.id, existing.id));
            counts.rowsUpdated += 1;
          } else {
            counts.rowsUnchanged += 1;
          }
          continue;
        }
        if (isUnchangedSnapshot(existing, row)) {
          await tx.update(recruitingSheetRowsTable).set({ lastSeenAt: now, lastSyncedAt: now, missingSince: null }).where(eq(recruitingSheetRowsTable.id, existing.id));
          counts.rowsUnchanged += 1;
          continue;
        }
        const resolved = row.sourceStatus === "historical"
          ? row.normalizedPhone || row.name ? await createOrResolveCase(tx, workspaceId, row, now) : null
          : row.name && row.normalizedPhone ? await createOrResolveCase(tx, workspaceId, row, now) : null;
        const rowOwner = row.tabName === RECRUITING_SHEET_MAIN_TAB ? ownerForMainJidoRow(row.rowNumber) : null;
        if (resolved && rowOwner) {
          const [mappedCase] = await tx.select().from(recruitingCasesTable).where(and(
            eq(recruitingCasesTable.workspaceId, workspaceId),
            eq(recruitingCasesTable.id, resolved.caseId),
          ));
          if (mappedCase && mappedCase.caseOwnerId !== rowOwner.ownerId) {
            const [reassigned] = await tx.update(recruitingCasesTable).set({
              caseOwnerId: rowOwner.ownerId,
              version: mappedCase.version + 1,
            }).where(and(
              eq(recruitingCasesTable.id, mappedCase.id),
              eq(recruitingCasesTable.version, mappedCase.version),
            )).returning();
            if (!reassigned) throw new Error(`Source-row ownership changed while syncing ${row.externalRowIdentity}`);
            await appendAuditEvent(tx, workspaceId, reassigned.id, "main_jido_row_owner_reconciled",
              `main-jido-row-owner-reconciled:${row.externalRowIdentity}:${row.rawFingerprint}`, {
                rowNumber: row.rowNumber, ownerId: rowOwner.ownerId, taskOwnerChanged: false,
              });
          }
        }
        const sourceStatus = resolved?.conflict ? "conflict" : row.sourceStatus;
        if (resolved?.conflict) counts.rowsConflicted += 1;
        if (!resolved && row.sourceStatus === "active") counts.rowsSkipped += 1;
        const values = {
          ...profileValues(row, now, sourceStatus),
          mappedCaseId: resolved?.caseId ?? existing?.mappedCaseId ?? null,
        };
        if (existing) {
          await tx.update(recruitingSheetRowsTable).set(values).where(eq(recruitingSheetRowsTable.id, existing.id));
          counts.rowsUpdated += 1;
          await appendAuditEvent(tx, workspaceId, values.mappedCaseId, "legacy_sheet_snapshot_updated",
            `sheet-update:${row.externalRowIdentity}:${row.rawFingerprint}`, {
              tabName: row.tabName, rowNumber: row.rowNumber, sourceStatus,
            });
        } else {
          await tx.insert(recruitingSheetRowsTable).values({
            workspaceId,
            workbookId: recruitingSheetSyncConfig.workbookId,
            tabName: row.tabName,
            rowNumber: row.rowNumber,
            externalRowIdentity: row.externalRowIdentity,
            ...values,
          });
          counts.rowsCreated += 1;
          await appendAuditEvent(tx, workspaceId, values.mappedCaseId,
            sourceStatus === "conflict" ? "legacy_sheet_phone_collision" : "legacy_sheet_imported",
            `sheet-import:${row.externalRowIdentity}:${row.rawFingerprint}`, {
              tabName: row.tabName, rowNumber: row.rowNumber, sourceStatus,
            });
        }
      }
      const prior = await tx.select().from(recruitingSheetRowsTable).where(and(
        eq(recruitingSheetRowsTable.workspaceId, workspaceId),
        eq(recruitingSheetRowsTable.workbookId, recruitingSheetSyncConfig.workbookId),
        ne(recruitingSheetRowsTable.sourceStatus, "missing"),
      ));
      for (const row of prior) {
        if (seen.has(row.externalRowIdentity)) continue;
        await tx.update(recruitingSheetRowsTable).set({
          sourceStatus: "missing",
          missingSince: now,
          lastSyncedAt: now,
        }).where(eq(recruitingSheetRowsTable.id, row.id));
        counts.rowsMissing += 1;
        await appendAuditEvent(tx, workspaceId, row.mappedCaseId, "legacy_sheet_source_missing",
          `sheet-missing:${row.id}:${run!.id}`, { tabName: row.tabName, rowNumber: row.rowNumber });
      }
      const finishedAt = new Date();
      await tx.update(recruitingSheetSyncRunsTable).set({
        status: "succeeded",
        finishedAt,
        durationMs: finishedAt.getTime() - started.getTime(),
        ...counts,
      }).where(eq(recruitingSheetSyncRunsTable.id, run!.id));
      return { status: "succeeded" as const, runId: run!.id };
    });
    const finishedAt = new Date();
    return { ...counts, ...result, startedAt: started.toISOString(), finishedAt: finishedAt.toISOString() };
  } catch (error) {
    counts.errorCount += 1;
    const message = error instanceof Error ? error.message : "Unknown Sheet sync error";
    logger.error({ err: error, workbookId: recruitingSheetSyncConfig.workbookId }, "Recruiting Sheet sync failed");
    const finishedAt = new Date();
    await db.insert(recruitingSheetSyncRunsTable).values({
      workspaceId,
      workbookId: recruitingSheetSyncConfig.workbookId,
      status: "failed",
      startedAt: started,
      finishedAt,
      durationMs: finishedAt.getTime() - started.getTime(),
      ...counts,
      errorMessage: message.slice(0, 1000),
    }).catch((logError) => logger.error({ err: logError }, "Could not record Recruiting Sheet sync failure"));
    return { ...counts, status: "failed", runId: null, startedAt: started.toISOString(), finishedAt: finishedAt.toISOString(), message };
  } finally {
    inFlight = false;
  }
}

export async function getRecruitingSheetSyncStatus(workspaceId: number) {
  const [lastRun] = await db.select().from(recruitingSheetSyncRunsTable).where(and(
    eq(recruitingSheetSyncRunsTable.workspaceId, workspaceId),
    eq(recruitingSheetSyncRunsTable.workbookId, recruitingSheetSyncConfig.workbookId),
  )).orderBy(sql`${recruitingSheetSyncRunsTable.id} DESC`).limit(1);
  const [activeProfiles] = await db.select({ count: sql<number>`count(*)::int` }).from(recruitingSheetRowsTable).where(and(
    eq(recruitingSheetRowsTable.workspaceId, workspaceId),
    eq(recruitingSheetRowsTable.workbookId, recruitingSheetSyncConfig.workbookId),
    inArray(recruitingSheetRowsTable.sourceStatus, ["active", "historical", "conflict"]),
  ));
  return {
    enabled: recruitingSheetSyncConfig.enabled,
    workbookId: recruitingSheetSyncConfig.workbookId,
    intervalMs: recruitingSheetSyncConfig.intervalMs,
    nextRunAt: lastRun?.finishedAt
      ? new Date(lastRun.finishedAt.getTime() + recruitingSheetSyncConfig.intervalMs).toISOString()
      : null,
    profileCount: activeProfiles?.count ?? 0,
    lastRun: lastRun ?? null,
  };
}

export function startRecruitingSheetSyncScheduler(workspaceId: number): (() => void) | null {
  if (!recruitingSheetSyncConfig.enabled) {
    logger.info("Recruiting Sheet sync scheduler is disabled");
    return null;
  }
  const trigger = () => {
    void runRecruitingSheetSync(workspaceId).then((result) => {
      logger.info({
        runId: result.runId,
        status: result.status,
        rowsFetched: result.rowsFetched,
        rowsCreated: result.rowsCreated,
        rowsUpdated: result.rowsUpdated,
        rowsUnchanged: result.rowsUnchanged,
        rowsSkipped: result.rowsSkipped,
        rowsConflicted: result.rowsConflicted,
        rowsMissing: result.rowsMissing,
        errorCount: result.errorCount,
      }, "Recruiting Sheet sync completed");
    });
  };
  trigger();
  const timer = setInterval(trigger, recruitingSheetSyncConfig.intervalMs);
  timer.unref();
  logger.info({ intervalMs: recruitingSheetSyncConfig.intervalMs }, "Recruiting Sheet sync scheduler started");
  return () => clearInterval(timer);
}

export const recruitingSheetSyncTesting = {
  buildRows,
  isUnchangedSnapshot,
  normalizePhone,
  stageFor,
};