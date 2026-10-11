import db from '../db/db.js'
import { HttpError } from './httpError.js'
import { createSignedToken, readSignedToken } from './signedToken.js'

export const USER_TOKEN_HEADER = 'x-user-token'

const TOKEN_TTL_HOURS = Number(process.env.USER_TOKEN_TTL_HOURS ?? 1)

// 토큰 subject = '<회원 id>:<token_version>'. 비밀번호를 바꾸거나 재설정하면 버전이 올라가 기존 로그인이 모두 끊긴다
export const createUserToken = (user) => createSignedToken('user', `${user.id}:${user.tokenVersion}`, TOKEN_TTL_HOURS)

export const USER_COLUMNS =
  'id, username, name, nickname, email, must_change_password AS mustChangePassword, token_version AS tokenVersion'

// 비밀번호 해시/토큰 버전은 응답에 싣지 않는다
export const toPublicUser = ({ tokenVersion: _version, password_hash: _hash, ...user }) => ({
  ...user,
  mustChangePassword: !!user.mustChangePassword,
})

// 회원 토큰이 있으면 req.user 에 회원 정보를 담는다 (없거나 무효면 null)
export async function loadUser(req, _res, next) {
  req.user = null
  const session = readSignedToken(req.get(USER_TOKEN_HEADER), 'user')
  const [id, version] = typeof session?.subject === 'string' ? session.subject.split(':').map(Number) : []
  if (id) {
    const [[user]] = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id])
    req.user = user && user.tokenVersion === version ? user : null
  }
  next()
}

export function requireUser(req, _res, next) {
  if (!req.user) throw new HttpError(401, '로그인이 필요합니다.')
  next()
}
