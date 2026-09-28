import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/db.mjs';
import { importLegacyJson } from '../src/importer.mjs';
import { buildWorkout } from '../src/progression.mjs';

test('legacy import advances a completed lift inside an otherwise partial session', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-importer-'));
  const dbPath = path.join(directory, 'test.sqlite');
  const sourcePath = path.join(directory, 'lifts.json');
  fs.writeFileSync(sourcePath, JSON.stringify({
    schema: 1,
    updated_at: '2026-09-20T12:00:00Z',
    program: null,
    coach_plan: { phase: 4 },
    phase_transition: null,
    last_completed_workout: null,
    history: [{
      date_logged: '2026-09-20',
      day_type: 'Day 3',
      status: 'partial',
      completed_lifts: [{
        exercise: 'heavy bench press',
        weight_lb: 237.5,
        sets: 3,
        reps: 3,
        notes: 'Full completion. Next heavy bench is 240x3x3.',
      }],
      missed_lifts: [{
        exercise: 'heavy back squat',
        target_weight_lb: 265,
        actual_weight_lb: 265,
        target_sets: 3,
        actual_sets: 3,
        target_reps: 5,
        actual_reps: 3,
      }],
      next_bench_goal: {
        exercise: 'volume bench press',
        weight_lb: 227.5,
        sets: 3,
        reps: 5,
      },
    }],
    next_workout: { day_type: 'Day 1', phase: 4, goal_lifts: [] },
  }));

  const db = openDatabase(dbPath);
  importLegacyJson(db, sourcePath, { replace: true });
  const dayThree = buildWorkout(db, 'Day 3');
  const heavyBench = dayThree.goal_lifts.find(goal => goal.exercise === 'heavy bench press');
  assert.equal(heavyBench.weight_lb, 240);
  assert.equal(heavyBench.sets, 3);
  assert.equal(heavyBench.reps, 3);
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
