import { Navigate, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useLogout, useMyMeetings, useUser } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { ChangePasswordForm } from '@src/pages/mypage/ChangePasswordForm'
import { MyMeetingList } from '@src/pages/mypage/MyMeetingList'

// 마이페이지: 비밀번호 변경, 내가 개설한 모임, 내가 참여한 투표
export function MyPage() {
  const { data: user, isPending } = useUser()
  const myMeetings = useMyMeetings()
  const logout = useLogout()
  const navigate = useNavigate()

  if (isPending) return <p className="text-center">불러오는 중…</p>
  if (!user) return <Navigate to="/login?redirect=%2Fmypage" replace />

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="card flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0">{user.nickname} 님</h2>
          <p className="mt-1 text-sm">
            {user.name} · 아이디 {user.username} · {user.email ?? '이메일 미등록'}
          </p>
        </div>
        <Button
          className="btn-sm"
          variant="secondary"
          onClick={async () => {
            await logout()
            navigate('/', { replace: true })
          }}
        >
          로그아웃
        </Button>
      </section>

      {myMeetings.isPending ? (
        <p className="text-center">불러오는 중…</p>
      ) : myMeetings.isError ? (
        <p className="error-text text-center">{getErrorMessage(myMeetings.error)}</p>
      ) : (
        <>
          <MyMeetingList title="내가 개설한 모임" meetings={myMeetings.data.hosted} emptyText="아직 개설한 모임이 없어요." />
          <MyMeetingList
            title="내가 참여한 투표"
            meetings={myMeetings.data.voted}
            emptyText="아직 투표한 모임이 없어요."
            showVotes
          />
        </>
      )}

      <ChangePasswordForm mustChange={user.mustChangePassword} />
    </div>
  )
}
