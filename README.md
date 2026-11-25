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
