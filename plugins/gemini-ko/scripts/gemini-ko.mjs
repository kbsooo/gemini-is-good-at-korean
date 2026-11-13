#!/usr/bin/env node
// gemini-ko: Claude Code MessageDisplay hook.
// Claude의 답변을 화면에 그리기 직전에 Gemini로 자연스러운 한국어로 다시 써서 보여준다.
// 표시 전용: transcript와 Claude가 보는 컨텍스트는 원문 그대로다.
//
// Claude Code는 답변을 줄 묶음(조각) 단위로 넘겨주고, 조각마다 이 훅을 따로, 동시에 실행한다.
// 그래서 조각을 번호별 파일로 저장해 두고, 문단 경계에 온 조각이 그때까지 쌓인 글을 묶어서 다듬는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUF_DIR, loadConfig, ensureDirs, log, atomicWrite, sleep,
  protect, insideFence, apiUsableNow, rewriteBlock,
} from './lib.mjs';

const HANGUL = /[\uAC00-\uD7A3]/g;
const BLOCK_BUDGET_MS = 25_000; // 문단 묶음 하나를 다듬는 데 쓰는 시간 한도

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

const readOr = (file, dflt = '') => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return dflt;
  }
};

async function waitFor(files, ms) {
  const end = Date.now() + ms;
  for (;;) {
    if (files.every((f) => fs.existsSync(f))) return true;
    if (Date.now() > end) return false;
    await sleep(25);
  }
}

