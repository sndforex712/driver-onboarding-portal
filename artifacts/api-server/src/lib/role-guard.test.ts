import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_CAPABILITIES, type AppRole } from "./role-capabilities.ts";

const roles: AppRole[] = [
  "owner_admin",
  "manager",
  "recruiter",
  "onboarding_specialist",
  "compliance_reviewer",
  "dispatcher_readonly",
];

test("all six supported roles have an explicit capability policy", () => {
  assert.deepEqual(Object.keys(ROLE_CAPABILITIES).sort(), [...roles].sort());
  for (const role of roles) assert.ok(ROLE_CAPABILITIES[role].length > 0);
});

test("manager and owner have wide operational visibility while specialists do not", () => {
  assert.ok(ROLE_CAPABILITIES.owner_admin.includes("update_driver"));
  assert.ok(ROLE_CAPABILITIES.manager.includes("update_driver"));
  assert.ok(ROLE_CAPABILITIES.onboarding_specialist.includes("update_driver"));
  assert.equal(ROLE_CAPABILITIES.recruiter.includes("update_driver"), false);
  assert.equal(ROLE_CAPABILITIES.dispatcher_readonly.includes("update_driver"), false);
});