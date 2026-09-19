export const kinds = { study: "모각공", coffee: "커피챗", lunch: "런치챗" } as const;
export const weekdays = ["", "월", "화", "수", "목", "금", "토", "일"];
export type Kind = keyof typeof kinds;
export type Settings = {
  school_name: string;
  email_domain: string;
  semester: string;
  weekdays: number[];
  period_count: number;
  retention_policy: string;
  public_places: string[];
};
export type Meeting = {
  id: string; kind: Kind; topic: string; place: string; capacity: number;
  confirmed_slot: number | null; is_host: boolean; joined: boolean;
  meeting_date: string | null; my_slots: number[];
  proposal: { slot: number; meeting_date: string; accepted: boolean; accepted_count: number } | null;
  member_count: number; common_slots: number[]; my_overlap: number[];
  members: { id: string; name: string; department: string | null; admission_year: number | null; interests: string[]; is_host: boolean; is_me: boolean }[];
};
export type ActionState = { error?: string; success?: string; email?: string };

export function slotLabel(slot: number) {
  return `${weekdays[Math.floor(slot / 100)]}요일 ${slot % 100}교시`;
}
export function schoolEmail(value: FormDataEntryValue | null, domain: string) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email) && email.split("@")[1] === domain ? email : null;
}
export function integer(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
export function trimmedText(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const length = [...text].length;
  return length >= min && length <= max ? text : null;
}
export function parseSlots(values: FormDataEntryValue[], settings: Settings) {
  if (values.length > settings.weekdays.length * settings.period_count) return null;
  const slots: number[] = [];
  for (const value of values) {
    const slot = integer(value, 101, 799);
    if (slot === null || !settings.weekdays.includes(Math.floor(slot / 100)) || slot % 100 < 1 || slot % 100 > settings.period_count) return null;
    slots.push(slot);
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
const messages: Record<string, string> = {
  AUTH_REQUIRED: "학교 이메일로 다시 로그인해 주세요.",
  SCHOOL_EMAIL_REQUIRED: "학교 이메일 주소를 확인해 주세요.",
  INVALID_NAME: "표시 이름은 2~20자로 입력해 주세요.",
  INVALID_SLOTS: "공강 선택을 확인하고 다시 저장해 주세요.",
  INVALID_KIND: "모임 유형을 선택해 주세요.",
  INVALID_PLACE: "운영 목록에서 공개 장소를 선택해 주세요.",
  INVALID_TOPIC: "주제는 2~80자로 입력해 주세요.",
  INVALID_CAPACITY: "정원은 개설자를 포함해 2~4명으로 선택해 주세요.",
  PAIR_CHOICE_REQUIRED: "2인 모임을 명시적으로 선택해 주세요.",
  INVALID_PROFILE: "공개 프로필 내용을 확인해 주세요.",
  INVALID_COMMENT: "코멘트는 1~1000자로 입력해 주세요.",
  INVALID_REPORT: "신고 사유를 1~1000자로 입력해 주세요.",
  INVALID_TARGET: "대상 사용자를 다시 확인해 주세요.",
  MEMBER_ONLY: "참여자만 볼 수 있습니다.",
  INVALID_DATE: "오늘부터 28일 이내의 해당 요일 날짜를 선택해 주세요.",
  PROPOSAL_PENDING: "대안 시간 수락 중에는 새 참여를 받을 수 없습니다.",
  PROPOSAL_MISSING: "대안 시간이 변경되었습니다. 새로고침해 주세요.",
  ACCOUNT_RESTRICTED: "신고 누적으로 모임 개설이 제한되었습니다. 운영자에게 문의해 주세요.",
  PROFILE_REQUIRED: "내 공강에서 이름과 공강을 먼저 저장해 주세요.",
  MEETING_NOT_FOUND: "모임을 찾을 수 없습니다. 목록을 새로 확인해 주세요.",
  MEETING_FULL: "정원이 모두 찼습니다. 다른 모임을 찾아보세요.",
  TIME_CONFLICT: "확정 시간과 내 공강이 겹치지 않습니다. 공강을 확인해 주세요.",
  HOST_ONLY: "개설자만 시간을 확정할 수 있습니다.",
  WAIT_FOR_MEMBER: "참여자가 모이면 시간을 확정할 수 있습니다.",
  NO_COMMON_SLOT: "공강이 변경되었습니다. 새로고침 후 교집합에서 다시 골라 주세요.",
};
export function errorMessage(code: string) {
  return messages[code] ?? "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
