# Redrob Work (레드롭 워크)

레드롭 워크(Redrob Work)는 AI 워크플로를 공유하기 위해 만들어진 무료 오픈소스 데스크톱 앱입니다. macOS, Windows, Linux용 Claude Cowork 및 Codex의 오픈소스 대안입니다.

Codex, Claude Code, Cursor 또는 다른 호환 에이전트에 레드롭 워크 MCP 하나를 추가하면, 여러 도구와 팀원, 컴퓨터에서 동일한 스킬, MCP, 연결된 서비스를 재사용할 수 있습니다. 한 번 만들어서 동료나 친구와 공유하거나, 자신만을 위해 보관하세요.

데스크톱 앱은 전용 워크스페이스가 필요할 때 사용할 수 있지만 필수는 아닙니다. 이미 사용 중인 에이전트에서 레드롭 워크를 사용할 수 있습니다. 대규모 조직의 경우, 관리자 인터페이스를 통해 기능을 게시하고, 접근을 관리하며, 공유 또는 사용자별 연결을 구성할 수 있습니다.

[**레드롭 워크 다운로드**](https://openworklabs.com/download)

<img width="1481" height="842" alt="Redrob Work desktop app" src="https://github.com/user-attachments/assets/66a8dd9b-5260-488c-957d-e54331e78c1c" />

## AI 에이전트로 설치하기

이미 AI 에이전트를 사용하고 있나요? 이 프롬프트를 복사하여 Claude Code, Cursor, Codex, ChatGPT 또는 컴퓨터에서 명령을 실행할 수 있는 모든 에이전트에 붙여넣으세요.

```text
Install OpenWork on my computer, set up my first workspace, and open it ready to use. Follow the steps in https://openworklabs.com/start.md?v=hero
```

1. 레드롭 워크를 설치합니다
2. 워크스페이스를 만듭니다
3. 바로 실행할 수 있도록 엽니다

## 모든 에이전트에서 레드롭 워크 사용하기

레드롭 워크 MCP는 할당된 스킬, 플러그인, MCP 연결, Google Workspace, Microsoft 365 기능을 모든 호환 에이전트로 가져옵니다.

두 가지 도구를 제공합니다. `search_capabilities`는 사용할 수 있는 기능을 찾고, `execute_capability`는 이를 실행합니다. MCP를 추가하면 클라이언트가 브라우저를 열어 로그인하고 레드롭 워크 조직을 선택할 수 있게 합니다.

### Codex

```bash
codex mcp add openwork --url https://api.openworklabs.com/mcp/agent
```

### Claude Code

```bash
claude mcp add --transport http openwork https://api.openworklabs.com/mcp/agent
```

### OpenCode

`opencode.json`에 다음을 추가하세요:

```json
{
  "mcp": {
    "openwork": {
      "type": "remote",
      "enabled": true,
      "url": "https://api.openworklabs.com/mcp/agent",
      "oauth": {}
    }
  }
}
```

### 모든 MCP 클라이언트

이 원격 MCP 서버 URL을 사용하세요:

```text
https://api.openworklabs.com/mcp/agent
```

## 레드롭 워크 Den

레드롭 워크 Den은 팀 또는 조직 전반에서 레드롭 워크를 관리하기 위한 컨트롤 플레인입니다.

- 대규모로 추론을 프로비저닝하고 어떤 구성원과 팀이 각 모델 제공자를 사용할 수 있는지 제어합니다.
- 팀원을 초대하고, 팀을 만들고, 한곳에서 접근을 관리합니다.
- 데스크톱 정책을 설정하고, 로컬 모델 접근을 제한하며, 조직에서 사용할 수 있는 앱 버전을 제어합니다.
- 마켓플레이스를 통해 스킬과 플러그인을 게시한 다음 조직, 팀 또는 특정 사용자에게 할당합니다.
- Anthropic 호환 플러그인을 가져와 지원되는 스킬과 원격 MCP를 레드롭 워크 MCP를 통해 사용할 수 있게 합니다.

<img width="1546" height="915" alt="Redrob Work Den organization control plane" src="https://github.com/user-attachments/assets/033dbbfe-5661-4f7c-869c-46278406d6cc" />

## 문서

[레드롭 워크 문서를 읽어보세요.](https://openworklabs.com/docs)

## 로컬 개발

체크아웃 하나에서는 계속 `pnpm dev`를 사용하세요. 추가 환경 변수가 없으면 기존 공유 개발 프로필을 재사용합니다.

여러 git 워크트리를 한 번에 실행하려면 다음을 사용하세요:

```bash
pnpm dev:worktree
```

이는 `OPENWORK_DEV_PROFILE=auto`를 설정하고, 워크트리 경로에서 안정적인 프로필 이름을 파생하며, Electron이 사용 가능한 CDP 포트를 선택하도록 하고, Vite에 사용 가능한 개발 서버 포트를 요청합니다. 이름이 지정된 프로필을 선택할 수도 있습니다. 예: `OPENWORK_DEV_PROFILE=my-feature OPENWORK_ELECTRON_REMOTE_DEBUG_PORT=0 PORT=0 pnpm dev`.

`dev:worktree`는 또한 `OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN=1`을 기본값으로 설정합니다. 완전히 새로운 프로필에는 저장된 자격 증명이 없으므로, macOS에서는 Chromium이 인증된 쿠키를 저장하는 즉시 실제 키체인이 프롬프트를 표시하며, 이 모달은 닫힐 때까지 Electron의 메인 루프를 차단합니다. 격리된 프로필에서 시스템 키체인을 특별히 사용하려면 `OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN=0`을 설정하세요.

개발 시작 시 `[openwork] dev profile=... cdp=http://127.0.0.1:9223`와 같은 배너가 출력됩니다. 이를 사용하여 프로필 디렉터리를 찾고 CDP URL을 로컬 도구에 전달하세요.

두 번째 인스턴스가 프로필 잠금을 얻지 못하면, 이제 열린 CDP 포트와 창 없이 남아 있는 대신 그렇다고 알리고 종료합니다.

### 헤드리스 웹 (Electron 없음)

로컬 `openwork-server`에 대해 브라우저에서 레드롭 워크 UI를 실행하려면(데스크톱 셸 없이):

```bash
pnpm dev:headless-web
```

이것은 격리된 런처입니다:

- `tmp/headless-server.json`을 작성하며 `~/.config/openwork/server.json`은 절대 읽지 않습니다
- 선택한 워크스페이스 루트를 자동으로 승인하고, 다시 실행 시 해당 구성을 병합(재작성하지 않음)하므로 UI를 통해 추가한 워크스페이스가 `--replace` 후에도 유지됩니다
- 안정적인 소유자 베어러가 UI에 강제 적용된 상태로 Vite + `openwork-server`를 시작합니다. 크래시 재시작은 해당 베어러를 재사용하여 열린 탭이 계속 작동하게 하며, `--replace`는 새 토큰을 발급합니다(`--keep-tokens`를 전달하여 유지). 권한이 있는 호스트 토큰은 서버 프로세스에 남아 있으며 Vite 번들에 인라인되지 않습니다.
- Den Cloud 호출을 동일 출처로 프록시합니다. Vite는 `/api/den`(Den 컨트롤 플레인으로 전달)을 제공하고 앱은 `VITE_DEN_API_BASE_URL`을 통해 거기에 Den API를 고정하므로, Cloud 호출은 CORS로 차단되지 않고 오래된 `localStorage` 기본 URL은 로드 시 지워집니다
- 에이전트 대상 URL/토큰을 `tmp/dev-headless-web.json`(소유자 전용, `0600`)에 게시하고, 방문하는 모든 사이트가 아니라 웹 앱 자체 출처에서만 로컬 서버에 대한 브라우저 호출을 허용합니다
- 기본적으로 안정적인 포트를 사용합니다(웹 `5178`, 서버 `8778`. 사용 중일 때는 사용 가능한 포트로 대체되며, `OPENWORK_WEB_PORT` / `OPENWORK_PORT`로 재정의)
- 워크트리별 단일 인스턴스입니다. 다시 실행하면 정상 인스턴스를 재사용하고 해당 URL을 출력합니다. 오래된 인스턴스는 자동으로 정리되며, `--replace`는 재시작을 강제합니다
- 실행한 터미널에서 서버를 분리하므로 터미널을 닫아도 유지됩니다
- 전체 스택을 호출 셸과 독립적으로 실행하는 `--detach`를 지원합니다(에이전트에 권장). 분리된 상태로 시작하여 상태 확인을 기다리고 URL을 출력한 다음 종료합니다

출력된 웹 URL을 여세요. 헤드리스 웹의 Cloud 로그인은 **복사/붙여넣기** 핸드오프를 사용합니다(호스팅된 Den은 세션 부여를 `http://127.0.0.1`로 리디렉션할 수 없습니다):

1. 계정 → 로그인(Den이 열리고 붙여넣기 필드가 설정에 열립니다)
2. Den에서 로그인
3. Den이 표시하는 레드롭 워크 링크 / 일회용 코드를 복사
4. **로그인 코드 붙여넣기** 아래에 붙여넣기 → 로그인 완료

`pnpm dev:web-local`이 실행 중일 때 `OPENWORK_DEV_DEN_PROXY_TARGET=http://127.0.0.1:3005`로 Den을 로컬 스택에 연결하세요. Den 연결을 비활성화하려면 `OPENWORK_DEV_HEADLESS_WEB_DEN_PROXY=0`을 설정하세요.
