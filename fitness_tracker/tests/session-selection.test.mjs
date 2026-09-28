import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Fitness test server did not start.');
}

async function request(url, pathname, options = {}) {
  const response = await fetch(`${url}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function sessionPayload(overrides = {}) {
  return {
    date_logged: '2026-09-28',
    day_type: 'Custom',
    session_kind: 'custom',
    rotation_day: null,
    advance_rotation: false,
    source: 'test',
    attempts: [{
      exercise: 'volume bench press',
      outcome: 'complete',
      target_weight_lb: 230,
      target_sets: 1,
      target_reps: 5,
      sets_detail: [{ target_weight_lb: 230, actual_weight_lb: 230, target_reps: 5, actual_reps: 5, status: 'complete' }],
    }],
    ...overrides,
  };
}

test('custom sessions preserve rotation while programmed selections advance it', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-selection-'));
  const dbPath = path.join(directory, 'test.sqlite');
  const port = 44000 + (process.pid % 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, FITNESS_DB_PATH: dbPath, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl);

  await request(baseUrl, '/api/rebuild-next-workout', { method: 'POST', body: JSON.stringify({ day_type: 'Day 2' }) });
  const custom = await request(baseUrl, '/api/sessions', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'custom-no-rotation' },
    body: JSON.stringify(sessionPayload()),
  });
  assert.equal(custom.session.session_kind, 'custom');
  assert.equal(custom.session.advances_rotation, false);
  assert.equal(custom.next_workout.day_type, 'Day 2');

  const programmed = await request(baseUrl, '/api/sessions', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'selected-day-3' },
    body: JSON.stringify(sessionPayload({ day_type: 'Day 3', session_kind: 'programmed', rotation_day: 'Day 3', advance_rotation: true })),
  });
  assert.equal(programmed.session.rotation_day, 'Day 3');
  assert.equal(programmed.session.advances_rotation, true);
  assert.equal(programmed.next_workout.day_type, 'Day 1');
});
