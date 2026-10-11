import { adminTokenConfig } from '@src/api/adminToken'
import type { MeetingStage } from '@src/api/controllers/meetingController'
import { httpClient } from '@src/api/httpClient'

export interface AdminSession {
  username: string
  expiresAt: number
}

export interface AdminLoginParams {
  username: string
  password: string
}

export interface AdminUser {
  id: number
  username: string
  name: string
  nickname: string
  email: string | null
  mustChangePassword: boolean
  createdAt: string
  meetingCount: number
}

// 모임 관리 테이블 한 줄
export interface AdminMeeting {
  code: string
  title: string
  stage: MeetingStage
  candidateStart: string
  candidateEnd: string
  voteDeadline: string
  scheduleStart: string | null
  scheduleEnd: string | null
  createdAt: string
  hostNickname: string | null
  // 관리자가 만든 모임의 모임장은 회원 계정이 없다
  hostUsername: string | null
  memberCount: number
  dateVoterCount: number
  placeVoterCount: number
  // 확정된 장소 (시·도)
  place: string | null
  // 장소 투표가 동점으로 끝난 지역들
  placeTied: string[]
}

export const adminController = {
  login: (params: AdminLoginParams) => httpClient.post<{ token: string; expiresAt: number }>('/admin/login', params),
  getMe: () => httpClient.get<AdminSession>('/admin/me', adminTokenConfig()),
  getMeetings: () => httpClient.get<AdminMeeting[]>('/admin/meetings', adminTokenConfig()),
  // 선택한 모임 일괄 삭제
  deleteMeetings: (codes: string[]) =>
    httpClient.post<{ deleted: number }>('/admin/meetings/delete', { codes }, adminTokenConfig()),
  getUsers: () => httpClient.get<AdminUser[]>('/admin/users', adminTokenConfig()),
  resetPassword: (userId: number) =>
    httpClient.post<{ temporaryPassword: string }>(`/admin/users/${userId}/reset-password`, undefined, adminTokenConfig()),
}
