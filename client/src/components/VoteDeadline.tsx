import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import classNames from 'classnames'
import { formatDeadline, formatRemaining } from '@src/utils/deadline'

interface VoteDeadlineProps {
  deadline: string
  closed: boolean
  // 오른쪽에 붙일 동작 (모임장의 '지금 마감' 버튼 등)
  action?: ReactNode
  label?: string
}

// 투표 마감 일시 + 남은 시간 (30초마다 갱신). 날짜 투표 / 장소 투표 공용
export function VoteDeadline({ deadline, closed, action, label = '날짜 투표 마감' }: VoteDeadlineProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (closed) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [closed])

  const remaining = Date.parse(deadline) - now
  const isOver = closed || remaining <= 0

  return (
    <p className={classNames('deadline', { over: isOver, soon: !isOver && remaining < 86_400_000 })}>
      <span>
        ⏰ {label} {formatDeadline(deadline)}
      </span>
      <span className="deadline-side">
        <span className="deadline-remaining">{isOver ? '마감됨' : formatRemaining(remaining)}</span>
        {!isOver && action}
      </span>
    </p>
  )
}
