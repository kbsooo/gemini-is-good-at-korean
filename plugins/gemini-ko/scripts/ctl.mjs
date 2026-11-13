#!/usr/bin/env node
// gemini-ko 설정: on | off | replace | append | status | key [API_KEY] | key-clear
//                 model <API 모델 ID> | agy-model <agy 모델 ID> | backend <auto|api|agy>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = process.env.GEMINI_KO_HOME || path.join(os.homedir(), '.claude', 'gemini-ko');
const cfgPath = path.join(dir, 'config.json');
const keyPath = path.join(dir, 'gemini_api_key');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
const [cmd = 'status', arg] = process.argv.slice(2).join(' ').trim().split(/\s+/);
const save = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
const fail = (msg) => { console.log(msg); process.exit(1); };

// 화면에 보이지 않게 한 줄 입력받는다. 파이프로 들어오면 그대로 읽는다.
function readSecret(label) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let d = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (d += c));
      stdin.on('end', () => resolve(d.trim()));
      return;
    }
    process.stderr.write(label);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let d = '';
    stdin.on('data', (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); process.stderr.write('\n'); return resolve(d.trim()); }
        if (c === '\u0003') { stdin.setRawMode(false); process.exit(130); }
        if (c === '\u007f') d = d.slice(0, -1); else d += c;
      }
    });
  });
}

switch (cmd) {
  case 'on': cfg.enabled = true; save(); break;
  case 'off': cfg.enabled = false; save(); break;
  case 'replace': case 'append': cfg.enabled = true; cfg.mode = cmd; save(); break;
  case 'key': {
    // Claude Code 안에서(! 명령, 슬래시 명령, Bash 도구) 입력하면 키가 대화 기록에 남아 Claude에게도 전달된다.
    if (process.env.CLAUDECODE) fail('API 키는 Claude Code 밖의 일반 터미널에서 등록하세요. 여기서 입력하면 키가 대화 기록에 남습니다.');
    const k = arg || (await readSecret('Gemini API 키 (입력 내용은 보이지 않습니다): '));
    if (!k) fail('키가 비어 있습니다.');
    fs.writeFileSync(keyPath, k, { mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
    break;
  }
  case 'key-clear': try { fs.unlinkSync(keyPath); } catch {} break;
  case 'model': if (!arg) fail('사용법: gemini-ko model <모델 ID>  예: gemini-flash-latest'); cfg.apiModel = arg; save(); break;
  case 'agy-model': if (!arg) fail('사용법: gemini-ko agy-model <ID>  (목록: agy models)'); cfg.agyModel = arg; save(); break;
  case 'backend': if (!['auto', 'api', 'agy'].includes(arg)) fail('사용법: gemini-ko backend <auto|api|agy>'); cfg.backend = arg; save(); break;
  case 'status': break;
  default: fail('사용법: gemini-ko [on|off|replace|append|status|key|key-clear|model <ID>|agy-model <ID>|backend <auto|api|agy>]');
}

const hasKey = !!process.env.GEMINI_API_KEY || fs.existsSync(keyPath);
const on = cfg.enabled !== false;
const be = cfg.backend && cfg.backend !== 'auto' ? cfg.backend : (hasKey ? 'api' : 'agy');
const model = be === 'api' ? (cfg.apiModel || 'gemini-flash-latest') : (cfg.agyModel || 'gemini-3.8-flash-low');
console.log(`gemini-ko: ${on ? '켜짐' : '꺼짐'} | 모드: ${cfg.mode || 'replace'} | 백엔드: ${be === 'api' ? 'Gemini API' : 'Antigravity agy'} (${model})`);
