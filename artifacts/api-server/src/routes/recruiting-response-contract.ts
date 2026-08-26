type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function serialize(value: unknown): JsonObject {
  return asJsonObject(JSON.parse(JSON.stringify(value)), "Recruiting response");
}

export function serializeRecruitingMutationResponse(value: unknown): JsonObject {
  const payload = serialize(value);
  const resultCase = asJsonObject(payload.case, "Recruiting mutation case");
  if (typeof payload.status !== "string") throw new Error("Recruiting mutation response requires status");
  if (typeof resultCase.createdAt !== "string" || typeof resultCase.updatedAt !== "string") {
    throw new Error("Recruiting mutation response requires case.createdAt and case.updatedAt");
  }
  return payload;
}

export function serializeRecruitingTransferResponse(value: unknown): JsonObject {
  const payload = serialize(value);
  const transfer = asJsonObject(payload.transfer, "Recruiting transfer");
  const onboardingCase = asJsonObject(payload.onboardingCase, "Onboarding case");
  if (
    typeof payload.status !== "string" ||
    typeof transfer.id !== "number" ||
    typeof transfer.transferIdempotencyKey !== "string" ||
    typeof onboardingCase.id !== "number"
  ) {
    throw new Error("Recruiting transfer response does not satisfy its API contract");
  }
  return payload;
}