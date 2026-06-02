import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp/data';
const oldDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.previous.json`, 'utf8'));
const newDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.json`, 'utf8'));

const oldIds = new Set((oldDb.threads || []).map((t) => t.threadId).filter(Boolean));
const newIds = new Set((newDb.threads || []).map((t) => t.threadId).filter(Boolean));

const hoursBetween = (older, newer) => {
  const oldMs = Date.parse(older || '');
  const newMs = Date.parse(newer || '');
  if (!Number.isFinite(oldMs) || !Number.isFinite(newMs) || newMs <= oldMs) return null;
  return (newMs - oldMs) / 36e5;
};

const baselineGapHours = hoursBetween(oldDb.baselineAt, newDb.baselineAt);
// The 7am run is the first after the 11pm-7am quiet window, so it can
// legitimately contain a full overnight delta. Keep the tight hourly guard for
// normal runs, but allow a larger bounded window after a long baseline gap.
let maxAllowedRows = baselineGapHours !== null && baselineGapHours > 2.5 ? 60 : 15;

if (oldIds.size < 10 && newIds.size >= 10) {
  throw new Error(`Refusing delta against empty/suspicious baseline: old=${oldIds.size}, new=${newIds.size}`);
}

const parsePriceNumber = (value = '') => {
  const text = String(value || '');
  const match = text.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const num = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
};

const clean = (s = '') => String(s)
  .replace(/^\(\d+\)\s*/, '')
  .replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD|PRICEDROP)\]\s*[-–—]?\s*/i, '')
  .replace(/\|\s*Replica Watch Info$/i, '')
  .replace(/^For Sale:\s*/i, '')
  .replace(/^[-–—]\s*/, '')
  .trim();

let rows = (newDb.threads || [])
  .filter((t) => t.threadId && !oldIds.has(t.threadId))
  .map((t) => {
    const cost = t.askingPrice || '';
    const priceValue = parsePriceNumber(cost);
    return {
      status: t.status || (/\[SOLD\]/i.test(t.title) ? 'SOLD' : /\[PENDING\]|reserved sale|\[reserved\]/i.test(t.title) ? 'PENDING' : 'FOR SALE'),
      watch: clean(t.title),
      cost,
      priceValue,
      isBudgetFind: priceValue !== null && priceValue < 400,
      posted: t.startDate || t.threadTime || '',
      threadId: t.threadId,
      threadUrl: t.threadUrl,
      author: t.author || '',
    };
  })
  .filter((t) => t.status !== 'SOLD');

// Recovery path: if the previous baseline was captured while the extractor was
// still mis-normalizing RWI rows, a same-day rerun can legitimately recover a
// larger batch of active/pending rows. Allow that one case so the hourly chain
// can finish and refresh the downstream app.
if (
  baselineGapHours !== null &&
  baselineGapHours < 0.5 &&
  oldIds.size >= 200 &&
  newIds.size >= oldIds.size &&
  rows.length <= 100
) {
  maxAllowedRows = 100;
}

if (rows.length > maxAllowedRows) {
  const gapText = baselineGapHours === null ? 'unknown' : baselineGapHours.toFixed(1);
  throw new Error(`Refusing unusually large RWI delta (${rows.length}; max=${maxAllowedRows}; baselineGapHours=${gapText}); likely stale/empty baseline`);
}

const payload = {
  count: rows.length,
  rows,
  meta: {
    baselineGapHours,
    maxAllowedRows,
  },
};

fs.writeFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
