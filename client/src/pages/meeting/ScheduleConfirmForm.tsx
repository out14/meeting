import { useState } from 'react'
import type { Poll } from '@src/api/controllers/pollController'
import { useConfirmPoll } from '@src/api/hooks/usePoll'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { scheduleLength } from '@src/utils/schedule'

const MAX_SCHEDULE_DAYS = 14
const daysBetween = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1

// 모임장: 투표 결과를 보고 연속된 날짜(시작일 ~ 종료일)로 일정을 확정한다 → 장소 투표로 넘어간다
export function ScheduleConfirmForm({ code, poll }: { code: string; poll: Poll }) {
  const confirmPoll = useConfirmPoll(code, 'date')
  const dates = poll.options.flatMap((option) => (option.date ? [{ date: option.date, label: option.label, count: option.count }] : []))
  // 기본값: 가장 많이 받은 날 (동점이면 이른 날)
  const topDate = [...dates].sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0]?.date ?? ''
  const [range, setRange] = useState({ startDate: topDate, endDate: topDate })

  const endOptions = dates.filter(
    ({ date }) => date >= range.startDate && daysBetween(range.startDate, date) <= MAX_SCHEDULE_DAYS,
  )
  const labelOf = (date: string) => dates.find((item) => item.date === date)?.label ?? date

  const handleConfirm = async () => {
    const { startDate, endDate } = range
    const text = startDate === endDate ? labelOf(startDate) : `${labelOf(startDate)} ~ ${labelOf(endDate)}`
    if (!window.confirm(`${text} (${scheduleLength(startDate, endDate)})으로 확정할까요?\n확정하면 날짜 투표가 끝나고 장소 투표로 넘어가요.`)) return
    // 확정되면 이 폼이 사라지므로(언마운트) mutate 콜백 대신 promise 로 알린다
    try {
      await confirmPoll.mutateAsync(range)
      window.alert('일정을 확정했어요. 이제 장소 투표를 진행해요.')
    } catch {
      // 에러는 confirmPoll.error 로 표시된다
    }
  }

  if (!dates.length) return null

  return (
    <div className="proposal-form">
      <p className="field-label">일정 확정하기 (모임장)</p>
      <p className="text-sm">결과를 보고 연속된 날짜로 확정해요. 하루만 만나면 시작일과 종료일을 같게 고르세요.</p>
      <div className="date-range">
        <label className="field">
          <span className="field-label">시작일</span>
          <select
            className="field-input"
            value={range.startDate}
            onChange={(event) => {
              const startDate = event.target.value
              setRange(({ endDate }) => ({
                startDate,
                endDate: endDate < startDate || daysBetween(startDate, endDate) > MAX_SCHEDULE_DAYS ? startDate : endDate,
              }))
            }}
          >
            {dates.map(({ date, label, count }) => (
              <option key={date} value={date}>
                {label} · {count}명
              </option>
            ))}
          </select>
        </label>
        <span className="date-range-sep">~</span>
        <label className="field">
          <span className="field-label">종료일</span>
          <select
            className="field-input"
            value={range.endDate}
            onChange={(event) => setRange({ ...range, endDate: event.target.value })}
          >
            {endOptions.map(({ date, label, count }) => (
              <option key={date} value={date}>
                {label} · {count}명
              </option>
            ))}
          </select>
        </label>
      </div>
      {confirmPoll.isError && <p className="error-text">{getErrorMessage(confirmPoll.error)}</p>}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm">{scheduleLength(range.startDate, range.endDate)}</span>
        <Button disabled={confirmPoll.isPending} onClick={handleConfirm}>
          {confirmPoll.isPending ? '확정하는 중…' : '이 일정으로 확정'}
        </Button>
      </div>
    </div>
  )
}
