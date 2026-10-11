import classNames from 'classnames'
import { Link } from 'react-router-dom'
import type { MyMeeting, MyVote } from '@src/api/controllers/userController'
import { useLeaveMeeting } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { StatusTag } from '@src/components/StatusTag'
import { formatDay, meetingStatus } from '@src/utils/stage'

function VoteChips({ label, votes }: { label: string; votes: MyVote[] }) {
  if (!votes.length) return null
  return (
    <div className="my-votes">
      <span className="my-votes-label">{label}</span>
      {votes.map((vote) => (
        <span key={vote.label} className={classNames('chip chip-sm', { 'chip-confirmed': vote.confirmed })}>
          {vote.label}
          {vote.confirmed && ' ✓'}
        </span>
      ))}
    </div>
  )
}

interface MyMeetingListProps {
  title: string
  meetings: MyMeeting[]
  emptyText: string
  // 내가 참여한 모임 목록: 내 선택을 보여주고 '참여 취소' 버튼을 둔다
  joined?: boolean
}

export function MyMeetingList({ title, meetings, emptyText, joined = false }: MyMeetingListProps) {
  const leaveMeeting = useLeaveMeeting()

  // 참여 취소: 그 모임의 내 표를 모두 지우고 참여자 명단에서 빠진다 (모임장은 이 목록에 없으므로 버튼도 없다)
  const handleLeave = (meeting: MyMeeting) => {
    const message = `'${meeting.title}' 모임 참여를 취소할까요?\n내 투표가 모두 지워지고 참여자 명단에서 빠져요. 다시 참여하려면 초대 링크로 들어오면 돼요.`
    if (!window.confirm(message)) return
    leaveMeeting.mutate(meeting.code, {
      onSuccess: () => window.alert(`'${meeting.title}' 모임 참여를 취소했어요.`),
      onError: (error) => window.alert(getErrorMessage(error)),
    })
  }

  return (
    <section className="card">
      <h3>
        {title} <span className="text-sm font-normal">{meetings.length}개</span>
      </h3>
      {meetings.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((meeting) => (
            <li key={meeting.code} className="meeting-item-wrap">
              <Link to={`/m/${meeting.code}`} className={classNames('meeting-item', { 'has-action': joined })}>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-h)]">{meeting.title}</span>
                  <StatusTag status={meetingStatus(meeting)} />
                </span>
                <span className="text-sm">
                  후보 기간 {formatDay(meeting.candidateStart)} ~ {formatDay(meeting.candidateEnd)} · 참여자{' '}
                  {meeting.memberCount}명
                </span>
                {joined && (
                  <>
                    <VoteChips label="내가 고른 날짜" votes={meeting.votes.date} />
                    <VoteChips label="내가 고른 장소" votes={meeting.votes.place} />
                    {!meeting.votes.date.length && !meeting.votes.place.length && (
                      <span className="text-sm">아직 투표하지 않았어요</span>
                    )}
                  </>
                )}
              </Link>
              {/* 카드 링크 안에 버튼을 넣을 수 없어 카드 위에 겹쳐 둔다 */}
              {joined && (
                <Button
                  className="btn-sm meeting-item-action"
                  variant="secondary"
                  disabled={leaveMeeting.isPending}
                  onClick={() => handleLeave(meeting)}
                >
                  참여 취소
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
