// ══════════════════════════════════════════════
// setup.js
// ══════════════════════════════════════════════

let currentStep = 0;
const STEP_COUNT = 5;

// ── Navigation ────────────────────────────────
function goStep(step) {
  currentStep = Math.max(0, Math.min(STEP_COUNT - 1, step));
  document.querySelectorAll('.setup-step').forEach((el, i) => el.classList.toggle('active', i === currentStep));
  renderStepDots();
}

function renderStepDots() {
  const nav = document.getElementById('steps-nav');
  nav.innerHTML = '';
  for (let i = 0; i < STEP_COUNT; i++) {
    const dot = document.createElement('div');
    dot.className = 'step-dot' + (i < currentStep ? ' done' : '') + (i === currentStep ? ' active' : '');
    nav.appendChild(dot);
  }
}

function switchBackend(type) {
  config.backend = type;
  document.getElementById('gemini-settings').style.display = type === 'gemini' ? '' : 'none';
  document.getElementById('anthropic-settings').style.display = type === 'anthropic' ? '' : 'none';
  document.getElementById('openrouter-settings').style.display = type === 'openrouter' ? '' : 'none';
  document.getElementById('openai-settings').style.display = type === 'openai' ? '' : 'none';
}

function readConnectionSettings() {
  config.backend = document.getElementById('backend-select').value;
  if (config.backend === 'gemini') {
    config.gmKey = document.getElementById('gm-key-input').value.trim();
    config.gmModel = document.getElementById('gm-model').value.trim();
    config.maxTokens = Number(document.getElementById('gm-tokens').value) || 2000;
  } else if (config.backend === 'anthropic') {
    apiKey = document.getElementById('key-input').value.trim();
    config.model = document.getElementById('model-select').value;
    config.maxTokens = Number(document.getElementById('tokens-input').value) || 1200;
  } else if (config.backend === 'openai') {
    config.oaiKey = document.getElementById('oai-key-input').value.trim();
    config.oaiModel = document.getElementById('oai-model').value.trim();
    config.maxTokens = Number(document.getElementById('oai-tokens').value) || 2000;
  } else {
    config.orKey = document.getElementById('or-key-input').value.trim();
    config.orModel = document.getElementById('or-model').value.trim();
    config.maxTokens = Number(document.getElementById('or-tokens').value) || 2000;
  }
}

function readStorySettings() {
  config.dmPersonality = document.getElementById('inp-dm').value.trim();
  config.story = document.getElementById('inp-story').value.trim();
  config.rules = document.getElementById('inp-rules').value.trim();
  config.initialMessage = document.getElementById('initial-message').value.trim();
}

function readExtraSettings() {
  config.timersEnabled = document.getElementById('timers-enabled').checked;
  config.timeUnitName = document.getElementById('time-unit-name').value.trim() || 'Раунд';
  config.timeUnitSeconds = Number(document.getElementById('time-unit-seconds').value) || 360;
}

// ── Buttons ───────────────────────────────────
document.getElementById('backend-select').onchange = e => switchBackend(e.target.value);
document.getElementById('key-next').onclick = () => { readConnectionSettings(); goStep(1); };
document.getElementById('next-1').onclick = () => { readStorySettings(); goStep(2); };
document.getElementById('back-1').onclick = () => goStep(0);
document.getElementById('back-2').onclick = () => goStep(1);
document.getElementById('next-2').onclick = () => { goStep(3); populateVarSelects(); };
document.getElementById('back-3').onclick = () => goStep(2);
document.getElementById('next-3').onclick = () => goStep(4);
document.getElementById('back-4').onclick = () => goStep(3);

document.getElementById('timers-enabled').onchange = function () {
  document.getElementById('timer-settings-fields').style.display = this.checked ? '' : 'none';
};

// ── Variable builder (modal-based, sections as containers) ──
const TYPE_CLASS = { stat: 'tag-stat', skill: 'tag-stat', resource: 'tag-resource', list: 'tag-list', entry: 'tag-entry', notes: 'tag-notes' };

let sectionIdCounter = 1;
function newSectionId() { return 'sec_' + (sectionIdCounter++); }

let vmEditingIndex = null;
let vmTargetSide = 'right';
let vmTargetSectionId = null;

function openVarModal({ editIndex = null, side = 'right', sectionId = null } = {}) {
  vmEditingIndex = editIndex;
  vmTargetSide = side;
  vmTargetSectionId = sectionId;

  const v = editIndex !== null ? config.vars[editIndex] : null;

  document.getElementById('var-modal-title').textContent = v ? 'Редактировать переменную' : 'Новая переменная';
  document.getElementById('vm-type').value = v ? v.type : 'stat';
  document.getElementById('vm-name').value = v ? v.name : '';
  document.getElementById('vm-label').value = v ? v.label : '';
  document.getElementById('vm-desc').value = v ? (v.desc || '') : '';

  if (v && v.type === 'stat') {
    document.getElementById('vm-init-stat-val').value = v.init ?? '';
  } else {
    document.getElementById('vm-init-stat-val').value = '';
  }
  if (v && v.type === 'resource') {
    const initStr = String(v.init || '');
    const hasMax = initStr.includes('/');
    if (hasMax) {
      const parts = initStr.split('/');
      document.getElementById('vm-init-res-cur').value = parts[0] || '0';
      document.getElementById('vm-init-res-max').value = parts[1] || '';
    } else {
      document.getElementById('vm-init-res-cur').value = initStr || '0';
      document.getElementById('vm-init-res-max').value = '';
    }
    document.getElementById('vm-income').value = v.income || '';
    document.getElementById('vm-income-amount').value = (v.incomeAmount ?? '') === '' ? '' : v.incomeAmount;
    document.getElementById('vm-income-every').value = (v.incomeEvery ?? '') === '' ? '' : v.incomeEvery;
    document.getElementById('vm-color').value = v.color || '#6aaa7a';
  } else {
    document.getElementById('vm-init-res-cur').value = '';
    document.getElementById('vm-init-res-max').value = '';
    document.getElementById('vm-income').value = '';
    document.getElementById('vm-income-amount').value = '';
    document.getElementById('vm-income-every').value = '';
    document.getElementById('vm-color').value = '#6aaa7a';
  }

  updateVmInitVisibility();
  document.getElementById('var-modal-overlay').classList.add('open');
}

