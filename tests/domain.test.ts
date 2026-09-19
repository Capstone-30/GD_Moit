import assert from "node:assert/strict";
import test from "node:test";
import { errorMessage, integer, isUuid, parseSlots, schoolEmail, slotLabel, trimmedText, type Settings } from "../lib/domain.ts";

const settings: Settings = { school_name: "테스트 학교", email_domain: "school.test", semester: "테스트 학기", weekdays: [1,2,3,4,5], period_count: 8, retention_policy: "테스트용 정책이며 운영에 사용하지 않음", public_places: ["도서관"] };
test("이름·장소는 앞뒤 공백 제거 후 유니코드 문자 수로 검증", () => {
  for (const max of [20, 100]) {
    assert.equal(trimmedText("  학생  ", 2, max), "학생");
    assert.equal(trimmedText("😀😀", 2, max), "😀😀");
    assert.equal(trimmedText("가".repeat(max), 2, max), "가".repeat(max));
    for (const value of [null, new File([], "name.txt"), "  ", " 가 ", "😀", "가".repeat(max + 1)]) {
      assert.equal(trimmedText(value, 2, max), null);
    }
  }
});
test("학교 이메일은 정확한 도메인만 허용", () => {
  assert.equal(schoolEmail(" Student@School.Test ", settings.email_domain), "student@school.test");
  for (const value of ["a@school.test.evil", "a@evil.school.test", "a@@school.test", "a b@school.test", "", null]) assert.equal(schoolEmail(value, settings.email_domain), null);
});
test("공강 파싱: 빈 공강·중복·범위·잘못된 입력", () => {
  assert.deepEqual(parseSlots([], settings), []);
  assert.deepEqual(parseSlots(["203", "101", "101"], settings), [101, 203]);
  for (const value of ["100", "109", "601", "-101", "101.0", "1e2", "", "999999999999999999999"]) assert.equal(parseSlots([value], settings), null);
  assert.equal(parseSlots(Array(41).fill("101"), settings), null);
  assert.equal(integer("2.0", 2, 100), null);
  assert.equal(integer("100", 2, 100), 100);
  assert.equal(slotLabel(203), "화요일 3교시");
  assert.equal(isUuid("../../login"), false);
  assert.equal(isUuid("00000000-0000-0000-0000-000000000001"), true);
  assert(!errorMessage("SQL_CONNECTION_SECRET").includes("SECRET"));
});
