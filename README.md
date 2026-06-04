# Codex Skill Manager

로컬 머신의 스킬 파일과 Codex MCP 상태를 확인하고 관리하는 작은 웹 대시보드입니다.

이 프로젝트는 다른 사람의 스킬 데이터를 정적으로 포함하지 않습니다. 실행 중인 컴퓨터의 스킬 폴더를 직접 스캔해 `SKILL.md` 파일을 보여주고, Codex CLI와 세션 로그를 읽어 현재 등록된 MCP와 최근 호출 흔적을 표시합니다.

## 무엇을 할 수 있나

- 여러 스킬 루트에서 로컬 `SKILL.md` 파일을 찾습니다.
- 스킬 이름, 설명, 루트, 디렉터리 기준으로 검색합니다.
- 브라우저에서 스킬 내용을 열람합니다.
- 쓰기 가능한 스킬은 브라우저에서 바로 수정합니다.
- 새 스킬을 생성합니다.
- 읽기 전용 아카이브 스킬을 쓰기 가능한 루트로 설치합니다.
- `SKILL.md`를 `SKILL.md.disabled`로 바꿔 스킬을 비활성화합니다.
- Codex에 등록된 MCP 서버 목록과 설정을 확인합니다.
- Codex 세션 로그를 읽어 최근 MCP 호출 흔적을 요약해 보여줍니다.
- `SKILL_ROOTS`로 추가 스킬 폴더를 원하는 만큼 연결할 수 있습니다.

## 기본 스킬 폴더

기본적으로 현재 사용자 홈 디렉터리 아래의 다음 경로를 스캔합니다.

```text
~/.codex/skills
~/.codex/skills/.system
~/.agents/skills
~/.claude/skills
~/skills
~/skills-archive
```

없는 폴더는 건너뜁니다. 하나만 있어도 앱은 실행됩니다.

## 빠른 시작

요구 사항:

- Node.js 18 이상
- npm

실행:

```bash
npm start
```

접속:

```text
http://localhost:4173
```

다른 포트를 쓰려면:

```bash
PORT=4180 npm start
```

그다음 `http://localhost:4180`으로 접속하면 됩니다.

## 화면 구성

좌측 상단에서 `Skills`와 `MCP` 모드를 전환할 수 있습니다.

- `Skills`
  로컬 스킬 검색, 편집, 생성, 설치, 활성화/비활성화를 제공합니다.
- `MCP`
  현재 Codex에 등록된 MCP 서버 목록과 최근 호출 요약을 보여줍니다.

## MCP 정보는 어떻게 읽나

MCP 화면은 두 종류의 데이터를 조합합니다.

### 1. 등록된 MCP 목록

우선 Codex CLI를 호출합니다.

```bash
codex mcp list
codex mcp get <name>
```

앱은 여기서 서버 이름, 상태, transport, URL 또는 command, args, 환경 변수 키 이름 등을 읽습니다.

CLI 조회가 실패하면 `~/.codex/config.toml`의 `[mcp_servers.*]` 섹션을 직접 파싱하는 fallback 경로를 사용합니다.

### 2. 최근 MCP 호출 로그

다음 경로의 JSONL 세션 로그를 읽습니다.

```text
~/.codex/sessions/
~/.codex/archived_sessions/
```

각 이벤트 중 `mcp__*` 네임스페이스의 함수 호출만 추려서 최근 호출 요약으로 보여줍니다.

민감한 인자는 그대로 노출하지 않습니다.

- `token`
- `secret`
- `password`
- `authorization`
- `apiKey`

같은 키는 `[redacted]`로 마스킹됩니다.

## 더 많은 스킬 폴더 추가하기

스킬이 다른 경로에 있다면 `SKILL_ROOTS`로 추가할 수 있습니다.

쉼표 구분:

```bash
SKILL_ROOTS="$HOME/work/skills,$HOME/lab/agent-skills" npm start
```

줄바꿈이나 세미콜론도 지원합니다.

라벨과 읽기 전용 여부까지 직접 지정하려면 JSON을 사용합니다.

```bash
SKILL_ROOTS='[
  {"key":"work","label":"Work skills","path":"~/work/skills","writable":true},
  {"key":"shared","label":"Shared archive","path":"~/shared/skills","writable":false}
]' npm start
```

필드 설명:

- `key`: 내부에서 쓰는 고정 ID
- `label`: 화면에 표시할 이름
- `path`: 스캔할 폴더
- `writable`: 생성, 편집, 설치, 활성화, 비활성화 허용 여부

