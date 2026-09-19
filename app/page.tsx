import Link from "next/link";
import { getMeetings, getProfile } from "@/lib/supabase";
import { kinds, slotLabel, type Kind } from "@/lib/domain";
import { RefreshButton } from "./components/forms";

export default async function Home({ searchParams }: { searchParams: Promise<{ kind?: string; topic?: string }> }) {
  const [profile, query] = await Promise.all([getProfile(), searchParams]);
  const all = await getMeetings();
  const filter = query.kind && Object.hasOwn(kinds, query.kind) ? query.kind as Kind : null;
  const topic = query.topic?.trim().toLocaleLowerCase() ?? "";
  const meetings = all.filter(meeting => (!filter || meeting.kind === filter) && (!topic || meeting.topic.toLocaleLowerCase().includes(topic)));
  return <>
    <div className="page-heading"><div><p className="school-label">{profile.settings.school_name} · {profile.settings.semester}</p><h1>비는 시간,<br />함께하는 시간.</h1><p className="lede">혼자 공부하던 공강에, 이야기 나눌 동료를 만나세요.</p></div><Link className="button primary" href={profile.registered ? "/meetings/new" : "/profile"}>모임 열기 <span aria-hidden="true">↗</span></Link></div>
    <div className="workspace">
      <aside className="availability-summary"><h2>내 공강</h2><p className="summary-number">{profile.registered ? profile.slots.length : "—"}<span> 교시</span></p>
        <p>{profile.registered ? "한 번 저장한 공강으로 모든 모임의 시간을 맞춰요." : "함께할 수 있는 시간을 먼저 알려주세요."}</p>
        <Link href="/profile" className="text-link">{profile.registered ? "공강 수정" : "공강 등록"} <span aria-hidden="true">→</span></Link>
      </aside>
      <section aria-labelledby="list-heading">
        <div className="section-heading"><h2 id="list-heading">함께할 모임 <span className="count">{meetings.length}</span></h2><RefreshButton /></div>
        <nav className="filters" aria-label="모임 유형"><Link href="/" aria-current={!filter ? "page" : undefined}>전체</Link>{Object.entries(kinds).map(([value, label]) => <Link href={`/?kind=${value}`} key={value} aria-current={filter === value ? "page" : undefined}>{label}</Link>)}</nav>
        <form className="inline-form" action="/"><label htmlFor="topic-filter">주제 찾기</label><input id="topic-filter" name="topic" defaultValue={query.topic ?? ""} /><button type="submit" className="button">검색</button></form>
        {meetings.length ? <ul className="meetings">{meetings.map(meeting => <li key={meeting.id} className="meeting-row">
          <div className="meeting-top"><span className="badge">{kinds[meeting.kind]}</span><span className="muted">{meeting.is_host ? "내가 연 모임" : meeting.joined ? "참여 중" : meeting.member_count >= meeting.capacity ? "모집 마감" : "모집 중"}</span></div>
          <h3>{meeting.topic}</h3><p className="meeting-meta">{meeting.place} · {meeting.member_count} / {meeting.capacity}명 <span aria-hidden="true">·</span> {meeting.confirmed_slot ? slotLabel(meeting.confirmed_slot) : "시간 미정"}</p>
          <div className="meeting-bottom"><p className={meeting.my_overlap.length ? "overlap" : "muted"}>{!profile.registered ? "공강을 등록하면 겹치는 시간을 볼 수 있어요" : meeting.my_overlap.length ? `내 공강과 ${meeting.my_overlap.length}교시 겹쳐요 · ${meeting.my_overlap.slice(0, 2).map(slotLabel).join(", ")}${meeting.my_overlap.length > 2 ? " 외" : ""}` : "내 공강과 겹치는 시간이 없어요"}</p><Link className="text-link" href={`/meetings/${meeting.id}`} aria-label={`${meeting.place} ${kinds[meeting.kind]} 상세 보기`}>상세 보기 <span aria-hidden="true">→</span></Link></div>
        </li>)}</ul> : <div className="empty-state"><span className="empty-mark" aria-hidden="true">+</span><h3>{filter ? `아직 ${kinds[filter]} 모임이 없어요` : "첫 모임을 기다리고 있어요"}</h3><p>장소와 인원을 정해 열어보세요.<br />시간은 함께 맞추면 돼요.</p><Link href={profile.registered ? "/meetings/new" : "/profile"} className="button">{profile.registered ? "첫 모임 열기" : "내 공강부터 등록"}</Link></div>}
      </section>
    </div>
  </>;
}
