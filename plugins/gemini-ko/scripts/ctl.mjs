#!/usr/bin/env node
// gemini-ko 설정: on | off | replace | append | status | key <API_KEY> | key-clear
//                 model <API 모델 ID> | agy-model <agy 모델 ID> | backend <auto|api|agy>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const dir = process.env.GEMINI_KO_HOME || path.join(os.homedir(), '.claude', 'gemini-ko');
const cfgPath = path.join(dir, 'config.json');
const keyPath = path.join(dir, 'gemini_api_key');
fs.mkdirSync(dir, { recursive: true });
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
const [cmd = 'status', arg] = process.argv.slice(2).join(' ').trim().split(/\s+/);
const save = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
switch (cmd) {
  case 'on': cfg.enabled = true; save(); break;
  case 'off': cfg.enabled = false; save(); break;
  case 'replace': case 'append': cfg.enabled = true; cfg.mode = cmd; save(); break;
  case 'key':
    if (!arg) { console.log('사용법: gemini-ko key <GEMINI_API_KEY>'); process.exit(1); }
    fs.writeFileSync(keyPath, arg.trim(), { mode: 0o600 }); break;
  case 'model': if (!arg) { console.log('사용법: gemini-ko model <모델 ID>  예: gemini-flash-latest'); process.exit(1); } cfg.apiModel = arg; save(); break;
  case 'agy-model': if (!arg) { console.log('사용법: gemini-ko agy-model <ID>  (목록: agy models)'); process.exit(1); } cfg.agyModel = arg; save(); break;
  case 'backend': if (!['auto','api','agy'].includes(arg)) { console.log('사용법: gemini-ko backend <auto|api|agy>'); process.exit(1); } cfg.backend = arg; save(); break;
  case 'key-clear': try { fs.unlinkSync(keyPath); } catch {} break;
  case 'status': break;
  default: console.log('사용법: gemini-ko [on|off|replace|append|status|key <KEY>|key-clear|model <ID>|agy-model <ID>|backend <auto|api|agy>]'); process.exit(1);
}
const hasKey = !!process.env.GEMINI_API_KEY || fs.existsSync(keyPath);
const on = cfg.enabled !== false;
const be = cfg.backend && cfg.backend !== 'auto' ? cfg.backend : (hasKey ? 'api' : 'agy');
const model = be === 'api' ? (cfg.apiModel || 'gemini-flash-latest') : (cfg.agyModel || 'gemini-3.8-flash-low');
console.log(`gemini-ko: ${on ? '켜짐' : '꺼짐'} | 모드: ${cfg.mode || 'replace'} | 백엔드: ${be === 'api' ? 'Gemini API' : 'Antigravity agy'} (${model})`);
