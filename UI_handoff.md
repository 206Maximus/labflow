# LabFlow UI Redesign Hand-off for Codex

## 0. 작업 전제

이번 작업은 원본 `labflow` 프로젝트를 직접 수정하지 않고, 사용자가 만든 복사본 폴더인 `labflow_UI`에서 진행한다.

작업 경로 예시:

```powershell
C:\labflow_UI
```

또는 사용자의 실제 로컬 위치에 따라:

```powershell
...\labflow_UI
```

Codex는 반드시 현재 작업 디렉터리가 `labflow_UI`인지 확인한 뒤 수정해야 한다.
원본 `labflow` 폴더를 수정하지 않는다.

작업 전 확인:

```powershell
pwd
```

현재 경로가 `labflow_UI`가 아니라면 작업을 중단하고 사용자에게 확인한다.

---

## 1. UI 개편 목표

이번 UI 개편은 실사용 완성형 관리자 시스템이 아니라, 발표/시연에서 LabFlow의 AI 기반 장비 예약 경험이 즉시 드러나는 UI를 목표로 한다.

핵심 방향은 다음과 같다.

> 발표 데모용 UI를 중심으로 설계하되, 실제 사용자용으로 확장 가능한 형태를 유지한다.

LabFlow의 첫인상은 기존의 “장비 관리 대시보드”가 아니라, 다음과 같이 재정의한다.

> AI 기반 연구실 장비 운영 Command Center

즉, 사용자가 여러 탭을 찾아다니는 방식보다, 중앙 프롬프트에 자연어로 명령하면 예약, 장비 확인, 안전교육 상태, 노쇼 상태, Google Calendar 충돌 여부를 확인하고 실행하는 느낌을 주는 UI로 변경한다.

---

## 2. 현재 UI에서 유지할 요소

현재 UI의 장점은 유지한다.

### 유지할 요소

* 기존 파란색 계열 브랜드 톤
* 상단 LabFlow 로고 영역
* “연구실 장비 관리 플랫폼” 서브타이틀
* 상단 상태 배지

  * 노쇼 현황
  * 미인증
  * GitHub 아이콘
  * 사용자 카드
  * 로그아웃
  * LIVE 배지
* 장비 카드의 기본 스타일

  * 장비명
  * 장비 아이콘
  * 대기중/사용중 상태
  * 예약 가능 표시
* 기존 기능/API 동작

  * 예약
  * 장비 현황
  * 예약 챗봇
  * 매뉴얼 챗봇
  * 캘린더
  * 체크인/체크아웃
  * 사용 로그
  * 노쇼/안전교육 상태

기존 기능을 삭제하지 말고, 새 레이아웃 안에서 재배치한다.

---

## 3. 전체 레이아웃 방향

