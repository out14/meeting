import { useNavigate } from 'react-router-dom'
import type { Meeting } from '@src/api/controllers/meetingController'
import { useAdmin } from '@src/api/hooks/useAdmin'
import { useDeleteMeeting } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'

// 모임장·관리자에게 보이는 모임 관리 도구 (삭제 권한은 서버가 모임장/관리자 토큰으로 검증한다)
export function AdminMeetingBar({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate()
  const { data: admin } = useAdmin()
  const deleteMeeting = useDeleteMeeting()

  const isHost = meeting.me?.role === 'HOST'
  if (!admin && !isHost) return null

  const handleDelete = async () => {
    const message = `'${meeting.title}' 모임을 삭제할까요?\n참여자 ${meeting.members.length}명과 모든 투표 기록이 함께 사라지고, 되돌릴 수 없어요.`
    if (!window.confirm(message)) return
    // 삭제되면 상세 화면(과 이 버튼)이 사라지므로 mutate 콜백 대신 promise 로 이동한다
    try {
      await deleteMeeting.mutateAsync(meeting.code)
      window.alert(`'${meeting.title}' 모임을 삭제했어요.`)
      navigate('/', { replace: true })
    } catch {
      // 에러는 deleteMeeting.error 로 표시된다
    }
  }

  return (
    <div className="admin-bar">
      <span className="text-sm">{admin ? '관리자 메뉴' : '모임장 메뉴'}</span>
      {deleteMeeting.isError && <span className="error-text">{getErrorMessage(deleteMeeting.error)}</span>}
      <Button className="btn-sm btn-danger" variant="secondary" disabled={deleteMeeting.isPending} onClick={handleDelete}>
        {deleteMeeting.isPending ? '삭제하는 중…' : '모임 삭제'}
      </Button>
    </div>
  )
}
