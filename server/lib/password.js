import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// 비밀번호는 `salt:hash`(scrypt) 형태로만 저장한다
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored?.split(':') ?? []
  if (typeof password !== 'string' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}
