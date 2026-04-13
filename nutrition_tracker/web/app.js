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
let allFoods = [];
let suggestionFoods = [];
let selectedSuggestionIndex = -1;
let selectedLibraryFood = null;
let editingIndex = null;
let pendingFoodDraft = null;
let lastUpdatedAt = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setCollapsed(card, collapsed) {
  if (!card) return;
  card.classList.toggle('collapsed', collapsed);
  const toggle = card.querySelector('.collapse-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const icon = toggle.querySelector('.collapse-icon');
    if (icon) icon.textContent = collapsed ? '+' : '−';
  }
}

function ensureLookupSectionOpen() {
  setCollapsed(document.getElementById('lookupHelpCard'), false);
}

function openSavedFoodsModal() {
  const modal = document.getElementById('savedFoodsModal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeSavedFoodsModal() {
  const modal = document.getElementById('savedFoodsModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function refreshAll() {
  const today = await getJson('/api/today');
  currentEntries = today.day.entries || [];
  lastUpdatedAt = today.updatedAt || null;
  renderDay(today);
  const foods = await getJson('/api/foods/all');
  allFoods = foods.foods || [];
  renderFoods(allFoods);
}

async function pollForUpdates() {
  try {
    const today = await getJson('/api/today');
    if (lastUpdatedAt != null && today.updatedAt && today.updatedAt !== lastUpdatedAt) {
      currentEntries = today.day.entries || [];
      lastUpdatedAt = today.updatedAt;
      renderDay(today);
    }
  } catch {}
}

function metric(label, value, tone = 'neutral') {
  return `<div class="metric metric-${tone}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderRecentQuickAdds(entries) {
  const box = document.getElementById('recentQuickAdds');
  if (!box) return;
  const recent = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const text = (entries[i]?.text || '').trim();
    if (!text) continue;
    if (recent.some(item => item.toLowerCase() === text.toLowerCase())) continue;
    recent.push(text);
    if (recent.length === 3) break;
  }
  box.innerHTML = recent.map((text) => `
    <button class="ghost-btn quick-add-btn" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>
  `).join('');
  box.style.display = recent.length ? 'grid' : 'none';
  box.querySelectorAll('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => addFood(btn.dataset.text || ''));
  });
}

function renderDay(payload) {
  const day = payload.day;
  const totals = day.totals || {};
  document.getElementById('totals').innerHTML = [
    metric('Calories', Math.round(totals.calories || 0), 'calories'),
    metric('Protein', `${Math.round(totals.protein_g || 0)}g`, 'protein'),
    metric('Carbs', `${Math.round(totals.carbs_g || 0)}g`, 'carbs'),
    metric('Fat', `${Math.round(totals.fat_g || 0)}g`, 'fat'),
  ].join('');

  const entries = day.entries || [];
  renderRecentQuickAdds(entries);
  document.getElementById('entries').innerHTML = entries.slice().reverse().map((e, reverseIndex, arr) => {
    const index = arr.length - 1 - reverseIndex;
    return `
      <div class="entry compact-entry">
        <div class="entry-topline">
          <div>
            <div class="text">${escapeHtml(e.text)}</div>
            <div class="time">${escapeHtml(e.timestamp)}</div>
          </div>
          <div class="entry-calories">${Math.round(e.calories)} kcal</div>
        </div>
        <div class="macros">C ${e.carbs_g}g • F ${e.fat_g}g • P ${e.protein_g}g${e.source ? ` • via ${escapeHtml(e.source)}` : ''}</div>
        <div class="actions compact-actions">
          <button class="edit-btn ghost-btn" data-index="${index}">Edit</button>
          <button class="save-btn ghost-btn" data-index="${index}">Save food</button>
          <button class="delete-btn ghost-btn danger-btn" data-index="${index}">Delete</button>
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
      editingIndex = index;
      document.getElementById('editorCard').style.display = 'block';
      document.getElementById('editText').value = e.text;
      document.getElementById('editCalories').value = e.calories;
      document.getElementById('editCarbs').value = e.carbs_g;
      document.getElementById('editFat').value = e.fat_g;
      document.getElementById('editProtein').value = e.protein_g;
      document.getElementById('editorCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.index);
      const e = currentEntries[index];
      if (!e) return;
      openFoodEditor({
        name: e.text,
        serving: '1 serving',
        aliases: [e.text],
        calories: e.calories,
        carbs_g: e.carbs_g,
        fat_g: e.fat_g,
        protein_g: e.protein_g,
        confidence: 'exact'
      });
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
  const q = document.getElementById('foodLibrarySearch')?.value?.trim().toLowerCase() || '';
  const filtered = !q ? foods : foods.filter((f) => {
    const hay = [f.name, ...(f.aliases || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
  document.getElementById('foods').innerHTML = filtered.map((f) => `
    <div class="entry compact-entry selectable-food">
      <div class="entry-topline">
        <div class="text">${escapeHtml(f.name)}</div>
        <div class="entry-calories">${Math.round(f.calories)} kcal</div>
      </div>
      <div class="macros">C ${f.carbs_g}g • F ${f.fat_g}g • P ${f.protein_g}g • ${escapeHtml(f.serving)}${f.source ? ` • via ${escapeHtml(f.source)}` : ''}</div>
    </div>
  `).join('');
}

function applySuggestion(food) {
  document.getElementById('foodInput').value = food.name;
  suggestionFoods = [];
  selectedSuggestionIndex = -1;
  document.getElementById('suggestions').innerHTML = '';
  document.getElementById('addResult').textContent = `Ready to add ${food.name}.`;
}

function renderSuggestions(foods) {
  suggestionFoods = foods;
  const box = document.getElementById('suggestions');
  if (!foods.length) {
    box.innerHTML = '';
    selectedSuggestionIndex = -1;
    return;
  }
  box.innerHTML = foods.map((f, idx) => `
    <div class="suggestion compact-entry ${idx === selectedSuggestionIndex ? 'active' : ''}" data-index="${idx}" data-name="${escapeHtml(f.name)}">
      <div class="entry-topline">
        <div class="title">${escapeHtml(f.name)}</div>
        <div class="entry-calories">${Math.round(f.calories)} kcal</div>
      </div>
      <div class="meta">C ${f.carbs_g}g • F ${f.fat_g}g • P ${f.protein_g}g • ${escapeHtml(f.serving)}${f.source ? ` • via ${escapeHtml(f.source)}` : ''}</div>
    </div>
  `).join('');
  box.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
      applySuggestion(foods[Number(el.dataset.index)]);
    });
  });
}

async function searchFoods() {
  const q = document.getElementById('foodInput').value.trim();
  if (!q || q.length < 2) return renderSuggestions([]);
  const data = await getJson(`/api/foods/search?q=${encodeURIComponent(q)}`);
  const foods = data.foods || [];
  if (selectedSuggestionIndex < 0 && foods.length) selectedSuggestionIndex = 0;
  if (selectedSuggestionIndex >= foods.length) selectedSuggestionIndex = foods.length - 1;
  renderSuggestions(foods);
}

async function addFood(prefilledText = null, multiplier = 1) {
  const input = document.getElementById('foodInput');
  const text = (prefilledText ?? input.value).trim();
  if (!text) return;
  const addBtn = document.getElementById('addBtn');
  const resultBox = document.getElementById('addResult');
  addBtn.disabled = true;
  addBtn.textContent = 'Adding...';
  resultBox.textContent = '';
  try {
    const data = await postJson('/api/add', { text, multiplier });
    renderDay(data);
    input.value = '';
    renderSuggestions([]);
    if (data.warning) {
      resultBox.textContent = data.warning;
    } else if (data.addContext?.matched) {
      resultBox.textContent = `Added using ${data.addContext.name} from ${data.addContext.source}.`;
    } else {
      resultBox.textContent = multiplier !== 1 ? `Added ${multiplier}x ${text}.` : 'Added.';
    }
    await refreshAll();
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = 'Add';
  }
}

async function renderCard() {
  const state = document.getElementById('renderState');
  setCollapsed(document.getElementById('macroCard'), false);
  state.textContent = 'Rendering macro image...';
  const data = await postJson('/api/render', {});
  if (!data.url) {
    state.textContent = data.error || 'Render failed';
    return;
  }
  const img = document.getElementById('renderImg');
  img.src = `${data.url}?t=${Date.now()}`;
  img.style.display = 'block';
  state.textContent = 'Macro image rendered';
}

function openFoodEditor(draft) {
  pendingFoodDraft = draft;
  ensureLookupSectionOpen();
  document.getElementById('foodEditorCard').style.display = 'block';
  document.getElementById('foodName').value = draft.name || '';
  document.getElementById('foodServing').value = draft.serving || '1 serving';
  document.getElementById('foodAliases').value = (draft.aliases || []).join(', ');
  document.getElementById('foodCalories').value = draft.calories ?? 0;
  document.getElementById('foodCarbs').value = draft.carbs_g ?? 0;
  document.getElementById('foodFat').value = draft.fat_g ?? 0;
  document.getElementById('foodProtein').value = draft.protein_g ?? 0;
  document.getElementById('foodEditorCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeFoodEditor() {
  pendingFoodDraft = null;
  document.getElementById('foodEditorCard').style.display = 'none';
}

async function lookupFood() {
  const input = document.getElementById('foodInput');
  const text = input.value.trim();
  if (!text) return;
  const box = document.getElementById('lookupResult');
  box.textContent = 'Looking up product nutrition...';
  ensureLookupSectionOpen();
  const data = await postJson('/api/foods/lookup', { text });
  if (!data.found) {
    box.textContent = 'No reliable branded nutrition match found yet.';
    return;
  }
  const sourceBits = [
    data.cached ? 'cache hit' : 'fresh lookup',
    data.sourceUrl ? `<a href="${escapeHtml(data.sourceUrl)}" target="_blank">source</a>` : ''
  ].filter(Boolean).join(' • ');
  box.innerHTML = `Found: ${data.calories ?? '?'} kcal, C ${data.carbs_g ?? '?'}g, F ${data.fat_g ?? '?'}g, P ${data.protein_g ?? '?'}g` +
    (sourceBits ? ` <span class="lookup-meta">(${sourceBits})</span>` : '') +
    ` <button id="saveLookupBtn" class="ghost-btn inline-btn">Review & save</button>`;
  const saveBtn = document.getElementById('saveLookupBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      openFoodEditor({
        name: text,
        aliases: [text],
        serving: data.serving || '1 serving',
        calories: data.calories || 0,
        carbs_g: data.carbs_g || 0,
        fat_g: data.fat_g || 0,
        protein_g: data.protein_g || 0,
        confidence: 'strong'
      });
    });
  }
}

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  if (editingIndex == null) return;
  await postJson('/api/entry/update', {
    index: editingIndex,
    text: document.getElementById('editText').value,
    calories: Number(document.getElementById('editCalories').value),
    carbs_g: Number(document.getElementById('editCarbs').value),
    fat_g: Number(document.getElementById('editFat').value),
    protein_g: Number(document.getElementById('editProtein').value),
  });
  editingIndex = null;
  document.getElementById('editorCard').style.display = 'none';
  await refreshAll();
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  editingIndex = null;
  document.getElementById('editorCard').style.display = 'none';
});

