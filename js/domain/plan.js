// Генератор плана тренировок по правилам (раздел 6.2 ТЗ).
// generatePlan(goal, preferences, baseline, history, startDate[, exercises]) → Plan
// Чистая функция: никаких обращений к хранилищу, только входные данные.
(function (HD) {
  const D = HD.dates;
  const { clamp, round, floorTo } = HD.util;

  const PHASES = {
    adaptation: 'Адаптация',
    base: 'База',
    development: 'Развитие',
    specific: 'Специфика',
    taper: 'Подводка',
  };

  // Лесенка бег-ходьбы и пороги длительности длинного бега, с которых открывается ступень
  const FORMATS = ['2/1', '3/1', '5/1', '8/2', '10/1', '15/1', '20/1', 'continuous'];
  const FORMAT_THRESHOLDS = [0, 40, 45, 50, 55, 60, 70, 75];
  const TAPER_FACTORS = [0.75, 0.5, 0.2];

  function formatLabel(f) {
    if (f === 'continuous') return 'Непрерывный лёгкий бег';
    const [run, walk] = f.split('/');
    return `Бег-ходьба ${f} (${run} мин бег, ${walk} мин ходьба)`;
  }

  function levelForDuration(min) {
    let lvl = 0;
    for (let i = 0; i < FORMAT_THRESHOLDS.length; i++) if (min >= FORMAT_THRESHOLDS[i]) lvl = i;
    return lvl;
  }

  // Уровень по тому, сколько человек может бежать без остановки
  function levelFromContinuous(min) {
    if (min == null) return 0;
    if (min >= 30) return 7;
    if (min >= 20) return 6;
    if (min >= 15) return 5;
    if (min >= 10) return 4;
    if (min >= 8) return 3;
    if (min >= 5) return 2;
    if (min >= 3) return 1;
    return 0;
  }

  function weeksBetween(startMonday, deadline) {
    return Math.floor(D.diffDays(startMonday, deadline) / 7) + 1;
  }

  // Фазы: адаптация ~20%, база ~35%, развитие ~28%, специфика ~7%, подводка ~10% (только для забега)
  function computePhases(N, opts) {
    const isRace = opts.goalType === 'race';
    const longBreak = opts.longBreak;
    let taper = isRace ? clamp(Math.round(N * 0.1), N >= 6 ? 2 : N >= 3 ? 1 : 0, 3) : 0;
    const scale = isRace ? 1 : 1 / 0.9;
    let adapt = Math.round(N * 0.2 * scale);
    if (!longBreak) adapt = Math.max(1, Math.round(N * 0.1 * scale));
    let base = Math.round(N * 0.35 * scale);
    let dev = Math.round(N * 0.28 * scale);
    let spec = N - taper - adapt - base - dev;
    // Короткий срок: сжимаем, но каждой фазе хотя бы неделю, пока недель хватает
    while (spec < 1 && N - taper >= 4) {
      if (base > 1) base--;
      else if (dev > 1) dev--;
      else if (adapt > 1) adapt--;
      else break;
      spec = N - taper - adapt - base - dev;
    }
    if (N - taper < 4) {
      // Совсем коротко: всё, что осталось после подводки, делим на адаптацию и развитие
      const rest = N - taper;
      adapt = longBreak ? Math.ceil(rest / 2) : Math.min(1, rest);
      base = 0;
      dev = rest - adapt;
      spec = 0;
    }
    const list = [];
    let w = 1;
    const push = (key, n) => {
      if (n <= 0) return;
      list.push({ key, name: PHASES[key], from: w, to: w + n - 1 });
      w += n;
    };
    push('adaptation', adapt);
    push('base', base);
    push('development', dev);
    push('specific', spec);
    push('taper', taper);
    return list;
  }

  function phaseOf(phases, week) {
    return phases.find((p) => week >= p.from && week <= p.to) || phases[phases.length - 1];
  }

  function isDeloadWeek(phases, week) {
    const p = phaseOf(phases, week);
    return week % 4 === 0 && ['adaptation', 'base', 'development'].includes(p.key);
  }

  // Ожидаемое время старта: верхняя граница дистанции × трейловый темп + 10 мин на каждые 100 м набора
  function expectedRaceMinutes(params, baseline) {
    const dist = Number(params.distance_max || params.distance_km || params.distance_min || 0);
    if (!dist) return null;
    const run = (baseline && baseline.run) || {};
    let pace = Number(run.trail_pace_min_km) || null;
    if (!pace && run.best_distance_km && run.best_time_min) pace = run.best_time_min / run.best_distance_km;
    if (!pace) pace = 8;
    let gain = params.elevation_m;
    if (gain == null || gain === '') gain = params.surface === 'road' ? 0 : 30 * dist;
    return dist * pace + (Number(gain) / 100) * 10;
  }

  function isMountain(params) {
    if (params.surface === 'trail') return params.elevation_m == null || params.elevation_m === '' || Number(params.elevation_m) > 0;
    return Number(params.elevation_m) >= 300;
  }

  // ---------- силовые ----------

  const TEMPLATES = {
    race: {
      A: [
        { pattern: 'squat', role: 'main', prefer: ['barbell'] },
        { pattern: 'hinge', role: 'main', prefer: ['rdl', 'barbell'] },
        { pattern: 'push', role: 'main', prefer: ['horizontal', 'barbell'] },
        { pattern: 'pull', role: 'main', prefer: ['vertical'] },
        { pattern: 'core', role: 'core', prefer: ['plank'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['strength_cardio'] },
      ],
      B: [
        { pattern: 'lunge', role: 'unilateral', prefer: ['bulgarian'] },
        { pattern: 'lunge', role: 'unilateral', prefer: ['stepup'], devPrefer: ['descent'] },
        { pattern: 'hinge', role: 'main', prefer: ['bridge', 'barbell'] },
        { pattern: 'push', role: 'accessory', prefer: ['vertical', 'dumbbell'] },
        { pattern: 'pull', role: 'accessory', prefer: ['horizontal', 'dumbbell'] },
        { pattern: 'calf', role: 'accessory', prefer: ['unilateral'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['incline_walk'], fromPhase: 'base' },
      ],
    },
    weight: {
      A: [
        { pattern: 'squat', role: 'main', prefer: ['barbell'] },
        { pattern: 'hinge', role: 'main', prefer: ['rdl'] },
        { pattern: 'push', role: 'main', prefer: ['horizontal'] },
        { pattern: 'pull', role: 'main', prefer: ['vertical'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['strength_cardio'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['intervals'] },
        { pattern: 'core', role: 'core', prefer: ['plank'] },
      ],
      B: [
        { pattern: 'lunge', role: 'unilateral', prefer: ['dumbbell'] },
        { pattern: 'hinge', role: 'main', prefer: ['bridge'] },
        { pattern: 'push', role: 'accessory', prefer: ['dumbbell'] },
        { pattern: 'pull', role: 'accessory', prefer: ['horizontal'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['strength_cardio'] },
        { pattern: 'conditioning', role: 'conditioning', prefer: ['incline_walk', 'intervals'] },
        { pattern: 'core', role: 'core', prefer: [] },
      ],
    },
    general: {
      A: [
        { pattern: 'squat', role: 'main', prefer: ['barbell'] },
        { pattern: 'hinge', role: 'main', prefer: ['rdl'] },
        { pattern: 'push', role: 'main', prefer: ['horizontal'] },
        { pattern: 'pull', role: 'main', prefer: ['vertical'] },
        { pattern: 'core', role: 'core', prefer: ['plank'] },
      ],
      B: [
        { pattern: 'hinge', role: 'main', prefer: ['barbell'] },
        { pattern: 'lunge', role: 'unilateral', prefer: [] },
        { pattern: 'push', role: 'accessory', prefer: ['vertical'] },
        { pattern: 'pull', role: 'accessory', prefer: ['horizontal'] },
        { pattern: 'core', role: 'core', prefer: [] },
      ],
    },
  };

  function hasEquipment(ex, equipment) {
    return ex.equipment.every((e) => e === 'bodyweight' || equipment.includes(e));
  }

  function pickExercise(slot, ctx, used, phaseKey) {
    const prefer = (ctx.isDevPlus(phaseKey) && slot.devPrefer) || slot.prefer;
    let best = null;
    let bestScore = -Infinity;
    for (const ex of ctx.exercises) {
      if (ex.pattern !== slot.pattern) continue;
      if (used.has(ex.key)) continue;
      if (!hasEquipment(ex, ctx.equipment)) continue;
      if (ex.tags.some((t) => ctx.dislikes.includes(t))) continue;
      let score = 0;
      prefer.forEach((tag, i) => {
        if (ex.tags.includes(tag)) score += i === 0 ? 4 : 2;
      });
      for (const like of ctx.likes) if (ex.tags.includes(like)) score += 1;
      if (slot.role === 'unilateral' && ex.unilateral) score += 1;
      if (score > bestScore) {
        best = ex;
        bestScore = score;
      }
    }
    return best;
  }

  const PHASE_ORDER = ['adaptation', 'base', 'development', 'specific', 'taper'];

  function setsReps(role, ex, phaseKey, weekInPhase, phaseLen, ctx) {
    let sets = 3;
    let reps;
    if (role === 'conditioning') {
      reps = { adaptation: '6–8 мин', base: '8–10 мин', development: '8–12 мин', specific: '8–10 мин', taper: '6 мин' }[phaseKey];
      return { sets: 1, reps };
    }
    if (ex.unit === 'sec') {
      reps = { adaptation: '30–40 с', base: '40 с', development: '45 с', specific: '40 с', taper: '30 с' }[phaseKey];
      sets = phaseKey === 'specific' ? 2 : 3;
      if (phaseKey === 'taper') sets = 2;
      return { sets, reps };
    }
    const perLeg = ex.unilateral ? ' на ногу' : '';
    switch (phaseKey) {
      case 'adaptation':
        reps = '10–12';
        break;
      case 'base':
        if (role === 'main') {
          sets = weekInPhase > phaseLen / 2 ? 4 : 3;
          reps = '6–8';
        } else reps = '8–12';
        break;
      case 'development':
        if (role === 'main') reps = '5–6';
        else if (role === 'unilateral') reps = ex.key === 'step_down' ? '8' : '8–10';
        else reps = '8–12';
        break;
      case 'specific':
        sets = role === 'main' ? 3 : 2;
        reps = role === 'main' ? '5–6' : '8–10';
        break;
      case 'taper':
        sets = role === 'main' ? 2 : 1;
        reps = role === 'main' ? '5–6' : '8–10';
        break;
    }
    // Ограничения по здоровью: без предельных усилий (повторы не меньше 8) и щадящий объём
    if (ctx && ctx.noMax && /^[3-7]–/.test(reps)) reps = role === 'main' ? '8–10' : reps;
    if (ctx && ctx.gentle && ['adaptation', 'base'].includes(phaseKey)) sets = Math.min(sets, 2);
    return { sets, reps: reps + perLeg };
  }

  function buildStrength(template, phaseKey, weekInPhase, phaseLen, isDeload, ctx) {
    const used = new Set();
    const items = [];
    let slots = TEMPLATES[ctx.emphasis][template].slice();
    // Целевые упражнения силовых целей — первыми в каждой силовой (если есть оборудование)
    for (const key of ctx.keyLifts) {
      const target = ctx.exercises.find((e) => e.key === key);
      if (!target || !hasEquipment(target, ctx.equipment) || used.has(target.key)) continue;
      items.push({ ex: target, role: 'main' });
      used.add(target.key);
      const i = slots.findIndex((sl) => sl.pattern === target.pattern && sl.role === 'main');
      if (i >= 0) slots.splice(i, 1);
    }
    // Сидячая работа → ягодицы и задняя поверхность бедра
    if (ctx.sedentary && !slots.some((s) => s.pattern === 'hinge' && s.prefer.includes('bridge')) && template === 'B') {
      slots.push({ pattern: 'hinge', role: 'accessory', prefer: ['bridge'] });
    }
    for (const slot of slots) {
      if (slot.fromPhase && PHASE_ORDER.indexOf(phaseKey) < PHASE_ORDER.indexOf(slot.fromPhase)) continue;
      const ex = pickExercise(slot, ctx, used, phaseKey);
      if (!ex) continue;
      used.add(ex.key);
      items.push({ ex, role: slot.role });
    }
    return items.map(({ ex, role }) => {
      let { sets, reps } = setsReps(role, ex, phaseKey, weekInPhase, phaseLen, ctx);
      if (ctx.gentle && ['adaptation', 'base'].includes(phaseKey) && role !== 'conditioning') sets = Math.min(sets, 2);
      if (isDeload && role !== 'conditioning') sets = Math.max(1, sets - 1);
      const base = ctx.lifts[ex.key];
      return {
        exercise_key: ex.key,
        name: ex.name,
        role,
        sets,
        reps,
        weight_kg: base != null ? Number(base) : null,
      };
    });
  }

  // ---------- расстановка по дням ----------

  const DEFAULT_DAYS = {
    1: [5],
    2: [1, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 5],
    5: [0, 1, 2, 4, 5],
  };

  function slotDays(slot) {
    const n = Number(slot.per_week) || 0;
    const days = (slot.days || []).slice(0, n);
    const fallback = DEFAULT_DAYS[Math.min(5, Math.max(1, n))] || [];
    for (const d of fallback) if (days.length < n && !days.includes(d)) days.push(d);
    for (let d = 0; days.length < n && d < 7; d++) if (!days.includes(d)) days.push(d);
    return days.sort((a, b) => a - b);
  }

  // ---------- главная функция ----------

  // scenario — поправки дополнительных целей (goals/scenario.js), preferences.limits — ограничения по здоровью (fitness.js)
  function generatePlan(goal, preferences, baseline, history, startDate, exercises, scenario) {
    goal = goal || { type: 'consistency', params: {} };
    const params = goal.params || {};
    preferences = preferences || {};
    baseline = baseline || {};
    history = history || {};
    exercises = exercises || HD.EXERCISES;
    const plan_sc = (scenario && scenario.plan) || {};
    const limits = preferences.limits || {};

    const warnings = [];
    const startMonday = D.monday(startDate);
    let N = 12;
    let rolling = true;
    if (params.deadline && params.deadline >= startMonday) {
      N = weeksBetween(startMonday, params.deadline);
      rolling = false;
    }
    if (!rolling && N < 8) warnings.push(`До цели всего ${N} ${HD.util.plural(N, 'неделя', 'недели', 'недель')}: фазы сжаты, цель может быть нереалистичной.`);

    const run = baseline.run || {};
    const breakWeeks = Number(run.break_weeks) || 0;
    const unknownContinuous = run.continuous_min == null || run.continuous_min === '';
    const longBreak = history.lastLongRunMin == null && (breakWeeks > 4 || unknownContinuous);

    const phases = computePhases(N, { goalType: goal.type, longBreak });
    const isRace = goal.type === 'race';
    const emphasis = isRace ? 'race' : ['weight_loss', 'weight_gain', 'measurement'].includes(goal.type) ? 'weight' : 'general';
    const equipment = preferences.equipment || [];
    const slots = (preferences.sessions || []).map((x) => Object.assign({}, x));
    // Дополнительная цель «пробежать дистанцию» требует хотя бы одной пробежки
    if (plan_sc.runExtra && !slots.some((x) => x.kind === 'run')) slots.push({ kind: 'run', per_week: 1, duration_min: 45, days: [5], location: 'street', added_by_goal: true });
    if (plan_sc.runPerWeekCap) slots.forEach((x) => x.kind === 'run' && (x.per_week = Math.min(Number(x.per_week) || 1, plan_sc.runPerWeekCap)));
    const strengthSlot = slots.find((s) => s.kind === 'strength');
    const runSlot = slots.find((s) => s.kind === 'run');
    const otherSlots = slots.filter((s) => s !== strengthSlot && s !== runSlot);

    const lifts = Object.assign({}, baseline.lifts || {}, history.lifts || {});
    const ctx = {
      exercises,
      equipment,
      likes: preferences.likes || [],
      dislikes: preferences.dislikes || [],
      sedentary: !!preferences.sedentary,
      emphasis,
      lifts,
      keyLifts: [].concat(goal.type === 'strength_lift' && params.exercise_key ? [params.exercise_key] : [], plan_sc.keyLifts || []).filter((k, i, a) => a.indexOf(k) === i).slice(0, 3),
      noMax: !!limits.noMaxEfforts,
      gentle: !!limits.gentle,
      isDevPlus: (k) => ['development', 'specific', 'taper'].includes(k),
    };

    // --- длинный бег по неделям ---
    const runWeekly = runSlot ? Number(runSlot.per_week) || 1 : 0;
    const extraRuns = Math.max(0, runWeekly - 1);
    let peak = null;
    let expected = null;
    if (isRace) {
      expected = expectedRaceMinutes(params, baseline);
      if (expected) peak = clamp(round(expected * 0.7, 10), 90, 180);
    }
    const slotMax = runSlot && runSlot.duration_min ? Number(runSlot.duration_min) : null;
    if (!isRace) peak = slotMax || 60;
    if (isRace && slotMax && peak && slotMax < peak) {
      warnings.push(`Пик длинного бега ${peak} мин больше лимита слота (${slotMax} мин): лимит для длинного бега не применяется.`);
    }

    const startLong =
      history.lastLongRunMin != null
        ? Number(history.lastLongRunMin)
        : longBreak
          ? 30
          : clamp(round(Number(run.continuous_min) || 30, 5), 20, peak || 60);
    let level = history.formatLevel != null ? history.formatLevel : longBreak ? 0 : levelFromContinuous(Number(run.continuous_min));

    const longRuns = {};
    const formats = {};
    if (runSlot) {
      let lastProg = null;
      let prevWeek = null;
      const nonTaper = phases.filter((p) => p.key !== 'taper');
      const lastBuildWeek = nonTaper.length ? nonTaper[nonTaper.length - 1].to : N;
      for (let w = 1; w <= lastBuildWeek; w++) {
        let cur;
        if (w === 1) cur = startLong;
        else if (isDeloadWeek(phases, w)) cur = round(prevWeek * 0.7, 5);
        else {
          const weeklyRun = lastProg * (1 + extraRuns * 0.5);
          const inc = lastProg < 85 ? 5 : Math.max(5, floorTo(Math.min(10, weeklyRun * 0.1), 5));
          cur = lastProg < 85 ? Math.min(85, lastProg + inc) : lastProg + inc;
          if (peak) cur = Math.min(cur, Math.max(peak, startLong));
        }
        if (!isDeloadWeek(phases, w)) {
          lastProg = cur;
          level = Math.max(level, levelForDuration(cur));
        }
        longRuns[w] = cur;
        formats[w] = FORMATS[level];
        prevWeek = cur;
      }
      const built = Math.max(...Object.values(longRuns));
      if (isRace && peak && built < peak) warnings.push(`До старта не хватает недель для пика ${peak} мин: пик срезан до ${built} мин.`);
      const taperPhase = phases.find((p) => p.key === 'taper');
      if (taperPhase) {
        const len = taperPhase.to - taperPhase.from + 1;
        const factors = TAPER_FACTORS.slice(TAPER_FACTORS.length - len);
        for (let i = 0; i < len; i++) {
          const w = taperPhase.from + i;
          longRuns[w] = Math.max(20, floorTo(built * factors[i], 5));
          formats[w] = FORMATS[level];
        }
      }
    }

    // --- расстановка дней и проверка интервала «ноги — длинный бег» ---
    const strengthDays = strengthSlot ? slotDays(strengthSlot) : [];
    const runDays = runSlot ? slotDays(runSlot) : [];
    const longDay = runDays.length ? runDays[runDays.length - 1] : null;
    if (longDay != null) {
      for (const sd of strengthDays) {
        const gap = Math.min(Math.abs(sd - longDay), 7 - Math.abs(sd - longDay));
        if (gap < 2) {
          warnings.push(`Между силовой (${D.WEEKDAYS[sd]}) и длинным бегом (${D.WEEKDAYS[longDay]}) нужен хотя бы один день отдыха.`);
          break;
        }
      }
    }

    // Низкая ударная нагрузка по здоровью: вне подготовки к забегу бег заменяем ходьбой и велотренажёром
    const gentleRun = !!limits.lowImpact && !isRace;
    if (limits.lowImpact && isRace) warnings.push('Ударная нагрузка бега ограничена вашими ответами анкеты: начните с ходьбы и бег-ходьбы.');
    const relief = !!preferences.relief;
    const treadmillIncline = equipment.includes('treadmill_incline');
    const mountain = isRace && isMountain(params);
    const warmup = 10;

    // --- сессии ---
    const sessions = [];
    let strengthCount = 0;
    const raceDate = isRace && !rolling ? params.deadline : null;
    for (let w = 1; w <= N; w++) {
      const monday = D.addDays(startMonday, (w - 1) * 7);
      const phase = phaseOf(phases, w);
      const deload = isDeloadWeek(phases, w);
      const weekInPhase = w - phase.from + 1;
      const phaseLen = phase.to - phase.from + 1;
      const isRaceWeek = raceDate && D.monday(raceDate) === monday;

      if (strengthSlot) {
        for (const day of strengthDays) {
          const date = D.addDays(monday, day);
          if (raceDate && (date > raceDate || D.diffDays(date, raceDate) < 4)) continue;
          const template = strengthCount % 2 === 0 ? 'A' : 'B';
          strengthCount++;
          sessions.push({
            date,
            week_index: w,
            phase: phase.key,
            kind: 'strength',
            title: 'Силовая ' + (template === 'A' ? 'А' : 'Б'),
            is_deload: deload,
            target: {
              template,
              duration_min: Number(strengthSlot.duration_min) || 60,
              warmup_min: warmup,
              location: strengthSlot.location || 'gym',
              exercises: buildStrength(template, phase.key, weekInPhase, phaseLen, deload, ctx),
            },
          });
        }
      }

      if (runSlot) {
        const long = longRuns[w];
        const fmt = formats[w];
        const incline = mountain && ['development', 'specific'].includes(phase.key) ? (relief ? 'hills' : treadmillIncline ? 'incline_blocks' : null) : null;
        runDays.forEach((day, i) => {
          let date = D.addDays(monday, day);
          const isLong = i === runDays.length - 1;
          if (isRaceWeek && isLong) date = D.addDays(raceDate, -3); // шейкаут за 3 дня до старта
          if (raceDate && date >= raceDate) return;
          const dur = isLong ? long : Math.max(20, round(Math.min(slotMax || 45, long * 0.5), 5));
          sessions.push({
            date,
            week_index: w,
            phase: phase.key,
            kind: gentleRun ? 'cardio' : 'run',
            title: gentleRun ? (isLong ? 'Ходьба с наклоном или велотренажёр' : 'Лёгкое кардио без ударной нагрузки') : isRaceWeek && isLong ? 'Шейкаут' : isLong ? 'Длинный бег' : 'Лёгкий бег',
            is_deload: deload,
            target: {
              duration_min: dur,
              format: gentleRun ? null : fmt,
              format_label: gentleRun ? null : formatLabel(fmt),
              incline: isLong ? incline : null,
              warmup_min: warmup,
              location: runSlot.location || 'street',
              is_long: isLong,
            },
          });
        });
      }

      for (const slot of otherSlots) {
        const perMonth = Number(slot.per_month) || 0;
        let days;
        if (perMonth && !slot.per_week) {
          const every = Math.max(1, Math.round(4 / perMonth));
          days = (w - 1) % every === 0 ? [(slot.days && slot.days[0]) ?? 6] : [];
        } else days = slotDays(slot);
        for (const day of days) {
          const date = D.addDays(monday, day);
          if (raceDate && date >= raceDate) continue;
          const dur = Number(slot.duration_min) || 30;
          sessions.push({
            date,
            week_index: w,
            phase: phase.key,
            kind: slot.kind === 'cardio' ? 'cardio' : 'other',
            title: slot.title || (slot.kind === 'cardio' ? 'Кардио' : 'Тренировка'),
            is_deload: deload,
            target: {
              duration_min: deload ? round(dur * 0.7, 5) : dur,
              warmup_min: warmup,
              location: slot.location || 'gym',
            },
          });
        }
      }
    }
    sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (plan_sc.minSessions) {
      const perWeek = (strengthSlot ? strengthDays.length : 0) + runDays.length + otherSlots.reduce((t, x) => t + (Number(x.per_week) || 0), 0);
      if (perWeek < plan_sc.minSessions) warnings.push(`Цель требует ${plan_sc.minSessions} тренировок в неделю, а в расписании ${perWeek}: добавьте занятия в анкете.`);
    }

    return {
      generator: 'rules',
      start_date: startMonday,
      end_date: D.addDays(startMonday, N * 7 - 1),
      weeks: N,
      rolling,
      phases,
      sessions,
      warnings,
      meta: {
        peak_long_run: runSlot ? Math.max(0, ...Object.values(longRuns)) : null,
        expected_race_min: expected ? Math.round(expected) : null,
        long_runs: longRuns,
        formats,
        emphasis,
        sessions_per_week: (strengthSlot ? strengthDays.length : 0) + runDays.length + otherSlots.reduce((s, x) => s + (Number(x.per_week) || (Number(x.per_month) || 0) / 4), 0),
      },
    };
  }

  // Сколько тренировок в неделю в анкете — нужно для коэффициента активности
  function sessionsPerWeek(preferences) {
    if (!preferences || !preferences.sessions) return 0;
    return preferences.sessions.reduce((s, x) => s + (Number(x.per_week) || (Number(x.per_month) || 0) / 4), 0);
  }

  HD.plan = {
    PHASES,
    FORMATS,
    formatLabel,
    levelForDuration,
    computePhases,
    phaseOf,
    isDeloadWeek,
    expectedRaceMinutes,
    generatePlan,
    sessionsPerWeek,
    pickExercise,
    TEMPLATES,
  };
})(window.HD);
