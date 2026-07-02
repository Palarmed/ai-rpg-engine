// ══════════════════════════════════════════════
// api.js — запросы к API и обработка ответов
// ══════════════════════════════════════════════

function applyIncomeTick(parsed) {
  // Вызывается ПОСЛЕ применения delta, чтобы устаревшие абсолютные
  // значения ресурсов из delta не перезатирали начисления игры.
  if (!config.timersEnabled || !parsed.time_elapsed || Number(parsed.time_elapsed) <= 0) return;
  const incomeApplied = tickIncomes(Number(parsed.time_elapsed));
  if (!incomeApplied.length) return;
  const lines = incomeApplied.map(a => {
    const varDef = config.vars.find(v => v.name === a.varName);
    const label = varDef?.label || a.varName;
    return `${a.name}: +${a.total} ${label}${a.times > 1 ? ` (${a.amount} × ${a.times})` : ''}`;
  });
  addMsg(`[💰 инкам: ${lines.join('; ')}]`, 'msg-sys');
  pendingContextNotes.push(`ИНКАМ НАЧИСЛЕН ИГРОЙ (не начисляй повторно): ${lines.join('; ')}`);
  renderSidebar();
  renderIncomes();
}

// ── Повтор при перегрузке (503) и rate-limit (429) ──
async function fetchWithRetry(url, options, label) {
  const RETRIES = 3;          // всего попыток: 1 + 3
  const DELAYS = [2000, 5000, 10000];
  let res = await fetch(url, options);
  for (let i = 0; i < RETRIES && (res.status === 503 || res.status === 429); i++) {
    const loading = document.getElementById('loading-bar');
    if (loading) loading.textContent = `${label}: перегрузка (${res.status}), повтор через ${DELAYS[i] / 1000}с... (${i + 1}/${RETRIES})`;
    await new Promise(r => setTimeout(r, DELAYS[i]));
    res = await fetch(url, options);
  }
  return res;
}

