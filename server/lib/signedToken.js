import { createHmac, timingSafeEqual } from 'node:crypto'

// 서버에 저장하지 않는 서명 토큰: base64url(JSON payload) + '.' + HMAC 서명
// payload.typ 로 관리자/회원 토큰을 구분해, 한쪽 토큰으로 다른 쪽 권한을 얻을 수 없게 한다
function getSecret() {
  const secret = process.env.TOKEN_SECRET
  if (!secret) throw new Error('TOKEN_SECRET 환경 변수가 없습니다.')
  return secret
}

const sign = (payload) => createHmac('sha256', getSecret()).update(payload).digest('base64url')

export function createSignedToken(type, subject, ttlHours) {
  const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000
  const payload = Buffer.from(JSON.stringify({ typ: type, sub: subject, exp: expiresAt })).toString('base64url')
  return { token: `${payload}.${sign(payload)}`, expiresAt }
}

// 서명/종류/만료가 모두 맞으면 { subject, expiresAt }, 아니면 null
export function readSignedToken(token, type) {
  const [payload, signature] = typeof token === 'string' ? token.split('.') : []
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const { typ, sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typ !== type || typeof exp !== 'number' || exp < Date.now()) return null
    return { subject: sub, expiresAt: exp }
  } catch {
    return null
  }
}
