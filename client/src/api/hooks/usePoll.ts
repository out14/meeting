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

// 날짜 투표 저장: 제안 날짜가 바뀌면 메인 캘린더에도 보여야 하므로 모임 목록도 다시 불러온다
export function useVoteDates(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dates: string[]) => pollController.voteDates(code, dates),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.poll.detail(code, 'date') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.list() }),
      ]),
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
