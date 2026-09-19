import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// UI contract fixture only. Database rules are tested on PostgreSQL in database.test.ts.
// No deployment credentials are read and no email is sent.
const settings = { school_name: "테스트 학교", email_domain: "school.test", semester: "테스트 학기", weekdays: [1,2,3,4,5], period_count: 8, retention_policy: "UI 검증용 데이터입니다. 테스트가 끝나면 모두 삭제합니다.", public_places: ["테스트 도서관 2층"] };
const uid = "00000000-0000-0000-0000-000000000001";
const mid = "10000000-0000-0000-0000-000000000001";
const user = { id: uid, email: "student@school.test", aud: "authenticated", role: "authenticated", email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: uid, email: user.email, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now()/1000) + 3600 })}`;
const jwt = `${unsigned}.${createHmac("sha256", "local-ui-fixture-only").update(unsigned).digest("base64url")}`;
const session = { access_token: jwt, refresh_token: "local-ui-fixture-only", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000) + 3600, user };
let configured = false, outage = false, saveFailure = false, createFailure = false, deleted = false;
let profile = null, availability = null, meeting = null, comments = [];
const calls = [];
const backend = createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  calls.push({ path, body });
  res.setHeader("Content-Type", "application/json");
  const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (path === "/auth/v1/otp") return send({});
  if (path === "/auth/v1/verify") return body.token === "123456" ? send(session) : send({ msg: "Token expired", error_code: "otp_expired" }, 403);
  if (path === "/auth/v1/user") return deleted ? send({ msg: "User not found", error_code: "user_not_found" }, 403) : send(user);
  if (path === "/auth/v1/logout") return send({});
  if (path === "/rest/v1/app_settings") return send(configured ? [settings] : []);
  if (path === "/rest/v1/profiles") return send(profile ? [profile] : []);
  if (path === "/rest/v1/availability") return send(availability ? [availability] : []);
  if (path.endsWith("/get_meetings")) return outage ? send({ message: "fixture outage" }, 503) : send(meeting ? [meeting] : []);
  if (path.endsWith("/get_comments")) return send(comments);
  if (path.endsWith("/add_comment")) { comments.push({ id: comments.length + 1, body: body.p_body, created_at: new Date().toISOString(), mine: true, author: "나" }); return send(null); }
  if (path.endsWith("/save_profile")) {
    if (saveFailure) return send({ message: "INVALID_SLOTS" }, 400);
    profile = { display_name: body.p_name, department: body.p_department, admission_year: body.p_admission_year, interests: body.p_interests }; availability = { slots: body.p_slots }; return send(null);
  }
  if (path.endsWith("/create_meeting")) {
    if (createFailure) return send({ message: "INVALID_PLACE" }, 400);
    meeting = { id: mid, kind: body.p_kind, topic: body.p_topic, place: body.p_place, capacity: body.p_capacity, member_count: 1, is_host: true, joined: true, common_slots: [101,203], my_overlap: [101,203], my_slots: [101,203], confirmed_slot: null, meeting_date: null, proposal: null, members: [{ id: uid, name: "참여자", department: null, admission_year: null, interests: [], is_host: true, is_me: true }] };
    return send(mid);
  }
  if (path.endsWith("/confirm_meeting")) { meeting.confirmed_slot = body.p_slot; meeting.meeting_date = body.p_date; return send(null); }
  if (path.endsWith("/join_meeting")) { meeting.joined = true; meeting.member_count = 2; return send(null); }
  if (path.endsWith("/delete_account")) { deleted = true; return send(null); }
  return send({ error: `Unexpected fixture route ${path}` }, 404);
});
backend.listen(54329, "127.0.0.1"); await once(backend, "listening");
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3041"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-ui-fixture-only", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore","pipe","pipe"],
});
let output = ""; app.stdout.on("data", d => { output += d; }); app.stderr.on("data", d => { output += d; });
mkdirSync("test-results", { recursive: true });
let browser;
try {
  for (let attempt=0; attempt<120; attempt++) {
    if (app.exitCode !== null) throw new Error(output);
    try { await fetch("http://127.0.0.1:3041/login"); break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const visit = async path => { await page.goto(`http://127.0.0.1:3041${path}`); await page.locator("h1").waitFor(); };
  const visible = async text => { await page.getByText(text, { exact: true }).first().waitFor(); };
  const click = async name => { await page.getByRole("button", { name, exact: true }).click(); };
  const layout = async name => {
    for (const width of [320,375,414,768,1280]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => ({ root: document.documentElement.scrollWidth > innerWidth, body: document.body.scrollWidth > innerWidth, outside: [...document.querySelectorAll("main input, main button, main h1, main h2, main h3, main a")].filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.outerHTML.slice(0,100)) }));
      assert.deepEqual(overflow, { root: false, body: false, outside: [] }, `${name} at ${width}px`);
      await page.screenshot({ path: `test-results/${name}-${width}.png`, fullPage: true });
    }
  };
  await visit("/profile");
  assert(page.url().endsWith("/login"));
  await visible("학교 모임을 준비하고 있어요"); assert.equal(await page.locator("input[name=email]").count(), 0);
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(".skip-link").evaluate(e => e === document.activeElement && getComputedStyle(e).transform === "none"), true);
  await page.getByRole("heading", { level: 1 }).click();
  await layout("setup");
  configured = true; await visit("/login"); await layout("login");
  const contrast = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const luminance = name => {
      ctx.fillStyle = style.getPropertyValue(`--color-${name}`).trim(); ctx.fillRect(0,0,1,1);
      const rgb = [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const pairs = ["ink/paper", "ink/paper-2", "muted/paper", "muted/paper-2", "muted/surface", "accent/paper", "accent/paper-2", "accent-ink/accent", "error/surface", "error/paper", "border/surface", "focus/paper"];
    return Object.fromEntries(pairs.map(pair => { const [a,b] = pair.split("/").map(luminance); return [pair, (Math.max(a,b)+.05)/(Math.min(a,b)+.05)]; }));
  });
  for (const [pair, ratio] of Object.entries(contrast)) assert(ratio >= (pair.startsWith("border/") || pair.startsWith("focus/") ? 3 : 4.5), `${pair} contrast ${ratio.toFixed(2)}`);
  writeFileSync("test-results/contrast.json", JSON.stringify(contrast, null, 2));
  await page.getByLabel("학교 이메일", { exact: true }).focus();
  assert.equal(await page.getByLabel("학교 이메일", { exact: true }).evaluate(e => getComputedStyle(e).outlineStyle), "solid");
  await page.getByLabel("학교 이메일", { exact: true }).fill("student@outside.test");
  await page.getByRole("checkbox").check(); await click("인증번호 받기"); await visible("@school.test 학교 이메일을 입력해 주세요.");
  assert(!calls.some(c => c.path === "/auth/v1/otp"));
  assert(await page.getByRole("checkbox").isChecked(), "실패한 제출이 동의 입력을 지우지 않는다");
  await page.getByLabel("학교 이메일", { exact: true }).fill(user.email); await click("인증번호 받기");
  await page.getByLabel("이메일 인증번호").fill("000000"); await click("인증하고 시작하기");
  await visible("인증번호가 틀렸거나 만료되었습니다. 다시 확인하거나 새 번호를 받아 주세요.");
  await page.getByLabel("이메일 인증번호").fill("123456"); await click("인증하고 시작하기");
  await page.waitForURL("http://127.0.0.1:3041/"); await visible("첫 모임을 기다리고 있어요"); await layout("empty");
  await visit("/profile"); await page.getByLabel("모임에서 사용할 이름").fill("공강학생");
  await page.getByLabel("월요일 1교시", { exact: true }).check(); await page.getByLabel("화요일 3교시", { exact: true }).check();
  saveFailure = true; await click("공강 저장"); await visible("공강 선택을 확인하고 다시 저장해 주세요.");
  assert(await page.getByLabel("월요일 1교시", { exact: true }).isChecked());
  saveFailure = false; await click("공강 저장"); await visible("공강을 저장했습니다. 모든 모임에서 이 공강을 사용합니다.");
  assert.deepEqual(availability.slots, [101,203]); await layout("profile");
  await visit("/profile"); assert(await page.getByLabel("화요일 3교시", { exact: true }).isChecked());
  await page.getByLabel("수요일 2교시", { exact: true }).check();
  page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("link", { name: "← 모임 목록", exact: true }).click();
  assert(page.url().endsWith("/profile"));
  await page.getByLabel("수요일 2교시", { exact: true }).uncheck();
  await page.getByLabel("수요일 2교시", { exact: true }).focus(); await page.keyboard.press("Space");
  assert(await page.getByLabel("수요일 2교시", { exact: true }).isChecked()); await page.keyboard.press("Space");
  await visit("/meetings/new"); await layout("create");
  await page.getByRole("radio", { name: "모각공" }).check(); await page.getByLabel("모임 주제").fill("개발 공부"); await page.getByLabel("만날 공개 장소").selectOption("테스트 도서관 2층");
  await page.getByLabel("함께할 인원").selectOption("3");
  createFailure = true; await click("모임 열기"); await visible("운영 목록에서 공개 장소를 선택해 주세요.");
  assert.deepEqual([await page.getByLabel("만날 공개 장소").inputValue(), await page.getByLabel("함께할 인원").inputValue(), await page.getByRole("radio", { name: "모각공" }).isChecked()],
    ["테스트 도서관 2층", "3", true], "실패한 제출이 개설 입력을 지우지 않는다");
  createFailure = false; await click("모임 열기"); await page.waitForURL(`**/meetings/${mid}`);
  await visible("아직 개설자만 있어요. 참여자가 모이면 시간을 확정할 수 있습니다.");
  meeting.member_count = 2; meeting.members.push({ id: "00000000-0000-0000-0000-000000000002", name: "참여자", department: null, admission_year: null, interests: [], is_host: false, is_me: false });
  await visit(`/meetings/${mid}`); await page.getByLabel("모두 가능한 시간").selectOption("101");
  const monday = new Date(); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7));
  await page.getByLabel("모임 날짜 (28일 이내, 선택한 요일)").fill(`${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`);
  await click("이 시간으로 확정"); await visible("확정된 시간");
  assert.equal(meeting.confirmed_slot, 101);
  await page.getByLabel("코멘트", { exact: true }).fill("조금 늦겠습니다"); await click("코멘트 남기기"); await visible("조금 늦겠습니다");
  await layout("detail");
  await visit("/"); await layout("list");
  meeting.is_host = false; meeting.joined = false;
  await visit(`/meetings/${mid}`); assert.equal(await page.getByRole("button", { name: "이 시간으로 확정" }).count(), 0);
  await click("함께하기"); await visible("함께하기로 했어요");
  outage = true; await visit("/"); await visible("잠시 연결이 끊겼어요.");
  outage = false; await click("다시 시도"); await page.getByRole("heading", { name: /함께할 모임/ }).waitFor();
  await visit("/privacy"); await layout("privacy");
  await visit("/meetings/not-a-uuid"); await visible("모임을 찾지 못했어요.");
  await visit("/profile"); await page.getByText("회원 탈퇴", { exact: true }).click();
  await page.getByLabel("삭제하려면 ‘탈퇴’를 입력해 주세요").fill("탈퇴"); await click("계정과 내 데이터 삭제");
  await page.waitForURL("**/login?deleted=1"); await visible("계정과 내 데이터를 삭제했습니다.");
  assert.equal(deleted, true);
  assert.deepEqual(errors.filter(message => !message.includes("모임을 불러오지 못했습니다")), []);
  console.log("UI passed: setup, email validation/OTP, profile persistence/error/navigation, create/join/confirm, retry, delete; 8 screens × 5 widths. Auth/API fixture; real SMTP and hosted Supabase not tested.");
} catch (error) {
  writeFileSync("test-results/server.log", output);
  if (browser) {
    const failed = browser.contexts()[0]?.pages()[0];
    if (failed) { await failed.screenshot({ path: "test-results/failure.png", fullPage: true }); writeFileSync("test-results/failure.txt", await failed.locator("body").innerText()); }
  }
  throw error;
} finally {
  await browser?.close(); app.kill("SIGTERM"); await once(app,"exit"); backend.close();
}
