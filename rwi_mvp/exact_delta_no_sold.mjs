import fs from 'fs';
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const old=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.previous.json','utf8'));
const oldIds=new Set(old.threads.map(t=>t.threadId));
const clean=s=>String(s||'').replace(/^\(\d+\)\s*/,'').replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD)\]\s*[-–—]?\s*/i,'').replace(/\|\s*Replica Watch Info$/i,'').replace(/^[-–—]\s*/,'').trim();
const rows=db.threads.filter(t=>!oldIds.has(t.threadId)).map(t=>({
  status:/\[PENDING\]|reserved sale|\[reserved\]/i.test(t.title)?'PENDING':/\[SOLD\]/i.test(t.title)?'SOLD':'FOR SALE',
  watch:clean(t.title),
  cost:t.askingPrice||'',
  posted:t.threadTime||'',
  threadId:t.threadId,
})).filter(r=>r.status!=='SOLD');
console.log(JSON.stringify(rows,null,2));
