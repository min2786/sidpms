# sidpms

SID 프로젝트 관리 웹페이지 (단일 HTML 파일).

## 기능
- 대시보드: 월간/주간/일간 타임라인·캘린더, 프로젝트 기간 바 표시
- 프로젝트 상세: 프로젝트 상태(진행도, D-day), 일정 캘린더, 일일 진행일지
- 일지 카카오톡 "나에게 보내기" 전송
- 설정: 테마 색상 8종, 워크스페이스 이름, 주 시작 요일
- 반응형 레이아웃 (데스크톱/모바일)

## Supabase 연결 및 로그인
1. Supabase 프로젝트의 SQL Editor에서 `supabase.sql`을 실행합니다. 로그인한 사용자만 데이터를 읽고 쓸 수 있도록 설정됩니다.
2. Supabase > Authentication에서 이메일 로그인(Email provider)이 켜져 있는지 확인하고, 사용자를 직접 추가(Add user)하거나 페이지의 회원가입을 사용합니다. 아무나 가입하지 못하게 하려면 Authentication > Sign In / Providers에서 "Allow new users to sign up"을 끄고 사용자를 직접 추가하세요.
3. `config.js`에 Project URL과 anon(publishable) key를 입력해 두면, 로그인 화면에서 이메일과 비밀번호만 입력하면 됩니다. anon 키는 공개되어도 되는 키이며 보호는 2단계의 DB 정책이 합니다. **service_role / secret 키는 절대 넣지 마세요.** `config.js`를 비워 두면 로그인 화면에서 URL과 키를 직접 입력할 수 있습니다(이 브라우저에만 저장).
4. 로그인하면 프로젝트, 진행도, 일지, 일정, 설정이 Supabase `pms_docs` 테이블에 저장되고 4초마다 변경 사항을 불러옵니다. 왼쪽 아래 `로그아웃`으로 나갈 수 있습니다.

## 사용
`index.html`을 브라우저에서 열면 됩니다. 클라우드 저장(db)과 카카오톡 전송은 Claude 아티팩트 환경에서만 동작하며, 그 외 환경에서는 현재 세션에만 저장됩니다.

