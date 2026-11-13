#!/usr/bin/env node
// gemini-ko: Claude Code MessageDisplay hook.
// Claude의 답변을 화면에 그리기 직전에 Gemini로 자연스러운 한국어로 다시 써서 보여준다.
// 표시 전용: transcript와 Claude가 보는 컨텍스트는 원문 그대로다.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const STATE_DIR = process.env.GEMINI_KO_HOME || path.join(os.homedir(), '.claude', 'gemini-ko');
const CONFIG_PATH = path.join(STATE_DIR, 'config.json');
const BUF_DIR = path.join(STATE_DIR, 'buf');
const LOG_PATH = path.join(STATE_DIR, 'log.txt');

const DEFAULTS = {
  enabled: true,
  // replace: 스트리밍 중에는 숨기고, 끝나면 Gemini 정리본만 보여준다.
  // append : 원문을 그대로 스트리밍하고, 끝에 Gemini 정리본을 덧붙인다.
  mode: 'replace',
  // auto: GEMINI_API_KEY(또는 키 파일)가 있으면 API, 없으면 Antigravity CLI(agy).
  backend: 'auto',
  apiModel: 'gemini-flash-latest',
  agyModel: 'gemini-3.8-flash-low',
  agyPath: fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'agy')) ? path.join(os.homedir(), '.local', 'bin', 'agy') : 'agy',
  minChars: 80, // 이보다 짧은 답변은 원문 그대로
  timeoutSec: 100,
  showBadge: true,
  // claude -p / Agent SDK 같은 비대화형 실행은 출력을 파싱하는 스크립트가 많아서 기본적으로 건드리지 않는다.
  includeNonInteractive: false,
};

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function log(msg) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function out(displayContent) {
  if (displayContent === undefined) {
    process.stdout.write('{}');
  } else {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: 'MessageDisplay', displayContent } }),
    );
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}

// ---------- 코드/경로 보호 ----------
// 코드 블록과 인라인 코드는 토큰으로 바꿔서 Gemini가 건드리지 못하게 한다.
function protect(text) {
  const slots = [];
  const put = (m) => {
    slots.push(m);
    return `⟦C${slots.length - 1}⟧`;
  };
  let t = text.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, (m, pre) => pre + put(m.slice(pre.length)));
  t = t.replace(/`[^`\n]+`/g, put);
  return { text: t, slots };
}

function restore(text, slots) {
  for (let i = 0; i < slots.length; i++) {
    const tok = `⟦C${i}⟧`;
    if (!text.includes(tok)) return null; // 토큰이 사라지면 신뢰할 수 없음
    text = text.split(tok).join(slots[i]);
  }
  return text;
}

const PROMPT = `너는 한국어 문장 다듬기 전문가다. 아래 [원문]은 AI 코딩 에이전트가 사용자에게 한 답변이다.
이 답변을 한국 사람이 한 번 읽고 바로 이해할 수 있는 자연스러운 한국어로 다시 써라.

반드시 지킬 것:
- 의미, 사실, 숫자, 결론, 판단의 강도(확실/추정)를 바꾸지 마라. 정보를 더하거나 빼거나 요약하지 마라.
- 조사와 어미가 빠진 명사 나열식 문장, 번역투, 어색한 직역을 완전하고 자연스러운 문장으로 고쳐라.
- 파일 경로, 명령어, 함수/변수 이름, URL, 에러 메시지, 영어 기술 용어는 그대로 둬라.
- ⟦C숫자⟧ 형태의 토큰은 코드이므로 글자 하나도 바꾸지 말고, 지우지 말고, 원래 자리에 그대로 둬라.
- 마크다운 구조(제목, 목록, 번호, 표, 굵게, 인용)는 유지하라.
- 원문의 말투(존댓말/반말)를 따르되 문장 끝맺음을 자연스럽게 통일하라.
- 원문이 이미 자연스러우면 거의 그대로 둬라.
- 다시 쓴 본문만 출력하라. "다음은 ~입니다" 같은 머리말, 설명, 코드펜스 감싸기는 하지 마라.