function closeVarModal() {
  document.getElementById('var-modal-overlay').classList.remove('open');
  vmEditingIndex = null;
}

function updateVmInitVisibility() {
  const type = document.getElementById('vm-type').value;
  document.querySelectorAll('.vm-init-block').forEach(el => el.classList.remove('active'));
  if (type === 'stat') document.getElementById('vm-init-stat').classList.add('active');
  else if (type === 'resource') document.getElementById('vm-init-resource').classList.add('active');
  else document.getElementById('vm-init-none').classList.add('active');
}

document.getElementById('vm-type').addEventListener('change', updateVmInitVisibility);
document.getElementById('vm-cancel').onclick = closeVarModal;

document.getElementById('vm-save').onclick = () => {
  const type = document.getElementById('vm-type').value;
  const name = document.getElementById('vm-name').value.trim();
  const label = document.getElementById('vm-label').value.trim();
  const desc = document.getElementById('vm-desc').value.trim();

  if (!name) { alert('Укажи ключ переменной.'); return; }

  const dupIdx = config.vars.findIndex((vv, i) => vv.name === name && i !== vmEditingIndex);
  if (dupIdx !== -1) { alert('Переменная с таким ключом уже существует.'); return; }

  let init = '';
  let color = undefined;
  let income = '';
  let incomeAmount = '';
  let incomeEvery = '';
  if (type === 'stat') {
    init = document.getElementById('vm-init-stat-val').value.trim();
  } else if (type === 'resource') {
    const cur = document.getElementById('vm-init-res-cur').value.trim() || '0';
    const max = document.getElementById('vm-init-res-max').value.trim();
    init = max ? `${cur}/${max}` : cur;       // no max → store plain number
    income = document.getElementById('vm-income').value.trim();
    incomeAmount = document.getElementById('vm-income-amount').value.trim();
    incomeEvery = document.getElementById('vm-income-every').value.trim();
    color = document.getElementById('vm-color').value;
  }

  const varObj = {
    type, name, label: label || name, desc, init,
    side: vmTargetSide, sectionId: vmTargetSectionId,
    color: color || '#6aaa7a',
    income,
    incomeAmount,
    incomeEvery,
    extra: {}
  };

  if (vmEditingIndex !== null) {
    varObj.side = config.vars[vmEditingIndex].side;
    varObj.sectionId = config.vars[vmEditingIndex].sectionId;
    varObj.extra = config.vars[vmEditingIndex].extra || {};
    config.vars[vmEditingIndex] = varObj;
  } else {
    config.vars.push(varObj);
  }

  closeVarModal();
  renderVarsEditor();
};

// ── Render sections + their variables ──
function renderVarsEditor() {
  renderSectionsEditor();
  renderUnsectionedVars();
  saveAutosave();
}

function varRowHtml(v, idx, siblings) {
  const posInSiblings = siblings.indexOf(idx);
  const canUp = posInSiblings > 0;
  const canDown = posInSiblings < siblings.length - 1;
  return `
    <div class="var-row">
      <div class="var-row-info">
        <span class="var-tag ${TYPE_CLASS[v.type] || ''}">${v.type}</span>
        <span class="var-row-name">${v.label || v.name}</span>
        <span class="var-row-key">[${v.name}]</span>
      </div>
      <div class="var-row-actions">
        ${canUp ? `<button class="btn move-var-up" data-index="${idx}">↑</button>` : ''}
        ${canDown ? `<button class="btn move-var-down" data-index="${idx}">↓</button>` : ''}
        <button class="btn edit-var-row" data-index="${idx}">✎</button>
        <button class="btn btn-danger del-var-row" data-index="${idx}">✕</button>
      </div>
    </div>`;
}

