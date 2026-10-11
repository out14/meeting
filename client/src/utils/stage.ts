import type { MeetingStage } from '@src/api/controllers/meetingController'

// 모임 상태: 화면 어디서나(홈 목록·캘린더·관리자·마이페이지) 같은 이름과 같은 색을 쓴다
// - 일정 미정: 날짜 투표 중
// - 장소 미정: 날짜는 확정, 장소는 투표 중이거나 동점·무투표로 정해지지 않음
// - 확정된 일정: 날짜와 장소 모두 확정
export type MeetingStatus = 'unscheduled' | 'unplaced' | 'confirmed'

export const MEETING_STATUSES: MeetingStatus[] = ['unscheduled', 'unplaced', 'confirmed']

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  unscheduled: '일정 미정',
  unplaced: '장소 미정',
  confirmed: '확정된 일정',
}

// 상태 색 (캘린더 막대·범례와 같은 클래스: 모래색 / 하늘색 점선 / 버터색)
export const STATUS_COLOR: Record<MeetingStatus, string> = {
  unscheduled: 'candidate',
  unplaced: 'date',
  confirmed: 'confirmed',
}

export function meetingStatus({ stage, place }: { stage: MeetingStage; place: string | null }): MeetingStatus {
  if (stage === 'VOTE') return 'unscheduled'
  return place ? 'confirmed' : 'unplaced'
}

// 'YYYY-MM-DD' → '10/8'
export const formatDay = (value: string) => {
  const [, month, day] = value.split('-').map(Number)
  return `${month}/${day}`
}

// 날짜 목록 표시: 이어진 날짜는 '11/1 ~ 11/3', 떨어진 날짜는 쉼표로 ('11/1 ~ 11/2, 11/14')
export function formatDateList(dates: string[]) {
  const sorted = [...dates].sort()
  const next = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  const ranges: [string, string][] = []
  for (const date of sorted) {
    const last = ranges.at(-1)
    if (last && next(last[1]) === date) last[1] = date
    else ranges.push([date, date])
  }
  return ranges.map(([start, end]) => (start === end ? formatDay(start) : `${formatDay(start)} ~ ${formatDay(end)}`)).join(', ')
}

// 장소 표시: 확정 장소 / 동점 지역들 / 장소 미정 (일정 확정 후) / 아직 투표 중이면 null
export function placeText({ place, placeTied, stage }: { place: string | null; placeTied: string[]; stage: string }) {
  if (place) return place
  if (placeTied.length) return `${placeTied.join(' · ')} (동점)`
  return stage === 'DONE' ? '장소 미정' : null
}
