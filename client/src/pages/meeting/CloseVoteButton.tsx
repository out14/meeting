import { useCloseVote } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'

// 모임장/관리자: 마감 일시 전에 날짜 투표를 바로 마감한다
export function CloseVoteButton({ code }: { code: string }) {
  const closeVote = useCloseVote(code)

  const handleClick = async () => {
    const message =
      '지금 날짜 투표를 마감할까요?\n가장 많이 받은 날(같은 표를 받은 이어진 날 포함)로 일정이 확정되고, 장소 투표로 넘어가요.'
    if (!window.confirm(message)) return
    // 마감되면 이 버튼이 사라지므로(언마운트) mutate 콜백 대신 promise 로 알린다
    try {
      await closeVote.mutateAsync()
      window.alert('투표를 마감했어요. 이제 장소 투표를 진행해요.')
    } catch (error) {
      window.alert(getErrorMessage(error))
    }
  }

  return (
    <Button className="btn-sm" variant="secondary" disabled={closeVote.isPending} onClick={handleClick}>
      {closeVote.isPending ? '마감하는 중…' : '지금 마감하기'}
    </Button>
  )
}
