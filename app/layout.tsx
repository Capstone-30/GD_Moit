import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: { default: "캠퍼스 모임", template: "%s · 캠퍼스 모임" }, description: "같은 학교에서 공강을 맞추고, 모각공·커피챗·런치챗을 함께해요.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header className="site-header"><Link href="/" className="wordmark">캠퍼스 모임<span className="wordmark-dot" aria-hidden="true">.</span></Link><Link href="/profile" className="button">내 공강</Link></header>
    <main id="main" className="main" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><span>공강에 만나는 개발 동료</span><Link href="/privacy">개인정보 안내</Link></footer>
  </body></html>;
}
