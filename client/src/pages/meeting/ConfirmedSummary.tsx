import type { Meeting } from '@src/api/controllers/meetingController'
import { scheduleLength } from '@src/utils/schedule'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const parse = (value: string) => new Date(`${value}T00:00:00`)
const format = (date: Date) =>
  `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`

// 날짜가 확정되면 일정, 장소까지 확정되면 최종 일정
export function ConfirmedSummary({ meeting }: { meeting: Meeting }) {
  const { schedule, place, placeTied } = meeting.confirmed
  if (!schedule) return null
  // 장소까지 정해져야 최종 일정 (동점·무투표로 마감됐으면 장소 미정)
  const isDone = meeting.stage === 'DONE' && !!place
  const { startDate, endDate } = schedule

  return (
    <section className="card card-highlight">
      <h3>{isDone ? '🎉 최종 일정이 확정됐어요' : '🗓️ 날짜가 정해졌어요'}</h3>
      <p className="text-lg font-semibold text-[var(--text-h)]">
        {startDate === endDate ? format(parse(startDate)) : `${format(parse(startDate))} ~ ${format(parse(endDate))}`}
      </p>
      <p>{scheduleLength(startDate, endDate)}</p>
      {place ? (
        <p className="mt-2 font-medium text-[var(--text-h)]">
          📍 {place.label}
          {place.memo && <span className="ml-2 text-sm font-normal">{place.memo}</span>}
        </p>
      ) : placeTied.length ? (
        <p className="mt-2 font-medium text-[var(--text-h)]">📍 {placeTied.join(' · ')} (동점) · 모임장이 한 곳으로 정하면 확정돼요</p>
      ) : meeting.stage === 'DONE' ? (
        <p className="mt-2 font-medium text-[var(--text-h)]">📍 장소 미정</p>
      ) : (
        <p className="mt-2 text-sm">이제 장소 투표를 진행해요.</p>
      )}
    </section>
  )
}
