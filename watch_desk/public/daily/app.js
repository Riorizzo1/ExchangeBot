const $ = (selector, root = document) => root.querySelector(selector);
const proxy = (url, thumbnail = false) => /^https?:/.test(url || '') ? `/proxy-image?${thumbnail ? 'thumb=1&' : ''}u=${encodeURIComponent(url)}` : url;
const active = status => ['available', 'pending', 'staff_review', 'gen_watch'].includes(status);
const STORAGE_KEY = 'watch-desk-intelligence-v1';
const baseState = { scope: 'today', view: 'market', source: 'all', status: 'active', community: 'all', brand: 'all', factory: 'all', region: 'all', price: 'all', sort: 'newest', query: '', visible: 30 };

// The detail drawer is intentionally compact; photos get their own edge-to-edge
// viewer so a phone can swipe through the original-sized gallery without first
// leaving the dashboard for the source site.
let fullscreenGallery;
function closeFullscreenGallery() {
  if (!fullscreenGallery) return;
  if (fullscreenGallery.open) fullscreenGallery.close();
  fullscreenGallery.remove();
  fullscreenGallery = null;
  document.documentElement.classList.remove('gallery-open');
}
function openFullscreenGallery(images, selected = 0, title = 'Listing photos') {
  const urls = (images || []).filter(Boolean);
  if (!urls.length) return;
  closeFullscreenGallery();
  const viewer = document.createElement('dialog');
  viewer.className = 'fullscreen-gallery';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('aria-label', title);
  const close = document.createElement('button');
  close.className = 'fullscreen-gallery-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close photo viewer');
  close.textContent = '×';
  const counter = document.createElement('div');
  counter.className = 'fullscreen-gallery-count';
  const strip = document.createElement('div');
  strip.className = 'fullscreen-gallery-strip';
  urls.forEach((url, index) => {
    const slide = document.createElement('div');
    slide.className = 'fullscreen-gallery-slide';
    const image = new Image();
    image.src = proxy(url);
    image.alt = `${title} — photo ${index + 1}`;
    image.draggable = false;
    slide.append(image);
    strip.append(slide);
  });
  const updateCounter = () => {
    const index = Math.min(urls.length - 1, Math.max(0, Math.round(strip.scrollLeft / Math.max(strip.clientWidth, 1))));
    counter.textContent = `${index + 1} / ${urls.length}`;
  };
  close.onclick = closeFullscreenGallery;
  strip.addEventListener('scroll', updateCounter, { passive: true });
  viewer.append(close, counter, strip);
  document.body.append(viewer);
  fullscreenGallery = viewer;
  document.documentElement.classList.add('gallery-open');
  viewer.showModal();
  requestAnimationFrame(() => {
    strip.scrollLeft = Math.max(0, selected) * strip.clientWidth;
    updateCounter();
  });
}

const priceNumber = value => {
  const match = String(value || '').replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? Number(match[0]) : null;
};
const priceText = value => {
  if (value == null || value === '') return 'Price n/a';
  const text = String(value).trim();
  const match = text.match(/^([$€£])?\s*([0-9]+)(?:\.0+)?$/);
  return match ? `${match[1] || '$'}${Number(match[2]).toLocaleString()}` : text;
};
const dateText = value => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};
const loadStore = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
const store = Object.assign({ shortlist: {}, hidden: {}, seen: {}, searches: [] }, loadStore());
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

let manifest;
let catalog;
const state = { ...baseState };

function items() { return state.scope === 'today' ? (manifest?.today || []) : (catalog?.items || []); }
function reset() { state.visible = 30; }
function matchesPrice(item) {
  const value = item.priceNumber ?? priceNumber(item.price);
  if (state.price === 'all') return true;
  if (state.price === 'known') return value !== null;
  if (value === null) return false;
  if (state.price === 'under-300') return value < 300;
  if (state.price === '300-600') return value >= 300 && value <= 600;
  if (state.price === '600-1000') return value > 600 && value <= 1000;
  return value > 1000;
}

