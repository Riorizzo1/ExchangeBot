import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeMaxRows } from '../src/metrics.mjs';

test('max summary uses the latest date when the best load is tied', () => {
  const rows = [
    { exercise: 'shoulder press', display_name: 'shoulder press', date_logged: '2026-07-29', added_weight_lb: null, weight_lb: 125, reps: 5 },
    { exercise: 'shoulder press', display_name: 'shoulder press', date_logged: '2026-08-04', added_weight_lb: null, weight_lb: 125, reps: 5 },
  ];
  const result = summarizeMaxRows(rows).get('shoulder press');
  assert.equal(result.best_load_lb, 125);
  assert.equal(result.date_logged, '2026-08-04');
  assert.equal(result.estimated_1rm_lb, 125 * (1 + 5 / 30));
});
