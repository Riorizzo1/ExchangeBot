import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = '/Users/bobby/.openclaw/workspace';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const rwi = JSON.parse(fs.readFileSync(`${root}/rwi_mvp/data/rwi.json`, 'utf8'));
const outPath = `${root}/watch_desk/public/data/rwi-images-${today}.json`;
const prior = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { rows: [] };
const priorById = new Map((prior.rows || []).map(r => [String(r.threadId), r]));
const sourceUrl = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
const sourceUrlNeedle = 'forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900';

const targets = (rwi.threads || [])
  .filter(t => ['FOR SALE', 'PENDING', 'SOLD', 'STAFF REVIEW', 'GEN WATCH'].includes(String(t.status || '').toUpperCase()))
  .map(t => ({
    title: String(t.title || '').replace(/\| Replica Watch Info$/, '').trim(),
    url: t.threadUrl,
    status: t.status,
    price: t.askingPrice,
    threadId: String(t.threadId),
    startDate: t.startDate || '',
  }));

const run = (args) => execFileSync('openclaw', [
  'browser', '--browser-profile', 'openclaw', '--timeout', '180000', ...args,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function parseOpenedTabId(output) {
  const text = String(output || '');
  return text.match(/\btab:\s*([A-Za-z0-9_-]+)/i)?.[1]
    || text.match(/\bid:\s*([A-Za-z0-9_-]+)/i)?.[1]
    || null;
}
const isRetryableBrowserError = (error) => {
  const message = `${error?.stderr || error?.message || ''}`;
  return [
    'GatewayTransportError',
    'Target page, context or browser has been closed',
    'page.waitForURL',
    'page.goto',
    'net::ERR_ABORTED',
    'Browser is not connected',
  ].some((needle) => message.includes(needle));
};

async function runWithRetry(args, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return run(args);
    } catch (error) {
      lastError = error;
      if (!isRetryableBrowserError(error) || i === attempts - 1) throw error;
      try { run(['start']); } catch {}
      await sleep(8000 + i * 4000);
    }
  }
  throw lastError;
}

async function ensureListingPage(attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const opened = await runWithRetry(['open', sourceUrl]);
      const tabId = parseOpenedTabId(opened);
      if (tabId) {
        try { await runWithRetry(['focus', tabId]); } catch {}
      }

      let lastLoc = null;
      for (let j = 0; j < 10; j += 1) {
        const raw = run(['--json', 'evaluate', '--fn', '() => ({ href: location.href, title: document.title })']);
        const result = JSON.parse(raw)?.result || {};
        lastLoc = result;
        if (String(result.href || '').includes(sourceUrlNeedle)) {
          return { ...result, tabId };
        }
        await sleep(1000 + (j * 250));
      }

      throw new Error(`not on forum listing page (${lastLoc?.href || 'unknown'})`);
    } catch (error) {
      lastError = error;
      await sleep(5000 + i * 3000);
    }
  }
  throw lastError;
}

async function resolveClickPixViewer(url) {
  if (!url || !/^https?:\/\/(?:www\.)?clickpix\.org\/image\//i.test(url)) return url;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const match = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/property=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*image/i);
    if (match && match[1]) return match[1];
  } catch {}
  return url;
}

try { await ensureListingPage(); } catch {}

