// ══════════════════════════════════════════════
// ui.js
// ══════════════════════════════════════════════

function addMsg(text, cls) {
  const box = document.getElementById('story-box');
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

// ── Sidebar renderer ─────────────────────────
function renderPanel(v) {
  const val = gameState[v.name];
  let html = '';

  if (v.type === 'stat') {
    html = `<div class="sv-stat">
      <span class="sv-stat-name">${v.label}:</span>
      <span class="sv-stat-val">${val ?? '—'}</span>
    </div>`;

  } else if (v.type === 'resource') {
    const safeVal = val ?? v.init ?? '0';
    const valStr = String(safeVal);
    const hasMax = valStr.includes('/');
    const color = v.color || 'var(--green)';
    let barHtml = '';
    if (hasMax) {
      const parts = valStr.split('/');
      const cur = Number(parts[0]) || 0;
      const max = Number(parts[1]) || 1;
      const pct = Math.min(100, Math.round(cur / max * 100));
      barHtml = `<div class="sv-bar-bg"><div class="sv-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
    }
    html = `<div class="sv-resource">
      <div class="sv-resource-header">
        <span class="sv-resource-val" style="color:${color}">${valStr}</span>
      </div>
      ${barHtml}
    </div>`;

  } else if (v.type === 'skill') {
    const arr = Array.isArray(val) ? val : [];
    html = arr.length
      ? arr.map(s => {
          const pct = Math.min(99, s.pct || 0);
          const bonus = Math.floor((s.level || 1) / 2);
          return `<div class="sv-skill">
            <div class="sv-skill-header">
              <span class="sv-skill-name">${s.name}</span>
              <span class="sv-skill-meta">Ур.${s.level}${bonus > 0 ? ` (+${bonus})` : ''} · ${pct}%</span>
            </div>
            <div class="sv-pct-bg"><div class="sv-pct-fill" style="width:${pct}%"></div></div>
          </div>`;
        }).join('')
      : `<div class="sv-empty">нет навыков</div>`;

  } else if (v.type === 'list') {
    const arr = Array.isArray(val) ? val : [];
    html = arr.length
      ? arr.map(item => {
          const name = typeof item === 'string' ? item : item.name;
          return `<div class="sv-list-item"><div class="sv-list-dot"></div>${name}</div>`;
        }).join('')
      : `<div class="sv-empty">пусто</div>`;

  } else if (v.type === 'entry') {
    const arr = Array.isArray(val) ? val : [];
    html = arr.length
      ? arr.map(item => {
          const tagsHtml = Array.isArray(item.tags) && item.tags.length
            ? item.tags.map(t => `<span class="entry-tag">${t}</span>`).join('')
            : '';
          return `<div class="sv-entry-item">
            <div class="sv-entry-header">
              <div class="sv-entry-dot"></div>
              <span class="sv-entry-name">${item.name}</span>
              ${tagsHtml}
            </div>
            ${item.effect ? `<div class="sv-entry-effect">${item.effect}</div>` : ''}
            ${item.desc || item.description ? `<div class="sv-entry-effect">${item.desc || item.description}</div>` : ''}
          </div>`;
        }).join('')
      : `<div class="sv-empty">пусто</div>`;
  }

  const title = v.type === 'stat' ? '' : `<div class="panel-title">${v.label}</div>`;
  const varActions = (config.actions || []).filter(a => a.varName === v.name && !a.itemLevel);
  const actionBtns = varActions.map(a => {
    const enabled = evalConditions(a.conditions);
    return `<button class="action-btn${enabled ? '' : ' disabled'}" onclick="if(${enabled})execAction('${a.id}',null)">${a.label}</button>`;
  }).join('');
  const actionsHtml = actionBtns ? `<div class="action-btns">${actionBtns}</div>` : '';
  return `<div class="panel" data-var="${v.name}">${title}${html}${actionsHtml}</div>`;
}

function renderSections(side) {
  const container = document.getElementById(side === 'left' ? 'sidebar-left' : 'sidebar-right');
  if (!container) return;
  container.innerHTML = '';

  const sideSections = config.sections.filter(s => s.side === side);
  const sideVars = config.vars.filter(v => v.side === side && v.type !== 'notes');

  const unsectioned = sideVars.filter(v => !v.sectionId);
  unsectioned.forEach(v => {
    container.insertAdjacentHTML('beforeend', renderPanel(v));
  });

  sideSections.forEach(sec => {
    const secVars = sideVars.filter(v => v.sectionId === sec.id);
    const secEl = document.createElement('div');
    secEl.className = 'sidebar-section';
    secEl.dataset.sectionId = sec.id;
    secEl.innerHTML = `
      <div class="sidebar-section-header" onclick="toggleSection('${sec.id}')">
        <span class="sidebar-section-arrow" id="arrow-${sec.id}">▾</span>
        <span class="sidebar-section-label">${sec.label}</span>
      </div>
      <div class="sidebar-section-body" id="secbody-${sec.id}">
        ${secVars.map(renderPanel).join('') || '<div class="panel"><div class="sv-empty">пусто</div></div>'}
      </div>`;
    container.appendChild(secEl);
  });
}

function renderSidebar() {
  renderSections('left');
  renderSections('right');
}

window.toggleSection = function(id) {
  const body = document.getElementById('secbody-' + id);
  const arrow = document.getElementById('arrow-' + id);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  arrow.textContent = open ? '▸' : '▾';
};

// ── Timer panel ───────────────────────────────
function renderTimers() {
  const root = document.getElementById('timers-entries');
  if (!root) return;

  // Update button label with counts
  const btn = document.getElementById('timers-toggle-btn');
  if (btn) {
    const activeCount = timers.filter(t => !t.fired).length;
    const firedCount  = timers.filter(t =>  t.fired).length;
    let label = '⏱ таймеры';
    if (timers.length) label += ` (${activeCount}${firedCount ? ` +${firedCount}!` : ''})`;
    btn.textContent = label;
    btn.classList.toggle('active-warn', firedCount > 0);
  }

  root.innerHTML = '';
  if (!timers.length) {
    root.innerHTML = '<span style="color:var(--text3);font-size:11px;padding:6px;">Нет активных таймеров</span>';
    return;
  }
  // Show fired timers first, then active by remaining time
  const sorted = [...timers].sort((a, b) => {
    if (a.fired !== b.fired) return a.fired ? -1 : 1;
    return a.remainingSeconds - b.remainingSeconds;
  });

  sorted.forEach(t => {
    const remUnits = (t.remainingSeconds / config.timeUnitSeconds).toFixed(1);
    const pct = t.totalSeconds > 0
      ? Math.max(0, Math.round(t.remainingSeconds / t.totalSeconds * 100))
      : 0;

    const el = document.createElement('div');
    el.className = `timer-item${t.fired ? ' timer-fired' : ''}`;
    el.innerHTML = `
      <div class="timer-header">
        <span class="timer-name">${t.name}</span>
        <span class="timer-remaining">${t.fired ? '⚠ ИСТЁК' : `${remUnits} ${config.timeUnitName}`}</span>
      </div>
      <div class="timer-bar-bg"><div class="timer-bar-fill" style="width:${pct}%"></div></div>
      <div class="timer-event">${t.event}</div>`;
    root.appendChild(el);
  });
}

// ── Log ──────────────────────────────────────
function addLogEntry(type, label, body) {
  const size = new Blob([body]).size;
  const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
  const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  requestLog.push({ type, label, body, sizeStr, time });

  const MAX_LOG_ENTRIES = 4;
  while (requestLog.length > MAX_LOG_ENTRIES) requestLog.shift();

  const el = document.getElementById('log-entries');
  el.innerHTML = '';
  if (!requestLog.length) {
    el.innerHTML = '<span style="color:var(--text3);font-size:11px;padding:6px;">Пока нет запросов</span>';
    return;
  }
  requestLog.forEach(item => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const badgeClass = item.type === 'req' ? 'badge-req' : item.type === 'res' ? 'badge-res' : 'badge-err';
    const badgeLabel = item.type === 'req' ? 'ЗАПРОС' : item.type === 'res' ? 'ОТВЕТ' : 'ОШИБКА';
    entry.innerHTML = `
      <div class="log-entry-hdr">
        <span class="log-badge ${badgeClass}">${badgeLabel}</span>
        <span class="log-entry-label">${item.label}</span>
        <span class="log-entry-size">${item.sizeStr}</span>
        <span class="log-entry-time">${item.time}</span>
      </div>
      <div class="log-entry-body">${escapeHtml(item.body)}</div>`;
    entry.querySelector('.log-entry-hdr').onclick = () => {
      entry.querySelector('.log-entry-body').classList.toggle('open');
    };
    el.appendChild(entry);
  });
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── SaveLoad ──────────────────────────────────
document.getElementById('save-game-btn').onclick = () => {
  const save = {
    gameState,
    slideHistory,
    notes,
    timers,
    incomes,
    chronicle,
    chronicleSummary,
    turnCounter,
    configVars: config.vars,
    configSections: config.sections,
    story: config.story,
    rules: config.rules,
    dmPersonality: config.dmPersonality,
    savedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rpg_save_${Date.now()}.json`;
  a.click();
};

document.getElementById('load-game-btn').onclick = () => {
  document.getElementById('load-game-input').click();
};

document.getElementById('load-game-input').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const save = JSON.parse(ev.target.result);
      gameState = save.gameState || {};
      slideHistory = save.slideHistory || [];
      notes = save.notes || [];
      timers = save.timers || [];
      incomes = save.incomes || [];
      chronicle = save.chronicle || [];
      chronicleSummary = save.chronicleSummary || '';
      turnCounter = save.turnCounter || 0;
      if (save.configVars) config.vars = save.configVars;
      if (!save.incomes) initIncomesFromVars();
      if (save.configSections) config.sections = save.configSections;
      dedupSectionIds();
      if (save.story) config.story = save.story;
      if (save.rules) config.rules = save.rules;
      if (save.dmPersonality) config.dmPersonality = save.dmPersonality;
      renderSidebar();
      renderTimers();
      renderIncomes();
      addMsg('[Сохранение загружено]', 'msg-sys');
      e.target.value = '';
    } catch { addMsg('Ошибка загрузки сохранения', 'msg-err'); }
  };
  reader.readAsText(file);
};

