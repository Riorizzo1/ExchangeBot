import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveGoal } from '../src/progression.mjs';

test('completed squat advances five pounds', () => {
  const goal = deriveGoal({ exercise: 'volume back squat', outcome: 'complete', actual_weight_lb: 230, actual_sets: 3, actual_reps: 5 });
  assert.equal(goal.weight_lb, 235);
});

test('partial bench repeats its target', () => {
  const goal = deriveGoal({ exercise: 'volume bench press', outcome: 'partial', target_weight_lb: 230, actual_weight_lb: 230, target_sets: 3, target_reps: 5 });
  assert.equal(goal.weight_lb, 230);
});

test('weighted chin-up completion advances added weight', () => {
  const goal = deriveGoal({ exercise: 'weighted chin-ups', outcome: 'complete', added_weight_lb: 20, actual_sets: 5, actual_reps: 5 });
  assert.equal(goal.added_weight_lb, 22.5);
  assert.equal(goal.weight_lb, null);
});
