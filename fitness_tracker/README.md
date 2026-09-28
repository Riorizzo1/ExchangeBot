# Clarence Fitness

Local-first strength tracking PWA. The app keeps its canonical fitness database on the host machine and exposes the same transactional API to the PWA and chat/automation clients.

## Architecture

- `data/fitness.sqlite` — canonical SQLite database
- `server.mjs` — loopback HTTP API and static PWA server
- `web/` — installable mobile-first PWA with IndexedDB cache, recoverable workout drafts, and an offline write queue
- `scripts/import-lifts.mjs` — lossless importer from `workout_tracker/lifts.json`
- `scripts/reconcile.mjs` — migration checks against the legacy tracker
- `scripts/log-session.mjs` — API client for Telegram/automation writes

Every imported session retains its original JSON record in `sessions.raw_json`. Normalized lift attempts and progression goals power the UI and future integrations.

Schema v2 adds `lift_sets`, which records the actual load, reps, status, RPE/RIR, and notes for every set. Legacy aggregate attempts remain intact and are expanded into set rows during the idempotent migration. Corrections are snapshotted in `session_revisions` before an update is applied.

## URLs

- Node/API loopback: `http://127.0.0.1:4318`
- LAN proxy: configure a local reverse proxy for the host and port of your choice

An HTTPS endpoint is still required for full iPhone service-worker and notification behavior outside localhost. The app itself is ready for that endpoint without code changes.

## Commands

```bash
cd fitness_tracker
npm test
npm run import -- --replace
npm run reconcile
npm start
```

Log a parsed Telegram session:

```bash
cat session.json | node scripts/log-session.mjs
```

The write is idempotent. The client returns the saved database record and the newly reconciled next workout; callers should only acknowledge the workout after this response succeeds.

## Configuration

Runtime configuration is supplied through environment variables:

- `FITNESS_DB_PATH` — SQLite location; defaults to `data/fitness.sqlite`
- `HOST` — API bind host; defaults to `127.0.0.1`
- `PORT` — API port; defaults to `4318`
- `FITNESS_API_URL` — endpoint used by `scripts/log-session.mjs`

The entire `data/` directory is intentionally ignored. Live workout history, SQLite WAL files, migration backups, and imported source records must not be committed. Keep operational backups outside Git as well.

## API

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/sessions` with an `Idempotency-Key` header
- `PUT /api/sessions/:id` with an `Idempotency-Key` header
- `GET /api/maxes`

Session payload:

```json
{
  "date_logged": "2026-09-28",
  "day_type": "Day 1",
  "phase": 4,
  "notes": "Completed as prescribed.",
  "attempts": [
    {
      "exercise": "volume back squat",
      "outcome": "complete",
      "target_weight_lb": 235,
      "actual_weight_lb": 235,
      "target_sets": 3,
      "target_reps": 5,
      "actual_sets": 3,
      "actual_reps": 5,
      "sets_detail": [
        { "actual_weight_lb": 235, "actual_reps": 5, "status": "complete", "rpe": 7.5 },
        { "actual_weight_lb": 235, "actual_reps": 5, "status": "complete", "rpe": 8 },
        { "actual_weight_lb": 235, "actual_reps": 5, "status": "complete", "rpe": 8.5 }
      ]
    }
  ]
}
```
