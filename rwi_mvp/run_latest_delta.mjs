import fs from 'fs';
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const prev=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.previous.json','utf8'));
const prevIds=new Set(prev.threads.map(t=>t.threadId));
const clean=s=>String(s||'').replace(/^\(\d+\)\s*/,'').replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD)\]\s*[-–—]?\s*/i,'').replace(/\|\s*Replica Watch Info$/i,'').replace(/^[-–—]\s*/,'').trim();
const rows=db.threads.filter(t=>!prevIds.has(t.threadId)).map(t=>({
  status:/\[SOLD\]/i.test(t.title)?'SOLD':/\[PENDING\]|reserved sale|\[reserved\]/i.test(t.title)?'PENDING':'FOR SALE',
  watch:clean(t.title),
  cost:t.askingPrice||'',
  posted:t.threadTime||'',
})).filter(r=>r.status!=='SOLD');
fs.writeFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_latest.json', JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
