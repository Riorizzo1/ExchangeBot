import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/today_extract.mjs.out.json','utf8'));
const bad = /(rules|scammer|warning|need to recertify|renew|member to member sales section rules|staff hold|reserved sale for @w47chl0v3r)/i;
const seen = new Set();
const out = [];
for (const r of rows) {
  if (!(r.posted.startsWith('Today') || r.posted.includes('minutes ago'))) continue;
  if (r.status === 'SOLD') continue;
  if (bad.test(r.watch)) continue;
  const key = r.watch.toLowerCase().replace(/\s+/g,' ').trim();
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(r);
}
console.log(JSON.stringify(out, null, 2));
