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
let selectedAddFood = null;
let editingIndex = null;
let pendingFoodDraft = null;
let lastUpdatedAt = null;
let selectedServings = 1;

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

function metricCard({ label, value, target = '', leftText = '', progress = 0, tone = 'neutral', full = false, badge = '', percentText = '', isOver = false }) {
  return `<div class="nutrition-metric-card nutrition-metric-${tone} ${full ? 'nutrition-metric-full' : ''} ${isOver ? 'nutrition-metric-over' : ''}">
    <div class="nutrition-metric-header">
      <div class="nutrition-metric-label"><span class="nutrition-dot nutrition-dot-${tone}"></span>${label}</div>
      ${badge ? `<div class="nutrition-metric-badge ${isOver ? 'nutrition-metric-badge-over' : ''}">${badge}</div>` : ''}
    </div>
    <div class="nutrition-metric-mainline">
      <div class="nutrition-metric-value">${value}${target ? `<span class="nutrition-metric-target"> / ${target}</span>` : ''}</div>
      ${percentText ? `<div class="nutrition-metric-percent">${percentText}</div>` : ''}
    </div>
    <div class="nutrition-metric-footer">
      ${leftText ? `<div class="nutrition-metric-lefttext">${leftText}</div>` : '<div></div>'}
    </div>
    <div class="nutrition-progress-track"><div class="nutrition-progress-fill nutrition-progress-fill-${tone} ${isOver ? 'nutrition-progress-fill-over' : ''}" style="width:${Math.min(progress * 100, 100)}%"></div></div>
  </div>`;
}

function formatMacroLine(food, servings = 1) {
  if (!food) return 'Choose a saved food to preview macros per serving.';
  const mult = Number(servings || 1);
  const round = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 10) / 10;
  return `${round(food.calories * mult)} kcal • C ${round(food.carbs_g * mult)}g • F ${round(food.fat_g * mult)}g • P ${round(food.protein_g * mult)}g`;
}

function updateServingUI() {
  const input = document.getElementById('servingsInput');
  if (input) input.value = String(selectedServings);
  document.querySelectorAll('.serving-chip').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.servings) === selectedServings);
  });
  const servingText = document.getElementById('activeServingText');
  if (servingText) {
    servingText.textContent = selectedAddFood?.serving ? `${selectedServings} × ${selectedAddFood.serving}` : `${selectedServings} serving${selectedServings === 1 ? '' : 's'}`;
  }
  const preview = document.getElementById('quickLogPreview');
  if (preview) preview.textContent = formatMacroLine(selectedAddFood, selectedServings);
}

function setSelectedAddFood(food, options = {}) {
  selectedAddFood = food || null;
  if (food && options.populateInput !== false) {
    document.getElementById('foodInput').value = food.name;
  }
  if (!food && options.resetInput) {
    document.getElementById('foodInput').value = '';
  }
  if (options.servings != null) selectedServings = Number(options.servings) || 1;
  updateServingUI();
}

function renderRecentQuickAdds(entries) {
  const box = document.getElementById('recentQuickAdds');
  if (!box) return;
  const recent = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const text = (entries[i]?.text || '').trim();
    if (!text) continue;
    const match = allFoods.find(food => food.name.toLowerCase() === text.toLowerCase() || (food.aliases || []).some(alias => String(alias).toLowerCase() === text.toLowerCase()));
    const key = (match?.name || text).toLowerCase();
    if (recent.some(item => item.key === key)) continue;
    recent.push({ key, text, food: match || null });
    if (recent.length === 3) break;
  }
  box.innerHTML = recent.map(({ text, food }) => `
    <button class="ghost-btn quick-add-btn" data-text="${escapeHtml(text)}">${escapeHtml(food?.name || text)}${food?.serving ? `<span class="quick-add-meta">${escapeHtml(food.serving)}</span>` : ''}</button>
  `).join('');
  box.style.display = recent.length ? 'grid' : 'none';
  box.querySelectorAll('.quick-add-btn').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      const item = recent[index];
      if (item?.food) {
        setSelectedAddFood(item.food, { servings: 1 });
        document.getElementById('addResult').textContent = `Ready to add ${item.food.name}.`;
      } else {
        document.getElementById('foodInput').value = item?.text || '';
        setSelectedAddFood(null);
      }
    });
  });
}

