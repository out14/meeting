import classNames from 'classnames'
import { STATUS_COLOR, STATUS_LABEL, type MeetingStatus } from '@src/utils/stage'

// 모임 상태 태그: 캘린더 범례와 같은 색 점 + 이름 (일정 미정 / 장소 미정 / 확정된 일정)
export function StatusTag({ status }: { status: MeetingStatus }) {
  return (
    <span className="status-tag">
      <span className={classNames('calendar-legend', STATUS_COLOR[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}

// 목록 제목 앞의 색 점
export function StatusDot({ status }: { status: MeetingStatus }) {
  return <span className={classNames('calendar-legend', STATUS_COLOR[status])} aria-hidden />
}
