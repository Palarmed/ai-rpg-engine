// ══════════════════════════════════════════════
// state.js
// ══════════════════════════════════════════════

let apiKey = '';
let config = {
  story: '',
  rules: '',
  dmPersonality: '',
  vars: [],
  sections: [],
  actions: [],   // { id, label, varName, itemLevel, conditions, effects }
  triggers: [],  // { id, varName, event, eventValue, conditions, effects, repeat }
  model: 'claude-sonnet-4-6',
  maxTokens: 1200,
  backend: 'anthropic',
  orKey: '',
  orModel: 'meta-llama/llama-3.3-70b-instruct:free',
  oaiKey: '',
  oaiModel: 'gpt-5.4-mini',
  // Timer settings
  timersEnabled: false,
  timeUnitName: 'Раунд',
  timeUnitSeconds: 360,
};

let gameState = {};
let slideHistory = [];
const MAX_SLIDE = 4;
let notes = [];
let noteIdCounter = 0;
const MAX_NOTES = 12;
let dryMode = false;
let requestLog = [];

// ── Chronicle: сжатая сводка событий за пределами скользящего окна ──
let chronicle = [];          // [{turn, text}] — по 1-2 предложения на ход, пишет модель
let chronicleSummary = '';   // сжатая старая часть хроники
let turnCounter = 0;
const CHRONICLE_CHAR_BUDGET = 2500; // порог сырых записей, дальше — автосжатие

function chronicleAppend(text) {
  const t = String(text || '').trim();
  if (!t) return;
  chronicle.push({ turn: ++turnCounter, text: t });
}

function chronicleRawText() {
  return chronicle.map(c => `[ход ${c.turn}] ${c.text}`).join('\n');
}

function chronicleNeedsCompression() {
  return chronicleRawText().length > CHRONICLE_CHAR_BUDGET;
}

// ── Timer state ───────────────────────────────
let timers = []; // { id, name, remainingSeconds, totalSeconds, event, fired }
let timerIdCounter = 0;

// ── Income state ──────────────────────────────
// { id, name, varName, amount, everyUnits, source: 'player'|'model', carrySeconds }
let incomes = [];
let incomeIdCounter = 0;

// ── Init ─────────────────────────────────────
function initGameState() {
  gameState = {};
  for (const v of config.vars) {
    if (v.type === 'stat') {
      gameState[v.name] = v.init !== '' ? (isNaN(Number(v.init)) ? v.init : Number(v.init)) : 0;
    } else if (v.type === 'resource') {
      gameState[v.name] = (v.init !== undefined && v.init !== '') ? v.init : '0';
    } else {
      gameState[v.name] = []; // skill, list, entry, notes
    }
  }
}

// ── Timer functions ───────────────────────────
function addTimer(name, durationUnits, event) {
  const totalSec = durationUnits * config.timeUnitSeconds;
  const existing = timers.findIndex(t => t.name === name);
  if (existing !== -1) {
    // Reset existing timer
    timers[existing].remainingSeconds = totalSec;
    timers[existing].totalSeconds = totalSec;
    timers[existing].event = event || timers[existing].event;
    timers[existing].fired = false;
    return;
  }
  timers.push({
    id: ++timerIdCounter,
    name,
    durationUnits,
    remainingSeconds: totalSec,
    totalSeconds: totalSec,
    event,
    fired: false
  });
}

function removeTimer(name) {
  const idx = timers.findIndex(t => t.name === name);
  if (idx !== -1) timers.splice(idx, 1);
}

function tickTimers(elapsedUnits) {
  if (!config.timersEnabled || !elapsedUnits || elapsedUnits <= 0) return;
  const elapsedSeconds = elapsedUnits * config.timeUnitSeconds;
  for (const t of timers) {
    if (t.fired) continue;
    t.remainingSeconds -= elapsedSeconds;
    if (t.remainingSeconds <= 0) {
      t.remainingSeconds = 0;
      t.fired = true;
    }
  }
}

