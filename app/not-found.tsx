import Link from "next/link";
export default function NotFound() {
  return <section className="empty-state"><h1>모임을 찾지 못했어요.</h1><p>모임이 삭제되었거나 주소가 잘못되었을 수 있어요.</p><Link className="button primary" href="/">모임 목록으로</Link></section>;
}
