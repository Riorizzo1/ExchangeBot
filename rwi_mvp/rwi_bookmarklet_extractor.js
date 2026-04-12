async function extractRwiListings({ pages = 3 } = {}) {
  function plp(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.structItem--thread:not(.structItem--sticky)');
    const out = [];
    rows.forEach((el) => {
      const le = el.querySelector('.label');
      const lbl = le ? le.textContent.trim() : null;
      if (!lbl || !/FOR SALE|PENDING|PRICEDROP|SOLD/.test(lbl)) return;
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
  }
  all.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  return {
    href: location.href,
    count: all.length,
    counts: {
      forSale: all.filter((t) => t.label === '[FOR SALE]').length,
      pending: all.filter((t) => t.label === '[PENDING]').length,
      priceDrop: all.filter((t) => t.label === '[PRICEDROP]').length,
      sold: all.filter((t) => t.label === '[SOLD]').length,
    },
    first10: all.slice(0, 10),
    rows: all
  };
}

return extractRwiListings({ pages: 3 });
