// Сервис целей: прогресс, версии параметров, смена основной цели, проверки совместимости и безопасности.
// Основная цель одна; общий процент = её прогресс. Дополнительные цели привязаны к основной (main_goal_id)
// и вносят поправки в сценарий (см. domain/goals/scenario.js).
(function (HD) {
  const D = HD.dates;
  const db = HD.db;
  const G = HD.goals;

  function paramsOf(ctx, goal, asOf) {
    const v = G.versionAt(ctx.versions.get(goal.id), asOf || ctx.today);
    return v ? v.params : {};
  }

  // Прогресс основной и дополнительных целей на дату
  function overview(ctx, asOf) {
    asOf = asOf || ctx.today;
    const sctx = Object.assign({}, ctx.strategyCtx, { today: asOf });
    const items = ctx.goals
      .filter((g) => g.status === 'active')
      .map((goal) => Object.assign({ goal, strategy: G.get(goal.type) }, G.goalProgress(goal, ctx.versions.get(goal.id), sctx, asOf)));
    items.sort((a, b) => (a.goal.role === 'main' ? -1 : b.goal.role === 'main' ? 1 : 0));
    const main = items.find((i) => i.goal.role === 'main') || null;
    const secondary = items.filter((i) => i.goal.role === 'secondary');
    const sc = G.scenario.scenario(main ? { type: main.goal.type, params: main.params } : null, secondary.map((i) => ({ id: i.goal.id, type: i.goal.type, params: i.params, title: i.goal.title })));
    for (const i of secondary) i.effect = (sc.effects.find((e) => e.goalId === i.goal.id) || {}).text || null;
    return { items, main, secondary, total: main ? main.pct : null, scenario: sc };
  }

  function totalAt(ctx, date) {
    return overview(ctx, date).total;
  }

  // Что ограничивает безопасность: ответы анкеты, текущий вес, профиль
  function safetyFor(ctx, spec) {
    return G.safety.check({
      type: spec.type,
      role: spec.role,
      params: spec.params,
      today: ctx.today,
      profile: ctx.profile,
      weight: ctx.currentWeight,
      assessment: ctx.assessment,
    });
  }

  // Можно ли добавить дополнительную цель к текущей основной
  function canAddSecondary(ctx, spec) {
    const main = ctx.main ? { type: ctx.main.type, title: ctx.main.title, params: paramsOf(ctx, ctx.main) } : null;
    const existing = ctx.goals
      .filter((g) => g.role === 'secondary' && g.status === 'active')
      .map((g) => ({ id: g.id, type: g.type, title: g.title, params: paramsOf(ctx, g) }));
    return G.scenario.canAdd(main, existing, spec);
  }

  function create(profileId, spec) {
    const today = D.today();
    const ctx = HD.svc.ctx(profileId);
    const goal = db.insert('goals', {
      profile_id: profileId,
      role: spec.role,
      type: spec.type,
      title: spec.title || G.get(spec.type).label,
      main_goal_id: spec.role === 'secondary' && ctx.main ? ctx.main.id : null,
      status: 'active',
      risk_confirmed: !!spec.risk_confirmed,
    });
    const params = Object.assign({ start_date: today }, spec.params);
    db.insert('goal_versions', { goal_id: goal.id, valid_from: today, params, change_reason: 'Создание цели' });
    return goal;
  }

  // Изменение параметров: новая версия с valid_from = сегодня, история записей не трогается.
  // Стартовая точка наследуется, если не выбрано «начать отсчёт с сегодняшнего значения».
  function updateParams(goalId, patch, reason, opts) {
    opts = opts || {};
    const versions = db.where('goal_versions', (v) => v.goal_id === goalId);
    const today = D.today();
    const prev = G.versionAt(versions, today);
    const params = Object.assign({}, prev.params, patch);
    if (opts.resetStart) {
      params.start_date = today;
      if (opts.currentValue != null) params.start_value = opts.currentValue;
    } else {
      const first = versions.slice().sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1))[0];
      params.start_date = first.params.start_date;
      if (first.params.start_value != null && patch.start_value == null) params.start_value = first.params.start_value;
    }
    const same = versions.find((v) => v.valid_from === today);
    const v = same ? db.update('goal_versions', same.id, { params, change_reason: reason || same.change_reason }) : db.insert('goal_versions', { goal_id: goalId, valid_from: today, params, change_reason: reason || 'Изменение цели' });
    const planKeys = ['deadline', 'distance_min', 'distance_max', 'elevation_m', 'surface', 'exercise_key', 'per_week', 'target_value'];
    const planChanged = planKeys.some((k) => String(prev.params[k] ?? '') !== String(params[k] ?? ''));
    return { goal: db.get('goals', goalId), version: v, planChanged };
  }

  function updateMeta(goalId, patch) {
    return db.update('goals', goalId, patch);
  }

  // Смена основной цели: старая уходит в архив с финальным процентом. Дополнительные цели, которые
  // не сочетаются с новой основной, тоже уходят в архив (возвращается список с причинами).
  function replaceMain(profileId, spec) {
    const ctx = HD.svc.ctx(profileId);
    const old = ctx.main;
    if (old) {
      const info = overview(ctx).items.find((i) => i.goal.id === old.id);
      db.update('goals', old.id, { status: 'archived', final_progress: info ? info.pct : null, archived_at: D.today(), archive_reason: 'Заменена другой основной целью' });
    }
    const goal = create(profileId, Object.assign({}, spec, { role: 'main' }));
    const dropped = [];
    for (const g of ctx.goals.filter((x) => x.role === 'secondary' && x.status === 'active')) {
      const c = G.scenario.compat(spec.type, g.type);
      if (!c.ok) {
        db.update('goals', g.id, { status: 'archived', archived_at: D.today(), archive_reason: 'Не сочетается с новой основной целью' });
        dropped.push({ goal: g, reason: c.reason });
      } else db.update('goals', g.id, { main_goal_id: goal.id });
    }
    return { goal, dropped };
  }

  function setStatus(goalId, status) {
    const ctx = HD.svc.ctx(db.get('goals', goalId).profile_id);
    const info = overview(ctx).items.find((i) => i.goal.id === goalId);
    return db.update('goals', goalId, { status, final_progress: info ? info.pct : null, archived_at: D.today() });
  }

  // Ступенчатая линия цели для графика: [{date, value, reason}]
  function targetSteps(ctx, goal) {
    return ctx.versions
      .get(goal.id)
      .slice()
      .sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1))
      .map((v) => ({ date: v.valid_from, value: v.params.target_value != null ? Number(v.params.target_value) : null, reason: v.change_reason, params: v.params }));
  }

  HD.svc.goals = { overview, totalAt, safetyFor, canAddSecondary, create, updateParams, updateMeta, replaceMain, setStatus, targetSteps, paramsOf };
})(window.HD);