// ── Event handlers ────────────────────────────
document.getElementById('send-btn').onclick = () => {
  const inp = document.getElementById('action-input');
  const val = inp.value.trim();
  if (!val) return;
  addMsg(`> ${val}`, 'msg-player');
  inp.value = '';
  inp.style.height = 'auto';
  callDM(val);
};

document.getElementById('action-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('send-btn').click(); }
});
document.getElementById('action-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

document.getElementById('dry-toggle-btn').onclick = () => {
  dryMode = !dryMode;
  document.getElementById('dry-toggle-btn').classList.toggle('active', dryMode);
  addMsg(`[режим: ${dryMode ? 'сухой' : 'нарратив'}]`, 'msg-sys');
};

document.getElementById('log-toggle-btn').onclick = () => {
  const panel = document.getElementById('log-panel');
  panel.classList.toggle('open');
  document.getElementById('log-toggle-btn').classList.toggle('active', panel.classList.contains('open'));
};

document.getElementById('log-clear-btn').onclick = () => {
  requestLog = [];
  document.getElementById('log-entries').innerHTML =
    '<span style="color:var(--text3);font-size:11px;padding:6px;">Пока нет запросов</span>';
};

document.getElementById('timers-toggle-btn').onclick = () => {
  const panel = document.getElementById('timers-panel');
  panel.classList.toggle('open');
  const btn = document.getElementById('timers-toggle-btn');
  btn.classList.toggle('active', panel.classList.contains('open'));
};


// ── Incomes panel ─────────────────────────────
function renderIncomes() {
  const root = document.getElementById('incomes-entries');
  if (!root) return;

  const btn = document.getElementById('incomes-toggle-btn');
  if (btn) {
    btn.textContent = incomes.length ? `💰 инкамы (${incomes.length})` : '💰 инкамы';
  }

  if (!incomes.length) {
    root.innerHTML = '<span style="color:var(--text3);font-size:11px;padding:6px;">Нет активных инкамов</span>';
    return;
  }
  root.innerHTML = '';
  incomes.forEach(inc => {
    const varDef = config.vars.find(v => v.name === inc.varName);
    const label = varDef?.label || inc.varName;
    const carry = inc.carrySeconds
      ? ` · накоплено ${(inc.carrySeconds / config.timeUnitSeconds).toFixed(1)}`
      : '';
    const el = document.createElement('div');
    el.className = 'timer-item';
    el.innerHTML = `
      <div class="timer-header">
        <span class="timer-name">💰 ${inc.name}</span>
        <span class="timer-remaining">${inc.amount > 0 ? '+' : ''}${inc.amount} / ${inc.everyUnits} ${config.timeUnitName}</span>
      </div>
      <div class="timer-event">${label}${carry}${inc.source === 'player' ? ' · базовый' : ''}</div>`;
    root.appendChild(el);
  });
}

document.getElementById('incomes-toggle-btn').onclick = () => {
  const panel = document.getElementById('incomes-panel');
  panel.classList.toggle('open');
  document.getElementById('incomes-toggle-btn').classList.toggle('active', panel.classList.contains('open'));
};
