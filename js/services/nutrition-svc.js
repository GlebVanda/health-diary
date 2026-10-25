// Сервис питания: норма с историей, недельный бюджет, ввод дня.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;
  const N = HD.nutrition;

  // Норма, действующая на дату
  function targetFor(ctx, date) {
    let t = null;
    for (const x of ctx.targets) if (x.valid_from <= date) t = x;
    if (!t) return null;
    const floor = (t.calc_details && t.calc_details.floor) || N.floorKcal(ctx.profile.sex, null);
    return Object.assign({}, t, { floor });
  }

  // Что хочет главная цель; если главная только поддерживает вес — учитываем второстепенную цель по весу
  function goalAdjust(ctx) {
    const active = ctx.goals.filter((g) => g.status === 'active');
    const main = active.find((g) => g.role === 'main');
    let adj = { mode: 'maintenance' };
    let paramsMain = null;
    if (main) {
      const s = HD.goals.get(main.type);
      paramsMain = HD.goals.versionAt(ctx.versions.get(main.id), ctx.today).params;
      adj = s.nutrition(paramsMain, ctx) || adj;
    }
    if (adj.mode === 'maintenance' && !adj.pct) {
      const sec = active.find((g) => g.role === 'secondary' && ['weight_loss', 'weight_gain', 'measurement'].includes(g.type));
      if (sec) {
        const p = HD.goals.versionAt(ctx.versions.get(sec.id), ctx.today).params;
        const secAdj = HD.goals.get(sec.type).nutrition(p, ctx);
        adj = Object.assign({}, secAdj, { carbsMinPerKg: adj.carbsMinPerKg || secAdj.carbsMinPerKg });
      }
    }
    return adj;
  }

  function sessionsPerWeek(ctx) {
    if (ctx.plan && ctx.plan.meta && ctx.plan.meta.sessions_per_week != null) return ctx.plan.meta.sessions_per_week;
    return HD.plan.sessionsPerWeek(ctx.prefs);
  }

  function autoTarget(ctx) {
    let adj = goalAdjust(ctx);
    const lim = (ctx.assessment && ctx.assessment.limits) || {};
    // Недовес и беременность: дефицит не применяем
    if (lim.noWeightLoss && adj.mode === 'deficit') adj = { mode: 'maintenance', proteinPerKg: adj.proteinPerKg };
    const sc = ctx.scenario ? ctx.scenario.nutrition : {};
    if (sc.proteinPerKg) adj = Object.assign({}, adj, { proteinPerKg: Math.max(adj.proteinPerKg || 0, sc.proteinPerKg) });
    return N.computeTarget({
      sex: ctx.profile.sex,
      weightKg: ctx.currentWeight,
      heightCm: Number(ctx.profile.height_cm) || null,
      age: HD.svc.age(ctx),
      sessionsPerWeek: sessionsPerWeek(ctx),
      activityFallback: Number(ctx.profile.activity_level) || null,
      adjust: adj,
      proteinPerKg: adj.proteinPerKg,
      carbsMinPerKg: adj.carbsMinPerKg,
      maxDeficitPct: sc.maxDeficitPct,
    });
  }

  // Пересчёт: новая норма действует с ближайшего понедельника; при ручной норме — только подсказка
  function recalc(profileId, reason) {
    const ctx = HD.svc.ctx(profileId);
    const last = ctx.targets[ctx.targets.length - 1];
    if (last && last.source !== 'auto') return { skipped: 'manual', auto: autoTarget(ctx) };
    const r = autoTarget(ctx);
    if (!r.daily_kcal) return { skipped: 'no-data', auto: r };
    const validFrom = ctx.targets.length ? D.nextMonday(ctx.today) : D.monday(ctx.today);
    const current = targetFor(ctx, validFrom);
    const same = current && current.source === 'auto' && current.daily_kcal === r.daily_kcal && current.protein_g === r.protein_g && current.carbs_g === r.carbs_g;
    if (same) return { unchanged: true, target: current };
    const row = {
      profile_id: profileId,
      valid_from: validFrom,
      daily_kcal: r.daily_kcal,
      protein_g: r.protein_g,
      fat_g: r.fat_g,
      carbs_g: r.carbs_g,
      source: 'auto',
      calc_details: Object.assign({}, r.details, { reason: reason || 'Пересчёт' }),
    };
    const existing = ctx.targets.find((t) => t.valid_from === validFrom && t.source === 'auto');
    const saved = existing ? db.update('nutrition_targets', existing.id, row) : db.insert('nutrition_targets', row);
    return { target: saved, previous: current };
  }

  function setManual(profileId, values, applyNow) {
    const ctx = HD.svc.ctx(profileId);
    const validFrom = applyNow || !ctx.targets.length ? D.monday(ctx.today) : D.nextMonday(ctx.today);
    const row = {
      profile_id: profileId,
      valid_from: validFrom,
      daily_kcal: Number(values.daily_kcal),
      protein_g: values.protein_g ? Number(values.protein_g) : null,
      fat_g: values.fat_g ? Number(values.fat_g) : null,
      carbs_g: values.carbs_g ? Number(values.carbs_g) : null,
      source: 'manual',
      calc_details: { floor: N.floorKcal(ctx.profile.sex, N.bmr({ sex: ctx.profile.sex, weightKg: ctx.currentWeight, heightCm: ctx.profile.height_cm, age: HD.svc.age(ctx) })), reason: 'Ручная норма' },
    };
    const existing = ctx.targets.find((t) => t.valid_from === validFrom);
    return existing ? db.update('nutrition_targets', existing.id, row) : db.insert('nutrition_targets', row);
  }

  function revertAuto(profileId, applyNow) {
    const ctx = HD.svc.ctx(profileId);
    const r = autoTarget(ctx);
    if (!r.daily_kcal) return null;
    const validFrom = applyNow ? D.monday(ctx.today) : D.nextMonday(ctx.today);
    const row = { profile_id: profileId, valid_from: validFrom, daily_kcal: r.daily_kcal, protein_g: r.protein_g, fat_g: r.fat_g, carbs_g: r.carbs_g, source: 'auto', calc_details: Object.assign({}, r.details, { reason: 'Возврат к авто' }) };
    const existing = ctx.targets.find((t) => t.valid_from === validFrom);
    return existing ? db.update('nutrition_targets', existing.id, row) : db.insert('nutrition_targets', row);
  }

  // Сколько тренировок сделано и запланировано в неделю (для статуса ✓).
  // Если плана на неделю нет, норма как в таблице Макса — 3 тренировки.
  function trainingsFor(ctx, monday) {
    const sun = D.addDays(monday, 6);
    const done = ctx.logs.filter((l) => l.done && l.date >= monday && l.date <= sun).length;
    const planned = ctx.plan && monday >= D.monday(ctx.plan.start_date) && monday <= ctx.plan.end_date ? ctx.sessions.filter((s) => s.date >= monday && s.date <= sun).length : 3;
    return { done, planned };
  }

  // Недели бюджета до toMonday включительно (кэшируется в контексте)
  function weeks(ctx, toMonday) {
    toMonday = toMonday || D.monday(ctx.today);
    if (ctx._weeks && ctx._weeksTo >= toMonday) return ctx._weeks.filter((w) => w.monday <= toMonday);
    const starts = [];
    if (ctx.targets.length) starts.push(D.monday(ctx.targets[0].valid_from));
    if (ctx.firstFoodDate) starts.push(D.monday(ctx.firstFoodDate));
    const from = starts.length ? starts.sort()[0] : D.monday(ctx.today);
    const list = HD.budget.computeWeeks({
      foodByDate: ctx.foodByDate,
      targetFor: (m) => targetFor(ctx, m),
      trainingsFor: (m) => trainingsFor(ctx, m),
      capPct: ctx.profile.carry_cap_pct == null ? 0.15 : Number(ctx.profile.carry_cap_pct),
      fromMonday: from,
      toMonday: toMonday < from ? from : toMonday,
    });
    ctx._weeks = list;
    ctx._weeksTo = toMonday;
    return list;
  }

  function week(ctx, monday) {
    return weeks(ctx, monday).find((w) => w.monday === monday) || null;
  }

  function dayNorm(ctx, date) {
    const w = week(ctx, D.monday(date));
    return w && w.hasTarget ? w.dayNorm : null;
  }

  function saveFood(profileId, date, values) {
    const clean = {};
    for (const k of ['kcal', 'protein_g', 'fat_g', 'carbs_g']) {
      const v = values[k];
      clean[k] = v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
    }
    clean.note = values.note ? String(values.note).trim() : null;
    const existing = db.forProfile('food_days', profileId, (f) => f.date === date)[0];
    const empty = clean.kcal == null && clean.protein_g == null && clean.fat_g == null && clean.carbs_g == null && !clean.note;
    if (empty) {
      if (existing) db.remove('food_days', existing.id);
      return null;
    }
    if (existing) return db.update('food_days', existing.id, clean);
    return db.insert('food_days', Object.assign({ profile_id: profileId, date, source: 'manual' }, clean));
  }

  HD.svc.nutrition = { targetFor, autoTarget, recalc, setManual, revertAuto, weeks, week, dayNorm, saveFood, trainingsFor, goalAdjust };
})(window.HD);
