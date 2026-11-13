---
description: Gemini 한국어 다듬기 설정 (on | off | replace | append | status | stream on|off | model <ID> | test)
argument-hint: "[on|off|replace|append|status|stream on|off|model <ID>|default|agy-model <ID>|backend auto|api|agy|test|reset]"
allowed-tools: Bash(node:*)
---
!`node "${CLAUDE_PLUGIN_ROOT}/scripts/ctl.mjs" $ARGUMENTS`

위 출력을 한 글자도 바꾸지 말고 그대로 사용자에게 보여주세요. 다른 말은 덧붙이지 마세요.
