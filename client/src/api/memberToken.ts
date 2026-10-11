import { getUserToken } from '@src/api/userToken'

// 모임별 참여자 토큰을 localStorage 에 보관한다 (관리자가 만든 모임장 식별용)
const storageKey = (code: string) => `meeting-token:${code}`

export function getMemberToken(code: string) {
  try {
    return localStorage.getItem(storageKey(code))
  } catch {
    return null
  }
}

export function saveMemberToken(code: string, token: string) {
  try {
    localStorage.setItem(storageKey(code), token)
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 이번 접속에서만 유지된다
  }
}

// 모임 API 요청 헤더: 모임장은 참여자 토큰, 회원은 회원 토큰으로 식별된다
export function memberTokenConfig(code: string) {
  const memberToken = getMemberToken(code)
  const userToken = getUserToken()
  if (!memberToken && !userToken) return undefined
  return {
    headers: {
      ...(memberToken && { 'X-Member-Token': memberToken }),
      ...(userToken && { 'X-User-Token': userToken }),
    },
  }
}
