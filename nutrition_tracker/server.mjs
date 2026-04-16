import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data', 'nutrition.json');
const personalFoodsPath = path.join(__dirname, 'data', 'foods_personal.json');
const cacheFoodsPath = path.join(__dirname, 'data', 'foods_cache.json');
const dailyDir = path.join(__dirname, 'daily');
const renderPath = path.join(__dirname, 'renders');
const TARGETS = { calories: 2030, carbs_g: 200, fat_g: 70, protein_g: 150 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureFoodsFile(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ foods: [] }, null, 2));
  }
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildTargetSummary(totals = {}) {
  const keys = ['calories', 'carbs_g', 'fat_g', 'protein_g'];
  const out = {};
  for (const key of keys) {
    const target = Number(TARGETS[key] || 0);
    const current = Number(totals[key] || 0);
    const remaining = target - current;
    out[key] = {
      target,
      current,
      remaining,
      over: remaining < 0,
      overBy: remaining < 0 ? Math.abs(remaining) : 0,
      pct: target > 0 ? current / target : 0,
    };
  }
  return out;
}

function rebuildDayTotals(day = {}) {
  const totals = { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 };
  for (const entry of day.entries || []) {
    for (const key of Object.keys(totals)) {
      totals[key] += Number(entry?.[key] || 0);
    }
  }
  day.totals = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round((v + Number.EPSILON) * 100) / 100]));
  return day;
}

function normalizeDb(db) {
  db.days = db.days || {};
  for (const key of Object.keys(db.days)) {
    const day = db.days[key] || {};
    day.entries = Array.isArray(day.entries) ? day.entries : [];
    rebuildDayTotals(day);
    db.days[key] = day;
  }
  return db;
}

function writeDb(db) {
  normalizeDb(db);
  fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
}

function getToday() {
  const db = normalizeDb(readJson(dataPath));
  const key = todayKey();
  const day = db.days[key] || { entries: [], totals: { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 } };
  return {
    date: key,
    day,
    targets: TARGETS,
    targetSummary: buildTargetSummary(day.totals || {}),
    updatedAt: fs.statSync(dataPath).mtimeMs,
  };
}

function addFood(text, options = {}) {
  const before = getToday();
  const beforeCount = before.day.entries.length;
  const bestMatch = searchFoods(text)[0] || null;
  const servings = Number(options.servings || 1);

  if (bestMatch && Number.isFinite(servings) && servings > 0) {
    const db = readJson(dataPath);
    const key = todayKey();
    db.days[key] = db.days[key] || { entries: [], totals: { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 } };
    const day = db.days[key];
    const round = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
    const entry = {
      text: servings === 1 ? bestMatch.name : `${servings} × ${bestMatch.name}`,
      calories: round(bestMatch.calories * servings),
      carbs_g: round(bestMatch.carbs_g * servings),
      fat_g: round(bestMatch.fat_g * servings),
      protein_g: round(bestMatch.protein_g * servings),
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      source: bestMatch.source || 'app',
      serving: bestMatch.serving,
      servings,
    };
    day.entries.push(entry);
    for (const k of ['calories', 'carbs_g', 'fat_g', 'protein_g']) {
      day.totals[k] = round(Number(day.totals[k] || 0) + Number(entry[k] || 0));
    }
    writeDb(db);
  } else {
    execFileSync('python3', [path.join(__dirname, 'nutrition_tracker.py'), 'add', text, '--source', 'app'], {
      cwd: __dirname,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    });
  }

  const after = getToday();
  const entry = after.day.entries[after.day.entries.length - 1];
  const zero = entry && Number(entry.calories) === 0 && Number(entry.carbs_g) === 0 && Number(entry.fat_g) === 0 && Number(entry.protein_g) === 0;
  const matchedFromSavedFoods = bestMatch && after.day.entries.length === beforeCount + 1 && !zero;

  return {
    ...after,
    warning: zero ? 'No nutrition match found for this item yet.' : null,
    addContext: matchedFromSavedFoods ? {
      matched: true,
      name: bestMatch.name,
      source: bestMatch.source,
      serving: bestMatch.serving,
      servings,
    } : null
  };
}

