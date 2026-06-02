() => (async () => {
async function extractRwiListings({ pages = 12, enrichPrices = true, enrichLimit = 80 } = {}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function parsePrice(text, { requireCurrency = false } = {}) {
    if (!text) return null;
    const raw = String(text);
    const patterns = requireCurrency
      ? [/(?:USD\s*|US\$\s*|\$\s*|€\s*|EUR\s*|£\s*|GBP\s*)([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
         /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)/i]
      : [/(?:USD\s*|US\$\s*|\$\s*|€\s*|EUR\s*|£\s*|GBP\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i];
    for (const re of patterns) {
      const match = raw.match(re);
      if (!match) continue;
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 20 && value < 200000) return value;
    }
    return null;
  }

  function parseCurrency(text) {
    const raw = String(text || '');
    if (/€|\bEUR\b|euro/i.test(raw)) return 'EUR';
    if (/£|\bGBP\b|pound/i.test(raw)) return 'GBP';
    if (/\$|\bUSD\b|\bUS\$/i.test(raw)) return 'USD';
    return null;
  }

  async function enrichRow(row) {
    if (!enrichPrices || !row?.url) return row;
    try {
      const html = await fetch(row.url, { credentials: 'include' }).then(r => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fields = [...doc.querySelectorAll('dl.pairs--customField')];
      const map = {};
      for (const dl of fields) {
        const dt = dl.querySelector('dt');
        const dd = dl.querySelector('dd');
        if (dt && dd) map[dt.textContent.trim()] = dd.textContent.trim();
        // RWI occasionally renders these fields with odd spacing/newlines.
        // Keep a text fallback so price extraction does not silently drop.
        const textParts = (dl.innerText || '').split(/\t|\n/).map(s => s.trim()).filter(Boolean);
        if (textParts.length >= 2 && !map[textParts[0]]) map[textParts[0]] = textParts.slice(1).join(' ');
      }
      const getField = (...names) => {
        const wanted = names.map(n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, ''));
        for (const [key, value] of Object.entries(map)) {
          const normalized = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '');
          if (wanted.includes(normalized)) return value;
        }
        return '';
      };
      const articles = [...doc.querySelectorAll('article.message')];
      const firstArticle = articles[0];
      const body = firstArticle?.querySelector('.bbWrapper, .message-body')?.textContent?.trim() || '';
      const plainText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const askingField = getField('Asking Price?', 'Asking Price');
      const currencyField = getField('Currency Accepted?', 'Currency Accepted', 'Currency');
      const shippingRaw = getField('Shipping Costs?', 'Shipping Costs', 'Shipping');
      const rawPriceMatch = html.match(/<dt>\s*Asking Price\??\s*<\/dt>[\s\S]{0,220}?<dd[^>]*>\s*([^<\r\n]+)\s*/i)
        || html.match(/<dt[^>]*>\s*Asking Price\??\s*<\/dt>[\s\S]{0,220}?<dd[^>]*>\s*([^<\r\n]+)\s*/i);
      const askingTextMatch = plainText.match(/Asking Price\??\s*([£$€]\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      let askingPrice = askingField ? parsePrice(askingField) : null;
      if (askingPrice == null && askingTextMatch) {
        const askingText = askingTextMatch[1] || askingTextMatch[0];
        askingPrice = parsePrice(askingText, { requireCurrency: true }) ?? parsePrice(askingText);
      }
      if (askingPrice == null && rawPriceMatch) {
        const rawPriceText = rawPriceMatch[1] || rawPriceMatch[0];
        askingPrice = parsePrice(rawPriceText, { requireCurrency: true }) ?? parsePrice(rawPriceText);
      }
      if (askingPrice == null) {
        askingPrice = parsePrice(plainText, { requireCurrency: true }) ?? parsePrice(plainText);
      }
      const currency = parseCurrency(currencyField || askingField || (askingTextMatch && (askingTextMatch[1] || askingTextMatch[0])) || (rawPriceMatch && (rawPriceMatch[1] || rawPriceMatch[0])) || plainText || body);
      let priceNote = '';

      // For [PRICEDROP] threads, moderators often relabel the thread after the OP
      // posts a lower price in a later reply. Prefer the most recent valid price
      // posted by the original author, especially when it is lower than the thread
      // header/custom-field price.
      if (/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(String(row.label || '')) && articles.length > 1) {
        const originalAuthor = firstArticle?.querySelector('.message-name .username, .username')?.textContent?.trim() || row.author || '';
        let bestReplyPrice = null;
        for (let i = 1; i < articles.length; i += 1) {
          const article = articles[i];
          const author = article.querySelector('.message-name .username, .username')?.textContent?.trim() || '';
          if (originalAuthor && author && author !== originalAuthor) continue;
          const replyBody = article.querySelector('.bbWrapper, .message-body')?.textContent?.trim() || '';
          if (!replyBody) continue;
          const replyPrice = parsePrice(replyBody, { requireCurrency: true }) ?? parsePrice(replyBody);
          if (replyPrice == null) continue;
          bestReplyPrice = replyPrice;
        }
        if (bestReplyPrice != null && (askingPrice == null || bestReplyPrice <= askingPrice)) {
          askingPrice = bestReplyPrice;
          priceNote = 'Updated in OP reply';
        }
      }

      return {
        ...row,
        askingPrice: askingPrice != null ? `${currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}${askingPrice}` : null,
        priceValue: askingPrice,
        priceNote,
        currency,
        location: getField('Location'),
        condition: getField('Item Condition?', 'Item Condition'),
        payment: getField('Accepted Payment Methods?', 'Accepted Payment Methods'),
        shipping: shippingRaw || null,
      };
    } catch (error) {
      return { ...row, enrichError: error?.message || String(error) };
    }
  }

  function plp(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.structItem--thread:not(.structItem--sticky)');
    const out = [];
    rows.forEach((el) => {
      const le = el.querySelector('.label');
      const lbl = le ? le.textContent.trim() : null;
      if (!lbl || !/FOR SALE|PENDING|PRICE\s*DROP|PRICEDROP|SOLD/.test(lbl)) return;
      const lk = el.querySelector('a[data-tp-primary]');
      const href = lk ? lk.href.replace('/unread', '') : null;
      const hrefLower = (href || '').toLowerCase();
      const titleText = lk ? lk.textContent.trim() : '';
      if (
        hrefLower.includes('pending-what-does-that-mean') ||
        hrefLower.includes('member-sales-section-rules') ||
        hrefLower.includes('member-to-member-sales-section-rules') ||
        hrefLower.includes('active-scammer-warning') ||
        hrefLower.includes('certified-supporter') ||
        hrefLower.includes('need-to-recertify') ||
        /what does that mean/i.test(titleText)
      ) return;
      if (!href) return;
      const au = el.querySelector('.structItem-minor .username');
      const sd = el.querySelector('.structItem-startDate time');
      const dds = el.querySelectorAll('.structItem-cell--meta dd');
      out.push({
        label: lbl,
        title: titleText,
        url: href,
        author: au ? au.textContent.trim() : '',
        startDate: sd ? sd.getAttribute('datetime') : null,
        replies: dds[0] ? dds[0].textContent.trim() : '0',
        views: dds[1] ? dds[1].textContent.trim() : '0'
      });
    });
    return out;
  }

  const origin = location.origin;
  const fm = location.href.match(/(\/forums\/[^\/\?#]+\/)/);
  if (!fm) return { error: 'not on forum listing page', href: location.href };
  const forumBase = fm[1];
  const qs = location.search;
  let all = [];
  for (let pn = 0; pn < pages; pn++) {
    const url = origin + forumBase + (pn === 0 ? '' : 'page-' + (pn + 1) + '/') + qs;
    const r = await fetch(url, { credentials: 'include' });
    const html = await r.text();
    all = all.concat(plp(html));
    if (pn < pages - 1) await sleep(250);
  }
  all.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  if (enrichPrices) {
    const enriched = [...all];
    const candidates = all
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.label !== '[SOLD]');
    const preferred = candidates.filter(({ row }) => /\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(String(row.label || '')));
    const remainder = candidates.filter(({ row }) => !/\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(String(row.label || '')));
    const targets = [...preferred, ...remainder.slice(0, enrichLimit)];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      enriched[target.index] = await enrichRow(target.row);
      if (i < targets.length - 1) await sleep(350);
    }
    all = enriched;
  }
  return {
    href: location.href,
    count: all.length,
    counts: {
      forSale: all.filter((t) => t.label === '[FOR SALE]').length,
      pending: all.filter((t) => t.label === '[PENDING]').length,
      priceDrop: all.filter((t) => /\[PRICE\s*DROP\]|\[PRICEDROP\]/i.test(t.label || '')).length,
      sold: all.filter((t) => t.label === '[SOLD]').length,
    },
    first10: all.slice(0, 10),
    rows: all
  };
}

return extractRwiListings({ pages: 12, enrichPrices: true, enrichLimit: 80 });

})()