function getExpiredTimers() {
  return timers.filter(t => t.fired);
}

// ── Income engine ─────────────────────────────
// Детерминированная математика: считает игра, не модель.
function adjustResourceValue(varName, delta, maxDelta) {
  const varDef = config.vars.find(v => v.name === varName);
  if (!varDef) return false;
  if (varDef.type === 'stat') {
    gameState[varName] = (Number(gameState[varName]) || 0) + Number(delta);
    return true;
  }
  if (varDef.type !== 'resource') return false;
  const rawVal = String(gameState[varName] ?? '0');
  const hasMax = rawVal.includes('/');
  const parts = rawVal.split('/');
  let cur = Number(parts[0]) || 0;
  if (hasMax) {
    let max = Number(parts[1]) || 0;
    if (maxDelta !== undefined && isFinite(Number(maxDelta))) max = Math.max(0, max + Number(maxDelta));
    cur = Math.max(0, Math.min(max, cur + (Number(delta) || 0)));
    gameState[varName] = `${cur}/${max}`;
  } else {
    // max_add на ресурсе без максимума игнорируем — максимум не создаём
    cur = Math.max(0, cur + (Number(delta) || 0));
    gameState[varName] = String(cur);
  }
  return true;
}

function addIncome(name, varName, amount, everyUnits, source) {
  amount = Number(amount);
  everyUnits = Number(everyUnits);
  if (!name || !varName || !isFinite(amount) || amount === 0) return false;
  if (!isFinite(everyUnits) || everyUnits <= 0) everyUnits = 1;
  const varDef = config.vars.find(v => v.name === varName);
  if (!varDef || (varDef.type !== 'resource' && varDef.type !== 'stat')) return false;
  const existing = incomes.find(i => i.name === name);
  if (existing) {
    // Обновление существующего источника (модель может «улучшить лесопилку»)
    existing.varName = varName;
    existing.amount = amount;
    existing.everyUnits = everyUnits;
    return true;
  }
  incomes.push({
    id: ++incomeIdCounter,
    name, varName, amount, everyUnits,
    source: source || 'model',
    carrySeconds: 0
  });
  return true;
}

function removeIncome(name) {
  const idx = incomes.findIndex(i => i.name === name);
  if (idx !== -1) { incomes.splice(idx, 1); return true; }
  return false;
}

// Инициализация инкамов, заданных игроком в переменных
function initIncomesFromVars() {
  incomes = incomes.filter(i => i.source !== 'player');
  for (const v of config.vars) {
    if (v.type !== 'resource') continue;
    const amt = Number(v.incomeAmount);
    if (!isFinite(amt) || amt === 0) continue;
    const every = Number(v.incomeEvery) > 0 ? Number(v.incomeEvery) : 1;
    addIncome(`инкам:${v.name}`, v.name, amt, every, 'player');
  }
}

// Тик инкамов на elapsed секунд. Возвращает список начислений.
// Кратность учитывается автоматически: 12000с при юните 4000с = 3 срабатывания
// для инкама «каждый 1 ход», и 1 срабатывание (+перенос 4000с) для «каждые 2 хода».
function tickIncomes(elapsedSeconds) {
  const applied = [];
  if (!config.timersEnabled || !elapsedSeconds || elapsedSeconds <= 0) return applied;
  for (const inc of incomes) {
    const periodSeconds = inc.everyUnits * config.timeUnitSeconds;
    if (periodSeconds <= 0) continue;
    inc.carrySeconds = (inc.carrySeconds || 0) + elapsedSeconds;
    const times = Math.floor(inc.carrySeconds / periodSeconds);
    if (times <= 0) continue;
    inc.carrySeconds -= times * periodSeconds;
    const total = inc.amount * times;
    if (adjustResourceValue(inc.varName, total)) {
      applied.push({ name: inc.name, varName: inc.varName, amount: inc.amount, times, total });
    }
  }
  return applied;
}

