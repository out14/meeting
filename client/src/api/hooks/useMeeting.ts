import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { meetingController } from '@src/api/controllers/meetingController'
import { saveMemberToken } from '@src/api/memberToken'
import { queryKeys } from '@src/api/queryKeys'
import { refreshMeetingData } from '@src/api/refresh'

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
      // 캘린더뿐 아니라 마이페이지(개설한 모임·자동 투표), 관리자 모임 관리에도 보여야 한다
      await refreshMeetingData(queryClient)
    },
  })
}

export function useJoinMeeting(code: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => meetingController.join(code),
    // 참여자가 됐으니 모임/투표 정보와 참여자 수가 보이는 목록을 모두 다시 불러온다
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

export function useCloseVote(code: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => meetingController.closeVote(code),
    // 단계와 확정 결과가 바뀌므로 모임/투표/목록을 모두 갱신한다
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

// 참여 취소 (마이페이지 목록에서 쓰므로 code 는 호출할 때 받는다)
export function useLeaveMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => meetingController.leave(code),
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

// 장소 투표 지금 마감: 모임 단계와 장소 결과가 바뀐다
export function useClosePlaceVote(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => meetingController.closePlaceVote(code),
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

export function useUpdatePlaceDeadline(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (placeDeadline: string) => meetingController.updatePlaceDeadline(code, placeDeadline),
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

// 모임장 날짜 수정: 모임 정보·캘린더 목록과 날짜 투표를 함께 갱신한다
export function useUpdateMeetingDates(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; voteDeadline?: string }) =>
      meetingController.updateDates(code, body),
    onSuccess: () => refreshMeetingData(queryClient),
  })
}

// 모임장 또는 관리자. 모임 화면과 모임 관리 테이블에서 함께 쓰므로 code 는 호출할 때 받는다
export function useDeleteMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: string) => meetingController.remove(code),
    // 삭제된 모임의 상세·투표 캐시는 지우고, 캘린더·마이페이지·모임 관리 목록은 다시 불러온다
    // (refreshMeetingData 는 쓰지 않는다: 지운 모임 화면이 떠 있는 동안 그 모임을 다시 불러오면 404 가 잠깐 보인다)
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
