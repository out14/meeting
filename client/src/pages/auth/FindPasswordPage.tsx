import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '@src/api/httpClient'
import { useRequestReset } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'

// 비밀번호 찾기: 가입한 이메일로 재설정 링크를 보낸다
// 가입 여부를 알 수 없도록, 있는 이메일이든 없는 이메일이든 같은 안내를 보여준다
export function FindPasswordPage() {
  const requestReset = useRequestReset()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    requestReset.mutate(email.trim(), { onSuccess: () => setSentTo(email.trim()) })
  }

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0">비밀번호 찾기</h2>
      {sentTo ? (
        <>
          <p className="notice mb-4">
            <b>{sentTo}</b>(으)로 가입된 계정이 있으면 비밀번호 재설정 링크를 보냈어요. 메일의 링크에서 30분 안에 새
            비밀번호를 설정해 주세요.
          </p>
          <p className="mb-6 text-sm">
            메일이 오지 않으면 스팸함을 확인하거나 잠시 뒤에 다시 시도해 주세요. 이메일을 등록하지 않은 계정은 관리자에게
            임시 비밀번호를 요청해 주세요.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setSentTo(null)}>
            다른 이메일로 다시 보내기
          </Button>
        </>
      ) : (
        <>
          <p className="mb-6">가입할 때 입력한 이메일로 비밀번호 재설정 링크를 보내 드려요.</p>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <TextField
              label="이메일"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {requestReset.isError && <p className="error-text">{getErrorMessage(requestReset.error)}</p>}
            <Button type="submit" disabled={requestReset.isPending}>
              {requestReset.isPending ? '보내는 중…' : '재설정 링크 받기'}
            </Button>
          </form>
        </>
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="link" to="/login">
          로그인으로 돌아가기
        </Link>
      </p>
    </section>
  )
}
