import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sourceUrl = 'https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc';
const sourceUrlNeedle = 'forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900';
const wrappedJs = fs.readFileSync(new URL('./rwi_bookmarklet_extractor_wrapped.js', import.meta.url), 'utf8');

const run = (args, opts = {}) => execFileSync('openclaw', [
  'browser',
  '--browser-profile', 'openclaw',
  '--timeout', '180000',
  ...args,
], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
  ...opts,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseOpenedTabId(output) {
  const text = String(output || '');
  return text.match(/\btab:\s*([A-Za-z0-9_-]+)/i)?.[1]
    || text.match(/\bid:\s*([A-Za-z0-9_-]+)/i)?.[1]
    || null;
}

function isRetryableBrowserError(error) {
  const message = String(error?.stderr || error?.message || '');
  return [
    'GatewayTransportError',
    'GatewayClientRequestError',
    'Target page, context or browser has been closed',
    'page.waitForURL',
    'page.evaluate',
    'page.goto',
    'net::ERR_ABORTED',
    'Browser is not connected',
    'Navigation timeout',
    'gateway timeout',
    'chrome://new-tab-page/',
  ].some((needle) => message.includes(needle));
}

const runWithRetry = async (args, opts = {}, attempts = 4) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return run(args, opts);
    } catch (error) {
      lastError = error;
      if (!isRetryableBrowserError(error) || i === attempts - 1) throw error;
      try { run(['start'], { stdio: 'pipe' }); } catch {}
      await sleep(4000 + i * 3000);
    }
  }
  throw lastError;
};

async function browserLocation() {
  try {
    const raw = await runWithRetry(['--json', 'evaluate', '--fn', '() => ({ href: location.href, title: document.title })'], { stdio: 'pipe' }, 2);
    const parsed = JSON.parse(raw);
    return parsed.result || {};
  } catch {
    return {};
  }
}

async function ensureListingPage(attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const opened = await runWithRetry(['open', sourceUrl], { stdio: 'pipe' }, 3);
      const tabId = parseOpenedTabId(opened);
      if (tabId) {
        try { await runWithRetry(['focus', tabId], { stdio: 'pipe' }, 2); } catch {}
      }

      let lastLoc = null;
      for (let j = 0; j < 10; j += 1) {
        const loc = await browserLocation();
        lastLoc = loc;
        if (String(loc.href || '').includes(sourceUrlNeedle)) return { ...loc, tabId };
        await sleep(1000 + (j * 250));
      }

      throw new Error('browser not on listing page: ' + (lastLoc?.href || 'unknown'));
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      await sleep(5000 + i * 2000);
    }
  }
  throw lastError || new Error('failed to reach RWI listing page');
}

const listingPage = await ensureListingPage();
const listingTabId = listingPage?.tabId || null;

const listingOnlyJs = wrappedJs.replace(
  /return extractRwiListings\([\s\S]+?\);/,
  'return extractRwiListings({ pages: 12, enrichPrices: false, enrichLimit: 0 });',
);

const raw = await runWithRetry([
  '--json',
  'evaluate',
  '--fn', listingOnlyJs,
], { stdio: 'pipe' }, 4);

const out = JSON.parse(raw);
const result = out.result;
if (!result || result.error || !Array.isArray(result.rows) || !result.rows.length) {
  const loc = await browserLocation();
  throw new Error('listing extraction failed: ' + (result?.error || 'no rows') + ' | href=' + (loc.href || 'unknown'));
}

const enrichCandidates = (result.rows || [])
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => row.label !== '[SOLD]');

const preferred = enrichCandidates.filter(({ row }) => /\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(String(row.label || '')));
const remainder = enrichCandidates.filter(({ row }) => !/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(String(row.label || '')));
const targets = [...preferred, ...remainder].slice(0, 80);
const chunkSize = 8;

