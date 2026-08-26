import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";

const INGEST_SOURCE_PREFIX = "franklins.ai:recruiting:new-lead:v1:";
export type FranklinLeadIngest = Record<string, unknown> & { source_lead_id: string };

export type FranklinIngestResult =
  | { status: "created"; targetLeadId: number; targetCaseId: number }
  | { status: "already_exists"; targetLeadId: number; targetCaseId: number }
  | { status: "idempotency_conflict" };

export type FranklinLeadIngestService = (
  key: string, payload: FranklinLeadIngest, payloadHash: string,
) => Promise<FranklinIngestResult>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function franklinPayloadHash(payload: FranklinLeadIngest): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function validBearerToken(value: string | undefined, expected: string): boolean {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = value.slice("Bearer ".length);
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function createFranklinLeadIngestRouter(options: {
  token?: string;
  ingest: FranklinLeadIngestService;
  parse: (body: unknown) => { success: true; data: FranklinLeadIngest } | { success: false };
}): IRouter {
  const router: IRouter = Router();
  router.post("/leads", async (req, res): Promise<void> => {
    const token = options.token ?? process.env.FRANKLINS_RECRUITING_INGEST_TOKEN;
    if (!token) return void res.status(503).json({ ok: false, error: "ingest_unavailable" });
    if (!validBearerToken(req.header("Authorization"), token)) return void res.status(401).json({ ok: false, error: "unauthorized" });
    const key = req.header("Idempotency-Key");
    if (!key || !key.startsWith(INGEST_SOURCE_PREFIX) || key.length > 240) return void res.status(422).json({ ok: false, error: "validation_error" });
    const parsed = options.parse(req.body);
    if (!parsed.success || key !== `${INGEST_SOURCE_PREFIX}${parsed.data.source_lead_id}`) return void res.status(422).json({ ok: false, error: "validation_error" });
    try {
      const result = await options.ingest(key, parsed.data, franklinPayloadHash(parsed.data));
      if (result.status === "idempotency_conflict") return void res.status(409).json({ ok: false, error: "idempotency_conflict" });
      return void res.status(result.status === "created" ? 201 : 200).json({ ok: true, status: result.status, target_lead_id: result.targetLeadId, target_case_id: result.targetCaseId });
    } catch {
      return void res.status(503).json({ ok: false, error: "ingest_unavailable" });
    }
  });
  return router;
}