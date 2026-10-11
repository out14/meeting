import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useLogin, useUser } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'
import { readRedirect, withRedirect } from '@src/pages/auth/redirect'
// 로그인 화면 로고: 누끼(logo-cutout.png)를 320px 로 줄인 것 (화면에는 160px, 고해상도 대비 2배)
import logo from '@src/assets/images/logo-login.png'

// 회원 로그인 화면
export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = readRedirect(params)
  const { data: user } = useUser()
  const login = useLogin()
  const [form, setForm] = useState({ username: '', password: '' })

  // 임시 비밀번호로 로그인하면 비밀번호 변경을 위해 마이페이지로 보낸다
  const nextPath = (mustChangePassword: boolean) => (mustChangePassword ? '/mypage' : redirect)

  if (user && !login.isPending) return <Navigate to={nextPath(user.mustChangePassword)} replace />

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate(form, { onSuccess: ({ user }) => navigate(nextPath(user.mustChangePassword), { replace: true }) })
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <img src={logo} alt="요정" className="mx-auto mb-4 block w-40" />
      <h2 className="mt-0">로그인</h2>
      <p className="mb-6">로그인하면 초대받은 모임에 참여하고 투표할 수 있어요.</p>
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
      <p className="mt-4 text-center text-sm">
        비밀번호를 잊으셨나요?{' '}
        <Link className="link" to="/find-password">
          비밀번호 찾기
        </Link>
      </p>
      <p className="mt-1 text-center text-sm">
        아직 회원이 아니신가요?{' '}
        <Link className="link" to={withRedirect('/signup', redirect)}>
          회원가입
        </Link>
      </p>
    </section>
  )
}
