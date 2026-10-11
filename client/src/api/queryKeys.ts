import type { PollType } from '@src/api/controllers/pollController'

export const queryKeys = {
  admin: {
    me: ['admin', 'me'] as const,
    users: ['admin', 'users'] as const,
    meetings: ['admin', 'meetings'] as const,
  },
  user: {
    me: ['user', 'me'] as const,
    meetings: ['user', 'meetings'] as const,
  },
  meeting: {
    all: ['meeting'] as const,
    list: () => [...queryKeys.meeting.all, 'list'] as const,
    detail: (code: string) => [...queryKeys.meeting.all, 'detail', code] as const,
  },
  poll: {
    all: ['poll'] as const,
    detail: (code: string, type: PollType) => [...queryKeys.poll.all, 'detail', code, type] as const,
  },
}
