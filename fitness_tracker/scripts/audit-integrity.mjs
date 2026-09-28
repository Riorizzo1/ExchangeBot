import fs from 'node:fs';
import path from 'node:path';
import { canonicalExercise, incrementForExercise, PHASE_FOUR_TEMPLATES, ROTATION } from '../src/constants.mjs';
import { getState, openDatabase } from '../src/db.mjs';
import { buildWorkout } from '../src/progression.mjs';

const sourcePath = path.resolve(process.argv[2] || '../workout_tracker/lifts.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const db = openDatabase();
const failures = [];

function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(name);
}

function sameValue(left, right) {
  return left === right || (left === null && right === undefined) || (left === undefined && right === null);
}

function workoutSignature(workout) {
  return {
    day_type: workout?.day_type ?? null,
    phase: workout?.phase ?? null,
    goal_lifts: (workout?.goal_lifts || []).map(lift => ({
      exercise: canonicalExercise(lift.exercise),
      load: lift.added_weight_lb ?? lift.weight_lb ?? null,
      sets: lift.sets ?? null,
      reps: lift.reps ?? null,
    })),
  };
}

check('sqlite_integrity', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
check('schema_version', db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version === 3);

const sessions = db.prepare("SELECT * FROM sessions WHERE source='legacy_json' ORDER BY source_record_index").all();
check('session_count', sessions.length === source.history.length, `${sessions.length}/${source.history.length}`);
const rawMismatches = source.history.filter((record, index) => {
  const row = sessions[index];
  return !row || row.source_record_index !== index || JSON.stringify(record) !== JSON.stringify(JSON.parse(row.raw_json));
});
check('source_records_exact', rawMismatches.length === 0, `${rawMismatches.length} mismatches`);

const expectedAttempts = source.history.reduce((total, record) => total + (record.completed_lifts || record.lifts || []).length + (record.missed_lifts || []).length, 0);
const actualAttempts = db.prepare('SELECT COUNT(*) count FROM lift_attempts').get().count;
check('attempt_count', actualAttempts === expectedAttempts, `${actualAttempts}/${expectedAttempts}`);

const setRows = db.prepare(`
  SELECT a.id,a.outcome,a.target_sets,a.actual_sets,a.rep_sequence_json,
         COUNT(s.id) set_count,
         SUM(CASE WHEN s.status='complete' THEN 1 ELSE 0 END) complete_count
  FROM lift_attempts a
  LEFT JOIN lift_sets s ON s.attempt_id=a.id
  GROUP BY a.id
`).all();
const setMismatches = setRows.filter(row => {
  const sequence = row.rep_sequence_json ? JSON.parse(row.rep_sequence_json) : null;
  const expected = Number(row.actual_sets ?? row.target_sets ?? sequence?.length ?? 0);
  if (row.set_count !== expected) return true;
  return row.outcome === 'complete' && row.set_count > 0 && row.complete_count !== row.set_count;
});
check('set_rows_consistent', setMismatches.length === 0, `${setMismatches.length} mismatches`);

const templates = getState(db, 'program_templates', PHASE_FOUR_TEMPLATES);
for (const dayType of ROTATION) {
  const workout = buildWorkout(db, dayType);
  for (const [index, item] of templates[dayType].entries()) {
    const actual = workout.goal_lifts[index];
    const exercise = canonicalExercise(item.exercise);
    const latest = db.prepare(`
      SELECT a.*,s.date_logged
      FROM lift_attempts a JOIN sessions s ON s.id=a.session_id
      WHERE a.canonical_exercise=?
      ORDER BY s.date_logged DESC,a.id DESC LIMIT 1
    `).get(exercise);
    let expectedLoad = item.added_weight_lb ?? item.weight_lb ?? null;
    let expectedSets = item.sets;
    let expectedReps = item.reps;
    if (latest) {
      const usesAddedWeight = latest.added_weight_lb !== null;
      const performedLoad = usesAddedWeight ? latest.added_weight_lb : latest.actual_weight_lb ?? latest.target_weight_lb;
      expectedLoad = performedLoad + (latest.outcome === 'complete' ? incrementForExercise(exercise) : 0);
      expectedSets = latest.target_sets ?? latest.actual_sets;
      expectedReps = latest.target_reps ?? latest.actual_reps;
    }
    const actualLoad = actual.added_weight_lb ?? actual.weight_lb ?? null;
    check(
      `slot_${dayType.replace(' ', '_')}_${exercise.replaceAll(' ', '_')}`,
      sameValue(actualLoad, expectedLoad) && sameValue(actual.sets, expectedSets) && sameValue(actual.reps, expectedReps),
      `actual ${actualLoad} ${actual.sets}x${actual.reps}; expected ${expectedLoad} ${expectedSets}x${expectedReps}`,
    );
  }
}

const nextWorkout = getState(db, 'next_workout');
check('next_workout_rebuild', JSON.stringify(workoutSignature(nextWorkout)) === JSON.stringify(workoutSignature(buildWorkout(db, nextWorkout.day_type))));
check('source_next_workout', JSON.stringify(workoutSignature(nextWorkout)) === JSON.stringify(workoutSignature(source.next_workout)));

const latestSource = source.history.at(-1);
const latestSession = db.prepare('SELECT * FROM sessions ORDER BY date_logged DESC,source_record_index DESC LIMIT 1').get();
check('latest_session', latestSession.date_logged === latestSource.date_logged && latestSession.day_type === latestSource.day_type);

if (failures.length) {
  console.error(`\n${failures.length} audit checks failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\nAll fitness integrity checks passed.');
}
