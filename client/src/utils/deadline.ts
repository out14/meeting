const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// '10/8 (목) 23:59' (사용자 시간대 기준)
export function formatDeadline(iso: string) {
  const date = new Date(iso)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAYS[date.getDay()]}) ${time}`
}

// 남은 시간: '2일 3시간 남음' / '45분 남음'
export function formatRemaining(ms: number) {
  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}일 ${hours}시간 남음`
  if (hours > 0) return `${hours}시간 ${minutes % 60}분 남음`
  return `${minutes}분 남음`
}

// Date → datetime-local 입력값 'YYYY-MM-DDTHH:mm' (사용자 시간대 기준)
export function toLocalInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// 장소 투표 기본 마감: 확정 일정 시작일 D-2 23:59 → 너무 가까우면 D-1 23:59 → 그래도 24시간이 안 남으면 지금부터 24시간 뒤
// (서버의 defaultPlaceDeadline 과 같은 규칙, 사용자 시간대 기준)
export function defaultPlaceDeadline(startDate: string, now = Date.now()) {
  const earliest = now + 24 * 3_600_000
  for (const days of [2, 1]) {
    const date = new Date(`${startDate}T23:59`)
    date.setDate(date.getDate() - days)
    if (date.getTime() >= earliest) return date
  }
  return new Date(earliest)
}