document.getElementById('saveFoodBtn').addEventListener('click', async () => {
  if (!pendingFoodDraft) return;
  const aliases = document.getElementById('foodAliases').value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  await postJson('/api/foods/save', {
    name: document.getElementById('foodName').value.trim(),
    serving: document.getElementById('foodServing').value.trim() || '1 serving',
    aliases,
    calories: Number(document.getElementById('foodCalories').value),
    carbs_g: Number(document.getElementById('foodCarbs').value),
    fat_g: Number(document.getElementById('foodFat').value),
    protein_g: Number(document.getElementById('foodProtein').value),
    confidence: pendingFoodDraft.confidence || 'exact'
  });
  document.getElementById('lookupResult').textContent = 'Saved to personal foods.';
  closeFoodEditor();
  await refreshAll();
});

document.getElementById('cancelFoodBtn').addEventListener('click', () => {
  closeFoodEditor();
});

document.getElementById('lookupBtn').addEventListener('click', lookupFood);
document.getElementById('addBtn').addEventListener('click', () => addFood());
document.getElementById('foodInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && suggestionFoods.length) {
    e.preventDefault();
    selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestionFoods.length - 1);
    renderSuggestions(suggestionFoods);
    return;
  }
  if (e.key === 'ArrowUp' && suggestionFoods.length) {
    e.preventDefault();
    selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
    renderSuggestions(suggestionFoods);
    return;
  }
  if (e.key === 'Enter') {
    if (suggestionFoods.length && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      applySuggestion(suggestionFoods[selectedSuggestionIndex]);
      return;
    }
    addFood();
  }
});
document.getElementById('foodInput').addEventListener('input', () => {
  searchFoods();
});
document.getElementById('foodLibrarySearch').addEventListener('input', () => {
  renderFoods(allFoods);
});

