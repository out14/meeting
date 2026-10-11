import { TextField } from '@src/components/TextField'
import type { MemberProfile } from '@src/api/controllers/meetingController'

interface ProfileFieldsProps {
  value: MemberProfile
  onChange: (value: MemberProfile) => void
}

// 모임 생성/참여 시 공통으로 받는 이름·닉네임 입력
export function ProfileFields({ value, onChange }: ProfileFieldsProps) {
  return (
    <>
      <TextField
        label="이름"
        placeholder="홍길동"
        maxLength={30}
        required
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
      />
      <TextField
        label="닉네임"
        placeholder="모임에서 보일 이름"
        maxLength={30}
        required
        value={value.nickname}
        onChange={(event) => onChange({ ...value, nickname: event.target.value })}
      />
    </>
  )
}