function renderSectionsEditor() {
  const root = document.getElementById('sections-editor');
  root.innerHTML = '';

  config.sections.forEach((sec, secIdx) => {
    const secVarIndices = config.vars.map((v, i) => v.sectionId === sec.id ? i : -1).filter(i => i !== -1);

    const card = document.createElement('div');
    card.className = 'section-card';
    card.innerHTML = `
      <div class="section-card-header">
        <span class="section-card-side-icon">${sec.side === 'left' ? '◀' : '▶'}</span>
        <input type="text" class="section-card-title" value="${sec.label}" data-sec-index="${secIdx}" />
        <select class="section-card-side-select" data-sec-index="${secIdx}">
          <option value="right" ${sec.side !== 'left' ? 'selected' : ''}>Правая</option>
          <option value="left" ${sec.side === 'left' ? 'selected' : ''}>Левая</option>
        </select>
        <button class="btn btn-sm btn-danger del-section-btn" data-sec-index="${secIdx}">✕</button>
      </div>
      <div class="section-card-body">
        ${secVarIndices.length
          ? secVarIndices.map(i => varRowHtml(config.vars[i], i, secVarIndices)).join('')
          : '<div class="section-card-empty">пока пусто</div>'}
        <button class="btn btn-sm add-var-to-section-btn" data-sec-id="${sec.id}" data-sec-side="${sec.side}">+ переменная</button>
      </div>`;
    root.appendChild(card);
  });

  root.querySelectorAll('.section-card-title').forEach(inp => {
    inp.addEventListener('change', () => {
      config.sections[Number(inp.dataset.secIndex)].label = inp.value.trim() || 'Без названия';
      saveAutosave();
    });
  });
  root.querySelectorAll('.section-card-side-select').forEach(sel => {
    sel.addEventListener('change', () => {
      config.sections[Number(sel.dataset.secIndex)].side = sel.value;
      renderVarsEditor();
    });
  });
  root.querySelectorAll('.del-section-btn').forEach(btn => {
    btn.onclick = () => {
      const sec = config.sections[Number(btn.dataset.secIndex)];
      if (!confirm(`Удалить раздел "${sec.label}"? Переменные внутри останутся, но без раздела.`)) return;
      config.vars.forEach(v => { if (v.sectionId === sec.id) v.sectionId = null; });
      config.sections.splice(Number(btn.dataset.secIndex), 1);
      renderVarsEditor();
    };
  });
  root.querySelectorAll('.add-var-to-section-btn').forEach(btn => {
    btn.onclick = () => openVarModal({ side: btn.dataset.secSide, sectionId: btn.dataset.secId });
  });

  bindVarRowActions(root);
}

function renderUnsectionedVars() {
  const root = document.getElementById('unsectioned-vars-list');
  const indices = config.vars.map((v, i) => !v.sectionId ? i : -1).filter(i => i !== -1);
  root.innerHTML = indices.length
    ? indices.map(i => varRowHtml(config.vars[i], i, indices)).join('')
    : '<div class="section-card-empty">пока пусто</div>';
  bindVarRowActions(root);
}

function bindVarRowActions(root) {
  root.querySelectorAll('.move-var-up').forEach(btn => {
    btn.onclick = () => moveVarWithinSiblings(Number(btn.dataset.index), -1);
  });
  root.querySelectorAll('.move-var-down').forEach(btn => {
    btn.onclick = () => moveVarWithinSiblings(Number(btn.dataset.index), 1);
  });
  root.querySelectorAll('.edit-var-row').forEach(btn => {
    btn.onclick = () => {
      const v = config.vars[Number(btn.dataset.index)];
      openVarModal({ editIndex: Number(btn.dataset.index), side: v.side, sectionId: v.sectionId });
    };
  });
  root.querySelectorAll('.del-var-row').forEach(btn => {
    btn.onclick = () => {
      config.vars.splice(Number(btn.dataset.index), 1);
      renderVarsEditor();
    };
  });
}

function moveVarWithinSiblings(idx, dir) {
  const v = config.vars[idx];
  const siblings = config.vars.map((vv, i) => vv.sectionId === v.sectionId ? i : -1).filter(i => i !== -1);
  const pos = siblings.indexOf(idx);
  const swapWithPos = pos + dir;
  if (swapWithPos < 0 || swapWithPos >= siblings.length) return;
  const swapIdx = siblings[swapWithPos];
  [config.vars[idx], config.vars[swapIdx]] = [config.vars[swapIdx], config.vars[idx]];
  renderVarsEditor();
}

// ── Add section ──
document.getElementById('add-section-btn').onclick = () => {
  const label = document.getElementById('section-name').value.trim();
  const side = document.getElementById('section-side').value;
  if (!label) { alert('Укажи название раздела.'); return; }
  config.sections.push({ id: newSectionId(), label, side });
  document.getElementById('section-name').value = '';
  renderVarsEditor();
};

// ── Add unsectioned variable ──
document.getElementById('add-var-unsectioned-btn').onclick = () => {
  openVarModal({ side: 'right', sectionId: null });
};

// ── Game start ────────────────────────────────
function startGame() {
  readConnectionSettings();
  readStorySettings();
  readExtraSettings();
  timers = [];
  timerIdCounter = 0;
  incomes = [];
  incomeIdCounter = 0;
  initGameState();
  initIncomesFromVars();

  const hasLeft  = config.vars.some(v => v.side === 'left' && v.type !== 'notes') || config.sections.some(s => s.side === 'left');
  const hasRight = config.vars.some(v => v.side !== 'left' && v.type !== 'notes') || config.sections.some(s => s.side === 'right');
  const leftCol  = document.getElementById('sidebar-left-col');
  const rightCol = document.getElementById('sidebar-right-col');
  if (leftCol)  leftCol.style.display  = hasLeft  ? '' : 'none';
  if (rightCol) rightCol.style.display = hasRight ? '' : 'none';

  // Show/hide timer button
  const timersBtn = document.getElementById('timers-toggle-btn');
  if (timersBtn) timersBtn.style.display = config.timersEnabled ? '' : 'none';
  const incomesBtn = document.getElementById('incomes-toggle-btn');
  if (incomesBtn) incomesBtn.style.display = config.timersEnabled ? '' : 'none';

  renderSidebar();
  renderTimers();
  renderIncomes();

  document.getElementById('setup').style.display = 'none';
  document.getElementById('game').style.display = 'flex';

  addMsg('Игра началась.', 'msg-sys');
  if (config.timersEnabled) {
    addMsg(`[⏱ Таймеры активны · ${config.timeUnitName} = ${config.timeUnitSeconds} сек]`, 'msg-sys');
  }
  callDM(config.initialMessage || "Начни игру");
}

