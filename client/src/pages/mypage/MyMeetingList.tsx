import classNames from 'classnames'
import { Link } from 'react-router-dom'
import type { MyMeeting, MyVote } from '@src/api/controllers/userController'
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
  // 내가 참여한 투표 목록에서는 내 선택을 보여준다
  showVotes?: boolean
}

export function MyMeetingList({ title, meetings, emptyText, showVotes = false }: MyMeetingListProps) {
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
            <li key={meeting.code}>
              <Link to={`/m/${meeting.code}`} className="meeting-item">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-h)]">{meeting.title}</span>
                  <StatusTag status={meetingStatus(meeting)} />
                </span>
                <span className="text-sm">
                  후보 기간 {formatDay(meeting.candidateStart)} ~ {formatDay(meeting.candidateEnd)} · 참여자{' '}
                  {meeting.memberCount}명
                </span>
                {showVotes && (
                  <>
                    <VoteChips label="내가 고른 날짜" votes={meeting.votes.date} />
                    <VoteChips label="내가 고른 장소" votes={meeting.votes.place} />
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
