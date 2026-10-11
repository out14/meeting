import classNames from 'classnames'
import { Link } from 'react-router-dom'
import type { MeetingSummary } from '@src/api/controllers/meetingController'
import { formatDeadline } from '@src/utils/deadline'
import { scheduleLength, todayKey } from '@src/utils/schedule'
import { StatusDot } from '@src/components/StatusTag'
import { formatDay, placeText, STATUS_LABEL, type MeetingStatus } from '@src/utils/stage'

type ScheduledMeeting = MeetingSummary & { startDate: string; endDate: string }

const isScheduled = (meeting: MeetingSummary): meeting is ScheduledMeeting => !!meeting.startDate && !!meeting.endDate

const formatRange = ({ startDate, endDate }: ScheduledMeeting) =>
  startDate === endDate ? formatDay(startDate) : `${formatDay(startDate)} ~ ${formatDay(endDate)}`

// 장소 미정인 이유: 장소 투표 중 / 동점 / 무투표로 미정
const unplacedReason = (meeting: MeetingSummary) =>
  meeting.stage === 'PLACE' ? '장소 투표 중' : meeting.placeTied.length ? '동점' : '미정'

function ScheduledItem({ meeting, past = false }: { meeting: ScheduledMeeting; past?: boolean }) {
  return (
    <li>
      <Link to={`/m/${meeting.code}`} className={classNames('meeting-item', { 'meeting-item-past': past })}>
        <span className="flex items-center gap-2">
          <span className="font-medium text-[var(--text-h)]">{meeting.title}</span>
          {/* 상태는 목록 제목이 말해 주므로, 장소 미정이면 왜 미정인지만 보여준다 */}
          {!meeting.place && <span className="stage-tag">{unplacedReason(meeting)}</span>}
        </span>
        <span className="text-sm">
          📅 {formatRange(meeting)} ({scheduleLength(meeting.startDate, meeting.endDate)})
        </span>
        <span className="text-sm">
          {placeText(meeting) && `📍 ${placeText(meeting)} · `}참여자 {meeting.memberCount}명
        </span>
        {meeting.stage === 'PLACE' && meeting.placeDeadline && (
          <span className="text-sm">⏰ 장소 투표 마감 {formatDeadline(meeting.placeDeadline)}</span>
        )}
      </Link>
    </li>
  )
}

interface ScheduledListProps {
  status: Exclude<MeetingStatus, 'unscheduled'>
  // 날짜가 확정된 모임 중 이 목록에 넣을 모임 (장소 미정 / 확정된 일정)
  meetings: MeetingSummary[]
  emptyText: string
}

// 날짜가 확정된 모임 목록: 다가오는 일정은 가까운 순, 끝난 일정은 최근 순으로 아래에 따로 모은다
export function ScheduledList({ status, meetings, emptyText }: ScheduledListProps) {
  const today = todayKey()
  const scheduled = meetings.filter(isScheduled)
  const upcoming = scheduled
    .filter((meeting) => meeting.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const past = scheduled
    .filter((meeting) => meeting.endDate < today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  return (
    <section className="card">
      <h3 className="list-title">
        <StatusDot status={status} /> {STATUS_LABEL[status]}{' '}
        <span className="text-sm font-normal">{upcoming.length}개</span>
      </h3>
      {upcoming.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((meeting) => (
            <ScheduledItem key={meeting.code} meeting={meeting} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="past-schedules">
          <summary>지난 일정 {past.length}개</summary>
          <ul className="flex flex-col gap-2">
            {past.map((meeting) => (
              <ScheduledItem key={meeting.code} meeting={meeting} past />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
