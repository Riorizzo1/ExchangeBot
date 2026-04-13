async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

let currentEntries = [];

async function refreshAll() {
  const today = await getJson('/api/today');
  currentEntries = today.day.entries || [];
  renderDay(today);
  const foods = await getJson('/api/foods/personal');
  renderFoods(foods.foods || []);
}

function metric(label, value) {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderDay(payload) {
  const day = payload.day;
  const totals = day.totals || {};
  document.getElementById('totals').innerHTML = [
    metric('Calories', Math.round(totals.calories || 0)),
    metric('Protein', `${Math.round(totals.protein_g || 0)}g`),
    metric('Carbs', `${Math.round(totals.carbs_g || 0)}g`),
    metric('Fat', `${Math.round(totals.fat_g || 0)}g`),
  ].join('');

  const entries = day.entries || [];
  document.getElementById('entries').innerHTML = entries.slice().reverse().map((e, reverseIndex, arr) => {
    const index = arr.length - 1 - reverseIndex;
    return `
      <div class="entry">
        <div class="time">${e.timestamp}</div>
        <div class="text">${e.text}</div>
        <div class="macros">${Math.round(e.calories)} kcal, C ${e.carbs_g}g, F ${e.fat_g}g, P ${e.protein_g}g</div>
        <div class="actions">
          <button class="edit-btn" data-index="${index}">Edit</button>
          <button class="save-btn" data-index="${index}">Save as food</button>
          <button class="delete-btn" data-index="${index}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  bindEntryActions();
}

function bindEntryActions() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.index);
      const e = currentEntries[index];
      if (!e) return;
      const newText = prompt('Edit text:', e.text);
      if (newText == null || newText === '') return;
      const cals = Number(prompt('Calories:', e.calories));
      const carbs = Number(prompt('Carbs:', e.carbs_g));
      const fat = Number(prompt('Fat:', e.fat_g));
      const protein = Number(prompt('Protein:', e.protein_g));
      await postJson('/api/entry/update', { index, text: newText, calories: cals, carbs_g: carbs, fat_g: fat, protein_g: protein });
      await refreshAll();
    });
  });

  document.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.index);
      const e = currentEntries[index];
      if (!e) return;
      const name = prompt('Save food as:', e.text);
      if (!name) return;
      const serving = prompt('Serving label:', '1 serving') || '1 serving';
      await postJson('/api/foods/save', { name, aliases: [e.text], serving, calories: e.calories, carbs_g: e.carbs_g, fat_g: e.fat_g, protein_g: e.protein_g, confidence: 'exact' });
      await refreshAll();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.index);
      if (!confirm('Delete this entry?')) return;
      await postJson('/api/entry/delete', { index });
      await refreshAll();
    });
  });
}

function renderFoods(foods) {
  document.getElementById('foods').innerHTML = foods.map((f) => `
    <div class="entry">
      <div class="text">${f.name}</div>
      <div class="macros">${Math.round(f.calories)} kcal, C ${f.carbs_g}g, F ${f.fat_g}g, P ${f.protein_g}g, ${f.serving}</div>
    </div>
  `).join('');
}

function renderSuggestions(foods) {
  const box = document.getElementById('suggestions');
  if (!foods.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = foods.map((f) => `
    <div class="suggestion" data-name="${String(f.name).replaceAll('"', '&quot;')}">
      <div class="title">${f.name}</div>
      <div class="meta">${Math.round(f.calories)} kcal, C ${f.carbs_g}g, F ${f.fat_g}g, P ${f.protein_g}g, ${f.serving}</div>
    </div>
  `).join('');
  box.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('foodInput').value = el.dataset.name;
      box.innerHTML = '';
    });
  });
}

async function searchFoods() {
  const q = document.getElementById('foodInput').value.trim();
  if (!q || q.length < 2) return renderSuggestions([]);
  const data = await getJson(`/api/foods/search?q=${encodeURIComponent(q)}`);
  renderSuggestions(data.foods || []);
}

async function addFood() {
  const input = document.getElementById('foodInput');
  const text = input.value.trim();
  if (!text) return;
  const data = await postJson('/api/add', { text });
  renderDay(data);
  input.value = '';
  renderSuggestions([]);
  if (data.warning) alert(data.warning);
  await refreshAll();
}

async function renderCard() {
  const state = document.getElementById('renderState');
  state.textContent = 'Rendering...';
  const data = await postJson('/api/render', {});
  if (!data.url) {
    state.textContent = data.error || 'Render failed';
    return;
  }
  const img = document.getElementById('renderImg');
  img.src = `${data.url}?t=${Date.now()}`;
  img.style.display = 'block';
  state.textContent = 'Rendered';
}

document.getElementById('addBtn').addEventListener('click', addFood);
document.getElementById('foodInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addFood();
});
document.getElementById('foodInput').addEventListener('input', () => {
  searchFoods();
});
document.getElementById('renderBtn').addEventListener('click', renderCard);

refreshAll();
