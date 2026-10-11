import { useState, type FormEvent } from 'react'
import { useClosePlaceVote, useUpdatePlaceDeadline } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { TextField } from '@src/components/TextField'
import { VoteDeadline } from '@src/components/VoteDeadline'
import { toLocalInputValue } from '@src/utils/deadline'

interface PlaceDeadlineBarProps {
  code: string
  deadline: string
  // 정모 마지막 날 (마감은 그 전까지)
  scheduleEnd: string
  isHost: boolean
  isAdmin: boolean
}

// 장소 투표 마감 배너: 남은 시간 + 모임장/관리자 '지금 마감하기', 모임장 '마감 수정'
export function PlaceDeadlineBar({ code, deadline, scheduleEnd, isHost, isAdmin }: PlaceDeadlineBarProps) {
  const closePlaceVote = useClosePlaceVote(code)
  const updateDeadline = useUpdatePlaceDeadline(code)
  const [editing, setEditing] = useState<string | null>(null)

  const handleClose = async () => {
    const message =
      '지금 장소 투표를 마감할까요?\n가장 많이 받은 지역으로 확정돼요. 동점이면 동점 지역을 모두 보여주고, 아무도 투표하지 않았으면 장소 미정이 돼요.'
    if (!window.confirm(message)) return
    // 마감되면 이 배너가 바뀌므로(언마운트) mutate 콜백 대신 promise 로 알린다
    try {
      await closePlaceVote.mutateAsync()
      window.alert('장소 투표를 마감했어요.')
    } catch (error) {
      window.alert(getErrorMessage(error))
    }
  }

  const handleSave = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    updateDeadline.mutate(new Date(editing).toISOString(), {
      onSuccess: () => {
        setEditing(null)
        window.alert('장소 투표 마감을 수정했어요.')
      },
    })
  }

  const canClose = isHost || isAdmin

  return (
    <div className="mb-4 flex flex-col gap-2">
      <VoteDeadline
        label="장소 투표 마감"
        deadline={deadline}
        closed={false}
        action={
          canClose && (
            <>
              {isHost && editing === null && (
                <Button
                  className="btn-sm"
                  variant="secondary"
                  onClick={() => {
                    updateDeadline.reset()
                    setEditing(toLocalInputValue(new Date(deadline)))
                  }}
                >
                  마감 수정
                </Button>
              )}
              <Button className="btn-sm" variant="secondary" disabled={closePlaceVote.isPending} onClick={handleClose}>
                {closePlaceVote.isPending ? '마감하는 중…' : '지금 마감하기'}
              </Button>
            </>
          )
        }
      />
      {editing !== null && (
        <form className="proposal-form" onSubmit={handleSave}>
          <TextField
            label="장소 투표 마감 일시"
            type="datetime-local"
            required
            max={`${scheduleEnd}T23:59`}
            value={editing}
            onChange={(event) => setEditing(event.target.value)}
          />
          {updateDeadline.isError && <p className="error-text">{getErrorMessage(updateDeadline.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" className="btn-sm" variant="secondary" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button type="submit" className="btn-sm" disabled={!editing || updateDeadline.isPending}>
              {updateDeadline.isPending ? '저장하는 중…' : '저장'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
