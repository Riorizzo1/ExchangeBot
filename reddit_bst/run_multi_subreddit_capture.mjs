import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/bobby/.openclaw/workspace/reddit_bst';
const wrappedJs = fs.readFileSync(path.join(root, 'list_sales_bookmarklet_wrapped.js'), 'utf8');
const outDir = path.join(root, 'captures');
fs.mkdirSync(outDir, { recursive: true });

const subs = [
  'repwatchbuysell',
  'repwatchbuyselltrade',
  'reptimebst',
  'watchexchangeBST',
];

function run(args) {
  return execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', '--json', ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

function runPlain(args) {
  return execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

const waitFn = `() => new Promise((resolve) => {
  const started = Date.now();
  const tick = () => {
    const v = window.__RWS_RESULTS__;
    if (v && v.rows && v.rows.length) return resolve(v);
    if (v && v.error) return resolve(v);
    if (Date.now() - started > 120000) return resolve({ error: 'timeout waiting for __RWS_RESULTS__' });
    setTimeout(tick, 1000);
  };
  tick();
})`;

function captureSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/`;
  runPlain(['start']);
  runPlain(['navigate', url]);
  runPlain(['wait', '--url', url]);
  run(['evaluate', '--fn', wrappedJs]);
  const out = JSON.parse(run(['evaluate', '--fn', waitFn]));
  const result = out.result || {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `${sub}_${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  return { sub, file, count: Array.isArray(result.rows) ? result.rows.length : 0, error: result.error || null };
}

const results = [];
for (const sub of subs) {
  try {
    results.push({ ok: true, ...(captureSubreddit(sub)) });
  } catch (error) {
    results.push({ ok: false, sub, error: String(error?.message || error) });
  }
}
console.log(JSON.stringify(results, null, 2));