const enrichChunk = async (chunk) => {
  const enrichJs = [
    '() => (async () => {',
    '    var rows = ' + JSON.stringify(chunk.map(function(r) { return r.row; })) + ';',
    '    function parsePrice(text, opts) {',
    '      if (!text) return null;',
    "      var raw = String(text);",
    "      var requireCurrency = opts && opts.requireCurrency;",
    '      var patterns = requireCurrency',
    '        ? [/(?:USD\\\\s*|US\\\\$\\\\s*|\\\\$\\\\s*|€\\\\s*|EUR\\\\s*|£\\\\s*|GBP\\\\s*)([0-9][0-9,]*(?:\\\\.[0-9]{1,2})?)/i,',
    '           /([0-9][0-9,]*(?:\\\\.[0-9]{1,2})?)\\\\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)/i]',
    '        : [/(?:USD\\\\s*|US\\\\$\\\\s*|\\\\$\\\\s*|€\\\\s*|EUR\\\\s*|£\\\\s*|GBP\\\\s*)?([0-9][0-9,]*(?:\\\\.[0-9]{1,2})?)/i];',
    '      for (var i = 0; i < patterns.length; i++) {',
    "        var match = raw.match(patterns[i]);",
    '        if (!match) continue;',
    '        var value = Number(match[1].replace(/,/g, ""));',
    '        if (Number.isFinite(value) && value > 20 && value < 200000) return value;',
    '      }',
    '      return null;',
    '    }',
    "    function parseCurrency(text) {",
    "      var raw = String(text || '');",
    "      if (raw.indexOf('€') !== -1 || /EUR|euro/i.test(raw)) return 'EUR';",
    "      if (raw.indexOf('£') !== -1 || /GBP|pound/i.test(raw)) return 'GBP';",
    "      if (raw.indexOf('$') !== -1 || /USD|US\\$/i.test(raw)) return 'USD';",
    '      return null;',
    '    }',
    '    var sleep = function(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); };',
    '    async function enrichRow(row) {',
    '      try {',
    "        var html = await fetch(row.url, { credentials: 'include' }).then(function(r) { return r.text(); });",
    '        var doc = new DOMParser().parseFromString(html, "text/html");',
    '        var fields = [].slice.call(doc.querySelectorAll("dl.pairs--customField"));',
    '        var map = {};',
    '        for (var i = 0; i < fields.length; i++) {',
    '          var dt = fields[i].querySelector("dt");',
    '          var dd = fields[i].querySelector("dd");',
    '          if (dt && dd) map[dt.textContent.trim()] = dd.textContent.trim();',
    '          var textParts = (fields[i].innerText || "").split(/\\t|\\n/).map(function(s) { return s.trim(); }).filter(Boolean);',
    '          if (textParts.length >= 2 && !map[textParts[0]]) map[textParts[0]] = textParts.slice(1).join(" ");',
    '        }',
    '        function getField() {',
    '          var names = [].slice.call(arguments).map(function(n) { return String(n).toLowerCase().replace(/[^a-z0-9]+/g, ""); });',
    '          for (var key in map) {',
    '            var normalized = String(key).toLowerCase().replace(/[^a-z0-9]+/g, "");',
    '            if (names.indexOf(normalized) !== -1) return map[key];',
    '          }',
    '          return "";',
    '        }',
    '        var articles = [].slice.call(doc.querySelectorAll("article.message"));',
    '        var firstArticle = articles[0];',
    '        var bodyNode = firstArticle && firstArticle.querySelector ? firstArticle.querySelector(".bbWrapper, .message-body") : null;',
    '        var body = bodyNode && bodyNode.textContent ? bodyNode.textContent.trim() : "";',
    '        var askingField = getField("Asking Price?", "Asking Price");',
    '        var currencyField = getField("Currency Accepted?", "Currency Accepted", "Currency");',
    '        var shippingRaw = getField("Shipping Costs?", "Shipping Costs", "Shipping");',
    '        var rawPriceMatch = html.match(/<dt>\\s*Asking Price\\??\\s*<\\/dt>[\\s\\S]{0,220}?<dd[^>]*>\\s*([^<\\r\\n]+)\\s*/i) || html.match(/<dt[^>]*>\\s*Asking Price\\??\\s*<\\/dt>[\\s\\S]{0,220}?<dd[^>]*>\\s*([^<\\r\\n]+)\\s*/i);',
    '        var plainText = html.replace(/<script[\\s\\S]*?<\\/script>/gi, " ").replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();',
    '        var askingTextMatch = plainText.match(/Asking Price\\??\\s*([£$€]\\s*[0-9][0-9,]*(?:\\.[0-9]{1,2})?)/i);',
    '        var askingPrice = askingField ? parsePrice(askingField) : null;',
    '        if (askingPrice == null && askingTextMatch) {',
    '          var askingText = askingTextMatch[1] || askingTextMatch[0];',
    '          askingPrice = parsePrice(askingText, { requireCurrency: true }) || parsePrice(askingText);',
    '        }',
    '        if (askingPrice == null && rawPriceMatch) {',
    '          var rawPriceText = rawPriceMatch[1] || rawPriceMatch[0];',
    '          askingPrice = parsePrice(rawPriceText, { requireCurrency: true }) || parsePrice(rawPriceText);',
    '        }',
    '        if (askingPrice == null) {',
    '          askingPrice = parsePrice(plainText, { requireCurrency: true }) || parsePrice(plainText);',
    '        }',
    '        var currency = parseCurrency(currencyField || askingField || (askingTextMatch && (askingTextMatch[1] || askingTextMatch[0])) || (rawPriceMatch && (rawPriceMatch[1] || rawPriceMatch[0])) || plainText || body);',
    '        var priceNote = "";',
    '        if (/\\[PRICE\\s*DROP\\]|\\[PRICEDROP\\]/i.test(String(row.label || "")) && articles.length > 1) {',
    '          var originalUserNode = firstArticle && firstArticle.querySelector ? firstArticle.querySelector(".message-name .username, .username") : null;',
    '          var originalAuthor = originalUserNode && originalUserNode.textContent ? originalUserNode.textContent.trim() : (row.author || "");',
    '          var bestReplyPrice = null;',
    '          for (var j = 1; j < articles.length; j++) {',
    '            var article = articles[j];',
    '            var authorNode = article.querySelector ? article.querySelector(".message-name .username, .username") : null;',
    '            var author = authorNode && authorNode.textContent ? authorNode.textContent.trim() : "";',
    '            if (originalAuthor && author && author !== originalAuthor) continue;',
    '            var replyNode = article.querySelector ? article.querySelector(".bbWrapper, .message-body") : null;',
    '            var replyBody = replyNode && replyNode.textContent ? replyNode.textContent.trim() : "";',
    '            if (!replyBody) continue;',
    '            var replyPrice = parsePrice(replyBody, { requireCurrency: true }) || parsePrice(replyBody);',
    '            if (replyPrice == null) continue;',
    '            bestReplyPrice = replyPrice;',
    '          }',
    '          if (bestReplyPrice != null && (askingPrice == null || bestReplyPrice <= askingPrice)) {',
    '            askingPrice = bestReplyPrice;',
    '            priceNote = "Updated in OP reply";',
    '          }',
    '        }',
    '        return {',
    '          askingPrice: askingPrice != null ? ((currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$") + String(askingPrice)) : null,',
    '          priceValue: askingPrice,',
    '          priceNote: priceNote,',
    '          currency: currency,',
    '          location: getField("Location"),',
    '          condition: getField("Item Condition?", "Item Condition"),',
    '          payment: getField("Accepted Payment Methods?", "Accepted Payment Methods"),',
    '          shipping: shippingRaw || null,',
    '        };',
    '      } catch (e) {',
    '        return { enrichError: e && e.message ? e.message : String(e) };',
    '      }',
    '    }',
    '    var out = [];',
    '    for (var i = 0; i < rows.length; i++) {',
    '      var enriched = await enrichRow(rows[i]);',
    '      out.push(Object.assign({}, rows[i], enriched));',
    '      if (i < rows.length - 1) await sleep(350);',
    '    }',
    '    return out;',
    '  })()',
  ].join('\n');

  const rawChunk = await runWithRetry(['--json', 'evaluate', '--fn', enrichJs], { stdio: 'pipe' }, 4);
  const parsed = JSON.parse(rawChunk).result || [];
  if (!Array.isArray(parsed)) throw new Error('enrich chunk did not return array');
  return parsed;
};

for (var i = 0; i < targets.length; i += chunkSize) {
  var chunk = targets.slice(i, i + chunkSize);
  var enriched = await enrichChunk(chunk);
  enriched.forEach(function(row, idx) {
    var original = chunk[idx];
    if (!original) return;
    result.rows[original.index] = row;
  });
  await sleep(500);
}

if (listingTabId) {
  try {
    await runWithRetry(['close', listingTabId], { stdio: 'pipe' }, 2);
  } catch {}
}

result.first10 = (result.rows || []).slice(0, 10);
console.log(JSON.stringify(result, null, 2));