문자열만 넣은 항목은 기본적으로 `writable: true`로 처리합니다.

## 스킬 폴더 구조

각 스킬은 보통 자신의 디렉터리 안에 `SKILL.md`를 가집니다.

```text
my-skill/
  SKILL.md
```

권장 frontmatter:

```markdown
---
name: my-skill
description: 이 스킬을 언제 쓰는지 설명합니다.
---

# Instructions

스킬 지침을 여기에 작성합니다.
```

frontmatter가 없어도 열람은 가능하지만, 이름과 설명 검색 품질은 떨어집니다.

## 안전 모델

이 도구는 로컬 우선 방식으로 동작합니다.

- 로컬 폴더만 읽습니다.
- 스킬 내용을 외부로 업로드하지 않습니다.
- 별도 데이터베이스가 없습니다.
- 로그인 기능이 없습니다.
- 브라우저 편집은 로컬 `SKILL.md` 파일을 바로 수정합니다.

쓰기 가능한 루트만 파일 변경이 가능하고, 읽기 전용 루트는 열람과 설치 소스로만 사용됩니다.

비활성화는 되돌릴 수 있습니다.

```text
SKILL.md -> SKILL.md.disabled
```

다시 활성화하면 원래 이름으로 복원됩니다.

```text
SKILL.md.disabled -> SKILL.md
```

## API

브라우저 UI는 다음 로컬 HTTP API를 사용합니다.

```text
GET  /api/health
GET  /api/roots
GET  /api/skills
GET  /api/skills/:id
POST /api/skills
PUT  /api/skills/:id
POST /api/skills/:id/install
POST /api/skills/:id/disable
POST /api/skills/:id/enable
GET  /api/mcp
GET  /api/mcp/logs?limit=50
```

### `GET /api/mcp`

등록된 MCP 서버 목록을 반환합니다.

예시 필드:

```json
{
  "id": "codex:figma",
  "client": "codex",
  "name": "figma",
  "source": "cli",
  "status": "enabled",
  "transport": "streamable_http",
  "url": "http://127.0.0.1:3845/mcp"
}
```

### `GET /api/mcp/logs`

최근 MCP 호출 요약을 반환합니다.

예시 필드:

```json
{
  "timestamp": "2026-06-01T05:47:52.229Z",
  "toolName": "js",
  "namespace": "mcp__node_repl",
  "serverName": "node_repl",
  "argumentsSummary": {
    "title": "Open local app"
  }
}
```

## 개발

테스트:

```bash
npm test
```

문법 체크:

```bash
node -c server.js
node -c lib/skills.js
node -c lib/mcp.js
node -c public/app.js
```

프로젝트 구조:

```text
.
├── lib/skills.js        # 스킬 탐색과 파일시스템 작업
├── lib/mcp.js           # MCP 목록과 세션 로그 수집
├── public/              # 브라우저 UI
├── server.js            # 로컬 HTTP 서버와 API
└── test/skills.test.js  # node:test 기반 테스트
```

## 문제 해결

스킬이 보이지 않을 때:

- 스캔 대상 폴더 중 최소 하나가 실제로 존재하는지 확인합니다.
- 각 스킬 폴더에 `SKILL.md`가 있는지 확인합니다.
- 기본 경로 밖에 있다면 `SKILL_ROOTS`로 추가합니다.

MCP 목록이 비어 있을 때:

- 터미널에서 `codex mcp list`가 동작하는지 확인합니다.
- Codex 설정 파일 `~/.codex/config.toml`에 `mcp_servers` 설정이 있는지 확인합니다.
- Codex CLI가 현재 사용자 환경과 같은 계정/설정 경로를 보고 있는지 확인합니다.

최근 MCP 호출이 보이지 않을 때:

- `~/.codex/sessions` 또는 `~/.codex/archived_sessions`에 로그가 쌓였는지 확인합니다.
- 아직 MCP를 실제 호출한 적이 없으면 목록은 비어 있을 수 있습니다.

포트 충돌:

```bash
PORT=4180 npm start
```

편집이 비활성화될 때:

- 선택한 루트가 읽기 전용일 수 있습니다.
- 쓰기 가능한 커스텀 루트를 추가하거나, 기본 writable 루트의 스킬을 선택합니다.

아카이브 설치가 실패할 때:

- 대상 루트에 같은 폴더 이름의 스킬이 이미 있을 수 있습니다.
- 정말 덮어써야 한다면 기존 폴더를 정리하거나 다른 이름으로 설치합니다.

## 라이선스

배포하거나 재사용을 허용하려면 적절한 라이선스를 추가하세요.
