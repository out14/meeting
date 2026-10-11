import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useResetLink, useResetPassword } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 새 비밀번호 설정: 재설정 메일의 링크(?token=)로 들어온다 (30분 안에, 한 번만)
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const resetToken = params.get('token') ?? ''
  const link = useResetLink(resetToken)
  const reset = useResetPassword()
  const [form, setForm] = useState({ newPassword: '', newPasswordConfirm: '' })
  const [mismatch, setMismatch] = useState(false)

  // 링크가 없거나 만료·사용된 경우
  if (!resetToken || link.isError) {
    return (
      <section className="card mx-auto w-full max-w-md text-center">
        <h2 className="mt-0">링크를 쓸 수 없어요</h2>
        <p className="mb-4">
          {link.isError
            ? getErrorMessage(link.error)
            : '비밀번호 재설정은 메일로 받은 링크에서 할 수 있어요.'}
        </p>
        <Link className="link" to="/find-password" replace>
          비밀번호 찾기 다시 하기
        </Link>
      </section>
    )
  }
  if (link.isPending) return <p className="text-center">링크를 확인하는 중…</p>

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (form.newPassword !== form.newPasswordConfirm) return setMismatch(true)
    setMismatch(false)
    reset.mutate(
      { resetToken, newPassword: form.newPassword },
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
        아이디 <b>{link.data.username}</b> 님, 새 비밀번호를 입력해 주세요.
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
