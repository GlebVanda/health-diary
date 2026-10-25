// Сборка контекста профиля: все данные одного профиля, отсортированные и готовые для расчётов.
// Это аналог серверного слоя: экраны не читают таблицы напрямую, только через контекст и сервисы.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;
  HD.svc = HD.svc || {};

  const byDate = (a, b) => (a.date === b.date ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.date < b.date ? -1 : 1);

  const ALT_REPS = { '5–6': '8–10', '6–8': '10–12', '8–10': '12–15', '8–12': '12–15', '10–12': '8–10' };

  // План с учётом автоматических изменений (облегчение, рост, разгрузка) и переноса на дорожку
  function effective(s) {
    const t = HD.util.deepClone(s.target || {});
    let isDeload = s.is_deload;
    const notes = [];
    for (const a of (s.adjustments || []).filter((x) => !x.reverted)) {
      if (a.type === 'lighten') {
        if (t.duration_min) t.duration_min = Math.max(10, Math.round((t.duration_min * a.factor) / 5) * 5);
        (t.exercises || []).forEach((e) => (e.sets = Math.max(1, Math.round(e.sets * a.factor))));
      } else if (a.type === 'boost') {
        if (s.kind === 'run' && t.is_long && a.plus_min) t.duration_min += a.plus_min;
        (t.exercises || []).forEach((e) => {
          if (e.weight_kg != null && a.plus_kg && e.role === 'main') e.weight_kg += a.plus_kg;
        });
      } else if (a.type === 'deload_switch') {
        isDeload = true;
        (t.exercises || []).forEach((e) => {
          if (e.role !== 'conditioning') e.sets = Math.max(1, e.sets - 1);
          const base = String(e.reps).replace(' на ногу', '');
          if (ALT_REPS[base]) e.reps = ALT_REPS[base] + (String(e.reps).includes('на ногу') ? ' на ногу' : '');
        });
        if (t.duration_min && s.kind !== 'strength') t.duration_min = Math.round((t.duration_min * 0.7) / 5) * 5;
      }
      notes.push(a.reason);
    }
    if (s.moved_to_treadmill) {
      t.location = 'treadmill';
      notes.push('Перенесено на дорожку: наклон 1%, формат тот же');
    }
    return Object.assign({}, s, { target: t, is_deload: isDeload, effective_duration: t.duration_min, notes });
  }

  function build(profileId) {
    const profile = db.get('profiles', profileId);
    if (!profile) return null;
    const today = D.today(profile.timezone);
    const measurements = db.forProfile('body_measurements', profileId).sort(byDate);
    const foodDays = db.forProfile('food_days', profileId).sort(byDate);
    const foodByDate = new Map(foodDays.map((f) => [f.date, f]));
    const targets = db
      .forProfile('nutrition_targets', profileId)
      .sort((a, b) => (a.valid_from === b.valid_from ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.valid_from < b.valid_from ? -1 : 1));
    const goals = db.forProfile('goals', profileId);
    const versions = new Map(goals.map((g) => [g.id, db.where('goal_versions', (v) => v.goal_id === g.id)]));
    const prefsAll = db.forProfile('training_preferences', profileId).sort((a, b) => (a.valid_from === b.valid_from ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.valid_from < b.valid_from ? -1 : 1));
    const prefs = prefsAll.length ? prefsAll[prefsAll.length - 1] : null;
    const plan = db.forProfile('plans', profileId, (p) => p.is_active)[0] || null;
    const sessions = plan ? db.where('planned_sessions', (s) => s.plan_id === plan.id).sort(byDate).map(effective) : [];
    const logs = db.forProfile('session_logs', profileId).sort(byDate);
    const events = db.forProfile('events', profileId).sort(byDate);
    const asms = db.forProfile('assessments', profileId).sort((x, y) => ((x.created_at || '') < (y.created_at || '') ? -1 : 1));
    const lastAsm = asms.length ? asms[asms.length - 1] : null;
    const doneIds = new Set(logs.filter((l) => l.done && l.planned_session_id).map((l) => l.planned_session_id));
    const currentWeight = HD.goals.currentValue(measurements, 'weight_kg', today, true);
    const ctx = {
      profile,
      profileId,
      today,
      measurements,
      foodDays,
      foodByDate,
      targets,
      goals,
      versions,
      prefs,
      plan,
      sessions,
      logs,
      events,
      doneIds,
      currentWeight,
      firstFoodDate: foodDays.length ? foodDays[0].date : null,
    };
    ctx.main = goals.find((g) => g.role === 'main' && g.status === 'active') || null;
    ctx.assessmentRow = lastAsm;
    ctx.answers = lastAsm ? lastAsm.answers : null;
    ctx.assessment = lastAsm ? lastAsm.result : null;
    ctx.secondaries = goals.filter((g) => g.role === 'secondary' && g.status === 'active');
    // Сценарий: как основная и дополнительные цели меняют питание и план
    const pOf = (g) => {
      const v = HD.goals.versionAt(versions.get(g.id), today);
      return v ? v.params : {};
    };
    ctx.scenario = HD.goals.scenario.scenario(ctx.main ? { type: ctx.main.type, params: pOf(ctx.main) } : null, ctx.secondaries.map((g) => ({ id: g.id, type: g.type, title: g.title, params: pOf(g) })));
    ctx.onboarding = {
      assessment: !!lastAsm && !!profile.onb_assessment,
      // Шаг «Цели» завершён, когда есть основная цель и пользователь подтвердил набор целей (кнопка «Далее»)
      goal: !!ctx.main && !!profile.onb_goals_done,
      schedule: !!prefs,
    };
    ctx.onboarding.done = ctx.onboarding.assessment && ctx.onboarding.goal && ctx.onboarding.schedule;
    ctx.strategyCtx = { measurements, logs, sessions, plan, today, currentWeight };
    return ctx;
  }

  function age(ctx, asOf) {
    return D.age(ctx.profile.birth_date, asOf || ctx.today);
  }

  function sessionsForDate(ctx, date) {
    return ctx.sessions.filter((s) => s.date === date);
  }

  function logFor(ctx, sessionId) {
    return ctx.logs.find((l) => l.planned_session_id === sessionId) || null;
  }

  // История упражнения из тренировок, выполненных через «Начать тренировку» (от новых к старым)
  function exerciseHistory(ctx, key, exceptSessionId) {
    const out = [];
    for (const l of ctx.logs.slice().reverse()) {
      if (!l.done || !l.exercises || l.planned_session_id === exceptSessionId) continue;
      const e = l.exercises.find((x) => x.exercise_key === key && x.done);
      if (e) out.push({ weight: e.weight_kg == null ? null : Number(e.weight_kg), feel: e.feel || 'ok', date: l.date });
    }
    return out;
  }

  // Вес для каждого упражнения: по ощущениям из прошлых тренировок (см. domain/progress.js).
  // Если упражнение раньше отмечали только вручную, берётся «рабочий вес в целевом упражнении» и самочувствие.
  function suggestedWeights(ctx, session) {
    if (session.kind !== 'strength') return session.target.exercises || [];
    const keyLift = ctx.main && ctx.main.type === 'strength_lift' ? HD.goals.versionAt(ctx.versions.get(ctx.main.id), ctx.today).params : null;
    return (session.target.exercises || []).map((e) => {
      const ex = HD.exerciseByKey(e.exercise_key);
      let history = exerciseHistory(ctx, e.exercise_key, session.id);
      if (!history.length && keyLift && keyLift.exercise_key === e.exercise_key) {
        history = ctx.logs
          .filter((l) => l.done && l.key_lift_kg != null && l.planned_session_id !== session.id)
          .reverse()
          .map((l) => ({ weight: Number(l.key_lift_kg), feel: l.wellbeing >= 8 ? 'easy' : l.wellbeing >= 6 || l.wellbeing == null ? 'ok' : 'hard', date: l.date }));
      }
      const sug = HD.progress.next(e.weight_kg, history, { step: HD.progress.stepFor(ex), deload: !!session.is_deload });
      return Object.assign({}, e, { weight_kg: sug.weight, suggest: sug });
    });
  }

  Object.assign(HD.svc, { ctx: build, effective, age, sessionsForDate, logFor, suggestedWeights, exerciseHistory, byDate });
})(window.HD);
