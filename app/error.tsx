"use client";
export default function ErrorPage() {
  return <section className="empty-state"><h1>잠시 연결이 끊겼어요.</h1><p role="alert">내용을 불러오지 못했습니다. 다시 시도해 주세요.</p><button className="button primary" onClick={() => window.location.reload()}>다시 시도</button><a className="text-link" href="/login">로그인 확인</a></section>;
}