async function callDM(userMsg) {
  const btn = document.getElementById('send-btn');
  const loading = document.getElementById('loading-bar');
  btn.disabled = true;
  loading.textContent = 'Мастер думает...';

  const contextMsg = buildContextMessage();

  let historyBlock = '';
  if (slideHistory.length) {
    const lines = [];
    for (let i = 0; i < slideHistory.length; i++) {
      const msg = slideHistory[i];
      if (msg.role === 'user') lines.push(`[Игрок]: ${msg.content}`);
      else lines.push(`[Мастер]: ${msg.content}`);
    }
    historyBlock = '\nИСТОРИЯ ПОСЛЕДНИХ ХОДОВ:\n' + lines.join('\n') + '\n';
  }

  const messages = [
    { role: 'user', content: `${contextMsg}${historyBlock}\n[Игрок]: ${userMsg || 'Начни игру.'}` }
  ];

  const chatMessages = [
    { role: 'system', content: buildSystemPrompt(dryMode), cache_control: { type: 'ephemeral' } },
    { role: 'user', content: `${contextMsg}${historyBlock}\n[Игрок]: ${userMsg}` }
  ];

  try {
    let raw;

    if (config.backend === 'gemini') {
      const reqBody = JSON.stringify({
        model: config.gmModel,
        max_tokens: config.maxTokens,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })) // без cache_control: Gemini его не знает
      });
      addLogEntry('req', `→ Google AI ${config.gmModel} | ${userMsg?.slice(0, 40) || '(старт)'}`, reqBody);
      const res = await fetchWithRetry('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.gmKey}`
        },
        body: reqBody
      }, 'Google AI');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addLogEntry('err', `✕ Google AI ${res.status}`, JSON.stringify(err, null, 2));
        addMsg(`Ошибка Google AI (${res.status}): ${err.error?.message || err[0]?.error?.message || ''}`, 'msg-err');
        return;
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content || '';
      if (data.usage) {
        document.getElementById('token-hint').textContent = `↑${data.usage.prompt_tokens} ↓${data.usage.completion_tokens}`;
      }
      addLogEntry('res', `← ${config.gmModel} | ↑${data.usage?.prompt_tokens || '?'} ↓${data.usage?.completion_tokens || '?'} токенов`, raw);

    } else if (config.backend === 'openrouter') {
      const reqBody = JSON.stringify({
        model: config.orModel,
        max_tokens: config.maxTokens,
        messages: chatMessages,
        reasoning: { enabled: false }
      });
      addLogEntry('req', `→ OpenRouter ${config.orModel} | ${userMsg?.slice(0, 40) || '(старт)'}`, reqBody);
      const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.orKey}`,
          'HTTP-Referer': 'https://rpg-master.local',
          'X-Title': 'RPG Master'
        },
        body: reqBody
      }, 'OpenRouter');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addLogEntry('err', `✕ OpenRouter ${res.status}`, JSON.stringify(err, null, 2));
        addMsg(`Ошибка OpenRouter (${res.status}): ${err.error?.message || ''}`, 'msg-err');
        return;
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content || '';
      if (data.usage) {
        document.getElementById('token-hint').textContent = `↑${data.usage.prompt_tokens} ↓${data.usage.completion_tokens}`;
      }
      addLogEntry('res', `← ${config.orModel} | ↑${data.usage?.prompt_tokens || '?'} ↓${data.usage?.completion_tokens || '?'} токенов`, raw);

    } else if (config.backend === 'openai') {
      // reasoning_effort не поддерживается chat/instant-моделями — шлём только reasoning-моделям
      const oaiBody = {
        model: config.oaiModel,
        max_completion_tokens: config.maxTokens,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })) // без cache_control: OpenAI кэширует префикс сам
      };
      if (!/chat/i.test(config.oaiModel)) oaiBody.reasoning_effort = 'low'; // иначе размышления съедают бюджет max_completion_tokens
      const reqBody = JSON.stringify(oaiBody);
      addLogEntry('req', `→ OpenAI ${config.oaiModel} | ${userMsg?.slice(0, 40) || '(старт)'}`, reqBody);
      const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.oaiKey}`
        },
        body: reqBody
      }, 'OpenAI');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addLogEntry('err', `✕ OpenAI ${res.status}`, JSON.stringify(err, null, 2));
        addMsg(`Ошибка OpenAI (${res.status}): ${err.error?.message || ''}`, 'msg-err');
        return;
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.content || '';
      if (data.usage) {
        const cached = data.usage.prompt_tokens_details?.cached_tokens;
        document.getElementById('token-hint').textContent =
          `↑${data.usage.prompt_tokens}${cached ? ` (кэш ${cached})` : ''} ↓${data.usage.completion_tokens}`;
      }
      addLogEntry('res', `← ${config.oaiModel} | ↑${data.usage?.prompt_tokens || '?'} ↓${data.usage?.completion_tokens || '?'} токенов`, raw);

    } else {
      // Anthropic
      const reqBody = JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        // system как массив блоков с cache_control: промпт кэшируется,
        // повторные ходы читают его за ~10% цены (кэш живёт 5 мин)
        system: [{ type: 'text', text: buildSystemPrompt(dryMode), cache_control: { type: 'ephemeral' } }],
        messages
      });
      addLogEntry('req', `→ Anthropic ${config.model} | ${userMsg?.slice(0, 40) || '(старт)'}`, reqBody);
      const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: reqBody
      }, 'Anthropic');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addLogEntry('err', `✕ Anthropic ${res.status}`, JSON.stringify(err, null, 2));
        addMsg(`Ошибка API (${res.status}): ${err.error?.message || ''}`, 'msg-err');
        return;
      }
      const data = await res.json();
      raw = data.content.map(b => b.text || '').join('');
      if (data.usage) {
        document.getElementById('token-hint').textContent = `↑${data.usage.input_tokens} ↓${data.usage.output_tokens}`;
      }
      addLogEntry('res', `← ${config.model} | ↑${data.usage?.input_tokens || '?'} ↓${data.usage?.output_tokens || '?'} токенов`, raw);
    }

    // ── Parse response ──────────────────────────
    let parsed;
    try {
      let clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end > start) clean = clean.slice(start, end + 1);
      parsed = JSON.parse(clean);
    } catch (e) {
      const storyMatch = raw.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      addMsg(storyMatch ? storyMatch[1].replace(/\\n/g, '\n') : raw, 'msg-dm');
      pushHistory(userMsg || 'Начни игру.', raw);
      return;
    }

    if (parsed.story) addMsg(parsed.story, 'msg-dm');
    if (parsed.chronicle) chronicleAppend(parsed.chronicle);

    if (parsed.rolls && Array.isArray(parsed.rolls)) {
      for (const r of parsed.rolls) {
        if (r.desc) addMsg(r.desc, 'msg-roll');
        if (r.outcome) addMsg(r.outcome, 'msg-dm');
      }
    } else if (parsed.roll) {
      addMsg(parsed.roll, 'msg-roll');
    }

    if (parsed.story_append) addMsg(parsed.story_append, 'msg-dm');

    // ── Timer handling ──────────────────────────
    if (config.timersEnabled) {
      // 1. Remove timers the model acknowledged
      if (Array.isArray(parsed.remove_timers)) {
        parsed.remove_timers.forEach(name => removeTimer(String(name)));
      }
      // 2. Tick existing timers by elapsed time
      if (parsed.time_elapsed && Number(parsed.time_elapsed) > 0) {
        const elapsedSecs = Number(parsed.time_elapsed);
        const elapsedUnits = elapsedSecs / config.timeUnitSeconds;
        tickTimers(elapsedUnits);
      }
      // 2b. Управление источниками дохода от модели
      if (Array.isArray(parsed.new_incomes)) {
        parsed.new_incomes.forEach(i => {
          if (i && i.name && i.var && i.amount !== undefined) {
            const ok = addIncome(String(i.name), String(i.var), Number(i.amount), Number(i.every) || 1, 'model');
            if (ok) {
              addMsg(`[💰 новый инкам: «${i.name}» — +${i.amount} ${i.var} каждые ${Number(i.every) || 1} ${config.timeUnitName}]`, 'msg-sys');
              renderIncomes();
            }
          }
        });
      }
      if (Array.isArray(parsed.remove_incomes)) {
        parsed.remove_incomes.forEach(name => {
          if (removeIncome(String(name))) {
            addMsg(`[💰 инкам удалён: «${name}»]`, 'msg-sys');
            renderIncomes();
          }
        });
      }
      // 3. Add new timers (they get full duration, unaffected by this tick)
      if (Array.isArray(parsed.new_timers)) {
        parsed.new_timers.forEach(t => {
          if (t.name && t.duration) {
            addTimer(String(t.name), Number(t.duration), String(t.event || ''));
            addMsg(
              `[⏱ таймер: «${t.name}» — ${t.duration} ${config.timeUnitName} → ${t.event}]`,
              'msg-sys'
            );
          }
        });
      }
      // Show fired timers in chat
      const fired = getExpiredTimers();
      if (fired.length) {
        fired.forEach(t => {
          if (!t._notified) {
            addMsg(`[⏱ ТАЙМЕР «${t.name}» ИСТЁК: ${t.event}]`, 'msg-roll');
            t._notified = true;
          }
        });
      }
      renderTimers();
    }

    if (parsed.delta) {
      const levelups = applyDelta(parsed.delta);
      renderSidebar();
      applyIncomeTick(parsed);
      if (levelups.length) {
        const lu = levelups.map(l => `${l.skillName} → Уровень ${l.newLevel}`).join(', ');
        addMsg(`⬆ Повышение уровня: ${lu}`, 'msg-roll');
        pushHistory(userMsg || 'Начни игру.', raw);
        slideHistory.push({ role: 'user', content: `[СИСТЕМА] Повышение уровней: ${lu}. Можешь отреагировать.` });
        slideHistory.push({ role: 'assistant', content: '{"story":"Понял.","rolls":[],"delta":{}}' });
        while (slideHistory.length > MAX_SLIDE) slideHistory.shift();
        return;
      }
    }

    if (!parsed.delta) applyIncomeTick(parsed);

    pushHistory(userMsg || 'Начни игру.', raw);

    // Фоновое сжатие хроники при переполнении (не блокирует ход)
    if (chronicleNeedsCompression()) compressChronicle();

  } catch (e) {
    console.error('callDM error:', e);
    addMsg(`Ошибка: ${e.message} | ${e.stack}`, 'msg-err');
  } finally {
    btn.disabled = false;
    loading.textContent = '';
  }
}