기존 가로 탭 기반 UI를 다음 구조로 변경한다.

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar                                                      │
│ LabFlow / 상태 배지 / 사용자 / 로그아웃 / LIVE                │
├───────────────┬───────────────────────────────┬──────────────┤
│ Left Sidebar  │ Main AI Command Center         │ Context Panel│
│               │                               │ 접힘/펼침     │
└───────────────┴───────────────────────────────┴──────────────┘
```

### 핵심 변경

* 첫 화면은 기존 `장비 현황`이 아니라 `Command Center`로 고정한다.
* 기존 상단 가로 탭 메뉴는 왼쪽 사이드바로 이동한다.
* 중앙 영역은 AI 프롬프트 중심의 Command Center로 구성한다.
* 오른쪽에는 접힘/펼침 가능한 Context Panel을 추가한다.
* 기존 장비 현황 화면은 별도 메뉴로 유지한다.

---

## 4. 상단바 요구사항

상단바는 현재 UI의 파란색 톤을 유지한다.

### 상단바 구성

왼쪽:

```text
LabFlow
연구실 장비 관리 플랫폼
```

오른쪽:

```text
노쇼 현황 / 미인증 / GitHub / 사용자 카드 / 로그아웃 / LIVE
```

### 설정 위치

`설정`은 왼쪽 사이드바에 넣지 않는다.
설정은 상단 사용자 카드 근처 또는 상단바 영역에 유지하는 것이 좋다.

예시:

```text
[Flow Lab 사용자 카드] [설정 아이콘] [로그아웃] [LIVE]
```

설정 기능이 기존에 별도 탭으로 존재한다면, 상단바의 설정 버튼 또는 사용자 드롭다운으로 연결한다.

---

## 5. 왼쪽 사이드바 메뉴

기존 가로 탭을 왼쪽 사이드바로 이동한다.

### 사이드바 메뉴 구성

```text
Command Center
장비 현황
예약 관리
AI 매뉴얼
캘린더
사용 로그
관리
```

### 메뉴 설명

#### Command Center

새로운 첫 화면이다.
AI 프롬프트 기반 예약/확인/질문을 수행하는 메인 작업 공간이다.

#### 장비 현황

기존 장비 현황 화면을 유지한다.
XRD, SEM, E-beam, AFM, Furnace 등의 장비 카드를 보여준다.

#### 예약 관리

기존 예약 챗봇 또는 예약 관련 기능을 연결한다.
가능하면 기존 예약 챗봇 컴포넌트를 Command Center에서도 재사용한다.

#### AI 매뉴얼

기존 매뉴얼 챗봇 화면을 연결한다.

#### 캘린더

기존 캘린더 화면을 연결한다.

#### 사용 로그

기존 사용 로그 화면을 연결한다.

#### 관리

체크인/체크아웃, 안전교육, 노쇼 관리 등 운영성 기능을 묶는다.

관리 메뉴 내부 구성 예시:

```text
체크인/아웃
안전교육
노쇼 관리
```

---

## 6. Command Center 첫 화면 요구사항

로그인 후 첫 화면은 반드시 Command Center로 표시한다.

### 중앙 메인 문구

```text
오늘 어떤 장비를 사용할까요?

장비 예약, 사용 가능 시간 확인, 안전교육 상태 확인까지
LabFlow가 한 번에 도와드릴게요.
```

### 메인 프롬프트 입력창

중앙에 큰 자연어 입력창을 배치한다.

Placeholder 또는 기본 예시:

```text
내일 오후 2시에 SEM 1시간 예약해줘
```

입력창 오른쪽에는 전송 버튼을 둔다.

예시:

```text
[ 내일 오후 2시에 SEM 1시간 예약해줘                         ↑ ]
```

### 추천 프롬프트 카드

Command Center 첫 화면에는 추천 작업 카드 4개를 보여준다.

```text
내일 오후 2시에 SEM 1시간 예약해줘
이번 주 금요일에 사용 가능한 장비 알려줘
내 Google Calendar와 겹치지 않는 시간 찾아줘
SEM 사용 전 주의사항 알려줘
```

사용자가 추천 프롬프트를 클릭하면 입력창에 해당 문구가 들어가거나 바로 실행되도록 한다.
빠른 구현을 위해서는 먼저 입력창에 채워 넣는 방식으로 구현해도 된다.

---

## 7. 발표 시연용 대표 프롬프트

발표 시연의 대표 프롬프트는 다음으로 고정한다.

```text
내일 오후 2시에 SEM 1시간 예약해줘
```

이 프롬프트를 중심으로 UI가 자연스럽게 동작하도록 구성한다.

시연 흐름:

```text
1. 사용자가 Command Center에 진입한다.
2. “내일 오후 2시에 SEM 1시간 예약해줘”를 입력한다.
3. 시스템이 예약 검토 카드 형태로 결과를 보여준다.
4. 안전교육 인증, 노쇼 제한, 장비 시간 충돌, Google Calendar 충돌 여부를 체크리스트로 보여준다.
5. 사용자가 “예약 확정하기” 버튼을 누른다.
6. 예약 완료 카드 또는 성공 메시지를 보여준다.
7. 오른쪽 Context Panel에서 관련 예약 정보와 캘린더 정보를 보여준다.
```

---

## 8. AI 응답 UI

AI 응답은 긴 텍스트 위주로 만들지 않는다.
LabFlow는 “말만 하는 챗봇”이 아니라 실제 예약 작업을 수행하는 서비스처럼 보여야 한다.

따라서 AI 응답은 카드 형태로 표시한다.

### 예약 검토 카드 예시

```text
예약 가능 시간을 찾았어요.

