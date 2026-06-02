# LabFlow Google Login & Google Calendar Integration Hand-off

## 목적

LabFlow 프로젝트에 다음 기능을 추가한다.

1. Google 계정 로그인
2. 로그인한 사용자 정보 저장
3. Google Calendar 권한 요청
4. LabFlow 일정/작업 데이터를 Google Calendar event로 생성
5. 생성된 Google Calendar event ID와 링크 저장
6. 같은 LabFlow 항목이 중복으로 Calendar에 생성되지 않도록 방지

중요한 점은 **Google 로그인 기능과 Google Calendar 연동 기능을 분리해서 구현**하는 것이다.
먼저 Google OAuth 로그인을 안정적으로 구현하고, 그다음 Calendar API 연동을 추가한다.

---

## 먼저 해야 할 일: 저장소 구조 분석

아직 바로 구현하지 말고, 먼저 현재 저장소 구조를 분석한다.

확인할 내용:

1. 프론트엔드 프레임워크가 무엇인지

   * React / Vite / Next.js / 기타
2. 백엔드가 존재하는지

   * Express / FastAPI / Django / Flask / Next.js API Route / 기타
3. 현재 인증 구조가 있는지
4. DB 또는 ORM을 사용하는지

   * SQLite / PostgreSQL / MySQL / Prisma / SQLAlchemy / Django ORM 등
5. 일정, 작업, 프로젝트, 실험 기록 등 Calendar에 연결할 수 있는 데이터 구조가 있는지
6. Google OAuth와 Calendar API 코드를 어느 파일/디렉터리에 추가하는 것이 적절한지

분석 후, 구현 전에 파일 단위 계획을 먼저 제시한다.

---

## 구현 방향

Google OAuth 2.0 Authorization Code Flow를 사용한다.

권장 흐름:

```text
[Frontend]
사용자가 "Google로 로그인" 클릭
→ Google Identity Services에서 authorization code 발급
→ code를 backend로 전달

[Backend]
authorization code를 Google token endpoint에 전달
→ access token / refresh token 수신
→ 사용자 정보 확인
→ 앱 사용자 생성 또는 로그인 처리
→ refresh token은 서버 DB에 암호화 저장
→ 앱 자체 세션 또는 JWT 발급

[Calendar]
사용자가 LabFlow 일정/작업을 Calendar에 추가
→ backend가 저장된 refresh token으로 access token 갱신
→ Google Calendar API events.insert 호출
→ google_event_id와 htmlLink 저장
```

---

## 보안 원칙

반드시 지켜야 할 사항:

1. `GOOGLE_CLIENT_SECRET`은 절대 프론트엔드에 노출하지 않는다.
2. `refresh_token`은 브라우저 localStorage/sessionStorage에 저장하지 않는다.
3. `refresh_token`은 백엔드 DB에 암호화해서 저장한다.
4. `.env` 파일은 git에 커밋하지 않는다.
5. access token / refresh token을 console.log 또는 서버 로그에 출력하지 않는다.
6. OAuth redirect URI는 Google Cloud Console에 등록한 값과 정확히 일치해야 한다.
7. 필요한 scope만 최소한으로 요청한다.

---

## 사용할 Google OAuth Scope

기본 로그인:

```text
openid
email
profile
```

Calendar event 생성:

```text
https://www.googleapis.com/auth/calendar.events
```

최종 scope:

```text
openid email profile https://www.googleapis.com/auth/calendar.events
```

---

## 환경변수

프로젝트 구조에 맞게 `.env` 또는 환경변수 설정 파일에 추가한다.

백엔드용:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
TOKEN_ENCRYPTION_KEY=
```

프론트엔드가 Vite인 경우:

```env
VITE_GOOGLE_CLIENT_ID=
VITE_API_BASE_URL=http://localhost:8000
```

주의:

```text
GOOGLE_CLIENT_SECRET은 VITE_ 또는 NEXT_PUBLIC_ prefix를 붙이면 안 된다.
브라우저에 노출되면 안 되는 값이다.
```

Next.js를 사용하는 경우에는 구조에 따라 다음처럼 조정한다.

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

---

## Google Cloud Console 설정값

개발 단계에서 사용할 값:

### Authorized JavaScript origins

프론트엔드 개발 서버 주소를 넣는다.

```text
http://localhost:5173
http://localhost:3000
```

둘 중 실제 사용하는 주소만 남겨도 된다.

### Authorized redirect URIs

백엔드 callback 주소를 넣는다.

```text
http://localhost:8000/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

