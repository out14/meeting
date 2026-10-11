import { Link } from 'react-router-dom'
import type { Meeting } from '@src/api/controllers/meetingController'
import { useJoinMeeting } from '@src/api/hooks/useMeeting'
import { useUser } from '@src/api/hooks/useUser'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { withRedirect } from '@src/pages/auth/redirect'

// 모임 참여: 로그인한 회원만, 회원 정보(이름/닉네임)로 참여한다
export function JoinForm({ meeting }: { meeting: Meeting }) {
  const { data: user, isPending } = useUser()
  const joinMeeting = useJoinMeeting(meeting.code)
  const here = `/m/${meeting.code}`

  return (
    <section className="card mx-auto w-full max-w-md">
      <p className="mb-1">초대받은 모임</p>
      <h2 className="mt-0">{meeting.title}</h2>
      <p className="mb-6">
        {meeting.members.map((member) => member.nickname).join(', ')} 님이 참여 중이에요.
      </p>

      {isPending ? null : user ? (
        <div className="flex flex-col gap-4">
          <p className="join-profile">
            <span className="font-medium text-[var(--text-h)]">{user.nickname}</span> ({user.name}) 님으로 참여해요.
          </p>
          {joinMeeting.isError && <p className="error-text">{getErrorMessage(joinMeeting.error)}</p>}
          <Button disabled={joinMeeting.isPending} onClick={() => joinMeeting.mutate()}>
            {joinMeeting.isPending ? '참여하는 중…' : '모임 참여하기'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="mb-2">모임에 참여하려면 로그인해 주세요.</p>
          <Link className="btn btn-primary text-center" to={withRedirect('/login', here)}>
            로그인하고 참여하기
          </Link>
          <Link className="btn btn-secondary text-center" to={withRedirect('/signup', here)}>
            회원가입
          </Link>
        </div>
      )}
    </section>
  )
}
