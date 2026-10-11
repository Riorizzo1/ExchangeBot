const fs=require('fs');
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
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
const looksToday = t => {
  const tt = String(t.threadTime || '').toLowerCase();
  if (tt.includes('minute') || tt.includes('hour') || tt.includes('today') || tt.includes('just now')) return true;
  const id = Number(t.threadId || 0);
  return id >= 11039151;
};
const rows = db.threads
  .filter(t => !isMeta(t.title))
  .filter(t => t.askingPrice || t.currency || t.payment || t.shipping)
  .filter(looksToday)
  .map(t => ({title: cleanTitle(t.title), cost: cleanCost(t.askingPrice), posted: t.threadTime || '', id: Number(t.threadId || 0)}))
  .sort((a,b) => b.id - a.id);
for (const r of rows) console.log(`${r.title} - ${r.cost} - ${r.posted}`);
