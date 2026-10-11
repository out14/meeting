import { useMemo, useState } from 'react'
import classNames from 'classnames'
import { Link } from 'react-router-dom'
import type { MeetingSummary } from '@src/api/controllers/meetingController'
import { Button } from '@src/components/Button'
import { STATUS_LABEL } from '@src/utils/stage'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. 시간대 영향을 받지 않게 UTC 기준으로 계산한다
const toKey = (date: Date) => date.toISOString().slice(0, 10)
const parseKey = (key: string) => new Date(`${key}T00:00:00Z`)
const addDays = (key: string, days: number) => {
  const date = parseKey(key)
  date.setUTCDate(date.getUTCDate() + days)
  return toKey(date)
}

const todayKey = () => {
  const now = new Date()
  return toKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

// 해당 월을 일요일 시작 주 단위로 채운 날짜 목록 (앞뒤 달 날짜 포함)
function buildMonthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const start = addDays(toKey(first), -first.getUTCDay())
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index))
}

// 표시 상태 (색 클래스): 일정 미정(후보 날짜 candidate / 제안 날짜 proposed) → 장소 미정(date) → 확정된 일정(confirmed)
type EventStatus = 'candidate' | 'proposed' | 'date' | 'confirmed'

interface CalendarEvent {
  meeting: MeetingSummary
  status: EventStatus
  // 표시 이름 (제안 날짜는 '모임명:닉네임's 제시')
  label: string
}

const daysBetween = (start: string, end: string) => (parseKey(end).getTime() - parseKey(start).getTime()) / 86_400_000 + 1

// 표시할 날짜
// - 장소 미정 / 확정된 일정: 확정된 시작일 ~ 종료일 (장소까지 정해졌으면 확정된 일정)
// - 날짜 투표 중: 모임장이 정한 후보 날짜 (떨어져 있을 수 있다)
function eventDates(meeting: MeetingSummary): { dates: string[]; status: EventStatus } {
  if (meeting.startDate && meeting.endDate) {
    const { startDate } = meeting
    const days = daysBetween(startDate, meeting.endDate)
    return {
      dates: Array.from({ length: days }, (_, offset) => addDays(startDate, offset)),
      status: meeting.place ? 'confirmed' : 'date',
    }
  }
  return { dates: meeting.candidateDates, status: 'candidate' }
}

const STATUS_ORDER: Record<EventStatus, number> = { confirmed: 0, date: 1, candidate: 2, proposed: 3 }
// 이름은 왼쪽 상태별 목록과 같게 (일정 미정 / 장소 미정 / 확정된 일정)
const STATUS_TITLE: Record<EventStatus, string> = {
  confirmed: STATUS_LABEL.confirmed,
  date: STATUS_LABEL.unplaced,
  candidate: `${STATUS_LABEL.unscheduled} · 후보 날짜`,
  proposed: `${STATUS_LABEL.unscheduled} · 참여자 제안 날짜`,
}

function groupByDate(meetings: MeetingSummary[]) {
  const map = new Map<string, CalendarEvent[]>()
  const add = (key: string, event: CalendarEvent) => map.set(key, [...(map.get(key) ?? []), event])
  for (const meeting of meetings) {
    const { dates, status } = eventDates(meeting)
    for (const date of dates) add(date, { meeting, status, label: meeting.title })
    // 날짜 투표 중이면 참여자가 제안한 날짜도 표시한다
    if (status === 'candidate') {
      for (const { date, proposedBy } of meeting.proposals) {
        add(date, { meeting, status: 'proposed', label: `${meeting.title}:${proposedBy}'s 제시` })
      }
    }
  }
  // 한 칸 안에서는 확정된 일정 → 장소 미정 → 후보 → 제안 순으로
  for (const events of map.values()) events.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  return map
}

export function MeetingCalendar({ meetings }: { meetings: MeetingSummary[] }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const days = useMemo(() => buildMonthDays(cursor.year, cursor.month), [cursor])
  const byDate = useMemo(() => groupByDate(meetings), [meetings])
  const today = todayKey()

  const moveMonth = (diff: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + diff, 1))
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() })
  }

  return (
    <section className="card">
      <div className="calendar-head">
        <h2 className="m-0">
          {cursor.year}년 {cursor.month + 1}월
        </h2>
        <div className="flex gap-1">
          <Button variant="secondary" aria-label="이전 달" onClick={() => moveMonth(-1)}>
            ‹
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const now = new Date()
              setCursor({ year: now.getFullYear(), month: now.getMonth() })
            }}
          >
            오늘
          </Button>
          <Button variant="secondary" aria-label="다음 달" onClick={() => moveMonth(1)}>
            ›
          </Button>
        </div>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((weekday, index) => (
          <div key={weekday} className={classNames('calendar-weekday', { sun: index === 0, sat: index === 6 })}>
            {weekday}
          </div>
        ))}
        {days.map((key) => {
          const date = parseKey(key)
          const items = byDate.get(key) ?? []
          return (
            <div
              key={key}
              className={classNames('calendar-day', {
                outside: date.getUTCMonth() !== cursor.month,
                today: key === today,
              })}
            >
              <span className="calendar-date">{date.getUTCDate()}</span>
              {items.map(({ meeting, status, label }) => (
                <Link
                  key={`${meeting.code}-${label}`}
                  to={`/m/${meeting.code}`}
                  className={classNames('calendar-event', status)}
                  title={`${label} (${STATUS_TITLE[status]}${meeting.place ? ` · 📍 ${meeting.place}` : ''})`}
                >
                  {label}
                </Link>
              ))}
            </div>
          )
        })}
      </div>
      {/* 범례: 왼쪽 상태별 목록과 같은 순서·이름·색 */}
      <p className="calendar-legends mt-3 text-sm">
        <span>
          <span className="calendar-legend candidate" /> {STATUS_LABEL.unscheduled} (후보 날짜)
        </span>
        <span>
          <span className="calendar-legend proposed" /> 제안 날짜
        </span>
        <span>
          <span className="calendar-legend date" /> {STATUS_LABEL.unplaced}
        </span>
        <span>
          <span className="calendar-legend confirmed" /> {STATUS_LABEL.confirmed}
        </span>
      </p>
    </section>
  )
}
