import { adminTokenConfig } from '@src/api/adminToken'
import { httpClient } from '@src/api/httpClient'
import { memberTokenConfig } from '@src/api/memberToken'
import { getUserToken } from '@src/api/userToken'

// VOTE: 날짜 투표(마감 일시까지) → PLACE: 장소 투표 → DONE: 일정 확정
export type MeetingStage = 'VOTE' | 'PLACE' | 'DONE'
export type MemberRole = 'HOST' | 'MEMBER'

export interface Member {
  id: number
  name: string
  nickname: string
  role: MemberRole
}

// 날짜 투표를 연속된 날짜 범위로 확정한 일정
export interface Schedule {
  startDate: string
  endDate: string
}

export interface ConfirmedPlace {
  label: string
  memo: string | null
}

export interface Meeting {
  code: string
  title: string
  stage: MeetingStage
  candidateStart: string
  candidateEnd: string
  // 날짜 투표 마감 (ISO, UTC)
  voteDeadline: string
  createdAt: string
  members: Member[]
  me: Member | null
  confirmed: {
    schedule: Schedule | null
    place: ConfirmedPlace | null
  }
}

// 메인 캘린더/목록용 요약. startDate~endDate 가 확정 일정, 없으면 일정 미정(후보 기간만 있음)
export interface MeetingSummary {
  code: string
  title: string
  stage: MeetingStage
  candidateStart: string
  candidateEnd: string
  voteDeadline: string
  createdAt: string
  memberCount: number
  startDate: string | null
  endDate: string | null
  // 날짜 투표 중일 때 참여자가 제안한 날짜 (후보 기간 밖)
  proposals: { date: string; proposedBy: string }[]
}

export interface MemberProfile {
  name: string
  nickname: string
}

export interface CreateMeetingParams extends Partial<MemberProfile> {
  title: string
  // 날짜 투표 후보 기간 (YYYY-MM-DD)
  startDate: string
  endDate: string
  // 날짜 투표 마감 (ISO)
  voteDeadline: string
}

export const meetingController = {
  getList: () => httpClient.get<MeetingSummary[]>('/meetings'),
  // 회원이 만들면 회원 계정이 모임장(token 없음), 관리자가 만들면 입력한 이름/닉네임으로 모임장 토큰을 받는다
  create: (params: CreateMeetingParams) => {
    const userToken = getUserToken()
    const headers = { ...adminTokenConfig()?.headers, ...(userToken && { 'X-User-Token': userToken }) }
    return httpClient.post<{ code: string; token: string | null }>('/meetings', params, { headers })
  },
  // 모임장 또는 관리자: 날짜·기간 투표를 지금 마감 (최다 득표로 확정 → 장소 투표)
  closeVote: (code: string) =>
    httpClient.post(`/meetings/${code}/close-vote`, undefined, {
      headers: { ...memberTokenConfig(code)?.headers, ...adminTokenConfig()?.headers },
    }),
  // 모임장 또는 관리자
  remove: (code: string) =>
    httpClient.delete(`/meetings/${code}`, {
      headers: { ...memberTokenConfig(code)?.headers, ...adminTokenConfig()?.headers },
    }),
  getDetail: (code: string) => httpClient.get<Meeting>(`/meetings/${code}`, memberTokenConfig(code)),
  // 로그인한 회원으로 참여 (이름/닉네임은 회원 정보를 쓴다)
  join: (code: string) => httpClient.post(`/meetings/${code}/members`, undefined, memberTokenConfig(code)),
}
