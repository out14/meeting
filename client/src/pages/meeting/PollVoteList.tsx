import { useState } from 'react'
import classNames from 'classnames'
import { useNavigate } from 'react-router-dom'
import type { Schedule } from '@src/api/controllers/meetingController'
import type { Poll, PollOption, PollType } from '@src/api/controllers/pollController'
import { getErrorMessage } from '@src/api/httpClient'
import { useConfirmPoll, useVote } from '@src/api/hooks/usePoll'
import { Button } from '@src/components/Button'
import { DateProposalForm } from '@src/pages/meeting/DateProposalForm'
import { DateVotePicker } from '@src/pages/meeting/DateVotePicker'
import { ScheduleConfirmForm } from '@src/pages/meeting/ScheduleConfirmForm'

interface PollVoteListProps {
  code: string
  type: PollType
  poll: Poll
  canVote: boolean
  isHost: boolean
  // 날짜 투표: 달력에서 날짜를 직접 골라 투표하고, 다른 날짜를 제안할 수 있다
  calendar?: boolean
  // 날짜 투표가 확정된 일정 (달력·결과 목록에 확정 표시)
  schedule?: Schedule | null
  emptyText?: string
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id))

// 날짜/기간 투표 공용: 선택 → 저장, 결과 막대, 모임장 확정
// 날짜 투표는 달력에서 고르고, 결과 목록에는 표를 받은 날짜만 보여준다
export function PollVoteList({
  code,
  type,
  poll,
  canVote,
  isHost,
  calendar = false,
  schedule = null,
  emptyText = '아직 아무도 투표하지 않았어요.',
}: PollVoteListProps) {
  const navigate = useNavigate()
  const vote = useVote(code, type)
  const confirmPoll = useConfirmPoll(code, type)
  // 사용자가 손대기 전에는 서버에 저장된 내 투표를 그대로 보여준다
  const [draft, setDraft] = useState<number[] | null>(null)
  const selected = draft ?? poll.myOptionIds
  const isDirty = draft !== null && !sameIds(draft, poll.myOptionIds)
  const maxCount = Math.max(0, ...poll.options.map((option) => option.count))
  // 날짜 투표는 확정된 일정 안의 날짜, 장소 투표는 확정된 선택지가 '확정'
  const isConfirmedOption = (option: PollOption) =>
    schedule && option.date
      ? option.date >= schedule.startDate && option.date <= schedule.endDate
      : option.id === poll.confirmedOptionId
  const listOptions = calendar
    ? poll.options.filter((option) => option.count > 0 || isConfirmedOption(option))
    : poll.options

  const toggle = (optionId: number) => {
    if (!poll.multiple) return setDraft([optionId])
    setDraft(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId])
  }

  // 저장하면 알림 후 캘린더(메인)로 이동한다
  const handleSave = () => {
    const isUpdate = poll.myOptionIds.length > 0
    vote.mutate(selected, {
      onSuccess: () => {
        setDraft(null)
        window.alert(isUpdate ? '투표를 수정했어요.' : '투표했어요.')
        navigate('/')
      },
    })
  }

  const handleConfirm = (option: PollOption) => {
    if (!window.confirm(`'${option.label}'(으)로 확정할까요? 확정 후에는 투표를 바꿀 수 없어요.`)) return
    confirmPoll.mutate({ optionId: option.id })
  }

  const error = vote.error ?? confirmPoll.error

  // 날짜 투표는 달력 바로 아래, 장소 투표는 선택지 목록 아래에 둔다
  const saveBar = canVote && poll.options.length > 0 && (
    <div className="flex items-center justify-end gap-2">
      {calendar && <span className="mr-auto whitespace-nowrap text-sm">{selected.length}일 선택함</span>}
      {isDirty && <span className="text-sm">저장하지 않은 변경 사항이 있어요</span>}
      <Button disabled={!isDirty || vote.isPending} onClick={handleSave}>
        {poll.myOptionIds.length ? '투표 수정' : '투표하기'}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {calendar && (
        <DateVotePicker poll={poll} schedule={schedule} selected={selected} canVote={canVote} onToggle={toggle} />
      )}

      {calendar && saveBar}
      {calendar && canVote && (
        <DateProposalForm
          code={code}
          // 제안한 날짜는 서버에서 내 투표로 찍힌다. 저장 전 선택 중이었다면 그 선택에도 더해 준다
          onProposed={(optionIds) =>
            setDraft((current) => (current ? [...new Set([...current, ...optionIds])] : current))
          }
        />
      )}

      {calendar && canVote && isHost && <ScheduleConfirmForm code={code} poll={poll} />}

      {calendar && <p className="field-label mt-2">투표 결과</p>}
      {listOptions.length === 0 && <p className="empty">{emptyText}</p>}
      <ul className="flex flex-col gap-2">
        {listOptions.map((option) => {
          const isConfirmed = isConfirmedOption(option)
          return (
            <li
              key={option.id}
              className={classNames('poll-option', {
                top: poll.status === 'OPEN' && option.count > 0 && option.count === maxCount,
                confirmed: isConfirmed,
              })}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                {canVote && !calendar && (
                  <input
                    type={poll.multiple ? 'checkbox' : 'radio'}
                    name={`poll-${poll.id}`}
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                )}
                <span className="flex-1">
                  <span className="font-medium text-[var(--text-h)]">{option.label}</span>
                  {isConfirmed && <span className="badge ml-2">확정</span>}
                  {option.memo && <span className="block text-sm">{option.memo}</span>}
                  <span className="poll-bar">
                    <span style={{ width: `${(option.count / Math.max(poll.voterCount, 1)) * 100}%` }} />
                  </span>
                  <span className="text-sm">
                    {option.count}명{option.voters.length > 0 && ` · ${option.voters.map((v) => v.nickname).join(', ')}`}
                    {option.proposedBy && <span className="proposed-tag">{option.proposedBy} 제안</span>}
                  </span>
                </span>
              </label>
              {canVote && isHost && !calendar && (
                <Button variant="secondary" disabled={confirmPoll.isPending} onClick={() => handleConfirm(option)}>
                  확정
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {error && <p className="error-text">{getErrorMessage(error)}</p>}
      {!calendar && saveBar}
    </div>
  )
}
