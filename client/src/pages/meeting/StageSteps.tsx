import classNames from 'classnames'
import type { MeetingStage } from '@src/api/controllers/meetingController'

const STEPS: { stage: MeetingStage; label: string }[] = [
  { stage: 'VOTE', label: '날짜 투표' },
  { stage: 'PLACE', label: '장소 투표' },
  { stage: 'DONE', label: '일정 확정' },
]

export function StageSteps({ stage }: { stage: MeetingStage }) {
  const current = STEPS.findIndex((step) => step.stage === stage)

  return (
    <ol className="steps">
      {STEPS.map((step, index) => (
        <li key={step.stage} className={classNames('step', { done: index < current, current: index === current })}>
          <span className="step-index">{index < current ? '✓' : index + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  )
}
