const TWENTY_GRAPHQL_URL = "https://api.twenty.com/graphql";
const TWENTY_REST_URL = "https://api.twenty.com/rest";
export const TWENTY_DRIVER_CANDIDATE_WORKSPACE_SLUG = "franklin";

export const TWENTY_DRIVER_STEPS = [
  { number: 1, key: "APPLICATION", label: "Application" },
  { number: 2, key: "CLEARINGHOUSE", label: "Clearinghouse" },
  { number: 3, key: "DRUG_TEST", label: "Drug Test" },
  { number: 4, key: "CONTRACT", label: "Contract" },
  { number: 5, key: "MEDICAL_CARD", label: "Medical Card" },
  { number: 6, key: "TITLE", label: "Title" },
  { number: 7, key: "ANNUAL_INSPECTION", label: "Annual Inspection" },
  { number: 8, key: "SHIPMENT_NEED_TO_SEND", label: "Shipment — Need to Send" },
  { number: 9, key: "SHIPMENT_SENT", label: "Shipment Sent" },
  { number: 10, key: "TWO_TWENTY_NINE", label: "2290" },
  { number: 11, key: "PLATE_NUMBER", label: "Plate Number" },
  { number: 12, key: "TELEGRAM_GROUP", label: "Telegram Group" },
] as const;

export const TWENTY_RECRUITERS = [
  { value: "HARDY", label: "Hardy" },
  { value: "RECRUITER_A", label: "Recruiter A" },
  { value: "RECRUITER_B", label: "Recruiter B" },
] as const;

export const TWENTY_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "HIRED_DISPATCH_READY", label: "Hired / Dispatch Ready" },
  { value: "NOT_QUALIFIED", label: "Not Qualified" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "REJECTED", label: "Rejected" },
] as const;

type TwentyCandidateRecord = {
  id: string;
  fullName: string;
  phone?: { primaryPhoneNumber?: string | null } | string | null;
  currentStep?: string | null;
  status?: string | null;
  recruiter?: string | null;
  source?: string | null;
  nextFollowUp?: string | null;
};

type TwentyListResponse = {
  data?: TwentyCandidateRecord[] | { driverCandidates?: TwentyCandidateRecord[] };
  totalCount?: number;
  pageInfo?: { hasNextPage?: boolean };
};

type TwentyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export type TwentyDriverCandidate = {
  id: string;
  fullName: string;
  phone: string | null;
  currentStep: string;
  currentStepNumber: number;
  currentStepLabel: string;
  completedStepNumbers: number[];
  completionPercent: number;
  status: string;
  recruiter: string;
  recruiterLabel: string;
  source: string;
  nextFollowUp: string | null;
};

export class TwentyApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TwentyApiError";
    this.status = status;
  }
}

export function isTwentyDriverCandidateWorkspace(workspaceSlug: string): boolean {
  return workspaceSlug.trim().toLowerCase() === TWENTY_DRIVER_CANDIDATE_WORKSPACE_SLUG;
}

function twentyApiKey(): string {
  const key = process.env.TWENTY_API_KEY?.trim();
  if (!key) throw new TwentyApiError("Twenty Cloud is not configured on the API server.", 503);
  return key;
}

function recruiterLabel(value: string): string {
  return TWENTY_RECRUITERS.find((option) => option.value === value)?.label ?? value;
}

function stepFor(value: string | null | undefined) {
  const step = TWENTY_DRIVER_STEPS.find((candidate) => candidate.key === value);
  if (!step) throw new TwentyApiError(`Twenty returned an unsupported currentStep value: ${value ?? "empty"}.`, 502);
  return step;
}

function phoneFor(value: TwentyCandidateRecord["phone"]): string | null {
  return typeof value === "string" ? value : value?.primaryPhoneNumber ?? null;
}

export function normalizeTwentyDriverCandidate(candidate: TwentyCandidateRecord): TwentyDriverCandidate {
  const step = stepFor(candidate.currentStep);
  const completedStepNumbers = Array.from({ length: step.number - 1 }, (_, index) => index + 1);
  const recruiter = candidate.recruiter;
  if (!recruiter || !TWENTY_RECRUITERS.some((option) => option.value === recruiter)) {
    throw new TwentyApiError(`Twenty returned an unsupported recruiter value: ${recruiter ?? "empty"}.`, 502);
  }
  const status = candidate.status;
  if (!status || !TWENTY_STATUSES.some((option) => option.value === status)) {
    throw new TwentyApiError(`Twenty returned an unsupported status value: ${status ?? "empty"}.`, 502);
  }

  return {
    id: candidate.id,
    fullName: candidate.fullName,
    phone: phoneFor(candidate.phone),
    currentStep: step.key,
    currentStepNumber: step.number,
    currentStepLabel: step.label,
    completedStepNumbers,
    completionPercent: Math.round(((step.number - 1) / TWENTY_DRIVER_STEPS.length) * 100),
    status,
    recruiter,
    recruiterLabel: recruiterLabel(recruiter),
    source: candidate.source ?? "",
    nextFollowUp: candidate.nextFollowUp ?? null,
  };
}

