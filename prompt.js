// ══════════════════════════════════════════════
// prompt.js
// ══════════════════════════════════════════════

// ── Предброски: криптослучайные числа 0.000–0.999 на один ход ──
const ROLLS_PER_TURN = 8;

function generateTurnRolls() {
  const buf = new Uint32Array(ROLLS_PER_TURN);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => (n % 1000) / 1000); // равномерно 0.000–0.999
}

function buildSystemPrompt(dry) {
  const TYPE_INSTRUCTIONS = `ТИПЫ ПЕРЕМЕННЫХ И ФОРМАТ DELTA:
• stat    — число. delta: "key": 15
• resource — число или "текущее/макс" (макс может отсутствовать).
             delta: "key": "8/10" (с макс) или "key": 8 (без макс)
             Относительное изменение: "key": {"add": -3} (предпочтительно; для ресурсов с инкамом — единственный способ)
             Изменить максимум: "key": {"add": 0, "max_add": 1} — тоже относительно.
             Не добавляй максимум, если его не было изначально.
• skill   — навыки. Уровень считает ИГРА, ты шлёшь только pct_add.
            delta: "key": [{"upsert":{"name":"...","pct_add":15}}, {"remove":"имя"}, ...]
            Новый навык — тоже upsert с pct_add, игра создаст его сама.
• list    — простой список имён.
            delta: "key": [{"upsert":{"name":"..."}}, {"remove":"имя"}, ...]
• entry   — записи с эффектом и тегами.
            tags — произвольные метки.
            delta: "key": [{"upsert":{"name":"...","effect":"...","tags":["..."]}}, {"remove":"имя"}, ...]
• notes   — твоя долгосрочная память (игрок не видит). Макс ${MAX_NOTES}, weight 1-10.
            ТОЛЬКО ФАКТЫ-СОСТОЯНИЯ мира, актуальные и сейчас: «Борг знает, что герой — шпион»,
            «дверь подвала заперта, ключ у капитана». СОБЫТИЯ («герой подрался в таверне») сюда
            НЕ пиши — для событий есть поле "chronicle". Факт устарел — remove или перезапиши.
            delta: "key": [{"upsert":{"name":"id","text":"...","weight":7}}, {"remove":"id"}, ...]
• Очистить массив целиком: "key": {"clear": true}`;

  const varList = config.vars.map(v => {
    let line = `  [${v.name}] ${v.type}`;
    if (v.label && v.label !== v.name) line += ` — ${v.label}`;
    if (v.desc) line += `: ${v.desc}`;
    if (v.type === 'resource' && Number(v.incomeAmount)) line += ` | Автоинкам: ${Number(v.incomeAmount) > 0 ? '+' : ''}${v.incomeAmount} каждые ${Number(v.incomeEvery) > 0 ? v.incomeEvery : 1} ${config.timeUnitName} (начисляет игра)`;
    if (v.type === 'resource' && v.income) line += ` | Инкам: ${v.income}`;
    return line;
  }).join('\n');

  const notesVars = config.vars.filter(v => v.type === 'notes').map(v => v.name);
  const storyInstruction = dry
    ? 'РЕЖИМ: сухой. Только факты — что произошло, результат броска. 2-3 предложения максимум.'
    : '1-2 абзаца, быстрый темп.';

  // Random numbers instruction block
  const rngBlock = `
СЛУЧАЙНОСТЬ — ПРЕДБРОСКИ:
Каждый ход контекст содержит строку R: [...] — ${ROLLS_PER_TURN} случайных чисел 0.000–0.999 от игры.
Это ЕДИНСТВЕННЫЙ источник случайности. Никогда не выдумывай случайные числа сам.
• Бери числа СТРОГО по порядку, слева направо. Одно число — одно случайное событие. Неиспользованные сгорают.
• Универсальные преобразования (R — очередное число):
  — Кубик дX: floor(R × X) + 1. Пример: R=0.734 → д20 = 15, д6 = 5.
  — Шанс P%: успех, если R × 100 < P. Пример: шанс 30%, R=0.081 → 8.1 < 30 → успех.
  — Выбор из N вариантов: вариант № floor(R × N) + 1.
  — Диапазон A..B: A + floor(R × (B − A + 1)).
• Этим покрывается ЛЮБАЯ механика из правил игрока: кубики любых граней, проценты, таблицы, интервалы.
• В "desc" каждого броска указывай использованное R и расчёт: "[R=0.734 → д20: 15, +3 = 18 vs DC15] — успех".
  Расчёт должен быть проверяем. Результат броска ОБЯЗАТЕЛЕН к честному применению, даже если ломает драму.
• Сначала реши, ЧТО проверяется и по какой формуле, потом бери число — не наоборот.`;

  // Timer instructions block
  let timerBlock = '';
  if (config.timersEnabled) {
    timerBlock = `
СИСТЕМА ТАЙМЕРОВ (АКТИВНА):
Единица времени: «${config.timeUnitName}» = ${config.timeUnitSeconds} сек.
• Каждый ход указывай "time_elapsed": N — сколько СЕКУНД прошло (не единиц!).
  Ориентир: короткое действие ≈ ${Math.round(config.timeUnitSeconds / 4)}, один «${config.timeUnitName}» = ${config.timeUnitSeconds}.
• Создать: "new_timers": [{"name": "уникальное_имя", "duration": N, "event": "что случится"}] — на всё, что требует времени (яды, эффекты, перезарядки, отложенные события).
• Истёкший таймер в контексте: обязан отреагировать на событие и удалить через "remove_timers": ["имя"] — иначе он будет напоминать о себе каждый ход.

СИСТЕМА ИНКАМОВ (пассивный доход, АКТИВНА):
Всю математику инкамов (начисления, кратность, перенос остатка) считает ИГРА по time_elapsed.
• НИКОГДА не начисляй инкам через delta — это двойное начисление. Уже начисленное видишь в контексте — просто отражай в нарративе.
• Ресурс с активным инкамом меняй ТОЛЬКО относительно: "mana": {"add": -3}. Абсолютные значения ("mana": "2/10") игра ОТКЛОНЯЕТ — актуального числа ты не знаешь.
• Новый источник пассивного дохода/расхода по сюжету:
  "new_incomes": [{"name": "уникальное_имя", "var": "ключ_ресурса", "amount": 5, "every": 2}]
  (amount может быть отрицательным — упкип; every — раз в сколько ${config.timeUnitName}; тот же name = перезапись).
  Источник потерян: "remove_incomes": ["имя"].
• ЛЮБОЙ периодический эффект (регенерация, кровотечение, яд, доход, аура) — это ВСЕГДА инкам.
  Запись в entry/list — лишь описание для игрока, она ничего не начисляет. Создал эффект «+X за ход» —
  в том же ответе добавь new_incomes; снял эффект — удали и запись, и инкам.`;
  }

  // Response format
  const timerFields = config.timersEnabled
    ? `  "time_elapsed": ${config.timeUnitSeconds},
  "new_timers": [{"name": "уникальное_имя", "duration": 5, "event": "что случится"}],
  "remove_timers": ["имя_таймера"],
  "new_incomes": [{"name": "имя_источника", "var": "ключ_ресурса", "amount": 5, "every": 2}],
  "remove_incomes": ["имя_источника"],`
    : '';

  return `Ты — Мастер RPG. Текстовая игра на русском. Твоё поведение и характер: ${config.dmPersonality || 'нейтральный, объективный мастер'}. ${storyInstruction}

ПЕРСОНАЖ: ${config.story || '(не задан)'}

ПРАВИЛА: ${config.rules || '(стандартные RPG)'}

${TYPE_INSTRUCTIONS}
${rngBlock}
${timerBlock}
ПЕРЕМЕННЫЕ ИГРЫ:
${varList || '(нет)'}

ПРАВИЛА DELTA:
— delta: только изменившиеся поля
— ВАЖНО: все ключи delta — ПЛОСКИЕ. Никакой вложенности.
— Не трогай stat/resource без явного игрового события.${notesVars.length ? `\n— ${notesVars.join(', ')} — только для тебя.` : ''}
— Очистить и заполнить заново: "key": {"clear": true, "upsert": [{...}, {...}]}

ФОРМАТ ОТВЕТА — строго валидный JSON, без markdown, без текста вне JSON:
{
  "story": "Нарратив до бросков",
  "rolls": [
    {"desc": "[R=0.734 → д20: 15 + мод 3 = 18 vs DC15] — результат", "outcome": "Последствия (опционально)"}
  ],
  "story_append": "Финал после бросков (опционально)",
  "chronicle": "1-2 предложения: главное, что произошло в этом ходу (сухие факты, без художеств)",
  "delta": {"ключ": значение},${timerFields}
}
rolls может быть пустым []. story и chronicle всегда заполнены. Все строки — без вложенного JSON.
chronicle — это летопись: она переживёт окно истории, по ней ты будешь вспоминать прошлое. Пиши так, чтобы через 50 ходов было понятно.
rolls: не жди броска от игрока — бери очередное R из предбросков, считай по формуле и сразу пиши итог.
JSON должен быть полностью закрыт: перед отправкой проверь баланс скобок.`;
}

