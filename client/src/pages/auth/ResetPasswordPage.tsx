import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { VerifyResetResult } from '@src/api/controllers/userController'
import { getErrorMessage } from '@src/api/httpClient'
import { useResetPassword } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 새 비밀번호 설정: 비밀번호 찾기에서 확인을 마친 경우에만 들어올 수 있다 (10분 안에)
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const verified = location.state as VerifyResetResult | null
  const reset = useResetPassword()
  const [form, setForm] = useState({ newPassword: '', newPasswordConfirm: '' })
  const [mismatch, setMismatch] = useState(false)

  // 주소로 바로 들어왔거나 새로고침해서 확인 정보가 없으면 처음부터
  if (!verified?.resetToken) return <Navigate to="/find-password" replace />

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (form.newPassword !== form.newPasswordConfirm) return setMismatch(true)
    setMismatch(false)
    reset.mutate(
      { resetToken: verified.resetToken, newPassword: form.newPassword },
      {
        onSuccess: () => {
          window.alert('비밀번호를 변경했어요. 새 비밀번호로 로그인된 상태예요.')
          navigate('/', { replace: true })
        },
      },
    )
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0">새 비밀번호 설정</h2>
      <p className="notice mb-6">
        아이디 <b>{verified.username}</b> 님, 새 비밀번호를 입력해 주세요. 10분 안에 변경해야 해요.
      </p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="새 비밀번호"
          type="password"
          placeholder="6자 이상"
          autoComplete="new-password"
          minLength={6}
          maxLength={64}
          required
          value={form.newPassword}
          onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
        />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          autoComplete="new-password"
          required
          value={form.newPasswordConfirm}
          onChange={(event) => setForm({ ...form, newPasswordConfirm: event.target.value })}
        />
        {mismatch && <p className="error-text">새 비밀번호가 서로 달라요.</p>}
        {reset.isError && (
          <p className="error-text">
            {getErrorMessage(reset.error)}{' '}
            <Link className="link" to="/find-password" replace>
              다시 시도
            </Link>
          </p>
        )}
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending ? '변경하는 중…' : '비밀번호 변경'}
        </Button>
      </form>
    </section>
  )
}
