# LabFlow Local Startup Troubleshooting

이 문서는 LabFlow가 어떤 PC에서는 잘 실행되지만 다른 PC에서는 시작에 실패했던 원인을 정리한 기록입니다.

## 핵심 요약

문제는 단일 코드 버그라기보다, 시작 스크립트가 특정 개발환경이 이미 준비되어 있다고 가정한 데서 발생했습니다.

동료 PC에는 Python, Node.js, 가상환경, 프론트 의존성, API 키, 실행 경로가 이미 맞춰져 있었을 가능성이 큽니다. 반면 문제가 발생한 PC에서는 이 전제들이 여러 군데에서 달랐습니다.

## 발생했던 문제들

### 1. 실행 경로와 바로가기 문제

`create_shortcut.vbs`가 `LabFlow 시작.bat` 파일명을 깨진 한글 인코딩으로 가리키고 있었습니다.

그 결과 바로가기가 실제로 존재하지 않는 파일을 실행하려고 했고, Windows에서 `지정된 경로를 찾을 수 없습니다` 오류가 발생했습니다.

추가로 `Desktop\labflow`, `C:\labflow`, `labflow-main`처럼 복사본이 여러 개 있어서 수정한 파일과 실제 실행한 파일이 달랐던 점도 문제를 키웠습니다.

### 2. Python 실행 경로 문제

기존 스크립트는 `python`, `pip` 명령이 전역 PATH에서 바로 실행된다고 가정했습니다.

하지만 해당 PC에서는 Python이 `C:\anaconda3\python.exe`에는 있었지만, 일반 `cmd`에서 `python` 명령으로 안정적으로 잡히지 않았습니다.

그래서 시작 스크립트가 Python을 찾지 못하거나, 가상환경 생성과 패키지 설치 단계에서 실패했습니다.

### 3. Node.js와 npm 실행 경로 문제

Node.js는 conda를 통해 설치되었고 `C:\anaconda3\npm.cmd`는 존재했습니다.

하지만 npm 내부 postinstall 스크립트가 다시 `node` 명령을 호출할 때 `C:\anaconda3`가 PATH에 없어서 실패했습니다.

즉, npm은 실행되지만 그 안에서 호출되는 node는 찾지 못하는 상태였습니다.

### 4. 백엔드 가상환경 문제

기존 `LabFlow 시작.bat`는 아래 파일이 이미 존재한다고 가정했습니다.

```text
backend\venv\Scripts\activate.bat
```

하지만 처음 실행하는 PC에는 `backend\venv`가 없을 수 있습니다.

이 경우 스크립트가 가상환경을 만들기 전에 activate를 시도하면서 경로 오류가 발생했습니다.

### 5. 프론트 의존성 설치 상태 문제

프론트는 `node_modules` 폴더가 있으면 설치가 완료된 것으로 판단하고 `npm start`를 실행했습니다.

하지만 이전 `npm install` 실패 때문에 `node_modules` 폴더만 남아 있고, 실제로 필요한 `react-scripts`는 설치되지 않은 상태였습니다.

그래서 다음 오류가 발생했습니다.

```text
'react-scripts'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는 배치 파일이 아닙니다.
```

이 문제는 `node_modules` 폴더 존재 여부가 아니라 아래 파일 존재 여부를 확인하도록 바꾸면서 해결했습니다.

```text
frontend\node_modules\.bin\react-scripts.cmd
```

### 6. Python 3.13과 bcrypt/passlib 호환 문제

기존 스크립트는 `bcrypt<4.0`을 강제로 설치하려 했습니다.

해당 PC의 Python은 `3.13`이었고, 이 환경에서는 오래된 bcrypt 핀과 passlib 조합이 안정적으로 동작하지 않았습니다.

그래서 새 비밀번호 해시는 `pbkdf2_sha256`을 사용하고, 기존 bcrypt 해시는 `bcrypt` 라이브러리로 직접 검증하도록 수정했습니다.

### 7. Anthropic API 키 부재

예약 챗봇은 `ANTHROPIC_API_KEY`가 없으면 백엔드에서 500 에러를 발생시키는 구조였습니다.

동료 PC에는 `.env` 또는 시스템 환경변수에 API 키가 있었을 가능성이 큽니다.

해당 PC에는 키가 없었기 때문에 프론트에서는 `서버 연결 실패`처럼 보였습니다.

이를 해결하기 위해 API 키가 없어도 기본 안내와 간단한 예약 파싱을 수행하는 local fallback을 추가했습니다.

## 수정 방향

이번에 적용한 수정은 다음 방향을 목표로 했습니다.

- 실행 파일명을 한글 인코딩에 의존하지 않도록 `LabFlow_Start.bat`를 추가했습니다.
- 기존 `LabFlow 시작.bat`는 새 런처를 호출하도록 단순화했습니다.
- `create_shortcut.vbs`가 깨진 한글 파일명이 아니라 `LabFlow_Start.bat`를 가리키게 했습니다.
- Python을 `python` 명령뿐 아니라 `C:\anaconda3\python.exe`에서도 찾도록 했습니다.
- npm을 `C:\anaconda3\npm.cmd`에서도 찾도록 했습니다.
- npm 실행 시 `C:\anaconda3`를 PATH에 추가해 postinstall 스크립트의 `node` 호출이 실패하지 않도록 했습니다.
- 백엔드 가상환경이 없으면 자동 생성하도록 했습니다.
- 백엔드 패키지가 이미 설치되어 있으면 반복 설치를 건너뛰도록 했습니다.
- 프론트 의존성은 `react-scripts.cmd` 존재 여부로 판단하도록 했습니다.
- 프론트 서버가 응답할 때까지 기다린 뒤 브라우저를 열도록 했습니다.
- `ANTHROPIC_API_KEY`가 없어도 챗봇이 기본 응답과 간단한 예약 파싱을 수행하도록 했습니다.
- 로컬 개발 DB는 Git 추적에서 제외하고 `.gitignore`의 `*.db` 규칙을 따르도록 정리했습니다.

## 동료 PC에서는 왜 됐을 가능성이 높은가

동료 PC에는 다음 조건 중 상당수가 이미 충족되어 있었을 가능성이 큽니다.

- 올바른 폴더 하나에서 실행하고 있었음
- 바로가기가 정상 파일을 가리키고 있었음
- Python이 PATH에 등록되어 있었음
- Node.js와 npm이 PATH에 등록되어 있었음
- `backend\venv`가 이미 생성되어 있었음
- `frontend\node_modules`가 정상 설치되어 있었음
- Python 버전이 3.13이 아니었거나 bcrypt 문제가 이미 없었음
- `.env` 또는 환경변수에 `ANTHROPIC_API_KEY`가 설정되어 있었음

## 앞으로 새 PC에서 확인할 것

새 PC에서 LabFlow를 실행할 때는 아래 항목을 먼저 확인하는 것이 좋습니다.

```powershell
python --version
node -v
npm -v
```

conda 환경을 사용하는 경우 다음 경로도 확인합니다.

```powershell
C:\anaconda3\python.exe --version
C:\anaconda3\npm.cmd -v
```

프론트 의존성 설치 완료 여부는 아래 파일로 확인합니다.

```text
frontend\node_modules\.bin\react-scripts.cmd
```

챗봇에서 실제 Claude 응답을 사용하려면 `backend\.env`에 아래 값을 설정해야 합니다.

```env
ANTHROPIC_API_KEY=your_api_key_here
```

API 키가 없어도 기본 local fallback은 동작하지만, 자연어 예약 이해 능력은 제한적입니다.
