import type { MeetingStage, MemberRole } from '@src/api/controllers/meetingController'
import { httpClient } from '@src/api/httpClient'
import { userTokenConfig } from '@src/api/userToken'

export interface User {
  id: number
  username: string
  name: string
  nickname: string
  // 이메일 도입 전에 가입한 회원은 null
  email: string | null
  // 관리자가 임시 비밀번호를 발급한 상태
  mustChangePassword: boolean
}

export interface UserSession {
  token: string
  expiresAt: number
  user: User
}

export interface SignupParams {
  username: string
  name: string
  nickname: string
  email: string
  password: string
}

export type LoginParams = Pick<SignupParams, 'username' | 'password'>

export interface ChangePasswordParams {
  currentPassword: string
  newPassword: string
}

// 메일 속 재설정 링크가 아직 쓸 수 있으면 아이디와 만료 시각
export interface ResetLinkInfo {
  username: string
  expiresAt: number
}

export interface ResetPasswordParams {
  resetToken: string
  newPassword: string
}

export interface MyVote {
  label: string
  confirmed: boolean
}

export interface MyMeeting {
  code: string
  title: string
  stage: MeetingStage
  candidateStart: string
  candidateEnd: string
  createdAt: string
  role: MemberRole
  memberCount: number
  // 확정된 장소 (시·도)
  place: string | null
  votes: { date: MyVote[]; place: MyVote[] }
}

export interface MyMeetings {
  hosted: MyMeeting[]
  // 투표를 한 번이라도 한 모임 (내가 개설한 모임 포함)
  voted: MyMeeting[]
  // 참여자로 들어간 모임 (투표 여부와 상관없이)
  joined: MyMeeting[]
}

export const userController = {
  signup: (params: SignupParams) => httpClient.post<UserSession>('/users', params),
  login: (params: LoginParams) => httpClient.post<UserSession>('/users/login', params),
  getMe: () => httpClient.get<User>('/users/me', userTokenConfig()),
  changePassword: (params: ChangePasswordParams) =>
    httpClient.put<UserSession>('/users/me/password', params, userTokenConfig()),
  // 비밀번호 찾기: 가입 이메일로 재설정 링크(30분) 발송 → 링크 확인 → 새 비밀번호
  requestReset: (email: string) => httpClient.post<{ ok: true }>('/users/password-reset/request', { email }),
  checkReset: (resetToken: string) => httpClient.post<ResetLinkInfo>('/users/password-reset/check', { resetToken }),
  resetPassword: (params: ResetPasswordParams) => httpClient.post<UserSession>('/users/password-reset', params),
  getMyMeetings: () => httpClient.get<MyMeetings>('/users/me/meetings', userTokenConfig()),
  // 회원 탈퇴 (비밀번호 재확인). 개설한 모임은 함께 삭제된다
  withdraw: (password: string) =>
    httpClient.delete<{ ok: true; deletedMeetings: number }>('/users/me', { ...userTokenConfig(), data: { password } }),
}
