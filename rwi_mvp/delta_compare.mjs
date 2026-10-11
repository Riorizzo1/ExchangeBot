import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp/data';
const oldDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.json`, 'utf8'));
const newDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.candidate.json`, 'utf8'));

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
// Normal hourly batches can occasionally land at 20 without being suspicious.
let maxAllowedRows = baselineGapHours !== null && baselineGapHours > 2.5 ? 60 : 30;

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

const normalize = (value = '') => String(value || '').trim();

const clean = (s = '') => String(s)
  .replace(/^\(\d+\)\s*/, '')
  .replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD|PRICEDROP)\]\s*[-–—]?\s*/i, '')
  .replace(/\|\s*Replica Watch Info$/i, '')
  .replace(/^For Sale:\s*/i, '')
  .replace(/^[-–—]\s*/, '')
  .trim();

const statusFromThread = (t = {}) => {
  const text = `${t.status || ''} ${t.title || ''}`;
  if (/\bSOLD\b|\bCOMPLETE(?:D)?\b|\bCLOSED\b/i.test(text)) return 'SOLD';
  if (/\bPENDING\b|\bRESERVED\b|\bHOLD\b/i.test(text)) return 'PENDING';
  if (/\bFOR\s*SALE\b|\bPRICE\s*DROP\b|\bPRICEDROP\b|\bWTS\b/i.test(text)) return 'FOR SALE';
  return t.status || 'FOR SALE';
};

const oldById = new Map((oldDb.threads || []).map((t) => [String(t.threadId || ''), t]));

const currentRows = (newDb.threads || [])
  .filter((t) => t.threadId)
  .map((t) => {
    const cost = t.askingPrice || '';
    const priceValue = parsePriceNumber(cost);
    return {
      status: statusFromThread(t),
      watch: clean(t.title),
      cost,
      priceValue,
      isBudgetFind: priceValue !== null && priceValue < 400,
      posted: t.startDate || t.threadTime || '',
      threadId: String(t.threadId),
      threadUrl: t.threadUrl,
      author: t.author || '',
    };
  });

const changeKind = (prev, next) => {
  if (!prev) return 'new';
  const prevStatus = normalize(prev.status).toUpperCase();
  const nextStatus = normalize(next.status).toUpperCase();
  const prevCost = normalize(prev.askingPrice || prev.cost);
  const nextCost = normalize(next.cost);
  const prevPrice = parsePriceNumber(prev.askingPrice || prev.cost || '');
  const nextPrice = next.priceValue;
  const prevLabel = normalize(clean(prev.title || prev.watch || ''));
  const nextLabel = normalize(next.watch);
  if (prevStatus !== nextStatus || prevLabel !== nextLabel) return 'status';
  // Price hydration is intentionally not an alert delta. Historical records can
  // gain a verified price after a partial crawl, and that is not a new listing.
  if (prevCost !== nextCost || prevPrice !== nextPrice) return 'price';
  return null;
};

const changes = currentRows
  .map((next) => ({ row: next, kind: changeKind(oldById.get(next.threadId), next) }))
  .filter((change) => change.kind);
const breakdown = Object.fromEntries(['new', 'status', 'price'].map((kind) => [kind, changes.filter((change) => change.kind === kind).length]));
// The hourly notification is deliberately about new listings and state changes.
// Price-only changes are retained in the candidate data but never generate an
// alert or trip the large-delta guard.
let rows = changes.filter((change) => change.kind !== 'price').map((change) => change.row);

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
  throw new Error(`Refusing unusually large RWI delta (${rows.length}; max=${maxAllowedRows}; baselineGapHours=${gapText}; new=${breakdown.new}; status=${breakdown.status}; priceOnly=${breakdown.price}); likely stale/empty baseline`);
}

const payload = {
  count: rows.length,
  rows,
  meta: {
    baselineGapHours,
    maxAllowedRows,
    breakdown,
  },
};

fs.writeFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
