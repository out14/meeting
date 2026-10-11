import db, { withTransaction } from '../db/db.js'
import { HttpError } from './httpError.js'

// 모임 진행 단계
// VOTE : 날짜 투표 (투표 마감 일시까지). 확정하면 연속된 날짜 범위가 일정이 된다
// PLACE: 장소 투표 (날짜가 확정되면 시작)
// DONE : 모임장이 장소까지 확정
export const POLL_STAGE = { DATE: 'VOTE', PLACE: 'PLACE' }

const MAX_DEADLINE_DAYS = 365
// 확정 일정의 최대 길이 (일)
export const MAX_SCHEDULE_DAYS = 14

// 'YYYY-MM-DD HH:MM:SS' (UTC) ↔ ISO 문자열. DB 의 vote_deadline 은 UTC 로 저장한다
export const toDbDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ')
export const DEADLINE_COLUMN = "DATE_FORMAT(vote_deadline, '%Y-%m-%dT%H:%i:%sZ')"

// 투표 마감 일시 검증 (ISO 문자열, 지금 이후 ~ 1년 이내)
export function readVoteDeadline(value) {
  const date = typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) throw new HttpError(400, '투표 마감 일시를 선택해 주세요.')
  if (date.getTime() <= Date.now()) throw new HttpError(400, '투표 마감 일시는 지금 이후로 선택해 주세요.')
  if (date.getTime() > Date.now() + MAX_DEADLINE_DAYS * 86_400_000) {
    throw new HttpError(400, `투표 마감 일시는 ${MAX_DEADLINE_DAYS}일 이내로 선택해 주세요.`)
  }
  return date
}

const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// 날짜 투표 확정: 투표를 닫고 일정(시작일~종료일)을 기록한 뒤 장소 투표로 넘어간다
// startOptionId 는 시작일 선택지 (투표 화면에서 '확정' 표시용)
export async function confirmSchedule(conn, { meetingId, pollId, startOptionId, startDate, endDate }) {
  const [result] = await conn.query(
    "UPDATE polls SET status = 'CLOSED', confirmed_option_id = ? WHERE id = ? AND status = 'OPEN'",
    [startOptionId, pollId],
  )
  if (!result.affectedRows) throw new HttpError(409, '이미 확정된 투표입니다.')
  await conn.query(
    "UPDATE meetings SET schedule_start = ?, schedule_end = ?, stage = 'PLACE' WHERE id = ? AND stage = 'VOTE'",
    [startDate, endDate, meetingId],
  )
  // 장소 투표는 여러 시·도를 고를 수 있다
  await conn.query("INSERT IGNORE INTO polls (meeting_id, type, multiple) VALUES (?, 'PLACE', 1)", [meetingId])
}

// 마감 자동 확정 범위: 최다 득표 날(동점이면 이른 날)에서 앞뒤로, 득표가 같은 날이 이어지는 데까지
// 표가 하나도 없으면 가장 이른 날 하루
export function pickScheduleRange(options) {
  const counted = [...options].sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
  const top = counted[0]
  if (!top) return null
  const byDate = new Map(options.map((option) => [option.date, option]))
  const sameCount = (date) => top.count > 0 && byDate.get(date)?.count === top.count

  let start = top.date
  let end = top.date
  while (sameCount(addDays(start, -1)) && (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1 < MAX_SCHEDULE_DAYS) {
    start = addDays(start, -1)
  }
  while (sameCount(addDays(end, 1)) && (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1 < MAX_SCHEDULE_DAYS) {
    end = addDays(end, 1)
  }
  return { startOptionId: byDate.get(start).id, startDate: start, endDate: end }
}

// 마감이 지난 모임: 날짜 투표를 자동 확정하고 장소 투표로 넘긴다
async function settleMeeting(meetingId) {
  await withTransaction(async (conn) => {
    const [[meeting]] = await conn.query(
      "SELECT id FROM meetings WHERE id = ? AND stage = 'VOTE' AND vote_deadline <= UTC_TIMESTAMP() FOR UPDATE",
      [meetingId],
    )
    if (!meeting) return

    const [[poll]] = await conn.query(
      "SELECT id FROM polls WHERE meeting_id = ? AND type = 'DATE' AND status = 'OPEN' FOR UPDATE",
      [meetingId],
    )
    if (!poll) return
    const [options] = await conn.query(
      `SELECT o.id, o.date_value AS date, COUNT(v.id) AS count
         FROM poll_options o LEFT JOIN votes v ON v.option_id = o.id
        WHERE o.poll_id = ?
        GROUP BY o.id`,
      [poll.id],
    )
    const range = pickScheduleRange(options)
    if (range) await confirmSchedule(conn, { meetingId, pollId: poll.id, ...range })
  })
}

// 마감이 지난 모임을 모두 정리한다 (목록 조회 시, 그리고 서버에서 주기적으로)
export async function settleExpiredMeetings(meetingId = null) {
  const [rows] = await db.query(
    `SELECT id FROM meetings WHERE stage = 'VOTE' AND vote_deadline <= UTC_TIMESTAMP() ${meetingId ? 'AND id = ?' : ''}`,
    meetingId ? [meetingId] : [],
  )
  for (const { id } of rows) await settleMeeting(id)
}
