import { useState, type FormEvent } from 'react'
import { getErrorMessage } from '@src/api/httpClient'
import { useWithdraw } from '@src/api/hooks/useUser'
import { clearUserToken } from '@src/api/userToken'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 회원 탈퇴: 비밀번호를 다시 확인하고, 개설한 모임이 함께 삭제된다는 걸 알린 뒤 탈퇴한다
export function WithdrawSection({ hostedCount }: { hostedCount: number }) {
  const withdraw = useWithdraw()
  const [isOpen, setIsOpen] = useState(false)
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const hostedNotice = hostedCount ? `\n내가 개설한 모임 ${hostedCount}개도 함께 삭제돼요.` : ''
    const message = `정말 탈퇴할까요?\n참여한 모임에서 빠지고 내 투표가 모두 지워지며, 되돌릴 수 없어요.${hostedNotice}`
    if (!window.confirm(message)) return
    try {
      await withdraw.mutateAsync(password)
    } catch {
      return // 에러는 withdraw.error 로 표시된다
    }
    // 로그인 정보만 지우고 홈을 새로 불러온다. 화면 상태를 바로 로그아웃으로 바꾸면
    // 마이페이지가 먼저 다시 그려지면서 로그인 화면으로 보내 버리므로, 새로 고침으로 깔끔하게 초기화한다
    clearUserToken()
    window.alert('탈퇴했어요. 그동안 이용해 주셔서 고마워요.')
    window.location.replace('/')
  }

  return (
    <section className="card">
      <h3>회원 탈퇴</h3>
      {!isOpen ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm">탈퇴하면 계정과 투표 기록이 지워지고 되돌릴 수 없어요.</p>
          <Button className="btn-sm btn-danger" variant="secondary" onClick={() => setIsOpen(true)}>
            회원 탈퇴
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <ul className="withdraw-notice text-sm">
            <li>참여한 모임에서 빠지고, 내 투표가 모두 지워져요.</li>
            <li>
              내가 개설한 모임{hostedCount ? ` ${hostedCount}개` : ''}은 참여자·투표와 함께 <b>삭제</b>돼요.
            </li>
            <li>내가 제시한 날짜에 다른 사람이 투표했다면, 그 날짜는 그 사람의 제시로 남아요.</li>
          </ul>
          <TextField
            label="탈퇴 확인용 비밀번호"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {withdraw.isError && <p className="error-text">{getErrorMessage(withdraw.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className="btn-sm"
              variant="secondary"
              onClick={() => {
                setIsOpen(false)
                setPassword('')
                withdraw.reset()
              }}
            >
              취소
            </Button>
            <Button type="submit" className="btn-sm btn-danger" variant="secondary" disabled={!password || withdraw.isPending}>
              {withdraw.isPending ? '탈퇴하는 중…' : '탈퇴하기'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
