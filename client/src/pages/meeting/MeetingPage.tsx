import { Link, useParams } from 'react-router-dom'
import { useAdmin } from '@src/api/hooks/useAdmin'
import { useMeeting } from '@src/api/hooks/useMeeting'
import { useUser } from '@src/api/hooks/useUser'
import { getErrorMessage, HttpError } from '@src/api/httpClient'
import { VoteDeadline } from '@src/components/VoteDeadline'
import { AdminMeetingBar } from '@src/pages/meeting/AdminMeetingBar'
import { CloseVoteButton } from '@src/pages/meeting/CloseVoteButton'
import { ConfirmedSummary } from '@src/pages/meeting/ConfirmedSummary'
import { DatePollSection } from '@src/pages/meeting/DatePollSection'
import { InviteLink } from '@src/pages/meeting/InviteLink'
import { JoinForm } from '@src/pages/meeting/JoinForm'
import { MemberList } from '@src/pages/meeting/MemberList'
import { PlacePollSection } from '@src/pages/meeting/PlacePollSection'
import { StageSteps } from '@src/pages/meeting/StageSteps'

// 모임 대시보드: 참여 전이면 참여 안내(로그인 필요), 참여 후에는 단계별 투표를 보여준다
// 마감이 지나면 서버가 자동 확정하고, 10초마다 다시 불러와 장소 투표 단계로 바뀐다
export function MeetingPage() {
  const { code = '' } = useParams()
  const { data: meeting, isPending, error } = useMeeting(code)
  const { data: admin } = useAdmin()
  const { data: user } = useUser()

  if (isPending) return <p className="text-center">불러오는 중…</p>

  if (error) {
    return (
      <section className="card mx-auto max-w-md text-center">
        <h2>{error instanceof HttpError && error.status === 404 ? '모임을 찾을 수 없어요' : '문제가 생겼어요'}</h2>
        <p className="mb-4">{getErrorMessage(error)}</p>
        <Link className="link" to="/">
          메인으로
        </Link>
      </section>
    )
  }

  // 관리자는 참여하지 않아도 대시보드를 볼 수 있다 (투표·제안·확정은 불가)
  const backToCalendar = (
    <Link className="back-link" to="/">
      ← 캘린더로
    </Link>
  )

  if (!meeting.me && !admin) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3">
        {backToCalendar}
        <AdminMeetingBar meeting={meeting} />
        <JoinForm meeting={meeting} />
      </div>
    )
  }

  const me = meeting.me
  const isHost = me?.role === 'HOST'
  const canParticipate = !!me

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {backToCalendar}
      <AdminMeetingBar meeting={meeting} />
      <section className="card">
        <h2 className="mt-0">{meeting.title}</h2>
        <StageSteps stage={meeting.stage} />
        <VoteDeadline
          deadline={meeting.voteDeadline}
          closed={meeting.stage !== 'VOTE'}
          action={(isHost || !!admin) && <CloseVoteButton code={code} />}
        />
        <InviteLink code={meeting.code} />
      </section>

      {!me && <p className="notice">관리자로 보고 있어요. 투표와 제안은 모임 참여자만 할 수 있어요.</p>}
      {/* 관리자이면서 회원으로도 로그인해 있으면 참여할 수 있다 */}
      {!me && user && <JoinForm meeting={meeting} />}
      <MemberList members={meeting.members} meId={me?.id ?? null} />

      <ConfirmedSummary meeting={meeting} />
      {/* 진행 중인 투표를 위에: 장소 투표 단계면 장소 → 날짜 */}
      {meeting.stage !== 'VOTE' && (
        <PlacePollSection code={code} stage={meeting.stage} isHost={isHost} canParticipate={canParticipate} />
      )}
      <DatePollSection
        code={code}
        stage={meeting.stage}
        isHost={isHost}
        canParticipate={canParticipate}
        candidateStart={meeting.candidateStart}
        candidateEnd={meeting.candidateEnd}
        schedule={meeting.confirmed.schedule}
      />
    </div>
  )
}