백엔드가 별도 서버면 `8000` 쪽을 사용하고, Next.js API Route를 사용하면 `3000` 쪽을 사용한다.

GitHub repository URL은 여기에 넣지 않는다.
여기에는 실제 앱 실행 주소만 넣는다.

---

## 구현 단계

전체를 한 번에 구현하지 말고 다음 단계로 나눠서 진행한다.

---

## 1단계: 프로젝트 구조 분석

Codex는 먼저 저장소 구조를 분석한다.

확인 명령 예시:

```bash
find . -maxdepth 3 -type f
```

확인할 파일 예시:

```text
package.json
vite.config.*
next.config.*
src/
app/
pages/
server/
backend/
requirements.txt
pyproject.toml
manage.py
app.py
main.py
```

분석 결과를 바탕으로 다음을 정리한다.

```text
- 프론트엔드 실행 방식
- 백엔드 실행 방식
- 인증 관련 기존 코드
- DB/ORM 구조
- Calendar에 연결할 LabFlow 데이터 모델
- 추가/수정할 파일 목록
```

---

## 2단계: Google 로그인 구현

Google 로그인 버튼을 추가한다.

프론트엔드에서는 Google Identity Services를 사용한다.

예시 방향:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

프론트엔드에서는 `GOOGLE_CLIENT_ID`만 사용한다.
`GOOGLE_CLIENT_SECRET`은 절대 프론트엔드에서 사용하지 않는다.

로그인 버튼 클릭 시:

```text
Google OAuth authorization code 요청
→ code를 backend API로 전달
→ backend에서 token 교환
→ 앱 로그인 처리
```

프론트엔드 예시 구조:

```js
const client = google.accounts.oauth2.initCodeClient({
  client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  scope: "openid email profile https://www.googleapis.com/auth/calendar.events",
  ux_mode: "popup",
  callback: async (response) => {
    await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/google/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ code: response.code })
    });
  }
});

function loginWithGoogle() {
  client.requestCode();
}
```

프로젝트가 Vite가 아니면 현재 구조에 맞게 수정한다.

---

## 3단계: 백엔드 OAuth 처리

백엔드에 다음 endpoint를 추가한다.

```text
POST /api/auth/google/code
GET  /api/auth/google/callback
GET  /api/me
POST /api/auth/logout
```

필수 기능:

```text
1. frontend에서 받은 authorization code 수신
2. Google token endpoint에 code 전달
3. access_token, refresh_token, id_token 수신
4. id_token 또는 userinfo로 사용자 정보 확인
5. DB에 사용자 생성 또는 조회
6. Google 계정 정보 저장
7. 앱 자체 세션/JWT 발급
```

저장할 사용자 정보 예시:

```text
users
- id
- email
- name
- picture_url
- google_sub
- created_at
- updated_at
```

Google 계정 정보 예시:

```text
google_accounts
- id
- user_id
- google_sub
- email
- refresh_token_encrypted
- access_token_encrypted
- token_expiry
- scope
- created_at
- updated_at
```

DB가 아직 없다면, 현재 프로젝트 구조에 맞는 최소 저장 방식을 먼저 제안하고 구현한다.

---

## 4단계: Calendar event 생성 API 구현

백엔드에 Calendar event 생성 endpoint를 추가한다.

```text
POST /api/calendar/events
```

요청 body 예시:

```json
{
  "title": "LabFlow 실험 일정",
  "description": "실험 준비 및 결과 정리",
  "location": "Lab",
  "start": "2026-06-03T10:00:00+09:00",
  "end": "2026-06-03T11:00:00+09:00",
  "timeZone": "Asia/Seoul",
  "labflowItemId": "내부_일정_또는_작업_ID"
}
```

Google Calendar event resource 예시:

```js
const event = {
  summary: input.title,
  description: input.description,
  location: input.location,
  start: {
    dateTime: input.start,
    timeZone: input.timeZone || "Asia/Seoul"
  },
  end: {
    dateTime: input.end,
    timeZone: input.timeZone || "Asia/Seoul"
  }
};
```

