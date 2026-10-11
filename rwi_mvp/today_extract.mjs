import fs from 'fs';
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const today = new Date().toISOString().slice(0,10);
const clean=s=>String(s||'').replace(/^\(\d+\)\s*/,'').replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD)\]\s*[-–—]?\s*/i,'').replace(/\|\s*Replica Watch Info$/i,'').replace(/^[-–—]\s*/,'').trim();
const rows=db.threads.filter(t=>(t.capturedAt||'').slice(0,10)===today).map(t=>({
  status:/\[SOLD\]/i.test(t.title)?'SOLD':/\[PENDING\]|reserved sale|\[reserved\]/i.test(t.title)?'PENDING':'FOR SALE',
  watch:clean(t.title),
  cost:t.askingPrice||'',
  posted:t.threadTime||'',
}));
console.log(JSON.stringify(rows,null,2));
