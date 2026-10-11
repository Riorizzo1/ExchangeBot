import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = '/Users/bobby/.openclaw/workspace/rwi_mvp';
const data = `${base}/data`;
const current = `${data}/rwi.json`;
const candidate = `${data}/rwi.candidate.json`;
const previous = `${data}/rwi.previous.json`;
const out = `${base}/delta_compare.mjs.out.json`;
const backup = new Map([current, candidate, previous, out].map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));

try {
  const baselineAt = '2026-08-03T19:00:00.000Z';
  const old = { baselineAt, threads: [{ threadId: 'a', status: 'FOR SALE', title: '[FOR SALE] - A', askingPrice: '$289' }] };
  const next = { baselineAt: '2026-08-03T20:00:00.000Z', threads: [
    { threadId: 'a', status: 'FOR SALE', title: '[FOR SALE] - A', askingPrice: '$900' },
    { threadId: 'b', status: 'PENDING', title: '[PENDING] - B', askingPrice: '$500' },
    { threadId: 'c', status: 'SOLD', title: '[SOLD] - C', askingPrice: '$700' },
  ] };
  fs.writeFileSync(current, JSON.stringify(old));
  fs.writeFileSync(candidate, JSON.stringify(next));
  execFileSync('node', [`${base}/delta_compare.mjs`], { stdio: 'pipe' });
  const payload = JSON.parse(fs.readFileSync(out));
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.meta.breakdown, { new: 2, status: 0, price: 1 });
  console.log('delta comparator staged-price test passed');

  // Replay the exact 16:00 data shape: 121 old-style changes were made up of
  // price hydration plus a handful of real changes. It must now produce the
  // six alert-worthy rows without advancing either live baseline.
  const accepted = backup.get(previous);
  const failedCandidate = backup.get(current);
  if (accepted && failedCandidate) {
    fs.writeFileSync(current, accepted);
    fs.writeFileSync(candidate, failedCandidate);
    execFileSync('node', [`${base}/delta_compare.mjs`], { stdio: 'pipe' });
    const replay = JSON.parse(fs.readFileSync(out));
    assert.equal(replay.count, 6);
    assert.deepEqual(replay.meta.breakdown, { new: 1, status: 5, price: 115 });
    console.log('2026-08-03 16:00 replay passed (6 alert rows; 115 price-only ignored)');
  }
} finally {
  for (const [file, contents] of backup) {
    if (contents === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, contents);
  }
}
