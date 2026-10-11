import { Router } from 'express'
import db, { withTransaction } from '../db/db.js'
import { requireHost, requireMember } from '../lib/auth.js'
import { readDateRange, readDates } from '../lib/dates.js'
import { isRegion, REGIONS } from '../lib/regions.js'
import { HttpError } from '../lib/httpError.js'
import {
  confirmPlace,
  confirmSchedule,
  MAX_SCHEDULE_DAYS,
  POLL_STAGE,
  readPlaceDeadline,
  setHostCandidates,
} from '../lib/meetingFlow.js'

const router = Router()

// 날짜 투표 선택지 최대 개수 (후보 기간 + 제안한 날짜)
const MAX_DATE_OPTIONS = 100

const POLL_TYPES = { date: 'DATE', place: 'PLACE' }
// 장소 투표 의견 최대 길이
const MAX_COMMENT = 300

// :type(date|place) 에 해당하는 이 모임의 투표를 req.poll 에 담는다
router.param('type', async (req, _res, next, type) => {
  try {
    const pollType = POLL_TYPES[type]
    if (!pollType) throw new HttpError(404, '존재하지 않는 투표입니다.')

    const [[poll]] = await db.query(
      'SELECT id, type, multiple, status, confirmed_option_id AS confirmedOptionId FROM polls WHERE meeting_id = ? AND type = ?',
      [req.meeting.id, pollType],
    )
    // 장소 투표는 장소 투표 단계가 되어야 만들어진다
    if (!poll) throw new HttpError(404, '아직 시작되지 않은 투표입니다.')
    req.poll = { ...poll, multiple: !!poll.multiple }
    next()
  } catch (error) {
    next(error)
  }
})

// 진행 중인 단계의 열린 투표만 수정할 수 있다
function assertEditable(req) {
  if (req.poll.status !== 'OPEN') throw new HttpError(409, '이미 확정된 투표입니다.')
  if (req.meeting.stage !== POLL_STAGE[req.poll.type]) throw new HttpError(409, '지금은 이 투표를 진행할 수 없습니다.')
}

// 투표 결과 조회: 선택지별 득표 수와 투표자, 내 선택
router.get('/:type', async (req, res) => {
  const [options] = await db.query(
    `SELECT o.id, o.label, o.date_value AS date, o.memo, m.nickname AS proposedBy
       FROM poll_options o LEFT JOIN meeting_members m ON m.id = o.proposed_by
      WHERE o.poll_id = ?
      ORDER BY o.date_value, o.sort_order, o.id`,
    [req.poll.id],
  )
  const [votes] = await db.query(
    `SELECT v.option_id AS optionId, m.id, m.nickname, v.comment
       FROM votes v JOIN meeting_members m ON m.id = v.member_id
      WHERE v.poll_id = ?
      ORDER BY v.id`,
    [req.poll.id],
  )

  const voterIds = new Set(votes.map((vote) => vote.id))
  res.json({
    ...req.poll,
    voterCount: voterIds.size,
    options: options.map((option) => {
      const voters = votes
        .filter((vote) => vote.optionId === option.id)
        .map(({ id, nickname, comment }) => ({ id, nickname, comment }))
      return { ...option, count: voters.length, voters }
    }),
    myOptionIds: req.member ? votes.filter((vote) => vote.id === req.member.id).map((vote) => vote.optionId) : [],
    // 장소 투표에 남긴 내 의견
    myComment: (req.member && votes.find((vote) => vote.id === req.member.id)?.comment) || null,
  })
})

