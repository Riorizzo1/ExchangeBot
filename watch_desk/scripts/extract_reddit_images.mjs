import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const root = '/Users/bobby/.openclaw/workspace';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const latest = JSON.parse(fs.readFileSync(`${root}/watch_desk/public/data/latest.json`, 'utf8'));
const outPath = `${root}/watch_desk/public/data/reddit-images-${today}.json`;

const byUrl = new Map();
for (const item of latest.items || []) {
  if (item.sourceGroup !== 'reddit' || !String(item.postedAt || '').startsWith(today) || !item.url) continue;
  const row = byUrl.get(item.url) || { url: item.url, title: item.title, source: item.source, count: 0 };
  row.count += 1;
  byUrl.set(item.url, row);
}
const targets = Array.from(byUrl.values()).sort((a,b) => b.count - a.count).slice(0, 200);

const run = (args) => execFileSync('openclaw', ['browser', '--browser-profile', 'openclaw', '--timeout', '180000', ...args], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 });
try { run(['start']); } catch {}
try { run(['navigate', 'https://www.reddit.com/']); } catch {}

function jsonUrl(url) {
  return String(url).replace(/\/$/, '') + '.json';
}

function fn(batch) {
  return `async () => {
    var targets = ${JSON.stringify(batch)};
    var rows = [];
    for (var i = 0; i < targets.length; i++) {
      var row = targets[i];
      try {
        var base = String(row.url || '');
        if (base.endsWith('/')) base = base.slice(0, -1);
        var res = await fetch(base + '.json', { credentials: 'include', cache: 'no-store' });
        var text = await res.text();
        var html = '';
        if (!text || text === '[]' || text.length < 20) {
          try {
            var htmlRes = await fetch(base, { credentials: 'include', cache: 'no-store' });
            html = await htmlRes.text();
          } catch (e) {}
        }
        rows.push({ url: row.url, title: row.title, source: row.source, count: row.count, ok: res.ok, status: res.status, text: text, html: html });
      } catch (e) {
        rows.push({ url: row.url, title: row.title, source: row.source, count: row.count, ok: false, error: String(e && e.message || e) });
      }
    }
    return { rows: rows };
  }`;
}

function parseHtmlImages(text, baseUrl) {
  const imgs = [];
  const html = String(text || '');
  const pushHtml = (src) => {
    if (!src) return;
    src = String(src).replace(/&amp;/g, '&');
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('/')) {
      try { src = new URL(src, baseUrl).href; } catch {}
    }
    const lower = src.toLowerCase();
    if (['avatar','emoji','icon','sprite','styles','logo','award','profile'].some(s => lower.includes(s))) return;
    if (['preview.redd.it','i.redd.it','external-preview.redd.it','redditmedia.com','imgur.com'].some(s => lower.includes(s)) || ['.jpg','.jpeg','.png','.webp'].some(ext => lower.split(/[?#]/)[0].endsWith(ext))) imgs.push(src);
  };
  for (const m of html.matchAll(/(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/gi)) pushHtml(m[1]);
  for (const m of html.matchAll(/(?:href|src|data-src|data-url)=["']([^"']+)["']/gi)) pushHtml(m[1]);
  return Array.from(new Set(imgs));
}

function push(imgs, src) {
  if (!src) return;
  src = String(src).replace(/&amp;/g, '&');
  const lower = src.toLowerCase();
  if (['avatar','emoji','icon','sprite','styles','logo','award','profile'].some(s => lower.includes(s))) return;
  if (['preview.redd.it','i.redd.it','external-preview.redd.it','redditmedia.com','imgur.com'].some(s => lower.includes(s)) || ['.jpg','.jpeg','.png','.webp'].some(ext => lower.split(/[?#]/)[0].endsWith(ext))) imgs.push(src);
}

function parseImages(text) {
  const imgs = [];
  let arr;
  try { arr = JSON.parse(text); } catch { return imgs; }
  const post = arr && arr[0] && arr[0].data && arr[0].data.children && arr[0].data.children[0] && arr[0].data.children[0].data;
  function visit(p) {
    if (!p) return;
    const meta = p.media_metadata || {};
    const galleryItems = (p.gallery_data && p.gallery_data.items) || [];
    const ids = galleryItems.map(x => x && x.media_id).filter(Boolean);
    const mediaIds = ids.length ? ids : Object.keys(meta);
    for (const mid of mediaIds) {
      const item = meta[mid] || {};
      const s = item.s || {};
      push(imgs, s.u || s.gif || s.mp4);
      if (!s.u && item.p && item.p.length) {
        const best = item.p.slice().sort((a,b) => ((b.x||0)*(b.y||0))-((a.x||0)*(a.y||0)))[0];
        push(imgs, best && best.u);
      }
    }
    push(imgs, p.url);
    push(imgs, p.thumbnail);
    try { push(imgs, p.preview.images[0].source.url); } catch {}
    for (const xp of p.crosspost_parent_list || []) visit(xp);
  }
  visit(post);
  return Array.from(new Set(imgs));
}

const fetched = [];
const batchSize = 5;
for (let i = 0; i < targets.length; i += batchSize) {
  const batch = targets.slice(i, i + batchSize);
  try {
    const raw = run(['--json', 'evaluate', '--fn', fn(batch)]);
    const result = JSON.parse(raw).result || { rows: [] };
    fetched.push(...(result.rows || []));
  } catch (e) {
    for (const row of batch) fetched.push({ ...row, ok: false, error: String(e.message || e) });
  }
}
const rows = fetched.map(r => {
  const jsonImages = parseImages(r.text || '');
  const htmlImages = r.html ? parseHtmlImages(r.html, r.url) : [];
  return { url: r.url, title: r.title, source: r.source, count: r.count, ok: r.ok, status: r.status, images: Array.from(new Set([...jsonImages, ...htmlImages])), error: r.error };
});
fs.writeFileSync(outPath, JSON.stringify({ date: today, count: rows.length, withImages: rows.filter(r => r.images.length).length, rows }, null, 2));
console.log(JSON.stringify({ out: outPath, targets: targets.length, count: rows.length, withImages: rows.filter(r => r.images.length).length, maxImages: Math.max(0, ...rows.map(r => r.images.length)) }, null, 2));
