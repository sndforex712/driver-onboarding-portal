import assert from "node:assert/strict";
import test from "node:test";
import { operationalOwnerNameForStep } from "./driver-operational-projection.ts";
import { mayAccessOperationalOwner, mayUpdateOperationalGate } from "./operational-access.ts";

test("canonical Step 6 stays with Mason or Wayne and Steps 7–11 route to Hardy", () => {
  assert.equal(operationalOwnerNameForStep(6, 2), "Mason");
  assert.equal(operationalOwnerNameForStep(6, 3), "Wayne");
  assert.equal(operationalOwnerNameForStep(7, 2), "Hardy");
  assert.equal(operationalOwnerNameForStep(11, 3), "Hardy");
});

test("cross-owner operational access is denied while Hardy retains manager-wide access", () => {
  assert.equal(mayAccessOperationalOwner("onboarding_specialist", 32, 32), true);
  assert.equal(mayAccessOperationalOwner("onboarding_specialist", 32, 25), false);
  assert.equal(mayAccessOperationalOwner("onboarding_specialist", 32, 22), false);
  assert.equal(mayAccessOperationalOwner("manager", 22, 32), true);
});

test("specialists cannot write Hardy milestones or another specialist's driver", () => {
  assert.equal(mayUpdateOperationalGate("onboarding_specialist", 32, 32, 32), true);
  assert.equal(mayUpdateOperationalGate("onboarding_specialist", 32, 32, 22), false);
  assert.equal(mayUpdateOperationalGate("onboarding_specialist", 32, 25, 32), false);
  assert.equal(mayUpdateOperationalGate("manager", 22, 32, 32), true);
});