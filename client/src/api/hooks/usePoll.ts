import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pollController, type ConfirmBody, type PollType } from '@src/api/controllers/pollController'
import { queryKeys } from '@src/api/queryKeys'
import { refreshMeetingData } from '@src/api/refresh'

const REFRESH_INTERVAL = 10 * 1000

export function usePoll(code: string, type: PollType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.poll.detail(code, type),
    queryFn: () => pollController.getDetail(code, type),
    enabled: !!code && enabled,
    refetchInterval: REFRESH_INTERVAL,
  })
}

// 투표는 모임 화면뿐 아니라 캘린더(제시 날짜), 마이페이지(내 선택), 관리자 모임 관리(투표 인원)에도 보인다
function useRefreshAfterVote() {
  const queryClient = useQueryClient()
  return () => refreshMeetingData(queryClient)
}

export function useVotePlace(code: string) {
  const invalidate = useRefreshAfterVote()
  return useMutation({
    mutationFn: (body: { regions: string[]; comment: string }) => pollController.votePlace(code, body),
    onSuccess: invalidate,
  })
}

export function useVote(code: string, type: PollType) {
  const invalidate = useRefreshAfterVote()
  return useMutation({
    mutationFn: (optionIds: number[]) => pollController.vote(code, type, optionIds),
    onSuccess: invalidate,
  })
}

// 날짜 투표 저장 (모임장이면 후보 날짜 수정, 참여자면 투표·제시)
export function useVoteDates(code: string) {
  const invalidate = useRefreshAfterVote()
  return useMutation({
    mutationFn: (dates: string[]) => pollController.voteDates(code, dates),
    onSuccess: invalidate,
  })
}

// 마이페이지 투표 취소: 그 모임에서 진행 중인 투표(날짜 / 장소)의 내 표를 모두 뺀다 (빈 투표 저장)
export function useCancelVote() {
  const invalidate = useRefreshAfterVote()
  return useMutation({
    mutationFn: ({ code, type }: { code: string; type: PollType }) =>
      type === 'date' ? pollController.voteDates(code, []) : pollController.vote(code, type, []),
    onSuccess: invalidate,
  })
}

export function useConfirmPoll(code: string, type: PollType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ConfirmBody) => pollController.confirm(code, type, body),
    // 확정되면 모임 단계가 바뀌므로 모임 데이터가 보이는 화면을 모두 갱신한다
    onSuccess: () => refreshMeetingData(queryClient),
  })
}
