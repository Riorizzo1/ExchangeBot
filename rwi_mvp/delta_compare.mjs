import fs from 'fs';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp/data';
const oldDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.previous.json`, 'utf8'));
const newDb = JSON.parse(fs.readFileSync(`${baseDir}/rwi.json`, 'utf8'));

const oldIds = new Set((oldDb.threads || []).map((t) => t.threadId).filter(Boolean));

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

const rows = (newDb.threads || [])
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

console.log(JSON.stringify({
  count: rows.length,
  rows,
}, null, 2));
