import fs from 'fs';

const payloadPath = '/Users/bobby/.openclaw/workspace/rwi_mvp/delta_compare.mjs.out.json';
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const rows = Array.isArray(payload) ? payload : (payload.rows || []);
const meta = Array.isArray(payload) ? {} : (payload.meta || {});

const filtered = rows.filter((r) => r.status === 'FOR SALE' || r.status === 'PENDING');
const maxAllowedRows = Number.isFinite(meta.maxAllowedRows) ? meta.maxAllowedRows : 15;
if (filtered.length > maxAllowedRows) {
  console.error(`Refusing to render suspiciously large RWI delta: ${filtered.length} (max=${maxAllowedRows})`);
  process.exit(2);
}
const sections = ['FOR SALE', 'PENDING']
  .map((status) => ({ status, rows: filtered.filter((r) => r.status === status) }))
  .filter((section) => section.rows.length > 0);

if (sections.length === 0) {
  console.log('No new watches since the last hour parse.');
  process.exit(0);
}

const count = filtered.length;
const lines = [`New watches since the last hour parse: ${count}`];

for (const section of sections) {
  lines.push('', section.status, '');
  for (const row of section.rows) {
    const prefix = row.isBudgetFind ? '• 💸 ' : '• ';
    const price = row.cost ? ` ${row.cost}` : '';
    lines.push(`${prefix}${row.watch}${price}`.trimEnd());
    if (row.threadUrl) lines.push(row.threadUrl);
  }
}

console.log(lines.join('\n'));
