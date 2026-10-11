import fs from 'fs';

if (process.stdout?.setDefaultEncoding) process.stdout.setDefaultEncoding('utf8');
process.env.LC_ALL = process.env.LC_ALL || 'en_US.UTF-8';
process.env.LANG = process.env.LANG || 'en_US.UTF-8';

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
const safeText = (s) => String(s || '').normalize('NFC');
const withLink = (r, line) => `${safeText(line)}\n${r.threadUrl || ''}`.trim();
const numericCost = (value) => {
  const m = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
};
const isBudget = (r) => Boolean(r.isBudgetFind) || ((numericCost(r.cost) ?? Infinity) < 400);
const budget = rows.filter(isBudget);
if (budget.length) {
  console.log(`BUDGET WATCHES UNDER $400: ${budget.length}`);
  for (const r of budget) {
    const w=cleanWatch(r.watch).replace(/\s*\|.*$/,'').trim();
    console.log(withLink(r, `💸 UNDER $400: ${w} - ${r.cost} - ${r.posted}`));
  }
  console.log('');
}
for (const r of rows) {
  const w=cleanWatch(r.watch).replace(/\s*\|.*$/,'').trim();
  const prefix = isBudget(r) ? '💸 UNDER $400 | ' : '';
  console.log(withLink(r, `${prefix}${r.status}: ${w} - ${r.cost} - ${r.posted}`));
}