function getPersonalFoods() {
  ensureFoodsFile(personalFoodsPath);
  const obj = readJson(personalFoodsPath);
  return obj.foods || [];
}

function getCacheFoods() {
  ensureFoodsFile(cacheFoodsPath);
  const obj = readJson(cacheFoodsPath);
  return obj.foods || [];
}

function getAllFoods() {
  const files = ['foods_personal.json', 'foods_cache.json', 'foods_seed.json']
    .map(name => path.join(__dirname, 'data', name))
    .filter(file => fs.existsSync(file));
  return files.flatMap(file => {
    try {
      const obj = readJson(file);
      return obj.foods || [];
    } catch {
      return [];
    }
  });
}

function scoreFoodMatch(food, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  const names = [food.name, ...(food.aliases || [])].map(v => String(v).toLowerCase());
  let best = 0;
  for (const name of names) {
    if (!name) continue;
    if (name === q) best = Math.max(best, 5000);
    else if (name.startsWith(q)) best = Math.max(best, 2000 + q.length);
    else if (q.startsWith(name)) best = Math.max(best, 1800 + name.length);
    else if (name.includes(q)) best = Math.max(best, 1200 + q.length);
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      const tokenHits = tokens.filter(tok => name.includes(tok)).length;
      if (tokenHits) best = Math.max(best, tokenHits * 100);
    }
  }
  return best;
}

function searchFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const food of getAllFoods()) {
    const score = scoreFoodMatch(food, q);
    if (!score) continue;
    scored.push({ ...food, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 12);
}

function normalizeFoodPayload(payload, source = 'personal') {
  return {
    id: payload.id || String(payload.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: payload.name,
    aliases: payload.aliases || [],
    serving: payload.serving || '1 serving',
    servingAmount: Number(payload.servingAmount || 1),
    servingUnit: payload.servingUnit || payload.serving || 'serving',
    calories: Number(payload.calories || 0),
    carbs_g: Number(payload.carbs_g || 0),
    fat_g: Number(payload.fat_g || 0),
    protein_g: Number(payload.protein_g || 0),
    source,
    confidence: payload.confidence || 'exact',
    sourceUrl: payload.sourceUrl || null,
    sourceTitle: payload.sourceTitle || null,
    cachedAt: payload.cachedAt || null,
  };
}

function upsertFoodFile(file, payload, source = 'personal') {
  ensureFoodsFile(file);
  const obj = readJson(file);
  obj.foods = obj.foods || [];
  const item = normalizeFoodPayload(payload, source);
  const idx = obj.foods.findIndex(f =>
    f.id === item.id ||
    f.name.toLowerCase() === item.name.toLowerCase() ||
    (item.aliases || []).some(alias => alias && [f.name, ...(f.aliases || [])].map(v => String(v).toLowerCase()).includes(String(alias).toLowerCase()))
  );
  if (idx >= 0) obj.foods[idx] = { ...obj.foods[idx], ...item };
  else obj.foods.unshift(item);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return item;
}

function savePersonalFood(payload) {
  return upsertFoodFile(personalFoodsPath, payload, 'personal');
}

function saveCachedFood(payload) {
  return upsertFoodFile(cacheFoodsPath, {
    ...payload,
    cachedAt: new Date().toISOString(),
  }, 'cache');
}

function findCachedFood(text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const food of getCacheFoods()) {
    const names = [food.name, ...(food.aliases || [])].map(v => String(v).toLowerCase());
    for (const name of names) {
      if (!name) continue;
      let score = 0;
      if (name === q) score = 5000;
      else if (q === name) score = 5000;
      else if (q.includes(name) || name.includes(q)) score = 1000 + Math.min(q.length, name.length);
      if (score > bestScore) {
        best = food;
        bestScore = score;
      }
    }
  }
  return bestScore >= 1000 ? best : null;
}

function updateEntry(index, payload) {
  const db = readJson(dataPath);
  const key = todayKey();
  const day = db.days[key];
  if (!day || !day.entries[index]) throw new Error('entry not found');
  const prev = day.entries[index];
  const next = {
    ...prev,
    text: payload.text ?? prev.text,
    calories: Number(payload.calories ?? prev.calories),
    carbs_g: Number(payload.carbs_g ?? prev.carbs_g),
    fat_g: Number(payload.fat_g ?? prev.fat_g),
    protein_g: Number(payload.protein_g ?? prev.protein_g),
    source: payload.source ?? prev.source ?? 'app',
  };
  day.entries[index] = next;
  writeDb(db);
  return getToday();
}

function deleteEntry(index) {
  const db = readJson(dataPath);
  const key = todayKey();
  const day = db.days[key];
  if (!day || !day.entries[index]) throw new Error('entry not found');
  day.entries.splice(index, 1);
  writeDb(db);
  return getToday();
}

function addChatEntry(payload) {
  const db = readJson(dataPath);
  const key = payload.date || todayKey();
  db.days[key] = db.days[key] || { entries: [], totals: { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 } };
  const entry = {
    timestamp: payload.timestamp || new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    text: String(payload.text || '').trim(),
    calories: Number(payload.calories || 0),
    carbs_g: Number(payload.carbs_g || 0),
    fat_g: Number(payload.fat_g || 0),
    protein_g: Number(payload.protein_g || 0),
    source: payload.source || 'chat',
  };
  if (!entry.text) throw new Error('text required');
  db.days[key].entries.push(entry);
  writeDb(db);
  return { date: key, entry, ...getToday() };
}

function renderMacroImage() {
  execFileSync('python3', [path.join(__dirname, 'render_macro_image.py')], {
    cwd: __dirname,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  return path.join(renderPath, `${todayKey()}_macro.jpg`);
}

const FIRECRAWL_BIN = process.env.FIRECRAWL_BIN || '/opt/homebrew/bin/firecrawl';
const FIRECRAWL_ENV = {
  ...process.env,
  PATH: ['/opt/homebrew/bin', '/opt/homebrew/sbin', process.env.PATH || ''].filter(Boolean).join(':'),
};

function brandedLookup(text) {
  const cached = findCachedFood(text);
  if (cached) {
    return {
      name: cached.name,
      calories: cached.calories,
      carbs_g: cached.carbs_g,
      fat_g: cached.fat_g,
      protein_g: cached.protein_g,
      serving: cached.serving,
      sourceUrl: cached.sourceUrl || null,
      sourceTitle: cached.sourceTitle || null,
      found: true,
      cached: true,
    };
  }

  const tmpDir = path.join(__dirname, '..', '.firecrawl');
  fs.mkdirSync(tmpDir, { recursive: true });
  const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const searchOut = path.join(tmpDir, `${slug || 'lookup'}.json`);
  execFileSync(FIRECRAWL_BIN, ['search', `${text} nutrition facts`, '--limit', '5', '--scrape', '-o', searchOut, '--json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: FIRECRAWL_ENV,
  });
  const obj = readJson(searchOut);
  const pages = (((obj || {}).data || {}).web) || [];
  const bestUrl = pages[0]?.url || null;
  let joined = pages.map(p => `${p.title || ''}\n${p.description || ''}\n${p.markdown || ''}`).join('\n');

  if (bestUrl) {
    const scrapeOut = path.join(tmpDir, `${slug || 'lookup'}-page.md`);
    try {
      execFileSync(FIRECRAWL_BIN, ['scrape', bestUrl, '-f', 'markdown', '--wait-for', '2000', '-o', scrapeOut], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        env: FIRECRAWL_ENV,
      });
      joined += `\n${fs.readFileSync(scrapeOut, 'utf8')}`;
    } catch {}
  }

  const num = (...patterns) => {
    for (const re of patterns) {
      const m = joined.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const calories = num(
    /\*\*Calories:\*\*\s*\|\s*(\d+(?:\.\d+)?)/i,
    /Calories\s*[:|]\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:calories|kcal)/i,
  );
  const fat = num(
    /Total Fat\s*\|\s*(\d+(?:\.\d+)?)/i,
    /Total Fat\s*(\d+(?:\.\d+)?)G/i,
    /fat\D{0,12}(\d+(?:\.\d+)?)\s*g/i,
  );
  const carbs = num(
    /Total Carbohydrates\s*\|\s*(\d+(?:\.\d+)?)/i,
    /Total Carbohydrates\s*(\d+(?:\.\d+)?)G/i,
    /carbohydrates?\D{0,12}(\d+(?:\.\d+)?)\s*g/i,
    /carbs?\D{0,12}(\d+(?:\.\d+)?)\s*g/i,
  );
  const protein = num(
    /Protein\s*\|\s*(\d+(?:\.\d+)?)/i,
    /Protein\s*(\d+(?:\.\d+)?)G/i,
    /protein\D{0,12}(\d+(?:\.\d+)?)\s*g/i,
  );

  const result = {
    name: text,
    calories,
    carbs_g: carbs,
    fat_g: fat,
    protein_g: protein,
    serving: '1 serving',
    aliases: [text],
    sourceUrl: bestUrl,
    sourceTitle: pages[0]?.title || null,
    found: [calories, carbs, fat, protein].some(v => v != null),
    cached: false,
  };

  if (result.found) {
    saveCachedFood(result);
  }

  return result;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, file, type = 'text/html; charset=utf-8') {
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    return serveStatic(res, path.join(__dirname, 'web', 'index.html'));
  }
  if (req.method === 'GET' && url.pathname === '/app.css') {
    return serveStatic(res, path.join(__dirname, 'web', 'app.css'), 'text/css; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return serveStatic(res, path.join(__dirname, 'web', 'app.js'), 'application/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/today') {
    return sendJson(res, 200, getToday());
  }
  if (req.method === 'GET' && url.pathname === '/api/foods/personal') {
    return sendJson(res, 200, { foods: getPersonalFoods() });
  }
  if (req.method === 'GET' && url.pathname === '/api/foods/all') {
    return sendJson(res, 200, { foods: getAllFoods() });
  }
  if (req.method === 'GET' && url.pathname === '/api/foods/search') {
    return sendJson(res, 200, { foods: searchFoods(url.searchParams.get('q') || '') });
  }
  if (req.method === 'POST' && url.pathname === '/api/add') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.text || !String(parsed.text).trim()) return sendJson(res, 400, { error: 'text required' });
        const multiplier = Number(parsed.multiplier || 1);
        const servings = Number(parsed.servings || multiplier || 1);
        const quantityText = multiplier === 1 ? String(parsed.text).trim() : `${multiplier} ${String(parsed.text).trim()}`;
        return sendJson(res, 200, addFood(quantityText, { servings }));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const out = renderMacroImage();
      return sendJson(res, 200, { ok: true, path: out, url: `/render/${path.basename(out)}` });
    } catch (err) {
      return sendJson(res, 500, { error: String(err.message || err) });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/foods/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.name) return sendJson(res, 400, { error: 'name required' });
        return sendJson(res, 200, { ok: true, food: savePersonalFood(parsed) });
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/foods/lookup') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.text) return sendJson(res, 400, { error: 'text required' });
        return sendJson(res, 200, brandedLookup(String(parsed.text)));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/entry/update') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        return sendJson(res, 200, updateEntry(Number(parsed.index), parsed));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/entry/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        return sendJson(res, 200, addChatEntry(parsed));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/entry/delete') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        return sendJson(res, 200, deleteEntry(Number(parsed.index)));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/render/')) {
    const file = path.join(renderPath, path.basename(url.pathname));
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
    return serveStatic(res, file, 'image/jpeg');
  }
  if (req.method === 'GET' && url.pathname.startsWith('/daily/')) {
    const file = path.join(dailyDir, path.basename(url.pathname));
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
    return serveStatic(res, file, 'text/plain; charset=utf-8');
  }

  sendJson(res, 404, { error: 'not found' });
});

const port = process.env.PORT || 4312;
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`Nutrition app running at http://${host}:${port}`);
});