// 중간에 끊긴 답변(Esc 등)이 남긴 조각 파일을 치운다.
function sweepBuffers() {
  try {
    const cutoff = Date.now() - 6 * 3600 * 1000;
    for (const f of fs.readdirSync(BUF_DIR)) {
      const p = path.join(BUF_DIR, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

// 이 답변을 문단 묶음 단위로 다듬을지(stream), 끝에서 한 번에 다듬을지(whole)는
// 가장 먼저 도착한 조각이 정하고, 나머지 조각은 그 결정을 따른다.
async function decideMode(dir, cfg) {
  const file = path.join(dir, 'mode');
  const want = cfg.mode === 'replace' && cfg.stream && apiUsableNow(cfg) ? 'stream' : 'whole';
  try {
    fs.writeFileSync(file, want, { flag: 'wx', mode: 0o600 });
    return want;
  } catch {}
  for (let i = 0; i < 40; i++) {
    const v = readOr(file);
    if (v) return v;
    await sleep(10);
  }
  return 'whole';
}

// 조각들을 어디서 끊어 다듬을지 정한다. i번째 조각에서 끊을지는 0..i번째 조각만 보고 정하므로,
// 동시에 실행되는 훅들이 서로 같은 결론을 낸다.
// 끊는 조건: 빈 줄로 끝나고(문단 경계), 코드 블록 안이 아니고, 쌓인 글이 blockChars 이상일 때. 마지막 조각은 항상 끊는다.
export function plan(deltas, finalAtEnd, blockChars) {
  const groups = [];
  let from = 0;
  let acc = '';
  for (let i = 0; i < deltas.length; i++) {
    acc += deltas[i];
    const last = i === deltas.length - 1;
    const boundary = /\n[ \t]*\n$/.test(acc) && acc.trim().length >= blockChars && !insideFence(acc);
    if (boundary || (last && finalAtEnd)) {
      groups.push({ from, to: i });
      from = i + 1;
      acc = '';
    }
  }
  return groups;
}

// 글 한 덩어리를 다듬는다. 다듬을 필요가 없거나 실패하면 원문을 그대로 돌려준다.
async function polish(block, cfg, { allowAgy, budgetMs }) {
  const core = block.trim();
  const lead = block.slice(0, block.length - block.trimStart().length);
  const trail = block.slice(block.trimEnd().length);
  const prose = protect(core).text.replace(/⟦C\d+⟧/g, '');
  // 짧은 글, 한글이 거의 없는 글(코드뿐인 덩어리 등)은 그대로 둔다
  if (core.length < cfg.minChars || (prose.match(HANGUL) || []).length < 10) return { text: block, stat: { skipped: true } };
  if (core.length > cfg.maxChars) return { text: block, stat: { ok: false, err: '글이 너무 길어서 건너뜀' } };
  const t0 = Date.now();
  try {
    const { text, used } = await rewriteBlock(core, cfg, { deadline: t0 + budgetMs, allowAgy });
    const ms = Date.now() - t0;
    log(`ok ${used} ${(ms / 1000).toFixed(1)}s len=${core.length}`);
    return { text: lead + text + trail, stat: { ok: true, model: used, ms } };
  } catch (e) {
    log(`fail ${e.message}`);
    return { text: block, stat: { ok: false, err: String(e.message).slice(0, 80) } };
  }
}

// 답변 끝에 붙이는 한 줄 요약.
function summary(stats, cfg) {
  const done = stats.filter((s) => s.ok === true);
  const failed = stats.filter((s) => s.ok === false);
  let s = '';
  if (done.length && cfg.showBadge) {
    const models = [...new Set(done.map((d) => d.model))].join(', ');
    const slowest = (Math.max(...done.map((d) => d.ms)) / 1000).toFixed(1);
    s += done.length > 1
      ? `\n\n— Gemini로 다듬음 (${models} · ${done.length}묶음 · 가장 느린 묶음 ${slowest}s)`
      : `\n\n— Gemini로 다듬음 (${models} · ${slowest}s)`;
  }
  if (failed.length) {
    s += `\n\n(gemini-ko: ${done.length ? `${failed.length}곳은 ` : ''}다듬지 못해 원문을 표시합니다. ${failed[0].err})`;
  }
  return s;
}

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

  ensureDirs();
  const id = String(ev.message_id || 'unknown').replace(/[^\w-]/g, '') || 'unknown';
  const dir = path.join(BUF_DIR, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const k = Number.isInteger(ev.index) && ev.index >= 0 ? ev.index : 0;
  const delta = ev.delta || '';
  const batch = (i) => path.join(dir, `${i}.d`);
  const stat = (i) => path.join(dir, `${i}.s`);
  atomicWrite(batch(k), delta); // 다른 조각의 훅이 읽을 수 있게 가장 먼저 저장한다

  const append = cfg.mode === 'append';
  const mode = await decideMode(dir, cfg);

  // 끝에서 한 번에 다듬는 경우: 중간 조각은 숨기거나(replace) 원문 그대로 보여준다(append)
  if (mode !== 'stream' && !ev.final) return append ? out() : out('');

  // 앞선 조각들이 모두 저장될 때까지 잠깐 기다린다
  const prev = Array.from({ length: k }, (_, i) => batch(i));
  if (!(await waitFor(prev, 3000))) log(`warn: 앞선 조각 일부를 찾지 못함 (${id}, ${k}번째)`);
  const deltas = [...prev.map((f) => readOr(f)), delta];
  // 설정 명령(gemini-ko status 등)의 출력을 Claude가 그대로 옮긴 답변은 다듬지 않는다
  const passthrough = deltas.join('').trimStart().startsWith('gemini-ko:');
  const done = () => {
    fs.rmSync(dir, { recursive: true, force: true });
    sweepBuffers();
  };

  if (mode !== 'stream') {
    const full = deltas.join('');
    const res = passthrough
      ? { text: full, stat: { skipped: true } }
      : await polish(full, cfg, { allowAgy: true, budgetMs: cfg.timeoutSec * 1000 });
    const tail = summary([res.stat], cfg);
    done();
    if (res.stat.ok !== true) {
      // append 모드에서는 앞 조각이 이미 화면에 나와 있으므로 마지막 조각만 돌려준다
      if (!tail) return append ? out() : out(full);
      return out(`${(append ? delta : full).replace(/\s+$/, '')}${tail}\n`);
    }
    if (append) return out(`${delta}\n\n───── Gemini 정리 ─────\n\n${res.text.trim()}${tail}\n`);
    return out(`${res.text.replace(/\s+$/, '')}${tail}\n`);
  }

  // 문단 묶음 단위로 다듬는 경우
  const groups = plan(deltas, !!ev.final, cfg.blockChars);
  const mine = groups.at(-1);
  if (!mine || mine.to !== k) return out(''); // 아직 끊을 자리가 아니다. 뒤에 오는 조각이 함께 다듬는다.

  const block = deltas.slice(mine.from).join('');
  const res = passthrough
    ? { text: block, stat: { skipped: true } }
    : await polish(block, cfg, { allowAgy: false, budgetMs: BLOCK_BUDGET_MS });
  atomicWrite(stat(k), JSON.stringify(res.stat));
  if (!ev.final) return out(res.text);

  // 마지막 조각: 앞선 묶음들이 끝나기를 기다렸다가 요약 줄을 붙인다
  const earlier = groups.slice(0, -1).map((g) => stat(g.to));
  await waitFor(earlier, BLOCK_BUDGET_MS + 5000);
  const stats = [...earlier.map((f) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return {};
    }
  }), res.stat];
  const tail = summary(stats, cfg);
  done();
  return out(tail ? `${res.text.replace(/\s+$/, '')}${tail}\n` : res.text);
}

// 테스트에서 import할 때는 실행하지 않는다.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main()
    .catch((e) => {
      log(`crash ${e.stack || e}`);
      out();
    })
    // 남은 하위 프로세스나 열린 파이프 때문에 훅이 끝나지 않는 일이 없도록 결과를 쓴 뒤 바로 종료한다.
    .finally(() => process.stdout.write('', () => process.exit(0)));
}
