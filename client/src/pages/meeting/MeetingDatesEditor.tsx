import { useState, type FormEvent } from 'react'
import type { Meeting } from '@src/api/controllers/meetingController'
import { useUpdateMeetingDates } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'
import { toLocalInputValue } from '@src/utils/deadline'

const MAX_CANDIDATE_DAYS = 31
const MAX_SCHEDULE_DAYS = 14
const daysBetween = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1

// 모임장: 날짜 수정. 날짜 투표 중이면 후보 기간(+ 투표 마감), 확정 후면 확정 일정을 고친다
// 고치면 메인 캘린더에도 바로 반영된다
export function MeetingDatesEditor({ meeting }: { meeting: Meeting }) {
  const isVoting = meeting.stage === 'VOTE'
  const schedule = meeting.confirmed.schedule
  const initial = {
    startDate: isVoting ? meeting.candidateStart : (schedule?.startDate ?? ''),
    endDate: isVoting ? meeting.candidateEnd : (schedule?.endDate ?? ''),
    voteDeadline: toLocalInputValue(new Date(meeting.voteDeadline)),
  }
  const updateDates = useUpdateMeetingDates(meeting.code)
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState(initial)

  const maxDays = isVoting ? MAX_CANDIDATE_DAYS : MAX_SCHEDULE_DAYS
  const days = form.startDate && form.endDate ? daysBetween(form.startDate, form.endDate) : 0
  const rangeError =
    form.startDate && form.endDate && days < 1
      ? '종료일은 시작일과 같거나 이후여야 해요.'
      : days > maxDays
        ? `${isVoting ? '후보 기간' : '일정'}은 최대 ${maxDays}일까지 정할 수 있어요.`
        : isVoting && form.voteDeadline && new Date(form.voteDeadline) >= new Date(`${form.startDate}T00:00`)
          ? '투표 마감은 후보 시작일 전으로 입력해 주세요.'
          : null

  const open = () => {
    setForm(initial)
    updateDates.reset()
    setIsOpen(true)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (rangeError) return
    const message = isVoting
      ? '후보 기간을 바꿀까요?\n빠지는 후보 날짜에 있던 투표는 사라지고, 새로 들어오는 날짜에는 모임장 표가 자동으로 들어가요.'
      : '확정 일정을 바꿀까요? 캘린더에도 바로 반영돼요.'
    if (!window.confirm(message)) return
    updateDates.mutate(
      {
        startDate: form.startDate,
        endDate: form.endDate,
        ...(isVoting && { voteDeadline: new Date(form.voteDeadline).toISOString() }),
      },
      {
        onSuccess: ({ placeDeadlineChanged }) => {
          setIsOpen(false)
          window.alert(
            isVoting
              ? '후보 기간을 수정했어요.'
              : `일정을 수정했어요.${placeDeadlineChanged ? '\n장소 투표 마감이 새 일정보다 늦어서 시작일 2일 전 23:59로 당겼어요.' : ''}`,
          )
        },
      },
    )
  }

  if (!isVoting && !schedule) return null
  if (!isOpen) {
    return (
      <div className="flex justify-end">
        <Button className="btn-sm" variant="secondary" onClick={open}>
          {isVoting ? '후보 기간 수정' : '일정 수정'}
        </Button>
      </div>
    )
  }

  return (
    <form className="proposal-form" onSubmit={handleSubmit}>
      <p className="field-label">{isVoting ? '후보 기간 수정 (모임장)' : '확정 일정 수정 (모임장)'}</p>
      <p className="text-sm">
        {isVoting
          ? '후보 기간을 옮기면 빠지는 날짜의 투표는 사라져요. 참여자가 제안한 날짜는 그대로 남아요.'
          : '투표하지 않은 날짜로도 옮길 수 있어요. (최대 14일)'}
      </p>
      <div className="date-range">
        <TextField
          label="시작일"
          type="date"
          required
          value={form.startDate}
          onChange={(event) => {
            const startDate = event.target.value
            setForm((current) => ({ ...current, startDate, endDate: current.endDate < startDate ? startDate : current.endDate }))
          }}
        />
        <span className="date-range-sep">~</span>
        <TextField
          label="종료일"
          type="date"
          required
          min={form.startDate}
          value={form.endDate}
          onChange={(event) => setForm({ ...form, endDate: event.target.value })}
        />
      </div>
      {isVoting && (
        <TextField
          label="투표 마감 일시"
          type="datetime-local"
          required
          max={form.startDate ? `${form.startDate}T00:00` : undefined}
          value={form.voteDeadline}
          onChange={(event) => setForm({ ...form, voteDeadline: event.target.value })}
        />
      )}
      {(rangeError || updateDates.isError) && (
        <p className="error-text">{rangeError ?? getErrorMessage(updateDates.error)}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" className="btn-sm" variant="secondary" onClick={() => setIsOpen(false)}>
          취소
        </Button>
        <Button type="submit" className="btn-sm" disabled={!!rangeError || updateDates.isPending}>
          {updateDates.isPending ? '저장하는 중…' : '저장'}
        </Button>
      </div>
    </form>
  )
}
