#!/usr/bin/env bash
set -euo pipefail

# Create a supplementary Robinhood Lists watchlist from the raw Yahoo discovery feed.
# This captures primary-lane and not-enriched tickers from the discovery section
# that aren't already on the main dated list.
#
# Runs AFTER the main update_robinhood_watchlist.sh; can share its browser session.
# Scope: read Robinhood pages and write only to Lists/watchlists.

ROOT="/Users/bobby/.openclaw/workspace/stock_signal_pipeline"
LIST_DATE="${LIST_DATE:-$(TZ=America/New_York date +%F)}"
SUPP_LIST_NAME="${LIST_DATE} supplementary"
LIMIT="${LIMIT:-30}"
TICKERS="${TICKERS:-$(python3 "$ROOT/scripts/extract_robinhood_watchlist_tickers.py" --supplementary --limit "$LIMIT")}"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/robinhood-supplementary-$LIST_DATE.log"
LIST_ID_FILE="$LOG_DIR/robinhood-supplementary-$LIST_DATE.id"
LIST_URL_FILE="$LOG_DIR/robinhood-supplementary-$LIST_DATE.url"

if [[ -z "${TICKERS// }" ]]; then
  echo "No supplementary tickers extracted; skipping." | tee "$LOG_FILE"
  exit 0
fi

exec > >(tee "$LOG_FILE") 2>&1

echo "[$(date)] Starting Robinhood supplementary watchlist update"
echo "List: $SUPP_LIST_NAME"
echo "Tickers: $TICKERS"

cleanup() {
  openclaw browser stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

openclaw browser stop >/dev/null 2>&1 || true
openclaw browser open 'https://robinhood.com/?classic=1' --label rh-nightly-watchlist >/dev/null
sleep 6
openclaw browser focus rh-nightly-watchlist >/dev/null || true
openclaw browser navigate 'https://robinhood.com/?classic=1' >/dev/null || true
sleep 6

CREATE_JS=$(mktemp)
cat > "$CREATE_JS" <<JS
async () => {
 const listName = '$SUPP_LIST_NAME';
 function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
 const pageText = document.body.innerText || '';
 if (/Log in|Sign up|Two-factor|Verification code|Authenticator|captcha/i.test(pageText) && !/Buying power|Lists|Account/.test(pageText)) {
   return {ok:false, blocked:true, step:'login_or_verification', url:location.href, text:pageText.slice(0,1200)};
 }
 const existing = Array.from(document.querySelectorAll('a')).find(a => (a.innerText||'').trim() === listName && /\/lists\/custom\//.test(a.href));
 if(existing) return {ok:true, existed:true, listName, href:existing.href, id:existing.href.split('/').pop()};
 const plus = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'').includes('Create new list'));
 if(!plus) return {ok:false, step:'find_plus', text:document.body.innerText.slice(-1500)};
 plus.click(); await sleep(800);
 const createWatchlist = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').includes('Create watchlist'));
 if(!createWatchlist) return {ok:false, step:'find_create_watchlist', text:document.body.innerText.slice(-1500)};
 createWatchlist.click(); await sleep(800);
 const input = Array.from(document.querySelectorAll('input')).find(i => i.placeholder === 'List Name' || i.type === 'text');
 if(!input) return {ok:false, step:'find_input', text:document.body.innerText.slice(-1500)};
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
 setter.call(input,listName); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
 await sleep(300);
 const createBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === 'Create List');
 if(!createBtn) return {ok:false, step:'find_create_btn', text:document.body.innerText.slice(-1500)};
 createBtn.click(); await sleep(2500);
 const made = Array.from(document.querySelectorAll('a')).find(a => (a.innerText||'').trim() === listName && /\/lists\/custom\//.test(a.href));
 return {ok:!!made, existed:false, listName, href:made&&made.href, id:made&&made.href.split('/').pop(), text:document.body.innerText.slice(-1000)};
}
JS
CREATE_RESULT=$(openclaw browser evaluate --fn "$(cat "$CREATE_JS")")
echo "Create result: $CREATE_RESULT"
LIST_URL=$(CREATE_RESULT="$CREATE_RESULT" python3 - <<'PY'
import json, os, sys
j=json.loads(os.environ['CREATE_RESULT'])
if not j.get('ok'):
    print('Create/reuse list failed:', j, file=sys.stderr)
    raise SystemExit(1)
print(j.get('href') or '')
PY
)
LIST_ID="${LIST_URL##*/}"
echo "$LIST_ID" > "$LIST_ID_FILE"
echo "$LIST_URL" > "$LIST_URL_FILE"

