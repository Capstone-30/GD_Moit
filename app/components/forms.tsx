"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { acceptTime, addComment, blockUser, confirmMeeting, createMeeting, deleteAccount, joinMeeting, leaveMeeting, login, logout, proposeTime, removeMember, reportProblem, saveMeetingAvailability, saveProfile } from "@/app/actions";
import { kinds, slotLabel, weekdays, type ActionState, type Settings } from "@/lib/domain";

function Feedback({ state }: { state: ActionState }) {
  return <div className="feedback" aria-live="polite" aria-atomic="true">
    {state.error ? <p className="error-message" role="alert">{state.error}</p> : state.success ? <p className="success-message">{state.success}</p> : null}
  </div>;
}
function Submit({ pending, children, danger = false }: { pending: boolean; children: React.ReactNode; danger?: boolean }) {
  return <button type="submit" className={danger ? "button danger" : "button primary"} disabled={pending} aria-busy={pending}>{pending ? "처리 중…" : children}</button>;
}
export function LoginForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(login, {});
  return <div>
    {state.email ? <>
      <form action={action} onReset={event => event.preventDefault()} className="stack">
        <p><strong className="break-word">{state.email}</strong>로 보낸 번호를 입력해 주세요.</p>
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="intent" value="verify" />
        <label htmlFor="token">이메일 인증번호</label>
        <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
        <Submit pending={pending}>인증하고 시작하기</Submit>
      </form>
      <form action={action} className="inline-form">
        <input type="hidden" name="email" value={state.email} /><input type="hidden" name="consent" value="yes" />
        <button className="text-button" disabled={pending}>인증번호 다시 받기</button>
        <a className="text-link" href="/login">다른 이메일 사용</a>
      </form>
    </> : <form action={action} onReset={event => event.preventDefault()} className="stack">
      <label htmlFor="email">학교 이메일</label>
      <input id="email" name="email" type="email" autoComplete="email" placeholder={`name@${settings.email_domain}`} maxLength={254} required aria-describedby="email-help" />
      <p id="email-help" className="help">@{settings.email_domain} 주소로 인증번호를 보내드려요.</p>
      <label className="check-line"><input name="consent" type="checkbox" value="yes" required /><span><a href="/privacy" target="_blank" rel="noreferrer">개인정보 수집·이용 안내</a>를 확인하고 동의합니다.</span></label>
      <Submit pending={pending}>인증번호 받기</Submit>
    </form>}
    <Feedback state={state} />
  </div>;
}

export function ProfileForm({ settings, name, slots, department, admissionYear, interests }: { settings: Settings; name: string; slots: number[]; department: string; admissionYear: number | string; interests: string[] }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const [selected, setSelected] = useState(slots);
  const [displayName, setDisplayName] = useState(name);
  const initial = JSON.stringify([name, slots, department, String(admissionYear), interests.join(", ")]);
  const [saved, setSaved] = useState(initial);
  const submitted = useRef(initial);
  const [details, setDetails] = useState({ department, admissionYear: String(admissionYear), interests: interests.join(", ") });
  const dirty = JSON.stringify([displayName, selected, details.department, details.admissionYear, details.interests]) !== saved;
  useEffect(() => { if (state.success) setSaved(submitted.current); }, [state]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const beforeNavigate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && target.getAttribute("target") !== "_blank" && !window.confirm("저장하지 않은 공강이 있습니다. 나가시겠어요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeNavigate, true); };
  }, [dirty]);
  return <form action={action} onReset={event => event.preventDefault()} onSubmit={() => { submitted.current = JSON.stringify([displayName, selected, details.department, details.admissionYear, details.interests]); }} className="stack profile-form">
    <input type="hidden" name="semester" value={settings.semester} />
    <div className="name-field"><label htmlFor="name">모임에서 사용할 이름</label><input id="name" name="name" value={displayName} onChange={e => setDisplayName(e.target.value)} minLength={2} maxLength={20} autoComplete="nickname" required /></div>
    <p className="help">표시 이름은 본인 관리용이며 다른 학생에게 공개하지 않습니다. 모임에는 학과·입학 연도·관심 주제만 표시됩니다.</p>
    <label htmlFor="department">학과</label><input id="department" name="department" value={details.department} onChange={e => setDetails({ ...details, department: e.target.value })} maxLength={80} />
    <label htmlFor="admission_year">입학 연도</label><input id="admission_year" name="admission_year" type="number" min={1900} max={new Date().getFullYear()} value={details.admissionYear} onChange={e => setDetails({ ...details, admissionYear: e.target.value })} />
    <label htmlFor="interests">관심 주제 (쉼표로 구분, 최대 10개)</label><input id="interests" name="interests" value={details.interests} onChange={e => setDetails({ ...details, interests: e.target.value })} />
    <fieldset className="timetable-fieldset" disabled={pending}>
      <legend>비어 있는 교시를 선택해 주세요</legend>
      <p className="help">수업이 없는 시간 중 모임 제안을 받아도 되는 교시를 표시해 주세요. 선택은 참석 승낙이 아닙니다.</p>
      <div className="timetable" style={{ "--days": settings.weekdays.length } as CSSProperties}>
        {settings.weekdays.map(day => <fieldset className="day-column" key={day}><legend>{weekdays[day]}요일</legend>
          <div className="day-slots">{Array.from({ length: settings.period_count }, (_, i) => day * 100 + i + 1).map(slot => <label className="slot" key={slot}>
            <input type="checkbox" name="slots" value={slot} checked={selected.includes(slot)} onChange={e => setSelected(previous => (e.target.checked ? [...previous, slot] : previous.filter(value => value !== slot)).sort((a, b) => a - b))} aria-label={slotLabel(slot)} />
            <span><span aria-hidden="true" className="slot-check">{selected.includes(slot) ? "✓" : "·"}</span> {slot % 100}<span className="period-label">교시</span></span>
          </label>)}</div>
        </fieldset>)}
      </div>
    </fieldset>
    <div className="save-row"><p aria-live="polite">공강 <strong>{selected.length}교시</strong> 선택 {dirty && <span className="muted">· 저장 전</span>}</p><Submit pending={pending}>공강 저장</Submit></div>
    <Feedback state={state} />
    <p className="help">공강 수정으로 확정된 시간이 더 이상 겹치지 않으면 해당 모임은 시간 미정으로 바뀝니다.</p>
  </form>;
}

