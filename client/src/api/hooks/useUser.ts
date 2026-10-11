import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userController, type UserSession } from '@src/api/controllers/userController'
import { HttpError } from '@src/api/httpClient'
import { queryKeys } from '@src/api/queryKeys'
import { resetUserData } from '@src/api/refresh'
import { clearUserToken, getUserToken, saveUserToken } from '@src/api/userToken'

// 로그인한 회원. 토큰이 없거나 서버가 거부하면 null
export function useUser() {
  return useQuery({
    queryKey: queryKeys.user.me,
    queryFn: async () => {
      if (!getUserToken()) return null
      try {
        return await userController.getMe()
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          clearUserToken()
          return null
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useSaveSession() {
  const queryClient = useQueryClient()
  return async ({ token, expiresAt, user }: UserSession) => {
    saveUserToken(token, expiresAt)
    queryClient.setQueryData(queryKeys.user.me, user)
    // 사용자가 바뀌었으니 이전 사용자의 마이페이지는 지우고, 내 참여 정보가 담긴 데이터는 다시 불러온다
    await resetUserData(queryClient)
  }
}

export function useSignup() {
  return useMutation({ mutationFn: userController.signup, onSuccess: useSaveSession() })
}

export function useLogin() {
  return useMutation({ mutationFn: userController.login, onSuccess: useSaveSession() })
}

// 비밀번호를 바꾸면 서버가 새 토큰을 준다 (다른 기기의 로그인은 끊긴다)
export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: userController.changePassword,
    onSuccess: ({ token, expiresAt, user }) => {
      saveUserToken(token, expiresAt)
      queryClient.setQueryData(queryKeys.user.me, user)
    },
  })
}

export function useRequestReset() {
  return useMutation({ mutationFn: userController.requestReset })
}

// 재설정 링크 확인 (만료·사용 여부). 다시 시도하지 않는다
export function useResetLink(resetToken: string) {
  return useQuery({
    queryKey: ['user', 'reset-link', resetToken],
    queryFn: () => userController.checkReset(resetToken),
    enabled: !!resetToken,
    retry: false,
    staleTime: Infinity,
  })
}

// 재설정에 성공하면 새 비밀번호로 로그인된다
export function useResetPassword() {
  return useMutation({ mutationFn: userController.resetPassword, onSuccess: useSaveSession() })
}

// 마이페이지는 들어올 때마다 새로 불러온다 (다른 사람의 투표·마감 등 내가 하지 않은 변경도 반영)
export function useMyMeetings() {
  return useQuery({
    queryKey: queryKeys.user.meetings,
    queryFn: userController.getMyMeetings,
    staleTime: 0,
  })
}

// 회원 탈퇴. 성공하면 호출하는 쪽에서 로그인 정보를 지우고 홈을 새로 불러온다 (WithdrawSection)
export function useWithdraw() {
  return useMutation({ mutationFn: userController.withdraw })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return async () => {
    clearUserToken()
    queryClient.setQueryData(queryKeys.user.me, null)
    await resetUserData(queryClient)
  }
}
