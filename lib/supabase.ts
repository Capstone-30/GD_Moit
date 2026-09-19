import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Meeting, Settings } from "./domain";

function hasSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export const supabase = cache(async () => {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; proxy refreshes them. */ }
      },
    },
  });
});
export const getSettings = cache(async (): Promise<Settings | null> => {
  if (!hasSupabase()) return null;
  const db = await supabase();
  const { data, error } = await db.from("app_settings").select("school_name,email_domain,semester,weekdays,period_count,retention_policy,public_places").maybeSingle();
  if (error) throw new Error("학교 설정을 불러오지 못했습니다.");
  return data;
});
export const getUser = cache(async () => {
  if (!hasSupabase()) return null;
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && error.status !== 400 && error.status !== 401 && error.status !== 403) throw new Error("로그인 상태를 확인하지 못했습니다.");
  return user;
});
export async function requireUser() {
  if (!hasSupabase()) redirect("/login");
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
export async function getMeetings(id?: string): Promise<Meeting[]> {
  const db = await supabase();
  const { data, error } = await db.rpc("get_meetings", id === undefined ? undefined : { p_id: id });
  if (error) throw new Error("모임을 불러오지 못했습니다.");
  return data as Meeting[];
}
export const getProfile = cache(async () => {
  const user = await requireUser();
  const settings = await getSettings();
  if (!settings) redirect("/login");
  const db = await supabase();
  const [profile, availability] = await Promise.all([
    db.from("profiles").select("display_name,department,admission_year,interests").eq("id", user.id).maybeSingle(),
    db.from("availability").select("slots").eq("user_id", user.id).eq("semester", settings.semester).maybeSingle(),
  ]);
  if (profile.error || availability.error) throw new Error("공강을 불러오지 못했습니다.");
  return { settings, name: profile.data?.display_name ?? "", department: profile.data?.department ?? "", admissionYear: profile.data?.admission_year ?? "", interests: (profile.data?.interests ?? []) as string[], slots: (availability.data?.slots ?? []) as number[], registered: Boolean(availability.data) };
});
export async function getComments(id: string): Promise<{ id: number; body: string; created_at: string; mine: boolean; author: string }[]> {
  const db = await supabase();
  const { data, error } = await db.rpc("get_comments", { p_id: id });
  if (error) throw new Error("코멘트를 불러오지 못했습니다.");
  return data;
}
