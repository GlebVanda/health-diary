// ИИ-модуль (раздел 6.5 ТЗ). На старте выключен: пустой провайдер → всё работает на правилах.
//
// interface AiProvider {
//   getRecommendations(context) → Promise<string[]>        — одна текстовая рекомендация недели
//   reviewPlan(plan, context)   → Promise<AiEdit[]>        — правки к плану из правил
// }
// AiEdit = { type: 'replace_exercise', session_id, from_key, to_key }
//        | { type: 'move_day', session_id, to_date }
//        | { type: 'scale_volume', session_id, factor }      — factor в пределах 0,8–1,2
// ИИ не строит план с нуля: получает план из правил и возвращает правки, которые проходят те же ограничения.
(function (HD) {
  const D = HD.dates;

  const SYSTEM = 'Ты помощник по тренировкам. Не давай медицинских советов. Отвечай только JSON по схеме.';

  function planSummary(plan) {
    return plan.sessions.map((s) => ({
      id: s.id,
      date: s.date,
      week: s.week_index,
      phase: s.phase,
      kind: s.kind,
      title: s.title,
      deload: s.is_deload,
      duration_min: s.target.duration_min,
      exercises: (s.target.exercises || []).map((e) => e.exercise_key),
    }));
  }

  function editsPrompt(plan, context) {
    return [
      'План тренировок из правил (JSON):',
      JSON.stringify(planSummary(plan)),
      'Контекст:',
      JSON.stringify(context),
      'Верни JSON-массив правок. Допустимые типы: replace_exercise {session_id, from_key, to_key}, move_day {session_id, to_date}, scale_volume {session_id, factor 0.8–1.2}.',
      'Доступные ключи упражнений: ' + HD.EXERCISES.map((e) => e.key).join(', '),
    ].join('\n');
  }

  function parseJsonArray(text) {
    const m = String(text).match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      const v = JSON.parse(m[0]);
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  const NullProvider = {
    name: 'none',
    enabled: false,
    async getRecommendations() {
      return [];
    },
    async reviewPlan() {
      return [];
    },
  };

  // Заготовка: Anthropic Messages API напрямую из браузера
  function AnthropicProvider(cfg) {
    async function call(prompt) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: cfg.model, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error('AI ' + res.status);
      const data = await res.json();
      return (data.content || []).map((c) => c.text || '').join('');
    }
    return {
      name: 'anthropic',
      enabled: true,
      async getRecommendations(context) {
        const t = await call('Дай одну короткую рекомендацию на неделю (до 200 символов) по данным: ' + JSON.stringify(context) + '. Верни JSON-массив из одной строки.');
        return parseJsonArray(t).filter((x) => typeof x === 'string').slice(0, 1);
      },
      async reviewPlan(plan, context) {
        return parseJsonArray(await call(editsPrompt(plan, context)));
      },
    };
  }

  // Заготовка: OpenAI-совместимый API (в т.ч. OpenRouter)
  function OpenAICompatProvider(cfg) {
    const base = cfg.baseUrl || (cfg.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
    async function call(prompt) {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw new Error('AI ' + res.status);
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message.content) || '';
    }
    return {
      name: cfg.provider,
      enabled: true,
      async getRecommendations(context) {
        const t = await call('Дай одну короткую рекомендацию на неделю (до 200 символов) по данным: ' + JSON.stringify(context) + '. Верни JSON-массив из одной строки.');
        return parseJsonArray(t).filter((x) => typeof x === 'string').slice(0, 1);
      },
      async reviewPlan(plan, context) {
        return parseJsonArray(await call(editsPrompt(plan, context)));
      },
    };
  }

  // AI_PROVIDER: '' (выключено) | 'anthropic' | 'openai' | 'openrouter'
  function getProvider(settings) {
    const s = settings || {};
    if (!s.ai_provider || !s.ai_api_key || !s.ai_model) return NullProvider;
    const cfg = { provider: s.ai_provider, apiKey: s.ai_api_key, model: s.ai_model, baseUrl: s.ai_base_url };
    if (s.ai_provider === 'anthropic') return AnthropicProvider(cfg);
    return OpenAICompatProvider(cfg);
  }

  /**
   * Проверка правок ИИ теми же ограничениями, что у правил:
   * оборудование и неприязни, объём ±20%, рост длинного бега ≤ 10% к прошлой неделе,
   * разгрузки не убираются, интервал «силовая — длинный бег» не меньше суток.
   * → { accepted: AiEdit[], rejected: [{ edit, reason }] }
   */
  function validateEdits(plan, edits, preferences) {
    const accepted = [];
    const rejected = [];
    const equipment = (preferences && preferences.equipment) || [];
    const dislikes = (preferences && preferences.dislikes) || [];
    const byId = new Map(plan.sessions.map((s) => [s.id, s]));
    const reject = (edit, reason) => rejected.push({ edit, reason });

    for (const e of edits || []) {
      const s = e && byId.get(e.session_id);
      if (!s) {
        reject(e, 'Нет такой тренировки');
        continue;
      }
      if (e.type === 'replace_exercise') {
        const from = (s.target.exercises || []).find((x) => x.exercise_key === e.from_key);
        const to = HD.exerciseByKey(e.to_key);
        if (!from || !to) reject(e, 'Неизвестное упражнение');
        else if (!to.equipment.every((q) => q === 'bodyweight' || equipment.includes(q))) reject(e, 'Нет оборудования для «' + to.name + '»');
        else if (to.tags.some((t) => dislikes.includes(t))) reject(e, 'Упражнение из списка «не нравится»');
        else if (to.pattern !== HD.exerciseByKey(e.from_key).pattern) reject(e, 'Другой двигательный паттерн');
        else accepted.push(e);
      } else if (e.type === 'scale_volume') {
        const f = Number(e.factor);
        if (!(f >= 0.8 && f <= 1.2)) {
          reject(e, 'Объём можно менять только в пределах ±20%');
          continue;
        }
        if (s.is_deload && f > 1) {
          reject(e, 'Разгрузочную неделю нельзя утяжелять');
          continue;
        }
        if (s.kind === 'run' && s.target.is_long && f > 1) {
          const prev = plan.sessions.filter((x) => x.kind === 'run' && x.target.is_long && x.week_index === s.week_index - 1)[0];
          if (prev && s.target.duration_min * f > prev.target.duration_min * 1.1) {
            reject(e, 'Рост длинного бега больше 10% к прошлой неделе');
            continue;
          }
        }
        accepted.push(e);
      } else if (e.type === 'move_day') {
        if (!D.isValid(e.to_date) || D.monday(e.to_date) !== D.monday(s.date)) {
          reject(e, 'Перенос возможен только внутри недели');
          continue;
        }
        const longRun = plan.sessions.find((x) => x.kind === 'run' && x.target.is_long && D.monday(x.date) === D.monday(s.date));
        const strength = plan.sessions.filter((x) => x.kind === 'strength' && D.monday(x.date) === D.monday(s.date) && x.id !== s.id);
        const tooClose = (a, b) => Math.abs(D.diffDays(a, b)) < 2;
        if (s.kind === 'strength' && longRun && tooClose(e.to_date, longRun.date)) reject(e, 'Силовая слишком близко к длинному бегу');
        else if (s.kind === 'run' && s.target.is_long && strength.some((x) => tooClose(x.date, e.to_date))) reject(e, 'Длинный бег слишком близко к силовой');
        else accepted.push(e);
      } else reject(e, 'Неизвестный тип правки');
    }
    return { accepted, rejected };
  }

  HD.ai = { getProvider, validateEdits, NullProvider, planSummary };
})(window.HD);
