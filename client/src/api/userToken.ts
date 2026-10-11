import { createTokenStore } from '@src/api/tokenStore'

// 회원 로그인 토큰 (1시간). 관리자 토큰(admin-token), 참여자 토큰(meeting-token:<code>)과 다른 키에 보관한다
export const userTokenStore = createTokenStore('user-token')

export const getUserToken = () => userTokenStore.get()
export const saveUserToken = (token: string, expiresAt: number) => userTokenStore.save(token, expiresAt)
export const clearUserToken = () => userTokenStore.clear()

export function userTokenConfig() {
  const token = getUserToken()
  return token ? { headers: { 'X-User-Token': token } } : undefined
}
