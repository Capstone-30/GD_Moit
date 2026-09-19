import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings, getUser } from "@/lib/supabase";
import { LoginForm } from "../components/forms";
export const metadata = { title: "학교 이메일로 시작하기" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const settings = await getSettings();
  if (settings && await getUser()) redirect("/");
  const query = await searchParams;
  return <div className="auth-layout">
    <section className="auth-intro"><p className="school-label">{settings?.school_name ?? "같은 학교, 같은 관심사"}</p><h1>공강 하나로<br />이어지는 사이.</h1><p className="lede">모각공부터 커피 한 잔까지.<br />함께할 수 있는 시간을 찾아요.</p>
      <div className="intro-types"><span>모각공</span><span>커피챗</span><span>런치챗</span></div><p className="intro-note">공강은 한 번만 등록하고,<br />새로운 모임에서도 그대로 사용하세요.</p>
    </section>
    <section className="auth-panel" aria-labelledby="login-heading"><h2 id="login-heading">학교 이메일로 시작하기</h2>
      {query.deleted === "1" && <p role="status" className="success-message">계정과 내 데이터를 삭제했습니다.</p>}
      {settings ? <><p className="muted">가입과 로그인을 한 번에. 비밀번호는 필요 없어요.</p><LoginForm settings={settings} /></> : <div className="setup-state"><span className="badge">준비 중</span><h3>학교 모임을 준비하고 있어요</h3><p>학교 인증과 개인정보 안내 설정이 끝나면 가입할 수 있습니다.</p><Link href="/login" className="button">다시 확인</Link></div>}
    </section>
  </div>;
}
