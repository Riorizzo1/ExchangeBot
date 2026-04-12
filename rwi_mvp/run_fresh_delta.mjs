import { execFileSync } from 'node:child_process';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {
  cwd: baseDir,
  stdio: 'inherit',
  ...opts,
});

try {
  run('node', [`${baseDir}/src/run-crawl.js`]);
  run('node', [`${baseDir}/delta_compare.mjs`]);
} finally {
  try {
    run('openclaw', ['browser', '--browser-profile', 'openclaw', 'stop']);
  } catch (error) {
    console.error('warning: failed to stop browser after RWI run');
    if (error?.message) console.error(error.message);
  }
}
