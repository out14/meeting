import { HttpError } from './httpError.js'
import { verifyPassword } from './password.js'
import { createSignedToken, readSignedToken } from './signedToken.js'

// 관리자는 .env 에 지정된 계정 하나 (회원 테이블과 별개)
// 비밀번호 해시 만들기: yarn workspace server admin:hash <비밀번호>
const TOKEN_TTL_HOURS = Number(process.env.ADMIN_TOKEN_TTL_HOURS ?? 1)

export function loginAdmin(username, password) {
  const valid =
    typeof username === 'string' &&
    username === process.env.ADMIN_USERNAME &&
    verifyPassword(password, process.env.ADMIN_PASSWORD_HASH)
  if (!valid) throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.')
  return createSignedToken('admin', username, TOKEN_TTL_HOURS)
}

// 회원 토큰(X-User-Token), 참여자 토큰(X-Member-Token)과 분리해 Authorization: Bearer 로만 받는다
// 유효한 관리자 토큰이면 { username, expiresAt }, 아니면 null
export function readAdmin(req) {
  const [scheme, token] = req.get('authorization')?.split(' ') ?? []
  const admin = scheme === 'Bearer' ? readSignedToken(token, 'admin') : null
  if (!admin || admin.subject !== process.env.ADMIN_USERNAME) return null
  return { username: admin.subject, expiresAt: admin.expiresAt }
}

export function requireAdmin(req, _res, next) {
  req.admin = readAdmin(req)
  if (!req.admin) throw new HttpError(401, '관리자 로그인이 필요합니다.')
  next()
}