async function twentyRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = twentyApiKey();
  let response: Response;
  try {
    response = await fetch(`${TWENTY_REST_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new TwentyApiError("Twenty Cloud could not be reached.", 502);
  }

  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new TwentyApiError(
      typeof body?.message === "string" ? body.message : `Twenty Cloud returned HTTP ${response.status}.`,
      response.status >= 500 ? 502 : response.status,
    );
  }
  return body as T;
}

async function twentyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = twentyApiKey();
  let response: Response;
  try {
    response = await fetch(TWENTY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new TwentyApiError("Twenty Cloud could not be reached.", 502);
  }

  const body = await response.json().catch(() => null) as TwentyGraphqlResponse<T> | null;
  if (!response.ok || body?.errors?.length) {
    throw new TwentyApiError(
      body?.errors?.[0]?.message ?? `Twenty Cloud returned HTTP ${response.status}.`,
      response.status >= 500 ? 502 : response.status,
    );
  }
  if (!body?.data) throw new TwentyApiError("Twenty Cloud returned an empty response.", 502);
  return body.data;
}

export async function listTwentyDriverCandidates(): Promise<TwentyDriverCandidate[]> {
  const body = await twentyRest<TwentyListResponse>("/driverCandidates?limit=100");
  const records = Array.isArray(body.data) ? body.data : body.data?.driverCandidates;
  if (!Array.isArray(records)) throw new TwentyApiError("Twenty Cloud returned an invalid Driver Candidate list.", 502);
  if (body.pageInfo?.hasNextPage || (body.totalCount ?? records.length) > records.length) {
    throw new TwentyApiError("Twenty Cloud returned a paginated Driver Candidate list.", 502);
  }
  return records.map(normalizeTwentyDriverCandidate);
}

export async function getTwentyDriverCandidate(id: string): Promise<TwentyDriverCandidate | null> {
  return (await listTwentyDriverCandidates()).find((candidate) => candidate.id === id) ?? null;
}

export async function updateTwentyDriverCandidate(
  id: string,
  update: { recruiter?: string; status?: string; currentStep?: string },
): Promise<TwentyDriverCandidate> {
  const data: Record<string, string> = {};
  if (update.recruiter) data.recruiter = update.recruiter;
  if (update.status) data.status = update.status;
  if (update.currentStep) {
    stepFor(update.currentStep);
    data.currentStep = update.currentStep;
  }
  if (Object.keys(data).length === 0) throw new TwentyApiError("At least one Twenty field must be updated.", 400);

  const result = await twentyGraphql<{ updateDriverCandidate: TwentyCandidateRecord }>(
    `mutation UpdateDriverCandidate($id: UUID!, $data: DriverCandidateUpdateInput!) {
      updateDriverCandidate(id: $id, data: $data) {
        id fullName
        phone { primaryPhoneNumber }
        currentStep status recruiter source nextFollowUp
      }
    }`,
    { id, data },
  );
  if (!result.updateDriverCandidate) throw new TwentyApiError("Twenty Cloud did not return the updated Driver Candidate.", 502);
  return normalizeTwentyDriverCandidate(result.updateDriverCandidate);
}

function sameDay(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

export function filterTwentyDriverCandidates(
  candidates: TwentyDriverCandidate[],
  params: {
    view?: string;
    status?: string;
    search?: string;
    operationalOwner?: string;
    step?: number;
    source?: string;
  },
) {
  const search = params.search?.trim().toLowerCase();
  const source = params.source?.trim().toLowerCase();
  const baseRows = candidates.filter((candidate) => {
    if (params.status && candidate.status !== params.status) return false;
    if (params.operationalOwner && candidate.recruiterLabel !== params.operationalOwner) return false;
    if (params.step && candidate.currentStepNumber !== params.step) return false;
    if (source && candidate.source.toLowerCase() !== source) return false;
    if (search) {
      const haystack = [candidate.fullName, candidate.phone ?? "", candidate.recruiterLabel, candidate.source, candidate.currentStepLabel]
        .join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const dueToday = baseRows.filter((candidate) => candidate.nextFollowUp !== null && sameDay(candidate.nextFollowUp));
  const overdue = baseRows.filter((candidate) => candidate.nextFollowUp !== null && new Date(candidate.nextFollowUp) < new Date());
  const items = params.view === "due_today"
    ? dueToday
    : params.view === "overdue"
      ? overdue
      : params.view === "no_next_action"
        ? baseRows.filter((candidate) => !candidate.nextFollowUp)
        : params.view === "needs_review" || params.view === "waiting_blocked"
          ? []
          : baseRows;

  return {
    items,
    baseRows,
    counts: {
      all: baseRows.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      waitingBlocked: 0,
      noNextAction: baseRows.filter((candidate) => !candidate.nextFollowUp).length,
      needsReview: 0,
    },
  };
}