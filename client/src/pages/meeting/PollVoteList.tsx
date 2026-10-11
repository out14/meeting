import { useState } from 'react'
import classNames from 'classnames'
import { useNavigate } from 'react-router-dom'
import type { Schedule } from '@src/api/controllers/meetingController'
import type { Poll, PollOption, PollType } from '@src/api/controllers/pollController'
import { getErrorMessage } from '@src/api/httpClient'
import { useConfirmPoll, useVote, useVoteDates } from '@src/api/hooks/usePoll'
import { Button } from '@src/components/Button'
import { DateVotePicker } from '@src/pages/meeting/DateVotePicker'
import { ScheduleConfirmForm } from '@src/pages/meeting/ScheduleConfirmForm'
import { formatDeadline } from '@src/utils/deadline'
import { formatDateList } from '@src/utils/stage'

interface PollVoteListProps {
  code: string
  type: PollType
  poll: Poll
  canVote: boolean
  isHost: boolean
  // 날짜 투표: 달력에서 날짜를 직접 골라 투표한다 (후보 기간 밖 날짜는 제안 날짜로 추가)
  calendar?: boolean
  candidateStart?: string
  // 날짜 투표 마감 (모임장이 후보 날짜를 고칠 때 마감 이후 날짜인지 확인)
  voteDeadline?: string
  // 날짜 투표가 확정된 일정 (달력·결과 목록에 확정 표시)
  schedule?: Schedule | null
  emptyText?: string
}

const sameItems = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item) => b.includes(item))

// 날짜/기간 투표 공용: 선택 → 저장, 결과 막대, 모임장 확정
// 날짜 투표는 달력에서 고르고, 결과 목록에는 표를 받은 날짜만 보여준다
export function PollVoteList({
  code,
  type,
  poll,
  canVote,
  isHost,
  calendar = false,
  candidateStart = '',
  voteDeadline = '',
  schedule = null,
  emptyText = '아직 아무도 투표하지 않았어요.',
}: PollVoteListProps) {
  const navigate = useNavigate()
  const vote = useVote(code, type)
  const voteDates = useVoteDates(code)
  const confirmPoll = useConfirmPoll(code, type)
  // 사용자가 손대기 전에는 서버에 저장된 내 투표를 그대로 보여준다 (날짜 투표는 날짜, 그 외는 선택지 id)
  const [draft, setDraft] = useState<number[] | null>(null)
  const [dateDraft, setDateDraft] = useState<string[] | null>(null)
  const selected = draft ?? poll.myOptionIds
  const myDates = poll.options
    .filter((option) => option.date && poll.myOptionIds.includes(option.id))
    .map((option) => option.date as string)
  const selectedDates = dateDraft ?? myDates
  const isDirty = calendar
    ? dateDraft !== null && !sameItems(dateDraft, myDates)
    : draft !== null && !sameItems(draft, poll.myOptionIds)
  const hasVoted = poll.myOptionIds.length > 0
  const isSaving = vote.isPending || voteDates.isPending
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
  const toggleDate = (date: string) =>
    setDateDraft(selectedDates.includes(date) ? selectedDates.filter((d) => d !== date) : [...selectedDates, date])

  // 저장하면 알림 후 캘린더(메인)로 이동한다
  // 모임장의 날짜 선택 = 후보 날짜 수정. 빠지는 후보 날짜에 다른 참여자 표가 있으면 알려 준다
  const confirmHostDates = (dates: string[]) => {
    if (!dates.length) {
      window.alert('후보 날짜를 하나 이상 골라 주세요.')
      return false
    }
    if (voteDeadline && new Date(`${dates[0]}T00:00`) <= new Date(voteDeadline)) {
      window.alert(
        `투표 마감(${formatDeadline(voteDeadline)}) 이후의 날짜만 후보로 정할 수 있어요.\n위의 '후보 기간 수정'에서 마감을 먼저 바꿔 주세요.`,
      )
      return false
    }
    const removed = poll.options.filter((option) => option.date && !option.proposedBy && !dates.includes(option.date))
    const othersVotes = removed.reduce(
      (sum, option) => sum + option.count - (poll.myOptionIds.includes(option.id) ? 1 : 0),
      0,
    )
    const warning = othersVotes
      ? `\n빠지는 날짜(${formatDateList(removed.map((option) => option.date as string))})에 있던 다른 참여자의 표 ${othersVotes}개도 사라져요.`
      : ''
    return window.confirm(`후보 날짜를 ${formatDateList(dates)}(으)로 수정할까요?${warning}`)
  }

  const handleSave = () => {
    const isHostDates = calendar && isHost
    const onSuccess = () => {
      setDraft(null)
      setDateDraft(null)
      window.alert(isHostDates ? '후보 날짜를 수정했어요.' : hasVoted ? '투표를 수정했어요.' : '투표했어요.')
      navigate('/')
    }
    if (!calendar) return vote.mutate(selected, { onSuccess })
    const dates = [...selectedDates].sort()
    if (isHostDates && !confirmHostDates(dates)) return
    voteDates.mutate(dates, { onSuccess })
  }

  const handleConfirm = (option: PollOption) => {
    if (!window.confirm(`'${option.label}'(으)로 확정할까요? 확정 후에는 투표를 바꿀 수 없어요.`)) return
    confirmPoll.mutate({ optionId: option.id })
  }

  const error = vote.error ?? voteDates.error ?? confirmPoll.error

  // 날짜 투표는 달력 바로 아래, 장소 투표는 선택지 목록 아래에 둔다
  const saveBar = canVote && (calendar || poll.options.length > 0) && (
    <div className="flex items-center justify-end gap-2">
      {calendar && (
        <span className="mr-auto whitespace-nowrap text-sm">
          {isHost ? '후보 ' : ''}
          {selectedDates.length}일 선택함
        </span>
      )}
      {isDirty && <span className="text-sm">저장하지 않은 변경 사항이 있어요</span>}
      <Button disabled={!isDirty || isSaving} onClick={handleSave}>
        {calendar && isHost ? '후보 날짜 수정' : hasVoted ? '투표 수정' : '투표하기'}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {calendar && (
        <DateVotePicker
          poll={poll}
          candidateStart={candidateStart}
          isHost={isHost}
          schedule={schedule}
          selected={selectedDates}
          canVote={canVote}
          onToggle={toggleDate}
        />
      )}

      {calendar && saveBar}

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