// ── Presets ───────────────────────────────────
const PRESET_KEY = 'rpg_presets';

function getPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch { return {}; }
}
function savePresets(p) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch {}
}

function collectPreset() {
  readConnectionSettings();
  readStorySettings();
  readExtraSettings();
  return {
    backend: config.backend, apiKey, orKey: config.orKey, oaiKey: config.oaiKey, gmKey: config.gmKey,
    model: config.model, orModel: config.orModel, oaiModel: config.oaiModel, gmModel: config.gmModel, maxTokens: config.maxTokens,
    dmPersonality: config.dmPersonality, story: config.story, rules: config.rules,
    vars: structuredClone(config.vars), sections: structuredClone(config.sections),
    actions: structuredClone(config.actions),
    triggers: structuredClone(config.triggers),
    worldMemory: structuredClone(config.worldMemory || []),
    timersEnabled: config.timersEnabled,
    timeUnitName: config.timeUnitName,
    timeUnitSeconds: config.timeUnitSeconds,
    initialMessage: config.initialMessage,
  };
}

function applyPreset(preset) {
  config.backend = preset.backend || 'gemini';
  // Пресет без ключей (напр. импортированный) не должен затирать текущие
  if (preset.apiKey !== undefined) apiKey = preset.apiKey;
  if (preset.orKey !== undefined) config.orKey = preset.orKey;
  if (preset.oaiKey !== undefined) config.oaiKey = preset.oaiKey;
  if (preset.gmKey !== undefined) config.gmKey = preset.gmKey;
  config.gmModel = preset.gmModel || config.gmModel;
  config.model = preset.model || config.model;
  config.orModel = preset.orModel || config.orModel;
  config.oaiModel = preset.oaiModel || config.oaiModel;
  config.maxTokens = preset.maxTokens || config.maxTokens;
  config.dmPersonality = preset.dmPersonality || '';
  config.story = preset.story || '';
  config.rules = preset.rules || '';
  config.vars = structuredClone(preset.vars || []);
  config.sections = structuredClone(preset.sections || []);
  config.actions = structuredClone(preset.actions || []);
  config.triggers = structuredClone(preset.triggers || []);
  config.worldMemory = structuredClone(preset.worldMemory || []);
  config.timersEnabled = preset.timersEnabled || false;
  config.timeUnitName = preset.timeUnitName || 'Раунд';
  config.timeUnitSeconds = preset.timeUnitSeconds || 360;
  config.initialMessage = preset.initialMessage || '';

  document.getElementById('backend-select').value = config.backend;
  switchBackend(config.backend);
  document.getElementById('key-input').value = apiKey;
  document.getElementById('model-select').value = config.model;
  document.getElementById('tokens-input').value = config.maxTokens;
  document.getElementById('gm-key-input').value = config.gmKey || '';
  document.getElementById('gm-tokens').value = config.maxTokens;
  {
    const sel = document.getElementById('gm-model-select');
    const inp = document.getElementById('gm-model');
    inp.value = config.gmModel || '';
    if ([...sel.options].some(o => o.value === config.gmModel)) {
      sel.value = config.gmModel;
      inp.style.display = 'none';
    } else {
      sel.value = 'custom';
      inp.style.display = '';
    }
  }
  document.getElementById('or-key-input').value = config.orKey;
  document.getElementById('or-model').value = config.orModel;
  document.getElementById('or-tokens').value = config.maxTokens;
  document.getElementById('oai-key-input').value = config.oaiKey || '';
  document.getElementById('oai-tokens').value = config.maxTokens;
  {
    const sel = document.getElementById('oai-model-select');
    const inp = document.getElementById('oai-model');
    inp.value = config.oaiModel || '';
    if ([...sel.options].some(o => o.value === config.oaiModel)) {
      sel.value = config.oaiModel;
      inp.style.display = 'none';
    } else {
      sel.value = 'custom';
      inp.style.display = '';
    }
  }
  document.getElementById('inp-dm').value = config.dmPersonality;
  document.getElementById('inp-story').value = config.story;
  document.getElementById('inp-rules').value = config.rules;
  document.getElementById('initial-message').value = config.initialMessage || '';

  // Timer UI
  const timersEnabledEl = document.getElementById('timers-enabled');
  if (timersEnabledEl) timersEnabledEl.checked = config.timersEnabled;
  const timeUnitNameEl = document.getElementById('time-unit-name');
  if (timeUnitNameEl) timeUnitNameEl.value = config.timeUnitName;
  const timeUnitSecEl = document.getElementById('time-unit-seconds');
  if (timeUnitSecEl) timeUnitSecEl.value = config.timeUnitSeconds;
  const timerFieldsEl = document.getElementById('timer-settings-fields');
  if (timerFieldsEl) timerFieldsEl.style.display = config.timersEnabled ? '' : 'none';

  const orModelSelect = document.getElementById('or-model-select');
  const orModelInput = document.getElementById('or-model');
  orModelInput.value = config.orModel || '';
  if ([...orModelSelect.options].some(o => o.value === config.orModel)) {
    orModelSelect.value = config.orModel;
    orModelInput.style.display = 'none';
  } else {
    orModelSelect.value = 'custom';
    orModelInput.style.display = '';
  }

  renderVarsEditor();
  renderWmList();
}

