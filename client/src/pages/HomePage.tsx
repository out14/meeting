import { useMeetingList } from '@src/api/hooks/useMeeting'
import { getErrorMessage } from '@src/api/httpClient'
import { MeetingCalendar } from '@src/pages/home/MeetingCalendar'
import { UnscheduledList } from '@src/pages/home/UnscheduledList'

// 메인: 날짜가 확정된 모임은 캘린더에, 미정인 모임은 별도 목록에 보여준다
export function HomePage() {
  const { data: meetings, isPending, error } = useMeetingList()

  if (isPending) return <p className="text-center">불러오는 중…</p>
  if (error) return <p className="error-text text-center">{getErrorMessage(error)}</p>

  return (
    <div className="home-layout">
      <MeetingCalendar meetings={meetings} />
      <UnscheduledList meetings={meetings.filter((meeting) => !meeting.startDate)} />
    </div>
  )
}