// 장소 투표 (참여자 누구나): 17개 시·도 중 여러 곳을 골라 투표하고, 의견을 하나 남길 수 있다
// 처음 고른 시·도는 선택지로 추가된다. 내 장소 투표는 보낸 시·도들로 통째로 교체된다
router.post('/:type/places', requireMember, async (req, res) => {
  if (req.poll.type !== 'PLACE') throw new HttpError(400, '장소 투표에서만 지역을 고를 수 있습니다.')
  assertEditable(req)
  const regions = Array.isArray(req.body?.regions) ? [...new Set(req.body.regions)] : []
  if (!regions.length || !regions.every(isRegion)) throw new HttpError(400, '지도에서 시·도를 하나 이상 골라 주세요.')
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''
  if (comment.length > MAX_COMMENT) throw new HttpError(400, `의견은 ${MAX_COMMENT}자 이하로 입력해 주세요.`)

  const optionIds = await withTransaction(async (conn) => {
    const [options] = await conn.query('SELECT id, label FROM poll_options WHERE poll_id = ? FOR UPDATE', [req.poll.id])
    const existing = new Set(options.map((option) => option.label))
    const added = regions.filter((region) => !existing.has(region))
    if (added.length) {
      await conn.query('INSERT INTO poll_options (poll_id, label, sort_order, proposed_by) VALUES ?', [
        added.map((region) => [req.poll.id, region, REGIONS.indexOf(region), req.member.id]),
      ])
    }
    const [chosen] = await conn.query('SELECT id FROM poll_options WHERE poll_id = ? AND label IN (?)', [req.poll.id, regions])
    const ids = chosen.map((option) => option.id)
    // 의견은 한 사람에 하나: 고른 시·도마다 같은 의견을 함께 저장한다
    await conn.query('DELETE FROM votes WHERE poll_id = ? AND member_id = ?', [req.poll.id, req.member.id])
    await conn.query('INSERT INTO votes (poll_id, option_id, member_id, comment) VALUES ?', [
      ids.map((optionId) => [req.poll.id, optionId, req.member.id, comment || null]),
    ])
    return ids
  })

  res.status(201).json({ optionIds })
})

// 날짜 제안 (참여자): 후보 기간 밖의 날짜도 선택지로 추가하고, 제안한 사람의 투표로 찍는다 (모임장은 후보 추가)
// 이미 있는 날짜는 새로 만들지 않고 기존 선택지에 투표한다
router.post('/:type/options', requireMember, async (req, res) => {
  if (req.poll.type !== 'DATE') throw new HttpError(400, '날짜 투표에만 날짜를 제안할 수 있습니다.')
  assertEditable(req)
  const dates = readDateRange(req.body?.startDate, req.body?.endDate ?? req.body?.startDate, '제안 기간')

  // 모임장이 날짜를 더하면 제안이 아니라 후보 날짜 추가다
  if (req.member.role === 'HOST') {
    const optionIds = await withTransaction(async (conn) => {
      const [current] = await conn.query(
        'SELECT date_value AS date FROM poll_options WHERE poll_id = ? AND proposed_by IS NULL',
        [req.poll.id],
      )
      await setHostCandidates(conn, {
        meetingId: req.meeting.id,
        pollId: req.poll.id,
        hostMemberId: req.member.id,
        dates: [...readDates(current.map((option) => option.date)), ...dates.filter((date) => !current.some((c) => c.date === date.value))],
      })
      const [options] = await conn.query('SELECT id FROM poll_options WHERE poll_id = ? AND date_value IN (?)', [
        req.poll.id,
        dates.map((date) => date.value),
      ])
      return options.map((option) => option.id)
    })
    return res.status(201).json({ optionIds })
  }

  const optionIds = await withTransaction(async (conn) => {
    const [existing] = await conn.query('SELECT date_value AS date FROM poll_options WHERE poll_id = ? FOR UPDATE', [
      req.poll.id,
    ])
    const existingDates = new Set(existing.map((option) => option.date))
    const added = dates.filter((date) => !existingDates.has(date.value))
    if (existing.length + added.length > MAX_DATE_OPTIONS) {
      throw new HttpError(400, `날짜 선택지는 최대 ${MAX_DATE_OPTIONS}개까지 만들 수 있습니다.`)
    }

    if (added.length) {
      await conn.query('INSERT INTO poll_options (poll_id, label, date_value, proposed_by) VALUES ?', [
        added.map((date) => [req.poll.id, date.label, date.value, req.member.id]),
      ])
    }
    const [options] = await conn.query('SELECT id FROM poll_options WHERE poll_id = ? AND date_value IN (?)', [
      req.poll.id,
      dates.map((date) => date.value),
    ])
    const ids = options.map((option) => option.id)
    // 기존 투표는 그대로 두고, 제안한 날짜에 내 투표를 더한다 (이미 투표했으면 무시)
    await conn.query('INSERT IGNORE INTO votes (poll_id, option_id, member_id) VALUES ?', [
      ids.map((optionId) => [req.poll.id, optionId, req.member.id]),
    ])
    return ids
  })

  res.status(201).json({ optionIds })
})

