async function loadToday() {
  const res = await fetch('/api/today');
  const data = await res.json();
  renderDay(data);
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

  document.getElementById('entries').innerHTML = (day.entries || []).slice().reverse().map((e) => `
    <div class="entry">
      <div class="time">${e.timestamp}</div>
      <div class="text">${e.text}</div>
      <div class="macros">${Math.round(e.calories)} kcal, C ${e.carbs_g}g, F ${e.fat_g}g, P ${e.protein_g}g</div>
    </div>
  `).join('');
}

async function addFood() {
  const input = document.getElementById('foodInput');
  const text = input.value.trim();
  if (!text) return;
  const res = await fetch('/api/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  renderDay(data);
  input.value = '';
}

async function renderCard() {
  const state = document.getElementById('renderState');
  state.textContent = 'Rendering...';
  const res = await fetch('/api/render', { method: 'POST' });
  const data = await res.json();
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
document.getElementById('renderBtn').addEventListener('click', renderCard);

loadToday();
