import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@src/api/queryKeys'

// 모임·투표 데이터가 바뀌었을 때 (생성, 참여, 투표, 취소, 마감, 확정, 날짜 수정 등)
// 이 데이터가 보이는 모든 화면을 다시 불러온다: 캘린더·모임 화면(meeting), 투표(poll), 마이페이지, 관리자 모임 관리
// 새 기능에서 모임·투표를 바꾸면 이 함수를 부른다
export const refreshMeetingData = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.meeting.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.poll.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.user.meetings }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.meetings }),
  ])

// 회원 로그인 사용자가 바뀌었을 때 (로그인, 로그아웃, 세션 만료, 비밀번호 재설정 후 로그인)
// 이전 사용자의 마이페이지 목록은 지우고(다른 사람 화면에 잠깐이라도 보이지 않게), "내 참여 정보"가 담긴 모임·투표는 다시 불러온다
export const resetUserData = (queryClient: QueryClient) => {
  queryClient.removeQueries({ queryKey: queryKeys.user.meetings })
  return refreshMeetingData(queryClient)
}

// 관리자 로그인 상태가 바뀌었을 때: 관리자 전용 목록은 지우고, 관리자에게만 보이는 정보(실명 등)가 담긴 모임은 다시 불러온다
export const resetAdminData = (queryClient: QueryClient) => {
  queryClient.removeQueries({ queryKey: queryKeys.admin.users })
  queryClient.removeQueries({ queryKey: queryKeys.admin.meetings })
  return refreshMeetingData(queryClient)
}
