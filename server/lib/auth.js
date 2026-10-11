import { createHash, randomBytes } from 'node:crypto'
import db from '../db/db.js'
import { HttpError } from './httpError.js'
import { DEADLINE_COLUMN, settleExpiredMeetings } from './meetingFlow.js'

export const TOKEN_HEADER = 'x-member-token'

export const createInviteCode = () => randomBytes(9).toString('base64url')

// 원본 토큰은 클라이언트에만 주고, DB 에는 해시만 저장한다
export function createMemberToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const MEETING_COLUMNS = `id, code, title, stage, candidate_start AS candidateStart, candidate_end AS candidateEnd,
  ${DEADLINE_COLUMN} AS voteDeadline, schedule_start AS scheduleStart, schedule_end AS scheduleEnd,
  created_at AS createdAt`

// :code 로 모임을 찾고, 참여자를 식별한다
// - 모임장(관리자가 만든 참여자): X-Member-Token
// - 회원: 로그인한 회원(req.user)의 user_id
// 투표 마감이 지났으면 먼저 자동 확정 → 장소 투표로 넘긴 뒤의 상태를 읽는다
export async function loadMeeting(req, _res, next) {
  const findMeeting = async () => {
    const [[meeting]] = await db.query(`SELECT ${MEETING_COLUMNS} FROM meetings WHERE code = ?`, [req.params.code])
    return meeting
  }
  let meeting = await findMeeting()
  if (!meeting) throw new HttpError(404, '존재하지 않는 모임입니다. 초대 링크를 확인해 주세요.')
  if (meeting.stage === 'VOTE' && Date.parse(meeting.voteDeadline) <= Date.now()) {
    await settleExpiredMeetings(meeting.id)
    meeting = await findMeeting()
  }
  req.meeting = meeting

  const token = req.get(TOKEN_HEADER)
  req.member = null
  if (token) {
    const [[member]] = await db.query(
      'SELECT id, name, nickname, role FROM meeting_members WHERE meeting_id = ? AND token_hash = ?',
      [meeting.id, hashToken(token)],
    )
    req.member = member ?? null
  }
  if (!req.member && req.user) {
    const [[member]] = await db.query(
      'SELECT id, name, nickname, role FROM meeting_members WHERE meeting_id = ? AND user_id = ?',
      [meeting.id, req.user.id],
    )
    req.member = member ?? null
  }
  next()
}

export function requireMember(req, _res, next) {
  if (!req.member) throw new HttpError(401, '모임 참여자만 이용할 수 있습니다.')
  next()
}

export function requireHost(req, _res, next) {
  if (!req.member) throw new HttpError(401, '모임 참여자만 이용할 수 있습니다.')
  if (req.member.role !== 'HOST') throw new HttpError(403, '모임장만 할 수 있습니다.')
  next()
}
