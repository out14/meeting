import db, { withTransaction } from '../db/db.js'
import { MAX_CANDIDATE_DAYS } from './dates.js'
import { HttpError } from './httpError.js'
import { defaultPlaceDeadline, endOfDay } from './placeDeadline.js'
import { REGIONS } from './regions.js'

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
export const PLACE_DEADLINE_COLUMN = "DATE_FORMAT(place_deadline, '%Y-%m-%dT%H:%i:%sZ')"

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

// 장소 투표 마감 검증 (ISO 문자열, 지금 이후 ~ 확정 일정 마지막 날 23:59)
export function readPlaceDeadline(value, scheduleEnd) {
  const date = typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) throw new HttpError(400, '장소 투표 마감 일시를 입력해 주세요.')
  if (date.getTime() <= Date.now()) throw new HttpError(400, '장소 투표 마감은 지금 이후로 입력해 주세요.')
  if (date > endOfDay(scheduleEnd)) throw new HttpError(400, '장소 투표 마감은 정모가 끝나기 전으로 입력해 주세요.')
  return date
}

const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// 모임장이 정한 후보 날짜 = 모임장이 투표한 날짜. 모임장이 날짜를 고치면 '제시'가 아니라 후보 날짜 '수정'이다
// - 빠진 후보 날짜는 지운다 (그 날짜의 다른 참여자 표도 함께 사라진다)
// - 새 날짜는 후보로 추가하고, 참여자가 제안했던 날짜를 고르면 후보로 바뀐다 (그 참여자의 표는 유지)
// - 모임장 표는 후보 날짜 전체, candidate_start/end 는 첫·마지막 후보 날짜
// dates: [{ value, label }] (1개 이상)
export async function setHostCandidates(conn, { meetingId, pollId, hostMemberId, dates }) {
  const values = dates.map((date) => date.value).sort()
  if (!values.length) throw new HttpError(400, '후보 날짜를 하나 이상 골라 주세요.')
  const span = (Date.parse(values.at(-1)) - Date.parse(values[0])) / 86_400_000 + 1
  if (span > MAX_CANDIDATE_DAYS) {
    throw new HttpError(400, `후보 날짜는 첫날부터 마지막 날까지 최대 ${MAX_CANDIDATE_DAYS}일 안에서 골라 주세요.`)
  }

  await conn.query('SELECT id FROM poll_options WHERE poll_id = ? FOR UPDATE', [pollId])
  await conn.query('DELETE FROM poll_options WHERE poll_id = ? AND proposed_by IS NULL AND date_value NOT IN (?)', [
    pollId,
    values,
  ])
  await conn.query('INSERT IGNORE INTO poll_options (poll_id, label, date_value) VALUES ?', [
    dates.map((date) => [pollId, date.label, date.value]),
  ])
  await conn.query('UPDATE poll_options SET proposed_by = NULL WHERE poll_id = ? AND date_value IN (?)', [pollId, values])

  await conn.query('DELETE FROM votes WHERE poll_id = ? AND member_id = ?', [pollId, hostMemberId])
  await conn.query(
    'INSERT INTO votes (poll_id, option_id, member_id) SELECT poll_id, id, ? FROM poll_options WHERE poll_id = ? AND date_value IN (?)',
    [hostMemberId, pollId, values],
  )
  // 예전 방식으로 모임장이 '제안'해 둔 날짜가 표 없이 남아 있으면 지운다
  await conn.query(
    `DELETE o FROM poll_options o LEFT JOIN votes v ON v.option_id = o.id
      WHERE o.poll_id = ? AND o.proposed_by = ? AND v.id IS NULL`,
    [pollId, hostMemberId],
  )
  await conn.query('UPDATE meetings SET candidate_start = ?, candidate_end = ? WHERE id = ?', [
    values[0],
    values.at(-1),
    meetingId,
  ])
}

