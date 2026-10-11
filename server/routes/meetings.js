import { Router } from 'express'
import db, { withTransaction } from '../db/db.js'
import { readAdmin } from '../lib/adminAuth.js'
import { createInviteCode, createMemberToken, loadMeeting, requireHost, requireMember } from '../lib/auth.js'
import { readCandidateRange, readDateRange } from '../lib/dates.js'
import { defaultPlaceDeadline, startOfDay } from '../lib/placeDeadline.js'
import {
  DEADLINE_COLUMN,
  loadTiedPlaces,
  MAX_SCHEDULE_DAYS,
  PLACE_DEADLINE_COLUMN,
  readPlaceDeadline,
  readVoteDeadline,
  removeMembers,
  setHostCandidates,
  settleExpiredMeetings,
  toDbDateTime,
} from '../lib/meetingFlow.js'
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

// 전체 모임 목록 (메인 캘린더 / 일정 미정·확정 목록용). 확정된 일정(시작일~종료일)과 장소가 있으면 함께 내려준다
router.get('/', async (_req, res) => {
  await settleExpiredMeetings()
  const [meetings] = await db.query(
    `SELECT m.id, m.code, m.title, m.stage, m.candidate_start AS candidateStart, m.candidate_end AS candidateEnd,
            ${DEADLINE_COLUMN.replace('vote_deadline', 'm.vote_deadline')} AS voteDeadline, m.created_at AS createdAt,
            (SELECT COUNT(*) FROM meeting_members mm WHERE mm.meeting_id = m.id) AS memberCount,
            ${PLACE_DEADLINE_COLUMN.replace('place_deadline', 'm.place_deadline')} AS placeDeadline,
            m.schedule_start AS startDate, m.schedule_end AS endDate,
            (SELECT o.label FROM polls p JOIN poll_options o ON o.id = p.confirmed_option_id
              WHERE p.meeting_id = m.id AND p.type = 'PLACE') AS place
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
  // 날짜 투표 중인 모임의 후보 날짜 (모임장이 정한 날짜. 떨어져 있을 수도 있다)
  const [candidates] = await db.query(
    `SELECT p.meeting_id AS meetingId, o.date_value AS date
       FROM poll_options o
       JOIN polls p ON p.id = o.poll_id AND p.type = 'DATE' AND p.status = 'OPEN'
      WHERE o.proposed_by IS NULL
      ORDER BY o.date_value`,
  )
  const tiedPlaces = await loadTiedPlaces()
  res.json(
    meetings.map(({ id, ...meeting }) => ({
      ...meeting,
      // 장소 투표가 동점으로 끝나 확정되지 않은 지역들
      placeTied: tiedPlaces.get(id) ?? [],
      candidateDates: candidates.filter((candidate) => candidate.meetingId === id).map(({ date }) => date),
      proposals: proposals
        .filter((proposal) => proposal.meetingId === id)
        .map(({ date, proposedBy }) => ({ date, proposedBy })),
    })),
  )
})

// 모임 생성 (로그인한 회원 또는 관리자): 모임 + 모임장 + 날짜 투표를 한 번에 만든다
// - 회원: 회원 계정이 모임장이 된다 (이름/닉네임은 회원 정보)
// - 관리자: 입력한 이름/닉네임으로 모임장을 만들고 참여자 토큰을 발급한다
// 후보 기간(startDate ~ endDate)의 모든 날짜가 날짜 투표 후보가 되고, 모임장은 그 날짜들에 투표한 상태로 시작한다
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
    const [host] = await conn.query(
      "INSERT INTO meeting_members (meeting_id, name, nickname, role, user_id, token_hash) VALUES (?, ?, ?, 'HOST', ?, ?)",
      [meeting.insertId, name, nickname, req.user?.id ?? null, tokenHash],
    )
    const [datePoll] = await conn.query("INSERT INTO polls (meeting_id, type, multiple) VALUES (?, 'DATE', 1)", [
      meeting.insertId,
    ])
    await conn.query('INSERT INTO poll_options (poll_id, label, date_value) VALUES ?', [
      candidates.map((candidate) => [datePoll.insertId, candidate.label, candidate.value]),
    ])
    // 모임장은 직접 정한 후보 날짜에 모두 투표한 상태로 시작한다 (나중에 바꿀 수 있다)
    await conn.query(
      'INSERT INTO votes (poll_id, option_id, member_id) SELECT poll_id, id, ? FROM poll_options WHERE poll_id = ?',
      [host.insertId, datePoll.insertId],
    )
  })

  res.status(201).json({ code, token })
})

router.use('/:code', loadMeeting)

// 모임 정보 + 참여자 목록. 유효한 토큰이면 me 에 본인 정보가 담긴다
router.get('/:code', async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, nickname, role FROM meeting_members WHERE meeting_id = ? ORDER BY id',
    [req.meeting.id],
  )
  // 실명은 같은 모임 참여자와 관리자에게만 보여준다 (초대 링크만 아는 사람에게는 닉네임만)
  const canSeeNames = !!req.member || !!readAdmin(req)
  const members = rows.map((member) => ({ ...member, name: canSeeNames ? member.name : null }))
  const [[place]] = await db.query(
    `SELECT o.label, o.memo
       FROM polls p JOIN poll_options o ON o.id = p.confirmed_option_id
      WHERE p.meeting_id = ? AND p.type = 'PLACE'`,
    [req.meeting.id],
  )
  const { scheduleStart, scheduleEnd, ...meeting } = req.meeting
  const tiedPlaces = await loadTiedPlaces(req.meeting.id)

  res.json({
    ...meeting,
    members,
    me: req.member,
    confirmed: {
      schedule: scheduleStart ? { startDate: scheduleStart, endDate: scheduleEnd } : null,
      place: place ?? null,
      // 장소 투표가 동점으로 끝나 확정되지 않았으면 동점 지역들 (모임장이 하나로 정할 수 있다)
      placeTied: tiedPlaces.get(req.meeting.id) ?? [],
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

// 장소 투표 지금 마감 (모임장 또는 관리자): 장소 마감을 지금으로 당기고 최다 득표 지역으로 확정한다 (동점·무투표면 장소 미정)
router.post('/:code/close-place-vote', requireHostOrAdmin, async (req, res) => {
  if (req.meeting.stage !== 'PLACE') throw new HttpError(409, '장소 투표 중이 아닙니다.')
  await db.query("UPDATE meetings SET place_deadline = UTC_TIMESTAMP() WHERE id = ? AND stage = 'PLACE'", [req.meeting.id])
  await settleExpiredMeetings(req.meeting.id)
  res.json({ ok: true })
})

// 장소 투표 마감 수정 (모임장만, 장소 투표 중)
router.patch('/:code/place-deadline', requireHost, async (req, res) => {
  if (req.meeting.stage !== 'PLACE') throw new HttpError(409, '장소 투표 중에만 마감을 바꿀 수 있습니다.')
  const placeDeadline = readPlaceDeadline(req.body?.placeDeadline, req.meeting.scheduleEnd)
  await db.query("UPDATE meetings SET place_deadline = ? WHERE id = ? AND stage = 'PLACE'", [
    toDbDateTime(placeDeadline),
    req.meeting.id,
  ])
  res.json({ ok: true })
})

// 날짜 수정 (모임장만). 단계에 따라 고치는 날짜가 다르다
// - 날짜 투표 중(VOTE): 후보 기간(+ 투표 마감). 기간 안의 모든 날짜가 후보가 된다 (setHostCandidates 참고)
// - 확정 후(PLACE/DONE): 확정 일정 (최대 14일, 투표 날짜가 아니어도 된다)
//   장소 투표 중인데 장소 마감이 새 시작일 이후가 되면 새 일정 기준 기본 마감으로 당긴다 (placeDeadlineChanged)
router.patch('/:code/dates', requireHost, async (req, res) => {
  const { startDate, endDate } = req.body ?? {}
  let placeDeadlineChanged = false

  await withTransaction(async (conn) => {
    const [[meeting]] = await conn.query('SELECT id, stage FROM meetings WHERE id = ? FOR UPDATE', [req.meeting.id])
    const [[datePoll]] = await conn.query("SELECT id FROM polls WHERE meeting_id = ? AND type = 'DATE'", [meeting.id])

    if (meeting.stage === 'VOTE') {
      const candidates = readCandidateRange(startDate, endDate)
      const voteDeadline = req.body?.voteDeadline === undefined ? null : readVoteDeadline(req.body.voteDeadline)
      await setHostCandidates(conn, {
        meetingId: meeting.id,
        pollId: datePoll.id,
        hostMemberId: req.member.id,
        dates: candidates,
      })
      if (voteDeadline) {
        await conn.query('UPDATE meetings SET vote_deadline = ? WHERE id = ?', [toDbDateTime(voteDeadline), meeting.id])
      }
      return
    }

    const days = readDateRange(startDate, endDate, '일정')
    if (days.length > MAX_SCHEDULE_DAYS) throw new HttpError(400, `일정은 최대 ${MAX_SCHEDULE_DAYS}일까지 정할 수 있습니다.`)
    await conn.query('UPDATE meetings SET schedule_start = ?, schedule_end = ? WHERE id = ?', [
      days[0].value,
      days.at(-1).value,
      meeting.id,
    ])
    const placeDeadline = req.meeting.placeDeadline && new Date(req.meeting.placeDeadline)
    if (meeting.stage === 'PLACE' && placeDeadline && placeDeadline >= startOfDay(days[0].value)) {
      await conn.query('UPDATE meetings SET place_deadline = ? WHERE id = ?', [
        toDbDateTime(defaultPlaceDeadline(days[0].value)),
        meeting.id,
      ])
      placeDeadlineChanged = true
    }
    // 투표 화면의 '확정' 표시: 새 시작일이 투표 날짜면 그 날짜, 아니면 없음
    await conn.query(
      'UPDATE polls p LEFT JOIN poll_options o ON o.poll_id = p.id AND o.date_value = ? SET p.confirmed_option_id = o.id WHERE p.id = ?',
      [days[0].value, datePoll.id],
    )
  })

  res.json({ ok: true, placeDeadlineChanged })
})

// 모임 삭제 (모임장 또는 관리자). 참여자, 투표, 선택지, 투표 기록은 FK CASCADE 로 함께 지워진다
router.delete('/:code', requireHostOrAdmin, async (req, res) => {
  await db.query('DELETE FROM meetings WHERE id = ?', [req.meeting.id])
  res.json({ ok: true })
})

// 참여 취소 (모임장 제외): 내 표를 모두 지우고 참여자 명단에서 빠진다. 다시 참여하려면 초대 링크로 들어온다
router.delete('/:code/members/me', requireMember, async (req, res) => {
  if (req.member.role === 'HOST') throw new HttpError(403, '모임장은 모임을 나갈 수 없어요. 모임을 삭제해 주세요.')
  await withTransaction((conn) => removeMembers(conn, [req.member.id]))
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
