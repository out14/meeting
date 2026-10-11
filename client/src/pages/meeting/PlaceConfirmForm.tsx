import { useState } from 'react'
import type { PollOption } from '@src/api/controllers/pollController'
import { useConfirmPoll } from '@src/api/hooks/usePoll'
import { getErrorMessage } from '@src/api/httpClient'
import { Button } from '@src/components/Button'
import { REGIONS } from '@src/utils/regions'

interface PlaceConfirmFormProps {
  code: string
  // 표를 받은 지역 (많이 받은 순)
  ranked: PollOption[]
  // 마감 결과 동점인 지역들 (있으면 이 중에서 먼저 고르게)
  tied: string[]
}

// 모임장: 장소 투표 결과를 보고 한 곳으로 확정한다 → 일정 확정
// 날짜 '일정 확정하기'와 같은 모양. 표를 받지 않은 시·도도 고를 수 있다 (장소 미정일 때 등)
export function PlaceConfirmForm({ code, ranked, tied }: PlaceConfirmFormProps) {
  const confirmPoll = useConfirmPoll(code, 'place')
  const voted = ranked.map((option) => option.label)
  const others = REGIONS.map((region) => region.name).filter((name) => !voted.includes(name))
  const [region, setRegion] = useState(tied[0] ?? voted[0] ?? others[0])
  const countOf = (name: string) => ranked.find((option) => option.label === name)?.count ?? 0

  const handleConfirm = async () => {
    if (!window.confirm(`'${region}'(으)로 장소를 확정할까요? 확정하면 최종 일정이 완성돼요.`)) return
    // 확정되면 이 폼이 사라지므로(언마운트) mutate 콜백 대신 promise 로 알린다
    try {
      await confirmPoll.mutateAsync({ region })
      window.alert(`장소를 '${region}'(으)로 확정했어요.`)
    } catch {
      // 에러는 confirmPoll.error 로 표시된다
    }
  }

  return (
    <div className="proposal-form mt-4">
      <p className="field-label">장소 확정하기 (모임장)</p>
      <p className="text-sm">
        {tied.length
          ? '동점인 지역 중 한 곳을 골라 확정해 주세요.'
          : '결과를 보고 한 곳으로 확정해요. 마감 전에 확정하면 장소 투표가 바로 끝나요.'}
      </p>
      <label className="field">
        <span className="field-label">확정할 시·도</span>
        <select className="field-input" value={region} onChange={(event) => setRegion(event.target.value)}>
          {voted.length > 0 && (
            <optgroup label="투표 결과">
              {voted.map((name) => (
                <option key={name} value={name}>
                  {name} · {countOf(name)}명{tied.includes(name) ? ' (동점)' : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={voted.length ? '그 밖의 지역' : '시·도'}>
            {others.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {confirmPoll.isError && <p className="error-text">{getErrorMessage(confirmPoll.error)}</p>}
      <div className="flex justify-end">
        <Button disabled={confirmPoll.isPending} onClick={handleConfirm}>
          {confirmPoll.isPending ? '확정하는 중…' : '이 장소로 확정'}
        </Button>
      </div>
    </div>
  )
}
