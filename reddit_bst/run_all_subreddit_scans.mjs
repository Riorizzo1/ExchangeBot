import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/bobby/.openclaw/workspace/reddit_bst';
const outDir = path.join(root, 'captures');
const wrappedJs = fs.readFileSync(path.join(root, 'list_sales_bookmarklet_wrapped.js'), 'utf8');
fs.mkdirSync(outDir, { recursive: true });

const configs = [
  { sub: 'repwatchbuysell', mode: 'bookmarklet' },
  { sub: 'repwatchbuyselltrade', mode: 'bookmarklet' },
  { sub: 'watchexchangeBST', mode: 'direct', limit: 100 },
  { sub: 'TheRepTimeBST', mode: 'direct', limit: 100 },
];

function run(args, json = true) {
  return execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', ...(json ? ['--json'] : []), ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

function waitBookmarkletResults() {
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
  return JSON.parse(run(['evaluate', '--fn', waitFn])).result || {};
}

function captureBookmarklet(sub) {
  const url = `https://www.reddit.com/r/${sub}/`;
  run(['start'], false);
  run(['navigate', url], false);
  run(['wait', '--url', url], false);
  run(['evaluate', '--fn', wrappedJs]);
  const result = waitBookmarkletResults();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `${sub}_${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  return { mode: 'bookmarklet', sub, file, ok: !result.error, count: Array.isArray(result.rows) ? result.rows.length : 0, error: result.error || null };
}

function captureDirect(sub, limit = 100) {
  run(['start'], false);
  run(['navigate', 'https://www.reddit.com/'], false);
  run(['wait', '--time', '3000'], false);
  const fn = `async () => {
    try {
      const r = await fetch('https://www.reddit.com/r/${sub}/new.json?limit=${limit}&raw_json=1',{credentials:'include',headers:{Accept:'application/json'}});
      const text = await r.text();
      return { ok:r.ok, status:r.status, body:text };
    } catch (e) {
      return { ok:false, error:String(e) };
    }
  }`;
  const result = JSON.parse(run(['evaluate', '--fn', fn])).result || {};
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `${sub}_direct_${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  return { mode: 'direct', sub, file, ok: !!result.ok, status: result.status || null, error: result.error || null };
}

const results = [];
for (const cfg of configs) {
  try {
    if (cfg.mode === 'bookmarklet') results.push(captureBookmarklet(cfg.sub));
    else results.push(captureDirect(cfg.sub, cfg.limit));
  } catch (error) {
    results.push({ sub: cfg.sub, mode: cfg.mode, ok: false, error: String(error?.message || error) });
  }
}

console.log(JSON.stringify(results, null, 2));