장비: SEM
시간: 내일 14:00 - 15:00
상태: 예약 가능

체크리스트
✓ 안전교육 인증 완료
✓ 노쇼 제한 없음
✓ 장비 시간 충돌 없음
✓ Google Calendar 충돌 없음

[예약 확정하기] [시간 바꾸기]
```

### 예약 완료 카드 예시

```text
예약이 완료되었어요.

SEM
내일 14:00 - 15:00

Google Calendar 동기화를 시도했습니다.

[내 예약 보기] [캘린더 열기]
```

실제 API 연동이 어려우면, 우선 기존 예약 챗봇 응답을 감싸는 UI 카드 형태로 구현한다.
단, 발표용 대표 프롬프트에 대해서는 시각적으로 완성도 있는 결과 카드가 나오도록 한다.

---

## 9. 오른쪽 Context Panel

오른쪽에는 접힘/펼침 가능한 Context Panel을 추가한다.

### 기본 상태

처음에는 접혀 있어도 된다.
접힌 상태에서는 오른쪽 끝에 얇은 버튼 또는 탭을 보여준다.

예시:

```text
Context
>
```

또는 아이콘 버튼만 둔다.

### 펼친 상태 기본 내용

Command Center 기본 화면에서 Context Panel을 펼치면 다음 정보를 보여준다.

```text
Lab Context

오늘의 장비 상태
사용 중 0 · 대기중 8

내 예약
오늘 예약 없음

Google Calendar
연결됨

안전교육
인증 완료

노쇼 제한
없음
```

### 예약 진행 중 내용

사용자가 대표 프롬프트를 입력하거나 예약 검토 카드가 뜬 상태에서는 다음과 같이 변경한다.

```text
예약 검토

선택 장비
SEM

예약 시간
내일 14:00 - 15:00

