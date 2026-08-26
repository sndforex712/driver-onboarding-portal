import assert from "node:assert/strict";
import test from "node:test";
import { canReplaceUntouchedFranklinWorkflow } from "./franklin-workflow-sync-safety.ts";

const untouchedDriver = {
  completionPercent: 0,
  operationalOwnerId: null,
  hardyHandoffAt: null,
};

test("replaces only untouched all-pending legacy workflow state", () => {
  assert.equal(canReplaceUntouchedFranklinWorkflow([untouchedDriver], ["pending"], 0), true);
  assert.equal(canReplaceUntouchedFranklinWorkflow([untouchedDriver], ["passed"], 0), false);
  assert.equal(canReplaceUntouchedFranklinWorkflow([{ ...untouchedDriver, completionPercent: 9 }], [], 0), false);
  assert.equal(canReplaceUntouchedFranklinWorkflow([{ ...untouchedDriver, operationalOwnerId: 32 }], [], 0), false);
  assert.equal(canReplaceUntouchedFranklinWorkflow([untouchedDriver], [], 1), false);
});