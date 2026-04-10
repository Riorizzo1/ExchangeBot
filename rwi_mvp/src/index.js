import fs from 'fs';
import path from 'path';
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
    return { threads: [], listings: [] };
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDb(db) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
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
  const titleMatch = text.match(/RootWebArea\s+"([^"]+)"/);
  const title = titleMatch ? titleMatch[1].replace(/^\[SOLD\]\s+/, '') : null;
  const askingPrice = extractValue(text, 'Asking Price?') || extractValue(text, 'Asking price');
  const currency = extractValue(text, 'Currency Accepted?');
  const location = extractValue(text, 'Location:') || extractValue(text, 'Location');
  const condition = extractValue(text, 'Item Condition?');
  const payment = extractValue(text, 'Accepted Payment Methods?');
  const shipping = extractValue(text, 'Shipping Costs?');
  return {
    threadId: id,
    threadUrl: url,
    title,
    askingPrice,
    currency,
    location,
    condition,
    payment,
    shipping,
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
    db.threads.push(parsed);
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

const cmd = process.argv[2];
if (cmd === 'backfill' || !cmd) {
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
  db.threads.push(parsed);
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
} else {
  console.error('Unknown command');
  process.exit(1);
}
