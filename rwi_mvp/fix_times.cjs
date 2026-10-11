const fs=require('fs');
const base='/Users/bobby/.openclaw/workspace/rwi_mvp';
const db=JSON.parse(fs.readFileSync(`${base}/data/rwi.json`,'utf8'));
for (const t of db.threads) {
  if (!t.threadTime || t.threadTime === 'null') {
    const snap = `${base}/data/raw/${t.threadId}.txt`;
    if (!fs.existsSync(snap)) continue;
    const text = fs.readFileSync(snap,'utf8');
    const m = text.match(/- link "(\d+\s+minutes? ago|\d+\s+hours? ago|Today|Yesterday)"/) || text.match(/- StaticText "(\d+\s+minutes? ago|\d+\s+hours? ago|Today|Yesterday)"/);
    if (m) t.threadTime = m[1];
  }
}
fs.writeFileSync(`${base}/data/rwi.json`, JSON.stringify(db,null,2));
const today=new Date().toISOString().slice(0,10);
const cleanTitle=s=>String(s||'').replace(/^\[(PENDING|FOR SALE|RESERVED|STAFF HOLD)\]\s*-\s*/i,'').replace(/^\-\s*/,'').replace(/\s*\|\s*Replica Watch Info$/i,'').trim();
const cleanCost=s=>String(s||'').replace(/^Asking Price\?\s*/i,'').trim();
const rows=db.threads.filter(t=>(t.capturedAt||'').slice(0,10)===today).map(t=>`${cleanTitle(t.title)} - ${cleanCost(t.askingPrice)} - ${t.threadTime || ''}`);
console.log(rows.join('\n'));