function renderPresetBar() {
  const root = document.getElementById('preset-bar');
  const presets = getPresets();
  const names = Object.keys(presets);
  if (!names.length) {
    root.innerHTML = '<span style="font-size:12px;color:var(--text3);">нет сохранённых пресетов</span>';
    return;
  }
  root.innerHTML = '';
  names.forEach(name => {
    const load = document.createElement('button');
    load.className = 'preset-chip';
    load.textContent = name;
    load.onclick = () => applyPreset(presets[name]);
    root.appendChild(load);
    const del = document.createElement('button');
    del.className = 'preset-chip delete';
    del.textContent = '✕';
    del.onclick = () => {
      if (!confirm(`Удалить "${name}"?`)) return;
      const p = getPresets(); delete p[name]; savePresets(p); renderPresetBar();
    };
    root.appendChild(del);
  });
}

document.getElementById('save-preset-btn').onclick = () => {
  const name = prompt('Название пресета');
  if (!name) return;
  const p = getPresets();
  p[name] = collectPreset();
  savePresets(p);
  renderPresetBar();
};

document.getElementById('export-preset-btn').onclick = () => {
  const name = prompt('Какой пресет экспортировать?');
  if (!name) return;
  const presets = getPresets();
  if (!presets[name]) { alert('Пресет не найден'); return; }
  // Ключи API остаются в локальном пресете, но НЕ уходят в экспорт
  const exportable = structuredClone(presets[name]);
  delete exportable.apiKey;
  delete exportable.orKey;
  delete exportable.oaiKey;
  delete exportable.gmKey;
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.json';
  a.click();
};

document.getElementById('import-preset-btn').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const preset = JSON.parse(ev.target.result);
        const name = prompt('Название для импортированного пресета:', file.name.replace('.json',''));
        if (!name) return;
        const presets = getPresets();
        presets[name] = preset;
        savePresets(presets);
        renderPresetBar();
        alert(`Пресет "${name}" импортирован!`);
      } catch { alert('Ошибка чтения файла'); }
    };
    reader.readAsText(file);
  };
  input.click();
};

// ── Autosave ──────────────────────────────────
const AUTOSAVE_KEY = 'rpgmaster_last_config';

function saveAutosave() {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(collectPreset())); } catch {}
}
function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) applyPreset(JSON.parse(raw));
  } catch {}
}

['backend-select','key-input','model-select','tokens-input','gm-key-input','gm-model','gm-tokens','or-key-input','or-model','or-tokens','oai-key-input','oai-model','oai-tokens','inp-dm','inp-story','inp-rules'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', saveAutosave);
});
['time-unit-name','time-unit-seconds'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', saveAutosave);
});
const timersEnabledEl = document.getElementById('timers-enabled');
if (timersEnabledEl) timersEnabledEl.addEventListener('change', saveAutosave);

function validateConfig() {
  const names = new Set();
  for (const v of config.vars) {
    if (!v.name.trim()) { alert('У одной из переменных отсутствует ключ.'); return false; }
    if (names.has(v.name)) { alert(`Повторяющийся ключ "${v.name}"`); return false; }
    names.add(v.name);
  }
  if (config.backend === 'gemini') {
    if (!config.gmKey.trim()) {
      if (!confirm('API ключ Google AI пустой.\nПродолжить?')) return false;
    }
  } else if (config.backend === 'anthropic') {
    if (!apiKey.trim()) {
      if (!confirm('API ключ Anthropic пустой.\nПродолжить?')) return false;
    }
  } else if (config.backend === 'openai') {
    if (!config.oaiKey.trim()) {
      if (!confirm('API ключ OpenAI пустой.\nПродолжить?')) return false;
    }
  } else {
    if (!config.orKey.trim()) {
      if (!confirm('API ключ OpenRouter пустой.\nПродолжить?')) return false;
    }
  }
  return true;
}

document.getElementById('start-game-top-btn').onclick = () => {
  readConnectionSettings();
  readStorySettings();
  readExtraSettings();
  if (!validateConfig()) return;
  startGame();
};

document.getElementById('load-game-top-btn').onclick = () => {
  document.getElementById('load-game-top-input').click();
};

document.getElementById('load-game-top-input').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  readConnectionSettings();
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const save = JSON.parse(ev.target.result);
      gameState = save.gameState || {};
      slideHistory = save.slideHistory || [];
      notes = save.notes || [];
      timers = save.timers || [];
      incomes = save.incomes || [];
      document.getElementById('story-box').innerHTML = '';
      slideHistory.forEach(msg => {
        if (msg.role === 'user') {
          addMsg(`> ${msg.content}`, 'msg-player');
        } else {
          try {
            const clean = msg.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = clean.indexOf('{');
            const end = clean.lastIndexOf('}');
            const parsed = JSON.parse(clean.slice(start, end + 1));
            if (parsed.story) addMsg(parsed.story, 'msg-dm');
            if (parsed.story_append) addMsg(parsed.story_append, 'msg-dm');
          } catch {
            addMsg(msg.content, 'msg-dm');
          }
        }
      });
      if (save.configVars) config.vars = save.configVars;
      if (save.configSections) config.sections = save.configSections;
      if (save.story) config.story = save.story;
      if (save.rules) config.rules = save.rules;
      if (save.dmPersonality) config.dmPersonality = save.dmPersonality;
      if (!save.incomes) initIncomesFromVars();

      document.getElementById('setup').style.display = 'none';
      document.getElementById('game').style.display = 'flex';

      const hasLeft  = config.vars.some(v => v.side === 'left' && v.type !== 'notes') || config.sections.some(s => s.side === 'left');
      const hasRight = config.vars.some(v => v.side !== 'left' && v.type !== 'notes') || config.sections.some(s => s.side === 'right');
      const leftCol  = document.getElementById('sidebar-left-col');
      const rightCol = document.getElementById('sidebar-right-col');
      if (leftCol)  leftCol.style.display  = hasLeft  ? '' : 'none';
      if (rightCol) rightCol.style.display = hasRight ? '' : 'none';

      const timersBtn = document.getElementById('timers-toggle-btn');
      if (timersBtn) timersBtn.style.display = config.timersEnabled ? '' : 'none';
      const incomesBtn = document.getElementById('incomes-toggle-btn');
      if (incomesBtn) incomesBtn.style.display = config.timersEnabled ? '' : 'none';

      renderSidebar();
      renderTimers();
      renderIncomes();
      addMsg('[Сохранение загружено]', 'msg-sys');
      e.target.value = '';
    } catch { alert('Ошибка загрузки сохранения'); }
  };
  reader.readAsText(file);
};

