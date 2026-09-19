import Link from "next/link";
import { notFound } from "next/navigation";
import { getComments, getMeetings, getProfile } from "@/lib/supabase";
import { isUuid, kinds, slotLabel } from "@/lib/domain";
import { AcceptForm, CommentForm, ConfirmForm, JoinForm, LeaveForm, MeetingAvailabilityForm, MemberControls, ProposalForm, RefreshButton, ReportForm } from "@/app/components/forms";
export const metadata = { title: "모임 상세" };
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, { id }] = await Promise.all([getProfile(), params]);
  if (!isUuid(id)) notFound();
  const [meeting] = await getMeetings(id);
  if (!meeting) notFound();
  const comments = meeting.joined ? await getComments(id) : [];
  return <>
    <Link href="/" className="text-link">← 모임 목록</Link>
    <div className="page-heading"><div><span className="badge">{kinds[meeting.kind]}</span><h1 className="place-title">{meeting.topic}</h1><p className="lede">{meeting.place} · {meeting.member_count} / {meeting.capacity}명 · {meeting.is_host ? "내가 연 모임" : meeting.joined ? "참여 중인 모임" : "함께할 동료를 만나세요"}</p></div><RefreshButton /></div>
    <div className="detail-grid"><section>
      <div className={meeting.confirmed_slot ? "time-banner confirmed" : "time-banner"}><span>{meeting.confirmed_slot ? "확정된 시간" : "아직 시간 미정"}</span><h2>{meeting.confirmed_slot ? `${meeting.meeting_date} · ${slotLabel(meeting.confirmed_slot)}` : "모두의 가능 시간을 맞추는 중이에요"}</h2><p>{meeting.confirmed_slot ? "가능 시간 변경으로 이 시간이 맞지 않게 되면 다시 조율합니다." : "개설자가 아래 교집합에서 시간을 정하면 여기에 표시돼요."}</p></div>
      {meeting.proposal && <section className="detail-section"><h2>대안 시간 제안</h2><p>{meeting.proposal.meeting_date} · {slotLabel(meeting.proposal.slot)} · {meeting.proposal.accepted_count}/{meeting.member_count}명 수락</p>{meeting.joined && !meeting.proposal.accepted && <AcceptForm id={id} />}</section>}
      <section className="detail-section"><h2>함께 가능한 시간</h2>{meeting.member_count < 2 ? <p className="muted">아직 개설자만 있어요. 참여자가 모이면 시간을 확정할 수 있습니다.</p> : null}
        {meeting.common_slots.length ? <><p className="muted">현재 참여자 모두의 공강이 {meeting.common_slots.length}교시 겹쳐요.</p><ul className="slot-list">{meeting.common_slots.map(slot => <li key={slot} className={slot === meeting.confirmed_slot ? "selected-time" : ""}>{slotLabel(slot)}{slot === meeting.confirmed_slot && " · 확정"}</li>)}</ul></> : <div className="notice"><p>모두 겹치는 공강이 아직 없어요.</p><p>내 공강이 맞게 등록되었는지 확인해 주세요.</p><Link href="/profile" className="text-link">내 공강 확인 →</Link></div>}
      </section>
      <section className="detail-section"><h2>함께하는 사람 <span className="count">{meeting.member_count}</span></h2><ul className="members">{meeting.members.map((member, index) => <li key={member.id}><span className="avatar" aria-hidden="true">{index + 1}</span><span>참여자 {index + 1}{member.is_me && " (나)"} · {member.department ?? "학과 미등록"} · {member.admission_year ?? "입학 연도 미등록"} · {member.interests.join(", ") || "관심 주제 미등록"}</span>{member.is_host && <span className="badge">개설자</span>}{!member.is_me && <MemberControls id={id} target={member.id} host={meeting.is_host} />}</li>)}</ul></section>
      {meeting.joined && <section className="detail-section"><MeetingAvailabilityForm id={id} settings={profile.settings} slots={meeting.my_slots} />{!meeting.is_host && <LeaveForm id={id} />}</section>}
      {meeting.joined && <section className="detail-section"><h2>모임 코멘트</h2><p className="help">참여자만 볼 수 있습니다. 새 코멘트는 새로고침으로 확인하세요.</p>{comments.length ? <ul>{comments.map(comment => <li key={comment.id}><strong>{comment.mine ? "나" : comment.author}</strong> · <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("ko-KR")}</time><p>{comment.body}</p></li>)}</ul> : <p>아직 코멘트가 없습니다.</p>}<CommentForm id={id} /></section>}
      <section className="detail-section"><details><summary>이 모임 신고</summary><ReportForm meeting={id} /></details></section>
    </section><aside className="action-panel"><h2>{meeting.is_host ? "모임 시간 정하기" : meeting.joined ? "함께하기로 했어요" : "이 모임에 함께할까요?"}</h2>
      {meeting.is_host ? meeting.member_count >= 2 && meeting.common_slots.length ? <ConfirmForm id={id} slots={meeting.common_slots} confirmed={meeting.confirmed_slot} /> : meeting.member_count >= 2 ? <><p>교집합이 없습니다. 대안 시간을 제안하고 모든 참여자의 수락을 받으세요.</p><ProposalForm id={id} settings={profile.settings} /></> : <p>참여자가 2명 이상이면 시간을 확정할 수 있어요.</p>
        : meeting.joined ? <p>{meeting.confirmed_slot ? "위의 확정 시간과 장소에서 만나요." : "개설자가 시간을 정하면 이 화면에서 확인할 수 있어요."}</p>
        : !profile.registered ? <><p>이름과 공강을 먼저 알려주세요.</p><Link href="/profile" className="button primary">공강 등록</Link></>
        : meeting.proposal ? <p>대안 시간 수락 중에는 새 참여를 받을 수 없습니다.</p>
        : meeting.member_count >= meeting.capacity ? <><p>정원이 모두 찼어요.</p><Link href="/" className="button">다른 모임 보기</Link></>
        : meeting.confirmed_slot && !meeting.my_overlap.length ? <><p>확정 시간과 내 공강이 겹치지 않아요.</p><Link href="/profile" className="button">내 공강 확인</Link></>
        : <><p>{meeting.my_overlap.length ? `내 공강과 ${meeting.my_overlap.length}교시 겹쳐요.` : "참여할 수 있지만, 내 공강과 겹치는 시간이 없어 바로 확정하기는 어려워요."}</p><JoinForm id={id} /></>}
      <p className="help">교집합은 공강 수정과 새 참여에 따라 달라집니다. 새로고침으로 최신 상태를 확인하세요.</p>
    </aside></div>
  </>;
}