// 날짜 투표를 날짜로 저장: 달력에서 고른 날짜들로 내 투표를 통째로 교체한다 (빈 배열이면 투표 취소)
// 선택지에 없는 날짜는 내가 제안한 날짜로 추가되고, 아무도 투표하지 않게 된 내 제안 날짜는 지운다
async function voteDates(req, dates) {
  await withTransaction(async (conn) => {
    const [existing] = await conn.query('SELECT date_value AS date FROM poll_options WHERE poll_id = ? FOR UPDATE', [
      req.poll.id,
    ])
    const existingDates = new Set(existing.map((option) => option.date))
    const added = dates.filter((date) => !existingDates.has(date.value))
    if (existing.length + added.length > MAX_DATE_OPTIONS) {
      throw new HttpError(400, `날짜 선택지는 최대 ${MAX_DATE_OPTIONS}개까지 만들 수 있습니다.`)
    }
    if (added.length) {
      await conn.query('INSERT INTO poll_options (poll_id, label, date_value, proposed_by) VALUES ?', [
        added.map((date) => [req.poll.id, date.label, date.value, req.member.id]),
      ])
    }

    await conn.query('DELETE FROM votes WHERE poll_id = ? AND member_id = ?', [req.poll.id, req.member.id])
    if (dates.length) {
      await conn.query(
        'INSERT INTO votes (poll_id, option_id, member_id) SELECT poll_id, id, ? FROM poll_options WHERE poll_id = ? AND date_value IN (?)',
        [req.member.id, req.poll.id, dates.map((date) => date.value)],
      )
    }
    // 내가 제안했는데 이제 표가 하나도 없는 날짜는 캘린더에서도 사라지게 지운다
    await conn.query(
      `DELETE o FROM poll_options o LEFT JOIN votes v ON v.option_id = o.id
        WHERE o.poll_id = ? AND o.proposed_by = ? AND v.id IS NULL`,
      [req.poll.id, req.member.id],
    )
  })
}

// { optionIds } 로 보낸 날짜 투표를 날짜 목록으로 바꾼다
async function datesOfOptions(req) {
  const optionIds = Array.isArray(req.body?.optionIds) ? req.body.optionIds.map(Number) : null
  if (!optionIds || optionIds.some((id) => !Number.isInteger(id))) throw new HttpError(400, '선택지를 확인해 주세요.')
  if (!optionIds.length) return []
  const [options] = await db.query('SELECT date_value AS date FROM poll_options WHERE poll_id = ? AND id IN (?)', [
    req.poll.id,
    optionIds,
  ])
  if (options.length !== new Set(optionIds).size) throw new HttpError(400, '존재하지 않는 선택지가 포함되어 있습니다.')
  return readDates(options.map((option) => option.date))
}

// 투표 / 투표 변경: 내 투표를 전달한 선택지로 통째로 교체한다 (빈 배열이면 투표 취소)
// 날짜 투표는 { dates: ['YYYY-MM-DD', ...] } 로도 보낼 수 있다 (후보 기간 밖 날짜 포함)
router.put('/:type/votes', requireMember, async (req, res) => {
  assertEditable(req)
  // 날짜 투표에서 모임장이 고른 날짜는 후보 날짜 '수정'이다 (다른 참여자는 투표 + 후보 밖 날짜는 '제시')
  if (req.poll.type === 'DATE' && req.member.role === 'HOST') {
    const dates = req.body?.dates !== undefined ? readDates(req.body.dates) : await datesOfOptions(req)
    await withTransaction((conn) =>
      setHostCandidates(conn, { meetingId: req.meeting.id, pollId: req.poll.id, hostMemberId: req.member.id, dates }),
    )
    return res.json({ ok: true })
  }
  if (req.poll.type === 'DATE' && req.body?.dates !== undefined) {
    await voteDates(req, readDates(req.body.dates))
    return res.json({ ok: true })
  }

  const optionIds = Array.isArray(req.body?.optionIds) ? [...new Set(req.body.optionIds.map(Number))] : null
  if (!optionIds || optionIds.some((id) => !Number.isInteger(id))) throw new HttpError(400, '선택지를 확인해 주세요.')
  if (!req.poll.multiple && optionIds.length > 1) throw new HttpError(400, '하나만 선택할 수 있습니다.')

  await withTransaction(async (conn) => {
    if (optionIds.length) {
      const [[{ matched }]] = await conn.query(
        'SELECT COUNT(*) AS matched FROM poll_options WHERE poll_id = ? AND id IN (?)',
        [req.poll.id, optionIds],
      )
      if (matched !== optionIds.length) throw new HttpError(400, '존재하지 않는 선택지가 포함되어 있습니다.')
    }

    await conn.query('DELETE FROM votes WHERE poll_id = ? AND member_id = ?', [req.poll.id, req.member.id])
    if (optionIds.length) {
      await conn.query('INSERT INTO votes (poll_id, option_id, member_id) VALUES ?', [
        optionIds.map((optionId) => [req.poll.id, optionId, req.member.id]),
      ])
    }
  })

  res.json({ ok: true })
})