// ── Delta ────────────────────────────────────
function applyPatchOps(arr, ops, varType) {
  if (!Array.isArray(ops)) ops = [ops];
  const levelups = [];
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (op.upsert) {
      const item = op.upsert;
      const idx = arr.findIndex(i => i.name === item.name);
      if (varType === 'skill') {
        if (idx !== -1) {
          const skill = arr[idx];
          if (item.pct_add !== undefined) {
            let pct = (skill.pct || 0) + Number(item.pct_add);
            let level = skill.level || 1;
            while (pct >= 100) { pct -= 100; level++; levelups.push({ skillName: item.name, newLevel: level }); }
            arr[idx] = { ...skill, level, pct: Math.max(0, Math.min(99, Math.round(pct))) };
          } else {
            const safe = { ...item }; delete safe.level;
            arr[idx] = { ...skill, ...safe };
          }
        } else {
          let pct = Number(item.pct_add) || 0; let level = 1;
          while (pct >= 100) { pct -= 100; level++; levelups.push({ skillName: item.name, newLevel: level }); }
          arr.push({ name: item.name, level, pct: Math.max(0, Math.min(99, Math.round(pct))) });
        }
      } else {
        if (idx !== -1) arr[idx] = { ...arr[idx], ...item };
        else arr.push(item);
      }
    } else if (op.remove) {
      const idx = arr.findIndex(i => i.name === op.remove);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }
  return levelups;
}

function applyDelta(delta) {
  if (!delta) return [];
  const ARRAY_TYPES = new Set(['skill', 'list', 'entry', 'notes']);
  const allLevelups = [];
  const changedVars = [];
  for (const [key, val] of Object.entries(delta)) {
    const varDef = config.vars.find(v => v.name === key);
    if (!varDef) continue;

    if (ARRAY_TYPES.has(varDef.type)) {
      if (!Array.isArray(gameState[key])) gameState[key] = [];

      if (Array.isArray(val) && val.some(v => v?.clear === true)) {
        gameState[key] = [];
        const rest = val.filter(v => !v?.clear);
        if (rest.length) allLevelups.push(...applyPatchOps(gameState[key], rest, varDef.type));
        changedVars.push(key);
        continue;
      }

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (val.clear === true) gameState[key] = [];
        if (val.upsert) {
          const ops = Array.isArray(val.upsert)
            ? val.upsert.map(i => ({ upsert: i }))
            : [{ upsert: val.upsert }];
          allLevelups.push(...applyPatchOps(gameState[key], ops, varDef.type));
        }
        if (val.remove) {
          const removes = Array.isArray(val.remove) ? val.remove : [val.remove];
          removes.forEach(name => {
            const idx = gameState[key].findIndex(i => i.name === name);
            if (idx !== -1) gameState[key].splice(idx, 1);
          });
        }
        continue;
      }
      if (val && typeof val === 'object' && !Array.isArray(val) && val.clear === true) {
        gameState[key] = []; continue;
      }
      if (Array.isArray(val)) {
        const isOps = val.length === 0 || (val[0] && (val[0].upsert || val[0].remove));
        if (isOps) allLevelups.push(...applyPatchOps(gameState[key], val, varDef.type));
        else {
          for (const item of val) {
            if (typeof item === 'string') {
              if (!gameState[key].find(i => i.name === item)) gameState[key].push({ name: item });
              continue;
            }
            const idx = gameState[key].findIndex(i => i.name === item.name);
            if (idx !== -1) gameState[key][idx] = { ...gameState[key][idx], ...item };
            else gameState[key].push(item);
          }
        }
      } else if (val && typeof val === 'object') {
        allLevelups.push(...applyPatchOps(gameState[key], val, varDef.type));
      }
    } else {
      // Относительное изменение: {"add": N, "max_add": M} — для stat и resource
      if (val && typeof val === 'object' && !Array.isArray(val) && (val.add !== undefined || val.max_add !== undefined)) {
        adjustResourceValue(key, Number(val.add) || 0, val.max_add !== undefined ? Number(val.max_add) : undefined);
        changedVars.push(key);
        continue;
      }
      if (typeof val !== 'object' || val === null) {
        // Ресурс с активным инкамом: абсолютные значения от модели игнорируем —
        // модель не знает актуального числа (устаревшее затирание / двойной счёт).
        const hasIncome = varDef.type === 'resource' && incomes.some(i => i.varName === key);
        if (hasIncome) {
          if (typeof addMsg === 'function') {
            addMsg(`[⚠ delta "${key}": ${JSON.stringify(val)} проигнорирована — у ресурса активный инкам, используй {"add": N}]`, 'msg-sys');
          }
          pendingContextNotes.push(`ОШИБКА: delta "${key}" с абсолютным значением отклонена. У "${key}" активный инкам — меняй ТОЛЬКО относительно: "${key}": {"add": -3}, максимум — {"max_add": 1}. Текущее значение считает игра.`);
          continue;
        }
        gameState[key] = val;
      }
    }
    changedVars.push(key);
  }
  // Fire triggers
  const triggerResults = evaluateTriggers(changedVars);
  if (triggerResults.contextNotes.length) pendingContextNotes.push(...triggerResults.contextNotes);
  if (triggerResults.sendMsgs.length) {
    setTimeout(() => {
      triggerResults.sendMsgs.forEach(msg => {
        addMsg(`[триггер] ${msg}`, 'msg-sys');
        callDM(msg);
      });
    }, 100);
  }
  return allLevelups;
}

