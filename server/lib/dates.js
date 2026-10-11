import { HttpError } from './httpError.js'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
export const MAX_CANDIDATE_DAYS = 31

// 'YYYY-MM-DD' 문자열만 받는다. 시간대 영향을 받지 않게 UTC 로 다룬다
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return date.toISOString().slice(0, 10) === value ? date : null
}

const dateLabel = (date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()} (${WEEKDAYS[date.getUTCDay()]})`

// 날짜 범위 검증 → 범위 안의 모든 날짜 [{ value, label }]
// field: 에러 메시지에 쓰는 이름 (후보 기간 / 제안 기간)
export function readDateRange(startValue, endValue, field = '후보 기간') {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (!start || !end) throw new HttpError(400, `${field}의 시작일과 종료일을 선택해 주세요.`)
  if (start > end) throw new HttpError(400, '종료일은 시작일과 같거나 이후여야 합니다.')

  const days = (end - start) / 86_400_000 + 1
  if (days > MAX_CANDIDATE_DAYS) throw new HttpError(400, `${field}은 최대 ${MAX_CANDIDATE_DAYS}일까지 선택할 수 있습니다.`)

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return { value: date.toISOString().slice(0, 10), label: dateLabel(date) }
  })
}

export const readCandidateRange = (startValue, endValue) => readDateRange(startValue, endValue, '후보 기간')

// 날짜 목록 검증 (중복 제거) → [{ value, label }]
export function readDates(values) {
  if (!Array.isArray(values)) throw new HttpError(400, '날짜를 확인해 주세요.')
  return [...new Set(values)].map((value) => {
    const date = parseDate(value)
    if (!date) throw new HttpError(400, '날짜를 확인해 주세요.')
    return { value, label: dateLabel(date) }
  })
}