Google Calendar API 호출:

```text
calendar.events.insert({
  calendarId: "primary",
  resource: event
})
```

생성 후 저장할 값:

```text
- labflow_item_id
- google_event_id
- html_link
- synced_at
```

---

## 5단계: 중복 생성 방지

같은 LabFlow 일정/작업이 Google Calendar에 여러 번 생성되지 않도록 한다.

동기화 테이블 예시:

```text
labflow_calendar_sync
- id
- user_id
- labflow_item_id
- google_event_id
- html_link
- synced_at
```

처리 로직:

```text
1. Calendar 생성 요청 수신
2. labflow_item_id 기준으로 기존 google_event_id가 있는지 확인
3. 이미 있으면 새로 insert하지 않고 기존 htmlLink 반환
4. 없으면 Google Calendar event 생성
5. 생성된 google_event_id와 htmlLink 저장
```

---

## 6단계: 프론트엔드 UI 연결

추가할 UI:

```text
- Google로 로그인 버튼
- 로그인된 사용자 이름/이메일 표시
- Google Calendar 연동 상태 표시
- 일정 또는 작업 화면에 "Google Calendar에 추가" 버튼
- 생성 성공 시 "Google Calendar에서 보기" 링크 표시
```

사용자 메시지 예시:

```text
Google 로그인이 완료되었습니다.
Google Calendar에 일정이 추가되었습니다.
이미 Google Calendar에 추가된 일정입니다.
Google Calendar 연동이 필요합니다.
```

---

## 7단계: 에러 처리

필수 처리:

```text
401: 로그인 필요
403: Calendar 권한 없음 또는 scope 부족
400: 잘못된 시간 형식
409: 이미 동기화된 일정
500: Google API 호출 실패
```

사용자에게 보여줄 메시지는 간단하게 한다.

예시:

```text
Google 로그인이 필요합니다.
Google Calendar 권한이 필요합니다.
일정 생성에 실패했습니다. 잠시 후 다시 시도해주세요.
```

개발 로그에는 원인 파악이 가능하도록 에러를 남기되, token은 절대 출력하지 않는다.

---

## 8단계: 테스트

가능하면 다음 테스트를 추가한다.

```text
- Google OAuth code endpoint 테스트
- 로그인 사용자 생성/조회 테스트
- refresh token 저장 테스트
- Calendar event payload 생성 테스트
- Calendar event 중복 생성 방지 테스트
- Google API 실패 상황 테스트
```

---

## 완료 기준

다음이 만족되면 완료로 본다.

```text
[ ] 사용자가 Google 계정으로 로그인할 수 있다.
[ ] 로그인 후 사용자 이메일/이름을 앱에서 확인할 수 있다.
[ ] Google Calendar 권한을 요청한다.
[ ] LabFlow 일정/작업을 Google Calendar primary calendar에 추가할 수 있다.
[ ] 생성된 Google Calendar event의 htmlLink를 앱에서 볼 수 있다.
[ ] 같은 LabFlow 항목을 두 번 추가해도 Calendar에 중복 생성되지 않는다.
[ ] GOOGLE_CLIENT_SECRET이 프론트엔드에 노출되지 않는다.
[ ] refresh_token이 브라우저에 저장되지 않는다.
[ ] .env 파일이 git에 커밋되지 않는다.
```

---

## 구현 시 주의

현재 프로젝트 구조를 우선한다.

없는 구조를 임의로 가정하지 말고, 백엔드가 없다면 다음 중 하나를 먼저 제안한다.

```text
1. 기존 프론트엔드 프로젝트에 백엔드 API 서버 추가
2. Next.js API Route 사용
3. 별도 Express/FastAPI 백엔드 추가
```

처음부터 모든 기능을 한 번에 구현하지 말고, 다음 순서로 PR 또는 commit을 나눈다.

```text
1. 환경변수 및 설정 파일
2. Google 로그인
3. 사용자 정보 저장
4. Calendar API service
5. Calendar event 생성 endpoint
6. 프론트엔드 버튼 연결
7. 중복 생성 방지 및 테스트
```