function filtered() {
  const query = state.query.trim().toLowerCase();
  const result = items().filter(item => {
    if (store.hidden[item.id]) return false;
    if (state.view === 'fresh' && state.scope !== 'today') return false;
    if (state.view === 'drops' && !item.priceDrop) return false;
    if (state.view === 'shortlist' && !store.shortlist[item.id]) return false;
    if (state.source !== 'all' && item.source !== state.source) return false;
    if (state.status === 'active' && !active(item.status)) return false;
    if (state.status !== 'active' && state.status !== 'all' && item.status !== state.status) return false;
    if (state.community !== 'all' && item.subreddit !== state.community) return false;
    if (state.brand !== 'all' && item.brand !== state.brand) return false;
    if (state.factory !== 'all' && item.factory !== state.factory) return false;
    if (state.region !== 'all' && item.location !== state.region) return false;
    if (!matchesPrice(item)) return false;
    return !query || `${item.title} ${item.seller} ${item.sourceLabel} ${item.subreddit || ''} ${item.location || ''} ${item.brand || ''} ${item.factory || ''}`.toLowerCase().includes(query);
  });
  return result.sort((a, b) => {
    const av = a.priceNumber ?? priceNumber(a.price), bv = b.priceNumber ?? priceNumber(b.price);
    if (state.sort === 'price-low') return (av ?? Infinity) - (bv ?? Infinity);
    if (state.sort === 'price-high') return (bv ?? -1) - (av ?? -1);
    return (b.sort || 0) - (a.sort || 0);
  });
}

function populateSelect(id, values, allLabel, format = value => value) {
  const select = $(`#${id}`);
  const selected = state[id];
  const unique = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  select.replaceChildren(new Option(allLabel, 'all'), ...unique.map(value => new Option(format(value), value)));
  state[id] = unique.includes(selected) || selected === 'all' ? selected : 'all';
  select.value = state[id];
}

function populateTaxonomy() {
  const source = items();
  populateSelect('community', source.map(item => item.subreddit), 'All communities', value => `r/${value}`);
  populateSelect('brand', source.map(item => item.brand), 'All brands');
  populateSelect('factory', source.map(item => item.factory), 'All factories');
  populateSelect('region', source.map(item => item.location), 'All regions');
}

function renderSavedSearches() {
  const select = $('#savedSearch');
  select.replaceChildren(new Option('Saved searches', ''), ...(store.searches || []).map(search => new Option(search.name, search.id)));
  $('#shortlistCount').textContent = Object.keys(store.shortlist).length;
}

function renderScope() {
  document.querySelectorAll('.scope').forEach(button => button.classList.toggle('active', button.dataset.scope === state.scope));
  document.querySelectorAll('.view').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
  $('#todayCount').textContent = manifest?.summary?.today ?? '–';
  $('#catalogCount').textContent = manifest?.summary?.catalog ?? '–';
}

function renderCards() {
  const all = filtered();
  const shown = all.slice(0, state.visible);
  const host = $('#cards');
  const template = $('#card');
  host.replaceChildren();
  for (const item of shown) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.classList.add(`status-${String(item.status || 'unknown').replace(/[^a-z_]/g, '')}`);
    node.classList.toggle('shortlisted', Boolean(store.shortlist[item.id]));
    const image = $('img', node);
    image.src = proxy(item.thumb, true);
    image.onerror = () => { image.src = ''; };
    $('.pic span', node).textContent = String(item.status || 'unknown').replace('_', ' ');
    $('.pic i', node).hidden = !item.galleryCount;
    $('small', node).textContent = item.subreddit ? `r/${item.subreddit}` : item.sourceLabel;
    $('strong', node).textContent = item.title;
    $('b', node).textContent = priceText(item.price);
    $('em', node).textContent = `${item.galleryCount || 0} photos · ${item.seller || 'Seller unknown'}${item.location ? ` · ${item.location}` : ''}`;
    if (item.crosspostCount > 1) {
      const note = document.createElement('span');
      note.className = 'crosspost-note';
      note.textContent = `${item.crosspostCount} source posts`;
      $('.copy', node).append(note);
    }
    node.onclick = () => openDetail(item);
    host.append(node);
  }
  $('#total').textContent = all.length;
  $('#drops').textContent = (items() || []).filter(item => item.priceDrop && !store.hidden[item.id]).length;
  $('#more').hidden = all.length <= shown.length;
  const label = state.view === 'shortlist' ? 'Shortlist' : state.view === 'drops' ? 'Price drops' : state.view === 'fresh' ? 'New today' : state.scope === 'catalog' ? 'Current market' : 'Today';
  $('#loadState').textContent = all.length ? `${label} · ${shown.length} shown` : 'No matches';
  renderSavedSearches();
}

