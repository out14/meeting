import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdmin, useAdminLogin } from '@src/api/hooks/useAdmin'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 관리자 로그인 화면
export function AdminLoginPage() {
  const navigate = useNavigate()
  const { data: admin } = useAdmin()
  const login = useAdminLogin()
  const [form, setForm] = useState({ username: '', password: '' })

  if (admin) return <Navigate to="/" replace />

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate(form, { onSuccess: () => navigate('/', { replace: true }) })
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0 mb-6">관리자 로그인</h2>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="아이디"
          autoComplete="username"
          required
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        {login.isError && <p className="error-text">{getErrorMessage(login.error)}</p>}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? '로그인 중…' : '로그인'}
        </Button>
      </form>
    </section>
  )
}
