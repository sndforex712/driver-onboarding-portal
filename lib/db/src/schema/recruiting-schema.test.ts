import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dbRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = path.join(dbRoot, "drizzle");
const migrationFileName = "0000_recruiting_foundation.sql";

function schemaSource(fileName: string): string {
  return readFileSync(path.join(dbRoot, "src/schema", fileName), "utf8");
}

function migrationSql(): string {
  return readFileSync(path.join(migrationDirectory, migrationFileName), "utf8");
}

describe("Recruiting database foundation", () => {
  it("defines and exports the four additive Recruiting tables", () => {
    const recruitingCases = schemaSource("recruiting_cases.ts");
    const transfers = schemaSource("recruiting_onboarding_transfers.ts");
    const index = schemaSource("index.ts");

    assert.match(recruitingCases, /export const recruitingCasesTable = pgTable\("recruiting_cases"/);
    assert.match(recruitingCases, /export const recruitingCaseEventsTable = pgTable\("recruiting_case_events"/);
    assert.match(
      recruitingCases,
      /export const recruitingTransitionEffectsTable = pgTable\("recruiting_transition_effects"/,
    );
    assert.match(
      transfers,
      /export const recruitingOnboardingTransfersTable = pgTable\("recruiting_onboarding_transfers"/,
    );
    assert.match(index, /export \* from "\.\/recruiting_cases"/);
    assert.match(index, /export \* from "\.\/recruiting_onboarding_transfers"/);
  });

  it("uses an explicit checked-in Drizzle migration path without push-force", () => {
    const packageJson = JSON.parse(readFileSync(path.join(dbRoot, "package.json"), "utf8"));
    const config = readFileSync(path.join(dbRoot, "drizzle.config.ts"), "utf8");

    assert.equal(packageJson.scripts.generate, "drizzle-kit generate --config ./drizzle.config.ts");
    assert.equal(packageJson.scripts.migrate, "drizzle-kit migrate --config ./drizzle.config.ts");
    assert.equal(packageJson.scripts["push-force"], undefined);
    assert.match(config, /out:\s*["']\.\/drizzle["']/);
    assert.ok(readdirSync(migrationDirectory).includes(migrationFileName));
    assert.ok(readdirSync(path.join(migrationDirectory, "meta")).includes("_journal.json"));
  });

  it("creates only additive Recruiting structures and preserves existing tables and rows", () => {
    const sql = migrationSql();

    for (const tableName of [
      "recruiting_cases",
      "recruiting_case_events",
      "recruiting_transition_effects",
      "recruiting_onboarding_transfers",
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE "${tableName}"`));
    }

    assert.match(sql, /ALTER TABLE "onboarding_cases" ADD COLUMN "recruiting_case_id"/);
    assert.doesNotMatch(sql, /CREATE TABLE "onboarding_cases"/);
    assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT\s+INTO)\b/im);
  });

  it("defines the required membership, lifecycle, idempotency, and transfer constraints", () => {
    const sql = migrationSql();

    assert.match(
      sql,
      /FOREIGN KEY \("workspace_id","case_owner_id"\) REFERENCES "workspace_memberships"\("workspace_id","user_id"\)/,
    );
    assert.match(
      sql,
      /FOREIGN KEY \("workspace_id","task_owner_id"\) REFERENCES "workspace_memberships"\("workspace_id","user_id"\)/,
    );
    assert.match(sql, /recruiting_cases_workspace_case_number_uidx/);
    assert.match(sql, /recruiting_cases_workspace_source_id_uidx/);
    assert.match(sql, /recruiting_cases_one_active_per_driver_workspace_uidx/);
    assert.match(sql, /recruiting_cases_active_fields_ck/);
    assert.match(sql, /recruiting_cases_follow_up_fields_ck/);
    assert.match(sql, /recruiting_cases_closed_lost_fields_ck/);
    assert.match(sql, /recruiting_case_events_transition_key_uidx/);
    assert.match(sql, /recruiting_transition_effects_effect_key_uidx/);
    assert.match(sql, /recruiting_onboarding_transfers_case_uidx/);
    assert.match(sql, /recruiting_onboarding_transfers_idempotency_key_uidx/);
    assert.match(sql, /onboarding_cases_recruiting_case_id_uidx/);
  });
});