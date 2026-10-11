import { HttpError } from './httpError.js'

// 로그인 실패 제한: 같은 IP + 아이디로 15분에 10번 틀리면 잠시 막는다 (성공하면 초기화)
export const LOGIN_FAILURE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000, message: '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.' }

// 메모리 기반 실패 횟수 제한 (서버를 재시작하면 초기화된다)
// key 별로 windowMs 동안 실패가 max 번 쌓이면 429
export function createFailureLimiter({ max, windowMs, message }) {
  const failures = new Map()

  const recent = (key) => {
    const now = Date.now()
    const list = (failures.get(key) ?? []).filter((time) => now - time < windowMs)
    failures.set(key, list)
    return list
  }

  return {
    check(key) {
      if (recent(key).length >= max) throw new HttpError(429, message)
    },
    fail(key) {
      recent(key).push(Date.now())
    },
    reset(key) {
      failures.delete(key)
    },
  }
}