// ── Сжатие хроники ─────────────────────────────
// Отдельный дешёвый запрос: старая сводка + сырые записи → новая сводка.
let chronicleCompressing = false;

async function compressChronicle() {
  if (chronicleCompressing) return;
  chronicleCompressing = true;
  // Снимок: новые записи, пришедшие во время сжатия, не потеряются
  const rawSnapshot = chronicle.slice();
  const prompt =
    `Ты ведёшь летопись текстовой RPG. Сожми хронику в связную сводку до 600 символов.\n` +
    `Сохрани: ключевые события, изменения мира и отношений, невыполненные цели, важные имена. ` +
    `Убери: детали боёв, повторы, художественность. Только текст сводки, без пояснений.\n\n` +
    (chronicleSummary ? `СТАРАЯ СВОДКА:\n${chronicleSummary}\n\n` : '') +
    `НОВЫЕ ЗАПИСИ:\n${rawSnapshot.map(c => `[ход ${c.turn}] ${c.text}`).join('\n')}`;

  try {
    let summary = '';
    if (config.backend === 'gemini') {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.gmKey}`
        },
        body: JSON.stringify({
          model: config.gmModel,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Google AI ${res.status}`);
      const data = await res.json();
      summary = data.choices?.[0]?.message?.content?.trim() || '';
    } else if (config.backend === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.orKey}`,
          'HTTP-Referer': 'https://rpg-master.local',
          'X-Title': 'RPG Master'
        },
        body: JSON.stringify({
          model: config.orModel,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
          reasoning: { enabled: false }
        })
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
      const data = await res.json();
      summary = data.choices?.[0]?.message?.content?.trim() || '';
    } else if (config.backend === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.oaiKey}`
        },
        body: JSON.stringify({
          model: config.oaiModel,
          max_completion_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      summary = data.choices?.[0]?.message?.content?.trim() || '';
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const data = await res.json();
      summary = data.content.map(b => b.text || '').join('').trim();
    }

    if (summary) {
      chronicleSummary = summary;
      // Удаляем только сжатые записи; добавленные во время запроса остаются
      chronicle = chronicle.filter(c => !rawSnapshot.includes(c));
      addLogEntry('res', `← хроника сжата (${summary.length} симв.)`, summary);
    }
  } catch (e) {
    console.warn('compressChronicle failed:', e);
    // Не страшно: попробуем на следующем ходу
  } finally {
    chronicleCompressing = false;
  }
}
