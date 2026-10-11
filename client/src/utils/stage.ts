import type { MeetingStage } from '@src/api/controllers/meetingController'

export const STAGE_LABEL: Record<MeetingStage, string> = {
  VOTE: '날짜 투표 중',
  PLACE: '장소 투표 중',
  DONE: '일정 확정',
}

// 'YYYY-MM-DD' → '10/8'
export const formatDay = (value: string) => {
  const [, month, day] = value.split('-').map(Number)
  return `${month}/${day}`
}