// 날짜 투표 확정: 투표를 닫고 일정(시작일~종료일)을 기록한 뒤 장소 투표로 넘어간다
// startOptionId 는 시작일 선택지 (투표 화면에서 '확정' 표시용)
// placeDeadline 을 주지 않으면 기본 마감 (시작일 D-2 23:59)
export async function confirmSchedule(conn, { meetingId, pollId, startOptionId, startDate, endDate, placeDeadline = null }) {
  const [result] = await conn.query(
    "UPDATE polls SET status = 'CLOSED', confirmed_option_id = ? WHERE id = ? AND status = 'OPEN'",
    [startOptionId, pollId],
  )
  if (!result.affectedRows) throw new HttpError(409, '이미 확정된 투표입니다.')
  await conn.query(
    "UPDATE meetings SET schedule_start = ?, schedule_end = ?, place_deadline = ?, stage = 'PLACE' WHERE id = ? AND stage = 'VOTE'",
    [startDate, endDate, toDbDateTime(placeDeadline ?? defaultPlaceDeadline(startDate)), meetingId],
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

// 장소 확정: 투표를 닫고 일정 확정(DONE). optionId 가 없으면 장소 미정(동점·무투표)으로 닫는다
export async function confirmPlace(conn, { meetingId, pollId, optionId = null }) {
  await conn.query("UPDATE polls SET status = 'CLOSED', confirmed_option_id = ? WHERE id = ?", [optionId, pollId])
  await conn.query("UPDATE meetings SET stage = 'DONE' WHERE id = ?", [meetingId])
}

// 장소 투표 마감이 지난 모임: 최다 득표 지역이 하나면 확정, 동점이면 동점 지역을 모두 남기고(모임장이 나중에 고를 수 있다),
// 아무도 투표하지 않았으면 장소 미정으로 닫는다
async function settlePlace(meetingId) {
  await withTransaction(async (conn) => {
    const [[meeting]] = await conn.query(
      "SELECT id FROM meetings WHERE id = ? AND stage = 'PLACE' AND place_deadline <= UTC_TIMESTAMP() FOR UPDATE",
      [meetingId],
    )
    if (!meeting) return
    const [[poll]] = await conn.query(
      "SELECT id FROM polls WHERE meeting_id = ? AND type = 'PLACE' AND status = 'OPEN' FOR UPDATE",
      [meetingId],
    )
    if (!poll) return
    const [options] = await conn.query(
      `SELECT o.id, COUNT(v.id) AS count FROM poll_options o LEFT JOIN votes v ON v.option_id = o.id
        WHERE o.poll_id = ? GROUP BY o.id`,
      [poll.id],
    )
    const top = Math.max(0, ...options.map((option) => option.count))
    const winners = options.filter((option) => top > 0 && option.count === top)
    await confirmPlace(conn, { meetingId, pollId: poll.id, optionId: winners.length === 1 ? winners[0].id : null })
  })
}

// 장소가 확정되지 않은 채 닫힌 장소 투표의 동점 지역 (meetingId → ['서울', '부산']). 아무도 투표하지 않았으면 빈 배열
export async function loadTiedPlaces(meetingId = null) {
  const [rows] = await db.query(
    `SELECT p.meeting_id AS meetingId, o.label, COUNT(v.id) AS count
       FROM polls p JOIN poll_options o ON o.poll_id = p.id LEFT JOIN votes v ON v.option_id = o.id
      WHERE p.type = 'PLACE' AND p.status = 'CLOSED' AND p.confirmed_option_id IS NULL ${meetingId ? 'AND p.meeting_id = ?' : ''}
      GROUP BY o.id`,
    meetingId ? [meetingId] : [],
  )
  const tied = new Map()
  for (const id of new Set(rows.map((row) => row.meetingId))) {
    const options = rows.filter((row) => row.meetingId === id)
    const top = Math.max(0, ...options.map((option) => option.count))
    tied.set(
      id,
      options
        .filter((option) => top > 0 && option.count === top)
        .map((option) => option.label)
        .sort((a, b) => REGIONS.indexOf(a) - REGIONS.indexOf(b)),
    )
  }
  return tied
}

// 마감이 지난 모임을 모두 정리한다 (목록 조회 시, 그리고 서버에서 주기적으로)
// 날짜 투표 마감 → 날짜 확정·장소 투표, 장소 투표 마감 → 장소 확정
export async function settleExpiredMeetings(meetingId = null) {
  const [rows] = await db.query(
    `SELECT id FROM meetings
      WHERE ((stage = 'VOTE' AND vote_deadline <= UTC_TIMESTAMP()) OR (stage = 'PLACE' AND place_deadline <= UTC_TIMESTAMP()))
      ${meetingId ? 'AND id = ?' : ''}`,
    meetingId ? [meetingId] : [],
  )
  for (const { id } of rows) {
    await settleMeeting(id)
    // 날짜 확정 직후에는 장소 마감이 미래라 아무 일도 없다
    await settlePlace(id)
  }
}
