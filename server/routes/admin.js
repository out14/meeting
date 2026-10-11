import { randomInt } from 'node:crypto'
import { Router } from 'express'
import db from '../db/db.js'
import { loginAdmin, requireAdmin } from '../lib/adminAuth.js'
import { HttpError } from '../lib/httpError.js'
import { DEADLINE_COLUMN, loadTiedPlaces, settleExpiredMeetings } from '../lib/meetingFlow.js'
import { hashPassword } from '../lib/password.js'
import { createFailureLimiter, LOGIN_FAILURE_LIMIT } from '../lib/rateLimit.js'

// 임시 비밀번호: 헷갈리는 문자(0/O, 1/l/I)를 뺀 10자
const TEMP_PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
const createTempPassword = () =>
  Array.from({ length: 10 }, () => TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]).join('')

const router = Router()
const loginLimiter = createFailureLimiter(LOGIN_FAILURE_LIMIT)

// 관리자 로그인: IP 기준으로 실패 횟수를 제한한다 (관리자 계정은 하나라 아이디로 나누지 않는다)
router.post('/login', (req, res) => {
  loginLimiter.check(req.ip)
  try {
    const session = loginAdmin(req.body?.username, req.body?.password)
    loginLimiter.reset(req.ip)
    res.json(session)
  } catch (error) {
    loginLimiter.fail(req.ip)
    throw error
  }
})

// 저장된 관리자 토큰이 아직 유효한지 확인
router.get('/me', requireAdmin, (req, res) => {
  res.json(req.admin)
})

// 회원 목록 (비밀번호 재설정용)
router.get('/users', requireAdmin, async (_req, res) => {
  const [users] = await db.query(
    `SELECT u.id, u.username, u.name, u.nickname, u.email, u.must_change_password AS mustChangePassword,
            u.created_at AS createdAt,
            (SELECT COUNT(*) FROM meeting_members mm WHERE mm.user_id = u.id) AS meetingCount
       FROM users u
      ORDER BY u.created_at DESC, u.id DESC`,
  )
  res.json(users.map((user) => ({ ...user, mustChangePassword: !!user.mustChangePassword })))
})

// 모임 관리: 모든 모임의 진행 상태·일정·장소·참여 현황 (마감 지난 모임은 먼저 정리)
router.get('/meetings', requireAdmin, async (_req, res) => {
  await settleExpiredMeetings()
  const [meetings] = await db.query(
    `SELECT m.id, m.code, m.title, m.stage, m.candidate_start AS candidateStart, m.candidate_end AS candidateEnd,
            ${DEADLINE_COLUMN.replace('vote_deadline', 'm.vote_deadline')} AS voteDeadline,
            m.schedule_start AS scheduleStart, m.schedule_end AS scheduleEnd, m.created_at AS createdAt,
            host.nickname AS hostNickname, hu.username AS hostUsername,
            (SELECT COUNT(*) FROM meeting_members mm WHERE mm.meeting_id = m.id) AS memberCount,
            (SELECT COUNT(DISTINCT v.member_id) FROM votes v JOIN polls p ON p.id = v.poll_id
              WHERE p.meeting_id = m.id AND p.type = 'DATE') AS dateVoterCount,
            (SELECT COUNT(DISTINCT v.member_id) FROM votes v JOIN polls p ON p.id = v.poll_id
              WHERE p.meeting_id = m.id AND p.type = 'PLACE') AS placeVoterCount,
            (SELECT o.label FROM polls p JOIN poll_options o ON o.id = p.confirmed_option_id
              WHERE p.meeting_id = m.id AND p.type = 'PLACE') AS place
       FROM meetings m
       LEFT JOIN meeting_members host ON host.meeting_id = m.id AND host.role = 'HOST'
       LEFT JOIN users hu ON hu.id = host.user_id
      ORDER BY m.created_at DESC, m.id DESC`,
  )
  const tiedPlaces = await loadTiedPlaces()
  res.json(meetings.map(({ id, ...meeting }) => ({ ...meeting, placeTied: tiedPlaces.get(id) ?? [] })))
})

// 선택한 모임 일괄 삭제. 참여자·투표 기록은 FK CASCADE 로 함께 지워진다
router.post('/meetings/delete', requireAdmin, async (req, res) => {
  const codes = req.body?.codes
  if (!Array.isArray(codes) || !codes.length || codes.length > 500 || !codes.every((code) => typeof code === 'string')) {
    throw new HttpError(400, '삭제할 모임을 선택해 주세요.')
  }
  const [result] = await db.query('DELETE FROM meetings WHERE code IN (?)', [codes])
  res.json({ deleted: result.affectedRows })
})

// 비밀번호 재설정: 임시 비밀번호를 발급하고 기존 로그인을 모두 끊는다. 임시 비밀번호는 이 응답에서만 볼 수 있다
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const temporaryPassword = createTempPassword()
  const [result] = await db.query(
    'UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?',
    [hashPassword(temporaryPassword), req.params.id],
  )
  if (!result.affectedRows) throw new HttpError(404, '존재하지 않는 회원입니다.')
  res.json({ temporaryPassword })
})

export default router
