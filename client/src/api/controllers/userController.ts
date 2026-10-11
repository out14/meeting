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

export interface VerifyResetParams {
  name: string
  email: string
}

export interface VerifyResetResult {
  resetToken: string
  expiresAt: number
  username: string
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
  votes: { date: MyVote[]; place: MyVote[] }
}

export interface MyMeetings {
  hosted: MyMeeting[]
  voted: MyMeeting[]
}

export const userController = {
  signup: (params: SignupParams) => httpClient.post<UserSession>('/users', params),
  login: (params: LoginParams) => httpClient.post<UserSession>('/users/login', params),
  getMe: () => httpClient.get<User>('/users/me', userTokenConfig()),
  changePassword: (params: ChangePasswordParams) =>
    httpClient.put<UserSession>('/users/me/password', params, userTokenConfig()),
  // 비밀번호 찾기: 이름 + 이메일 확인 → 재설정 토큰(10분) → 새 비밀번호
  verifyReset: (params: VerifyResetParams) => httpClient.post<VerifyResetResult>('/users/password-reset/verify', params),
  resetPassword: (params: ResetPasswordParams) => httpClient.post<UserSession>('/users/password-reset', params),
  getMyMeetings: () => httpClient.get<MyMeetings>('/users/me/meetings', userTokenConfig()),
}