// 결과 확정 (모임장)
// - 날짜: 연속된 날짜 범위(startDate ~ endDate)로 확정 → 일정이 되고 장소 투표로 넘어간다
// - 장소: 선택지 하나(optionId)로 확정 → 일정 확정(DONE)
router.post('/:type/confirm', requireHost, async (req, res) => {
  // 장소는 마감 후 동점·무투표로 확정되지 않았으면 모임장이 나중에 정할 수 있다
  const isUnresolvedPlace = req.poll.type === 'PLACE' && req.poll.status === 'CLOSED' && !req.poll.confirmedOptionId
  if (!isUnresolvedPlace) assertEditable(req)

  await withTransaction(async (conn) => {
    if (req.poll.type === 'DATE') {
      const { startDate, endDate = startDate } = req.body ?? {}
      const [options] = await conn.query(
        'SELECT id, date_value AS date FROM poll_options WHERE poll_id = ? AND date_value IN (?)',
        [req.poll.id, [String(startDate), String(endDate)]],
      )
      const start = options.find((option) => option.date === startDate)
      if (!start || !options.some((option) => option.date === endDate)) {
        throw new HttpError(400, '확정할 시작일과 종료일을 투표 날짜 중에서 골라 주세요.')
      }
      const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1
      if (days < 1) throw new HttpError(400, '종료일은 시작일과 같거나 이후여야 합니다.')
      if (days > MAX_SCHEDULE_DAYS) throw new HttpError(400, `일정은 최대 ${MAX_SCHEDULE_DAYS}일까지 확정할 수 있습니다.`)

      // 장소 투표 마감: 모임장이 확정하면서 정할 수 있다 (없으면 시작일 D-2 23:59)
      const placeDeadline = req.body?.placeDeadline ? readPlaceDeadline(req.body.placeDeadline, endDate) : null
      await confirmSchedule(conn, {
        meetingId: req.meeting.id,
        pollId: req.poll.id,
        startOptionId: start.id,
        startDate,
        endDate,
        placeDeadline,
      })
      return
    }

    // 장소: 선택지(optionId) 또는 시·도 이름(region). 아무도 고르지 않은 시·도면 선택지로 추가한다 (장소 미정일 때)
    const [[poll]] = await conn.query('SELECT status, confirmed_option_id AS confirmedOptionId FROM polls WHERE id = ? FOR UPDATE', [
      req.poll.id,
    ])
    // 동시에 두 번 확정되는 것을 막는다
    if (poll.confirmedOptionId) throw new HttpError(409, '이미 확정된 투표입니다.')
    let optionId = Number(req.body?.optionId)
    if (req.body?.region !== undefined) {
      if (!isRegion(req.body.region)) throw new HttpError(400, '확정할 시·도를 골라 주세요.')
      await conn.query('INSERT IGNORE INTO poll_options (poll_id, label, sort_order) SELECT ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM poll_options WHERE poll_id = ? AND label = ?)', [
        req.poll.id,
        req.body.region,
        REGIONS.indexOf(req.body.region),
        req.poll.id,
        req.body.region,
      ])
      const [[found]] = await conn.query('SELECT id FROM poll_options WHERE poll_id = ? AND label = ?', [req.poll.id, req.body.region])
      optionId = found.id
    }
    const [[option]] = await conn.query('SELECT id FROM poll_options WHERE id = ? AND poll_id = ?', [optionId, req.poll.id])
    if (!option) throw new HttpError(400, '확정할 선택지를 골라 주세요.')
    await confirmPlace(conn, { meetingId: req.meeting.id, pollId: req.poll.id, optionId })
  })

  res.json({ ok: true })
})

export default router
