import classNames from 'classnames'
import { useState } from 'react'
import type { Schedule } from '@src/api/controllers/meetingController'
import type { Poll } from '@src/api/controllers/pollController'
import { todayKey } from '@src/utils/schedule'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD' 를 UTC 기준으로 다뤄 시간대 영향을 받지 않게 한다
const parseKey = (key: string) => new Date(`${key}T00:00:00Z`)
const toKey = (date: Date) => date.toISOString().slice(0, 10)

// 한 달의 일요일 시작 주 단위 날짜 목록 (앞쪽 빈칸은 null)
function buildMonth(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const blanks: null[] = Array.from({ length: first.getUTCDay() }, () => null)
  const days = Array.from({ length: daysInMonth }, (_, index) => toKey(new Date(Date.UTC(year, month, index + 1))))
  return [...blanks, ...days]
}

interface DateVotePickerProps {
  poll: Poll
  candidateStart: string
  // 모임장이 고른 날짜는 후보 날짜가 된다 (참여자가 후보 밖 날짜를 고르면 제시)
  isHost: boolean
  // 확정된 일정 (그 범위의 날짜를 확정 표시)
  schedule: Schedule | null
  selected: string[]
  canVote: boolean
  onToggle: (date: string) => void
}

// 날짜 투표: 달력에서 날짜를 직접 눌러 고른다 (여러 날 선택, 지난 날짜는 못 고른다)
// - 참여자: 참석 가능한 날짜에 투표. 후보 밖 날짜를 고르면 저장할 때 내가 제시한 날짜로 추가된다
// - 모임장: 고른 날짜가 곧 후보 날짜 (저장하면 후보 날짜가 수정된다)
export function DateVotePicker({
  poll,
  candidateStart,
  isHost,
  schedule,
  selected,
  canVote,
  onToggle,
}: DateVotePickerProps) {
  // 처음에는 확정 일정(없으면 후보 기간)이 있는 달을 보여준다
  const [view, setView] = useState(() => {
    const first = parseKey(schedule?.startDate ?? candidateStart)
    return { year: first.getUTCFullYear(), month: first.getUTCMonth() }
  })
  const optionByDate = new Map(poll.options.filter((option) => option.date).map((option) => [option.date, option]))
  const maxCount = Math.max(0, ...poll.options.map((option) => option.count))
  const today = todayKey()

  const moveMonth = (offset: number) =>
    setView(({ year, month }) => {
      const date = new Date(Date.UTC(year, month + offset, 1))
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
    })

  return (
    <div className="vote-picker">
      <div className="vote-picker-month">
        <div className="vote-picker-head">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="이전 달" onClick={() => moveMonth(-1)}>
            ‹
          </button>
          <p className="vote-picker-title">
            {view.year}년 {view.month + 1}월
          </p>
          <button type="button" className="btn btn-secondary btn-sm" aria-label="다음 달" onClick={() => moveMonth(1)}>
            ›
          </button>
        </div>
        <div className="vote-picker-grid">
          {WEEKDAYS.map((weekday, index) => (
            <span key={weekday} className={classNames('vote-picker-weekday', { sun: index === 0, sat: index === 6 })}>
              {weekday}
            </span>
          ))}
          {buildMonth(view.year, view.month).map((key, index) => {
            if (!key) return <span key={`blank-${index}`} />
            const option = optionByDate.get(key)
            const day = parseKey(key).getUTCDate()
            const isSelected = selected.includes(key)
            // 선택지가 없는 지난 날짜는 고를 수 없다
            if (!option && (key < today || !canVote)) {
              return (
                <span key={key} className="vote-picker-day outside">
                  {day}
                </span>
              )
            }
            const count = option?.count ?? 0
            // 후보 날짜: 모임장이 정한 날짜 (제시한 사람이 없는 선택지)
            const isCandidate = !!option && !option.proposedBy
            // 후보 밖이면서 참여자가 제시했거나, 참여자가 지금 새로 고르는 날짜
            const isProposal = !isCandidate && (isHost ? !!option?.proposedBy && !isSelected : !!option?.proposedBy || isSelected)
            const isConfirmed = !!schedule && key >= schedule.startDate && key <= schedule.endDate
            const label = option?.label ?? `${view.month + 1}/${day}`
            return (
              <button
                key={key}
                type="button"
                className={classNames('vote-picker-day', {
                  selected: isSelected,
                  confirmed: isConfirmed,
                  candidate: isCandidate,
                  proposed: isProposal,
                  free: !option && !isSelected,
                  top: poll.status === 'OPEN' && count > 0 && count === maxCount,
                })}
                disabled={!canVote}
                aria-pressed={isSelected}
                aria-label={`${label} ${count}명${option?.proposedBy ? `, ${option.proposedBy} 제안` : ''}${isSelected ? ', 선택함' : ''}`}
                onClick={() => onToggle(key)}
              >
                <span className="vote-picker-date">{day}</span>
                <span className="vote-picker-count">{count > 0 ? `${count}명` : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