export function CreateMeetingForm({ places }: { places: string[] }) {
  const [state, action, pending] = useActionState(createMeeting, {});
  return <form action={action} onReset={event => event.preventDefault()} className="stack">
    <fieldset className="kind-options"><legend>어떤 시간을 함께할까요?</legend>
      {Object.entries(kinds).map(([value, label]) => <label key={value}><input type="radio" name="kind" value={value} required /><span>{label}</span></label>)}
    </fieldset>
    <label htmlFor="topic">모임 주제</label><input id="topic" name="topic" minLength={2} maxLength={80} required placeholder="예: 타입스크립트 함께 공부" />
    <label htmlFor="place">만날 공개 장소</label><select id="place" name="place" required defaultValue=""><option value="" disabled>장소 선택</option>{places.map(place => <option key={place}>{place}</option>)}</select>
    <label htmlFor="capacity">함께할 인원</label><select id="capacity" name="capacity" required defaultValue="3" aria-describedby="capacity-help"><option value="3">3명</option><option value="4">4명</option><option value="2">2명</option></select>
    <label className="check-line"><input type="checkbox" name="pair" value="yes" /><span>2인 모임을 명시적으로 선택합니다 (2명 선택 시 필수)</span></label>
    <p id="capacity-help" className="help">본인을 포함한 전체 정원입니다. 시간은 참여자가 모인 뒤 정해요.</p>
    <Submit pending={pending}>모임 열기</Submit><Feedback state={state} />
  </form>;
}
export function CommentForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addComment, {});
  return <form action={action} className="stack"><input type="hidden" name="id" value={id} /><label htmlFor="comment">코멘트</label><textarea id="comment" name="body" maxLength={1000} required placeholder="자기소개, 장소 변동, 지각·취소 연락" /><Submit pending={pending}>코멘트 남기기</Submit><Feedback state={state} /></form>;
}
export function ReportForm({ meeting, target }: { meeting?: string; target?: string }) {
  const [state, action, pending] = useActionState(reportProblem, {});
  return <form action={action} className="stack">{meeting && <input type="hidden" name="meeting" value={meeting} />}{target && <input type="hidden" name="target" value={target} />}<label htmlFor={`reason-${meeting ?? target}`}>신고 사유</label><textarea id={`reason-${meeting ?? target}`} name="reason" maxLength={1000} required /><Submit pending={pending}>신고 접수</Submit><Feedback state={state} /></form>;
}
export function MemberControls({ id, target, host }: { id: string; target: string; host: boolean }) {
  const [blockState, blockAction, blocking] = useActionState(blockUser, {});
  const [removeState, removeAction, removing] = useActionState(removeMember, {});
  return <details><summary>참여자 관리</summary><div className="stack"><form action={blockAction}><input type="hidden" name="target" value={target} /><Submit pending={blocking}>차단</Submit><Feedback state={blockState} /></form>{host && <form action={removeAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="target" value={target} /><Submit pending={removing} danger>내보내기</Submit><Feedback state={removeState} /></form>}<ReportForm target={target} /></div></details>;
}
export function JoinForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(joinMeeting, {});
  return <form action={action}><input type="hidden" name="id" value={id} /><Submit pending={pending}>함께하기</Submit><Feedback state={state} /></form>;
}
export function ConfirmForm({ id, slots, confirmed }: { id: string; slots: number[]; confirmed: number | null }) {
  const [state, action, pending] = useActionState(confirmMeeting, {});
  return <form action={action} className="stack">
    <input type="hidden" name="id" value={id} />
    <label htmlFor="slot">모두 가능한 시간</label>
    <select id="slot" name="slot" required defaultValue={confirmed ?? ""} key={slots.join(",") + confirmed}>
      <option value="" disabled>시간을 골라 주세요</option>{slots.map(slot => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}
    </select>
    <label htmlFor="meeting-date">모임 날짜 (28일 이내, 선택한 요일)</label><input id="meeting-date" name="date" type="date" required />
    <Submit pending={pending}>{confirmed ? "확정 시간 변경" : "이 시간으로 확정"}</Submit><Feedback state={state} />
  </form>;
}
export function ProposalForm({ id, settings }: { id: string; settings: Settings }) {
  const [state, action, pending] = useActionState(proposeTime, {});
  return <form action={action} className="stack"><input type="hidden" name="id" value={id} /><label htmlFor="proposal-slot">대안 교시</label><select id="proposal-slot" name="slot" required defaultValue=""><option value="" disabled>교시 선택</option>{settings.weekdays.flatMap(day => Array.from({ length: settings.period_count }, (_, i) => day * 100 + i + 1)).map(slot => <option key={slot} value={slot}>{slotLabel(slot)}</option>)}</select><label htmlFor="proposal-date">모임 날짜 (28일 이내, 선택한 요일)</label><input id="proposal-date" name="date" type="date" required /><Submit pending={pending}>대안 시간 제안</Submit><Feedback state={state} /></form>;
}
export function AcceptForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(acceptTime, {});
  return <form action={action}><input type="hidden" name="id" value={id} /><Submit pending={pending}>제안 수락</Submit><Feedback state={state} /></form>;
}
export function MeetingAvailabilityForm({ id, settings, slots }: { id: string; settings: Settings; slots: number[] }) {
  const [state, action, pending] = useActionState(saveMeetingAvailability, {});
  return <details><summary>이 모임의 가능 시간 예외</summary><form action={action} className="stack"><input type="hidden" name="id" value={id} /><p className="help">이 모임에만 적용됩니다. 학기별 원본은 바뀌지 않습니다.</p><div className="timetable" style={{ "--days": settings.weekdays.length } as CSSProperties}>{settings.weekdays.map(day => <fieldset className="day-column" key={day}><legend>{weekdays[day]}요일</legend><div className="day-slots">{Array.from({ length: settings.period_count }, (_, i) => day * 100 + i + 1).map(slot => <label className="slot" key={slot}><input type="checkbox" name="slots" value={slot} defaultChecked={slots.includes(slot)} aria-label={slotLabel(slot)} /><span>{slot % 100}교시</span></label>)}</div></fieldset>)}</div><Submit pending={pending}>이 모임의 가능 시간 저장</Submit><Feedback state={state} /></form></details>;
}
export function LeaveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(leaveMeeting, {});
  return <form action={action}><input type="hidden" name="id" value={id} /><Submit pending={pending} danger>모임 나가기</Submit><Feedback state={state} /></form>;
}
export function AccountControls() {
  const [logoutState, logoutAction, loggingOut] = useActionState(logout, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteAccount, {});
  return <section className="account-controls">
    <form action={logoutAction}><button className="button" disabled={loggingOut}>{loggingOut ? "처리 중…" : "로그아웃"}</button><Feedback state={logoutState} /></form>
    <details><summary>회원 탈퇴</summary><form action={deleteAction} className="stack">
      <p>계정, 이름, 공강, 참여 기록과 내가 연 모임이 삭제됩니다. 되돌릴 수 없습니다.</p>
      <label htmlFor="confirmation">삭제하려면 ‘탈퇴’를 입력해 주세요</label><input id="confirmation" name="confirmation" pattern="탈퇴" required autoComplete="off" />
      <Submit pending={deleting} danger>계정과 내 데이터 삭제</Submit><Feedback state={deleteState} />
    </form></details>
  </section>;
}
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="text-button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "확인 중…" : "새로고침"}</button>;
}
