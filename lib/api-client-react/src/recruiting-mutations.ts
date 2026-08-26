import type { CustomFetchOptions } from "./custom-fetch";
import {
  createRecruitingCase,
  decideRecruitingManagerReview,
  returnRecruitingFutureFollowUp,
  transferRecruitingCaseToOnboarding,
  transitionRecruitingCase,
} from "./generated/api";
import type {
  CreateRecruitingCaseInput,
  RecruitingFutureFollowUpReturnInput,
  RecruitingManagerDecisionInput,
  RecruitingTransferInput,
  RecruitingTransitionInput,
} from "./generated/api.schemas";

export type IdempotencyKey = string;

function withIdempotencyKey(options: CustomFetchOptions | undefined, idempotencyKey: IdempotencyKey): CustomFetchOptions {
  // The generated operations spread options.headers into a plain object. Convert
  // Headers instances first, otherwise their values are not enumerable and vanish.
  const headers: Record<string, string> = {};
  new Headers(options?.headers).forEach((value, name) => { headers[name] = value; });
  return { ...options, headers: { ...headers, "Idempotency-Key": idempotencyKey } };
}

export type CreateRecruitingCaseMutationInput = {
  data: CreateRecruitingCaseInput;
  idempotencyKey: IdempotencyKey;
};

export function createRecruitingCaseIdempotent(
  { data, idempotencyKey }: CreateRecruitingCaseMutationInput,
  options?: CustomFetchOptions,
) {
  return createRecruitingCase(data, withIdempotencyKey(options, idempotencyKey));
}

export type CaseIdempotentMutationInput<T> = {
  id: number;
  data: T;
  idempotencyKey: IdempotencyKey;
};

export function transitionRecruitingCaseIdempotent(
  { id, data, idempotencyKey }: CaseIdempotentMutationInput<RecruitingTransitionInput>,
  options?: CustomFetchOptions,
) {
  return transitionRecruitingCase(id, data, withIdempotencyKey(options, idempotencyKey));
}

export function decideRecruitingManagerReviewIdempotent(
  { id, data, idempotencyKey }: CaseIdempotentMutationInput<RecruitingManagerDecisionInput>,
  options?: CustomFetchOptions,
) {
  return decideRecruitingManagerReview(id, data, withIdempotencyKey(options, idempotencyKey));
}

export function returnRecruitingFutureFollowUpIdempotent(
  { id, data, idempotencyKey }: CaseIdempotentMutationInput<RecruitingFutureFollowUpReturnInput>,
  options?: CustomFetchOptions,
) {
  return returnRecruitingFutureFollowUp(id, data, withIdempotencyKey(options, idempotencyKey));
}

export function transferRecruitingCaseToOnboardingIdempotent(
  { id, data, idempotencyKey }: CaseIdempotentMutationInput<RecruitingTransferInput>,
  options?: CustomFetchOptions,
) {
  return transferRecruitingCaseToOnboarding(id, data, withIdempotencyKey(options, idempotencyKey));
}