[원문]
`;

// ---------- 백엔드 ----------
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    return fs.readFileSync(path.join(STATE_DIR, 'gemini_api_key'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

async function viaApi(prompt, cfg, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.apiModel}:generateContent`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutSec * 1000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: ctl.signal,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`API ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!t.trim()) throw new Error('API empty response');
    return t;
  } finally {
    clearTimeout(timer);
  }
}

function viaAgy(prompt, cfg) {
  return new Promise((resolve, reject) => {
    const work = path.join(STATE_DIR, 'agy-work');
    fs.mkdirSync(work, { recursive: true });
    const args = ['--disable-slash-commands', '--model', cfg.agyModel, '--output-format', 'json', `-p=${prompt}`];
    const p = spawn(cfg.agyPath, args, { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '';
    let se = '';
    p.stdout.on('data', (c) => (so += c));
    p.stderr.on('data', (c) => (se += c));
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('agy timeout'));
    }, cfg.timeoutSec * 1000);
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      try {
        const line = so.trim().split('\n').filter((l) => l.startsWith('{')).pop();
        const j = JSON.parse(line);
        if (j.status !== 'SUCCESS' || !j.response?.trim()) throw new Error(`agy status ${j.status}`);
        resolve(j.response);
      } catch (e) {
        reject(new Error(`agy failed (code ${code}): ${(se || so).slice(0, 300)}`));
      }
    });
  });
}

async function rewrite(original, cfg) {
  const { text, slots } = protect(original);
  const prompt = PROMPT + text;
  const key = cfg.backend === 'agy' ? null : apiKey();
  if (cfg.backend === 'api' && !key) throw new Error('backend=api 인데 API 키가 없음');
  let used = key ? `api:${cfg.apiModel}` : `agy:${cfg.agyModel}`;
  let r;
  if (key) {
    try {
      r = await viaApi(prompt, cfg, key);
    } catch (e) {
      if (cfg.backend === 'api') throw e;
      log(`api fail, fallback to agy: ${e.message}`);
      used = `agy:${cfg.agyModel} (API 실패로 대체)`;
      r = await viaAgy(prompt, cfg);
    }
  } else {
    r = await viaAgy(prompt, cfg);
  }
  r = r.replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/, '$1'); // 통째로 감싼 펜스 제거
  const restored = restore(r.trim(), slots);
  if (restored === null) throw new Error('코드 토큰 손실');
  return { text: restored, used };
}

// ---------- 메인 ----------
const HANGUL = /[\uAC00-\uD7A3]/;

async function main() {
  const raw = await readStdin();
  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    return out();
  }
  const cfg = loadConfig();
  if (!cfg.enabled || ev.hook_event_name !== 'MessageDisplay') return out();
  const entry = process.env.CLAUDE_CODE_ENTRYPOINT || '';
  if (!cfg.includeNonInteractive && entry.startsWith('sdk')) return out();

  fs.mkdirSync(BUF_DIR, { recursive: true });
  const id = String(ev.message_id || 'unknown').replace(/[^\w-]/g, '');
  const buf = path.join(BUF_DIR, `${id}.txt`);
  const delta = ev.delta || '';

  if (!ev.final) {
    fs.appendFileSync(buf, delta);
    // replace 모드에서는 스트리밍 조각을 숨긴다. append 모드에서는 원문 그대로 보여준다.
    return cfg.mode === 'append' ? out() : out('');
  }

  let full = delta;
  try {
    full = fs.readFileSync(buf, 'utf8') + delta;
    fs.unlinkSync(buf);
  } catch {}

  // 마지막 조각만 보여줘야 하는 경우(append) vs 전체를 보여줘야 하는 경우(replace)
  const passthrough = cfg.mode === 'append' ? delta : full;

  if (full.trim().startsWith('gemini-ko:') || full.trim().length < cfg.minChars || !HANGUL.test(full)) return out(cfg.mode === 'append' ? undefined : full);

  const t0 = Date.now();
  try {
    const { text, used } = await rewrite(full, cfg);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    log(`ok ${used} ${sec}s len=${full.length}`);
    const badge = cfg.showBadge ? `\n\n— Gemini로 다듬음 (${used}, ${sec}s)` : '';
    if (cfg.mode === 'append') {
      return out(`${delta}\n\n───── Gemini 정리 ─────\n\n${text}${badge}\n`);
    }
    return out(`${text}${badge}\n`);
  } catch (e) {
    log(`fail ${e.message}`);
    const note = `\n\n(gemini-ko: 다듬기 실패, 원문 표시. ${String(e.message).slice(0, 80)})\n`;
    return out(passthrough + note);
  }
}

main().catch((e) => {
  log(`crash ${e.stack || e}`);
  out();
});
