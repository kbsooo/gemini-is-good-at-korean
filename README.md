# gemini-is-good-at-korean

Claude Code에서 Claude가 쓴 한국어 답변을 **화면에 보여주기 직전에 Gemini로 한 번 다듬어서** 보여주는 플러그인입니다.

Claude 모델이 쓴 한국어를 읽다 보면, 글자는 한글인데 한국어 같지 않다는 느낌이 들 때가 있습니다. 조사와 어미가 빠진 명사 나열체("원인 확인 완료. 경로 오류 → 로딩 실패.")나 번역투 때문에 한 번에 이해가 안 됩니다. 같은 글을 Gemini에 넣고 "자연스러운 한국어로 바꿔 줘"라고 하면 훨씬 읽기 편해지는데, 이 플러그인은 그 과정을 자동으로 해 줍니다.

## 예시

실제 Claude Code 세션에서 나온 결과입니다.

| | 문장 |
|---|---|
| Claude 원문 | 학습 파라미터 수의 r 비례 증가, 옵티마이저 상태·그래디언트·체크포인트 용량 증가에 의한 VRAM 및 저장 비용 상승이 이에 대한 대가이다. |
| 화면 표시 | 하지만 그 대가로 학습 파라미터 수가 r에 비례하여 늘어나고, 옵티마이저 상태·그래디언트·체크포인트 용량이 커지면서 VRAM 및 저장 비용이 증가한다. |
| Claude 원문 | 원인 확인 완료. 설정 파일 경로 오류 → 로딩 실패. 경로 수정 후 재시작 필요. |
| 화면 표시 | 원인 확인을 마쳤습니다. 설정 파일 경로에 오류가 있어 로딩에 실패한 것으로 나타났습니다. 경로를 수정한 뒤 재시작해야 합니다. |

## 어떻게 동작하나요