## 카카오톡 전송 (웹)
Claude 안에서 열면 연결된 카카오톡 도구로 "나에게 보내기"가 동작하고, 일반 웹에서는 카카오톡 공유창이 열립니다.
1. [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고 앱 키의 **JavaScript 키**를 `config.js`의 `KAKAO_JS_KEY`에 입력합니다.
2. 앱 설정 > 플랫폼 > Web에 사이트 도메인(예: `https://min2786.github.io`)을 등록합니다.
3. `카톡 전송`을 누르면 공유창이 열리고, "나와의 채팅"을 선택해 보냅니다. 메시지는 200자까지 지원됩니다.

## 이미지 업로드 (컨텐츠 현황)
관리형 > 컨텐츠 프로젝트의 컨텐츠 현황에서 이미지를 끌어다 놓거나 "＋ 이미지" 버튼으로 올립니다.
긴 변 500px(JPEG)로 자동 최적화되고, 110×110 섬네일로 표시됩니다.
사용하려면 `supabase.sql`의 **Storage 설정 부분(맨 아래)을 SQL Editor에서 한 번 더 실행**하세요(비공개 버킷 `pms-images` + 로그인 사용자 정책).

## 웹푸시 알림 (매일 오전 9시)
1. 내 컴퓨터에서 `node push/gen-keys.mjs` 실행 → PUBLIC/PRIVATE 키 출력
2. PUBLIC 키를 `config.js`의 `PUSH_PUBLIC_KEY`에 입력 후 커밋
3. GitHub 저장소 Settings → Secrets and variables → Actions에 등록:
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`(service_role, Supabase에서 복사), `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`(예: mailto:내이메일)
4. 폰에서 앱 설정 → "이 기기에서 알림 받기" (아이폰은 먼저 Safari에서 홈 화면에 추가)
5. Actions 탭 → daily-push → Run workflow 로 즉시 테스트

## 실시간 알림 (변경 즉시 푸시)
새 프로젝트/업데이트/버전업/일정/상태 변경이 저장되면 바로 푸시합니다. (위 웹푸시 1~4단계를 먼저 완료)
1. Supabase SQL Editor에서 `supabase.sql` 맨 아래 `alter table ... replica identity full;` 실행
2. Supabase 대시보드 → Edge Functions → **Deploy a new function** (이름: `notify`) → `supabase/functions/notify/index.ts` 내용 붙여넣기. 같은 함수에 파일 `diff.js`도 추가(내용 붙여넣기). **Verify JWT는 끄기**
3. Edge Functions → Secrets에 추가: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`, `WEBHOOK_SECRET`(임의의 긴 문자열)
4. Database → Webhooks → Create: 테이블 `pms_docs`, 이벤트 Insert+Update, 타입 Supabase Edge Function → `notify`, HTTP Headers에 `x-webhook-secret` = 3번의 WEBHOOK_SECRET 값
5. 앱 설정 → 알림에서 종류별로 켜고 끌 수 있습니다. 내가 올린 변경은 내 기기로는 오지 않습니다.

## 회의 녹음 → Gemini 자동 정리 (Monday Meeting)
1. Supabase SQL Editor에서 `supabase.sql` 맨 아래 **회의 녹음 버킷(pms-audio)** 블록 실행
2. https://aistudio.google.com 에서 Gemini API 키 발급 (키는 채팅/저장소에 올리지 말 것)
3. Supabase → Edge Functions → 새 함수 `transcribe` → `supabase/functions/transcribe/index.ts` 붙여넣기. **Verify JWT는 켜 둠**
4. Edge Functions → Secrets: `GEMINI_API_KEY` (선택: `GEMINI_MODEL`, 기본 gemini-2.5-flash. 모델이 종료되면 최신 flash 모델명으로 변경)
5. 앱 Monday Meeting → "녹음 시작" → "녹음 종료 · AI 정리". 요약·결정사항이 먼저 채워지고, 받아쓰기는 이어서 추가됩니다.
- 정리가 성공하면 원본 음성은 자동 삭제됩니다. 실패하면 "다시 시도"로 재처리합니다.
- 업로드 전에 앱이 멈추면 녹음은 폰에 임시 보관되며, 다시 열면 "정리하기" 버튼이 나옵니다.

## 마케팅 프로젝트 · 인사이트 (키워드 순위 / 영상·SNS 지표)
화면에서 키워드·게시물을 등록하면 매일 07:30(KST)에 GitHub Actions(`insight/collect.mjs`)가 **공식 API**로 조회해 기록합니다. 수동 입력도 가능합니다(수동값이 있는 날은 자동값이 덮어쓰지 않음).
GitHub Secrets (이미 등록한 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`와 함께):
- **네이버** `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — https://developers.naver.com 에서 애플리케이션 등록(검색 API). 웹문서/블로그 검색 결과 300건 안에서 순위를 계산하며, 실제 통합검색 화면 순서와는 다를 수 있습니다.
- **유튜브** `YOUTUBE_API_KEY` — Google Cloud Console에서 YouTube Data API v3 사용 설정 후 API 키 발급. 검색 순위(상위 100건)와 영상 조회수·좋아요.
- **구글** `GSC_SA_JSON`(서비스 계정 키 JSON 전체), `GSC_SITE`(예: `sc-domain:내도메인.kr` 또는 `https://내도메인.kr/`) — 서비스 계정 이메일을 Search Console 속성의 사용자로 추가해야 합니다. 내 사이트의 키워드 평균 순위이며 약 3일 지연됩니다.
- Actions 탭 → daily-insight → Run workflow 로 즉시 실행해 볼 수 있습니다.
- 인스타그램/페이스북/틱톡 등은 화면에서 조회수·좋아요를 직접 입력합니다.

## 관리자 페이지 (사용량 · 권한)
1. Supabase SQL Editor에서 `supabase.sql` 맨 아래 **"관리자 페이지: 사용량 기록 + 회원 권한"** 블록 실행 (pg_cron이 없으면 알림만 뜨고 건너뜀 — 그 경우 관리자 페이지를 여는 날 사용량이 기록됩니다)
2. 왼쪽 아래 "관리자 페이지"(모바일은 Settings 안의 버튼)로 접속. 관리자가 아직 없으면 **가장 먼저 가입한 계정**이 관리자가 됩니다.
3. 사용량(DB·파일 저장소·문서)은 일/주/월 그래프로, 회원 역할(관리자/편집자/보기)과 프로젝트별 공유는 "권한 관리"에서 설정합니다.
- 전송량(egress)·API 요청 수는 Supabase 대시보드에서만 제공되어 링크로 안내합니다. GitHub Pages는 방문 통계를 제공하지 않습니다.
- 역할/공유 설정은 현재 **기록만** 되며 접근을 막지 않습니다(다음 단계에서 RLS로 적용).
