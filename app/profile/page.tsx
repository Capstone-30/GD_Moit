import Link from "next/link";
import { getProfile } from "@/lib/supabase";
import { AccountControls, ProfileForm } from "../components/forms";
export const metadata = { title: "내 공강" };
export default async function ProfilePage() {
  const profile = await getProfile();
  return <><Link className="text-link" href="/">← 모임 목록</Link><div className="page-heading"><div><p className="school-label">{profile.settings.semester}</p><h1>나의 비는 시간.</h1><p className="lede">한 번 등록하면 모든 모임에서 함께 쓸 수 있어요.</p></div></div>
    <ProfileForm settings={profile.settings} name={profile.name} slots={profile.slots} department={profile.department} admissionYear={profile.admissionYear} interests={profile.interests} />
    <Link href="/" className="button">모임 둘러보기 →</Link><AccountControls />
  </>;
}
