import assert from "node:assert/strict";
import test from "node:test";
import { DRIVER_OWNER_SECTIONS, groupDriverRows } from "./driver-owner-sections.ts";

test("renders the Three Twenty owners in their board order", () => {
  assert.deepEqual(
    DRIVER_OWNER_SECTIONS.map((section) => section.label),
    ["HARDY", "RECRUITER A", "RECRUITER B"],
  );
});

test("groups Twenty-backed rows by their persisted owner label", () => {
  const grouped = groupDriverRows([
    { operationalOwnerName: "Recruiter A" },
    { operationalOwnerName: "Hardy" },
    { operationalOwnerName: "Recruiter B" },
  ]);
  assert.equal(grouped.recruiter_a.length, 1);
  assert.equal(grouped.recruiter_b.length, 1);
  assert.equal(grouped.hardy.length, 1);
});