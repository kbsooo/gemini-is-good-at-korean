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

Gemini API 키를 등록한 경우(권장):

1. Claude가 답변을 쓰는 동안, 문단이 끝날 때마다 그때까지 쌓인 글(기본 400자 이상)을 Gemini에 보내 다듬습니다.
2. 다듬은 글을 그 자리에 바로 표시합니다. 답변이 끝나기를 기다리지 않으므로 글이 문단 묶음 단위로 차례차례 나타납니다.
3. 답변 끝에 어떤 모델로 몇 묶음을 다듬었는지 한 줄로 알려 줍니다.

API 키 없이 Antigravity CLI(`agy`)만 쓰는 경우에는 답변이 끝난 뒤 전체를 한 번에 다듬어 표시합니다.

중요한 성질:

- **표시 전용입니다.** 대화 기록(transcript)과 Claude가 보는 컨텍스트에는 원문이 그대로 남습니다. Claude의 작업 흐름에는 영향을 주지 않습니다.
- **도구 실행을 늦추지 않습니다.** 다듬는 동안에도 Claude의 도구 호출은 기다리지 않고 바로 실행됩니다. 늦어지는 것은 글이 화면에 나타나는 시점뿐입니다.
- **코드는 건드리지 않습니다.** 코드블록, `인라인 코드`, URL은 Gemini에 보내기 전에 토큰으로 바꿔 두었다가 나중에 원래대로 되돌립니다. Gemini가 토큰을 하나라도 잃어버리면 다시 쓴 결과를 버리고 원문을 보여 줍니다.
- **결과가 이상하면 버립니다.** 다시 쓴 글의 길이가 원문의 절반보다 짧거나 3배보다 길면(요약했거나 엉뚱한 답을 한 경우) 원문을 보여 줍니다.
- 한글이 거의 없는 글, 짧은 글(기본 80자 미만), 아주 긴 글(기본 20,000자 초과)은 원문 그대로 보여 줍니다.
- `claude -p`나 Agent SDK 같은 **비대화형 실행에는 적용하지 않습니다.** 출력을 그대로 파싱하는 스크립트가 깨지지 않게 하기 위해서입니다.
- Gemini 호출이 실패하면 원문을 그대로 보여 주고, 실패했다는 메모를 한 줄 덧붙입니다.

## 요구 사항

