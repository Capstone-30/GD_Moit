"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, integer, isUuid, kinds, parseSlots, schoolEmail, trimmedText, type ActionState } from "@/lib/domain";
import { getSettings, requireUser, supabase } from "@/lib/supabase";

// Never lets a raw database message reach the user.
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  try {
    const db = await supabase();
    const { data, error } = await db.rpc(name, args);
    return { data, error: error ? errorMessage(error.message) : null };
  } catch { return { data: null, error: errorMessage("") }; }
}

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const verifying = form.get("intent") === "verify";
  const rawEmail = form.get("email");
  try {
    const settings = await getSettings();
    if (!settings) return { error: "학교 설정이 준비되면 가입할 수 있습니다." };
    const email = schoolEmail(rawEmail, settings.email_domain);
    if (!email) return { error: `@${settings.email_domain} 학교 이메일을 입력해 주세요.` };
    const db = await supabase();
    if (!verifying) {
      if (form.get("consent") !== "yes") return { error: "개인정보 수집·이용 안내를 확인해 주세요." };
      const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return { error: error.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도해 주세요." : "인증 메일을 보내지 못했습니다. 주소를 확인하고 다시 시도해 주세요." };
      return { email, success: "인증번호를 보냈습니다. 받은편지함과 스팸함을 확인해 주세요." };
    }
    const token = form.get("token");
    if (typeof token !== "string" || !/^\d{6}$/.test(token.trim())) return { email, error: "6자리 인증번호를 입력해 주세요." };
    const { error } = await db.auth.verifyOtp({ email, token: token.trim(), type: "email" });
    if (error) return { email, error: "인증번호가 틀렸거나 만료되었습니다. 다시 확인하거나 새 번호를 받아 주세요." };
  } catch {
    return { error: "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", ...(verifying && typeof rawEmail === "string" ? { email: rawEmail } : {}) };
  }
  redirect("/");
}

export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  try {
    const settings = await getSettings();
    if (!settings) return { error: "학교 설정을 확인하지 못했습니다." };
    if (form.get("semester") !== settings.semester) return { error: "학기가 변경되었습니다. 새로고침 후 다시 입력해 주세요." };
    const name = trimmedText(form.get("name"), 2, 20);
    if (name === null) return { error: errorMessage("INVALID_NAME") };
    const slots = parseSlots(form.getAll("slots"), settings);
    if (!slots) return { error: errorMessage("INVALID_SLOTS") };
    const department = form.get("department") === "" ? null : trimmedText(form.get("department"), 1, 80);
    const year = form.get("admission_year") === "" ? null : integer(form.get("admission_year"), 1900, new Date().getFullYear());
    const interests = typeof form.get("interests") === "string" ? (form.get("interests") as string).split(",").map(x => x.trim()).filter(Boolean) : [];
    if (department === null && form.get("department") !== "" || year === null && form.get("admission_year") !== "" || interests.length > 10 || interests.some(x => [...x].length > 40)) return { error: errorMessage("INVALID_PROFILE") };
    const { error } = await rpc("save_profile", { p_name: name, p_slots: slots, p_department: department, p_admission_year: year, p_interests: interests });
    if (error) return { error };
  } catch { return { error: errorMessage("") }; }
  revalidatePath("/", "layout");
  return { success: "공강을 저장했습니다. 모든 모임에서 이 공강을 사용합니다." };
}

export async function createMeeting(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const kind = form.get("kind");
  const place = trimmedText(form.get("place"), 2, 100);
  const topic = trimmedText(form.get("topic"), 2, 80);
  const capacity = integer(form.get("capacity"), 2, 4);
  if (typeof kind !== "string" || !Object.hasOwn(kinds, kind)) return { error: errorMessage("INVALID_KIND") };
  if (place === null) return { error: errorMessage("INVALID_PLACE") };
  if (topic === null) return { error: errorMessage("INVALID_TOPIC") };
  if (capacity === null) return { error: errorMessage("INVALID_CAPACITY") };
  if (capacity === 2 && form.get("pair") !== "yes") return { error: "2인 모임을 명시적으로 선택해 주세요." };
  const settings = await getSettings();
  if (!settings?.public_places.includes(place)) return { error: errorMessage("INVALID_PLACE") };
  const { data: id, error } = await rpc<string>("create_meeting", { p_kind: kind, p_place: place, p_capacity: capacity, p_topic: topic, p_pair: capacity === 2 });
  if (error) return { error };
  revalidatePath("/");
  redirect(`/meetings/${id}`);
}

