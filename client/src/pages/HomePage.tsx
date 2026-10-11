import { useMeetingList } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { MeetingCalendar } from '@src/pages/home/MeetingCalendar'
import { ScheduledList } from '@src/pages/home/ScheduledList'
import { UnscheduledList } from '@src/pages/home/UnscheduledList'
import { meetingStatus } from '@src/utils/stage'

// 메인: 모든 모임을 캘린더에 보여주고, 옆에 상태별 목록(일정 미정 / 장소 미정 / 확정된 일정)을 따로 모아 보여준다
export function HomePage() {
  const { data: meetings, isPending, error } = useMeetingList()

  if (isPending) return <p className="text-center">불러오는 중…</p>
  if (error) return <p className="error-text text-center">{getErrorMessage(error)}</p>

  return (
    <div className="home-layout">
      <MeetingCalendar meetings={meetings} />
      {/* 넓은 화면에서는 캘린더 왼쪽, 좁은 화면에서는 캘린더 아래 */}
      <div className="home-side">
        <UnscheduledList meetings={meetings.filter((meeting) => meetingStatus(meeting) === 'unscheduled')} />
        <ScheduledList
          status="unplaced"
          meetings={meetings.filter((meeting) => meetingStatus(meeting) === 'unplaced')}
          emptyText="장소를 정하는 중인 모임이 없어요."
        />
        <ScheduledList
          status="confirmed"
          meetings={meetings.filter((meeting) => meetingStatus(meeting) === 'confirmed')}
          emptyText="다가오는 확정 일정이 없어요."
        />
      </div>
    </div>
  )
}
