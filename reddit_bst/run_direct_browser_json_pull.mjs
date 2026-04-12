import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = '/Users/bobby/.openclaw/workspace/reddit_bst/captures';
fs.mkdirSync(outDir, { recursive: true });
const sub = process.argv[2];
const limit = Number(process.argv[3] || 100);
if (!sub) {
  console.error('usage: node run_direct_browser_json_pull.mjs <subreddit> [limit]');
  process.exit(1);
}
function run(args, json = true) {
  return execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', ...(json ? ['--json'] : []), ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}
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
const out = JSON.parse(run(['evaluate', '--fn', fn]));
const result = out.result || {};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `${sub}_direct_${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ sub, file, ok: result.ok, status: result.status || null, hasBody: Boolean(result.body), error: result.error || null }, null, 2));