export async function joinMeeting(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  if (!isUuid(id)) return { error: errorMessage("MEETING_NOT_FOUND") };
  const { error } = await rpc("join_meeting", { p_id: id });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: "참여했습니다. 함께 가능한 시간을 확인해 보세요." };
}

export async function confirmMeeting(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  const slot = integer(form.get("slot"), 101, 799);
  const date = form.get("date");
  if (!isUuid(id) || slot === null) return { error: errorMessage("NO_COMMON_SLOT") };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: errorMessage("INVALID_DATE") };
  const { error } = await rpc("confirm_meeting", { p_id: id, p_slot: slot, p_date: date });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: "시간을 확정했습니다. 참여자가 상세 화면에서 확인할 수 있습니다." };
}

export async function proposeTime(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id"), slot = integer(form.get("slot"), 101, 799), date = form.get("date");
  if (!isUuid(id) || slot === null || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: errorMessage("INVALID_DATE") };
  const { error } = await rpc("propose_time", { p_id: id, p_slot: slot, p_date: date });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "대안 시간을 제안했습니다. 참여자 전원의 수락을 기다립니다." };
}
export async function acceptTime(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  if (!isUuid(id)) return { error: errorMessage("MEETING_NOT_FOUND") };
  const { error } = await rpc("accept_time", { p_id: id });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "수락했습니다. 모두 수락하면 시간이 확정됩니다." };
}
export async function saveMeetingAvailability(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  const settings = await getSettings();
  if (!isUuid(id) || !settings) return { error: errorMessage("MEETING_NOT_FOUND") };
  const slots = parseSlots(form.getAll("slots"), settings);
  if (!slots) return { error: errorMessage("INVALID_SLOTS") };
  const { error } = await rpc("set_meeting_availability", { p_id: id, p_slots: slots });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "이 모임에만 적용할 가능 시간을 저장했습니다." };
}
export async function leaveMeeting(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  if (!isUuid(id)) return { error: errorMessage("MEETING_NOT_FOUND") };
  const { error } = await rpc("leave_meeting", { p_id: id });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "모임에서 나왔습니다." };
}

export async function addComment(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id");
  const body = trimmedText(form.get("body"), 1, 1000);
  if (!isUuid(id) || !body) return { error: errorMessage("INVALID_COMMENT") };
  const { error } = await rpc("add_comment", { p_id: id, p_body: body });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "코멘트를 남겼습니다." };
}

export async function reportProblem(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const meeting = form.get("meeting");
  const target = form.get("target");
  const reason = trimmedText(form.get("reason"), 1, 1000);
  if (!reason || (isUuid(meeting) === isUuid(target))) return { error: errorMessage("INVALID_REPORT") };
  const { error } = await rpc("report_problem", { p_meeting: isUuid(meeting) ? meeting : null, p_target: isUuid(target) ? target : null, p_reason: reason });
  return error ? { error } : { success: "신고를 접수했습니다." };
}

export async function blockUser(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const target = form.get("target");
  if (!isUuid(target)) return { error: errorMessage("INVALID_TARGET") };
  const { error } = await rpc("block_user", { p_target: target });
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: "차단했습니다. 상대의 모임이 목록에서 숨겨집니다." };
}

export async function removeMember(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const id = form.get("id"), target = form.get("target");
  if (!isUuid(id) || !isUuid(target)) return { error: errorMessage("INVALID_TARGET") };
  const { error } = await rpc("remove_member", { p_id: id, p_target: target });
  if (error) return { error };
  revalidatePath(`/meetings/${id}`);
  return { success: "참여자를 내보냈습니다." };
}

export async function logout(_: ActionState): Promise<ActionState> {
  try {
    const db = await supabase();
    const { error } = await db.auth.signOut();
    if (error) return { error: "로그아웃하지 못했습니다. 다시 시도해 주세요." };
  } catch { return { error: errorMessage("") }; }
  redirect("/login");
}

export async function deleteAccount(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (form.get("confirmation") !== "탈퇴") return { error: "삭제하려면 ‘탈퇴’를 입력해 주세요." };
  try {
    const db = await supabase();
    const { error } = await db.rpc("delete_account");
    if (error) return { error: "삭제하지 못했습니다. 다시 시도해 주세요." };
    // The account is already gone. Clearing local cookies must not imply deletion failed.
    await db.auth.signOut({ scope: "local" });
  } catch { return { error: "삭제 결과를 확인하지 못했습니다. 로그인 상태를 새로 확인해 주세요." }; }
  revalidatePath("/", "layout");
  redirect("/login?deleted=1");
}
