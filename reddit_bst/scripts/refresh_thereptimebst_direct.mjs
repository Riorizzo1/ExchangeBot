import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/bobby/.openclaw/workspace/reddit_bst';
const outDir = path.join(root, 'captures');
fs.mkdirSync(outDir, { recursive: true });

function run(args, json = true) {
  return execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', ...(json ? ['--json'] : []), ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

function fetchDirect(sub, limit = 100) {
  const fn = `async () => {
    try {
      const r = await fetch('https://www.reddit.com/r/${sub}/new.json?limit=${limit}&raw_json=1',{credentials:'include',headers:{Accept:'application/json'}});
      const text = await r.text();
      return { ok:r.ok, status:r.status, body:text };
    } catch (e) {
      return { ok:false, error:String(e) };
    }
  }`;
  return JSON.parse(run(['evaluate', '--fn', fn])).result || {};
}

run(['start'], false);
run(['navigate', 'https://www.reddit.com/'], false);
run(['wait', '--time', '3000'], false);
const sub = 'TheRepTimeBST';
const result = fetchDirect(sub, 100);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rawFile = path.join(outDir, `${sub}_direct_${stamp}.json`);
fs.writeFileSync(rawFile, JSON.stringify(result, null, 2));
const parsedFile = path.join(outDir, `${sub}_${stamp}.json`);
execFileSync('python3', [path.join(root, 'scripts', 'parse_direct_reddit_json.py'), rawFile, parsedFile], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});
console.log(JSON.stringify({ sub, rawFile, parsedFile, ok: !!result.ok, status: result.status || null, error: result.error || null }, null, 2));
