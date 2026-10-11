import { useState, type FormEvent } from 'react'
import { getErrorMessage } from '@src/api/httpClient'
import { useProposeDates } from '@src/api/hooks/usePoll'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

interface DateProposalFormProps {
  code: string
  onProposed: (optionIds: number[]) => void
}

// 다른 날짜 제안: 후보 기간 밖의 날짜(하루 또는 기간)를 선택지로 추가하고 내 투표로 찍는다
// 이미 있는 날짜는 기존 선택지에 같은 값으로 찍힌다
export function DateProposalForm({ code, onProposed }: DateProposalFormProps) {
  const propose = useProposeDates(code)
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState({ startDate: '', endDate: '' })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    propose.mutate(
      { startDate: range.startDate, endDate: range.endDate || range.startDate },
      {
        onSuccess: ({ optionIds }) => {
          onProposed(optionIds)
          window.alert(`제안한 날짜 ${optionIds.length}일을 투표에 추가하고 내 투표로 찍었어요.`)
          setRange({ startDate: '', endDate: '' })
          setOpen(false)
        },
      },
    )
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + 다른 날짜 제안하기
      </Button>
    )
  }

  return (
    <form className="proposal-form" onSubmit={handleSubmit}>
      <p className="field-label">다른 날짜 제안하기</p>
      <p className="text-sm">하루만 제안하려면 시작일만 고르세요. 이미 있는 날짜는 그 날짜에 투표돼요.</p>
      <div className="date-range">
        <TextField
          label="시작일"
          type="date"
          min={today()}
          required
          value={range.startDate}
          onChange={(event) => {
            const startDate = event.target.value
            setRange(({ endDate }) => ({ startDate, endDate: endDate && endDate < startDate ? startDate : endDate }))
          }}
        />
        <span className="date-range-sep">~</span>
        <TextField
          label="종료일 (선택)"
          type="date"
          min={range.startDate || today()}
          value={range.endDate}
          onChange={(event) => setRange({ ...range, endDate: event.target.value })}
        />
      </div>
      {propose.isError && <p className="error-text">{getErrorMessage(propose.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" disabled={propose.isPending}>
          {propose.isPending ? '제안하는 중…' : '제안하고 투표하기'}
        </Button>
      </div>
    </form>
  )
}
