export function summarizeMaxRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const value = Number(row.weight_lb);
    const reps = Math.max(1, Number(row.reps) || 1);
    const estimatedOneRepMax = value * (1 + reps / 30);
    const current = grouped.get(row.exercise) || {
      exercise: row.exercise,
      display_name: row.display_name,
      best_load_lb: -Infinity,
      estimated_1rm_lb: -Infinity,
      date_logged: row.date_logged,
      uses_added_weight: row.added_weight_lb !== null,
    };

    if (value > current.best_load_lb || (value === current.best_load_lb && row.date_logged > current.date_logged)) {
      current.best_load_lb = value;
      current.date_logged = row.date_logged;
      current.display_name = row.display_name;
      current.uses_added_weight = row.added_weight_lb !== null;
    }
    current.estimated_1rm_lb = Math.max(current.estimated_1rm_lb, estimatedOneRepMax);
    grouped.set(row.exercise, current);
  }

  return grouped;
}