function makeFn(batch) {
  return `async () => {
    const targets = ${JSON.stringify(batch)};
    async function resolveClickPixViewer(url) {
      if (!url) return url;
      const lowerUrl = String(url).toLowerCase();
      if (lowerUrl.indexOf('clickpix.org/image/') === -1) return url;
      try {
        const res = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
        });
        const html = await res.text();
        const match = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/property=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*image/i);
        if (match && match[1]) return match[1];
      } catch (e) {}
      return url;
    }
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
        const articles = [...doc.querySelectorAll('article.message')];
        const firstArticle = articles[0] || doc.body;
        const bodyFor = (article) => {
          if (!article || !article.querySelector) return article || doc.body;
          return article.querySelector('.bbWrapper, .message-body, .message-content .bbWrapper') || article || doc.body;
        };
        const authorFor = (article) => {
          if (!article) return '';
          let author = '';
          try {
            author = article.getAttribute && article.getAttribute('data-author');
            if (!author && article.querySelector) {
              const nameNode = article.querySelector('.message-name') || article.querySelector('[itemprop="name"]');
              author = nameNode && nameNode.textContent;
            }
          } catch(e) {}
          return String(author || '').trim().toLowerCase();
        };
        const firstAuthor = authorFor(firstArticle);
        const collectImages = (scope) => {
          const imgs = [];
          const push = (src) => {
            if (!src) return;
            try { src = new URL(src, row.url).href; } catch(e) { return; }
            const lower = src.toLowerCase();
            if (['smilies', 'avatars', 'logo', 'sprite', 'styles', 'data/assets', 'favicon'].some(s => lower.includes(s))) return;
            const path = lower.split(/[?#]/)[0];
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].some(ext => path.endsWith(ext)) || ['clickpix', 'imgur', 'ibb.co', 'postimg', 'attach', 'i.redd.it'].some(s => lower.includes(s))) imgs.push(src);
          };
          scope.querySelectorAll('img').forEach(img => push(img.getAttribute('data-url') || img.getAttribute('data-src') || img.getAttribute('src')));
          scope.querySelectorAll('a[href]').forEach(a => push(a.getAttribute('href')));
          return [...new Set(imgs)];
        };

        let imageSource = 'thread-op';
        let body = bodyFor(firstArticle);
        let images = collectImages(body);

        // Some RWI sellers put photos in an immediate self-reply instead of the OP.
        // If the OP has no images, scan the next few messages, preferring replies by
        // the same author so we don't accidentally attach another user's quoted image.
        if (!images.length && articles.length > 1) {
          const followUps = articles.slice(1, 18);
          const sameAuthor = firstAuthor ? followUps.filter(a => authorFor(a) === firstAuthor) : [];
          const candidates = sameAuthor.length ? sameAuthor : followUps;
          for (const article of candidates) {
            const candidateBody = bodyFor(article);
            const candidateImages = collectImages(candidateBody);
            if (candidateImages.length) {
              images = candidateImages;
              body = candidateBody;
              imageSource = authorFor(article) === firstAuthor ? 'seller-follow-up' : 'early-follow-up';
              break;
            }
          }
        }

        const resolvedImages = [];
        for (const src of images.slice(0, 20)) {
          const resolved = await resolveClickPixViewer(src);
          if (resolved) resolvedImages.push(resolved);
        }
        return { ...row, ok: got.ok, images: [...new Set(resolvedImages)], imageSource, bodyPreview: body ? body.textContent.trim().slice(0, 240) : '' };
      } catch(e) { return { ...row, images: [], error: String(e && e.message || e) }; }
    }
    const rows = [];
    for (const row of targets) rows.push(await getImages(row));
    return { rows };
  }`;
}

const resultsById = new Map();
const freshTargets = [];
const isTodayNY = (value) => {
  if (!value) return false;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today;
};

for (const target of targets) {
  const cached = priorById.get(String(target.threadId));
  if (cached?.images?.length) {
    resultsById.set(String(target.threadId), {
      ...cached,
      ...target,
      images: cached.images,
      recoveredFromPrior: true,
    });
  } else if (isTodayNY(target.startDate)) {
    freshTargets.push(target);
  } else {
    resultsById.set(String(target.threadId), { ...target, images: [], skipped: 'not today' });
  }
}

const batchSize = 2;
for (let i = 0; i < freshTargets.length; i += batchSize) {
  const batch = freshTargets.slice(i, i + batchSize);
  try {
    const raw = await runWithRetry(['--json', 'evaluate', '--fn', makeFn(batch)]);
    const result = JSON.parse(raw).result || { rows: [] };
    for (const row of result.rows || []) {
      resultsById.set(String(row.threadId), row);
    }
  } catch (e) {
    for (const row of batch) {
      resultsById.set(String(row.threadId), { ...row, images: [], error: 'batch failed: ' + String(e.message || e).slice(0, 180) });
    }
  }

  const rowsSoFar = targets.map((target) => resultsById.get(String(target.threadId)) || { ...target, images: [] });
  fs.writeFileSync(outPath, JSON.stringify({ date: today, count: rowsSoFar.length, withImages: rowsSoFar.filter(r => r.images?.length).length, rows: rowsSoFar }, null, 2));
}

const merged = targets.map((target) => resultsById.get(String(target.threadId)) || { ...target, images: [] });
fs.writeFileSync(outPath, JSON.stringify({ date: today, count: merged.length, withImages: merged.filter(r => r.images?.length).length, rows: merged }, null, 2));
console.log(JSON.stringify({ out: outPath, count: merged.length, withImages: merged.filter(r => r.images?.length).length }, null, 2));
