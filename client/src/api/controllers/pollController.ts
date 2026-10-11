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

export type ConfirmBody = { startDate: string; endDate: string } | { optionId: number }

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
  // 날짜 제안: 선택지로 추가하고 내 투표로 찍는다 (이미 있는 날짜는 기존 선택지에 투표)
  proposeDates: (code: string, range: { startDate: string; endDate?: string }) =>
    httpClient.post<{ optionIds: number[] }>(`${pollPath(code, 'date')}/options`, range, memberTokenConfig(code)),
  // 장소 투표: 시·도 여러 곳 + 의견 하나 (내 장소 투표를 통째로 교체)
  votePlace: (code: string, body: { regions: string[]; comment: string }) =>
    httpClient.post<{ optionIds: number[] }>(`${pollPath(code, 'place')}/places`, body, memberTokenConfig(code)),
  vote: (code: string, type: PollType, optionIds: number[]) =>
    httpClient.put(`${pollPath(code, type)}/votes`, { optionIds }, memberTokenConfig(code)),
  // 날짜: { startDate, endDate } 연속 범위 / 장소: { optionId }
  confirm: (code: string, type: PollType, body: ConfirmBody) =>
    httpClient.post(`${pollPath(code, type)}/confirm`, body, memberTokenConfig(code)),
}