- Claude Code (`MessageDisplay` 훅을 지원하는 버전. v2.1.323에서 동작을 확인했습니다)
- Node.js 18 이상 (`node`가 PATH에 있어야 함)
- Gemini 백엔드. 둘 다 있으면 API를 먼저 쓰고, API를 쓸 수 없을 때 `agy`로 넘어갑니다.
  - **Gemini API 키** (권장): [Google AI Studio](https://aistudio.google.com/apikey)에서 무료로 발급합니다. 문단 묶음 하나를 다듬는 데 보통 1~3초가 걸립니다.
  - **Antigravity CLI (`agy`)**: 키 없이 Google 계정으로 로그인된 `agy`를 사용합니다. 매번 에이전트를 새로 띄우기 때문에 한 번에 10~15초(긴 답변은 20초 이상) 걸립니다. `--settings` 옵션을 지원하는 버전이 필요합니다.

## 설치

```bash
claude plugin marketplace add kbsooo/gemini-is-good-at-korean
claude plugin install gemini-ko@gemini-is-good-at-korean
```

설치 후 Claude Code 세션을 새로 시작하면 적용됩니다.

터미널에서 바로 설정을 바꾸고 싶다면 `gemini-ko` 명령을 만들어 두면 편합니다. (선택) 플러그인을 업데이트해도 항상 최신 버전의 스크립트를 찾아 실행합니다.

```bash
cat > ~/.local/bin/gemini-ko <<'EOF'
#!/bin/sh
exec node "$(ls -d ~/.claude/plugins/cache/gemini-is-good-at-korean/gemini-ko/*/scripts/ctl.mjs | sort -V | tail -1)" "$@"
EOF
chmod +x ~/.local/bin/gemini-ko
```

## 사용법

Claude Code 안에서 슬래시 명령으로 설정합니다.

| 명령 | 설명 |
|---|---|
| `/gemini-ko:ko status` | 현재 상태, 모델 시도 순서, 한도 때문에 쉬고 있는 모델 보기 |
| `/gemini-ko:ko on` / `off` | 켜기 / 끄기 |
| `/gemini-ko:ko replace` | (기본) 원문은 숨기고 다듬은 글만 보여 줌 |
| `/gemini-ko:ko append` | 원문을 실시간으로 보여 주고, 끝에 다듬은 글을 덧붙임 |
| `/gemini-ko:ko stream on` / `off` | 문단 묶음 단위로 바로 보여 줄지(`on`, 기본), 답변이 끝난 뒤 한 번에 보여 줄지(`off`) |
| `/gemini-ko:ko model <ID>` | 맨 먼저 시도할 Gemini API 모델. `model default`로 되돌림 |
| `/gemini-ko:ko test` | 모델별로 한 번씩 호출해서 지금 속도를 확인 (모델마다 요청 1회 사용) |
| `/gemini-ko:ko reset` | 한도 때문에 쉬고 있는 모델을 바로 다시 시도하게 함 |
| `/gemini-ko:ko agy-model <ID>` | `agy`에서 쓸 모델 (기본 `gemini-3.8-flash-low`, 목록은 `agy models`) |
| `/gemini-ko:ko backend <auto\|api\|agy>` | 백엔드 고정 (기본 `auto`) |

슬래시 명령은 Claude에게 한 턴을 요청하는 방식입니다. 위에서 `gemini-ko` 명령을 만들어 두었다면, 터미널에서 `gemini-ko off`처럼 바로 실행할 수 있습니다. Claude Code 입력창에서 `! gemini-ko off`로 실행해도 됩니다(`~/.local/bin`이 PATH에 있어야 합니다).

### API 키 등록

**API 키는 Claude Code 밖의 일반 터미널에서 등록하세요.** Claude Code 안에서(`!` 명령, 슬래시 명령) 키를 입력하면 그 키가 대화 기록에 남고 Claude에게도 전달됩니다. 그래서 `gemini-ko key`는 Claude Code 안에서는 실행을 거부합니다.

```bash
gemini-ko key          # 키를 물어봅니다. 입력한 내용은 화면에 보이지 않습니다.
gemini-ko key-clear    # 저장한 키 삭제
```

키는 `~/.claude/gemini-ko/gemini_api_key`(권한 600)에 저장됩니다. 파일 대신 `GEMINI_API_KEY` 환경 변수를 써도 됩니다.

## 모델과 무료 한도

Gemini API 무료 등급은 모델마다 분당·하루 요청 수 한도가 있습니다. 아래는 2026-11-13에 무료 등급 프로젝트 하나에서 확인한 값과 직접 잰 속도입니다. 한도는 계정과 시기에 따라 다를 수 있으니 [AI Studio의 비율 제한 페이지](https://aistudio.google.com/rate-limit)에서 확인하세요.

| 모델 | 분당 요청 | 하루 요청 | 약 380자 글을 다듬는 데 걸린 시간 |
|---|---|---|---|
| `gemini-3.5-flash-lite` | 15 | 500 | 1.9~3.7초 |
| `gemini-3.1-flash-lite` | 15 | 500 | 1.5~1.7초. 다만 16번 중 4번은 응답이 몇 초씩 늦었음 |
| `gemini-4-hydrogen` | 5 | 20 | 9.1초 |
| `gemini-3.6-flash` | 5 | 20 | 18.8초 |
| `gemini-3.8-flash` | 5 | 20 | 측정 실패 (116초 뒤 "수요가 많다"는 503 오류) |

그래서 기본 설정은 하루 한도가 넉넉하고 빠른 Flash-Lite 계열을 차례로 씁니다.

```
gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemini-flash-lite-latest → agy
```

- 앞 모델이 한도를 넘겼거나 오류를 내면 바로 다음 모델로 넘어갑니다.
- 응답이 평소보다 늦으면 기다리는 동안 다음 모델에도 같은 요청을 보내고, 먼저 도착한 답을 씁니다.
- 한도를 넘긴 모델은 API가 알려 준 시각까지 건너뜁니다. 분당 한도는 수십 초, 하루 한도는 태평양 시간 자정(한국 시간 오후 4~5시)까지입니다.
- 쓸 수 있는 API 모델이 하나도 없으면, 그 답변은 `agy`로 한 번에 다듬습니다.

Gemini 4 Hydrogen처럼 더 좋은 모델을 쓰고 싶다면 맨 앞에 두면 됩니다. 무료 등급에서는 하루 20회뿐이라, 한도를 다 쓰면 자동으로 Flash-Lite 계열로 넘어갑니다.

```bash
gemini-ko model gemini-4-hydrogen
```

### 요금이 나가나요?

결제 계정을 연결하지 않은 프로젝트의 키는 무료 등급으로만 동작합니다. 청구할 결제 수단이 없으므로 요금이 나갈 수 없고, 한도를 넘기면 요청이 거절될 뿐입니다. 실제로 하루 한도가 20회인 모델에 25번 요청해 보니 21번 성공한 뒤부터는 `429 RESOURCE_EXHAUSTED`로 거절되었습니다.

반대로 프로젝트에 결제를 연결하면 유료 등급이 되어 쓴 만큼 요금이 나옵니다. [AI Studio의 API 키 목록](https://aistudio.google.com/api-keys)에서 키의 결제 등급이 "무료 등급"인지 확인하세요.

## 설정 파일

`~/.claude/gemini-ko/config.json`에서 직접 바꿀 수도 있습니다. 아래는 기본값입니다.

```json
{
  "enabled": true,
  "mode": "replace",
  "backend": "auto",
  "apiModel": "",
  "apiModels": ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
  "stream": true,
  "blockChars": 400,
  "agyModel": "gemini-3.8-flash-low",
  "minChars": 80,
  "maxChars": 20000,
  "timeoutSec": 90,
  "showBadge": true,
  "includeNonInteractive": false
}
```

- `apiModel`: 맨 먼저 시도할 모델. 비워 두면 `apiModels` 순서대로 시도합니다.
- `blockChars`: 한 번에 다듬는 문단 묶음의 최소 글자 수입니다. 줄이면 글이 더 빨리 나타나지만 요청 수가 늘어 한도를 빨리 씁니다.
- `timeoutSec`: 답변 전체를 한 번에 다듬을 때의 시간 한도입니다(최대 120초). 문단 묶음 단위로 다듬을 때는 묶음마다 25초입니다. 시간을 넘기면 원문을 보여 줍니다.

동작 기록(시각, 모델, 걸린 시간, 글자 수)은 `~/.claude/gemini-ko/log.txt`에 남습니다. 답변 본문은 기록하지 않습니다.

## 주의할 점

- **데이터가 Google로 전송됩니다.** Claude의 답변 본문(코드블록, 인라인 코드, URL 제외)이 Gemini로 보내집니다. 본문에 적힌 파일 경로, 이름, 숫자 같은 내용은 그대로 전송됩니다. 특히 **무료 Gemini API 키**를 쓰면, 보낸 내용이 Google의 제품·모델 개선에 쓰일 수 있고 사람 검토자가 볼 수도 있습니다([Gemini API 추가 약관](https://ai.google.dev/gemini-api/terms)의 Unpaid Services 항목). 회사 코드나 민감한 내용을 다룬다면 결제가 연결된 키를 쓰거나 이 플러그인을 꺼 두세요.
- **글이 조금 늦게 나타납니다.** `replace` 모드에서는 문단 묶음이 끝나고 다듬는 시간(API는 보통 1~3초)이 지나야 그 부분이 화면에 나타납니다. Claude가 쓰는 과정을 실시간으로 보고 싶다면 `append` 모드를 쓰세요.
- **답변을 중간에 끊으면(Esc) 아직 표시되지 않은 끝부분은 보이지 않습니다.** 이미 표시된 부분은 그대로 남습니다. 원문 전체는 transcript에 남아 있습니다.
- **뉘앙스가 조금 바뀔 수 있습니다.** 정보를 더하거나 빼지 말라고 지시하지만, 다시 쓰는 과정에서 어조가 약간 달라질 수 있습니다. 문단 묶음마다 따로 다듬기 때문에 묶음 사이의 말투가 조금 다를 수도 있습니다. 정확한 원문이 필요하면 끄거나 `append` 모드를 쓰세요.
- **무료 한도는 답변이 많은 날 모자랄 수 있습니다.** 기본 모델 두 개를 합쳐 하루 약 1,000번 다듬을 수 있습니다. 한도를 다 쓰면 `agy`로 넘어가서 느려지고, `agy`도 없으면 원문이 표시됩니다. 요청 수를 아끼려면 `stream off`나 더 큰 `blockChars`를 쓰세요.
- **`agy` 백엔드는 도구를 가진 에이전트입니다.** `agy`는 단순한 모델 호출이 아니라 파일을 읽고 명령을 실행할 수 있는 에이전트입니다. Claude의 답변에 악의적인 지시문이 섞여 들어온 경우(예: Claude가 읽은 웹 페이지를 인용한 경우)에 대비해, 이 플러그인은 `agy`를 부를 때마다 `--settings`로 명령 실행, 파일 읽기/쓰기, MCP 도구를 모두 막습니다. 다만 **웹 페이지 읽기와 웹 검색 도구는 이 설정으로 막히지 않는 것을 확인했습니다.** 로컬 파일은 읽을 수 없으므로 새어 나갈 수 있는 것은 Gemini에 보낸 답변 본문뿐입니다. Gemini API 경로에는 도구가 없어서 이런 위험이 없습니다.
- `agy` 백엔드는 답변마다 Antigravity에 대화 기록을 하나씩 남기고, 한 번 호출할 때마다 에이전트 기본 프롬프트로 입력 토큰을 약 14,000개 씁니다. Antigravity 사용량 한도에 영향을 줄 수 있습니다.

## 함께 쓰면 좋은 것

- [snflkd/fluent-korean](https://github.com/snflkd/fluent-korean): Claude가 처음부터 명확한 한국어를 쓰도록 시스템 프롬프트에서 규율하는 output-style입니다. fluent-korean이 원문 품질을 올리고, 이 플러그인이 화면에 보이기 전에 한 번 더 다듬습니다. 둘을 같이 써도 충돌하지 않습니다.

## 제거

```bash
claude plugin uninstall gemini-ko@gemini-is-good-at-korean
rm -rf ~/.claude/gemini-ko   # 설정, 로그, 저장한 API 키 삭제
```

## 라이선스

MIT
