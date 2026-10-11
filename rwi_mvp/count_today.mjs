import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/today_extract.mjs.out.json','utf8'));
const bad = /(rules|scammer|warning|need to recertify|renew|member to member sales section rules|staff hold)/i;
const filtered = rows.filter(r => (r.posted.startsWith('Today') || r.posted.includes('minutes ago')) && !bad.test(r.watch));
console.log(filtered.length);
console.log(JSON.stringify(filtered, null, 2));
