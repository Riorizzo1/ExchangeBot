import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, 'data', 'nutrition.json');
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
server.listen(port, () => {
  console.log(`Nutrition app running at http://127.0.0.1:${port}`);
});
