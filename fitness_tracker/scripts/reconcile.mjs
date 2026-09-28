import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, getState } from '../src/db.mjs';

const sourcePath = path.resolve(process.argv[2] || '../workout_tracker/lifts.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const db = openDatabase();

const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
const attemptCount = db.prepare('SELECT COUNT(*) AS count FROM lift_attempts').get().count;
const latest = db.prepare('SELECT date_logged, day_type, status FROM sessions ORDER BY date_logged DESC, source_record_index DESC LIMIT 1').get();
const dbNext = getState(db, 'next_workout');

const expectedAttempts = source.history.reduce((total, record) => total + (record.completed_lifts || record.lifts || []).length + (record.missed_lifts || []).length, 0);
const checks = {
  session_count: { expected: source.history.length, actual: sessionCount },
  attempt_count: { expected: expectedAttempts, actual: attemptCount },
  latest_date: { expected: source.history.at(-1).date_logged, actual: latest?.date_logged },
  latest_day: { expected: source.history.at(-1).day_type, actual: latest?.day_type },
  next_workout: { expected: source.next_workout, actual: dbNext },
};

let failed = false;
for (const [name, check] of Object.entries(checks)) {
  const matches = JSON.stringify(check.expected) === JSON.stringify(check.actual);
  console.log(`${matches ? 'PASS' : 'FAIL'} ${name}`);
  if (!matches) {
    failed = true;
    console.log('  expected:', JSON.stringify(check.expected));
    console.log('  actual:  ', JSON.stringify(check.actual));
  }
}

if (failed) process.exitCode = 1;
