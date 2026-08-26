import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import test from "node:test";
import {
  createFranklinLeadIngestRouter,
  franklinPayloadHash,
  type FranklinLeadIngestService,
} from "./franklin-lead-ingest-http.ts";

const payload = {
  source_system: "franklins.ai",
  source_tenant: "Franklin",
  source_lead_id: "test-001",
  external_id: "franklins.ai:lead:test-001",
  driver_name: "Test Driver",
  phone: "+15551234567",
  driver_type: "owner_operator",
  documents: { cdl_front: true, cdl_back: false, medical_card: true },
  docs_received: false,
  displayed_recruiter: "Displayed Recruiter",
  requested_by: { account_id: "account-1", full_name: "Requester" },
  requested_at: "2026-08-24T12:00:00.000Z",
} as const;

function request(app: express.Express, headers: Record<string, string>, body: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      const req = http.request({
        hostname: "127.0.0.1", port: address.port, path: "/api/leads", method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      }, response => {
        let text = "";
        response.on("data", chunk => { text += chunk; });
        response.on("end", () => { server.close(); resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) }); });
      });
      req.on("error", error => { server.close(); reject(error); });
      req.end(JSON.stringify(body));
    });
  });
}

function testApp(ingest?: FranklinLeadIngestService, token = "secret") {
  const app = express();
  app.use(express.json());
  app.use("/api", createFranklinLeadIngestRouter({
    token,
    ingest: ingest ?? (async () => ({ status: "created", targetLeadId: 1, targetCaseId: 1 })),
    parse(body) {
      if (!body || typeof body !== "object" || Array.isArray(body)) return { success: false };
      const value = body as Record<string, unknown>;
      const expected = ["source_system", "source_tenant", "source_lead_id", "external_id", "driver_name", "phone", "driver_type", "documents", "docs_received", "displayed_recruiter", "requested_by", "requested_at"];
      if (Object.keys(value).length !== expected.length || expected.some(key => !(key in value)) || value.phone === "555-1234") return { success: false };
      return { success: true as const, data: value as any };
    },
  }));
  return app;
}

const key = "franklins.ai:recruiting:new-lead:v1:test-001";
const validHeaders = { Authorization: "Bearer secret", "Idempotency-Key": key };

test("missing secret fails closed before the injected database boundary", async () => {
  let called = false;
  const response = await request(testApp(async () => { called = true; return { status: "created", targetLeadId: 1, targetCaseId: 1 }; }, ""), validHeaders, payload);
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("missing and bad bearer tokens return 401", async () => {
  for (const authorization of [undefined, "Bearer wrong"]) {
    const response = await request(testApp(async () => { throw new Error("must not call"); }), authorization ? { ...validHeaders, Authorization: authorization } : { "Idempotency-Key": key }, payload);
    assert.equal(response.status, 401);
  }
});

test("unknown and invalid payload fields return 422", async () => {
  const extra = await request(testApp(), validHeaders, { ...payload, unexpected: true });
  assert.equal(extra.status, 422);
  const invalid = await request(testApp(), validHeaders, { ...payload, phone: "555-1234" });
  assert.equal(invalid.status, 422);
});

test("created, exact replay, canonical reorder, and conflict statuses are surfaced", async () => {
  const calls: string[] = [];
  const service: FranklinLeadIngestService = async (key, value, hash) => {
    calls.push(`${key}:${hash}`);
    return calls.length === 1 ? { status: "created", targetLeadId: 7, targetCaseId: 8 } : { status: "already_exists", targetLeadId: 7, targetCaseId: 8 };
  };
  const first = await request(testApp(service), validHeaders, payload);
  assert.equal(first.status, 201);
  const reordered = {
    requested_at: payload.requested_at, requested_by: payload.requested_by, displayed_recruiter: payload.displayed_recruiter,
    docs_received: payload.docs_received, documents: payload.documents, driver_type: payload.driver_type,
    phone: payload.phone, driver_name: payload.driver_name, external_id: payload.external_id,
    source_lead_id: payload.source_lead_id, source_tenant: payload.source_tenant, source_system: payload.source_system,
  };
  assert.equal(franklinPayloadHash(payload), franklinPayloadHash(reordered as typeof payload));
  const replay = await request(testApp(service), validHeaders, reordered);
  assert.equal(replay.status, 200);
  const conflict = await request(testApp(async () => ({ status: "idempotency_conflict" })), validHeaders, { ...payload, driver_name: "Changed" });
  assert.equal(conflict.status, 409);
});

test("stable key is required and fake concurrent service can return one target", async () => {
  let created = false;
  const service: FranklinLeadIngestService = async () => {
    if (created) return { status: "already_exists", targetLeadId: 9, targetCaseId: 10 };
    created = true;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { status: "created", targetLeadId: 9, targetCaseId: 10 };
  };
  const app = testApp(service);
  const responses = await Promise.all([request(app, validHeaders, payload), request(app, validHeaders, payload)]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 201]);
  const invalidKey = await request(app, { ...validHeaders, "Idempotency-Key": "not-franklin" }, payload);
  assert.equal(invalidKey.status, 422);
});