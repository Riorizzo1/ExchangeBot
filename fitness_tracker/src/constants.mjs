export const TIME_ZONE = 'America/New_York';

export const PHASE_FOUR_TEMPLATES = {
  'Day 1': [
    { exercise: 'volume back squat', weight_lb: 235, sets: 3, reps: 5 },
    { exercise: 'volume bench press', weight_lb: 230, sets: 3, reps: 5 },
    { exercise: 'weighted chin-ups', added_weight_lb: 22.5, sets: 5, reps: 5 },
  ],
  'Day 2': [
    { exercise: 'paused back squat', weight_lb: 190, sets: 3, reps: 3, note: '2-second pause' },
    { exercise: 'volume strict press', weight_lb: 122.5, sets: 3, reps: 5 },
    { exercise: 'deadlift', weight_lb: 360, sets: 1, reps: 5 },
  ],
  'Day 3': [
    { exercise: 'heavy back squat', weight_lb: 275, sets: 3, reps: 3 },
    { exercise: 'heavy bench press', weight_lb: 240, sets: 3, reps: 3 },
    { exercise: 'heavy strict press', weight_lb: 135, sets: 3, reps: 3 },
  ],
};

export const ROTATION = ['Day 1', 'Day 2', 'Day 3'];

export function canonicalExercise(exercise = '') {
  const value = String(exercise).trim().toLowerCase();
  const aliases = {
    'light paused back squat': 'paused back squat',
    'light squat': 'light squat',
    'light front squat': 'light front squat',
    'back squat': 'back squat',
    'front squat': 'front squat',
    'shoulder press': 'shoulder press',
    'strict press': 'strict press',
    'bench press': 'bench press',
    'chin-ups': 'chin-ups',
  };
  return aliases[value] || value;
}

export function incrementForExercise(exercise = '') {
  const value = canonicalExercise(exercise);
  if (value.includes('chin-up')) return 2.5;
  if (value.includes('bench') || value.includes('press')) return 2.5;
  if (value.includes('squat') || value.includes('deadlift')) return 5;
  return 0;
}

export function nextRotationDay(dayType) {
  const index = ROTATION.indexOf(dayType);
  return index === -1 ? null : ROTATION[(index + 1) % ROTATION.length];
}
