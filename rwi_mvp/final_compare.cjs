const fs=require('fs');
const db=JSON.parse(fs.readFileSync('/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json','utf8'));
const today=new Date().toISOString().slice(0,10);
const rows=db.threads.filter(t=>(t.capturedAt||'').slice(0,10)===today).map(t=>({u:t.threadUrl.replace(/\/$/,'').replace(/%E2%80%9C/g,'“').replace(/%E2%80%9D/g,'”'), title:t.title, cost:t.askingPrice, time:t.threadTime}));
const want=[
'https://forum.replica-watch.info/threads/oris-aquis-green-dial-on-bracelet-43mm.11039204',
'https://forum.replica-watch.info/threads/reserved-sale-for-w47chl0v3r-39mm-ap.11039202',
'https://forum.replica-watch.info/threads/zf-tudor-chrono-flamingo-hirsch-rallye-strap.11039198',
'https://forum.replica-watch.info/threads/rolex-daytona-%E2%80%9Cghost%E2%80%9D-cosmograph-126519-uk-only-vsf-youth-edition.11039190',
'https://forum.replica-watch.info/threads/conus-zf-black-dial-skydweller.11039187',
'https://forum.replica-watch.info/threads/reserved-iwc-pilots-chrono-ss-black-for-aviator.11039185',
'https://forum.replica-watch.info/threads/conus-clean-batgirl-gen-crystal.11039184',
'https://forum.replica-watch.info/threads/rolex-meteorite-daytona-116519.11039180',
'https://forum.replica-watch.info/threads/patek-5167a-with-legend-mods.11039179',
'https://forum.replica-watch.info/threads/conus-seamaster-300-heritage-vsf-1-1.11039168',
'https://forum.replica-watch.info/threads/blancpain-fifty-fathoms-gold.11039163',
'https://forum.replica-watch.info/threads/uk-wilbur-exp-a1-45-mm-titanium-and-black-ceramic-limited-100pcs-automatic.11039159',
'https://forum.replica-watch.info/threads/hublot-classic-fusion-cheapy.11039155',
'https://forum.replica-watch.info/threads/fs-rg-tag-heuer-carrera-calibre-heuer-01.11039153',
'https://forum.replica-watch.info/threads/zf-tudor-black-bay-58-cheap-with-extra-strap.11039151'
];
let missing=0;
for(const u of want){ if(!rows.find(r=>r.u===u)) { console.log('MISSING '+u); missing++; } }
console.log('COUNT', rows.length, 'MISSING', missing);
for (const r of rows) console.log(`${r.title} | ${r.cost} | ${r.time}`);
