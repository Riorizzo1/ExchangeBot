const fs=require('fs');
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const today=new Date().toISOString().slice(0,10);
const cleanTitle=s=>String(s||'')
  .replace(/^\[(PENDING|FOR SALE|RESERVED|STAFF HOLD|SOLD)\]\s*-\s*/i,'')
  .replace(/^\-\s*/,'')
  .replace(/\s*\|\s*Replica Watch Info$/i,'')
  .trim();
const cleanCost=s=>String(s||'').replace(/^Asking Price\?\s*/i,'').trim();
const isMeta = title => {
  const t = String(title || '').toLowerCase();
  return t.includes('rules') || t.includes('scammer') || t.includes('recertify') || t.includes('protect yourself') || t.includes('certified supporter') || t.includes('pending what does that mean') || t.includes('member sales section rules') || t.includes('non-supporter multiple sales') || t.includes('nope');
};
const rows = db.threads
  .filter(t => (t.capturedAt||'').slice(0,10) === today)
  .filter(t => !isMeta(t.title))
  .filter(t => t.askingPrice || t.currency || t.payment || t.shipping)
  .map(t => ({title: cleanTitle(t.title), cost: cleanCost(t.askingPrice), posted: t.threadTime || '', url: t.threadUrl}))
  .filter(r => r.title)
  .sort((a,b) => a.url.localeCompare(b.url));
for (const r of rows) console.log(`${r.title} - ${r.cost} - ${r.posted}`);
