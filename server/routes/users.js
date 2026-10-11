import { Router } from 'express'
import db, { withTransaction } from '../db/db.js'
import { HttpError, requireText } from '../lib/httpError.js'
import { sendMail } from '../lib/mailer.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { settleExpiredMeetings } from '../lib/meetingFlow.js'
import { createFailureLimiter, LOGIN_FAILURE_LIMIT } from '../lib/rateLimit.js'
import { createSignedToken, readSignedToken } from '../lib/signedToken.js'
import { createUserToken, requireUser, toPublicUser, USER_COLUMNS } from '../lib/userAuth.js'

const router = Router()

const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/
const PASSWORD_MIN = 6
const PASSWORD_MAX = 64

const toSession = (user) => {
  const { token, expiresAt } = createUserToken(user)
  return { token, expiresAt, user: toPublicUser(user) }
}

// 비밀번호 찾기: 가입 이메일로 재설정 링크(30분)를 보낸다 → 링크에서 새 비밀번호
// 재설정 토큰에 token_version 을 넣어, 한 번 쓰면(버전이 오르면) 다시 쓸 수 없게 한다
const RESET_TOKEN_TTL_MINUTES = 30
// 같은 IP·이메일로 15분에 5번까지만 메일을 보낸다 (메일 폭탄 방지)
const resetLimiter = createFailureLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
  message: '요청이 너무 많습니다. 15분 뒤에 다시 시도해 주세요.',
})
// 메일 속 링크의 사이트 주소 (배포 시 실제 도메인)
const appUrl = () => (process.env.APP_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')

function resetMail(user, link) {
  const text = [
    `${user.nickname} 님, 안녕하세요.`,
    '',
    `요정 정모 비밀번호 재설정 요청을 받았어요. 아이디: ${user.username}`,
    `아래 링크에서 ${RESET_TOKEN_TTL_MINUTES}분 안에 새 비밀번호를 설정해 주세요.`,
    '',
    link,
    '',
    '본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않아요.',
  ].join('\n')
  return { to: user.email, subject: '[요정 정모] 비밀번호 재설정 안내', text }
}

const loginLimiter = createFailureLimiter(LOGIN_FAILURE_LIMIT)

const readUsername = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 254

// 이메일은 소문자로 맞춰 저장/비교한다
function readEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email) throw new HttpError(400, '이메일을 입력해 주세요.')
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) throw new HttpError(400, '올바른 이메일 주소를 입력해 주세요.')
  return email
}

function readNewPassword(value, field = '비밀번호') {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    throw new HttpError(400, `${field}는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`)
  }
  return value
}

// 회원가입: 아이디 / 이름 / 닉네임 / 이메일 / 비밀번호
router.post('/', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(400, '아이디는 영문 소문자, 숫자, _ 로 4~20자 입력해 주세요.')
  }
  const name = requireText(req.body?.name, '이름', 30)
  const nickname = requireText(req.body?.nickname, '닉네임', 30)
  const email = readEmail(req.body?.email)
  const password = readNewPassword(req.body?.password)

  let insertId
  try {
    ;[{ insertId }] = await db.query(
      'INSERT INTO users (username, name, nickname, email, password_hash) VALUES (?, ?, ?, ?, ?)',
      [username, name, nickname, email, hashPassword(password)],
    )
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, error.message.includes('uq_user_email') ? '이미 가입된 이메일입니다.' : '이미 사용 중인 아이디입니다.')
    }
    throw error
  }

  res
    .status(201)
    .json(toSession({ id: insertId, username, name, nickname, email, mustChangePassword: 0, tokenVersion: 0 }))
})

