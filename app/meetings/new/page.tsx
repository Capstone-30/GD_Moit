import Link from "next/link";
import { getProfile } from "@/lib/supabase";
import { CreateMeetingForm } from "@/app/components/forms";
export const metadata = { title: "모임 열기" };
export default async function NewMeetingPage() {
  const profile = await getProfile();
  return <div className="narrow"><Link href="/" className="text-link">← 모임 목록</Link><div className="page-heading"><div><h1>같이할 사람을<br />만나보세요.</h1><p className="lede">장소와 인원만 정하면, 시간은 함께 맞춰요.</p></div></div>
    {profile.registered ? profile.settings.public_places.length ? <CreateMeetingForm places={profile.settings.public_places} /> : <div className="empty-state"><h2>공개 장소를 준비 중입니다</h2><p>운영 장소가 등록되면 모임을 열 수 있습니다.</p></div> : <div className="empty-state"><h2>가능 시간을 먼저 등록해 주세요</h2><p>프로필과 가능 시간이 있어야 모임을 열 수 있어요.</p><Link href="/profile" className="button primary">가능 시간 등록</Link></div>}
  </div>;
}
