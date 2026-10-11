const fs=require('fs');
const { execFileSync } = require('child_process');
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
for (const t of db.threads) {
  const snap = `/Users/bobby/.openclaw/workspace/rwi_mvp/data/raw/${t.threadId}.txt`;
  if (!fs.existsSync(snap)) continue;
  try {
    execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/index.js', 'parse-thread', t.threadUrl, snap], { stdio: 'ignore' });
  } catch {}
}
const fresh=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const cleanTitle=s=>String(s||'').replace(/^\[(PENDING|FOR SALE|RESERVED|STAFF HOLD|SOLD)\]\s*-\s*/i,'').replace(/^\-\s*/,'').replace(/\s*\|\s*Replica Watch Info$/i,'').trim();
const cleanCost=s=>String(s||'').replace(/^Asking Price\?\s*/i,'').trim();
const isMeta = title => {
  const t = String(title || '').toLowerCase();
  return t.includes('rules') || t.includes('scammer') || t.includes('recertify') || t.includes('protect yourself') || t.includes('certified supporter') || t.includes('pending what does that mean') || t.includes('member sales section rules') || t.includes('non-supporter multiple sales') || t.includes('nope');
};
const looksToday = t => {
  const tt = String(t.threadTime || '').toLowerCase();
  if (tt.includes('minute') || tt.includes('hour') || tt.includes('today') || tt.includes('yesterday')) return true;
  const id = Number(t.threadId || 0);
  return id >= 11039151;
};
const rows = fresh.threads.filter(t => !isMeta(t.title)).filter(t => t.askingPrice || t.currency || t.payment || t.shipping).filter(looksToday).sort((a,b)=>Number(b.threadId)-Number(a.threadId));
for (const t of rows) console.log(`${cleanTitle(t.title)} - ${cleanCost(t.askingPrice)} - ${t.threadTime || ''}`);
