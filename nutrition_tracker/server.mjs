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
const dailyDir = path.join(__dirname, 'daily');
const renderPath = path.join(__dirname, 'renders');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getToday() {
  const db = readJson(dataPath);
  const key = todayKey();
  return {
    date: key,
    day: db.days[key] || { entries: [], totals: { calories: 0, carbs_g: 0, fat_g: 0, protein_g: 0 } },
  };
}

function addFood(text) {
  execFileSync('python3', [path.join(__dirname, 'nutrition_tracker.py'), 'add', text], {
    cwd: __dirname,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  const after = getToday();
  const entry = after.day.entries[after.day.entries.length - 1];
  const zero = entry && Number(entry.calories) === 0 && Number(entry.carbs_g) === 0 && Number(entry.fat_g) === 0 && Number(entry.protein_g) === 0;
  return { ...after, warning: zero ? 'No nutrition match found for this item yet.' : null };
}

function getPersonalFoods() {
  const obj = readJson(personalFoodsPath);
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

function searchFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const food of getAllFoods()) {
    const hay = [food.name, ...(food.aliases || [])].join(' ').toLowerCase();
    if (!hay.includes(q)) continue;
    const score = hay.startsWith(q) ? 1000 : q.split(/\s+/).filter(tok => hay.includes(tok)).length * 10;
    scored.push({ ...food, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 12);
}

function savePersonalFood(payload) {
  const obj = readJson(personalFoodsPath);
  obj.foods = obj.foods || [];
  const item = {
    id: payload.id || String(payload.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: payload.name,
    aliases: payload.aliases || [],
    serving: payload.serving || '1 serving',
    calories: Number(payload.calories || 0),
    carbs_g: Number(payload.carbs_g || 0),
    fat_g: Number(payload.fat_g || 0),
    protein_g: Number(payload.protein_g || 0),
    source: 'personal',
    confidence: payload.confidence || 'exact'
  };
  const idx = obj.foods.findIndex(f => f.id === item.id || f.name.toLowerCase() === item.name.toLowerCase());
  if (idx >= 0) obj.foods[idx] = item;
  else obj.foods.unshift(item);
  fs.writeFileSync(personalFoodsPath, JSON.stringify(obj, null, 2));
  return item;
}

function updateEntry(index, payload) {
  const db = readJson(dataPath);
  const key = todayKey();
  const day = db.days[key];
  if (!day || !day.entries[index]) throw new Error('entry not found');
  const prev = day.entries[index];
  for (const k of ['calories', 'carbs_g', 'fat_g', 'protein_g']) {
    day.totals[k] -= Number(prev[k] || 0);
  }
  const next = {
    ...prev,
    text: payload.text ?? prev.text,
    calories: Number(payload.calories ?? prev.calories),
    carbs_g: Number(payload.carbs_g ?? prev.carbs_g),
    fat_g: Number(payload.fat_g ?? prev.fat_g),
    protein_g: Number(payload.protein_g ?? prev.protein_g),
  };
  day.entries[index] = next;
  for (const k of ['calories', 'carbs_g', 'fat_g', 'protein_g']) {
    day.totals[k] += Number(next[k] || 0);
  }
  fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
  return getToday();
}

function deleteEntry(index) {
  const db = readJson(dataPath);
  const key = todayKey();
  const day = db.days[key];
  if (!day || !day.entries[index]) throw new Error('entry not found');
  const prev = day.entries[index];
  for (const k of ['calories', 'carbs_g', 'fat_g', 'protein_g']) {
    day.totals[k] -= Number(prev[k] || 0);
  }
  day.entries.splice(index, 1);
  fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
  return getToday();
}

function renderTodayModern() {
  execFileSync('python3', [path.join(__dirname, 'render_today_modern.py')], {
    cwd: __dirname,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  return path.join(renderPath, `${todayKey()}_modern.jpg`);
}

function brandedLookup(text) {
  const tmpDir = path.join(__dirname, '..', '.firecrawl');
  fs.mkdirSync(tmpDir, { recursive: true });
  const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const out = path.join(tmpDir, `${slug || 'lookup'}.json`);
  execFileSync('firecrawl', ['search', `${text} nutrition facts`, '--limit', '5', '--scrape', '-o', out, '--json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const obj = readJson(out);
  const pages = (((obj || {}).data || {}).web) || [];
  const joined = pages.map(p => `${p.title || ''}\n${p.description || ''}\n${p.markdown || ''}`).join('\n');
  const num = (re, fallback = null) => {
    const m = joined.match(re);
    return m ? Number(m[1]) : fallback;
  };
  const calories = num(/(\d+)\s*(?:calories|kcal)/i, null);
  const protein = num(/(\d+)\s*g\s*protein/i, null);
  const carbs = num(/(\d+)\s*g\s*(?:total\s+)?carb/i, null);
  const fat = num(/(\d+)\s*g\s*(?:total\s+)?fat/i, null);
  return {
    name: text,
    calories,
    carbs_g: carbs,
    fat_g: fat,
    protein_g: protein,
    sourceUrl: pages[0]?.url || null,
    sourceTitle: pages[0]?.title || null,
    found: [calories, carbs, fat, protein].some(v => v != null)
  };
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
        return sendJson(res, 200, addFood(String(parsed.text).trim()));
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const out = renderTodayModern();
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
