import { httpClient } from '@src/api/httpClient'
import { memberTokenConfig } from '@src/api/memberToken'

export type PollType = 'date' | 'place'

export interface PollOption {
  id: number
  label: string
  date: string | null
  // 장소 메모
  memo: string | null
  // 참여자가 제안한 날짜면 제안한 참여자 닉네임
  proposedBy: string | null
  count: number
  // 장소 투표에서는 투표자가 남긴 의견도 함께 온다
  voters: { id: number; nickname: string; comment?: string | null }[]
}

// 날짜: 연속 범위 (+ 장소 투표 마감) / 장소: 선택지 또는 시·도 이름 (장소 미정일 때 아무 시·도나)
export type ConfirmBody =
  | { startDate: string; endDate: string; placeDeadline?: string }
  | { optionId: number }
  | { region: string }

export interface Poll {
  id: number
  type: 'DATE' | 'PLACE'
  multiple: boolean
  status: 'OPEN' | 'CLOSED'
  confirmedOptionId: number | null
  voterCount: number
  options: PollOption[]
  myOptionIds: number[]
  // 장소 투표에 남긴 내 의견
  myComment: string | null
}

const pollPath = (code: string, type: PollType) => `/meetings/${code}/polls/${type}`

export const pollController = {
  getDetail: (code: string, type: PollType) => httpClient.get<Poll>(pollPath(code, type), memberTokenConfig(code)),
  // 장소 투표: 시·도 여러 곳 + 의견 하나 (내 장소 투표를 통째로 교체)
  votePlace: (code: string, body: { regions: string[]; comment: string }) =>
    httpClient.post<{ optionIds: number[] }>(`${pollPath(code, 'place')}/places`, body, memberTokenConfig(code)),
  // 날짜 투표를 날짜로 저장 (선택지에 없는 날짜는 내 제안 날짜로 추가된다)
  voteDates: (code: string, dates: string[]) =>
    httpClient.put(`${pollPath(code, 'date')}/votes`, { dates }, memberTokenConfig(code)),
  vote: (code: string, type: PollType, optionIds: number[]) =>
    httpClient.put(`${pollPath(code, type)}/votes`, { optionIds }, memberTokenConfig(code)),
  // 날짜: { startDate, endDate } 연속 범위 / 장소: { optionId }
  confirm: (code: string, type: PollType, body: ConfirmBody) =>
    httpClient.post(`${pollPath(code, type)}/confirm`, body, memberTokenConfig(code)),
}
