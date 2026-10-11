import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { AdminUser } from '@src/api/controllers/adminController'
import { useAdmin, useAdminUsers, useResetPassword } from '@src/api/hooks/useAdmin'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'

// 회원 관리 (관리자 전용): 비밀번호를 잊은 회원에게 임시 비밀번호를 발급한다
export function AdminUsersPage() {
  const { data: admin, isPending: isAdminPending } = useAdmin()
  const users = useAdminUsers()
  const resetPassword = useResetPassword()
  // 발급한 임시 비밀번호는 서버가 다시 알려주지 않으므로 이 화면에서만 보여준다
  const [issued, setIssued] = useState<{ user: AdminUser; password: string } | null>(null)

  if (isAdminPending) return <p className="text-center">불러오는 중…</p>
  if (!admin) return <Navigate to="/admin/login" replace />

  const handleReset = (user: AdminUser) => {
    const message = `${user.nickname}(${user.username}) 님에게 임시 비밀번호를 발급할까요?\n지금 쓰던 비밀번호와 모든 기기의 로그인이 무효가 돼요.`
    if (!window.confirm(message)) return
    resetPassword.mutate(user.id, {
      onSuccess: ({ temporaryPassword }) => setIssued({ user, password: temporaryPassword }),
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="card">
        <h2 className="mt-0">회원 관리</h2>
        <p>비밀번호를 잊은 회원에게 임시 비밀번호를 발급해 전달해 주세요. 회원이 로그인하면 비밀번호 변경을 안내해요.</p>
      </section>

      {issued && (
        <section className="card card-highlight">
          <h3>임시 비밀번호를 발급했어요</h3>
          <p className="mb-2">
            {issued.user.nickname}({issued.user.username}) 님의 임시 비밀번호
          </p>
          <p className="temp-password">{issued.password}</p>
          <p className="mt-2 text-sm">이 화면을 벗어나면 다시 볼 수 없어요. 지금 회원에게 전달해 주세요.</p>
        </section>
      )}

      <section className="card">
        {resetPassword.isError && <p className="error-text mb-2">{getErrorMessage(resetPassword.error)}</p>}
        {users.isPending ? (
          <p>불러오는 중…</p>
        ) : users.isError ? (
          <p className="error-text">{getErrorMessage(users.error)}</p>
        ) : users.data.length === 0 ? (
          <p className="empty">아직 가입한 회원이 없어요.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>이름</th>
                  <th>닉네임</th>
                  <th>이메일</th>
                  <th>참여 모임</th>
                  <th>가입일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.name}</td>
                    <td>
                      {user.nickname}
                      {user.mustChangePassword && <span className="stage-tag ml-2">임시 비밀번호</span>}
                    </td>
                    <td>{user.email ?? '-'}</td>
                    <td>{user.meetingCount}개</td>
                    <td>{user.createdAt.slice(0, 10)}</td>
                    <td className="text-right">
                      <Button
                        className="btn-sm"
                        variant="secondary"
                        disabled={resetPassword.isPending}
                        onClick={() => handleReset(user)}
                      >
                        임시 비밀번호 발급
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
