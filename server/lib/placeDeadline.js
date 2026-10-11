// 장소 투표 마감 계산 (DB 를 쓰지 않아 마이그레이션에서도 쓸 수 있다)
// 서버가 자동으로 정하는 마감 시각은 서비스 기준 시간대(기본 한국 +09:00)의 23:59 로 맞춘다
const APP_TZ_OFFSET = process.env.APP_TZ_OFFSET ?? '+09:00'
// 기본 마감: 확정 일정 시작일 D-2 23:59
export const DEFAULT_PLACE_DAYS_BEFORE = 2
// 자동으로 정할 때 최소한 남겨 둘 투표 시간
const MIN_PLACE_VOTE_HOURS = 24

const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' 의 그날 23:59 / 0시 (서비스 시간대)
export const endOfDay = (value) => new Date(`${value}T23:59:00${APP_TZ_OFFSET}`)
export const startOfDay = (value) => new Date(`${value}T00:00:00${APP_TZ_OFFSET}`)

// 확정 일정 시작일 기준 기본 마감: D-2 23:59 → 너무 가까우면 D-1 23:59 → 그래도 24시간이 안 남으면 지금부터 24시간 뒤
export function defaultPlaceDeadline(scheduleStart, now = Date.now()) {
  const earliest = now + MIN_PLACE_VOTE_HOURS * 3_600_000
  for (let days = DEFAULT_PLACE_DAYS_BEFORE; days >= 1; days -= 1) {
    const deadline = endOfDay(addDays(scheduleStart, -days))
    if (deadline.getTime() >= earliest) return deadline
  }
  return new Date(earliest)
}