function renderDay(payload) {
  const day = payload.day;
  const totals = day.totals || {};
  const targetSummary = payload.targetSummary || {};
  const cal = targetSummary.calories || {};
  const protein = targetSummary.protein_g || {};
  const carbs = targetSummary.carbs_g || {};
  const fat = targetSummary.fat_g || {};
  const overText = (item, suffix = '') => item.over ? `+${Math.round(item.overBy)}${suffix} over` : `${Math.round(item.remaining)}${suffix} left`;
  const percentText = (item) => `${Math.round((item.pct || 0) * 100)}%`;
  document.getElementById('totals').innerHTML = [
    metricCard({
      label: 'Calories',
      value: `${Math.round(totals.calories || 0)}`,
      target: `${Math.round(cal.target || 0)}`,
      leftText: '',
      progress: cal.pct,
      tone: 'calories',
      full: true,
      badge: overText(cal, ''),
      isOver: cal.over,
    }),
    metricCard({
      label: 'Protein',
      value: `${Math.round(totals.protein_g || 0)}g`,
      progress: protein.pct,
      tone: 'protein',
      badge: overText(protein, 'g'),
      isOver: protein.over,
    }),
    metricCard({
      label: 'Fat',
      value: `${Math.round(totals.fat_g || 0)}g`,
      progress: fat.pct,
      tone: 'fat',
      badge: overText(fat, 'g'),
      isOver: fat.over,
    }),
    metricCard({
      label: 'Carbs',
      value: `${Math.round(totals.carbs_g || 0)}g`,
      target: `${Math.round(carbs.target || 0)}g`,
      progress: carbs.pct,
      tone: 'carbs',
      full: true,
      badge: overText(carbs, 'g'),
      percentText: percentText(carbs),
      isOver: carbs.over,
    }),
  ].join('');

  const entries = day.entries || [];
  renderRecentQuickAdds(entries);
  const entriesEl = document.getElementById('entries');
  if (!entries.length) {
    entriesEl.innerHTML = `
      <div class="empty-state premium-empty-state">
        <div class="empty-art">
          <div class="empty-orbit empty-orbit-1"></div>
          <div class="empty-orbit empty-orbit-2"></div>
          <div class="empty-core">0</div>
        </div>
        <div class="empty-copy">
          <div class="section-kicker">Ready when you are</div>
          <h3>No entries yet today</h3>
          <p class="hint">Start with a quick add, use a recent item, or pull something from your saved foods library. Your dashboard will build up as you log.</p>
        </div>
      </div>
    `;
    bindEntryActions();
    return;
  }
  entriesEl.innerHTML = entries.slice().reverse().map((e, reverseIndex, arr) => {
    const index = arr.length - 1 - reverseIndex;
    return `
      <div class="entry compact-entry premium-entry">
        <div class="entry-header-row">
          <div class="entry-main">
            <div class="text">${escapeHtml(e.text)}</div>
            <div class="time">${escapeHtml(e.timestamp)}${e.source ? ` • via ${escapeHtml(e.source)}` : ''}</div>
          </div>
          <div class="actions compact-actions quiet-actions entry-icon-actions" aria-label="Entry actions">
            <button class="edit-btn ghost-btn icon-action-btn" data-index="${index}" aria-label="Edit entry" title="Edit">✎</button>
            <button class="save-btn ghost-btn icon-action-btn" data-index="${index}" aria-label="Save food" title="Save food">＋</button>
            <button class="delete-btn ghost-btn danger-btn icon-action-btn" data-index="${index}" aria-label="Delete entry" title="Delete">×</button>
          </div>
        </div>
        <div class="entry-calories">${Math.round(e.calories)} kcal</div>
        <div class="macro-chips">
          <span class="macro-chip macro-chip-carbs">C ${e.carbs_g}g</span>
          <span class="macro-chip macro-chip-fat">F ${e.fat_g}g</span>
          <span class="macro-chip macro-chip-protein">P ${e.protein_g}g</span>
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

function renderLibrarySelection(food) {
  const bar = document.getElementById('librarySelectionBar');
  const name = document.getElementById('librarySelectionName');
  const meta = document.getElementById('librarySelectionMeta');
  const actions = document.getElementById('libraryQuickAdd');
  if (!food) {
    bar.style.display = 'none';
    actions.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  actions.style.display = 'grid';
  name.textContent = food.name;
  meta.textContent = `${food.serving || '1 serving'} • ${formatMacroLine(food, 1)}`;
}

function renderFoods(foods) {
  const q = document.getElementById('foodLibrarySearch')?.value?.trim().toLowerCase() || '';
  const filtered = !q ? foods : foods.filter((f) => {
    const hay = [f.name, ...(f.aliases || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
  document.getElementById('foods').innerHTML = filtered.map((f) => `
    <div class="entry compact-entry selectable-food premium-entry saved-food-row inline-saved-food-row" data-name="${escapeHtml(f.name)}">
      <div class="saved-food-inline-left">
        <div class="text">${escapeHtml(f.name)}</div>
        <div class="time">${escapeHtml(f.serving)}${f.source ? ` • via ${escapeHtml(f.source)}` : ''}</div>
      </div>
      <div class="saved-food-inline-right">
        <div class="entry-calories">${Math.round(f.calories)} kcal</div>
        <div class="saved-food-inline-macros">C ${f.carbs_g} • F ${f.fat_g} • P ${f.protein_g}</div>
        <div class="saved-food-inline-actions">
          <button class="ghost-btn library-load-btn inline-food-btn" data-name="${escapeHtml(f.name)}">Load</button>
          <button class="ghost-btn library-add-btn inline-food-btn" data-name="${escapeHtml(f.name)}" data-servings="1">1x</button>
          <button class="ghost-btn library-add-btn inline-food-btn" data-name="${escapeHtml(f.name)}" data-servings="2">2x</button>
        </div>
      </div>
    </div>
  `).join('');
}

function applySuggestion(food) {
  setSelectedAddFood(food, { servings: selectedServings || 1 });
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
    <div class="suggestion compact-entry premium-entry ${idx === selectedSuggestionIndex ? 'active' : ''}" data-index="${idx}" data-name="${escapeHtml(f.name)}">
      <div class="entry-topline">
        <div>
          <div class="title">${escapeHtml(f.name)}</div>
          <div class="time">${escapeHtml(f.serving)}${f.source ? ` • via ${escapeHtml(f.source)}` : ''}</div>
        </div>
        <div class="entry-calories">${Math.round(f.calories)} kcal</div>
      </div>
      <div class="macro-chips">
        ${f.source === 'typed'
          ? `<span class="macro-chip">Use typed text</span>`
          : `<>
              <span class="macro-chip macro-chip-carbs">C ${f.carbs_g}g</span>
              <span class="macro-chip macro-chip-fat">F ${f.fat_g}g</span>
              <span class="macro-chip macro-chip-protein">P ${f.protein_g}g</span>
            </>`.replace('<>', '').replace('</>', '')}
      </div>
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
  if (!q || q.length < 2) {
    selectedSuggestionIndex = -1;
    return renderSuggestions([]);
  }
  const data = await getJson(`/api/foods/search?q=${encodeURIComponent(q)}`);
  const foods = data.foods || [];
  const exactName = q.toLowerCase();
  const hasExactVisible = foods.some(food => String(food.name || '').trim().toLowerCase() === exactName);
  const fallbackFoods = hasExactVisible ? foods : [{
    name: q,
    serving: 'Tap Add to log exactly as typed',
    calories: 0,
    carbs_g: 0,
    fat_g: 0,
    protein_g: 0,
    source: 'typed'
  }, ...foods];
  if (selectedSuggestionIndex >= fallbackFoods.length) selectedSuggestionIndex = fallbackFoods.length - 1;
  renderSuggestions(fallbackFoods);
}

async function addFood(prefilledText = null, multiplier = 1) {
  const input = document.getElementById('foodInput');
  const text = (prefilledText ?? input.value).trim();
  if (!text) return;
  const servings = Number(document.getElementById('servingsInput')?.value || selectedServings || multiplier || 1) || 1;
  const addBtn = document.getElementById('addBtn');
  const resultBox = document.getElementById('addResult');
  addBtn.disabled = true;
  addBtn.textContent = 'Adding...';
  resultBox.textContent = '';
  try {
    const data = await postJson('/api/add', { text, multiplier, servings });
    renderDay(data);
    input.value = '';
    renderSuggestions([]);
    setSelectedAddFood(null, { resetInput: false, servings: 1 });
    if (data.warning) {
      resultBox.textContent = data.warning;
    } else if (data.addContext?.matched) {
      resultBox.textContent = `Added using ${data.addContext.name} from ${data.addContext.source}.`;
    } else {
      resultBox.textContent = servings !== 1 ? `Added ${servings} servings of ${text}.` : 'Added.';
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
  const box = document.getElementById('lookupResult');
  const addBox = document.getElementById('addResult');
  if (!text) {
    box.textContent = 'Enter a food first.';
    return;
  }
  box.textContent = 'Looking up product nutrition...';
  addBox.textContent = '';
  ensureLookupSectionOpen();
  try {
    const data = await postJson('/api/foods/lookup', { text });
    if (data.error) {
      box.textContent = data.error;
      return;
    }
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
  } catch (err) {
    box.textContent = `Lookup failed: ${err.message || err}`;
  }
}

const saveEditBtn = document.getElementById('saveEditBtn');
if (saveEditBtn) saveEditBtn.addEventListener('click', async () => {
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

const cancelEditBtn = document.getElementById('cancelEditBtn');
if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => {
  editingIndex = null;
  document.getElementById('editorCard').style.display = 'none';
});

const saveFoodBtn = document.getElementById('saveFoodBtn');
if (saveFoodBtn) saveFoodBtn.addEventListener('click', async () => {
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

const cancelFoodBtn = document.getElementById('cancelFoodBtn');
if (cancelFoodBtn) cancelFoodBtn.addEventListener('click', () => {
  closeFoodEditor();
});

const lookupBtn = document.getElementById('lookupBtn');
if (lookupBtn) lookupBtn.addEventListener('click', lookupFood);
const addBtnEl = document.getElementById('addBtn');
if (addBtnEl) addBtnEl.addEventListener('click', () => addFood());
const foodInputEl = document.getElementById('foodInput');
if (foodInputEl) foodInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && suggestionFoods.length) {
    e.preventDefault();
    selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestionFoods.length - 1);
    if (selectedSuggestionIndex < 0) selectedSuggestionIndex = 0;
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
    e.preventDefault();
    if (suggestionFoods.length && selectedSuggestionIndex >= 0) {
      applySuggestion(suggestionFoods[selectedSuggestionIndex]);
    }
    return;
  }
});
if (foodInputEl) foodInputEl.addEventListener('input', () => {
  searchFoods();
});
const foodLibrarySearchEl = document.getElementById('foodLibrarySearch');
if (foodLibrarySearchEl) foodLibrarySearchEl.addEventListener('input', () => {
  renderFoods(allFoods);
});

const foodsEl = document.getElementById('foods');
if (foodsEl) foodsEl.addEventListener('click', async (e) => {
  const addBtn = e.target.closest('.library-add-btn');
  if (addBtn) {
    const name = addBtn.dataset.name || '';
    const servings = Number(addBtn.dataset.servings || 1) || 1;
    const food = allFoods.find(item => item.name === name) || null;
    if (food) {
      selectedLibraryFood = name;
      renderLibrarySelection(food);
      setSelectedAddFood(food, { servings });
      await addFood(name, servings);
    }
    return;
  }

  const loadBtn = e.target.closest('.library-load-btn');
  const card = e.target.closest('.entry');
  if (!card) return;
  const name = loadBtn?.dataset.name || card.querySelector('.text')?.textContent?.trim();
  if (!name) return;
  const food = allFoods.find(item => item.name === name) || null;
  selectedLibraryFood = name;
  renderLibrarySelection(food);
  if (food) setSelectedAddFood(food, { servings: 1 });
  else document.getElementById('foodInput').value = name;
  document.getElementById('foodInput').focus();
  document.getElementById('addResult').textContent = `Loaded ${name}. Tap Add to log it.`;
  document.getElementById('libraryQuickAdd').style.display = 'grid';
  if (loadBtn) {
    closeSavedFoodsModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
document.querySelectorAll('.library-multiplier-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedLibraryFood) return;
    const servings = Number(btn.dataset.multiplier || 1);
    const food = allFoods.find(item => item.name === selectedLibraryFood) || null;
    if (food) setSelectedAddFood(food, { servings });
    addFood(selectedLibraryFood, servings);
  });
});
document.querySelectorAll('#renderBtn').forEach(el => el.addEventListener('click', renderCard));
document.querySelectorAll('#savedFoodsBtn').forEach(el => el.addEventListener('click', openSavedFoodsModal));
const closeSavedFoodsBtn = document.getElementById('closeSavedFoodsBtn');
if (closeSavedFoodsBtn) closeSavedFoodsBtn.addEventListener('click', closeSavedFoodsModal);
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

document.querySelectorAll('.serving-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedServings = Number(btn.dataset.servings || 1) || 1;
    updateServingUI();
  });
});
const servingsInputEl = document.getElementById('servingsInput');
if (servingsInputEl) servingsInputEl.addEventListener('input', (e) => {
  selectedServings = Math.max(0.25, Number(e.target.value || 1) || 1);
  updateServingUI();
});
const decreaseServingsBtn = document.getElementById('decreaseServingsBtn');
if (decreaseServingsBtn) decreaseServingsBtn.addEventListener('click', () => {
  selectedServings = Math.max(0.25, Math.round((selectedServings - 0.25) * 100) / 100);
  updateServingUI();
});
const increaseServingsBtn = document.getElementById('increaseServingsBtn');
if (increaseServingsBtn) increaseServingsBtn.addEventListener('click', () => {
  selectedServings = Math.round((selectedServings + 0.25) * 100) / 100;
  updateServingUI();
});

if (foodInputEl) foodInputEl.addEventListener('input', () => {
  if (!foodInputEl.value.trim()) setSelectedAddFood(null);
  searchFoods();
});

refreshAll().then(() => updateServingUI());
setInterval(pollForUpdates, 10000);
