import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearAdminToken, getAdminToken, saveAdminToken } from '@src/api/adminToken'
import { adminController } from '@src/api/controllers/adminController'
import { HttpError } from '@src/api/httpClient'
import { queryKeys } from '@src/api/queryKeys'
import { resetAdminData } from '@src/api/refresh'

// 관리자 로그인 상태. 토큰이 없거나 서버가 거부하면 null (버튼 노출용일 뿐, 권한은 서버가 검증한다)
export function useAdmin() {
  return useQuery({
    queryKey: queryKeys.admin.me,
    queryFn: async () => {
      if (!getAdminToken()) return null
      try {
        return await adminController.getMe()
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          clearAdminToken()
          return null
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAdminLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: adminController.login,
    onSuccess: async ({ token, expiresAt }) => {
      saveAdminToken(token, expiresAt)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.me }),
        // 관리자에게만 보이는 정보(참여자 실명 등)가 있어 모임 데이터를 다시 불러온다
        resetAdminData(queryClient),
      ])
    },
  })
}

export function useAdminLogout() {
  const queryClient = useQueryClient()

  return () => {
    clearAdminToken()
    queryClient.setQueryData(queryKeys.admin.me, null)
    void resetAdminData(queryClient)
  }
}

// 관리자 목록은 들어올 때마다 새로 불러온다 (그 사이 가입·투표·마감 등 반영)
export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: adminController.getUsers,
    staleTime: 0,
  })
}

// 관리자 로그인이 확인된 뒤에만 불러온다 (비로그인 접근 시 401 요청을 보내지 않도록)
export function useAdminMeetings(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meetings,
    queryFn: adminController.getMeetings,
    enabled,
    staleTime: 0,
  })
}

// 선택한 모임 일괄 삭제: 지운 모임의 상세·투표 캐시는 지우고, 캘린더·마이페이지·모임 관리 목록은 다시 불러온다
// (refreshMeetingData 는 쓰지 않는다: 지운 모임 화면이 떠 있는 동안 그 모임을 다시 불러오면 404 가 잠깐 보인다)
export function useDeleteMeetings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminController.deleteMeetings,
    onSuccess: async (_data, codes) => {
      for (const code of codes) {
        queryClient.removeQueries({ queryKey: queryKeys.meeting.detail(code) })
        queryClient.removeQueries({ queryKey: [...queryKeys.poll.all, 'detail', code] })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meeting.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.meetings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.meetings }),
      ])
    },
  })
}

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: adminController.resetPassword,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.users }),
  })
}