ADD_JS=$(mktemp)
cat > "$ADD_JS" <<JS
async () => {
 const listName = '$SUPP_LIST_NAME';
 const ticker = (location.pathname.split('/').pop() || '').toUpperCase();
 function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
 const pageText = document.body.innerText || '';
 if (/Log in|Two-factor|Verification code|Authenticator|captcha/i.test(pageText) && !/Add to Lists|Buy /.test(pageText)) {
   return {ticker, ok:false, blocked:true, step:'login_or_verification', url:location.href, text:pageText.slice(0,1000)};
 }
 const addBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === 'Add to Lists');
 if(!addBtn) return {ticker, ok:false, step:'find_add', url:location.href, tail:document.body.innerText.slice(-900)};
 addBtn.click(); await sleep(900);
 const listBtn = Array.from(document.querySelectorAll('button')).find(b => {
   const t=(b.innerText||'').trim(); return t === listName || t.startsWith(listName+'\\n');
 });
 if(!listBtn) return {ticker, ok:false, step:'find_list', tail:document.body.innerText.slice(-1200)};
 const rowBefore = listBtn.innerText.trim();
 const rowRect = listBtn.getBoundingClientRect();
 const targetCheckbox = Array.from(document.querySelectorAll('[role="checkbox"]')).find(cb => {
   const r = cb.getBoundingClientRect();
   const cy = r.y + r.height / 2;
   return cy >= rowRect.y && cy <= rowRect.y + rowRect.height;
 });
 const alreadyChecked = targetCheckbox && targetCheckbox.getAttribute('aria-checked') === 'true';
 if (alreadyChecked) {
   return {ticker, ok:true, rowBefore, alreadyChecked:true, added:false, stillModal:true, tail:document.body.innerText.slice(-350)};
 }
 listBtn.click(); await sleep(500);
 const saveBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === 'Save Changes');
 if(!saveBtn) return {ticker, ok:false, step:'find_save', tail:document.body.innerText.slice(-1200)};
 const disabled = saveBtn.disabled;
 if(!disabled) saveBtn.click();
 await sleep(1600);
 const body=document.body.innerText || '';
 return {ticker, ok:true, rowBefore, alreadyChecked:false, saveDisabled:disabled, added:body.includes('Added ' + ticker + ' to ' + listName), stillModal:body.includes('Add ' + ticker + ' to Your Lists'), tail:body.slice(-350)};
}
JS

ADDED_OR_PRESENT_TICKERS=""
FAILED_TICKERS=""

for T in $TICKERS; do
  echo "=== $T ==="
  RH_PATH="stocks/$T"
  if [[ "$T" =~ ^([A-Z]+)-USD$ ]]; then
    RH_PATH="crypto/${BASH_REMATCH[1]}"
  fi
  openclaw browser navigate "https://robinhood.com/$RH_PATH" >/dev/null || true
  sleep 4
  ADD_RESULT=$(openclaw browser evaluate --fn "$(cat "$ADD_JS")")
  echo "$ADD_RESULT"
  ADD_STATUS=$(ADD_RESULT="$ADD_RESULT" python3 - <<'PY_STATUS'
import json, os
j=json.loads(os.environ['ADD_RESULT'])
if j.get('blocked'):
    print('blocked')
elif j.get('ok'):
    print('ok')
else:
    print('failed')
PY_STATUS
)
  if [[ "$ADD_STATUS" == "blocked" ]]; then
    echo "Robinhood blocked by login/verification; stopping before further writes."
    exit 1
  elif [[ "$ADD_STATUS" == "ok" ]]; then
    ADDED_OR_PRESENT_TICKERS="$ADDED_OR_PRESENT_TICKERS $T"
  else
    echo "Ticker add skipped/failed but continuing: $T"
    FAILED_TICKERS="$FAILED_TICKERS $T"
  fi
  sleep 1
done

openclaw browser navigate "$LIST_URL" >/dev/null
sleep 3
VERIFY_JS=$(mktemp)
cat > "$VERIFY_JS" <<JS
async () => {
 const listName = '$SUPP_LIST_NAME';
 const expected = '$ADDED_OR_PRESENT_TICKERS'.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/-USD$/, ''));
 const failed = '$FAILED_TICKERS'.trim().split(/\s+/).filter(Boolean);
 const original = '$TICKERS'.trim().split(/\s+/).filter(Boolean);
 const seen = new Set();
 for (let i = 0; i < 10; i++) {
   (document.body.innerText || '').split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(s => seen.add(s));
   window.scrollBy(0, 700);
   await new Promise(r => setTimeout(r, 500));
 }
 const text = document.body.innerText || '';
 const found = expected.filter(t => seen.has(t));
 const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
 let visibleCount = null;
 for (let i = 0; i < lines.length - 1; i++) {
   if (lines[i] === listName) {
     const m = lines[i + 1].match(/^(\d+) items$/);
     if (m) { visibleCount = Number(m[1]); break; }
   }
 }
 return {ok: found.length === expected.length, listName, originalCount: original.length, expectedCount: expected.length, failed, visibleCount, found, missing: expected.filter(t => !found.includes(t)), url: location.href, title: document.title, text: text.slice(0,3500)};
}
JS
VERIFY_RESULT=$(openclaw browser evaluate --fn "$(cat "$VERIFY_JS")")
echo "Verify result: $VERIFY_RESULT"
VERIFY_RESULT="$VERIFY_RESULT" python3 - <<'PY_VERIFY'
import json, os, sys
j=json.loads(os.environ['VERIFY_RESULT'])
if not j.get('ok'):
    print('Verification failed:', j, file=sys.stderr)
    raise SystemExit(1)
if j.get('failed'):
    print('Completed with skipped/unsupported tickers:', ', '.join(j.get('failed', [])))
PY_VERIFY

echo "[$(date)] Robinhood supplementary watchlist complete: $SUPP_LIST_NAME ($LIMIT requested; skipped:$FAILED_TICKERS) -> $LIST_URL"