import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearAdminToken, getAdminToken, saveAdminToken } from '@src/api/adminToken'
import { adminController } from '@src/api/controllers/adminController'
import { HttpError } from '@src/api/httpClient'
import { queryKeys } from '@src/api/queryKeys'

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
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.me })
    },
  })
}

export function useAdminLogout() {
  const queryClient = useQueryClient()

  return () => {
    clearAdminToken()
    queryClient.setQueryData(queryKeys.admin.me, null)
  }
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: adminController.getUsers,
  })
}

// 관리자 로그인이 확인된 뒤에만 불러온다 (비로그인 접근 시 401 요청을 보내지 않도록)
export function useAdminMeetings(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meetings,
    queryFn: adminController.getMeetings,
    enabled,
  })
}

// 선택한 모임 일괄 삭제: 지운 모임의 상세·투표 캐시는 지우고, 캘린더·마이페이지·모임 관리 목록은 다시 불러온다
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
