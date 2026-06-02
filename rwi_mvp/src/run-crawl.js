import { execFileSync } from 'child_process';
import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';
const dataDir = `${baseDir}/data`;
const currentPath = `${dataDir}/rwi.json`;
const previousPath = `${dataDir}/rwi.previous.json`;
const bookmarkletPath = `${dataDir}/rwi_bookmarklet_current.json`;

fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(currentPath)) {
  fs.copyFileSync(currentPath, previousPath);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runExtractorOnce = () => {
  const raw = execFileSync('node', [`${baseDir}/run_bookmarklet_extractor.mjs`], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(raw);
};

let extracted;
let lastFailure;
const attempts = 3;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const candidate = runExtractorOnce();
    const candidateRows = candidate.rows || [];
    if (Array.isArray(candidateRows) && candidateRows.length >= 10) {
      extracted = candidate;
      break;
    }
    const rowCount = Array.isArray(candidateRows) ? candidateRows.length : 'non-array';
    lastFailure = new Error(`RWI extraction returned too few rows (${rowCount}) on attempt ${attempt}`);
    const badPath = `${dataDir}/rwi_bookmarklet_bad_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(badPath, JSON.stringify(candidate, null, 2));
  } catch (error) {
    lastFailure = error;
  }

  if (attempt < attempts) {
    try {
      execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', 'stop'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {}
    await sleep(15000 * attempt);
  }
}

if (!extracted) {
  const message = lastFailure?.message || String(lastFailure || 'unknown extraction failure');
  throw new Error(`${message}; preserving existing baseline after ${attempts} attempts`);
}

fs.writeFileSync(bookmarkletPath, JSON.stringify(extracted, null, 2));

const isValidExtractedRow = (row) => {
  const url = String(row?.url || '').trim();
  const title = String(row?.title || '').trim();
  return Boolean(url && /^https?:\/\//i.test(url) && !/undefined/i.test(url) && title && title !== 'Untitled');
};

const flattenExtractedRow = (row) => (row && row.row && typeof row.row === 'object' ? { ...row.row, ...row } : row);
const extractedRows = (extracted.rows || [])
  .map(flattenExtractedRow)
  .filter(isValidExtractedRow);

const normalizeStatus = (label = '') => {
  if (/\[SOLD\]/i.test(label)) return 'SOLD';
  if (/\[PENDING\]/i.test(label)) return 'PENDING';
  if (/\[STAFF\s*REVIEW\]/i.test(label)) return 'STAFF REVIEW';
  if (/\[GEN\s*WATCH\]/i.test(label)) return 'GEN WATCH';
  if (/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(label)) return 'FOR SALE';
  if (/\[FOR\s*SALE\]/i.test(label)) return 'FOR SALE';
  return String(label || '').replace(/[\[\]]/g, '').trim().toUpperCase() || 'FOR SALE';
};

const normalizePostType = (label = '') => {
  if (/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(label)) return 'price_drop';
  if (/\[FOR\s*SALE\]/i.test(label)) return 'for_sale';
  if (/\[PENDING\]/i.test(label)) return 'pending';
  if (/\[SOLD\]/i.test(label)) return 'sold';
  if (/\[STAFF\s*REVIEW\]/i.test(label)) return 'staff_review';
  if (/\[GEN\s*WATCH\]/i.test(label)) return 'gen_watch';
  return 'unknown';
};

const cleanTitle = (title = '') => String(title)
  .replace(/^For Sale:\s*/i, '')
  .trim();

const toThread = (row) => {
  const normalizedStatus = normalizeStatus(row.label);
  const rawLabel = String(row.label || '').trim();
  return {
    threadId: row.url ? (String(row.url).match(/\.(\d+)$/)?.[1] || String(row.url).match(/\.(\d+)\//)?.[1]) : null,
    threadUrl: (row.url || '').endsWith('/') ? row.url : `${row.url}/`,
    title: `[${normalizedStatus}] - ${cleanTitle(row.title)} | Replica Watch Info`,
    askingPrice: row.askingPrice || '',
    currency: row.currency || '',
    location: row.location || '',
    condition: row.condition || '',
    payment: row.payment || '',
    shipping: row.shipping || '',
    threadTime: row.startDate || '',
    rawPath: null,
    capturedAt: new Date().toISOString(),
    author: row.author || '',
    replies: row.replies || '',
    views: row.views || '',
    startDate: row.startDate || '',
    status: normalizedStatus,
    label: rawLabel,
    postType: normalizePostType(rawLabel),
    priceNote: row.priceNote || '',
  };
};

const db = {
  baselineAt: new Date().toISOString(),
  source: 'rwi-bookmarklet',
  href: extracted.href,
  counts: extracted.counts,
  threads: extractedRows.map(toThread),
  listings: extractedRows.map((row) => ({
    status: normalizeStatus(row.label),
    label: String(row.label || '').trim(),
    postType: normalizePostType(row.label),
    watch: cleanTitle(row.title),
    posted: row.startDate || '',
    threadUrl: row.url,
    threadId: row.url ? (String(row.url).match(/\.(\d+)$/)?.[1] || String(row.url).match(/\.(\d+)\//)?.[1]) : null,
    author: row.author || '',
    replies: row.replies || '',
    views: row.views || '',
    askingPrice: row.askingPrice || '',
    priceValue: row.priceValue ?? null,
    priceNote: row.priceNote || '',
  })),
};

fs.writeFileSync(currentPath, JSON.stringify(db, null, 2));
console.log(JSON.stringify({
  ok: true,
  source: db.source,
  count: db.threads.length,
  counts: db.counts,
  latest: db.listings[0] || null,
}, null, 2));
