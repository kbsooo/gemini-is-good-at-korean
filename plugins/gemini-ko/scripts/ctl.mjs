#!/usr/bin/env node
// gemini-ko 설정 명령.
//   on | off | replace | append | status
//   stream on|off          문단 단위로 바로 보여줄지 (replace 모드 + Gemini API일 때)
//   model <ID>|default     맨 먼저 시도할 Gemini API 모델
//   agy-model <ID>         agy에서 쓸 모델
//   backend auto|api|agy
//   key | key-clear        Gemini API 키 등록/삭제 (Claude Code 밖에서만)
//   test                   모델별로 한 번씩 호출해서 속도 확인
//   reset                  한도 대기 상태 초기화
import fs from 'node:fs';
import {
  STATE_DIR, CONFIG_PATH, KEY_PATH, DEFAULTS, loadConfig, modelChain, ensureDirs,
  cooldown, clearCooldowns, KEY_SLOT, apiKey, rewriteBlock,
} from './lib.mjs';

ensureDirs();
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
const [cmd = 'status', arg] = process.argv.slice(2).join(' ').trim().split(/\s+/);
const save = () => fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
const fail = (msg) => { console.log(msg); process.exit(1); };
const USAGE = '사용법: gemini-ko [on|off|replace|append|status|stream on|off|model <ID>|default|agy-model <ID>|backend auto|api|agy|key|key-clear|test|reset]';

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

const WHY = { 'quota-day': '오늘 한도 소진', 'quota-minute': '분당 한도 초과', timeout: '응답 없음', slow: '응답이 느림', unavailable: '서버 혼잡', 'not-found': '쓸 수 없는 모델', 'bad-request': '요청 거부됨', network: '연결 실패', auth: 'API 키 거부됨' };
function coolNote(name) {
  const c = cooldown(name);
  if (!c) return '';
  const when = new Date(c.until);
  const sec = Math.round((c.until - Date.now()) / 1000);
  const tomorrow = when.toDateString() !== new Date().toDateString() ? '내일 ' : '';
  const until = sec < 120 ? `${sec}초 뒤` : `${tomorrow}${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}에`;
  return ` (${WHY[c.why] || '쉬는 중'}, ${until} 다시 시도)`;
}

async function test(full) {
  const sample = '원인 확인 완료. 설정 파일 경로 오류 → 로딩 실패. 경로 수정 후 재시작 필요. 추가 확인 사항 없음. 다음 단계 진행 여부 결정 필요. 테스트 커버리지 부족 문제 별도 존재.';
  if (!apiKey()) fail('API 키가 없습니다. 일반 터미널에서 gemini-ko key 로 등록하세요.');
  let shown = false;
  for (const m of modelChain(full)) {
    if (cooldown(m)) { console.log(`${m}: 건너뜀${coolNote(m)}`); continue; }
    const t0 = Date.now();
    try {
      const r = await rewriteBlock(sample, { ...full, backend: 'api', apiModel: m, apiModels: [m] }, { deadline: t0 + 30_000, allowAgy: false });
      console.log(`${m}: ${((Date.now() - t0) / 1000).toFixed(1)}초`);
      if (!shown) { console.log(`  예) ${r.text}`); shown = true; }
    } catch (e) {
      console.log(`${m}: 실패 - ${e.message}`);
    }
  }
}

switch (cmd) {
  case 'on': cfg.enabled = true; save(); break;
  case 'off': cfg.enabled = false; save(); break;
  case 'replace': case 'append': cfg.enabled = true; cfg.mode = cmd; save(); break;
  case 'stream': if (!['on', 'off'].includes(arg)) fail('사용법: gemini-ko stream on|off'); cfg.stream = arg === 'on'; save(); break;
  case 'key': {
    // Claude Code 안에서(! 명령, 슬래시 명령, Bash 도구) 입력하면 키가 대화 기록에 남아 Claude에게도 전달된다.
    if (process.env.CLAUDECODE) fail('API 키는 Claude Code 밖의 일반 터미널에서 등록하세요. 여기서 입력하면 키가 대화 기록에 남습니다.');
    const k = arg || (await readSecret('Gemini API 키 (입력 내용은 보이지 않습니다): '));
    if (!k) fail('키가 비어 있습니다.');
    fs.writeFileSync(KEY_PATH, k, { mode: 0o600 });
    fs.chmodSync(KEY_PATH, 0o600);
    clearCooldowns();
    break;
  }
  case 'key-clear': try { fs.unlinkSync(KEY_PATH); } catch {} break;
  case 'model':
    if (!arg) fail('사용법: gemini-ko model <모델 ID>  (예: gemini-4-hydrogen)  또는  gemini-ko model default');
    if (arg === 'default') delete cfg.apiModel; else cfg.apiModel = arg;
    save();
    break;
  case 'agy-model': if (!arg) fail('사용법: gemini-ko agy-model <ID>  (목록: agy models)'); cfg.agyModel = arg; save(); break;
  case 'backend': if (!['auto', 'api', 'agy'].includes(arg)) fail('사용법: gemini-ko backend auto|api|agy'); cfg.backend = arg; save(); break;
  case 'reset': clearCooldowns(); break;
  case 'test': await test(loadConfig()); process.exit(0);
  case 'status': break;
  default: fail(USAGE);
}

const full = loadConfig();
const hasKey = !!apiKey();
const useApi = full.backend !== 'agy' && hasKey;
const useAgy = full.backend !== 'api';
const how = full.mode === 'append' ? 'append (원문 뒤에 덧붙임)' : useApi && full.stream ? 'replace (문단 단위로 바로 표시)' : 'replace (답변이 끝난 뒤 표시)';
console.log(`gemini-ko: ${full.enabled ? '켜짐' : '꺼짐'} | 모드: ${how} | 백엔드: ${useApi ? 'Gemini API' : useAgy ? 'Antigravity agy' : '없음 (API 키 필요)'}`);
const steps = [];
if (useApi) for (const m of modelChain(full)) steps.push(m + coolNote(m));
if (useAgy) steps.push(`agy:${full.agyModel}`);
if (steps.length > 1 || (useApi && steps.length)) console.log(`  시도 순서: ${steps.join(' → ')}`);
if (useApi && cooldown(KEY_SLOT)) console.log(`  API 키가 거부되어 API를 잠시 건너뜁니다${coolNote(KEY_SLOT)}. 키를 다시 등록하면 바로 풀립니다.`);
