// Supabase 연결 정보. 여기에 입력하면 로그인 화면에서 별도 입력 없이 사용됩니다.
// anon(publishable) 키는 공개되어도 안전하도록 설계된 키이며, 실제 보호는 supabase.sql의 RLS 정책이 합니다.
// 절대로 service_role / secret 키를 넣지 마세요.
window.SUPABASE_CONFIG = {
  url: "https://kndfopqaxcsirhthmawb.supabase.co",
  key: "sb_publishable_HW84ooE_TPE_v8uYRq9zOQ_IL8jO-EQ"
};

// 카카오톡 전송용 JavaScript 키 (카카오 개발자 > 내 애플리케이션 > 앱 키 > JavaScript 키).
// 도메인으로 제한되는 키라 공개되어도 됩니다. 비워 두면 웹에서 카톡 전송이 동작하지 않습니다.
window.KAKAO_JS_KEY = "25e765aae2c27c7b35fe014220f3b09d";

// 웹푸시(알림)용 VAPID 공개키. `node push/gen-keys.mjs`로 만든 PUBLIC 값을 넣으세요(공개되어도 안전).
// PRIVATE 키는 절대 여기 넣지 말고 GitHub Secrets(VAPID_PRIVATE)에만 저장하세요.
window.PUSH_PUBLIC_KEY = "";
