import type { MeetingStage, Schedule } from '@src/api/controllers/meetingController'
import { usePoll } from '@src/api/hooks/usePoll'
import { PollVoteList } from '@src/pages/meeting/PollVoteList'

interface DatePollSectionProps {
  code: string
  stage: MeetingStage
  isHost: boolean
  // 참여자만 투표·제안할 수 있다 (관리자는 보기만)
  canParticipate: boolean
  candidateStart: string
  candidateEnd: string
  schedule: Schedule | null
}

const formatDay = (value: string) => {
  const [, month, day] = value.split('-').map(Number)
  return `${month}/${day}`
}

// 후보 날짜는 모임 생성 때 정한 후보 기간의 모든 날짜다
export function DatePollSection({
  code,
  stage,
  isHost,
  canParticipate,
  candidateStart,
  candidateEnd,
  schedule,
}: DatePollSectionProps) {
  const { data: poll, isPending } = usePoll(code, 'date')
  const canVote = canParticipate && stage === 'VOTE' && poll?.status === 'OPEN'

  return (
    <section className="card">
      <h3>📅 날짜 투표</h3>
      <p className="mb-4 text-sm">
        후보 기간 {formatDay(candidateStart)} ~ {formatDay(candidateEnd)}
      </p>
      {canVote && (
        <p className="mb-4">
          달력에서 참석 가능한 날짜를 <b>모두</b> 눌러 골라 주세요. 원하는 날짜가 없으면 아래에서 제안할 수 있어요.
          {isHost && ' 아래에서 연속된 날짜로 직접 확정할 수도 있어요.'}
        </p>
      )}

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
          schedule={schedule}
        />
      )}
    </section>
  )
}
