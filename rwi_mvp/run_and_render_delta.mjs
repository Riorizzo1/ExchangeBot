import { execFileSync } from 'node:child_process';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';

const run = (cmd, args) => execFileSync(cmd, args, {
  cwd: baseDir,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

run('node', [`${baseDir}/run_fresh_delta.mjs`]);
const rendered = run('node', [`${baseDir}/render_delta_telegram.mjs`]);
process.stdout.write(rendered.trimEnd() + '\n');
