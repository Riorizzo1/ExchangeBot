import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { canonicalExercise, incrementForExercise, ROTATION } from './src/constants.mjs';
import { getState, openDatabase, setState, transaction } from './src/db.mjs';
import { summarizeMaxRows } from './src/metrics.mjs';
import { buildWorkout, deriveGoal, updateNextWorkout } from './src/progression.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(rootDir, 'web');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4318);
const db = openDatabase();
const vapidPath = process.env.FITNESS_VAPID_PATH || path.join(rootDir, 'data', 'vapid.json');
let vapid = null;
try {
  if (fs.existsSync(vapidPath)) vapid = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  if (vapid?.publicKey && vapid?.privateKey) webpush.setVapidDetails(vapid.subject || 'mailto:bobby@localhost', vapid.publicKey, vapid.privateKey);
} catch (error) { console.error(`[fitness] unable to load VAPID config: ${error.message}`); }
const MIME_TYPES = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json; charset=utf-8' };

function json(response, status, payload) { const body=JSON.stringify(payload); response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'}); response.end(body); }
function text(response,status,body,contentType='text/plain; charset=utf-8') { response.writeHead(status,{'Content-Type':contentType,'Content-Length':Buffer.byteLength(body)}); response.end(body); }
async function readJson(request) { const chunks=[]; let size=0; for await (const chunk of request) { size+=chunk.length; if (size>1_000_000) throw new Error('Request body is too large.'); chunks.push(chunk); } return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}; }
function numberOrNull(value) { if (value===''||value===null||value===undefined) return null; const n=Number(value); return Number.isFinite(n)?n:null; }

