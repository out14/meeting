import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useVerifyReset } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 비밀번호 찾기: 이름 + 이메일이 맞으면 새 비밀번호 설정 페이지로 이동한다
export function FindPasswordPage() {
  const navigate = useNavigate()
  const verify = useVerifyReset()
  const [form, setForm] = useState({ name: '', email: '' })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    // 재설정 토큰은 주소에 남지 않도록 화면 이동 state 로만 넘긴다
    verify.mutate(form, { onSuccess: (result) => navigate('/find-password/reset', { state: result }) })
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0">비밀번호 찾기</h2>
      <p className="mb-6">가입할 때 입력한 이름과 이메일을 입력해 주세요.</p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          autoComplete="name"
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        {verify.isError && <p className="error-text">{getErrorMessage(verify.error)}</p>}
        <Button type="submit" disabled={verify.isPending}>
          {verify.isPending ? '확인하는 중…' : '다음'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link className="link" to="/login">
          로그인으로 돌아가기
        </Link>
      </p>
    </section>
  )
}
