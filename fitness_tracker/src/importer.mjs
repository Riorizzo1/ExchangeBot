import fs from 'node:fs';
import path from 'node:path';
import { canonicalExercise, PHASE_FOUR_TEMPLATES } from './constants.mjs';
import { setState, transaction } from './db.mjs';
import { deriveGoal } from './progression.mjs';

const GOAL_FIELDS = [
  'next_squat_goal',
  'next_light_squat_goal',
  'next_bench_goal',
  'next_press_goal',
  'next_deadlift_goal',
  'next_chin_up_goal',
];

function statusFor(record) {
  if (record.status === 'completed') return 'complete';
  if (record.status) return record.status;
  if ((record.missed_lifts || []).length) return 'partial';
  return 'complete';
}

function attemptsFor(record) {
  const attempts = [];
  const complete = record.completed_lifts || record.lifts || [];
  complete.forEach((lift, index) => attempts.push({
    exercise: lift.exercise,
    canonical_exercise: canonicalExercise(lift.exercise),
    outcome: 'complete',
    target_weight_lb: lift.weight_lb ?? lift.added_weight_lb ?? null,
    actual_weight_lb: lift.weight_lb ?? null,
    added_weight_lb: lift.added_weight_lb ?? null,
    target_sets: lift.sets ?? null,
    target_reps: Array.isArray(lift.reps) ? null : lift.reps ?? null,
    actual_sets: lift.sets ?? null,
    actual_reps: Array.isArray(lift.reps) ? null : lift.reps ?? null,
    rep_sequence_json: Array.isArray(lift.reps) ? JSON.stringify(lift.reps) : null,
    notes: lift.notes ?? null,
    sort_order: index,
  }));
  (record.missed_lifts || []).forEach((lift, index) => attempts.push({
    exercise: lift.exercise,
    canonical_exercise: canonicalExercise(lift.exercise),
    outcome: 'partial',
    target_weight_lb: lift.target_weight_lb ?? null,
    actual_weight_lb: lift.actual_weight_lb ?? null,
    added_weight_lb: lift.actual_added_weight_lb ?? lift.target_added_weight_lb ?? null,
    target_sets: lift.target_sets ?? null,
    target_reps: lift.target_reps ?? null,
    actual_sets: lift.actual_sets ?? null,
    actual_reps: Array.isArray(lift.actual_reps) ? null : lift.actual_reps ?? null,
    rep_sequence_json: Array.isArray(lift.actual_reps) ? JSON.stringify(lift.actual_reps) : null,
    notes: lift.notes ?? null,
    sort_order: complete.length + index,
  }));
  return attempts;
}

function goalFromField(record, field) {
  const goal = record[field];
  if (!goal?.exercise) return null;
  return {
    source_date: record.date_logged,
    goal_key: field,
    exercise: goal.exercise,
    canonical_exercise: canonicalExercise(goal.exercise),
    weight_lb: goal.weight_lb ?? null,
    added_weight_lb: goal.added_weight_lb ?? null,
    sets: goal.sets ?? null,
    reps: goal.reps ?? null,
    notes: goal.notes ?? null,
  };
}

function goalFromAttempt(record, attempt, index) {
  const goal = deriveGoal(attempt);
  return {
    source_date: record.date_logged,
    goal_key: `derived_from_attempt_${index}`,
    exercise: goal.exercise,
    canonical_exercise: goal.canonical_exercise,
    weight_lb: goal.weight_lb,
    added_weight_lb: goal.added_weight_lb,
    sets: goal.sets,
    reps: goal.reps,
    notes: attempt.notes ?? goal.notes,
  };
}

