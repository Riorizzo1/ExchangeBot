const fs = require('fs');
const { execFileSync } = require('child_process');
const base = '/Users/bobby/.openclaw/workspace/rwi_mvp';
const urls = [
  'https://forum.replica-watch.info/threads/rolex-daytona-%E2%80%9Cghost%E2%80%9D-cosmograph-126519-uk-only-vsf-youth-edition.11039190/',
  'https://forum.replica-watch.info/threads/reserved-iwc-pilots-chrono-ss-black-for-aviator.11039185/',
  'https://forum.replica-watch.info/threads/conus-clean-batgirl-gen-crystal.11039184/',
  'https://forum.replica-watch.info/threads/rolex-meteorite-daytona-116519.11039180/',
  'https://forum.replica-watch.info/threads/patek-5167a-with-legend-mods.11039179/',
  'https://forum.replica-watch.info/threads/conus-seamaster-300-heritage-vsf-1-1.11039168/',
  'https://forum.replica-watch.info/threads/blancpain-fifty-fathoms-gold.11039163/',
  'https://forum.replica-watch.info/threads/uk-wilbur-exp-a1-45-mm-titanium-and-black-ceramic-limited-100pcs-automatic.11039159/',
  'https://forum.replica-watch.info/threads/hublot-classic-fusion-cheapy.11039155/',
  'https://forum.replica-watch.info/threads/fs-rg-tag-heuer-carrera-calibre-heuer-01.11039153/',
  'https://forum.replica-watch.info/threads/zf-tudor-black-bay-58-cheap-with-extra-strap.11039151/'
];
for (const url of urls) {
  const tid = url.match(/\.(\d+)\//)?.[1];
  const snap = `${base}/data/raw/${tid}.txt`;
  if (!fs.existsSync(snap)) continue;
  try {
    console.log(execFileSync('node', [`${base}/src/index.js`, 'parse-thread', url, snap], { encoding: 'utf8' }).trim());
  } catch (e) {
    console.error('parse failed', url);
  }
}
const db=JSON.parse(fs.readFileSync(`${base}/data/rwi.json`,'utf8'));
const today=new Date().toISOString().slice(0,10);
const cleanTitle=s=>String(s||'').replace(/^\[(PENDING|FOR SALE|RESERVED)\]\s*-\s*/i,'').replace(/\s*\|\s*Replica Watch Info$/i,'').trim();
const cleanCost=s=>String(s||'').replace(/^Asking Price\?\s*/i,'').trim();
const cleanPosted=t=>t.threadTime || (()=>{const d=new Date(t.capturedAt); return `${d.getMonth()+1}/${d.getDate()} @ ${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;})();
console.log('\nTODAY');
console.log(db.threads.filter(t=>(t.capturedAt||'').slice(0,10)===today).map(t=>`${cleanTitle(t.title)} - ${cleanCost(t.askingPrice)} - ${cleanPosted(t)}`).join('\n'));
