import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const rawDir = path.join(dataDir, 'raw');
const dbPath = path.join(dataDir, 'rwi.json');

function ensureDirs() {
  fs.mkdirSync(rawDir, { recursive: true });
}

function loadDb() {
  if (!fs.existsSync(dbPath)) {
    return { baselineAt: null, threads: [], listings: [] };
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDb(db) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function summarizeToday(db) {
  const today = new Date().toISOString().slice(0, 10);
  return db.threads.filter(t => (t.capturedAt || '').slice(0, 10) === today).map(t => ({
    watch: cleanWatchTitle(t.title),
    cost: cleanCost(t.askingPrice, t.currency),
    posted: cleanPosted(t.threadTime, t.capturedAt),
    threadUrl: t.threadUrl,
  }));
}

function cleanWatchTitle(title = '') {
  return title
    .replace(/^\[(PENDING|FOR SALE|RESERVED)\]\s*-\s*/i, '')
    .replace(/\s*\|\s*Replica Watch Info$/i, '')
    .trim();
}

function cleanCost(cost = '', currency = '') {
  const c = String(cost || '').replace(/^Asking Price\?\s*/i, '').trim();
  if (!c) return '';
  if (/^[£€$]/.test(c) || /\d/.test(c) && /[£€$]/.test(currency || '')) return c;
  return c;
}

function cleanPosted(threadTime = '', capturedAt = '') {
  if (threadTime && !/^(null|undefined)$/i.test(String(threadTime))) return threadTime;
  if (!capturedAt) return '';
  const d = new Date(capturedAt);
  return `${d.getMonth() + 1}/${d.getDate()} @ ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function normalizeSnapshotFile(inputFile, outputFile) {
  const text = fs.readFileSync(inputFile, 'utf8');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, text);
  return outputFile;
}

function exportToday(db, format = 'json') {
  const rows = summarizeToday(db);
  if (format === 'text') {
    return rows.map(r => `${r.watch || ''} - ${r.cost || ''} - ${r.posted || ''}`).join('\n');
  }
  return JSON.stringify(rows, null, 2);
}

function crawlConfig() {
  return {
    baseUrl: 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc',
    pages: 3,
  };
}

function listDeltaToday(db) {
  return summarizeToday(db);
}

function listNewSince(oldDb, newDb) {
  const seen = new Set((oldDb.threads || []).map(t => t.threadId));
  return (newDb.threads || []).filter(t => !seen.has(t.threadId)).map(t => ({
    watch: cleanWatchTitle(t.title),
    cost: cleanCost(t.askingPrice, t.currency),
    posted: cleanPosted(t.threadTime, t.capturedAt),
    threadUrl: t.threadUrl,
  }));
}

function crawlFreshSnapshot() {
  execFileSync('node', ['/Users/bobby/.openclaw/workspace/rwi_mvp/src/run-crawl.js'], { stdio: 'inherit' });
  return loadDb();
}

function crawlAndSummarize() {
  const db = loadDb();
  return {
    config: crawlConfig(),
    summary: summarizeToday(db),
  };
}

function loadSnapshotText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ingestSnapshot(db, snapshotPath, url) {
  const text = loadSnapshotText(snapshotPath);
  const parsed = parseThreadText(text, url);
  upsertThread(db, parsed);
  return parsed;
}

function slugToId(url = '') {
  const m = url.match(/\.(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

function extractValue(text, label) {
  const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:?\\s*([^\n]+)', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseThreadText(text, url) {
  const id = slugToId(url) || path.basename(url).slice(0, 16);
  const lines = text.split('\n').map(s => s.trim());
  const takeValue = (label) => {
    const i = lines.findIndex(l => l.includes(`term "${label}`) || l.includes(`StaticText "${label}`));
    if (i < 0) return null;
    for (let j = i; j < Math.min(i + 14, lines.length); j++) {
      const m = lines[j].match(/- StaticText "([^"]+)"/);
      if (m && m[1] !== label && m[1] !== ':' && m[1] !== 'none') return m[1].replace(/^.*\?\s*/, '').trim();
    }
    return null;
  };
  const title = (lines.find(l => l.startsWith('- RootWebArea "')) || '').replace('- RootWebArea "', '').replace('"', '').replace(/^\[SOLD\]\s+/, '') || null;
  const startIdx = lines.findIndex(l => l.includes('StaticText "Start date"'));
  let threadTime = null;
  if (startIdx >= 0) {
    for (let j = startIdx; j < Math.min(startIdx + 14, lines.length); j++) {
      const m = lines[j].match(/- StaticText "((?:Yesterday|Today) at [^"]+)"/);
      if (m) {
        threadTime = m[1];
        break;
      }
    }
  }
  if (!threadTime) {
    threadTime = lines.find(l => /- link "(\d+\s+minutes? ago|\d+\s+hours? ago|Today|Yesterday)"/.test(l))?.match(/"([^"]+)"/)?.[1] || null;
  }
  return {
    threadId: id,
    threadUrl: url,
    title,
    askingPrice: takeValue('Asking Price?'),
    currency: takeValue('Currency Accepted?'),
    location: takeValue('Location'),
    condition: takeValue('Item Condition?'),
    payment: takeValue('Accepted Payment Methods?'),
    shipping: takeValue('Shipping Costs?'),
    threadTime,
    rawPath: path.join('raw', `${id}.txt`),
    capturedAt: new Date().toISOString(),
  };
}

function backfillDemo() {
  ensureDirs();
  const db = loadDb();
  const sampleUrl = 'https://forum.replica-watch.info/threads/fs-44mm-pre-v-panerai-5218-203a-non-matching-hands.11039194/';
  const rawFile = path.join(rawDir, '11039194.txt');
  if (fs.existsSync(rawFile)) {
    const text = fs.readFileSync(rawFile, 'utf8');
    const parsed = parseThreadText(text, sampleUrl);
    upsertThread(db, parsed);
    saveDb(db);
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }
  console.log('Put a thread DOM export in data/raw/11039194.txt, then rerun parse.');
}

function captureFromSnapshot(inputFile, outputFile) {
  const text = fs.readFileSync(inputFile, 'utf8');
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, text);
  return outputFile;
}

function buildPageUrls(baseUrl, pages = 5) {
  const urls = [];
  const u = new URL(baseUrl);
  for (let i = 1; i <= pages; i++) {
    if (i === 1) {
      urls.push(u.toString());
    } else {
      u.searchParams.set('page', String(i));
      urls.push(u.toString());
    }
  }
  return urls;
}

function extractThreadUrlsFromIndex(htmlOrText) {
  const matches = [...htmlOrText.matchAll(/https:\/\/forum\.replica-watch\.info\/threads\/[A-Za-z0-9%\-_.]+\.[0-9]+(?:\/|\b)/g)].map(m => m[0]);
  return [...new Set(matches.filter(u => !u.includes('/latest') && !u.includes('/unread')) )];
}

function normalizeThreadUrl(url = '') {
  return url
    .replace(/#.*$/, '')
    .replace(/\/reply.*$/, '/')
    .replace(/\/post-\d+$/, '/')
    .replace(/\/watch$/, '/')
    .replace(/\/page-\d+$/, '/')
    .replace(/\/$/, '/');
}

function crawlPlan(indexTextPath, baseUrl) {
  const indexText = fs.readFileSync(indexTextPath, 'utf8');
  const threads = extractThreadUrlsFromIndex(indexText).map(normalizeThreadUrl);
  return { pages: buildPageUrls(baseUrl, 3), threads };
}

function extractThreadUrlsFromDomSnapshot(snapshotText) {
  const matches = [];
  const parts = snapshotText.split('href: "');
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const end = part.indexOf('"');
    if (end < 0) continue;
    const url = part.slice(0, end);
    if (url.includes('https://forum.replica-watch.info/threads/') && !url.includes('/latest') && !url.includes('/unread')) {
      matches.push(url);
    }
  }
  return [...new Set(matches.map(normalizeThreadUrl))];
}

function crawlPlanFromDom(domText, baseUrl) {
  const threads = extractThreadUrlsFromDomSnapshot(domText);
  return { pages: buildPageUrls(baseUrl, 5), threads };
}

function parseSnapshotText(text, url) {
  const lines = text.split('\n').map(s => s.trim());
  const near = (label) => {
    const i = lines.findIndex(l => l.includes(`term "${label}`) || l.includes(`StaticText "${label}`));
    if (i < 0) return null;
    for (let j = i; j < Math.min(i + 12, lines.length); j++) {
      const m = lines[j].match(/- StaticText "([^"]+)"/);
      if (m && m[1] !== label && m[1] !== ':' && m[1] !== 'none') return m[1];
    }
    return null;
  };
  const title = (lines.find(l => l.startsWith('- RootWebArea "')) || '').replace('- RootWebArea "', '').replace('"', '') || url;
  return {
    url,
    title,
    askingPrice: near('Asking Price?'),
    currency: near('Currency Accepted?'),
    location: near('Location'),
    condition: near('Item Condition?'),
    payment: near('Accepted Payment Methods?'),
    shipping: near('Shipping Costs?'),
    threadTime: lines.find(l => /- StaticText "(\d+\s+minutes? ago|\d+\s+hours? ago|Today|Yesterday)"/.test(l))?.match(/"([^"]+)"/)?.[1] || null,
  };
}

function upsertThread(db, parsed) {
  const ix = db.threads.findIndex(t => t.threadId === parsed.threadId);
  if (ix >= 0) db.threads[ix] = { ...db.threads[ix], ...parsed };
  else db.threads.push(parsed);
}

const cmd = process.argv[2];
if (cmd === 'config') {
  console.log(JSON.stringify(crawlConfig(), null, 2));
} else if (cmd === 'backfill' || !cmd) {
  backfillDemo();
} else if (cmd === 'parse-thread') {
  const url = process.argv[3];
  const file = process.argv[4];
  if (!url || !file) {
    console.error('Usage: node src/index.js parse-thread <url> <file>');
    process.exit(1);
  }
  ensureDirs();
  const text = fs.readFileSync(file, 'utf8');
  const parsed = parseThreadText(text, url);
  const db = loadDb();
  upsertThread(db, parsed);
  saveDb(db);
  console.log(JSON.stringify(parsed, null, 2));
} else if (cmd === 'capture') {
  const inputFile = process.argv[3];
  const outputFile = process.argv[4];
  if (!inputFile || !outputFile) {
    console.error('Usage: node src/index.js capture <input-file> <output-file>');
    process.exit(1);
  }
  ensureDirs();
  console.log(captureFromSnapshot(inputFile, outputFile));
} else if (cmd === 'plan') {
  const indexTextPath = process.argv[3];
  const baseUrl = process.argv[4] || 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
  if (!indexTextPath) {
    console.error('Usage: node src/index.js plan <index-text-file> [baseUrl]');
    process.exit(1);
  }
  console.log(JSON.stringify(crawlPlan(indexTextPath, baseUrl), null, 2));
} else if (cmd === 'today') {
  const db = loadDb();
  console.log(JSON.stringify(summarizeToday(db), null, 2));
} else if (cmd === 'delta') {
  const db = loadDb();
  console.log(JSON.stringify(listDeltaToday(db), null, 2));
} else if (cmd === 'delta-from') {
  const oldDbFile = process.argv[3];
  if (!oldDbFile) {
    console.error('Usage: node src/index.js delta-from <old-db-file>');
    process.exit(1);
  }
  const oldDb = JSON.parse(fs.readFileSync(oldDbFile, 'utf8'));
  const newDb = crawlFreshSnapshot();
  console.log(JSON.stringify(listNewSince(oldDb, newDb), null, 2));
} else if (cmd === 'crawl-summary') {
  console.log(JSON.stringify(crawlAndSummarize(), null, 2));
} else if (cmd === 'crawl-dom') {
  const domFile = process.argv[3];
  const baseUrl = process.argv[4] || 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
  if (!domFile) {
    console.error('Usage: node src/index.js crawl-dom <dom-file> [baseUrl]');
    process.exit(1);
  }
  const dom = fs.readFileSync(domFile, 'utf8');
  console.log(JSON.stringify(crawlPlanFromDom(dom, baseUrl), null, 2));
} else if (cmd === 'ingest') {
  const url = process.argv[3];
  const snapshotPath = process.argv[4];
  if (!url || !snapshotPath) {
    console.error('Usage: node src/index.js ingest <thread-url> <snapshot-file>');
    process.exit(1);
  }
  ensureDirs();
  const db = loadDb();
  const parsed = ingestSnapshot(db, snapshotPath, url);
  saveDb(db);
  console.log(JSON.stringify(parsed, null, 2));
} else {
  console.error('Unknown command');
  process.exit(1);
}
