import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {
  cwd: baseDir,
  stdio: 'inherit',
  ...opts,
});

try {
  run('node', [`${baseDir}/src/run-crawl.js`]);
  run('node', [`${baseDir}/delta_compare.mjs`]);
  // Only a validated candidate becomes the next hourly baseline.
  fs.copyFileSync(`${baseDir}/data/rwi.json`, `${baseDir}/data/rwi.previous.json`);
  fs.renameSync(`${baseDir}/data/rwi.candidate.json`, `${baseDir}/data/rwi.json`);
} finally {
  try {
    run('openclaw', ['browser', '--browser-profile', 'openclaw', 'stop']);
  } catch (error) {
    console.error('warning: failed to stop browser after RWI run');
    if (error?.message) console.error(error.message);
  }
}
