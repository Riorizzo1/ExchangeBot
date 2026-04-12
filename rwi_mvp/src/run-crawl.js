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

const raw = execFileSync('node', [`${baseDir}/run_bookmarklet_extractor.mjs`], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
const extracted = JSON.parse(raw);
fs.writeFileSync(bookmarkletPath, JSON.stringify(extracted, null, 2));

const normalizeStatus = (label = '') => {
  if (/\[SOLD\]/i.test(label)) return 'SOLD';
  if (/\[PENDING\]/i.test(label)) return 'PENDING';
  return 'FOR SALE';
};

const cleanTitle = (title = '') => String(title)
  .replace(/^For Sale:\s*/i, '')
  .trim();

const toThread = (row) => ({
  threadId: String(row.url).match(/\.(\d+)$/)?.[1] || String(row.url).match(/\.(\d+)\//)?.[1] || null,
  threadUrl: row.url.endsWith('/') ? row.url : `${row.url}/`,
  title: `[${normalizeStatus(row.label)}] - ${cleanTitle(row.title)} | Replica Watch Info`,
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
  status: normalizeStatus(row.label),
});

const db = {
  baselineAt: new Date().toISOString(),
  source: 'rwi-bookmarklet',
  href: extracted.href,
  counts: extracted.counts,
  threads: (extracted.rows || []).map(toThread),
  listings: (extracted.rows || []).map((row) => ({
    status: normalizeStatus(row.label),
    watch: cleanTitle(row.title),
    posted: row.startDate || '',
    threadUrl: row.url,
    threadId: String(row.url).match(/\.(\d+)$/)?.[1] || String(row.url).match(/\.(\d+)\//)?.[1] || null,
    author: row.author || '',
    replies: row.replies || '',
    views: row.views || '',
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
