import classNames from "classnames";
import { Link } from "react-router-dom";
import type { PollType } from "@src/api/controllers/pollController";
import type { MyMeeting, MyVote } from "@src/api/controllers/userController";
import { useCancelVote } from "@src/api/hooks/usePoll";
import { getErrorMessage } from "@src/api/httpClient";
import { Button } from "@src/components/Button";
import { StatusTag } from "@src/components/StatusTag";
import { formatDay, meetingStatus } from "@src/utils/stage";

function VoteChips({ label, votes }: { label: string; votes: MyVote[] }) {
  if (!votes.length) return null;
  return (
    <div className="my-votes">
      <span className="my-votes-label">{label}</span>
      {votes.map((vote) => (
        <span
          key={vote.label}
          className={classNames("chip chip-sm", {
            "chip-confirmed": vote.confirmed,
          })}
        >
          {vote.label}
          {vote.confirmed && " ✓"}
        </span>
      ))}
    </div>
  );
}

// 지금 취소할 수 있는 내 투표: 진행 중인 투표에 내 표가 있을 때만
// 모임장의 날짜 표는 곧 후보 날짜라 취소할 수 없다 (모임 화면에서 후보 날짜를 수정)
function cancellableVote(
  meeting: MyMeeting,
): { type: PollType; label: string } | null {
  if (
    meeting.stage === "VOTE" &&
    meeting.votes.date.length &&
    meeting.role !== "HOST"
  )
    return { type: "date", label: "날짜" };
  if (meeting.stage === "PLACE" && meeting.votes.place.length)
    return { type: "place", label: "장소" };
  return null;
}

interface MyMeetingListProps {
  title: string;
  meetings: MyMeeting[];
  emptyText: string;
  // 내가 참여한 투표 목록에서는 내 선택을 보여준다
  showVotes?: boolean;
}

export function MyMeetingList({
  title,
  meetings,
  emptyText,
  showVotes = false,
}: MyMeetingListProps) {
  const cancelVote = useCancelVote();

  const handleCancel = (
    meeting: MyMeeting,
    vote: { type: PollType; label: string },
  ) => {
    const message = `'${meeting.title}' 모임의 ${vote.label} 투표를 취소할까요?\n내가 고른 ${vote.label}${vote.type === "place" ? "와 남긴 의견" : ""}이 모두 투표에서 빠져요.`;
    if (!window.confirm(message)) return;
    cancelVote.mutate(
      { code: meeting.code, type: vote.type },
      {
        onSuccess: () =>
          window.alert(
            `'${meeting.title}' 모임의 ${vote.label} 투표를 취소했어요.`,
          ),
        onError: (error) => window.alert(getErrorMessage(error)),
      },
    );
  };

  return (
    <section className="card">
      <h3>
        {title} <span className="text-sm font-normal">{meetings.length}개</span>
      </h3>
      {meetings.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((meeting) => {
            const vote = showVotes ? cancellableVote(meeting) : null;
            return (
              <li key={meeting.code} className="meeting-item-wrap">
                <Link
                  to={`/m/${meeting.code}`}
                  className={classNames("meeting-item", { "has-action": vote })}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-h)]">
                      {meeting.title}
                    </span>
                    <StatusTag status={meetingStatus(meeting)} />
                  </span>
                  <span className="text-sm">
                    후보 기간 {formatDay(meeting.candidateStart)} ~{" "}
                    {formatDay(meeting.candidateEnd)} · 참여자{" "}
                    {meeting.memberCount}명
                  </span>
                  {showVotes && (
                    <>
                      <VoteChips
                        label="내가 고른 날짜"
                        votes={meeting.votes.date}
                      />
                      <VoteChips
                        label="내가 고른 장소"
                        votes={meeting.votes.place}
                      />
                    </>
                  )}
                </Link>
                {/* 카드 링크 안에 버튼을 넣을 수 없어 카드 위에 겹쳐 둔다 */}
                {vote && (
                  <Button
                    className="btn-sm meeting-item-action"
                    variant="secondary"
                    disabled={cancelVote.isPending}
                    onClick={() => handleCancel(meeting, vote)}
                  >
                    투표 취소
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