// ── Init ──────────────────────────────────────
loadAutosave();
renderPresetBar();
renderVarsEditor();
renderStepDots();
switchBackend(config.backend);

console.log('setup.js loaded');

// ══════════════════════════════════════════════
// ACTIONS & TRIGGERS CONSTRUCTOR
// ══════════════════════════════════════════════

let actionIdCounter = 1;
let triggerIdCounter = 1;
function newActionId() { return 'act_' + (actionIdCounter++); }
function newTriggerId() { return 'trg_' + (triggerIdCounter++); }

const EFFECT_TYPES = {
  adjust_stat: 'Изменить стат (±N)',
  adjust_resource: 'Изменить ресурс (±N)',
  adjust_resource_max: 'Изменить макс. ресурса (±N)',
  add_context: 'Добавить контекст (тихо)',
  send_message: 'Отправить ход с сообщением',
};

const COND_OPS = ['>=', '<=', '==', '>', '<', 'record_exists'];

function populateVarSelects() {
  const opts = config.vars.map(v => `<option value="${v.name}">${v.label} [${v.name}]</option>`).join('');
  const fallback = '<option value="">— нет переменных —</option>';
  ['trg-var', 'trg-eff-var', 'am-var', 'am-eff-var'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts || fallback;
  });
}

// ── Actions editor ────────────────────────────
function renderActionsEditor() {
  const root = document.getElementById('actions-editor');
  if (!root) return;
  root.innerHTML = '';
  if (!(config.actions || []).length) {
    root.innerHTML = '<div style="color:var(--text3);font-size:12px;">Нет действий</div>';
    return;
  }
  config.actions.forEach((action, idx) => {
    const el = document.createElement('div');
    el.className = 'var-card';
    el.innerHTML = `
      <div class="var-card-header">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="var-tag tag-entry">действие</span>
          <span class="var-name">${action.label}</span>
          <span style="font-size:11px;color:var(--text3);">[${action.varName}]${action.itemLevel ? ' · item-level' : ''}</span>
        </div>
        <div class="var-card-actions">
          <button class="btn btn-sm edit-action-btn" data-idx="${idx}">✎</button>
          <button class="btn btn-danger btn-sm del-action-btn" data-idx="${idx}">✕</button>
        </div>
      </div>`;
    root.appendChild(el);
  });
  root.querySelectorAll('.del-action-btn').forEach(btn => {
    btn.onclick = () => { config.actions.splice(Number(btn.dataset.idx), 1); renderActionsEditor(); };
  });
  root.querySelectorAll('.edit-action-btn').forEach(btn => {
    btn.onclick = () => openActionModal(Number(btn.dataset.idx));
  });
}

// ── Triggers editor ───────────────────────────
function renderTriggersEditor() {
  const root = document.getElementById('triggers-editor');
  if (!root) return;
  root.innerHTML = '';
  if (!(config.triggers || []).length) {
    root.innerHTML = '<div style="color:var(--text3);font-size:12px;">Нет триггеров</div>';
    return;
  }
  const EVENT_LABELS = { max_reached: 'достиг макс', min_reached: 'достиг 0', gte: '>=', lte: '<=', eq: '==' };
  config.triggers.forEach((trigger, idx) => {
    const el = document.createElement('div');
    el.className = 'var-card';
    el.innerHTML = `
      <div class="var-card-header">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="var-tag tag-notes">триггер</span>
          <span class="var-name">[${trigger.varName}] ${EVENT_LABELS[trigger.event] || trigger.event}${trigger.eventValue ? ' ' + trigger.eventValue : ''}</span>
          <span style="font-size:11px;color:var(--text3);">${trigger.repeat ? 'повторно' : 'однократно'}</span>
        </div>
        <div class="var-card-actions">
          <button class="btn btn-danger btn-sm del-trigger-btn" data-idx="${idx}">✕</button>
        </div>
      </div>`;
    root.appendChild(el);
  });
  root.querySelectorAll('.del-trigger-btn').forEach(btn => {
    btn.onclick = () => { config.triggers.splice(Number(btn.dataset.idx), 1); renderTriggersEditor(); };
  });
}

// ── Action Modal ──────────────────────────────
let editingActionIdx = null;

