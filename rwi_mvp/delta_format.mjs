import fs from 'fs';
const payload=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json','utf8'));
const rows=payload.rows || payload;
const cleanWatch=s=>String(s||'')
  .replace(/^\(EU\)\s*/,'')
  .replace(/^\(CONUS\)\s*/,'')
  .replace(/^\[UK\]\s*/,'')
  .replace(/^\[EU\]\s*/,'')
  .replace(/^\[PENDING\]\s*/,'')
  .replace(/^\[SOLD\]\s*/,'')
  .replace(/^\[FOR SALE\]\s*/,'')
  .replace(/^PENDING\s*/i,'')
  .replace(/^FOR SALE\s*/i,'')
  .replace(/^SOLD\s*/i,'')
  .replace(/\s+/g,' ')
  .trim();
const budget = rows.filter(r => r.isBudgetFind);
if (budget.length) {
  console.log(`BUDGET WATCHES UNDER $400: ${budget.length}`);
  for (const r of budget) {
    const w=cleanWatch(r.watch).replace(/\s*\|.*$/,'').trim();
    console.log(`UNDER $400: ${w} - ${r.cost} - ${r.posted}`);
  }
  console.log('');
}
for (const r of rows) {
  const w=cleanWatch(r.watch).replace(/\s*\|.*$/,'').trim();
  const prefix = r.isBudgetFind ? 'UNDER $400 | ' : '';
  console.log(`${prefix}${r.status}: ${w} - ${r.cost} - ${r.posted}`);
}