export function backfillDerivedGoals(db) {
  const attempts = db.prepare(`
    SELECT a.*, s.date_logged
    FROM lift_attempts a
    JOIN sessions s ON s.id = a.session_id
    WHERE s.source = 'legacy_json'
      AND NOT EXISTS (
        SELECT 1
        FROM progression_goals g
        WHERE g.session_id = a.session_id
          AND g.canonical_exercise = a.canonical_exercise
      )
    ORDER BY s.date_logged, a.id
  `).all();
  const insertGoal = db.prepare(`
    INSERT INTO progression_goals
    (session_id, source_date, goal_key, exercise, canonical_exercise, weight_lb, added_weight_lb, sets, reps, notes)
    VALUES (?, ?, 'derived_from_attempt_backfill', ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const attempt of attempts) {
    const goal = deriveGoal(attempt);
    insertGoal.run(
      attempt.session_id,
      attempt.date_logged,
      goal.exercise,
      goal.canonical_exercise,
      goal.weight_lb,
      goal.added_weight_lb,
      goal.sets,
      goal.reps,
      attempt.notes ?? goal.notes,
    );
  }
  return attempts.length;
}

export function importLegacyJson(db, sourcePath, { replace = false } = {}) {
  const absolutePath = path.resolve(sourcePath);
  const source = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

  return transaction(db, () => {
    if (replace) {
      db.exec('DELETE FROM write_events; DELETE FROM progression_goals; DELETE FROM lift_attempts; DELETE FROM sessions; DELETE FROM app_state;');
    }

    const insertSession = db.prepare(`
      INSERT OR REPLACE INTO sessions
      (id, date_logged, day_type, phase, status, notes, source, source_record_index, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, 'legacy_json', ?, ?)
    `);
    const clearAttempts = db.prepare('DELETE FROM lift_attempts WHERE session_id = ?');
    const insertAttempt = db.prepare(`
      INSERT INTO lift_attempts
      (session_id, exercise, canonical_exercise, outcome, target_weight_lb, actual_weight_lb,
       added_weight_lb, target_sets, target_reps, actual_sets, actual_reps, rep_sequence_json, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const clearGoals = db.prepare('DELETE FROM progression_goals WHERE session_id = ?');
    const insertGoal = db.prepare(`
      INSERT INTO progression_goals
      (session_id, source_date, goal_key, exercise, canonical_exercise, weight_lb, added_weight_lb, sets, reps, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    source.history.forEach((record, index) => {
      const id = `legacy-${String(index + 1).padStart(3, '0')}-${record.date_logged}`;
      insertSession.run(id, record.date_logged, record.day_type, record.phase ?? null, statusFor(record), record.notes ?? null, index, JSON.stringify(record));
      clearAttempts.run(id);
      const attempts = attemptsFor(record);
      attempts.forEach(attempt => insertAttempt.run(
        id, attempt.exercise, attempt.canonical_exercise, attempt.outcome,
        attempt.target_weight_lb, attempt.actual_weight_lb, attempt.added_weight_lb,
        attempt.target_sets, attempt.target_reps, attempt.actual_sets, attempt.actual_reps,
        attempt.rep_sequence_json, attempt.notes, attempt.sort_order,
      ));
      clearGoals.run(id);
      attempts.map((attempt, attemptIndex) => goalFromAttempt(record, attempt, attemptIndex)).forEach(goal => insertGoal.run(
        id, goal.source_date, goal.goal_key, goal.exercise, goal.canonical_exercise,
        goal.weight_lb, goal.added_weight_lb, goal.sets, goal.reps, goal.notes,
      ));
      GOAL_FIELDS.map(field => goalFromField(record, field)).filter(Boolean).forEach(goal => insertGoal.run(
        id, goal.source_date, goal.goal_key, goal.exercise, goal.canonical_exercise,
        goal.weight_lb, goal.added_weight_lb, goal.sets, goal.reps, goal.notes,
      ));
    });

    const currentGoals = source.next_workout?.goal_lifts || [];
    currentGoals.forEach((goal, index) => insertGoal.run(
      null,
      source.updated_at?.slice(0, 10) || source.history.at(-1)?.date_logged,
      `current_next_workout_${index}`,
      goal.exercise,
      canonicalExercise(goal.exercise),
      goal.weight_lb ?? null,
      goal.added_weight_lb ?? null,
      goal.sets ?? null,
      goal.reps ?? null,
      goal.note ?? goal.notes ?? null,
    ));

    setState(db, 'legacy_source_path', absolutePath);
    setState(db, 'legacy_schema', source.schema);
    setState(db, 'program', source.program);
    setState(db, 'coach_plan', source.coach_plan);
    setState(db, 'phase_transition', source.phase_transition);
    setState(db, 'active_phase', source.coach_plan?.phase ?? source.next_workout?.phase ?? 4);
    setState(db, 'program_templates', PHASE_FOUR_TEMPLATES);
    setState(db, 'next_workout', source.next_workout);
    setState(db, 'last_completed_workout', source.last_completed_workout);
    setState(db, 'legacy_updated_at', source.updated_at);

    return {
      sessions: source.history.length,
      attempts: db.prepare('SELECT COUNT(*) AS count FROM lift_attempts').get().count,
      goals: db.prepare('SELECT COUNT(*) AS count FROM progression_goals').get().count,
    };
  });
}
