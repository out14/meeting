import classNames from "classnames";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { AdminMeeting } from "@src/api/controllers/adminController";
import {
  useAdmin,
  useAdminMeetings,
  useDeleteMeetings,
} from "@src/api/hooks/useAdmin";
import { useDeleteMeeting } from "@src/api/hooks/useMeeting";
import { getErrorMessage } from "@src/api/httpClient";
import { Button } from "@src/components/Button";
import { formatDeadline } from "@src/utils/deadline";
import { StatusTag } from "@src/components/StatusTag";
import {
  formatDay,
  MEETING_STATUSES,
  meetingStatus,
  placeText,
  STATUS_LABEL,
  type MeetingStatus,
} from "@src/utils/stage";


const formatRange = (start: string, end: string) =>
  start === end ? formatDay(start) : `${formatDay(start)} ~ ${formatDay(end)}`;

// 모임명·모임장 닉네임·모임장 아이디로 찾는다
const matches = (meeting: AdminMeeting, keyword: string) =>
  [meeting.title, meeting.hostNickname, meeting.hostUsername].some((value) =>
    value?.toLowerCase().includes(keyword),
  );

// 모임 관리 (관리자 전용): 모든 모임의 진행 상태를 표로 보고, 상세 화면으로 이동하거나 삭제한다 (한 건 / 선택 삭제)
export function AdminMeetingsPage() {
  const { data: admin, isPending: isAdminPending } = useAdmin();
  const meetings = useAdminMeetings(!!admin);
  const deleteMeeting = useDeleteMeeting();
  const deleteMeetings = useDeleteMeetings();
  // 체크한 모임 code
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<MeetingStatus | null>(null);
  const [keyword, setKeyword] = useState("");

  if (isAdminPending) return <p className="text-center">불러오는 중…</p>;
  if (!admin) return <Navigate to="/admin/login" replace />;

  const all = meetings.data ?? [];
  const search = keyword.trim().toLowerCase();
  const rows = all.filter(
    (meeting) =>
      (!status || meetingStatus(meeting) === status) &&
      (!search || matches(meeting, search)),
  );
  const countOf = (value: MeetingStatus) =>
    all.filter((meeting) => meetingStatus(meeting) === value).length;
  // 필터·검색으로 가려진 모임은 선택에 남아 있어도 지우지 않는다 (지금 보이는 것만)
  const selectedRows = rows.filter((meeting) => selected.has(meeting.code));
  const isAllSelected = rows.length > 0 && selectedRows.length === rows.length;
  const isDeleting = deleteMeeting.isPending || deleteMeetings.isPending;

  const toggle = (code: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const toggleAll = () =>
    setSelected(
      isAllSelected ? new Set() : new Set(rows.map((meeting) => meeting.code)),
    );

  const handleDeleteSelected = () => {
    if (!selectedRows.length) return;
    const titles = selectedRows
      .slice(0, 5)
      .map((meeting) => `- ${meeting.title}`);
    if (selectedRows.length > 5)
      titles.push(`… 외 ${selectedRows.length - 5}개`);
    const message = `선택한 모임 ${selectedRows.length}개를 삭제할까요?\n\n${titles.join("\n")}\n\n참여자와 모든 투표 기록이 함께 사라지고, 되돌릴 수 없어요.`;
    if (!window.confirm(message)) return;
    deleteMeetings.mutate(
      selectedRows.map((meeting) => meeting.code),
      {
        onSuccess: ({ deleted }) => {
          setSelected(new Set());
          window.alert(`모임 ${deleted}개를 삭제했어요.`);
        },
      },
    );
  };

  const handleDelete = (meeting: AdminMeeting) => {
    const message = `'${meeting.title}' 모임을 삭제할까요?\n참여자 ${meeting.memberCount}명과 모든 투표 기록이 함께 사라지고, 되돌릴 수 없어요.`;
    if (!window.confirm(message)) return;
    deleteMeeting.mutate(meeting.code, {
      onSuccess: () => {
        setSelected((current) => {
          const next = new Set(current);
          next.delete(meeting.code);
          return next;
        });
        window.alert(`'${meeting.title}' 모임을 삭제했어요.`);
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="card">
        <h2 className="mt-0">모임 관리</h2>
        <p>
          모든 모임의 진행 상태를 한눈에 볼 수 있어요. 모임명을 누르면 상세
          화면(읽기 전용)으로 이동해요.
        </p>
      </section>

      <section className="card flex flex-col gap-4">
        <div className="admin-toolbar">
          <div className="region-chips" role="group" aria-label="진행 상태">
            <button
              type="button"
              className={classNames("region-chip", { selected: !status })}
              aria-pressed={!status}
              onClick={() => setStatus(null)}
            >
              전체 <span className="region-chip-count">{all.length}</span>
            </button>
            {MEETING_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                className={classNames("region-chip", {
                  selected: status === value,
                })}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {STATUS_LABEL[value]}{" "}
                <span className="region-chip-count">{countOf(value)}</span>
              </button>
            ))}
          </div>
          <div className="admin-toolbar-actions">
            <Button
              className="btn-sm btn-danger"
              variant="secondary"
              disabled={!selectedRows.length || isDeleting}
              onClick={handleDeleteSelected}
            >
              {deleteMeetings.isPending
                ? "삭제하는 중…"
                : `선택 삭제${selectedRows.length ? ` (${selectedRows.length})` : ""}`}
            </Button>
            <input
              className="field-input admin-search"
              type="search"
              placeholder="모임명, 모임장 검색"
              aria-label="모임 검색"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
        </div>

        {deleteMeeting.isError && (
          <p className="error-text">{getErrorMessage(deleteMeeting.error)}</p>
        )}
        {deleteMeetings.isError && (
          <p className="error-text">{getErrorMessage(deleteMeetings.error)}</p>
        )}
        {meetings.isPending ? (
          <p>불러오는 중…</p>
        ) : meetings.isError ? (
          <p className="error-text">{getErrorMessage(meetings.error)}</p>
        ) : rows.length === 0 ? (
          <p className="empty">
            {all.length
              ? "조건에 맞는 모임이 없어요."
              : "아직 만든 모임이 없어요."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-check">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      checked={isAllSelected}
                      // 일부만 선택하면 '-' 표시
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            selectedRows.length > 0 && !isAllSelected;
                      }}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>모임명</th>
                  <th>상태</th>
                  <th>모임장</th>
                  <th>후보 기간</th>
                  <th>투표 마감</th>
                  <th>확정 일정</th>
                  <th>확정 장소</th>
                  <th className="text-right">참여자</th>
                  <th className="text-right">날짜 투표</th>
                  <th className="text-right">장소 투표</th>
                  <th>생성일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((meeting) => (
                  <tr
                    key={meeting.code}
                    className={classNames({
                      "row-selected": selected.has(meeting.code),
                    })}
                  >
                    <td className="table-check">
                      <input
                        type="checkbox"
                        aria-label={`${meeting.title} 선택`}
                        checked={selected.has(meeting.code)}
                        onChange={() => toggle(meeting.code)}
                      />
                    </td>
                    <td>
                      <Link
                        className="font-medium text-[var(--accent)]"
                        to={`/m/${meeting.code}`}
                      >
                        {meeting.title}
                      </Link>
                    </td>
                    <td>
                      <StatusTag status={meetingStatus(meeting)} />
                    </td>
                    <td>
                      {meeting.hostNickname ?? "-"}
                      {/* 관리자가 만든 모임의 모임장은 회원 계정이 없다 */}
                      <span className="text-sm">
                        {" "}
                        {meeting.hostUsername
                          ? `(${meeting.hostUsername})`
                          : "(비회원)"}
                      </span>
                    </td>
                    <td>
                      {formatRange(
                        meeting.candidateStart,
                        meeting.candidateEnd,
                      )}
                    </td>
                    <td>{formatDeadline(meeting.voteDeadline)}</td>
                    <td>
                      {meeting.scheduleStart && meeting.scheduleEnd
                        ? formatRange(
                            meeting.scheduleStart,
                            meeting.scheduleEnd,
                          )
                        : "-"}
                    </td>
                    <td>{placeText(meeting) ?? "-"}</td>
                    <td className="text-right">{meeting.memberCount}명</td>
                    <td className="text-right">{meeting.dateVoterCount}명</td>
                    <td className="text-right">
                      {meeting.stage === "VOTE"
                        ? "-"
                        : `${meeting.placeVoterCount}명`}
                    </td>
                    <td>{meeting.createdAt.slice(0, 10)}</td>
                    <td className="text-right">
                      <Button
                        className="btn-sm btn-danger"
                        variant="secondary"
                        disabled={isDeleting}
                        onClick={() => handleDelete(meeting)}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
