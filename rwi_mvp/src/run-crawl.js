import { execFileSync } from 'child_process';
import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';
const browserProfile = process.env.RWI_BROWSER_PROFILE || 'openclaw';
const dataDir = `${baseDir}/data`;
const currentPath = `${dataDir}/rwi.json`;
// A crawl must not replace the accepted baseline until its delta has passed
// validation. `run_fresh_delta.mjs` promotes this candidate atomically.
const candidatePath = `${dataDir}/rwi.candidate.json`;
const bookmarkletPath = `${dataDir}/rwi_bookmarklet_current.json`;

const getThreadId = (url = '') => (
  String(url).match(/\.(\d+)$/)?.[1]
  || String(url).match(/\.(\d+)\//)?.[1]
  || null
);

fs.mkdirSync(dataDir, { recursive: true });

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
      execFileSync('openclaw', ['browser', '--browser-profile', browserProfile, 'stop'], {
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

const rowsForHealth = Array.isArray(extracted.rows) ? extracted.rows : [];
const activeRowsForHealth = rowsForHealth.filter((row) => row?.label !== '[SOLD]');
const enrichedRowsForHealth = activeRowsForHealth.filter((row) => row && (row.askingPrice || row.priceValue != null));
const failedEnrichRowsForHealth = activeRowsForHealth.filter((row) => row?.enrichError);
if (activeRowsForHealth.length >= 10 && enrichedRowsForHealth.length === 0 && failedEnrichRowsForHealth.length >= 10) {
  const firstError = failedEnrichRowsForHealth[0]?.enrichError || 'unknown enrich failure';
  throw new Error(`RWI enrichment failed for all active sampled rows (${failedEnrichRowsForHealth.length}); firstError=${firstError}; preserving existing baseline`);
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

let previousDb = null;
try {
  if (fs.existsSync(currentPath)) previousDb = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
} catch {}

const previousByThreadId = new Map();
for (const item of [...(previousDb?.threads || []), ...(previousDb?.listings || [])]) {
  const threadId = item.threadId || getThreadId(item.threadUrl || item.url || '');
  if (!threadId) continue;
  previousByThreadId.set(threadId, item);
}

const withPreviousPriceFallback = (row) => {
  const threadId = getThreadId(row.url || '');
  const previous = threadId ? previousByThreadId.get(threadId) : null;
  if (!previous) return row;
  const hasPrice = row.askingPrice || row.priceValue != null;
  if (hasPrice) return row;
  return {
    ...row,
    askingPrice: previous.askingPrice || row.askingPrice || '',
    currency: previous.currency || row.currency || '',
    priceValue: previous.priceValue ?? row.priceValue ?? null,
    priceSource: 'carried-forward',
    priceNote: row.enrichError ? `Carried forward from previous baseline; enrich failed: ${row.enrichError}` : (previous.priceNote || row.priceNote || 'Carried forward from previous baseline'),
    location: row.location || previous.location || '',
    condition: row.condition || previous.condition || '',
    payment: row.payment || previous.payment || '',
    shipping: row.shipping || previous.shipping || '',
  };
};

const normalizedRows = extractedRows.map(withPreviousPriceFallback);

const normalizeStatus = (label = '', title = '') => {
  const text = `${label || ''} ${title || ''}`;
  if (/\bSOLD\b|\bCOMPLETE(?:D)?\b|\bCLOSED\b/i.test(text)) return 'SOLD';
  if (/\bPENDING\b|\bRESERVED\b|\bHOLD\b/i.test(text)) return 'PENDING';
  if (/\[STAFF\s*REVIEW\]/i.test(label)) return 'STAFF REVIEW';
  if (/\[GEN\s*WATCH\]/i.test(label)) return 'GEN WATCH';
  if (/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(label)) return 'FOR SALE';
  if (/\[FOR\s*SALE\]/i.test(label)) return 'FOR SALE';
  return String(label || '').replace(/[\[\]]/g, '').trim().toUpperCase() || 'FOR SALE';
};

const normalizePostType = (label = '', title = '') => {
  const status = normalizeStatus(label, title);
  if (status === 'SOLD') return 'sold';
  if (status === 'PENDING') return 'pending';
  if (/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(label)) return 'price_drop';
  if (/\[FOR\s*SALE\]/i.test(label)) return 'for_sale';
  if (/\[STAFF\s*REVIEW\]/i.test(label)) return 'staff_review';
  if (/\[GEN\s*WATCH\]/i.test(label)) return 'gen_watch';
  return 'unknown';
};

const cleanTitle = (title = '') => String(title)
  .replace(/^For Sale:\s*/i, '')
  .trim();

const toThread = (row) => {
  const normalizedStatus = normalizeStatus(row.label, row.title);
  const rawLabel = String(row.label || '').trim();
  return {
    threadId: getThreadId(row.url || ''),
    threadUrl: (row.url || '').endsWith('/') ? row.url : `${row.url}/`,
    title: `[${normalizedStatus}] - ${cleanTitle(row.title)} | Replica Watch Info`,
    askingPrice: row.askingPrice || '',
    priceSource: row.priceSource || (row.askingPrice ? 'legacy' : 'unavailable'),
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
    postType: normalizePostType(rawLabel, row.title),
    priceNote: row.priceNote || '',
  };
};

const db = {
  baselineAt: new Date().toISOString(),
  source: 'rwi-bookmarklet',
  href: extracted.href,
  counts: extracted.counts,
  threads: normalizedRows.map(toThread),
  listings: normalizedRows.map((row) => ({
    status: normalizeStatus(row.label, row.title),
    label: String(row.label || '').trim(),
    postType: normalizePostType(row.label, row.title),
    watch: cleanTitle(row.title),
    posted: row.startDate || '',
    threadUrl: row.url,
    threadId: getThreadId(row.url || ''),
    author: row.author || '',
    replies: row.replies || '',
    views: row.views || '',
    askingPrice: row.askingPrice || '',
    priceValue: row.priceValue ?? null,
    priceSource: row.priceSource || (row.askingPrice ? 'legacy' : 'unavailable'),
    priceNote: row.priceNote || '',
  })),
};

fs.writeFileSync(candidatePath, JSON.stringify(db, null, 2));
console.log(JSON.stringify({
  ok: true,
  source: db.source,
  count: db.threads.length,
  candidatePath,
  counts: db.counts,
  latest: db.listings[0] || null,
}, null, 2));
