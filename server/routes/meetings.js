import { Router } from 'express'
import db, { withTransaction } from '../db/db.js'
import { readAdmin } from '../lib/adminAuth.js'
import { createInviteCode, createMemberToken, loadMeeting, requireHost } from '../lib/auth.js'
import { readCandidateRange } from '../lib/dates.js'
import { DEADLINE_COLUMN, readVoteDeadline, settleExpiredMeetings, toDbDateTime } from '../lib/meetingFlow.js'
import { HttpError, requireText } from '../lib/httpError.js'
import { requireUser } from '../lib/userAuth.js'
import pollsRouter from './polls.js'

const router = Router()

function readProfile(body) {
  return {
    name: requireText(body?.name, '이름', 30),
    nickname: requireText(body?.nickname, '닉네임', 30),
  }
}

// 전체 모임 목록 (메인 캘린더 / 일정 미정 목록용). 확정된 일정(시작일~종료일)이 있으면 함께 내려준다
router.get('/', async (_req, res) => {
  await settleExpiredMeetings()
  const [meetings] = await db.query(
    `SELECT m.id, m.code, m.title, m.stage, m.candidate_start AS candidateStart, m.candidate_end AS candidateEnd,
            ${DEADLINE_COLUMN.replace('vote_deadline', 'm.vote_deadline')} AS voteDeadline, m.created_at AS createdAt,
            (SELECT COUNT(*) FROM meeting_members mm WHERE mm.meeting_id = m.id) AS memberCount,
            m.schedule_start AS startDate, m.schedule_end AS endDate
       FROM meetings m
      ORDER BY m.created_at DESC, m.id DESC`,
  )
  // 날짜 투표가 진행 중인 모임의 제안 날짜 (캘린더에 '모임명:닉네임's 제시' 로 표시)
  const [proposals] = await db.query(
    `SELECT p.meeting_id AS meetingId, o.date_value AS date, mm.nickname AS proposedBy
       FROM poll_options o
       JOIN polls p ON p.id = o.poll_id AND p.type = 'DATE' AND p.status = 'OPEN'
       JOIN meeting_members mm ON mm.id = o.proposed_by
      ORDER BY o.date_value, o.id`,
  )
  res.json(
    meetings.map(({ id, ...meeting }) => ({
      ...meeting,
      proposals: proposals
        .filter((proposal) => proposal.meetingId === id)
        .map(({ date, proposedBy }) => ({ date, proposedBy })),
    })),
  )
})

// 모임 생성 (로그인한 회원 또는 관리자): 모임 + 모임장 + 날짜 투표를 한 번에 만든다
// - 회원: 회원 계정이 모임장이 된다 (이름/닉네임은 회원 정보)
// - 관리자: 입력한 이름/닉네임으로 모임장을 만들고 참여자 토큰을 발급한다
// 후보 기간(startDate ~ endDate)의 모든 날짜가 날짜 투표 후보가 된다
// 투표 마감 일시(voteDeadline)까지 날짜 투표를 진행하고, 지나면 최다 득표로 확정 → 장소 투표
router.post('/', async (req, res) => {
  if (!req.user && !readAdmin(req)) throw new HttpError(401, '로그인이 필요합니다.')

  const title = requireText(req.body?.title, '모임명', 100)
  const { name, nickname } = req.user ?? readProfile(req.body)
  const candidates = readCandidateRange(req.body?.startDate, req.body?.endDate)
  const voteDeadline = readVoteDeadline(req.body?.voteDeadline)
  const code = createInviteCode()
  const { token, tokenHash } = req.user ? { token: null, tokenHash: null } : createMemberToken()

  await withTransaction(async (conn) => {
    const [meeting] = await conn.query(
      'INSERT INTO meetings (code, title, candidate_start, candidate_end, vote_deadline) VALUES (?, ?, ?, ?, ?)',
      [code, title, candidates[0].value, candidates.at(-1).value, toDbDateTime(voteDeadline)],
    )
    await conn.query(
      "INSERT INTO meeting_members (meeting_id, name, nickname, role, user_id, token_hash) VALUES (?, ?, ?, 'HOST', ?, ?)",
      [meeting.insertId, name, nickname, req.user?.id ?? null, tokenHash],
    )
    const [datePoll] = await conn.query("INSERT INTO polls (meeting_id, type, multiple) VALUES (?, 'DATE', 1)", [
      meeting.insertId,
    ])
    await conn.query('INSERT INTO poll_options (poll_id, label, date_value) VALUES ?', [
      candidates.map((candidate) => [datePoll.insertId, candidate.label, candidate.value]),
    ])
  })

  res.status(201).json({ code, token })
})

router.use('/:code', loadMeeting)

// 모임 정보 + 참여자 목록. 유효한 토큰이면 me 에 본인 정보가 담긴다
router.get('/:code', async (req, res) => {
  const [members] = await db.query(
    'SELECT id, name, nickname, role FROM meeting_members WHERE meeting_id = ? ORDER BY id',
    [req.meeting.id],
  )
  const [[place]] = await db.query(
    `SELECT o.label, o.memo
       FROM polls p JOIN poll_options o ON o.id = p.confirmed_option_id
      WHERE p.meeting_id = ? AND p.type = 'PLACE'`,
    [req.meeting.id],
  )
  const { scheduleStart, scheduleEnd, ...meeting } = req.meeting

  res.json({
    ...meeting,
    members,
    me: req.member,
    confirmed: {
      schedule: scheduleStart ? { startDate: scheduleStart, endDate: scheduleEnd } : null,
      place: place ?? null,
    },
  })
})

// 지금 마감 (모임장 또는 관리자): 마감 일시를 지금으로 당기고, 날짜 투표를 최다 득표로 확정해 장소 투표로 넘긴다
const requireHostOrAdmin = (req, res, next) => (readAdmin(req) ? next() : requireHost(req, res, next))

router.post('/:code/close-vote', requireHostOrAdmin, async (req, res) => {
  if (req.meeting.stage !== 'VOTE') throw new HttpError(409, '이미 마감된 투표입니다.')
  await db.query("UPDATE meetings SET vote_deadline = UTC_TIMESTAMP() WHERE id = ? AND stage = 'VOTE'", [req.meeting.id])
  await settleExpiredMeetings(req.meeting.id)
  res.json({ ok: true })
})

// 모임 삭제 (모임장 또는 관리자). 참여자, 투표, 선택지, 투표 기록은 FK CASCADE 로 함께 지워진다
router.delete('/:code', requireHostOrAdmin, async (req, res) => {
  await db.query('DELETE FROM meetings WHERE id = ?', [req.meeting.id])
  res.json({ ok: true })
})

// 초대 링크로 참여 (로그인한 회원만). 이름/닉네임은 회원 정보를 쓰고, 항상 일반 참여자로 등록한다
router.post('/:code/members', requireUser, async (req, res) => {
  if (req.member) throw new HttpError(409, '이미 참여한 모임입니다.')

  try {
    await db.query('INSERT INTO meeting_members (meeting_id, name, nickname, user_id) VALUES (?, ?, ?, ?)', [
      req.meeting.id,
      req.user.name,
      req.user.nickname,
      req.user.id,
    ])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, '이 모임에 같은 닉네임의 참여자가 이미 있습니다.')
    throw error
  }

  res.status(201).json({ ok: true })
})

router.use('/:code/polls', pollsRouter)

export default router
