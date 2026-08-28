import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  driverDocumentsTable,
  twentyDocumentRequirementsTable,
  twentyStepAdvancementAttemptsTable,
} from "@workspace/db";
import {
  getTwentyDriverCandidate,
  TWENTY_DRIVER_STEPS,
  updateTwentyDriverCandidate,
} from "./twenty-driver-candidates";

export class TwentyDocumentWorkflowError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 422,
  ) {
    super(message);
    this.name = "TwentyDocumentWorkflowError";
  }
}

export type TwentyAdvancementResult = {
  advanced: boolean;
  finalCompleted: boolean;
  currentStepKey: string;
  nextStepKey: string | null;
  message: string;
};

type AdvanceInput = {
  workspaceId: number;
  candidateId: string;
  expectedStepKey: string;
  idempotencyKey?: string;
  mode: "verified_documents" | "manual";
  actor: { userId: number; userName: string; workspaceRole: string };
};

export function nextTwentyStep(stepKey: string) {
  const index = TWENTY_DRIVER_STEPS.findIndex((step) => step.key === stepKey);
  if (index < 0) throw new TwentyDocumentWorkflowError("Unsupported Twenty step.", 400);
  return TWENTY_DRIVER_STEPS[index + 1] ?? null;
}

export async function guardedAdvanceTwentyStep(input: AdvanceInput): Promise<TwentyAdvancementResult> {
  const lockScope = `${input.workspaceId}:${input.candidateId}`;
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockScope}))`);

    const candidate = await getTwentyDriverCandidate(input.candidateId);
    if (!candidate) throw new TwentyDocumentWorkflowError("Twenty Driver Candidate not found.", 404);

    if (candidate.currentStep !== input.expectedStepKey) {
      const expectedNext = nextTwentyStep(input.expectedStepKey);
      if (expectedNext?.key === candidate.currentStep) {
        return {
          advanced: false,
          finalCompleted: false,
          currentStepKey: candidate.currentStep,
          nextStepKey: nextTwentyStep(candidate.currentStep)?.key ?? null,
          message: "This transition was already completed.",
        } satisfies TwentyAdvancementResult;
      }
      throw new TwentyDocumentWorkflowError(
        `Candidate is now on ${candidate.currentStepLabel}; refresh before continuing.`,
        409,
      );
    }

    const requirements = await tx.select().from(twentyDocumentRequirementsTable)
      .where(and(
        eq(twentyDocumentRequirementsTable.workspaceId, input.workspaceId),
        eq(twentyDocumentRequirementsTable.stepKey, candidate.currentStep),
      ));
    if (requirements.length === 0) {
      throw new TwentyDocumentWorkflowError("This step has no document requirement configuration.", 422);
    }

    if (input.mode === "manual") {
      if (!requirements.some((requirement) => requirement.allowsManualCompletion)) {
        throw new TwentyDocumentWorkflowError("This step requires verified documents and cannot be completed manually.", 422);
      }
    } else {
      const mandatory = requirements.filter((requirement) => requirement.isMandatory);
      if (mandatory.length === 0) {
        return {
          advanced: false,
          finalCompleted: false,
          currentStepKey: candidate.currentStep,
          nextStepKey: nextTwentyStep(candidate.currentStep)?.key ?? null,
          message: "This step requires an authorized manual completion.",
        } satisfies TwentyAdvancementResult;
      }
      const verified = await tx.select({ requirementKey: driverDocumentsTable.requirementKey })
        .from(driverDocumentsTable)
        .where(and(
          eq(driverDocumentsTable.workspaceId, input.workspaceId),
          eq(driverDocumentsTable.twentyCandidateId, input.candidateId),
          eq(driverDocumentsTable.stepKey, candidate.currentStep),
          eq(driverDocumentsTable.status, "verified"),
        ));
      const verifiedKeys = new Set(verified.map((row) => row.requirementKey).filter(Boolean));
      const missing = mandatory.filter((requirement) => !verifiedKeys.has(requirement.requirementKey));
      if (missing.length > 0) {
        return {
          advanced: false,
          finalCompleted: false,
          currentStepKey: candidate.currentStep,
          nextStepKey: nextTwentyStep(candidate.currentStep)?.key ?? null,
          message: `Waiting for verified documents: ${missing.map((requirement) => requirement.label).join(", ")}.`,
        } satisfies TwentyAdvancementResult;
      }
    }

    const next = nextTwentyStep(candidate.currentStep);
    const [existing] = await tx.select().from(twentyStepAdvancementAttemptsTable)
      .where(and(
        eq(twentyStepAdvancementAttemptsTable.workspaceId, input.workspaceId),
        eq(twentyStepAdvancementAttemptsTable.candidateId, input.candidateId),
        eq(twentyStepAdvancementAttemptsTable.fromStepKey, candidate.currentStep),
      ));
    if (existing?.status === "succeeded") {
      return {
        advanced: false,
        finalCompleted: next === null,
        currentStepKey: candidate.currentStep,
        nextStepKey: next?.key ?? null,
        message: next ? "This transition was already completed." : "The final step is already complete.",
      } satisfies TwentyAdvancementResult;
    }

    const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
    const [attempt] = await tx.insert(twentyStepAdvancementAttemptsTable).values({
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      fromStepKey: candidate.currentStep,
      toStepKey: next?.key ?? null,
      idempotencyKey,
      status: "started",
      actorUserId: input.actor.userId,
      actorName: input.actor.userName,
      actorRole: input.actor.workspaceRole,
    }).onConflictDoUpdate({
      target: [
        twentyStepAdvancementAttemptsTable.workspaceId,
        twentyStepAdvancementAttemptsTable.candidateId,
        twentyStepAdvancementAttemptsTable.fromStepKey,
      ],
      set: {
        idempotencyKey,
        status: "started",
        errorMessage: null,
        actorUserId: input.actor.userId,
        actorName: input.actor.userName,
        actorRole: input.actor.workspaceRole,
      },
    }).returning();

    if (!attempt) throw new Error("Failed to record the Twenty step advancement attempt.");

    if (!next) {
      await tx.update(twentyStepAdvancementAttemptsTable).set({
        status: "succeeded",
        completedAt: new Date(),
      }).where(eq(twentyStepAdvancementAttemptsTable.id, attempt.id));
      return {
        advanced: false,
        finalCompleted: true,
        currentStepKey: candidate.currentStep,
        nextStepKey: null,
        message: "The final Telegram Group step is complete.",
      } satisfies TwentyAdvancementResult;
    }

    try {
      const updated = await updateTwentyDriverCandidate(input.candidateId, { currentStep: next.key });
      if (updated.currentStep !== next.key) {
        throw new Error("Twenty Cloud did not persist the expected next step.");
      }
      await tx.update(twentyStepAdvancementAttemptsTable).set({
        status: "succeeded",
        completedAt: new Date(),
      }).where(eq(twentyStepAdvancementAttemptsTable.id, attempt.id));
      return {
        advanced: true,
        finalCompleted: false,
        currentStepKey: updated.currentStep,
        nextStepKey: nextTwentyStep(updated.currentStep)?.key ?? null,
        message: `Advanced to ${updated.currentStepLabel}.`,
      } satisfies TwentyAdvancementResult;
    } catch (error) {
      await tx.update(twentyStepAdvancementAttemptsTable).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Twenty update failed.",
      }).where(eq(twentyStepAdvancementAttemptsTable.id, attempt.id));
      return {
        error: error instanceof Error ? error : new Error("Twenty update failed."),
      };
    }
  });

  if ("error" in outcome) throw outcome.error;
  return outcome;
}