router.post('/login', async (req, res) => {
  const username = readUsername(req.body?.username)
  const limitKey = `${req.ip}:${username}`
  loginLimiter.check(limitKey)
  const [[row]] = await db.query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE username = ?`, [username])
  if (!row || !verifyPassword(req.body?.password, row.password_hash)) {
    loginLimiter.fail(limitKey)
    throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.')
  }
  loginLimiter.reset(limitKey)
  res.json(toSession(row))
})

// 재설정 메일 요청. 가입된 이메일인지와 상관없이 같은 응답을 준다 (가입 여부를 알 수 없게)
// 메일은 응답과 따로 보내, 응답 시간으로도 가입 여부가 드러나지 않게 한다
router.post('/password-reset/request', async (req, res) => {
  const email = readEmail(req.body?.email)
  const limitKey = `${req.ip}:${email}`
  resetLimiter.check(limitKey)
  resetLimiter.fail(limitKey)

  const [[user]] = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email])
  if (user) {
    const { token } = createSignedToken('reset', `${user.id}:${user.tokenVersion}`, RESET_TOKEN_TTL_MINUTES / 60)
    const link = `${appUrl()}/find-password/reset?token=${encodeURIComponent(token)}`
    sendMail(resetMail(user, link)).catch((error) => console.error('재설정 메일 발송 실패:', error.message))
  }
  res.json({ ok: true })
})

// 재설정 링크 확인: 링크가 아직 쓸 수 있는지 (아이디 표시용)
router.post('/password-reset/check', async (req, res) => {
  const session = readSignedToken(req.body?.resetToken, 'reset')
  const [id, version] = typeof session?.subject === 'string' ? session.subject.split(':').map(Number) : []
  const [[user]] = id ? await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]) : [[]]
  if (!user || user.tokenVersion !== version) {
    throw new HttpError(400, '재설정 링크가 만료됐거나 이미 사용됐어요. 비밀번호 찾기를 다시 해 주세요.')
  }
  res.json({ username: user.username, expiresAt: session.expiresAt })
})

// 새 비밀번호 설정. 기존 로그인은 모두 끊고, 이 기기는 새 비밀번호로 로그인시킨다
router.post('/password-reset', async (req, res) => {
  const newPassword = readNewPassword(req.body?.newPassword, '새 비밀번호')
  const session = readSignedToken(req.body?.resetToken, 'reset')
  const [id, version] = typeof session?.subject === 'string' ? session.subject.split(':').map(Number) : []

  const [result] = id
    ? await db.query(
        `UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1
          WHERE id = ? AND token_version = ?`,
        [hashPassword(newPassword), id, version],
      )
    : [{ affectedRows: 0 }]
  if (!result.affectedRows) {
    throw new HttpError(400, '비밀번호 재설정 시간이 지났거나 이미 사용된 요청입니다. 처음부터 다시 시도해 주세요.')
  }

  const [[user]] = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id])
  res.json(toSession(user))
})

router.get('/me', requireUser, (req, res) => {
  res.json(toPublicUser(req.user))
})

// 회원 탈퇴: 비밀번호를 다시 확인한 뒤 회원과 참여 기록을 지운다
// - 내가 개설한(모임장인) 모임은 함께 삭제 (모임장 없는 모임이 남지 않게)
// - 다른 모임에서는 참여자·투표가 지워진다 (FK CASCADE)
// - 내가 제시한 날짜에 다른 사람 표가 있으면, 그 날짜는 표를 준 다른 참여자의 제시로 넘겨 남긴다
//   (그대로 두면 proposed_by 가 NULL 이 되어 모임장이 정한 후보 날짜처럼 보인다)
router.delete('/me', requireUser, async (req, res) => {
  const [[{ password_hash: hash }]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!verifyPassword(req.body?.password, hash)) throw new HttpError(400, '비밀번호가 올바르지 않습니다.')

  const deletedMeetings = await withTransaction(async (conn) => {
    const [hosted] = await conn.query(
      "SELECT meeting_id AS id FROM meeting_members WHERE user_id = ? AND role = 'HOST' FOR UPDATE",
      [req.user.id],
    )
    if (hosted.length) await conn.query('DELETE FROM meetings WHERE id IN (?)', [hosted.map((meeting) => meeting.id)])

    const [members] = await conn.query('SELECT id FROM meeting_members WHERE user_id = ?', [req.user.id])
    const memberIds = members.map((member) => member.id)
    if (memberIds.length) {
      await conn.query('DELETE FROM votes WHERE member_id IN (?)', [memberIds])
      // 표가 남은 내 제시 날짜는 가장 먼저 표를 준 다른 참여자의 제시로
      await conn.query(
        `UPDATE poll_options o
            SET o.proposed_by = (SELECT v.member_id FROM votes v WHERE v.option_id = o.id ORDER BY v.id LIMIT 1)
          WHERE o.proposed_by IN (?) AND EXISTS (SELECT 1 FROM votes v WHERE v.option_id = o.id)`,
        [memberIds],
      )
      await conn.query('DELETE FROM poll_options WHERE proposed_by IN (?)', [memberIds])
    }
    await conn.query('DELETE FROM users WHERE id = ?', [req.user.id])
    return hosted.length
  })
  res.json({ ok: true, deletedMeetings })
})

// 비밀번호 변경: 현재 비밀번호 확인 후 변경. 다른 기기의 로그인은 끊기고, 지금 기기에는 새 토큰을 준다
router.put('/me/password', requireUser, async (req, res) => {
  const newPassword = readNewPassword(req.body?.newPassword, '새 비밀번호')
  const [[{ password_hash: currentHash }]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!verifyPassword(req.body?.currentPassword, currentHash)) {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.')
  }
  if (verifyPassword(newPassword, currentHash)) throw new HttpError(400, '현재 비밀번호와 다른 비밀번호를 입력해 주세요.')

  await db.query(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
    [hashPassword(newPassword), req.user.id],
  )
  const [[user]] = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [req.user.id])
  res.json(toSession(user))
})

// 마이페이지: 내가 개설한 모임 + 내가 참여한 모임별 내 투표
router.get('/me/meetings', requireUser, async (req, res) => {
  await settleExpiredMeetings()
  const [meetings] = await db.query(
    `SELECT m.code, m.title, m.stage, m.candidate_start AS candidateStart, m.candidate_end AS candidateEnd,
            m.created_at AS createdAt, mm.role, mm.id AS memberId,
            (SELECT COUNT(*) FROM meeting_members x WHERE x.meeting_id = m.id) AS memberCount,
            (SELECT o.label FROM polls p JOIN poll_options o ON o.id = p.confirmed_option_id
              WHERE p.meeting_id = m.id AND p.type = 'PLACE') AS place
       FROM meeting_members mm JOIN meetings m ON m.id = mm.meeting_id
      WHERE mm.user_id = ?
      ORDER BY m.created_at DESC, m.id DESC`,
    [req.user.id],
  )
  const memberIds = meetings.map((meeting) => meeting.memberId)
  const [votes] = memberIds.length
    ? await db.query(
        `SELECT v.member_id AS memberId, p.type, o.label, o.date_value AS date,
                o.id = p.confirmed_option_id AS confirmed
           FROM votes v
           JOIN poll_options o ON o.id = v.option_id
           JOIN polls p ON p.id = v.poll_id
          WHERE v.member_id IN (?)
          ORDER BY o.date_value, o.sort_order, o.id`,
        [memberIds],
      )
    : [[]]

  const myVotes = (memberId, type) =>
    votes
      .filter((vote) => vote.memberId === memberId && vote.type === type)
      .map(({ label, confirmed }) => ({ label, confirmed: !!confirmed }))

  const list = meetings.map(({ memberId, ...meeting }) => ({
    ...meeting,
    votes: {
      date: myVotes(memberId, 'DATE'),
      place: myVotes(memberId, 'PLACE'),
    },
  }))
  res.json({
    hosted: list.filter((meeting) => meeting.role === 'HOST'),
    // 투표를 한 번이라도 한 모임
    voted: list.filter((meeting) => Object.values(meeting.votes).some((votes) => votes.length)),
  })
})

export default router