const setStatement=db.prepare('SELECT * FROM lift_sets WHERE attempt_id=? ORDER BY set_number,id');
function serializeAttempt(row) { return { id:row.id,exercise:row.exercise,canonical_exercise:row.canonical_exercise,outcome:row.outcome,target_weight_lb:row.target_weight_lb,actual_weight_lb:row.actual_weight_lb,added_weight_lb:row.added_weight_lb,target_sets:row.target_sets,target_reps:row.target_reps,actual_sets:row.actual_sets,actual_reps:row.actual_reps,rep_sequence:row.rep_sequence_json?JSON.parse(row.rep_sequence_json):null,notes:row.notes,sets:setStatement.all(row.id) }; }
function sessionById(id) { const session=db.prepare('SELECT * FROM sessions WHERE id=?').get(id); if (!session) return null; const attempts=db.prepare('SELECT * FROM lift_attempts WHERE session_id=? ORDER BY sort_order,id').all(id); return {...session,advances_rotation:Boolean(session.advances_rotation),attempts:attempts.map(serializeAttempt)}; }
function sessionsQuery({limit=50,offset=0,exercise='',day='',status='',search=''}={}) {
  const clauses=[]; const args=[];
  if(day){clauses.push('s.day_type=?');args.push(day);} if(status){clauses.push('s.status=?');args.push(status);}
  if(exercise){clauses.push('EXISTS (SELECT 1 FROM lift_attempts f WHERE f.session_id=s.id AND f.canonical_exercise=?)');args.push(canonicalExercise(exercise));}
  if(search){clauses.push("(LOWER(COALESCE(s.notes,'')) LIKE ? OR EXISTS (SELECT 1 FROM lift_attempts f WHERE f.session_id=s.id AND LOWER(f.exercise) LIKE ?))");const q=`%${search.toLowerCase()}%`;args.push(q,q);}
  const safeLimit=Math.max(1,Math.min(250,Number(limit)||50)); const safeOffset=Math.max(0,Number(offset)||0); const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  return db.prepare(`SELECT s.id FROM sessions s ${where} ORDER BY s.date_logged DESC,s.source_record_index DESC,s.created_at DESC LIMIT ? OFFSET ?`).all(...args,safeLimit,safeOffset).map(row=>sessionById(row.id));
}
function exerciseHistory() { return db.prepare(`SELECT a.id attempt_id,a.canonical_exercise exercise,a.exercise display_name,s.date_logged,s.day_type,COALESCE(a.actual_weight_lb,a.added_weight_lb) weight_lb,a.added_weight_lb,a.outcome,a.actual_sets sets,a.actual_reps reps,a.target_sets,a.target_reps FROM lift_attempts a JOIN sessions s ON s.id=a.session_id WHERE COALESCE(a.actual_weight_lb,a.added_weight_lb) IS NOT NULL ORDER BY s.date_logged,a.id`).all(); }
function maxes() {
  const rows=db.prepare(`SELECT a.canonical_exercise exercise,a.exercise display_name,s.date_logged,a.added_weight_lb,COALESCE(ls.actual_weight_lb,a.actual_weight_lb,a.added_weight_lb) weight_lb,COALESCE(ls.actual_reps,a.actual_reps,1) reps FROM lift_attempts a JOIN sessions s ON s.id=a.session_id LEFT JOIN lift_sets ls ON ls.attempt_id=a.id AND ls.status='complete' WHERE a.outcome='complete' AND COALESCE(ls.actual_weight_lb,a.actual_weight_lb,a.added_weight_lb) IS NOT NULL`).all();
  const grouped=summarizeMaxRows(rows);
  for(const dayType of ROTATION){for(const goal of buildWorkout(db,dayType).goal_lifts||[]){const item=grouped.get(canonicalExercise(goal.exercise));if(item)item.current_target_lb=goal.added_weight_lb??goal.weight_lb??null;}}
  return [...grouped.values()].map(item=>({...item,estimated_1rm_lb:Math.round(item.estimated_1rm_lb*2)/2})).sort((a,b)=>a.exercise.localeCompare(b.exercise));
}
function exerciseSlots(){
  const maxMap=new Map(maxes().map(item=>[item.exercise,item]));
  return ROTATION.flatMap(dayType=>buildWorkout(db,dayType).goal_lifts.map((goal,index)=>{
    const exercise=canonicalExercise(goal.exercise);
    const last=db.prepare(`SELECT a.outcome,a.actual_weight_lb,a.added_weight_lb,a.actual_sets,a.actual_reps,s.date_logged FROM lift_attempts a JOIN sessions s ON s.id=a.session_id WHERE a.canonical_exercise=? ORDER BY s.date_logged DESC,a.id DESC LIMIT 1`).get(exercise);
    const currentLoad=goal.added_weight_lb??goal.weight_lb??null;
    const best=maxMap.get(exercise)||null;
    return{slot_id:`${dayType.toLowerCase().replace(/\s+/g,'-')}:${exercise}`,day_type:dayType,sort_order:index,exercise:goal.exercise,canonical_exercise:exercise,weight_lb:goal.weight_lb??null,added_weight_lb:goal.added_weight_lb??null,sets:goal.sets,reps:goal.reps,note:goal.note??null,current_target_lb:currentLoad,next_success_target_lb:currentLoad===null?null:currentLoad+incrementForExercise(exercise),last_performance:last?{date_logged:last.date_logged,outcome:last.outcome,weight_lb:last.added_weight_lb??last.actual_weight_lb??null,sets:last.actual_sets,reps:last.actual_reps}:null,best_completed_lb:best?.best_load_lb??null,estimated_1rm_lb:best?.estimated_1rm_lb??null};
  }));
}
function bootstrapPayload(){const sessionCount=db.prepare('SELECT COUNT(*) count FROM sessions').get().count;const attemptCount=db.prepare('SELECT COUNT(*) count FROM lift_attempts').get().count;const setCount=db.prepare('SELECT COUNT(*) count FROM lift_sets').get().count;const recent=sessionsQuery({limit:60});const last=recent[0]||null;const programmedWorkouts=ROTATION.map(dayType=>buildWorkout(db,dayType));return{generated_at:new Date().toISOString(),summary:{session_count:sessionCount,attempt_count:attemptCount,set_count:setCount,active_phase:getState(db,'active_phase',4),last_session_date:last?.date_logged||null},next_workout:getState(db,'next_workout',buildWorkout(db,'Day 1')),programmed_workouts:programmedWorkouts,exercise_slots:exerciseSlots(),program:getState(db,'program',null),recent_sessions:recent,exercise_history:exerciseHistory(),maxes:maxes()};}
function pushPreferences(){const rows=db.prepare('SELECT key,enabled FROM push_preferences').all();const result={workout_reminders:false,progression_alerts:true};for(const row of rows)result[row.key]=Boolean(row.enabled);return result;}
function pushStatus(){return{configured:Boolean(vapid?.publicKey),subscription_count:db.prepare('SELECT COUNT(*) count FROM push_subscriptions').get().count,preferences:pushPreferences(),public_key:vapid?.publicKey||null};}
async function sendPush(payload){
  if(!vapid?.publicKey) throw new Error('Push notifications are not configured on the Fitness server.');
  const subscriptions=db.prepare('SELECT * FROM push_subscriptions').all();
  const results=[];
  for(const subscription of subscriptions){
    try { await webpush.sendNotification(JSON.parse(subscription.subscription_json), JSON.stringify(payload)); db.prepare('UPDATE push_subscriptions SET last_success_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?').run(subscription.id); results.push({endpoint:subscription.endpoint,ok:true}); }
    catch(error){ db.prepare('UPDATE push_subscriptions SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(error.message).slice(0,500),subscription.id); if(error.statusCode===404||error.statusCode===410) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(subscription.id); results.push({endpoint:subscription.endpoint,ok:false,status:error.statusCode||500}); }
  }
  return results;
}
function savePushSubscription(input, userAgent){
  const subscription=input?.subscription||input;
  if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)throw new Error('Invalid push subscription.');
  db.prepare(`INSERT INTO push_subscriptions(endpoint,subscription_json,user_agent,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json,user_agent=excluded.user_agent,updated_at=CURRENT_TIMESTAMP,last_error=NULL`).run(subscription.endpoint,JSON.stringify(subscription),userAgent||null);
  return pushStatus();
}
function updatePushPreferences(input){for(const key of ['workout_reminders','progression_alerts'])if(input?.[key]!==undefined)db.prepare(`INSERT INTO push_preferences(key,enabled,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`).run(key,input[key]?1:0);return pushStatus();}

function normalizeSets(attempt){
  if(Array.isArray(attempt.sets_detail)&&attempt.sets_detail.length)return attempt.sets_detail.map((set,index)=>({set_number:index+1,target_weight_lb:numberOrNull(set.target_weight_lb??attempt.target_weight_lb??attempt.target_added_weight_lb),actual_weight_lb:numberOrNull(set.actual_weight_lb??set.weight_lb??attempt.actual_weight_lb??attempt.added_weight_lb),target_reps:numberOrNull(set.target_reps??attempt.target_reps),actual_reps:numberOrNull(set.actual_reps??set.reps),status:set.status||attempt.outcome||'complete',rpe:numberOrNull(set.rpe),rir:numberOrNull(set.rir),notes:set.notes||null}));
  const count=Number(attempt.actual_sets??attempt.sets??attempt.target_sets??0);return Array.from({length:Math.max(0,count)},(_,index)=>({set_number:index+1,target_weight_lb:numberOrNull(attempt.target_weight_lb??attempt.target_added_weight_lb),actual_weight_lb:numberOrNull(attempt.actual_weight_lb??attempt.weight_lb??attempt.added_weight_lb),target_reps:numberOrNull(attempt.target_reps??attempt.reps),actual_reps:numberOrNull(attempt.actual_reps??attempt.reps),status:attempt.outcome||'complete',rpe:null,rir:null,notes:null}));
}
function normalizeAttempt(attempt){
  const sets=normalizeSets(attempt);
  const done=sets.filter(set=>!['skipped','planned'].includes(set.status));
  const hasRequiredReps=set=>set.actual_reps!==null&&set.actual_reps!==undefined&&Number(set.actual_reps)>=Number(set.target_reps??set.actual_reps);
  const hasRequiredLoad=set=>{
    const target=numberOrNull(set.target_weight_lb);
    const actual=numberOrNull(set.actual_weight_lb);
    return target===null||(actual!==null&&actual>=target);
  };
  // The server is authoritative: a client cannot force progression by labeling
  // an under-target set "complete". Every required set must meet reps and load.
  const allComplete=sets.length>0&&sets.every(set=>set.status==='complete'&&hasRequiredReps(set)&&hasRequiredLoad(set));
  const allSkipped=sets.length>0&&sets.every(set=>set.status==='skipped');
  const outcome=allComplete?'complete':sets.some(set=>set.status==='missed')?'missed':allSkipped?'skipped':'partial';
  const actualWeights=done.map(set=>set.actual_weight_lb).filter(v=>v!==null);
  const actualReps=done.map(set=>set.actual_reps).filter(v=>v!==null);
  return{...attempt,outcome,sets_detail:sets,target_sets:numberOrNull(attempt.target_sets??sets.length),target_reps:numberOrNull(attempt.target_reps??sets[0]?.target_reps),actual_sets:done.length,actual_reps:actualReps.length&&new Set(actualReps).size===1?actualReps[0]:null,actual_weight_lb:numberOrNull(attempt.actual_weight_lb??(actualWeights.length&&new Set(actualWeights).size===1?actualWeights[0]:null)),target_weight_lb:numberOrNull(attempt.target_weight_lb),added_weight_lb:numberOrNull(attempt.added_weight_lb)};
}
function validateSession(input){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date_logged||'')))throw new Error('date_logged must be YYYY-MM-DD.');if(!String(input.day_type||'').trim())throw new Error('day_type is required.');if(!Array.isArray(input.attempts)||!input.attempts.length)throw new Error('At least one lift attempt is required.');for(const attempt of input.attempts){if(!String(attempt.exercise||'').trim())throw new Error('Every lift attempt requires an exercise.');for(const set of normalizeSets(attempt))if(!['planned','complete','partial','missed','skipped'].includes(set.status))throw new Error('Invalid set status.');}}

