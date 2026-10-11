import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { userController, type UserSession } from '@src/api/controllers/userController'
import { HttpError } from '@src/api/httpClient'
import { queryKeys } from '@src/api/queryKeys'
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

// 로그인 상태가 바뀌면 "내 참여 정보"가 달라지므로 모임/투표를 다시 불러온다
const refreshIdentity = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.meeting.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.poll.all }),
  ])

function useSaveSession() {
  const queryClient = useQueryClient()
  return async ({ token, expiresAt, user }: UserSession) => {
    saveUserToken(token, expiresAt)
    queryClient.setQueryData(queryKeys.user.me, user)
    await refreshIdentity(queryClient)
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

export function useVerifyReset() {
  return useMutation({ mutationFn: userController.verifyReset })
}

// 재설정에 성공하면 새 비밀번호로 로그인된다
export function useResetPassword() {
  return useMutation({ mutationFn: userController.resetPassword, onSuccess: useSaveSession() })
}

export function useMyMeetings() {
  return useQuery({
    queryKey: queryKeys.user.meetings,
    queryFn: userController.getMyMeetings,
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return async () => {
    clearUserToken()
    queryClient.setQueryData(queryKeys.user.me, null)
    await refreshIdentity(queryClient)
  }
}
