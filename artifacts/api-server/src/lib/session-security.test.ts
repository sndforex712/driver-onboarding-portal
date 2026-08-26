import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./session-security.ts";

process.env.SESSION_SECRET = "demo-session-secret-for-unit-tests-only";

test("password hashes verify only the original credential", async () => {
  const hash = await hashPassword("a secure dev demo password");
  assert.notEqual(hash, "a secure dev demo password");
  assert.equal(await verifyPassword("a secure dev demo password", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("opaque session tokens are random and only persisted as a stable hash", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
  assert.notEqual(hashSessionToken(first), first);
});