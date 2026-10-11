import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pollController, type ConfirmBody, type PollType } from '@src/api/controllers/pollController'
import { queryKeys } from '@src/api/queryKeys'

const REFRESH_INTERVAL = 10 * 1000

export function usePoll(code: string, type: PollType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.poll.detail(code, type),
    queryFn: () => pollController.getDetail(code, type),
    enabled: !!code && enabled,
    refetchInterval: REFRESH_INTERVAL,
  })
}

function useInvalidatePoll(code: string, type: PollType) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.poll.detail(code, type) })
}

export function useProposeDates(code: string) {
  const invalidate = useInvalidatePoll(code, 'date')
  return useMutation({
    mutationFn: (range: { startDate: string; endDate?: string }) => pollController.proposeDates(code, range),
    onSuccess: invalidate,
  })
}

export function useVotePlace(code: string) {
  const invalidate = useInvalidatePoll(code, 'place')
  return useMutation({
    mutationFn: (body: { regions: string[]; comment: string }) => pollController.votePlace(code, body),
    onSuccess: invalidate,
  })
}

export function useVote(code: string, type: PollType) {
  const invalidate = useInvalidatePoll(code, type)
  return useMutation({
    mutationFn: (optionIds: number[]) => pollController.vote(code, type, optionIds),
    onSuccess: invalidate,
  })
}

export function useConfirmPoll(code: string, type: PollType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ConfirmBody) => pollController.confirm(code, type, body),
    // 확정되면 모임 단계가 바뀌므로 모임 정보와 투표를 함께 갱신한다
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.poll.all }),
      ]),
  })
}
