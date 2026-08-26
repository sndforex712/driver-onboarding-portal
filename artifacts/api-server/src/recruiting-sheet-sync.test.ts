import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredRecruitingSheetTabs,
  CRM_OWNED_DRIVER_FIELDS,
  RECRUITING_SHEET_MAIN_TAB,
  recruitingSheetSyncTesting,
} from "./lib/recruiting-sheet-sync";
import { legacyDriverInfo } from "./lib/recruiting-list-item";

test("fetch allowlist contains only the JIDO first tab", () => {
  assert.deepEqual(configuredRecruitingSheetTabs(), [RECRUITING_SHEET_MAIN_TAB]);
  assert.equal(configuredRecruitingSheetTabs().includes("REFERAL O|O"), false);
  assert.equal(configuredRecruitingSheetTabs().includes("Eski qizil"), false);
  assert.equal(configuredRecruitingSheetTabs().includes("old driver"), false);
  assert.equal(configuredRecruitingSheetTabs().includes("fleet owner"), false);
});

test("Sheet sync names CRM-owned fields that refreshes must not overwrite", () => {
  assert.deepEqual(CRM_OWNED_DRIVER_FIELDS, [
    "operationalOwnerId",
    "operationalOwnerName",
    "assigneeId",
    "assigneeName",
    "nextBestAction",
    "nextActionDue",
    "blockers",
    "waitingOnExternal",
    "status",
  ]);
});

test("maps a public CSV legacy row without treating checklist evidence as completed workflow", () => {
  const csv = [
    '"Priority","Name","Phone number","Truck Year","Driver Type","Set updigi driverla ","Recruiter","Source","Application","Clearing House","Drug test ","Plate Number","TG","TITLE","ANN INSP","2290","Contract","med card ","Tracking number","e-mail","Address"',
    '"ASAP","Taylor Driver (TX)","(555) 222-3333","2020 INTL","OTR","CVRD 08/21","Jordan","Indeed","TRUE","TRUE","TRUE","FALSE","TRUE","FALSE","FALSE","FALSE","TRUE","TRUE","TRACK-1","driver@example.invalid","123 Main St"',
  ].join("\n");
  const [row] = recruitingSheetSyncTesting.buildRows("workbook", "MAIN JIDO FREIGHT LLC", csv);
  assert.equal(row?.normalizedPhone, "5552223333");
  assert.equal(row?.application, "TRUE");
  assert.equal(row?.trackingNumber, "TRACK-1");
  assert.equal(row?.rawPayload["Address"], "123 Main St");
  assert.equal(recruitingSheetSyncTesting.stageFor(row!).stage, "manager_review");
});

test("preserves physical row identity across blank lines and skipped section labels", () => {
  const csv = [
    "Readiness,Name,Phone Number",
    "ready,Ada Driver,555-0100",
    "",
    "SECTION: FOLLOW UP,,",
    "ready,Ben Driver,555-0101",
  ].join("\n");
  const rows = recruitingSheetSyncTesting.buildRows("workbook", "MAIN JIDO FREIGHT LLC", csv);
  assert.deepEqual(rows.map((row) => ({
    rowNumber: row.rowNumber,
    externalRowIdentity: row.externalRowIdentity,
    sourceStatus: row.sourceStatus,
    name: row.name,
  })), [
    { rowNumber: 2, externalRowIdentity: "MAIN JIDO FREIGHT LLC:2", sourceStatus: "active", name: "Ada Driver" },
    { rowNumber: 4, externalRowIdentity: "MAIN JIDO FREIGHT LLC:4", sourceStatus: "skipped", name: null },
    { rowNumber: 5, externalRowIdentity: "MAIN JIDO FREIGHT LLC:5", sourceStatus: "active", name: "Ben Driver" },
  ]);
});

test("retains historical rows and recognizes an unchanged active collision snapshot", () => {
  const csv = [
    '"Name","Weeks","Why left "',
    '"Historical Driver","23","No longer available"',
  ].join("\n");
  const [row] = recruitingSheetSyncTesting.buildRows("workbook", "old driver", csv);
  assert.equal(row?.sourceStatus, "historical");
  assert.equal(recruitingSheetSyncTesting.stageFor(row!).stage, "closed_lost");
  assert.equal(recruitingSheetSyncTesting.isUnchangedSnapshot({
    rawFingerprint: row!.rawFingerprint,
    sourceStatus: "conflict",
  }, row!), true);

  const activeCsv = [
    '"Priority","Name","Phone number"',
    '"ASAP","Active Driver","(555) 333-4444"',
  ].join("\n");
  const [activeRow] = recruitingSheetSyncTesting.buildRows("workbook", "MAIN JIDO FREIGHT LLC", activeCsv);
  assert.equal(recruitingSheetSyncTesting.isUnchangedSnapshot({
    rawFingerprint: activeRow!.rawFingerprint,
    sourceStatus: "conflict",
  }, activeRow!), true);
});

test("serializes real legacy driver info and leaves manual cases explicitly empty", () => {
  assert.deepEqual(legacyDriverInfo({
    legacyPhone: "5552223333",
    legacyDriverType: "OTR",
    legacyTruckYearMake: "2020 International LT",
  }), {
    legacyPhone: "5552223333",
    legacyDriverType: "OTR",
    legacyTruckYearMake: "2020 International LT",
  });
  assert.deepEqual(legacyDriverInfo({}), {
    legacyPhone: null,
    legacyDriverType: null,
    legacyTruckYearMake: null,
  });
});