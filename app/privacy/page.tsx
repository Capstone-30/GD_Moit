import Link from "next/link";
import { getSettings } from "@/lib/supabase";
export const metadata = { title: "개인정보 안내" };
export default async function PrivacyPage() {
  const settings = await getSettings();
  return <article className="narrow prose"><Link href="/" className="text-link">← 처음으로</Link><h1>개인정보 안내</h1><p>같은 학교인지 확인하고, 함께할 시간을 맞추기 위한 정보만 받습니다.</p>
    <h2>수집 항목과 사용 목적</h2><dl><dt>학교 이메일</dt><dd>학교 인증과 로그인에 사용합니다. 다른 학생에게 공개하지 않습니다.</dd><dt>표시 이름</dt><dd>본인 프로필 관리에 사용하며 다른 학생에게 공개하지 않습니다.</dd><dt>학과·입학 연도·관심 주제</dt><dd>모임 참여자 프로필에 공개합니다. 등록하지 않아도 됩니다.</dd><dt>학기별 가능 시간·모임별 예외</dt><dd>모임의 겹치는 시간을 계산합니다. 다른 학생에게 개별 시간표를 보여주지 않습니다.</dd><dt>개설·참여 기록과 시간 수락</dt><dd>모집 인원, 개설자 권한과 모임 시간을 관리합니다.</dd><dt>코멘트</dt><dd>모임 연락에 사용하며 현재 참여자에게만 공개합니다.</dd><dt>신고·차단 기록</dt><dd>안전 조치와 개설 제한에 사용하며 다른 학생에게 공개하지 않습니다.</dd></dl>
    <h2>보관 기간</h2><p className="policy-text">{settings?.retention_policy ?? "운영자의 보관 정책이 아직 확정되지 않았습니다. 정책 설정이 끝나기 전에는 가입을 받지 않습니다."}</p>
    <h2>내 정보 삭제</h2><p>내 가능 시간 화면의 ‘회원 탈퇴’에서 계정, 가능 시간, 코멘트, 신고·차단 기록과 참여 정보를 삭제할 수 있습니다. 내가 연 모임도 삭제됩니다. 다른 사람이 작성한 신고는 대상 계정 삭제 시 함께 제거됩니다.</p><Link href="/profile" className="button">내 가능 시간으로 이동</Link>
    <h2>로그인 쿠키</h2><p>로그인을 유지하기 위한 쿠키를 사용합니다. 로그아웃하면 이 브라우저의 로그인 정보를 지웁니다.</p>
  </article>;
}