// ── Notes ────────────────────────────────────
function addNote(text, weight) {
  notes.push({ id: ++noteIdCounter, text, weight: Math.min(10, Math.max(1, weight)) });
  while (notes.length > MAX_NOTES) {
    let minIdx = 0;
    for (let i = 1; i < notes.length; i++) {
      if (notes[i].weight < notes[minIdx].weight) minIdx = i;
    }
    notes.splice(minIdx, 1);
  }
}

function pushHistory(userMsg, assistantRaw) {
  let storyText = assistantRaw;
  try {
    const parsed = JSON.parse(assistantRaw.replace(/```json|```/g, '').trim());
    const parts = [];
    if (parsed.story) parts.push(parsed.story);
    if (parsed.rolls) parsed.rolls.forEach(r => { if (r.outcome) parts.push(r.outcome); });
    if (parsed.story_append) parts.push(parsed.story_append);
    storyText = parts.join(' ');
  } catch {}
  slideHistory.push({ role: 'user', content: userMsg });
  slideHistory.push({ role: 'assistant', content: storyText });
  while (slideHistory.length > MAX_SLIDE) slideHistory.shift();
}

// ══════════════════════════════════════════════
// ACTIONS & TRIGGERS ENGINE
// ══════════════════════════════════════════════

let pendingContextNotes = [];

function evalCondition(cond) {
  const val = gameState[cond.var];
  const varDef = config.vars.find(v => v.name === cond.var);
  if (!varDef) return false;
  if (cond.op === 'record_exists') {
    return Array.isArray(val) && val.some(i => i.name === cond.value);
  }
  let numVal;
  if (varDef.type === 'resource') {
    numVal = Number(String(val || '0').split('/')[0]);
  } else {
    numVal = Number(val);
  }
  const compareVal = Number(cond.value);
  if (cond.op === '>=') return numVal >= compareVal;
  if (cond.op === '<=') return numVal <= compareVal;
  if (cond.op === '==') return numVal === compareVal;
  if (cond.op === '>') return numVal > compareVal;
  if (cond.op === '<') return numVal < compareVal;
  return false;
}

function evalConditions(conditions) {
  if (!conditions || !conditions.length) return true;
  return conditions.every(evalCondition);
}

