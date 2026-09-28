import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/db.mjs';

test('v2 schema backfills individual set rows without changing attempts', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fitness-schema-'));
  const dbPath=path.join(directory,'test.sqlite');
  let db=openDatabase(dbPath);
  db.prepare("INSERT INTO sessions(id,date_logged,day_type,status) VALUES('s1','2026-09-28','Day 1','complete')").run();
  db.prepare("INSERT INTO lift_attempts(session_id,exercise,canonical_exercise,outcome,target_weight_lb,actual_weight_lb,target_sets,target_reps,actual_sets,actual_reps,rep_sequence_json) VALUES('s1','volume back squat','volume back squat','complete',235,235,3,5,3,5,'[5,5,5]')").run();
  db.close();

  db=openDatabase(dbPath);
  const rows=db.prepare('SELECT set_number,actual_weight_lb,actual_reps,status FROM lift_sets ORDER BY set_number').all();
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(row=>row.actual_reps),[5,5,5]);
  assert.ok(rows.every(row=>row.actual_weight_lb===235&&row.status==='complete'));
  assert.equal(db.prepare('SELECT COUNT(*) count FROM lift_attempts').get().count,1);
  const session = db.prepare('SELECT session_kind,rotation_day,advances_rotation FROM sessions WHERE id=?').get('s1');
  assert.deepEqual({ ...session }, { session_kind: 'programmed', rotation_day: 'Day 1', advances_rotation: 1 });
  db.close();
  fs.rmSync(directory,{recursive:true});
});