function openActionModal(idx = null) {
  editingActionIdx = idx;
  const action = idx !== null ? config.actions[idx] : null;
  document.getElementById('am-label').value = action?.label || '';
  document.getElementById('am-var').value = action?.varName || '';
  document.getElementById('am-item-level').checked = action?.itemLevel || false;
  renderAmConditions(action?.conditions || []);
  renderAmEffects(action?.effects || []);
  document.getElementById('action-modal-overlay').classList.add('open');
  populateVarSelects();
}

function renderAmConditions(conditions) {
  const root = document.getElementById('am-conditions');
  root.innerHTML = conditions.length
    ? conditions.map((c, i) => `
      <div class="am-row">
        <input class="am-cond-var" value="${c.var || ''}" placeholder="ключ" style="flex:1">
        <select class="am-cond-op">${COND_OPS.map(op => `<option${c.op === op ? ' selected' : ''}>${op}</option>`).join('')}</select>
        <input class="am-cond-val" value="${c.value || ''}" placeholder="значение" style="flex:1">
        <button class="btn btn-sm btn-danger am-del-cond" data-i="${i}">✕</button>
      </div>`).join('')
    : '<div style="color:var(--text3);font-size:12px;">Нет условий — кнопка всегда активна</div>';
  root.querySelectorAll('.am-del-cond').forEach(btn => {
    btn.onclick = () => { const c = readAmConditions(); c.splice(Number(btn.dataset.i), 1); renderAmConditions(c); };
  });
}

function renderAmEffects(effects) {
  const root = document.getElementById('am-effects');
  const opts = config.vars.map(v => `<option value="${v.name}">${v.label} [${v.name}]</option>`).join('');
  root.innerHTML = effects.length
    ? effects.map((e, i) => {
        const isText = e.type === 'add_context' || e.type === 'send_message';
        return `<div class="am-row">
          <select class="am-eff-type" data-i="${i}" style="flex:1.5">
            ${Object.entries(EFFECT_TYPES).map(([k,v]) => `<option value="${k}"${e.type===k?' selected':''}>${v}</option>`).join('')}
          </select>
          ${isText
            ? `<input class="am-eff-text" value="${e.text || e.template || ''}" placeholder="${e.type==='send_message'?'Текст хода ({name} = имя записи)':'Текст контекста'}" style="flex:2">`
            : `<select class="am-eff-var" style="flex:1.5">${opts}</select>`}
          <button class="btn btn-sm btn-danger am-del-eff" data-i="${i}">✕</button>
        </div>`;
      }).join('')
    : '<div style="color:var(--text3);font-size:12px;">Нет эффектов</div>';
  root.querySelectorAll('.am-del-eff').forEach(btn => {
    btn.onclick = () => { const e = readAmEffects(); e.splice(Number(btn.dataset.i), 1); renderAmEffects(e); };
  });
  root.querySelectorAll('.am-eff-type').forEach(sel => {
    sel.onchange = () => renderAmEffects(readAmEffects());
  });
}

function readAmConditions() {
  return [...document.querySelectorAll('#am-conditions .am-row')].map(row => ({
    var: row.querySelector('.am-cond-var')?.value.trim() || '',
    op: row.querySelector('.am-cond-op')?.value || '>=',
    value: row.querySelector('.am-cond-val')?.value.trim() || '',
  }));
}

function readAmEffects() {
  return [...document.querySelectorAll('#am-effects .am-row')].map(row => {
    const type = row.querySelector('.am-eff-type')?.value;
    if (type === 'add_context') return { type, text: row.querySelector('.am-eff-text')?.value || '' };
    if (type === 'send_message') return { type, template: row.querySelector('.am-eff-text')?.value || '' };
    return { type, var: row.querySelector('.am-eff-var')?.value.trim() || '', delta: Number(row.querySelector('.am-eff-delta')?.value) || 0 };
  });
}

document.getElementById('am-add-cond').onclick = () => renderAmConditions([...readAmConditions(), { var: '', op: '>=', value: '' }]);
document.getElementById('am-add-eff').onclick = () => renderAmEffects([...readAmEffects(), { type: 'adjust_stat', var: '', delta: 0 }]);
document.getElementById('am-cancel').onclick = () => document.getElementById('action-modal-overlay').classList.remove('open');
document.getElementById('am-save').onclick = () => {
  const action = {
    id: editingActionIdx !== null ? config.actions[editingActionIdx].id : newActionId(),
    label: document.getElementById('am-label').value.trim() || 'Действие',
    varName: document.getElementById('am-var').value.trim(),
    itemLevel: document.getElementById('am-item-level').checked,
    conditions: readAmConditions().filter(c => c.var),
    effects: readAmEffects().filter(e => e.type),
  };
  if (editingActionIdx !== null) config.actions[editingActionIdx] = action;
  else config.actions.push(action);
  document.getElementById('action-modal-overlay').classList.remove('open');
  renderActionsEditor();
};