const insertAttempt=db.prepare(`INSERT INTO lift_attempts(session_id,exercise,canonical_exercise,outcome,target_weight_lb,actual_weight_lb,added_weight_lb,target_sets,target_reps,actual_sets,actual_reps,rep_sequence_json,notes,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insertSet=db.prepare(`INSERT INTO lift_sets(attempt_id,set_number,target_weight_lb,actual_weight_lb,target_reps,actual_reps,status,rpe,rir,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`);
const insertGoal=db.prepare(`INSERT INTO progression_goals(session_id,source_date,goal_key,exercise,canonical_exercise,weight_lb,added_weight_lb,sets,reps,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`);
function writeAttempts(sessionId,date,attempts){attempts.map(normalizeAttempt).forEach((attempt,index)=>{const usesAdded=attempt.added_weight_lb!==null||(attempt.target_added_weight_lb!==null&&attempt.target_added_weight_lb!==undefined);const actualLoad=usesAdded?null:attempt.actual_weight_lb;const added=usesAdded?numberOrNull(attempt.added_weight_lb??attempt.sets_detail.find(set=>set.actual_weight_lb!==null)?.actual_weight_lb):null;const result=insertAttempt.run(sessionId,attempt.exercise,canonicalExercise(attempt.exercise),attempt.outcome,attempt.target_weight_lb,actualLoad,added,attempt.target_sets,attempt.target_reps,attempt.actual_sets,attempt.actual_reps,JSON.stringify(attempt.sets_detail.map(set=>set.actual_reps)),attempt.notes||null,index);for(const set of attempt.sets_detail)insertSet.run(result.lastInsertRowid,set.set_number,set.target_weight_lb,set.actual_weight_lb,set.target_reps,set.actual_reps,set.status,set.rpe,set.rir,set.notes);const goal=deriveGoal({...attempt,actual_weight_lb:actualLoad,added_weight_lb:added});insertGoal.run(sessionId,date,'derived_from_attempt',goal.exercise,goal.canonical_exercise,goal.weight_lb,goal.added_weight_lb,goal.sets,goal.reps,goal.notes);});}
function sessionRotation(input){const sessionKind=input.session_kind||(input.day_type==='Custom'?'custom':'programmed');const rotationDay=input.rotation_day||(sessionKind==='programmed'&&ROTATION.includes(input.day_type)?input.day_type:null);const advancesRotation=input.advance_rotation===undefined?sessionKind==='programmed':Boolean(input.advance_rotation);if(advancesRotation&&!ROTATION.includes(rotationDay))throw new Error('A rotation-advancing session requires rotation_day Day 1, Day 2, or Day 3.');return{sessionKind,rotationDay,advancesRotation};}
function createSession(input,idempotencyKey){validateSession(input);if(!idempotencyKey)throw new Error('Idempotency-Key is required.');const existing=db.prepare('SELECT response_json FROM write_events WHERE idempotency_key=?').get(idempotencyKey);if(existing)return JSON.parse(existing.response_json);return transaction(db,()=>{const id=input.id||crypto.randomUUID();const normalized=input.attempts.map(normalizeAttempt);const status=input.status||(normalized.every(a=>a.outcome==='complete')?'complete':'partial');const rotation=sessionRotation(input);db.prepare('INSERT INTO sessions(id,date_logged,day_type,phase,status,notes,source,raw_json,session_kind,rotation_day,advances_rotation) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,input.date_logged,String(input.day_type).trim(),input.phase??getState(db,'active_phase',4),status,input.notes||null,input.source||'app',JSON.stringify(input),rotation.sessionKind,rotation.rotationDay,rotation.advancesRotation?1:0);writeAttempts(id,input.date_logged,normalized);const nextWorkout=rotation.advancesRotation?updateNextWorkout(db,rotation.rotationDay):getState(db,'next_workout',buildWorkout(db,'Day 1'));const saved=sessionById(id);setState(db,'last_completed_workout',saved);const response={session:saved,next_workout:nextWorkout};db.prepare('INSERT INTO write_events(idempotency_key,event_type,response_json) VALUES(?,?,?)').run(idempotencyKey,'session.create',JSON.stringify(response));return response;});}
function updateSession(id,input,idempotencyKey){validateSession(input);if(!idempotencyKey)throw new Error('Idempotency-Key is required.');const replay=db.prepare('SELECT response_json FROM write_events WHERE idempotency_key=?').get(idempotencyKey);if(replay)return JSON.parse(replay.response_json);const before=sessionById(id);if(!before)throw new Error('Session not found.');return transaction(db,()=>{db.prepare("INSERT INTO session_revisions(session_id,operation,snapshot_json) VALUES(?,'update',?)").run(id,JSON.stringify(before));const normalized=input.attempts.map(normalizeAttempt);const status=input.status||(normalized.every(a=>a.outcome==='complete')?'complete':'partial');const rotation=sessionRotation({...input,session_kind:input.session_kind??before.session_kind,rotation_day:input.rotation_day??before.rotation_day,advance_rotation:input.advance_rotation??before.advances_rotation});db.prepare('UPDATE sessions SET date_logged=?,day_type=?,phase=?,status=?,notes=?,raw_json=?,session_kind=?,rotation_day=?,advances_rotation=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(input.date_logged,input.day_type,input.phase??before.phase,status,input.notes||null,JSON.stringify(input),rotation.sessionKind,rotation.rotationDay,rotation.advancesRotation?1:0,id);db.prepare('DELETE FROM progression_goals WHERE session_id=?').run(id);db.prepare('DELETE FROM lift_attempts WHERE session_id=?').run(id);writeAttempts(id,input.date_logged,normalized);const current=getState(db,'next_workout',{});const nextWorkout=buildWorkout(db,current.day_type||'Day 1');setState(db,'next_workout',nextWorkout);const saved=sessionById(id);const response={session:saved,next_workout:nextWorkout};db.prepare('INSERT INTO write_events(idempotency_key,event_type,response_json) VALUES(?,?,?)').run(idempotencyKey,'session.update',JSON.stringify(response));return response;});}

function serveStatic(requestPath,response){const clean=requestPath==='/'?'/index.html':requestPath;const file=path.normalize(path.join(webDir,clean.replace(/^\/+/,'')));if(!file.startsWith(webDir))return text(response,403,'Forbidden');if(!fs.existsSync(file)||!fs.statSync(file).isFile())return text(response,404,'Not found');const body=fs.readFileSync(file);const ext=path.extname(file);response.writeHead(200,{'Content-Type':MIME_TYPES[ext]||'application/octet-stream','Content-Length':body.length,'Cache-Control':['/sw.js','/index.html'].includes(clean)?'no-cache':'public, max-age=300'});response.end(body);}
const server=http.createServer(async(request,response)=>{const url=new URL(request.url,`http://${request.headers.host||`${host}:${port}`}`);try{
  if(request.method==='GET'&&url.pathname==='/api/health'){const schema=db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version;return json(response,200,{ok:true,database:'ready',schema,push:pushStatus(),time:new Date().toISOString()});}
  if(request.method==='GET'&&url.pathname==='/api/bootstrap')return json(response,200,{...bootstrapPayload(),push:pushStatus()});
  if(request.method==='GET'&&url.pathname==='/api/push/status')return json(response,200,pushStatus());
  if(request.method==='POST'&&url.pathname==='/api/push/subscribe')return json(response,201,savePushSubscription(await readJson(request),request.headers['user-agent']));
  if(request.method==='DELETE'&&url.pathname==='/api/push/subscribe'){const input=await readJson(request);if(input.endpoint)db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(input.endpoint);return json(response,200,pushStatus());}
  if(request.method==='PUT'&&url.pathname==='/api/push/preferences')return json(response,200,updatePushPreferences(await readJson(request)));
  if(request.method==='POST'&&url.pathname==='/api/push/test'){const results=await sendPush({title:'Fitness notifications enabled',body:'Your Fitness PWA can now reach you.',url:'/'});return json(response,200,{results,push:pushStatus()});}
  if(request.method==='POST'&&url.pathname==='/api/push/reminder'){const status=pushStatus();if(!status.preferences.workout_reminders)return json(response,200,{sent:false,reason:'Workout reminders are disabled.'});const workout=getState(db,'next_workout',buildWorkout(db,'Day 1'));const results=await sendPush({title:`${workout.day_type} workout`,body:(workout.goal_lifts||[]).map(lift=>`${lift.exercise}: ${lift.added_weight_lb??lift.weight_lb??'BW'} × ${lift.sets}×${lift.reps}`).join(' · '),url:'/'});return json(response,200,{sent:true,results,push:pushStatus()});}
  if(request.method==='GET'&&url.pathname==='/api/maxes')return json(response,200,{maxes:maxes()});
  if(request.method==='GET'&&url.pathname==='/api/sessions')return json(response,200,{sessions:sessionsQuery(Object.fromEntries(url.searchParams))});
  if(request.method==='GET'&&url.pathname.startsWith('/api/sessions/')){const item=sessionById(decodeURIComponent(url.pathname.split('/').at(-1)));return item?json(response,200,{session:item}):json(response,404,{error:'Session not found.'});}
  if(request.method==='POST'&&url.pathname==='/api/sessions'){const input=await readJson(request);const result=createSession(input,request.headers['idempotency-key']);if(pushPreferences().progression_alerts&&result.session.attempts.some(attempt=>attempt.outcome==='complete'))sendPush({title:'Workout saved',body:`${result.session.day_type} completed. Your progression has been updated.`,url:'/'}).catch(error=>console.error(`[fitness] push alert failed: ${error.message}`));return json(response,201,result);}
  if(request.method==='PUT'&&url.pathname.startsWith('/api/sessions/'))return json(response,200,updateSession(decodeURIComponent(url.pathname.split('/').at(-1)),await readJson(request),request.headers['idempotency-key']));
  if(request.method==='POST'&&url.pathname==='/api/rebuild-next-workout'){const payload=await readJson(request);const workout=buildWorkout(db,payload.day_type||getState(db,'next_workout',{}).day_type||'Day 1');setState(db,'next_workout',workout);return json(response,200,{next_workout:workout});}
  if(request.method==='GET')return serveStatic(url.pathname,response);return json(response,404,{error:'Not found.'});
}catch(error){console.error(error);return json(response,400,{error:error.message||'Request failed.'});}});
server.listen(port,host,()=>console.log(`[fitness] listening on http://${host}:${port}`));
