import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp/data';
const oldDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.previous.json`, 'utf8'));
const newDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.json`, 'utf8'));

const oldIds = new Set((oldDb.threads || []).map((t) => t.threadId).filter(Boolean));

const clean = (s = '') => String(s)
  .replace(/^\(\d+\)\s*/, '')
  .replace(/^\[(PENDING|FOR SALE|RESERVED|SOLD|PRICEDROP)\]\s*[-–—]?\s*/i, '')
  .replace(/\|\s*Replica Watch Info$/i, '')
  .replace(/^For Sale:\s*/i, '')
  .replace(/^[-–—]\s*/, '')
  .trim();

const rows = (newDb.threads || [])
  .filter((t) => t.threadId && !oldIds.has(t.threadId))
  .map((t) => ({
    status: t.status || (/\[SOLD\]/i.test(t.title) ? 'SOLD' : /\[PENDING\]|reserved sale|\[reserved\]/i.test(t.title) ? 'PENDING' : 'FOR SALE'),
    watch: clean(t.title),
    cost: t.askingPrice || '',
    posted: t.startDate || t.threadTime || '',
    threadId: t.threadId,
    threadUrl: t.threadUrl,
    author: t.author || '',
  }))
  .filter((t) => t.status !== 'SOLD');

console.log(JSON.stringify({
  count: rows.length,
  rows,
}, null, 2));
