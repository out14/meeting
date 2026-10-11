import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdmin } from '@src/api/hooks/useAdmin'
import { useUser } from '@src/api/hooks/useUser'
import { useCreateMeeting } from '@src/api/hooks/useMeeting'
import { getErrorMessage, HttpError } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { ProfileFields } from '@src/components/ProfileFields'
import { TextField } from '@src/components/TextField'
import { formatDeadline, toLocalInputValue } from '@src/utils/deadline'

const MAX_CANDIDATE_DAYS = 31

const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

// 투표 마감: 지금 이후 ~ 후보 시작일 0시 전까지 날짜·시간을 직접 입력한다 (내 시간대)
const isPast = (date: Date) => date.getTime() <= Date.now()
const nowInputValue = () => toLocalInputValue(new Date())
// 후보 시작 전날 23:59 (기본값)
const dayBeforeStart = (startDate: string) => {
  const date = new Date(`${startDate}T23:59`)
  date.setDate(date.getDate() - 1)
  return toLocalInputValue(date)
}
const deadlineError = (value: string, startDate: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '투표 마감 일시를 다시 입력해 주세요.'
  if (isPast(date)) return '투표 마감은 지금 이후로 입력해 주세요.'
  if (startDate && date >= new Date(`${startDate}T00:00`)) return '투표 마감은 후보 시작일 전으로 입력해 주세요.'
  return null
}

const daysBetween = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1

// 모임 생성 화면 (로그인한 회원 또는 관리자). 후보 기간 안의 모든 날짜가 날짜 투표 후보가 된다
// 회원은 본인 계정이 모임장이 되고, 관리자(회원 로그인 없이)는 모임장 이름/닉네임을 직접 입력한다
export function CreateMeetingPage() {
  const navigate = useNavigate()
  const { data: admin, isPending: isAdminPending } = useAdmin()
  const { data: user, isPending: isUserPending } = useUser()
  const createMeeting = useCreateMeeting()
  const [title, setTitle] = useState('')
  const [profile, setProfile] = useState({ name: '', nickname: '' })
  const [range, setRange] = useState({ startDate: '', endDate: '' })
  // 투표 마감 (datetime-local 값)
  const [deadlineInput, setDeadlineInput] = useState('')

  if (isAdminPending || isUserPending) return <p className="text-center">불러오는 중…</p>
  if (!admin && !user) return <Navigate to="/login?redirect=%2Fmeetings%2Fnew" replace />

  const days = range.startDate && range.endDate ? daysBetween(range.startDate, range.endDate) : 0
  const rangeError =
    range.startDate && range.endDate && days < 1
      ? '종료일은 시작일과 같거나 이후여야 해요.'
      : days > MAX_CANDIDATE_DAYS
        ? `후보 기간은 최대 ${MAX_CANDIDATE_DAYS}일까지 고를 수 있어요.`
        : null

  const changeStartDate = (startDate: string) => {
    // 시작일을 종료일 뒤로 옮기면 종료일도 같은 날로 맞춘다
    setRange(({ endDate }) => ({ startDate, endDate: endDate && endDate < startDate ? startDate : endDate }))
    // 마감을 아직 안 정했으면 시작 전날 23:59 로 채워 둔다 (지났으면 비워 둔다)
    setDeadlineInput((current) => {
      if (current || !startDate) return current
      const fallback = dayBeforeStart(startDate)
      return isPast(new Date(fallback)) ? '' : fallback
    })
  }

  const deadlineMessage = deadlineError(deadlineInput, range.startDate)
  const deadline = deadlineInput && !deadlineMessage ? new Date(deadlineInput) : null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (rangeError || !deadline) return
    // 화면을 띄워 둔 사이 마감이 지났을 수 있다
    if (isPast(deadline)) return setDeadlineInput('')
    createMeeting.mutate(
      { title, ...range, voteDeadline: deadline.toISOString(), ...(user ? {} : profile) },
      {
        // 만든 뒤에는 초대 링크를 알려주고 캘린더(메인)로 이동한다
        onSuccess: ({ code }) => {
          window.alert(`'${title}' 모임을 만들었어요.\n\n초대 링크: ${window.location.origin}/m/${code}\n\n캘린더에서 모임을 눌러 언제든 초대 링크를 다시 볼 수 있어요.`)
          navigate('/')
        },
      },
    )
  }

  // 로그인이 만료된 경우 서버가 401 을 돌려준다
  const isExpired = createMeeting.error instanceof HttpError && createMeeting.error.status === 401

  return (
    <section className="card mx-auto w-full max-w-md">
      <h2 className="mt-0">새 모임 만들기</h2>
      <p className="mb-6">모임을 만들고 초대 링크를 친구들에게 보내세요. 날짜는 투표로, 장소는 그다음에 정해요.</p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="모임명"
          placeholder="예) 2026 연말 정모"
          maxLength={100}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-2">날짜 투표 후보 기간</legend>
          <div className="date-range">
            <TextField
              label="시작일"
              type="date"
              min={today()}
              required
              value={range.startDate}
              onChange={(event) => changeStartDate(event.target.value)}
            />
            <span className="date-range-sep">~</span>
            <TextField
              label="종료일"
              type="date"
              min={range.startDate || today()}
              required
              value={range.endDate}
              onChange={(event) => setRange({ ...range, endDate: event.target.value })}
            />
          </div>
          {rangeError ? (
            <p className="error-text">{rangeError}</p>
          ) : (
            <p className="text-sm">
              {days > 0 ? `${days}일이 날짜 투표 후보로 등록되고, 모임장은 이 날짜들에 자동으로 투표돼요. (투표 화면에서 바꿀 수 있어요)` : '이 기간의 모든 날짜가 날짜 투표 후보가 돼요. (최대 31일)'}
            </p>
          )}
        </fieldset>
        <div className="flex flex-col gap-2">
          <TextField
            label="투표 마감 일시"
            type="datetime-local"
            required
            min={nowInputValue()}
            max={range.startDate ? `${range.startDate}T00:00` : undefined}
            value={deadlineInput}
            onChange={(event) => setDeadlineInput(event.target.value)}
          />
          {deadlineMessage ? (
            <p className="error-text">{deadlineMessage}</p>
          ) : (
            <p className="text-sm">
              {deadline && (
                <>
                  <b>{formatDeadline(deadline.toISOString())}</b>에 마감돼요.{' '}
                </>
              )}
              마감이 지나면 가장 많이 받은 날(같은 표를 받은 이어진 날 포함)로 일정이 자동 확정되고 장소 투표로
              넘어가요.
            </p>
          )}
        </div>
        {user ? (
          <p className="join-profile">
            <span className="font-medium text-[var(--text-h)]">{user.nickname}</span> ({user.name}) 님이 모임장이 돼요.
          </p>
        ) : (
          <>
            <p className="field-label -mb-2">모임장 정보</p>
            <ProfileFields value={profile} onChange={setProfile} />
          </>
        )}
        {createMeeting.isError && (
          <p className="error-text">
            {isExpired ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : getErrorMessage(createMeeting.error)}
          </p>
        )}
        <Button type="submit" disabled={createMeeting.isPending || !!rangeError || !deadline}>
          {createMeeting.isPending ? '만드는 중…' : '모임 만들기'}
        </Button>
      </form>
    </section>
  )
}
