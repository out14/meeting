import classNames from 'classnames'
import type { Schedule } from '@src/api/controllers/meetingController'
import type { Poll } from '@src/api/controllers/pollController'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD' 를 UTC 기준으로 다뤄 시간대 영향을 받지 않게 한다
const parseKey = (key: string) => new Date(`${key}T00:00:00Z`)
const toKey = (date: Date) => date.toISOString().slice(0, 10)

// 선택지 날짜가 있는 달마다 일요일 시작 주 단위 날짜 목록 (후보 기간 + 제안한 날짜)
function buildMonths(dates: string[]) {
  const monthKeys = [...new Set(dates.map((date) => date.slice(0, 7)))].sort()
  return monthKeys.map((monthKey) => {
    const first = parseKey(`${monthKey}-01`)
    const year = first.getUTCFullYear()
    const month = first.getUTCMonth()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const blanks: null[] = Array.from({ length: first.getUTCDay() }, () => null)
    const days = Array.from({ length: daysInMonth }, (_, index) => toKey(new Date(Date.UTC(year, month, index + 1))))
    return { year, month, days: [...blanks, ...days] }
  })
}

interface DateVotePickerProps {
  poll: Poll
  // 확정된 일정 (그 범위의 날짜를 확정 표시)
  schedule: Schedule | null
  selected: number[]
  canVote: boolean
  onToggle: (optionId: number) => void
}

// 날짜 투표: 달력에서 참석 가능한 날짜를 직접 눌러 고른다 (여러 날 선택)
// 고를 수 있는 날짜 = 후보 기간 + 참여자가 제안한 날짜
export function DateVotePicker({ poll, schedule, selected, canVote, onToggle }: DateVotePickerProps) {
  const optionByDate = new Map(poll.options.filter((option) => option.date).map((option) => [option.date, option]))
  const maxCount = Math.max(0, ...poll.options.map((option) => option.count))

  return (
    <div className="vote-picker">
      {buildMonths([...optionByDate.keys()] as string[]).map(({ year, month, days }) => (
        <div key={`${year}-${month}`} className="vote-picker-month">
          <p className="vote-picker-title">
            {year}년 {month + 1}월
          </p>
          <div className="vote-picker-grid">
            {WEEKDAYS.map((weekday, index) => (
              <span key={weekday} className={classNames('vote-picker-weekday', { sun: index === 0, sat: index === 6 })}>
                {weekday}
              </span>
            ))}
            {days.map((key, index) => {
              if (!key) return <span key={`blank-${index}`} />
              const option = optionByDate.get(key)
              const day = parseKey(key).getUTCDate()
              // 선택지가 아닌 날짜는 고를 수 없다 (아래 '다른 날짜 제안하기'로 추가)
              if (!option) {
                return (
                  <span key={key} className="vote-picker-day outside">
                    {day}
                  </span>
                )
              }
              const isSelected = selected.includes(option.id)
              const isConfirmed = !!schedule && key >= schedule.startDate && key <= schedule.endDate
              return (
                <button
                  key={key}
                  type="button"
                  className={classNames('vote-picker-day', {
                    selected: isSelected,
                    confirmed: isConfirmed,
                    proposed: !!option.proposedBy,
                    top: poll.status === 'OPEN' && option.count > 0 && option.count === maxCount,
                  })}
                  disabled={!canVote}
                  aria-pressed={isSelected}
                  aria-label={`${option.label} ${option.count}명${option.proposedBy ? `, ${option.proposedBy} 제안` : ''}${isSelected ? ', 선택함' : ''}`}
                  onClick={() => onToggle(option.id)}
                >
                  <span className="vote-picker-date">{day}</span>
                  <span className="vote-picker-count">{option.count > 0 ? `${option.count}명` : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
