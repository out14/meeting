import { Link } from 'react-router-dom'
import type { MeetingSummary } from '@src/api/controllers/meetingController'
import { formatDeadline } from '@src/utils/deadline'
import { StatusDot } from '@src/components/StatusTag'
import { formatDateList, STATUS_LABEL } from '@src/utils/stage'

// 날짜가 확정되지 않은 모임 (캘린더에는 후보 기간으로 표시되고, 여기에도 따로 모아 보여준다)
export function UnscheduledList({ meetings }: { meetings: MeetingSummary[] }) {
  return (
    <section className="card">
      <h3 className="list-title">
        <StatusDot status="unscheduled" /> {STATUS_LABEL.unscheduled}{' '}
        <span className="text-sm font-normal">{meetings.length}개</span>
      </h3>
      {meetings.length === 0 ? (
        <p className="empty">날짜를 정하는 중인 모임이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((meeting) => (
            <li key={meeting.code}>
              <Link to={`/m/${meeting.code}`} className="meeting-item">
                <span className="font-medium text-[var(--text-h)]">{meeting.title}</span>
                <span className="text-sm">
                  후보 {formatDateList(meeting.candidateDates)} · 참여자 {meeting.memberCount}명
                </span>
                <span className="text-sm">⏰ 투표 마감 {formatDeadline(meeting.voteDeadline)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
