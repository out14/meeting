import type { MeetingStage, Schedule } from '@src/api/controllers/meetingController'
import { usePoll } from '@src/api/hooks/usePoll'
import { PollVoteList } from '@src/pages/meeting/PollVoteList'
import { formatDateList } from '@src/utils/stage'

interface DatePollSectionProps {
  code: string
  stage: MeetingStage
  isHost: boolean
  // 참여자만 투표·제안할 수 있다 (관리자는 보기만)
  canParticipate: boolean
  candidateStart: string
  voteDeadline: string
  schedule: Schedule | null
}

// 후보 날짜는 모임장이 정한 날짜다 (생성 때 후보 기간 전체, 이후 모임장이 달력에서 수정)
export function DatePollSection({
  code,
  stage,
  isHost,
  canParticipate,
  candidateStart,
  voteDeadline,
  schedule,
}: DatePollSectionProps) {
  const { data: poll, isPending } = usePoll(code, 'date')
  const canVote = canParticipate && stage === 'VOTE' && poll?.status === 'OPEN'
  const candidateDates = (poll?.options ?? []).flatMap((option) => (option.date && !option.proposedBy ? [option.date] : []))

  return (
    <section className="card">
      <h3>📅 날짜 투표</h3>
      {candidateDates.length > 0 && <p className="mb-4 text-sm">후보 날짜 {formatDateList(candidateDates)}</p>}
      {canVote &&
        (isHost ? (
          <p className="mb-4">
            모임장이 고른 날짜가 <b>후보 날짜</b>예요. 달력에서 날짜를 눌러 넣고 빼면 후보 날짜가 그대로 수정돼요. 아래에서
            연속된 날짜로 직접 확정할 수도 있어요.
          </p>
        ) : (
          <p className="mb-4">
            달력에서 참석 가능한 날짜를 <b>모두</b> 눌러 골라 주세요. 후보 밖의 날짜를 고르면 내가 <b>제시</b>한 날짜로
            추가돼요.
          </p>
        ))}

      {poll?.status === 'CLOSED' && <p className="mb-4 text-sm">날짜 투표가 확정됐어요.</p>}
      {isPending || !poll ? (
        <p>불러오는 중…</p>
      ) : (
        <PollVoteList
          code={code}
          type="date"
          poll={poll}
          canVote={canVote}
          isHost={isHost}
          calendar
          candidateStart={candidateStart}
          voteDeadline={voteDeadline}
          schedule={schedule}
        />
      )}
    </section>
  )
}
