import { useState, type FormEvent } from 'react'
import { useChangePassword } from '@src/api/hooks/useUser'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

const EMPTY = { currentPassword: '', newPassword: '', newPasswordConfirm: '' }

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const changePassword = useChangePassword()
  const [form, setForm] = useState(EMPTY)
  const [mismatch, setMismatch] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setDone(false)
    if (form.newPassword !== form.newPasswordConfirm) return setMismatch(true)
    setMismatch(false)
    const { currentPassword, newPassword } = form
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setForm(EMPTY)
          setDone(true)
        },
      },
    )
  }

  return (
    <section className="card">
      <h3>비밀번호 변경</h3>
      {mustChange && (
        <p className="notice mb-4">임시 비밀번호로 로그인했어요. 현재 비밀번호에 임시 비밀번호를 넣고 새 비밀번호로 바꿔 주세요.</p>
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label={mustChange ? '현재 비밀번호 (임시 비밀번호)' : '현재 비밀번호'}
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
        />
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
        {changePassword.isError && <p className="error-text">{getErrorMessage(changePassword.error)}</p>}
        {done && <p className="success-text">비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.</p>}
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? '바꾸는 중…' : '비밀번호 변경'}
        </Button>
      </form>
    </section>
  )
}