체크리스트
✓ 안전교육 인증 완료
✓ 노쇼 제한 없음
✓ 장비 시간 충돌 없음
✓ Google Calendar 충돌 없음
```

### 구현 우선순위

1차 구현에서는 Context Panel의 데이터가 일부 정적이어도 된다.
다만 추후 실제 API 상태와 연결할 수 있도록 컴포넌트 구조를 분리한다.

예상 컴포넌트:

```text
ContextPanel.jsx
LabStatusCard.jsx
ReservationReviewCard.jsx
```

---

## 10. 디자인 톤

새 UI는 기존 LabFlow의 파란색 톤을 유지한다.

### 컬러 방향

* 메인 컬러: 기존 상단바의 진한 파란색 계열 유지
* 배경: 연한 회색 또는 연한 청회색
* 카드: 흰색 또는 아주 옅은 파란색
* 강조 버튼: 진한 파란색
* 성공 상태: 초록색
* 경고 상태: 노란색 또는 주황색
* 위험/사용중 상태: 빨간색

### 분위기

```text
기존 LabFlow의 신뢰감
+
ChatGPT/Gemini식 중앙 프롬프트
+
연구실 SaaS 느낌
```

피해야 할 것:

* 너무 네온 느낌
* 너무 많은 색상
* 첫 화면에 지나치게 많은 표와 버튼
* 기존 기능을 한 화면에 모두 노출하는 복잡한 대시보드

---

## 11. 구현 범위

### 필수 구현

* `labflow_UI` 복사본에서만 작업
* 첫 화면을 Command Center로 변경
* 기존 상단바 유지 및 정리
* 기존 가로 탭을 왼쪽 사이드바로 이동
* 사이드바 메뉴 구성

  * Command Center
  * 장비 현황
  * 예약 관리
  * AI 매뉴얼
  * 캘린더
  * 사용 로그
  * 관리
* 중앙 Command Center 화면 추가
* 자연어 프롬프트 입력창 추가
* 추천 프롬프트 카드 4개 추가
* 대표 프롬프트:

  * `내일 오후 2시에 SEM 1시간 예약해줘`
* AI 응답을 예약 검토 카드 형태로 표시
* 오른쪽 접힘/펼침 Context Panel 추가
* 기존 장비 현황, 캘린더, 로그, 챗봇 기능은 삭제하지 않고 연결 유지

### 선택 구현

* Context Panel과 실제 API 데이터 연결
* 예약 확정 버튼을 실제 예약 API와 연결
* Google Calendar 동기화 상태 표시
* 안전교육/노쇼 상태 API 연결
* 사이드바 접기 기능
* 모바일 반응형
* 사용자 카드 드롭다운
* 간단한 애니메이션

---

## 12. 기존 컴포넌트 재사용 원칙

가능하면 기존 컴포넌트를 삭제하지 말고 재사용한다.

예상 구조:

```text
frontend/src/App.jsx
frontend/src/components/
```

`App.jsx`가 전체 화면/탭 구성을 담당하고 있다면, 이 파일을 중심으로 레이아웃을 변경한다.

권장 신규 컴포넌트:

```text
frontend/src/components/layout/TopBar.jsx
frontend/src/components/layout/Sidebar.jsx
frontend/src/components/layout/ContextPanel.jsx
frontend/src/components/command/CommandCenter.jsx
frontend/src/components/command/PromptBox.jsx
frontend/src/components/command/SuggestionCards.jsx
frontend/src/components/command/ReservationReviewCard.jsx
```

기존 구조가 단순하다면 파일을 과도하게 나누지 않아도 된다.
다만 Codex는 UI 변경 범위가 커질 수 있으므로 컴포넌트 분리를 우선 고려한다.

---

## 13. 상태 관리 기준

최소 상태는 다음과 같다.

```text
activeView
isContextPanelOpen
promptText
commandResult
```

예시:

```javascript
const [activeView, setActiveView] = useState("command");
const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
const [promptText, setPromptText] = useState("");
const [commandResult, setCommandResult] = useState(null);
```

대표 프롬프트가 입력되면 `commandResult`에 예약 검토 카드 데이터를 넣는다.

예시 데이터:

```javascript
{
  type: "reservation_review",
  equipment: "SEM",
  timeLabel: "내일 14:00 - 15:00",
  safety: true,
  noshow: true,
  equipmentConflict: false,
  calendarConflict: false
}
```

---

## 14. 발표 데모 안정성

발표 시연에서 실패하면 안 되므로, 대표 프롬프트에 대해서는 fallback UI를 반드시 준비한다.

다음 문장이 입력되면 실제 AI/API 응답이 실패하더라도 예약 검토 카드가 나오도록 한다.

```text
내일 오후 2시에 SEM 1시간 예약해줘
```

유사 문장도 가능하면 처리한다.

```text
SEM 예약
내일 SEM
오후 2시 SEM
```

실제 백엔드 연동은 유지하되, 발표용 fallback을 두어 UI가 깨지지 않게 한다.

---

## 15. 주의사항

* 원본 `labflow` 폴더를 수정하지 않는다.
* 반드시 `labflow_UI` 복사본에서 작업한다.
* 기존 API와 기능을 삭제하지 않는다.
* 기존 상단 상태 배지의 장점을 유지한다.
* 새 UI는 기존 파란색 톤을 유지한다.
* 첫 화면은 반드시 Command Center로 고정한다.
* 장비 현황은 삭제하지 않고 별도 메뉴로 유지한다.
* 설정은 왼쪽 사이드바가 아니라 상단바/사용자 영역에 유지한다.
* 발표용 대표 프롬프트가 안정적으로 동작하도록 fallback을 둔다.
* 전체 목표는 “관리자 대시보드”가 아니라 “AI 기반 연구실 장비 운영 Command Center”로 보이게 만드는 것이다.

---

## 16. 최종 한 줄 요약

LabFlow의 기존 파란색 브랜드 톤과 상단 상태 배지는 유지하되, 첫 화면을 AI Command Center로 바꾸고, 가로 탭을 왼쪽 사이드바로 이동시키며, 중앙 프롬프트와 오른쪽 Context Panel을 통해 “AI가 연구실 장비 예약과 운영 상태 확인을 도와주는 서비스”처럼 보이도록 UI를 재구성한다.