document.getElementById('foods').addEventListener('click', (e) => {
  const card = e.target.closest('.entry');
  if (!card) return;
  const name = card.querySelector('.text')?.textContent?.trim();
  if (!name) return;
  selectedLibraryFood = name;
  document.getElementById('foodInput').value = name;
  document.getElementById('foodInput').focus();
  document.getElementById('addResult').textContent = `Loaded ${name}. Tap Add to log it.`;
  document.getElementById('libraryQuickAdd').style.display = 'flex';
  closeSavedFoodsModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.querySelectorAll('.library-multiplier-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedLibraryFood) return;
    addFood(selectedLibraryFood, Number(btn.dataset.multiplier || 1));
  });
});
document.getElementById('renderBtn').addEventListener('click', renderCard);
document.getElementById('savedFoodsBtn').addEventListener('click', openSavedFoodsModal);
document.getElementById('closeSavedFoodsBtn').addEventListener('click', closeSavedFoodsModal);
document.querySelectorAll('[data-close-modal="true"]').forEach(el => {
  el.addEventListener('click', closeSavedFoodsModal);
});
document.querySelectorAll('.collapse-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.collapsible-card');
    const collapsed = !card.classList.contains('collapsed');
    setCollapsed(card, collapsed);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSavedFoodsModal();
});

refreshAll();
setInterval(pollForUpdates, 10000);
