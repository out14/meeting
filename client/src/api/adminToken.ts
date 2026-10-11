import { createTokenStore } from '@src/api/tokenStore'

// 관리자 토큰 (1시간). 참여자 토큰(meeting-token:<code>)과 다른 키에 사이트 단위로 보관한다
export const adminTokenStore = createTokenStore('admin-token')

export const getAdminToken = () => adminTokenStore.get()
export const saveAdminToken = (token: string, expiresAt: number) => adminTokenStore.save(token, expiresAt)
export const clearAdminToken = () => adminTokenStore.clear()

// 관리자 전용 API 에만 Authorization 헤더를 붙인다
export function adminTokenConfig() {
  const token = getAdminToken()
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
}