// ── Trigger add ───────────────────────────────
document.getElementById('trg-event').onchange = function() {
  const needsVal = ['gte', 'lte', 'eq'].includes(this.value);
  document.getElementById('trg-event-value-row').style.display = needsVal ? '' : 'none';
};
document.getElementById('trg-eff-type').onchange = function() {
  const isText = ['add_context', 'send_message'].includes(this.value);
  document.getElementById('trg-eff-var-row').style.display = isText ? 'none' : '';
  document.getElementById('trg-eff-text-row').style.display = isText ? '' : 'none';
};
document.getElementById('add-trigger-btn').onclick = () => {
  const varName = document.getElementById('trg-var').value.trim();
  if (!varName) { alert('Укажи переменную для триггера'); return; }
  const effType = document.getElementById('trg-eff-type').value;
  let effect;
  if (effType === 'add_context') effect = { type: effType, text: document.getElementById('trg-eff-text').value.trim() };
  else if (effType === 'send_message') effect = { type: effType, template: document.getElementById('trg-eff-text').value.trim() };
  else effect = { type: effType, var: document.getElementById('trg-eff-var').value.trim(), delta: Number(document.getElementById('trg-eff-delta').value) || 0 };
  config.triggers = config.triggers || [];
  config.triggers.push({
    id: newTriggerId(),
    varName,
    event: document.getElementById('trg-event').value,
    eventValue: document.getElementById('trg-event-value').value.trim(),
    conditions: [],
    effects: [effect],
    repeat: document.getElementById('trg-repeat').checked,
  });
  renderTriggersEditor();
};

// ── Init ──────────────────────────────────────
config.actions = config.actions || [];
config.triggers = config.triggers || [];
renderActionsEditor();
renderTriggersEditor();

// ══════════════════════════════════════════════
// WORLD MEMORY CONSTRUCTOR
// ══════════════════════════════════════════════

let wmEditingIdx = null;
let wmIdCounter = 1;
function newWmId() { return 'wm_' + (wmIdCounter++); }

const WM_PRESETS = {
  enemy: {
    name: 'Враг', tag: 'enemy', actionLabel: 'Атаковать',
    createPrompt: 'Опиши существо: HP, КБ, инициатива, атаки с уроном, особые способности, слабости.',
    usePrompt: 'Скопируй характеристики этого существа в боевую сводку (battlelog) через delta.',
    immutable: true, sendList: true,
  },
  char: {
    name: 'Персонаж', tag: 'char', actionLabel: 'Говорить',
    createPrompt: 'Опиши персонажа: имя, роль, внешность, отношение к игроку, ключевая информация которую он знает.',
    usePrompt: 'Веди диалог с учётом описания этого персонажа. Обнови запись если что-то изменилось.',
    immutable: false, sendList: false,
  },
  loc: {
    name: 'Локация', tag: 'loc', actionLabel: 'Перейти',
    createPrompt: 'Опиши локацию: атмосфера, ключевые объекты, выходы, кто здесь может быть.',
    usePrompt: 'Опиши переход в эту локацию с учётом её описания. Обнови если что-то изменилось.',
    immutable: false, sendList: false,
  },
  trade: {
    name: 'Торговец', tag: 'trade', actionLabel: 'Торговать',
    createPrompt: 'Опиши торговца: ассортимент товаров, цены, валюта, особые условия.',
    usePrompt: 'Открой торговый диалог с учётом ассортимента. Обнови если товары изменились.',
    immutable: false, sendList: false,
  },
};

function renderWmList() {
  const root = document.getElementById('wm-categories-list');
  if (!root) return;
  root.innerHTML = '';
  if (!(config.worldMemory || []).length) {
    root.innerHTML = '<div style="color:var(--text3);font-size:12px;">Нет категорий — добавь предустановку или создай свою</div>';
    return;
  }
  config.worldMemory.forEach((m, idx) => {
    const el = document.createElement('div');
    el.className = 'var-card';
    el.innerHTML = `
      <div class="var-card-header">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="var-tag tag-entry">${m.tag}</span>
          <span class="var-name">${m.name}</span>
          <span style="font-size:11px;color:var(--text3);">действие: ${m.actionLabel}${m.immutable ? ' · не изменять' : ''}${m.sendList ? ' · список' : ''}</span>
        </div>
        <div class="var-card-actions">
          <button class="btn btn-sm edit-wm-btn" data-idx="${idx}">✎</button>
          <button class="btn btn-danger btn-sm del-wm-btn" data-idx="${idx}">✕</button>
        </div>
      </div>`;
    root.appendChild(el);
  });
  root.querySelectorAll('.del-wm-btn').forEach(btn => {
    btn.onclick = () => { config.worldMemory.splice(Number(btn.dataset.idx), 1); renderWmList(); };
  });
  root.querySelectorAll('.edit-wm-btn').forEach(btn => {
    btn.onclick = () => openWmModal(Number(btn.dataset.idx));
  });
}

function openWmModal(idx = null, preset = null) {
  wmEditingIdx = idx;
  const m = idx !== null ? config.worldMemory[idx] : preset || {};
  document.getElementById('wm-name').value = m.name || '';
  document.getElementById('wm-tag').value = m.tag || '';
  document.getElementById('wm-action').value = m.actionLabel || '';
  document.getElementById('wm-desc').value = m.desc || '';
  document.getElementById('wm-create').value = m.createPrompt || '';
  document.getElementById('wm-use').value = m.usePrompt || '';
  document.getElementById('wm-immutable').checked = m.immutable || false;
  document.getElementById('wm-sendlist').checked = m.sendList || false;
  document.getElementById('wm-modal-overlay').classList.add('open');
}

['enemy','char','loc','trade'].forEach(key => {
  const btn = document.getElementById(`wm-preset-${key}`);
  if (btn) btn.onclick = () => {
    if (config.worldMemory.some(m => m.tag === WM_PRESETS[key].tag)) {
      alert(`Категория "${WM_PRESETS[key].tag}" уже добавлена`); return;
    }
    config.worldMemory.push({ id: newWmId(), ...WM_PRESETS[key] });
    renderWmList();
  };
});

config.worldMemory = config.worldMemory || [];
renderWmList();
