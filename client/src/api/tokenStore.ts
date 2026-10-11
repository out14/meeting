// 로그인 토큰 + 만료 시각을 localStorage 에 보관한다 (만료되면 없는 것으로 본다)
// 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 새로고침하면 다시 로그인해야 한다
export function createTokenStore(key: string) {
  const expiresKey = `${key}:expires`

  const read = (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  }

  const clear = () => {
    try {
      localStorage.removeItem(key)
      localStorage.removeItem(expiresKey)
    } catch {
      // 무시
    }
  }

  // 만료 시각(ms). 예전에 저장돼 만료 시각이 없으면 null (서버가 판단한다)
  const getExpiresAt = () => {
    const value = Number(read(expiresKey))
    return value > 0 ? value : null
  }

  return {
    get() {
      const token = read(key)
      const expiresAt = getExpiresAt()
      if (token && expiresAt && expiresAt <= Date.now()) {
        clear()
        return null
      }
      return token
    },
    save(token: string, expiresAt: number) {
      try {
        localStorage.setItem(key, token)
        localStorage.setItem(expiresKey, String(expiresAt))
      } catch {
        // 무시
      }
    },
    clear,
    getExpiresAt,
  }
}