function applyEffect(effect, recordName) {
  const varDef = config.vars.find(v => v.name === effect.var);
  if (effect.type === 'adjust_stat') {
    if (!varDef || varDef.type !== 'stat') return null;
    gameState[effect.var] = (Number(gameState[effect.var]) || 0) + Number(effect.delta);
    return null;
  }
  if (effect.type === 'adjust_resource') {
    if (!varDef || varDef.type !== 'resource') return null;
    const rawVal = String(gameState[effect.var] ?? '0');
    const hasMax = rawVal.includes('/');
    const parts = rawVal.split('/');
    let cur = Number(parts[0]) || 0;
    if (hasMax) {
      const max = Number(parts[1]) || 0;
      cur = Math.max(0, Math.min(max, cur + Number(effect.delta)));
      gameState[effect.var] = `${cur}/${max}`;
    } else {
      cur = Math.max(0, cur + Number(effect.delta));
      gameState[effect.var] = String(cur);
    }
    return null;
  }
  if (effect.type === 'adjust_resource_max') {
    if (!varDef || varDef.type !== 'resource') return null;
    const rawVal = String(gameState[effect.var] ?? '0');
    const hasMax = rawVal.includes('/');
    const parts = rawVal.split('/');
    const cur = Number(parts[0]) || 0;
    const oldMax = hasMax ? (Number(parts[1]) || 0) : 0;
    const newMax = Math.max(0, oldMax + Number(effect.delta));
    gameState[effect.var] = `${cur}/${newMax}`;
    return null;
  }
  if (effect.type === 'add_context') return { contextNote: effect.text || '' };
  if (effect.type === 'send_message') {
    const text = (effect.template || '').replace('{name}', recordName || '');
    return { sendMsg: text };
  }
  return null;
}

function applyEffects(effects, recordName) {
  const results = { contextNotes: [], sendMsgs: [] };
  for (const eff of (effects || [])) {
    const r = applyEffect(eff, recordName);
    if (r?.contextNote) results.contextNotes.push(r.contextNote);
    if (r?.sendMsg) results.sendMsgs.push(r.sendMsg);
  }
  return results;
}

function execAction(actionId, recordName) {
  const action = (config.actions || []).find(a => a.id === actionId);
  if (!action || !evalConditions(action.conditions)) return;
  const results = applyEffects(action.effects, recordName);
  renderSidebar();
  if (results.contextNotes.length) pendingContextNotes.push(...results.contextNotes);
  if (results.sendMsgs.length) {
    results.sendMsgs.forEach(msg => {
      addMsg(`> ${msg}`, 'msg-player');
      callDM(msg);
    });
  }
}

function checkTriggerEvent(trigger) {
  if (trigger._fired && !trigger.repeat) return false;
  const val = gameState[trigger.varName];
  const varDef = config.vars.find(v => v.name === trigger.varName);
  if (!varDef) return false;
  if (trigger.event === 'max_reached' && varDef.type === 'resource') {
    const str = String(val || '0');
    if (!str.includes('/')) return false; // no max defined
    const parts = str.split('/');
    return Number(parts[1]) > 0 && Number(parts[0]) >= Number(parts[1]);
  }
  if (trigger.event === 'min_reached' && varDef.type === 'resource') {
    return Number(String(val || '0').split('/')[0]) <= 0;
  }
  if (trigger.event === 'gte') return Number(val) >= Number(trigger.eventValue);
  if (trigger.event === 'lte') return Number(val) <= Number(trigger.eventValue);
  if (trigger.event === 'eq') return Number(val) === Number(trigger.eventValue);
  return false;
}

function evaluateTriggers(changedVars) {
  const results = { contextNotes: [], sendMsgs: [] };
  for (const trigger of (config.triggers || [])) {
    if (!changedVars.includes(trigger.varName)) continue;
    if (!checkTriggerEvent(trigger)) continue;
    if (!evalConditions(trigger.conditions)) continue;
    const r = applyEffects(trigger.effects);
    results.contextNotes.push(...r.contextNotes);
    results.sendMsgs.push(...r.sendMsgs);
    if (!trigger.repeat) trigger._fired = true;
  }
  return results;
}
