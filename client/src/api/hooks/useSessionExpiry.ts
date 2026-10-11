import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { adminTokenStore } from '@src/api/adminToken'
import { queryKeys } from '@src/api/queryKeys'
import { userTokenStore } from '@src/api/userToken'

// 로그인 1시간이 지나면 화면에서도 바로 로그아웃 처리한다 (서버는 만료된 토큰을 거부한다)
// 로그인 상태가 바뀔 때마다 타이머를 다시 건다
export function useSessionExpiry(isUserLoggedIn: boolean, isAdminLoggedIn: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const timers: number[] = []
    const watch = (store: typeof userTokenStore, active: boolean, onExpire: () => void) => {
      const expiresAt = store.getExpiresAt()
      if (!active || !expiresAt) return
      // setTimeout 최대값(약 24일)을 넘지 않게
      const delay = Math.min(Math.max(expiresAt - Date.now(), 0), 2_147_000_000)
      timers.push(window.setTimeout(onExpire, delay))
    }

    watch(userTokenStore, isUserLoggedIn, () => {
      userTokenStore.clear()
      queryClient.setQueryData(queryKeys.user.me, null)
      queryClient.invalidateQueries({ queryKey: queryKeys.meeting.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.poll.all })
      window.alert('로그인한 지 1시간이 지나 로그아웃됐어요. 다시 로그인해 주세요.')
    })
    watch(adminTokenStore, isAdminLoggedIn, () => {
      adminTokenStore.clear()
      queryClient.setQueryData(queryKeys.admin.me, null)
      window.alert('관리자 로그인 1시간이 지나 로그아웃됐어요.')
    })

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [isUserLoggedIn, isAdminLoggedIn, queryClient])
}
