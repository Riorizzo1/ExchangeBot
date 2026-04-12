import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sourceUrl = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
const js = fs.readFileSync(new URL('./rwi_bookmarklet_extractor_wrapped.js', import.meta.url), 'utf8');

const run = (args, opts = {}) => execFileSync('openclaw', [
  'browser',
  '--browser-profile', 'openclaw',
  ...args,
], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
  ...opts,
});

run(['start'], { stdio: 'pipe' });
run(['navigate', sourceUrl], { stdio: 'pipe' });
run(['wait', '--url', sourceUrl], { stdio: 'pipe' });

const raw = run([
  '--json',
  'evaluate',
  '--fn', js,
]);

const out = JSON.parse(raw);
const result = out.result;
console.log(JSON.stringify(result, null, 2));
