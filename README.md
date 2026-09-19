# 모잇 (Moit)

## 소개

같은 학교 학생이 관심 주제가 맞는 사람을 찾아 가능 시간에 모각공·커피챗·런치챗을 여는 모바일 웹서비스. 첫 학기는 단일 캠퍼스의 개발·IT 학습에 집중한다.

2026-09-22 개정 범위의 로컬 구현을 진행했다. 운영 정책·외부 서비스 연동과 배포 상태는 [현황](tasks.md)에 기록한다. [개정 요구사항](spec.md).

## 기술 스택

현재 코드: Next.js App Router · TypeScript · Supabase Auth/PostgreSQL. 배포 대상: Vercel(실제 배포 미확인). 전환 기본안: Next.js · Spring Boot · PostgreSQL · Figma · AWS(전환 미확정). [선정 근거·구조](plan.md#기술-스택).

## 시작하기

Node.js 22.18 이상이 필요하다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

[로컬 앱](http://localhost:3000)에서 실행한다. 설정 없이도 실행되며 준비 중 화면을 표시한다. 실제 가입·저장에는 다음 설정이 필요하다.

1. 사용할 Supabase 프로젝트의 SQL Editor에서 [기본 마이그레이션](supabase/migrations/202609130001_mvp.sql)과 [개정 마이그레이션](supabase/migrations/202609220001_revision.sql)을 순서대로 한 번씩 실행한다.
   개정 마이그레이션은 날짜가 없는 기존 확정 교시를 미정으로 되돌려 날짜와 함께 다시 확정하도록 한다.
2. [운영 설정](supabase/settings.sql)의 `NULL`을 확정값으로 채워 실행한다. 학교·도메인·학기·요일/교시·공개 장소·코멘트와 신고를 포함한 보관 정책을 설정한다. 운영 중 학교나 교시 체계 변경은 데이터 전환과 함께 수행한다.
3. `.env.local`에 프로젝트 URL과 publishable key를 입력한다. 서비스 역할 키는 사용하지 않는다.
4. Supabase Auth에서 Email 가입과 이메일 확인을 활성화하고, Confirm signup·Magic Link 이메일 템플릿 본문에 `{{ .Token }}` 인증번호를 넣는다. OTP 만료를 600초로 설정하고 6자리 번호 발송을 실제 메일로 확인한다. [공식 OTP 안내](https://supabase.com/docs/guides/auth/auth-email-passwordless).
5. 실제 학교 사용자에게 발송할 [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)·발송 도메인·rate limit을 설정한다. Auth Site URL도 실제 앱 주소로 지정한다. 서버를 다시 시작한다.

배포: Vercel에 이 디렉터리를 Next.js 프로젝트로 연결하고 동일한 환경변수를 설정한다. 빌드 명령은 `npm run build`. 실제 URL에서 이메일 인증과 권한 검증 후 URL을 [현황](tasks.md)에 기록한다. 현재 저장소 연결·운영 프로젝트·배포 URL은 미확인이다.

## 사용 방법

전체 흐름은 [제안서](docs/proposal.md#사용자-흐름과-화면-초안)를 참고한다.

1. 학교 이메일로 인증번호를 받고 로그인한다.
2. 프로필과 학기별 제안 가능 시간을 저장한다.
3. 주제·유형·운영 공개 장소·정원을 정해 모임을 열거나 목록에서 주제·유형으로 찾고 참여한다.
4. 상세에서 교집합과 모임별 예외를 확인한다. 개설자가 날짜·교시를 확정하거나 대안 시간을 제안하고 참여자 전원의 수락을 받는다.
5. 참여자는 코멘트로 연락하고 필요하면 신고·차단·나가기를 사용한다. 개설자는 참여자를 내보낼 수 있다.

운영 규칙은 [요구사항](spec.md#안전운영-규칙)을 따른다. 실제 학교·장소·교시 시각은 운영자가 설정해야 한다. 신고 제한 해제는 운영자가 신고 기록을 검토한 뒤 `account_restrictions` 행을 제거한다.

## 테스트

로컬 검증 명령은 다음과 같다. 배포·이메일 통합 검증은 [현황](tasks.md)에 기록한다.

```sh
npm run typecheck
npm test
npm run build
npm run test:ui
```

- `npm test`: Node 내장 테스트. 도메인·입력 검증과 임시 PostgreSQL에서 두 마이그레이션·RLS·교집합·정원 경쟁·예외·대안 시간·코멘트 권한·신고 제한·차단·삭제를 검증한다. PostgreSQL 16 이상과 `pg_config`가 필요하다(`PG_BIN`으로 실행 파일 디렉터리 지정 가능). 운영 DB에는 접속하지 않는다.
- `npm run test:ui`: Chrome/Playwright에서 실제 Next.js 폼·오류·재시도·입력 보존·화면 5개 폭을 검증한다. 로컬 Auth/API 응답을 대체하므로 실제 메일·Supabase 통합 검증을 대체하지 않는다. macOS는 설치된 Chrome을 사용한다. 다른 환경은 `CHROME_PATH`를 지정하거나 `npx playwright install chromium`을 실행한다. 테스트 포트는 3041·54329이며 스크린샷은 `test-results/`에 저장한다.
- 외부 프로젝트 검증과 사용자 테스트는 [검증 전략](plan.md#검증-전략), 실행 결과·미확인은 [현황](tasks.md).

## 관련 문서

[요구사항](spec.md) · [구현 계획](plan.md) · [작업 현황](tasks.md) · [작업 지침](AGENTS.md) · [제안서](docs/proposal.md) · [심사 원본](docs/evaluation.csv)