function triageButton(label, selected, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.classList.toggle('selected', selected);
  button.onclick = action;
  return button;
}

async function openDetail(item) {
  const dialog = $('#detail');
  const body = $('#detailBody');
  body.textContent = 'Loading listing…';
  dialog.showModal();
  store.seen[item.id] = Date.now(); persist();
  try {
    const detail = await fetch(`data/listings/${item.id}.json`, { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject(response.status));
    const images = detail.images || [];
    let selectedPhoto = 0;
    body.replaceChildren();
    if (images[0]) {
      const hero = new Image();
      hero.className = 'hero';
      hero.src = proxy(images[0]);
      hero.alt = `${detail.title || 'Listing'} — photo 1`;
      hero.tabIndex = 0;
      hero.setAttribute('role', 'button');
      hero.setAttribute('aria-label', 'Open full-screen photo gallery');
      const openGallery = () => openFullscreenGallery(images, selectedPhoto, detail.title || 'Listing photos');
      hero.onclick = openGallery;
      hero.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGallery(); } };
      body.append(hero);
    }
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${detail.sourceLabel} · ${detail.status}${detail.location ? ` · ${detail.location}` : ''}`; body.append(meta);
    const title = document.createElement('h2'); title.className = 'detailTitle'; title.textContent = detail.title; body.append(title);
    const price = document.createElement('h2'); price.textContent = priceText(detail.price); body.append(price);
    const seller = document.createElement('div'); seller.className = 'meta'; seller.textContent = detail.seller || 'Seller unknown'; body.append(seller);
    const posted = document.createElement('div'); posted.className = 'meta'; posted.textContent = `Original post: ${dateText(detail.postedAt)}`; body.append(posted);
    if (detail.brand || detail.factory) { const tags = document.createElement('div'); tags.className = 'meta'; tags.textContent = [detail.brand, detail.factory].filter(Boolean).join(' · '); body.append(tags); }
    const triage = document.createElement('div'); triage.className = 'triage';
    triage.append(
      triageButton(store.shortlist[item.id] ? '★ Shortlisted' : '☆ Shortlist', Boolean(store.shortlist[item.id]), () => { store.shortlist[item.id] ? delete store.shortlist[item.id] : store.shortlist[item.id] = Date.now(); persist(); dialog.close(); renderCards(); }),
      triageButton('Hide listing', false, () => { store.hidden[item.id] = Date.now(); persist(); dialog.close(); renderCards(); }),
    );
    body.append(triage);
    if (images.length) {
      const gallery = document.createElement('div'); gallery.className = 'gallery';
      images.forEach((url, index) => {
        const image = new Image();
        image.loading = 'lazy';
        image.src = proxy(url);
        image.alt = `Photo ${index + 1}`;
        image.onclick = () => {
          const hero = $('.hero', body);
          if (hero) hero.src = proxy(url);
          selectedPhoto = index;
          openFullscreenGallery(images, index, detail.title || 'Listing photos');
        };
        gallery.append(image);
      });
      body.append(gallery);
    }
    if ((detail.sources || []).length > 1) {
      const posts = document.createElement('div'); posts.className = 'source-posts';
      const heading = document.createElement('h3'); heading.textContent = 'Also posted to'; posts.append(heading);
      detail.sources.forEach(source => { const link = document.createElement('a'); link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = source.community; const date = document.createElement('span'); date.textContent = dateText(source.postedAt).split(',')[0]; link.append(date); posts.append(link); });
      body.append(posts);
    }
    const link = document.createElement('a'); link.className = 'open'; link.target = '_blank'; link.rel = 'noreferrer'; link.href = detail.url; link.textContent = 'Open primary source ↗'; body.append(link);
  } catch { body.textContent = 'Could not load listing details.'; }
}

async function setScope(scope) {
  if (scope === 'catalog' && !catalog) {
    $('#loadState').textContent = 'Loading full market…';
    catalog = await fetch('data/catalog.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('catalog unavailable'); return response.json(); });
  }
  state.scope = scope; reset(); populateTaxonomy(); renderScope(); renderCards();
}

async function setView(view) {
  if (view === 'fresh') await setScope('today');
  if (view === 'shortlist') await setScope('catalog');
  state.view = view; reset(); renderScope(); renderCards();
}

function saveSearch() {
  const name = window.prompt('Name this saved search');
  if (!name?.trim()) return;
  const { visible, view, ...filters } = state;
  store.searches = [...(store.searches || []).filter(search => search.name !== name.trim()), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), filters }];
  persist(); renderSavedSearches();
}

async function applySaved(id) {
  const search = (store.searches || []).find(entry => entry.id === id);
  if (!search) return;
  Object.assign(state, { ...baseState, ...search.filters, visible: 30 });
  if (state.scope === 'catalog') await setScope('catalog');
  else await setScope('today');
  await setView(state.view || 'market');
  $('#query').value = state.query;
  ['source', 'status', 'community', 'brand', 'factory', 'region', 'price', 'sort'].forEach(key => { $(`#${key}`).value = state[key]; });
  renderCards();
}

