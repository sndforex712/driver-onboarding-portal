import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_IDENTITIES,
  isDemoLoginEnabled,
  isDemoProvisioningEnabled,
  parseDemoAccount,
} from "./demo-auth.ts";

test("the only demo login identities are the four fixed accounts with intended roles", () => {
  assert.deepEqual(
    DEMO_IDENTITIES.map(({ account, email, role }) => ({ account, email, role })),
    [
      { account: "admin", email: "admin@demo.franklins.local", role: "owner_admin" },
      { account: "hardy", email: "hardy@demo.franklins.local", role: "manager" },
      { account: "mason", email: "mason@demo.franklins.local", role: "onboarding_specialist" },
      { account: "wayne", email: "wayne@demo.franklins.local", role: "onboarding_specialist" },
    ],
  );
});

test("demo login accepts only a single fixed account field", () => {
  for (const identity of DEMO_IDENTITIES) {
    assert.equal(parseDemoAccount({ account: identity.account }), identity.account);
  }

  assert.equal(parseDemoAccount({ account: "unknown" }), null);
  assert.equal(parseDemoAccount({ email: "admin@demo.franklins.local" }), null);
  assert.equal(parseDemoAccount({ account: "hardy", role: "owner_admin" }), null);
  assert.equal(parseDemoAccount({ account: "mason", userId: 1 }), null);
  assert.equal(parseDemoAccount(null), null);
});

test("demo login and bootstrap require an explicit flag outside production", () => {
  assert.equal(isDemoLoginEnabled({ NODE_ENV: "development", FRANKLINS_DEMO_LOGIN_ENABLED: "1" }), true);
  assert.equal(isDemoLoginEnabled({ NODE_ENV: "test", FRANKLINS_DEMO_LOGIN_ENABLED: "1" }), true);
  assert.equal(isDemoLoginEnabled({ NODE_ENV: "development" }), false);
  assert.equal(isDemoLoginEnabled({ NODE_ENV: "production", FRANKLINS_DEMO_LOGIN_ENABLED: "1" }), false);

  assert.equal(isDemoProvisioningEnabled({ NODE_ENV: "development", DEMO_USER_PROVISION: "1" }), true);
  assert.equal(isDemoProvisioningEnabled({ NODE_ENV: "test", DEMO_USER_PROVISION: "1" }), true);
  assert.equal(isDemoProvisioningEnabled({ NODE_ENV: "production", DEMO_USER_PROVISION: "1" }), false);
});
