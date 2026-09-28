import { canonicalExercise, incrementForExercise, nextRotationDay, PHASE_FOUR_TEMPLATES } from './constants.mjs';
import { getState, setState } from './db.mjs';

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function deriveGoal(attempt) {
  const exercise = canonicalExercise(attempt.exercise);
  const outcome = attempt.outcome || 'complete';
  const usesAddedWeight = attempt.added_weight_lb !== null && attempt.added_weight_lb !== undefined;
  const actualWeight = numeric(usesAddedWeight ? attempt.added_weight_lb : attempt.actual_weight_lb);
  const targetWeight = numeric(usesAddedWeight ? attempt.target_added_weight_lb : attempt.target_weight_lb);
  const baseWeight = actualWeight ?? targetWeight;
  const increment = outcome === 'complete' ? incrementForExercise(exercise) : 0;
  const nextWeight = baseWeight === null ? null : baseWeight + increment;

  return {
    exercise,
    canonical_exercise: exercise,
    weight_lb: usesAddedWeight ? null : nextWeight,
    added_weight_lb: usesAddedWeight ? nextWeight : null,
    sets: numeric(attempt.target_sets) ?? numeric(attempt.actual_sets),
    reps: numeric(attempt.target_reps) ?? numeric(attempt.actual_reps),
    notes: outcome === 'complete'
      ? `Advanced ${increment} lb after full completion.`
      : `Repeat the same target after a ${outcome} exposure.`,
  };
}

export function latestGoal(db, exercise) {
  return db.prepare(`
    SELECT exercise, canonical_exercise, weight_lb, added_weight_lb, sets, reps, notes, source_date
    FROM progression_goals
    WHERE canonical_exercise = ?
    ORDER BY source_date DESC, id DESC
    LIMIT 1
  `).get(canonicalExercise(exercise)) || null;
}

export function buildWorkout(db, dayType) {
  const templates = getState(db, 'program_templates', PHASE_FOUR_TEMPLATES);
  const template = templates[dayType] || [];
  return {
    day_type: dayType,
    date: null,
    phase: Number(getState(db, 'active_phase', 4)),
    goal_lifts: template.map(item => {
      const goal = latestGoal(db, item.exercise);
      return {
        exercise: item.exercise,
        weight_lb: goal?.weight_lb ?? item.weight_lb ?? null,
        added_weight_lb: goal?.added_weight_lb ?? item.added_weight_lb ?? null,
        sets: goal?.sets ?? item.sets,
        reps: goal?.reps ?? item.reps,
        note: goal?.notes ?? item.note ?? null,
      };
    }),
  };
}

export function updateNextWorkout(db, completedDayType) {
  const current = getState(db, 'next_workout', null);
  const nextDay = nextRotationDay(completedDayType);
  if (!nextDay) return current;
  const nextWorkout = buildWorkout(db, nextDay);
  setState(db, 'next_workout', nextWorkout);
  return nextWorkout;
}
