import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useSignup, useUser } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'
import { readRedirect, withRedirect } from '@src/pages/auth/redirect'

// 회원가입 화면: 아이디 / 이름 / 닉네임 / 이메일 / 비밀번호
export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = readRedirect(params)
  const { data: user } = useUser()
  const signup = useSignup()
  const [form, setForm] = useState({
    username: '',
    name: '',
    nickname: '',
    email: '',
    password: '',
    passwordConfirm: '',
  })
  const [mismatch, setMismatch] = useState(false)

  if (user && !signup.isPending) return <Navigate to={redirect} replace />

  const update = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: event.target.value })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (form.password !== form.passwordConfirm) return setMismatch(true)
    setMismatch(false)
    const { passwordConfirm: _confirm, ...params } = form
    signup.mutate(params, { onSuccess: () => navigate(redirect, { replace: true }) })
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0">회원가입</h2>
      <p className="mb-6">모임에서는 닉네임으로 표시돼요.</p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="아이디"
          placeholder="영문 소문자, 숫자, _ 4~20자"
          autoComplete="username"
          pattern="[a-zA-Z0-9_]{4,20}"
          title="영문, 숫자, _ 로 4~20자"
          required
          value={form.username}
          onChange={update('username')}
        />
        <TextField label="이름" placeholder="홍길동" maxLength={30} required value={form.name} onChange={update('name')} />
        <TextField
          label="닉네임"
          placeholder="모임에서 보일 이름"
          maxLength={30}
          required
          value={form.nickname}
          onChange={update('nickname')}
        />
        <TextField
          label="이메일"
          type="email"
          placeholder="비밀번호를 찾을 때 사용해요"
          autoComplete="email"
          maxLength={254}
          required
          value={form.email}
          onChange={update('email')}
        />
        <TextField
          label="비밀번호"
          type="password"
          placeholder="6자 이상"
          autoComplete="new-password"
          minLength={6}
          maxLength={64}
          required
          value={form.password}
          onChange={update('password')}
        />
        <TextField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          required
          value={form.passwordConfirm}
          onChange={update('passwordConfirm')}
        />
        {mismatch && <p className="error-text">비밀번호가 서로 달라요.</p>}
        {signup.isError && <p className="error-text">{getErrorMessage(signup.error)}</p>}
        <Button type="submit" disabled={signup.isPending}>
          {signup.isPending ? '가입하는 중…' : '가입하기'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        이미 회원이신가요?{' '}
        <Link className="link" to={withRedirect('/login', redirect)}>
          로그인
        </Link>
      </p>
    </section>
  )
}
