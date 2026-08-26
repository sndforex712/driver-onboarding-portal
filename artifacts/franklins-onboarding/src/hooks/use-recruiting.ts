import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createRecruitingCaseIdempotent,
  transitionRecruitingCaseIdempotent,
  decideRecruitingManagerReviewIdempotent,
  returnRecruitingFutureFollowUpIdempotent,
  transferRecruitingCaseToOnboardingIdempotent,
  getGetRecruitingCaseQueryKey,
  getListRecruitingCasesQueryKey,
  getListRecruitingCaseTimelineQueryKey,
  getGetRecruitingDashboardQueryKey,
  getGetRecruitingQueueQueryKey,
} from "@workspace/api-client-react";
import type {
  CreateRecruitingCaseInput,
  RecruitingTransitionInput,
  RecruitingManagerDecisionInput,
  RecruitingFutureFollowUpReturnInput,
  RecruitingTransferInput
} from "@workspace/api-client-react";

type IdempotentMutation<T> = { data: T; idempotencyKey: string };
type IdempotentCaseMutation<T> = IdempotentMutation<T> & { id: number };

export function useRecruitingMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = (id?: number) => {
    queryClient.invalidateQueries({ queryKey: getListRecruitingCasesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecruitingQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecruitingDashboardQueryKey() });
    if (id) {
      queryClient.invalidateQueries({ queryKey: getGetRecruitingCaseQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListRecruitingCaseTimelineQueryKey(id) });
    }
  };

  const createCase = useMutation({
    mutationFn: async ({ data, idempotencyKey }: IdempotentMutation<CreateRecruitingCaseInput>) => {
      return createRecruitingCaseIdempotent({ data, idempotencyKey });
    },
    onSuccess: () => invalidateAll(),
  });
  
  const transitionCase = useMutation({
    mutationFn: async ({ id, data, idempotencyKey }: IdempotentCaseMutation<RecruitingTransitionInput>) => {
      return transitionRecruitingCaseIdempotent({ id, data, idempotencyKey });
    },
    onSuccess: (_, { id }) => invalidateAll(id),
  });

  const decideManagerReview = useMutation({
    mutationFn: async ({ id, data, idempotencyKey }: IdempotentCaseMutation<RecruitingManagerDecisionInput>) => {
      return decideRecruitingManagerReviewIdempotent({ id, data, idempotencyKey });
    },
    onSuccess: (_, { id }) => invalidateAll(id),
  });

  const returnFutureFollowUp = useMutation({
    mutationFn: async ({ id, data, idempotencyKey }: IdempotentCaseMutation<RecruitingFutureFollowUpReturnInput>) => {
      return returnRecruitingFutureFollowUpIdempotent({ id, data, idempotencyKey });
    },
    onSuccess: (_, { id }) => invalidateAll(id),
  });

  const transferToOnboarding = useMutation({
    mutationFn: async ({ id, data, idempotencyKey }: IdempotentCaseMutation<RecruitingTransferInput>) => {
      return transferRecruitingCaseToOnboardingIdempotent({ id, data, idempotencyKey });
    },
    onSuccess: (_, { id }) => invalidateAll(id),
  });

  return {
    createCase,
    transitionCase,
    decideManagerReview,
    returnFutureFollowUp,
    transferToOnboarding,
  };
}
