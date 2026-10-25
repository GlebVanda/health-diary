// Логика основной и дополнительных целей.
//
// Основная цель — верхнеуровневая спортивная цель (снижение веса, набор, рост силы, забег, общая форма):
// её достигает план тренировок и норма питания. Дополнительные цели не имеют веса в общем проценте:
// они вносят поправки в сценарий основной цели (ограничивают дефицит, добавляют упражнения, задают рубежи)
// или дублируют её промежуточным рубежом. Если дополнительная цель никак не связана с основной — её нельзя добавить.
(function (HD) {
  const G = HD.goals;

  const SAME_LIFT = (a, b) => a.params && b.params && a.params.exercise_key && a.params.exercise_key === b.params.exercise_key;

  // Что допустимо в паре «основная → дополнительная». level: ok — просто работает, warn — работает с оговоркой.
  const COMPAT = {
    weight_loss: {
      weight_loss: { level: 'ok', effect: 'Промежуточный рубеж к основной цели: план и норма те же, но вы видите прогресс по этапам.' },
      strength_lift: { level: 'ok', effect: 'Дефицит калорий ограничен 15%, белок не ниже 1,8 г/кг, упражнение идёт первым в каждой силовой: так вес уходит, а сила сохраняется.' },
      measurement: { level: 'ok', effect: 'Следим за объёмом отдельно от веса: он показывает, уходит ли именно жир.' },
      consistency: { level: 'ok', effect: 'Минимальное число тренировок в неделю становится условием «неделя засчитана».' },
      run_distance: { level: 'ok', effect: 'В план добавляются лёгкие пробежки или бег-ходьба; при высоком весе — сначала ходьба.' },
    },
    weight_gain: {
      weight_gain: { level: 'ok', effect: 'Промежуточный рубеж к основной цели.' },
      strength_lift: { level: 'ok', effect: 'Упражнение идёт первым в каждой силовой: прибавка веса поддерживает набор массы.' },
      measurement: { level: 'ok', effect: 'Объём (грудь, бёдра) показывает, куда идёт набор; рост талии быстрее остальных — повод урезать профицит.' },
      consistency: { level: 'ok', effect: 'Минимальное число тренировок — условие «неделя засчитана».' },
      run_distance: { level: 'warn', effect: 'Кардио замедляет набор: пробежки в плане ограничены одной в неделю, калории — с запасом.' },
    },
    strength_lift: {
      strength_lift: { level: 'ok', effect: 'Ещё одно упражнение добавляется в силовые вместе с основным.' },
      weight_loss: { level: 'warn', effect: 'Силе мешает большой дефицит: он ограничен 10%, поэтому вес уходит медленнее.' },
      weight_gain: { level: 'ok', effect: 'Профицит калорий поддерживает рост силовых показателей.' },
      measurement: { level: 'ok', effect: 'Объёмы показывают, как меняется тело при росте силы.' },
      consistency: { level: 'ok', effect: 'Минимальное число тренировок — условие «неделя засчитана».' },
      run_distance: { level: 'warn', effect: 'Бег мешает восстановлению ног: не больше одной лёгкой пробежки в неделю, не перед тяжёлой силовой.' },
    },
    race: {
      run_distance: { level: 'ok', effect: 'Промежуточный рубеж: пробежать часть дистанции раньше старта.' },
      strength_lift: { level: 'ok', effect: 'Силовая для ног (присед и т.п.) идёт первой — это защищает от травм на спусках.' },
      weight_loss: { level: 'warn', effect: 'Дефицит ограничен 10%, чтобы хватало сил на длинные пробежки; углеводов не меньше 4 г/кг.' },
      measurement: { level: 'ok', effect: 'Объёмы показывают изменения тела при беговой подготовке.' },
      consistency: { level: 'ok', effect: 'Минимальное число тренировок — условие «неделя засчитана».' },
    },
    consistency: {
      weight_loss: { level: 'ok', effect: 'Сценарий общей формы дополняется дефицитом калорий (15–20%).' },
      weight_gain: { level: 'ok', effect: 'Сценарий общей формы дополняется профицитом калорий.' },
      strength_lift: { level: 'ok', effect: 'Упражнение идёт первым в каждой силовой.' },
      measurement: { level: 'ok', effect: 'Следим за объёмом тела.' },
      run_distance: { level: 'ok', effect: 'В план добавляются пробежки.' },
      consistency: { level: 'ok', effect: 'Более строгий минимум тренировок в неделю.' },
    },
  };

  const INCOMPAT = {
    weight_loss: { weight_gain: 'Нельзя одновременно худеть и набирать вес: цели тянут питание в разные стороны.' },
    weight_gain: { weight_loss: 'Нельзя одновременно набирать и снижать вес: цели тянут питание в разные стороны.' },
    race: { weight_gain: 'Набор веса мешает подготовке к забегу: убрать его, чтобы не вредить главной цели.', race: 'Забег — основная цель; для рубежа используйте «Пробежать дистанцию».' },
  };

  // Какие типы вообще бывают основной / дополнительной целью
  function typesFor(role) {
    return G.list().filter((s) => (s.roles || ['main', 'secondary']).includes(role));
  }

  // → { ok, level, effect, reason }
  function compat(mainType, secType) {
    const row = COMPAT[mainType] || {};
    if (row[secType]) return Object.assign({ ok: true }, row[secType]);
    const reason = (INCOMPAT[mainType] && INCOMPAT[mainType][secType]) || 'Эта цель никак не связана с основной и не повлияет на план, поэтому добавлять её не нужно.';
    return { ok: false, reason };
  }

  // Допустима ли дополнительная цель к набору уже существующих (дубли, конфликты между собой)
  function canAdd(main, existing, candidate) {
    if (!main) return { ok: false, reason: 'Сначала задайте основную цель.' };
    const c = compat(main.type, candidate.type);
    if (!c.ok) return c;
    const all = [main].concat(existing);
    const conflict = (a, b) => (a === 'weight_loss' && b === 'weight_gain') || (a === 'weight_gain' && b === 'weight_loss');
    for (const g of all) {
      if (conflict(g.type, candidate.type)) return { ok: false, reason: 'Противоречит уже заданной цели «' + (g.title || g.type) + '».' };
    }
    if (candidate.type === 'strength_lift') {
      for (const g of all) if (g.type === 'strength_lift' && SAME_LIFT(g, candidate) && g.params.target_value >= candidate.params.target_value) {
        return { ok: false, reason: 'Для этого упражнения уже есть цель с таким же или более высоким весом: измените её.' };
      }
    }
    return c;
  }

  /**
   * Сценарий: как набор целей меняет питание и план.
   * main = { type, params }, secondaries = [{ id, type, params, title }]
   * → { nutrition: { maxDeficitPct, proteinPerKg, notes }, plan: { keyLifts, runPerWeekCap, minSessions, runExtra }, effects: [{ goalId, text, level }] }
   */
  function scenario(main, secondaries) {
    const out = { nutrition: { maxDeficitPct: 0.2, proteinPerKg: null, notes: [] }, plan: { keyLifts: [], runPerWeekCap: null, minSessions: null, runExtra: false, strengthBias: false }, effects: [] };
    if (!main) return out;
    const sec = secondaries || [];
    const has = (t) => sec.some((s) => s.type === t);
    if (main.type === 'strength_lift' && main.params.exercise_key) out.plan.keyLifts.push(main.params.exercise_key);

    if (has('strength_lift')) {
      out.plan.strengthBias = true;
      for (const s of sec.filter((x) => x.type === 'strength_lift')) if (s.params.exercise_key && !out.plan.keyLifts.includes(s.params.exercise_key)) out.plan.keyLifts.push(s.params.exercise_key);
      if (main.type === 'weight_loss' || main.type === 'consistency') {
        out.nutrition.maxDeficitPct = Math.min(out.nutrition.maxDeficitPct, 0.15);
        out.nutrition.proteinPerKg = 1.8;
      }
    }
    if (has('weight_loss') && ['strength_lift'].includes(main.type)) out.nutrition.maxDeficitPct = Math.min(out.nutrition.maxDeficitPct, 0.1);
    if (has('weight_loss') && main.type === 'race') out.nutrition.maxDeficitPct = Math.min(out.nutrition.maxDeficitPct, 0.1);
    if (main.type === 'race' && !has('weight_loss')) out.nutrition.maxDeficitPct = 0.1;
    if (has('run_distance')) {
      out.plan.runExtra = true;
      if (['weight_gain', 'strength_lift'].includes(main.type)) out.plan.runPerWeekCap = 1;
    }
    const cons = sec.filter((s) => s.type === 'consistency').map((s) => Number(s.params.per_week) || 0);
    if (main.type === 'consistency' && main.params.per_week) cons.push(Number(main.params.per_week));
    if (cons.length) out.plan.minSessions = Math.max(...cons);

    for (const s of sec) {
      const c = compat(main.type, s.type);
      if (c.ok) out.effects.push({ goalId: s.id, text: c.effect, level: c.level });
    }
    if (out.nutrition.maxDeficitPct < 0.2) out.nutrition.notes.push(`Дефицит ограничен ${Math.round(out.nutrition.maxDeficitPct * 100)}% из-за дополнительных целей.`);
    return out;
  }

  G.scenario = { COMPAT, INCOMPAT, typesFor, compat, canAdd, scenario };
})(window.HD);