Claude Code의 [`MessageDisplay` 훅](https://code.claude.com/docs/en/hooks#messagedisplay)을 사용합니다. 이 훅은 Claude의 답변이 화면에 그려지기 직전에 실행되고, 화면에 보이는 텍스트만 바꿀 수 있습니다.

1. Claude가 답변을 스트리밍하는 동안에는 조각들을 모아 두고 화면에는 표시하지 않습니다.
2. 답변이 끝나면 전체 텍스트를 Gemini에 보내 자연스러운 한국어로 다시 쓰게 합니다.
3. 다시 쓴 결과를 원래 답변 자리에 표시합니다.

중요한 성질:

- **표시 전용입니다.** 대화 기록(transcript)과 Claude가 보는 컨텍스트에는 원문이 그대로 남습니다. Claude의 작업 흐름에는 영향을 주지 않습니다.
- **코드는 건드리지 않습니다.** 코드블록과 `인라인 코드`는 Gemini에 보내기 전에 토큰으로 바꿔 두었다가 나중에 원래대로 되돌립니다. Gemini가 토큰을 하나라도 잃어버리면 다시 쓴 결과를 버리고 원문을 보여 줍니다.
- 한글이 없는 답변이나 짧은 답변(기본 80자 미만)은 원문 그대로 보여 줍니다.
- `claude -p`나 Agent SDK 같은 **비대화형 실행에는 적용하지 않습니다.** 출력을 그대로 파싱하는 스크립트가 깨지지 않게 하기 위해서입니다.
- Gemini 호출이 실패하면 원문을 그대로 보여 주고, 실패했다는 메모를 한 줄 덧붙입니다.

## 요구 사항

- Claude Code (`MessageDisplay` 훅을 지원하는 버전, v2.1.317 이상에서 확인)
- Node.js 18 이상 (`node`가 PATH에 있어야 함)
- Gemini 백엔드 둘 중 하나
  - **Gemini API 키** (권장, 빠름): [Google AI Studio](https://aistudio.google.com/apikey)에서 발급
  - **Antigravity CLI (`agy`)**: 키 없이 Google 계정으로 로그인된 `agy`를 사용합니다. 대신 매번 에이전트를 새로 띄우기 때문에 한 번에 10~13초 정도 걸립니다.

## 설치

```bash
claude plugin marketplace add kbsooo/gemini-is-good-at-korean
claude plugin install gemini-ko@gemini-is-good-at-korean
```

설치 후 Claude Code 세션을 새로 시작하면 적용됩니다.

터미널에서 바로 설정을 바꾸고 싶다면 설정 스크립트를 PATH에 연결해 두면 편합니다. (선택)

```bash
ln -sf ~/.claude/plugins/cache/gemini-is-good-at-korean/gemini-ko/*/scripts/ctl.mjs ~/.local/bin/gemini-ko
```

## 사용법

Claude Code 안에서 슬래시 명령으로 설정합니다.

| 명령 | 설명 |
|---|---|
| `/gemini-ko:ko status` | 현재 상태 보기 |
| `/gemini-ko:ko on` / `off` | 켜기 / 끄기 |
| `/gemini-ko:ko replace` | (기본) 스트리밍 중에는 숨기고, 끝나면 다듬은 글만 보여 줌 |
| `/gemini-ko:ko append` | 원문을 실시간으로 보여 주고, 끝에 다듬은 글을 덧붙임 |
| `/gemini-ko:ko model <ID>` | Gemini API에서 쓸 모델 (기본 `gemini-flash-latest`) |
| `/gemini-ko:ko agy-model <ID>` | `agy`에서 쓸 모델 (기본 `gemini-3.8-flash-low`, 목록은 `agy models`) |
| `/gemini-ko:ko backend <auto\|api\|agy>` | 백엔드 고정 (기본 `auto`: 키가 있으면 API, 없으면 agy) |

슬래시 명령은 Claude에게 한 턴을 요청하는 방식입니다. Claude를 거치지 않으려면 Claude Code 입력창에서 `!`를 붙여 셸 명령으로 실행하세요.

```text
! gemini-ko off
! gemini-ko key <GEMINI_API_KEY>
```

API 키는 `GEMINI_API_KEY` 환경 변수로 넘겨도 되고, `gemini-ko key <KEY>`로 `~/.claude/gemini-ko/gemini_api_key`(권한 600)에 저장해도 됩니다.

## 설정 파일

`~/.claude/gemini-ko/config.json`에서 직접 바꿀 수도 있습니다.

```json
{
  "enabled": true,
  "mode": "replace",
  "backend": "auto",
  "apiModel": "gemini-flash-latest",
  "agyModel": "gemini-3.8-flash-low",
  "minChars": 80,
  "timeoutSec": 100,
  "showBadge": true,
  "includeNonInteractive": false
}
```

동작 기록은 `~/.claude/gemini-ko/log.txt`에 남습니다.

## 주의할 점

- **데이터가 Google로 전송됩니다.** Claude의 답변(코드블록 제외 본문)이 Gemini로 보내집니다. 특히 **무료 Gemini API 키**를 쓰면, 보낸 내용이 Google의 제품·모델 개선에 쓰일 수 있고 사람 검토자가 볼 수도 있습니다([Gemini API 추가 약관](https://ai.google.dev/gemini-api/terms)의 Unpaid Services 항목). 회사 코드나 민감한 내용을 다룬다면 결제가 연결된 키를 쓰거나 이 플러그인을 꺼 두세요.
- **기다리는 시간이 생깁니다.** `replace` 모드에서는 답변이 끝날 때까지 화면이 비어 있다가, 다듬는 시간(API는 보통 몇 초, agy는 10~13초)이 지나야 글이 나타납니다. 진행 상황을 보고 싶다면 `append` 모드를 쓰세요.
- **뉘앙스가 조금 바뀔 수 있습니다.** 정보를 더하거나 빼지 말라고 지시하지만, 다시 쓰는 과정에서 어조가 약간 달라질 수 있습니다. 정확한 원문이 필요하면 끄거나 `append` 모드를 쓰세요. 원문은 transcript에 그대로 남아 있습니다.
- `agy` 백엔드를 쓰면 답변마다 Antigravity에 대화 기록이 하나씩 쌓일 수 있습니다.

## 함께 쓰면 좋은 것

- [snflkd/fluent-korean](https://github.com/snflkd/fluent-korean): Claude가 처음부터 명확한 한국어를 쓰도록 시스템 프롬프트에서 규율하는 output-style입니다. fluent-korean이 원문 품질을 올리고, 이 플러그인이 화면에 보이기 전에 한 번 더 다듬습니다. 둘을 같이 써도 충돌하지 않습니다.

## 제거

```bash
claude plugin uninstall gemini-ko@gemini-is-good-at-korean
rm -rf ~/.claude/gemini-ko   # 설정, 로그, 저장한 API 키 삭제
```

## 라이선스

MIT
