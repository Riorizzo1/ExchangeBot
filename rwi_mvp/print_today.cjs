const fs=require('fs');
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const today=new Date().toISOString().slice(0,10);
const cleanTitle=s=>String(s||'').replace(/^\[(PENDING|FOR SALE|RESERVED|STAFF HOLD|SOLD)\]\s*-\s*/i,'').replace(/^\-\s*/,'').replace(/\s*\|\s*Replica Watch Info$/i,'').trim();
const cleanCost=s=>String(s||'').replace(/^Asking Price\?\s*/i,'').trim();
const rows=db.threads.filter(t=>(t.capturedAt||'').slice(0,10)===today).map(t=>`${cleanTitle(t.title)} - ${cleanCost(t.askingPrice)} - ${t.threadTime||''}`);
console.log(rows.join('\n'));
