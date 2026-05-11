import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = '/Users/bobby/.openclaw/workspace';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const rwi = JSON.parse(fs.readFileSync(`${root}/rwi_mvp/data/rwi.json`, 'utf8'));
const outPath = `${root}/watch_desk/public/data/rwi-images-${today}.json`;
const prior = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { rows: [] };
const priorById = new Map((prior.rows || []).map(r => [String(r.threadId), r]));

const targets = (rwi.threads || [])
  .filter(t => ['FOR SALE', 'PENDING'].includes(String(t.status || '').toUpperCase()))
  .filter(t => String(t.threadTime || t.startDate || '').startsWith(today))
  .map(t => ({
    title: String(t.title || '').replace(/\| Replica Watch Info$/, '').trim(),
    url: t.threadUrl,
    status: t.status,
    price: t.askingPrice,
    threadId: String(t.threadId),
  }));

const run = (args) => execFileSync('openclaw', [
  'browser', '--browser-profile', 'openclaw', '--timeout', '180000', ...args,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

const sourceUrl = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
try { run(['start']); } catch {}
try { run(['navigate', sourceUrl]); run(['wait', '--url', sourceUrl]); } catch {}

function makeFn(batch) {
  return `async () => {
    const targets = ${JSON.stringify(batch)};
    async function timeoutFetch(url, ms) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ctrl.signal });
        const text = await res.text();
        return { ok: res.ok, text };
      } finally { clearTimeout(timer); }
    }
    async function getImages(row) {
      try {
        const got = await timeoutFetch(row.url, 5000);
        const doc = new DOMParser().parseFromString(got.text, 'text/html');
        const bodies = [...doc.querySelectorAll('article.message .bbWrapper, article.message .message-body, .message-content .bbWrapper')];
        const body = bodies[0] || doc.body;
        const imgs = [];
        const push = (src) => {
          if (!src) return;
          try { src = new URL(src, row.url).href; } catch(e) { return; }
          if (/smilies|avatars|logo|sprite|styles|data\\/assets|favicon/i.test(src)) return;
          if (/\\.(?:jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(src) || /clickpix|imgur|ibb\\.co|postimg|attach|i\\.redd\\.it/i.test(src)) imgs.push(src);
        };
        body.querySelectorAll('img').forEach(img => push(img.getAttribute('data-url') || img.getAttribute('data-src') || img.getAttribute('src')));
        body.querySelectorAll('a[href]').forEach(a => push(a.getAttribute('href')));
        return { ...row, ok: got.ok, images: [...new Set(imgs)].slice(0, 8), bodyPreview: body ? body.textContent.trim().slice(0, 240) : '' };
      } catch(e) { return { ...row, images: [], error: String(e && e.message || e) }; }
    }
    const rows = [];
    for (const row of targets) rows.push(await getImages(row));
    return { rows };
  }`;
}

const rows = [];
const batchSize = 4;
for (let i = 0; i < targets.length; i += batchSize) {
  const batch = targets.slice(i, i + batchSize);
  try {
    const raw = run(['--json', 'evaluate', '--fn', makeFn(batch)]);
    const result = JSON.parse(raw).result || { rows: [] };
    for (const row of result.rows || []) rows.push(row);
  } catch (e) {
    for (const row of batch) rows.push({ ...row, images: [], error: 'batch failed: ' + String(e.message || e).slice(0, 180) });
  }
  fs.writeFileSync(outPath, JSON.stringify({ date: today, count: rows.length, withImages: rows.filter(r => r.images?.length).length, rows }, null, 2));
}

// Preserve any older successful rows if current chunk failed for same thread.
const merged = rows.map(r => (!r.images?.length && priorById.get(String(r.threadId))?.images?.length) ? { ...r, images: priorById.get(String(r.threadId)).images, recoveredFromPrior: true } : r);
fs.writeFileSync(outPath, JSON.stringify({ date: today, count: merged.length, withImages: merged.filter(r => r.images?.length).length, rows: merged }, null, 2));
console.log(JSON.stringify({ out: outPath, count: merged.length, withImages: merged.filter(r => r.images?.length).length }, null, 2));
