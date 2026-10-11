import fs from 'node:fs';
import path from 'node:path';

const baseDir = '/Users/bobby/.openclaw/workspace/rwi_mvp';
const dataDir = path.join(baseDir, 'data');
const deltaPath = path.join(baseDir, 'delta_compare.mjs.out.json');
const statePath = path.join(dataDir, 'daily_dashboard.json');
const htmlPath = path.join(baseDir, 'daily_dashboard.html');

const timeZone = 'America/New_York';
const hourWindowStart = 7;
const hourWindowEnd = 23;

const now = new Date();

const formatParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]),
);

const dayKey = (date) => {
  const parts = formatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const prettyTime = (date) => new Intl.DateTimeFormat('en-US', {
  timeZone,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}).format(date);

const prettyTimeShort = (value) => {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return prettyTime(new Date(parsed));
};

const htmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const slugify = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const currentDay = dayKey(now);
const currentHour = Number(new Intl.DateTimeFormat('en-US', {
  timeZone,
  hour: '2-digit',
  hour12: false,
}).format(now));

if (!fs.existsSync(deltaPath)) {
  throw new Error(`Missing delta payload: ${deltaPath}`);
}

const delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
const deltaRows = Array.isArray(delta.rows) ? delta.rows : [];

let state = {
  day: currentDay,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  window: { startHour: hourWindowStart, endHour: hourWindowEnd },
  items: [],
};

if (fs.existsSync(statePath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (existing?.day === currentDay && Array.isArray(existing.items)) {
      state = existing;
    }
  } catch {
    // If the state is bad, start fresh for today.
  }
}

if (state.day !== currentDay) {
  state = {
    day: currentDay,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    window: { startHour: hourWindowStart, endHour: hourWindowEnd },
    items: [],
  };
}

const byId = new Map();
for (const item of state.items) {
  if (item?.threadId) byId.set(String(item.threadId), item);
}

for (const row of deltaRows) {
  const threadId = String(row.threadId || '').trim();
  if (!threadId) continue;

  const nextItem = {
    threadId,
    status: row.status || 'FOR SALE',
    watch: row.watch || '',
    cost: row.cost || '',
    priceValue: Number.isFinite(row.priceValue) ? row.priceValue : null,
    isBudgetFind: Boolean(row.isBudgetFind),
    posted: row.posted || '',
    threadUrl: row.threadUrl || '',
    author: row.author || '',
    firstSeenAt: byId.get(threadId)?.firstSeenAt || now.toISOString(),
    lastSeenAt: now.toISOString(),
  };

  byId.set(threadId, { ...byId.get(threadId), ...nextItem });
}

state.items = [...byId.values()].sort((a, b) => {
  const aTime = Date.parse(a.lastSeenAt || a.firstSeenAt || a.posted || '') || 0;
  const bTime = Date.parse(b.lastSeenAt || b.firstSeenAt || b.posted || '') || 0;
  return bTime - aTime;
});
state.updatedAt = now.toISOString();

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

const counts = state.items.reduce((acc, item) => {
  const status = String(item.status || 'UNKNOWN').toUpperCase();
  acc.total += 1;
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, { total: 0 });

const groups = ['PENDING', 'FOR SALE', 'SOLD', 'OTHER'].map((status) => ({
  status,
  items: state.items.filter((item) => {
    const normalized = String(item.status || 'OTHER').toUpperCase();
    if (status === 'OTHER') return !['PENDING', 'FOR SALE', 'SOLD'].includes(normalized);
    return normalized === status;
  }),
})).filter((group) => group.items.length > 0);

const windowLabel = `${hourWindowStart}:00–${hourWindowEnd}:00 ET`;
const liveLabel = currentHour >= hourWindowStart && currentHour <= hourWindowEnd ? 'Live window open' : 'Outside the daily window';

const itemCard = (item) => `
  <article class="card ${slugify(item.status || '')}">
    <div class="row">
      <h3>${htmlEscape(item.watch || '(untitled)')}</h3>
      <span class="badge">${htmlEscape(item.status || 'UNKNOWN')}</span>
    </div>
    <div class="meta">
      ${item.cost ? `<span>${htmlEscape(item.cost)}</span>` : ''}
      ${item.posted ? `<span>Posted ${htmlEscape(prettyTimeShort(item.posted))}</span>` : ''}
      ${item.author ? `<span>by ${htmlEscape(item.author)}</span>` : ''}
      ${item.firstSeenAt ? `<span>Seen ${htmlEscape(prettyTimeShort(item.firstSeenAt))}</span>` : ''}
    </div>
    ${item.threadUrl ? `<a href="${htmlEscape(item.threadUrl)}" target="_blank" rel="noreferrer">Open thread</a>` : ''}
  </article>
`;

const groupBlocks = groups.map((group) => `
  <section class="group">
    <h2>${htmlEscape(group.status)} <span>(${group.items.length})</span></h2>
    <div class="cards">
      ${group.items.map(itemCard).join('\n')}
    </div>
  </section>
`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="600" />
  <title>RWI Daily Delta Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #0b1220; color: #e6edf7; }
    main { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .hero { background: linear-gradient(180deg, #121c32, #0f1729); border: 1px solid #22304d; border-radius: 20px; padding: 20px; margin-bottom: 20px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .subtle { color: #94a3b8; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
    .stat { background: #111a2d; border: 1px solid #22304d; border-radius: 16px; padding: 14px; }
    .stat strong { display: block; font-size: 24px; margin-top: 6px; }
    .group { margin-top: 24px; }
    .group h2 { margin: 0 0 12px; font-size: 20px; }
    .group h2 span { color: #94a3b8; font-weight: 500; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .card { background: #0f1729; border: 1px solid #22304d; border-radius: 18px; padding: 16px; box-shadow: 0 12px 30px rgba(0,0,0,.18); }
    .card.pending { border-color: #5568ff; }
    .card.for-sale { border-color: #10b981; }
    .card.sold { border-color: #64748b; opacity: .85; }
    .row { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .row h3 { margin: 0; font-size: 16px; line-height: 1.35; }
    .badge { font-size: 11px; letter-spacing: .08em; padding: 5px 9px; border-radius: 999px; background: #22304d; color: #cbd5e1; white-space: nowrap; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 12px 0 14px; color: #94a3b8; font-size: 13px; }
    a { color: #8ab4ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { padding: 18px; border: 1px dashed #22304d; border-radius: 16px; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>RWI Daily Delta Dashboard</h1>
      <div class="subtle">Resets on the first 7am ET run each day. Grows hourly through the 11pm ET run.</div>
      <div class="stats">
        <div class="stat"><span>Day</span><strong>${htmlEscape(state.day)}</strong></div>
        <div class="stat"><span>Window</span><strong>${htmlEscape(windowLabel)}</strong></div>
        <div class="stat"><span>Status</span><strong>${htmlEscape(liveLabel)}</strong></div>
        <div class="stat"><span>Total items</span><strong>${counts.total}</strong></div>
        <div class="stat"><span>PENDING</span><strong>${counts.PENDING || 0}</strong></div>
        <div class="stat"><span>FOR SALE</span><strong>${counts['FOR SALE'] || 0}</strong></div>
      </div>
      <div class="subtle" style="margin-top: 12px;">Updated ${htmlEscape(prettyTime(now))}</div>
    </section>
    ${state.items.length === 0 ? '<div class="empty">No new items yet today.</div>' : groupBlocks}
  </main>
</body>
</html>`;

fs.writeFileSync(htmlPath, html);

console.log(JSON.stringify({
  ok: true,
  day: state.day,
  total: counts.total,
  pending: counts.PENDING || 0,
  forSale: counts['FOR SALE'] || 0,
  updatedAt: state.updatedAt,
  htmlPath,
  statePath,
}, null, 2));