async function load() {
  try {
    manifest = await fetch('data/manifest.json', { cache: 'no-store' }).then(response => response.json());
    catalog = null; state.scope = 'today'; state.view = 'market';
    $('#stamp').textContent = manifest.generatedAt ? `Updated ${new Date(manifest.generatedAt).toLocaleString()}` : 'Updated';
    populateTaxonomy(); renderScope(); renderCards();
    const requestedId = new URLSearchParams(location.search).get('watch');
    if (requestedId) {
      let requested = (manifest.today || []).find(item => String(item.id) === requestedId);
      if (!requested) {
        catalog = await fetch('data/catalog.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null);
        requested = (catalog?.items || []).find(item => String(item.id) === requestedId);
      }
      if (requested) setTimeout(() => openDetail(requested), 0);
      else $('#loadState').textContent = 'Watch listing no longer available';
    }
  } catch { $('#stamp').textContent = 'Could not load Watch Desk'; }
}

document.querySelectorAll('.scope').forEach(button => button.onclick = () => setScope(button.dataset.scope).catch(() => { $('#loadState').textContent = 'Could not load full market'; }));
document.querySelectorAll('.view').forEach(button => button.onclick = () => setView(button.dataset.view).catch(() => { $('#loadState').textContent = 'Could not load this view'; }));
['source', 'status', 'community', 'brand', 'factory', 'region', 'price', 'sort'].forEach(key => $(`#${key}`).onchange = event => { state[key] = event.target.value; reset(); renderCards(); });
$('#query').oninput = event => { state.query = event.target.value; reset(); renderCards(); };
$('#more').onclick = () => { state.visible += 30; renderCards(); };
$('#refresh').onclick = load;
$('#close').onclick = () => $('#detail').close();
document.addEventListener('keydown', event => { if (event.key === 'Escape' && fullscreenGallery) closeFullscreenGallery(); });
$('#saveSearch').onclick = saveSearch;
$('#savedSearch').onchange = event => applySaved(event.target.value);
$('#clearFilters').onclick = () => { const keepScope = state.scope; Object.assign(state, { ...baseState, scope: keepScope }); $('#query').value = ''; populateTaxonomy(); renderScope(); renderCards(); };
load();
