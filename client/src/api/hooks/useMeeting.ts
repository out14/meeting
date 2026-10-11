import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { meetingController } from '@src/api/controllers/meetingController'
import { saveMemberToken } from '@src/api/memberToken'
import { queryKeys } from '@src/api/queryKeys'

// 다른 친구들의 참여/확정 상황을 반영하기 위해 주기적으로 다시 불러온다
const REFRESH_INTERVAL = 10 * 1000

export function useMeetingList() {
  return useQuery({
    queryKey: queryKeys.meeting.list(),
    queryFn: meetingController.getList,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function useMeeting(code: string) {
  return useQuery({
    queryKey: queryKeys.meeting.detail(code),
    queryFn: () => meetingController.getDetail(code),
    enabled: !!code,
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function useCreateMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: meetingController.create,
    onSuccess: async ({ code, token }) => {
      if (token) saveMemberToken(code, token)
      await queryClient.invalidateQueries({ queryKey: queryKeys.meeting.list() })
    },
  })
}

export function useJoinMeeting(code: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => meetingController.join(code),
    onSuccess: async () => {
      // 참여자가 됐으니 모임/투표 정보를 모두 다시 불러온다
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.detail(code) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.poll.all }),
      ])
    },
  })
}

export function useCloseVote(code: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => meetingController.closeVote(code),
    // 단계와 확정 결과가 바뀌므로 모임/투표/목록을 모두 갱신한다
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.poll.all }),
      ]),
  })
}

// 모임장 또는 관리자. 모임 화면과 모임 관리 테이블에서 함께 쓰므로 code 는 호출할 때 받는다
export function useDeleteMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: string) => meetingController.remove(code),
    // 삭제된 모임의 상세·투표 캐시는 지우고, 캘린더·마이페이지·모임 관리 목록은 다시 불러온다
    onSuccess: async (_data, code) => {
      queryClient.removeQueries({ queryKey: queryKeys.meeting.detail(code) })
      queryClient.removeQueries({ queryKey: [...queryKeys.poll.all, 'detail', code] })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.meetings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.meetings }),
      ])
    },
  })
}
