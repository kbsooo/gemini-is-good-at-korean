---
description: Gemini 한국어 다듬기 설정 (on | off | replace | append | status | model <ID> | agy-model <ID> | backend <auto|api|agy>)
argument-hint: "[on|off|replace|append|status|model <ID>|agy-model <ID>|backend <auto|api|agy>]"
allowed-tools: Bash(node:*)
---
!`node "${CLAUDE_PLUGIN_ROOT}/scripts/ctl.mjs" $ARGUMENTS`

위 출력 결과 한 줄만 그대로 사용자에게 보여주세요. 다른 말은 덧붙이지 마세요.
