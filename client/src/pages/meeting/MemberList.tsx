import type { Member } from '@src/api/controllers/meetingController'

export function MemberList({ members, meId }: { members: Member[]; meId: number | null }) {
  return (
    <section className="card">
      <h3>참여자 {members.length}명</h3>
      <ul className="flex flex-wrap gap-2">
        {members.map((member) => (
          <li key={member.id} className="chip" title={member.name ?? undefined}>
            {member.role === 'HOST' && <span aria-label="모임장">👑</span>}
            {member.nickname}
            {member.id === meId && <span className="chip-me">나</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
