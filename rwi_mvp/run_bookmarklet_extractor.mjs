import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('./rwi_bookmarklet_extractor_wrapped.js', import.meta.url), 'utf8');
const raw = execFileSync('openclaw', [
  'browser',
  '--browser-profile', 'openclaw',
  '--json',
  'evaluate',
  '--fn', js,
], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

const out = JSON.parse(raw);
const result = out.result;
console.log(JSON.stringify(result, null, 2));
