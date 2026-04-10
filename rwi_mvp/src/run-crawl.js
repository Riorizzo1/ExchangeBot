import { execFileSync } from 'child_process';
import fs from 'fs';

const base = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
const rawDir = '/Users/bobby/.openclaw/workspace/rwi_mvp/data/raw';
const indexOut = `${rawDir}/index.txt`;
fs.mkdirSync(rawDir, { recursive: true });

execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/index.js', 'config'], { stdio: 'inherit' });
execFileSync('openclaw', ['browser', 'navigate', base], { stdio: 'inherit' });
const snap = execFileSync('openclaw', ['browser', 'snapshot', '--format', 'aria', '--limit', '2000'], { encoding: 'utf8' });
fs.writeFileSync(indexOut, snap);
const plan = JSON.parse(execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/index.js', 'plan', indexOut, base], { encoding: 'utf8' }));
fs.writeFileSync(`${rawDir}/plan.json`, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));