function buildContextMessage() {
  const gameLines = [];
  for (const v of config.vars) {
    if (v.type === 'notes') continue;
    const val = gameState[v.name];
    if (Array.isArray(val) && val.length === 0) continue;
    if (val === '' || val === null || val === undefined) continue;
    gameLines.push(`${v.name}: ${JSON.stringify(val)}`);
  }

  let result = `GAMESTATE:\n${gameLines.join('\n')}`;

  // Fresh random pre-rolls for this turn
  const turnRolls = generateTurnRolls();
  result += `\n\nR: [${turnRolls.map(r => r.toFixed(3)).join(', ')}]  (предброски хода — использовать по порядку)`;

  // Active and expired timers
  if (config.timersEnabled && timers.length) {
    const activeTimers = timers.filter(t => !t.fired);
    const firedTimers  = timers.filter(t =>  t.fired);
    if (activeTimers.length) {
      result += '\n\nАКТИВНЫЕ ТАЙМЕРЫ:\n';
      result += activeTimers.map(t => {
        const rem = (t.remainingSeconds / config.timeUnitSeconds).toFixed(1);
        return `  "${t.name}": ${rem} ${config.timeUnitName} → ${t.event}`;
      }).join('\n');
    }
    if (firedTimers.length) {
      result += '\n\n⚠ ИСТЁКШИЕ ТАЙМЕРЫ (ОБЯЗАТЕЛЬНО отреагируй на событие и удали через remove_timers):\n';
      result += firedTimers.map(t => `  "${t.name}": ${t.event}`).join('\n');
    }
  }

  // Active incomes
  if (config.timersEnabled && typeof incomes !== 'undefined' && incomes.length) {
    result += '\n\nАКТИВНЫЕ ИНКАМЫ (начисляет игра, НЕ дублируй в delta):\n';
    result += incomes.map(i => {
      const carry = i.carrySeconds ? ` | накоплено ${(i.carrySeconds / config.timeUnitSeconds).toFixed(1)} ${config.timeUnitName}` : '';
      return `  "${i.name}": ${i.amount > 0 ? '+' : ''}${i.amount} ${i.varName} каждые ${i.everyUnits} ${config.timeUnitName}${carry}`;
    }).join('\n');
  }

  // Chronicle: сжатая летопись прошлого (то, что за пределами окна истории)
  if (chronicleSummary || chronicle.length) {
    result += '\n\nХРОНИКА (что было раньше):';
    if (chronicleSummary) result += `\n${chronicleSummary}`;
    if (chronicle.length) result += `\n${chronicleRawText()}`;
  }

  // Notes
  const allNotes = [...notes];
  for (const v of config.vars.filter(v => v.type === 'notes')) {
    const arr = Array.isArray(gameState[v.name]) ? gameState[v.name] : [];
    allNotes.push(...arr);
  }
  if (allNotes.length) {
    result += '\nNOTES:\n' + allNotes.sort((a, b) => b.weight - a.weight).map(n => `[${n.weight}] ${n.text}`).join('\n');
  }

  // Pending context notes from triggers/actions
  if (typeof pendingContextNotes !== 'undefined' && pendingContextNotes.length) {
    result += '\n[СИСТЕМА]:\n' + pendingContextNotes.join('\n');
    pendingContextNotes = [];
  }

  return result;
}
