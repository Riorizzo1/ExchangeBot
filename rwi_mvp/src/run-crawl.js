import { execFileSync } from 'child_process';
import fs from 'fs';

const base = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
const out = '/Users/bobby/.openclaw/workspace/rwi_mvp/data/raw/index.txt';
fs.mkdirSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/raw', { recursive: true });

execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/index.js', 'config'], { stdio: 'inherit' });
execFileSync('openclaw', ['browser', 'navigate', base], { stdio: 'inherit' });
const snap = execFileSync('openclaw', ['browser', 'snapshot', '--format', 'aria', '--limit', '2000'], { encoding: 'utf8' });
fs.writeFileSync(out, snap);
execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/index.js', 'plan', out, base], { stdio: 'inherit' });
