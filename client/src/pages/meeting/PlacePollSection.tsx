import { useState } from 'react'
import classNames from 'classnames'
import { useNavigate } from 'react-router-dom'
import type { MeetingStage } from '@src/api/controllers/meetingController'
import type { PollOption } from '@src/api/controllers/pollController'
import { getErrorMessage } from '@src/api/httpClient'
import { useConfirmPoll, usePoll, useVotePlace } from '@src/api/hooks/usePoll'
import { Button } from '@src/components/Button'
import { RegionMap } from '@src/pages/meeting/RegionMap'
import { REGIONS, type RegionName } from '@src/utils/regions'

interface PlacePollSectionProps {
  code: string
  stage: MeetingStage
  isHost: boolean
  // 참여자만 투표할 수 있다 (관리자는 보기만)
  canParticipate: boolean
}

const MAX_COMMENT = 300
const ALL_REGIONS = REGIONS.map((region) => region.name)

// 장소 투표: 지도에서 시·도를 여러 곳 골라 투표하고 의견을 하나 남긴다. 모임장이 결과를 보고 한 곳으로 확정한다
export function PlacePollSection({ code, stage, isHost, canParticipate }: PlacePollSectionProps) {
  const navigate = useNavigate()
  const { data: poll, isPending, isError } = usePoll(code, 'place')
  const votePlace = useVotePlace(code)
  const confirmPoll = useConfirmPoll(code, 'place')
  // 사용자가 손대기 전에는 서버에 저장된 내 투표를 보여준다
  const [draft, setDraft] = useState<{ regions: RegionName[]; comment: string } | null>(null)

  // 장소 투표가 생기기 전에 확정된 모임에는 장소 투표가 없다
  if (isError) return null

  const options = poll?.options ?? []
  const canVote = canParticipate && stage === 'PLACE' && poll?.status === 'OPEN'
  const hasVoted = !!poll?.myOptionIds.length
  const saved = {
    regions: options.filter((option) => poll?.myOptionIds.includes(option.id)).map((option) => option.label as RegionName),
    comment: poll?.myComment ?? '',
  }
  const current = draft ?? saved
  const isAll = current.regions.length === ALL_REGIONS.length
  const counts = Object.fromEntries(options.map((option) => [option.label, option.count])) as Partial<Record<RegionName, number>>
  const confirmed = options.find((option) => option.id === poll?.confirmedOptionId)?.label ?? null
  const ranked = options
    .filter((option) => option.count > 0 || option.label === confirmed)
    .sort((a, b) => b.count - a.count || ALL_REGIONS.indexOf(a.label as RegionName) - ALL_REGIONS.indexOf(b.label as RegionName))
  const maxCount = Math.max(0, ...options.map((option) => option.count))
  // 의견은 한 사람에 하나: 투표자별로 모아 보여준다
  const comments = [
    ...new Map(
      options.flatMap((option) => option.voters).filter((voter) => voter.comment).map((voter) => [voter.id, voter]),
    ).values(),
  ]

  const toggle = (region: RegionName) =>
    setDraft({
      ...current,
      regions: current.regions.includes(region)
        ? current.regions.filter((name) => name !== region)
        : [...current.regions, region],
    })
  const toggleAll = () => setDraft({ ...current, regions: isAll ? [] : [...ALL_REGIONS] })

  // 저장하면 알림 후 캘린더(메인)로 이동한다
  const handleVote = () => {
    votePlace.mutate(
      { regions: current.regions, comment: current.comment },
      {
        onSuccess: () => {
          setDraft(null)
          window.alert(hasVoted ? '장소 투표를 수정했어요.' : `${isAll ? '전체 지역' : current.regions.join(', ')}에 투표했어요.`)
          navigate('/')
        },
      },
    )
  }

  const handleConfirm = (option: PollOption) => {
    if (!window.confirm(`'${option.label}'(으)로 장소를 확정할까요? 확정하면 최종 일정이 완성돼요.`)) return
    confirmPoll.mutate({ optionId: option.id })
  }

  return (
    <section className="card">
      <h3>📍 장소 투표</h3>
      {canVote && (
        <p className="mb-4">
          지도에서 가고 싶은 시·도를 눌러 골라 주세요. <b>여러 곳</b>을 고를 수 있고, 어디든 좋으면 '전체'를 누르세요.
          {isHost && ' 결과를 보고 한 곳으로 확정하면 일정이 완성돼요.'}
        </p>
      )}
      {isPending || !poll ? (
        <p>불러오는 중…</p>
      ) : (
        <div className="place-vote">
          <RegionMap counts={counts} selected={current.regions} confirmed={confirmed} disabled={!canVote} onToggle={toggle} />

          <div className="flex flex-col gap-3">
            {/* 작은 시·도(서울, 세종 등)는 지도에서 누르기 어려워 버튼으로도 고를 수 있다 */}
            <div className="region-chips" role="group" aria-label="시·도 선택">
              <button
                type="button"
                className={classNames('region-chip region-chip-all', { selected: isAll })}
                disabled={!canVote}
                aria-pressed={isAll}
                onClick={toggleAll}
              >
                전체
              </button>
              {ALL_REGIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={classNames('region-chip', {
                    selected: current.regions.includes(name),
                    confirmed: name === confirmed,
                  })}
                  disabled={!canVote}
                  aria-pressed={current.regions.includes(name)}
                  // 화면 읽기에서 '서울1' 이 아니라 '서울 1표' 로 읽히게
                  aria-label={counts[name] ? `${name} ${counts[name]}표` : name}
                  onClick={() => toggle(name)}
                >
                  {name}
                  {counts[name] ? <span className="region-chip-count">{counts[name]}</span> : null}
                </button>
              ))}
            </div>

            {canVote && (
              <>
                <label className="field">
                  <span className="field-label">의견 (선택)</span>
                  <textarea
                    className="field-input field-textarea"
                    maxLength={MAX_COMMENT}
                    placeholder="예) 바다 보면서 쉬고 싶어요. 1인 10만원 이하면 좋겠어요."
                    value={current.comment}
                    onChange={(event) => setDraft({ ...current, comment: event.target.value })}
                  />
                </label>
                <div className="flex items-center justify-end gap-2">
                  <span className="mr-auto text-sm">
                    {isAll ? '전체 선택' : `${current.regions.length}곳 선택`} · {current.comment.length}/{MAX_COMMENT}
                  </span>
                  <Button disabled={!current.regions.length || votePlace.isPending} onClick={handleVote}>
                    {hasVoted ? '투표 수정' : '투표하기'}
                  </Button>
                </div>
                {votePlace.isError && <p className="error-text">{getErrorMessage(votePlace.error)}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {poll && (
        <>
          <p className="field-label mt-4 mb-2">투표 결과 · 참여 {poll.voterCount}명</p>
          {ranked.length === 0 ? (
            <p className="empty">아직 아무도 투표하지 않았어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ranked.map((option) => {
                const isConfirmed = option.label === confirmed
                return (
                  <li
                    key={option.id}
                    className={classNames('poll-option', {
                      top: poll.status === 'OPEN' && option.count === maxCount,
                      confirmed: isConfirmed,
                    })}
                  >
                    <div className="flex-1">
                      <span className="font-medium text-[var(--text-h)]">{option.label}</span>
                      {isConfirmed && <span className="badge ml-2">확정</span>}
                      <span className="poll-bar">
                        <span style={{ width: `${(option.count / Math.max(poll.voterCount, 1)) * 100}%` }} />
                      </span>
                      <span className="text-sm">
                        {option.count}명 · {option.voters.map((voter) => voter.nickname).join(', ')}
                      </span>
                    </div>
                    {canVote && isHost && (
                      <Button variant="secondary" disabled={confirmPoll.isPending} onClick={() => handleConfirm(option)}>
                        확정
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {confirmPoll.isError && <p className="error-text">{getErrorMessage(confirmPoll.error)}</p>}

          {comments.length > 0 && (
            <>
              <p className="field-label mt-4 mb-2">의견</p>
              <ul className="place-comments">
                {comments.map((voter) => (
                  <li key={voter.id}>
                    <b>{voter.nickname}</b>
                    <p>{voter.comment}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
