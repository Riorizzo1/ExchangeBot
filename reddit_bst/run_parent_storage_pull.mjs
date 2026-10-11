import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const bookmarkletPath = new URL('./list_sales_bookmarklet_wrapped.js', import.meta.url);
const rawJs = fs.readFileSync(bookmarkletPath, 'utf8');
execFileSync('openclaw', [
  'browser',
  '--browser-profile', 'openclaw',
  '--json',
  'evaluate',
  '--fn', rawJs,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

const waitFn = `() => new Promise((resolve) => {
  const started = Date.now();
  const tick = () => {
    const v = window.__RWS_RESULTS__;
    if (v && v.rows && v.rows.length) return resolve(v);
    if (Date.now() - started > 90000) return resolve({ error: 'timeout waiting for __RWS_RESULTS__' });
    setTimeout(tick, 1000);
  };
  tick();
})`;

const out = execFileSync('openclaw', [
  'browser',
  '--browser-profile', 'openclaw',
  '--json',
  'evaluate',
  '--fn', waitFn,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

const parsed = JSON.parse(out);
console.log(JSON.stringify(parsed.result, null, 2));
