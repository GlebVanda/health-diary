// Сервис плана: генерация, пересборка с сохранением прошлого, адаптация по факту, отмена изменений.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;

  function mainGoalInput(ctx) {
    const m = ctx.main;
    if (!m) return { type: 'consistency', params: {} };
    const v = HD.goals.versionAt(ctx.versions.get(m.id), ctx.today);
    return { type: m.type, params: v.params, version_id: v.id };
  }

  // Фактический уровень для старта нового плана: последний длинный бег и рабочие веса
  function actualHistory(ctx) {
    const from = D.addDays(ctx.today, -28);
    const runs = ctx.logs.filter((l) => l.done && l.kind === 'run' && l.date >= from && l.duration_min);
    const h = {};
    if (runs.length) {
      const best = Math.max(...runs.slice(-3).map((l) => Number(l.duration_min)));
      h.lastLongRunMin = Math.max(20, Math.round(best / 5) * 5);
    }
    // Достигнутая ступень формата — из последней плановой длинной пробежки до сегодня
    const pastLong = ctx.sessions.filter((s) => s.kind === 'run' && s.target.is_long && s.date < ctx.today && ctx.doneIds.has(s.id));
    if (pastLong.length) h.formatLevel = HD.plan.FORMATS.indexOf(pastLong[pastLong.length - 1].target.format);
    if (h.formatLevel < 0) delete h.formatLevel;
    const lifts = {};
    const goal = mainGoalInput(ctx);
    if (goal.type === 'strength_lift' && goal.params.exercise_key) {
      const l = ctx.logs.filter((x) => x.key_lift_kg != null).pop();
      if (l) lifts[goal.params.exercise_key] = Number(l.key_lift_kg);
    }
    h.lifts = lifts;
    return h;
  }

  /**
   * Создаёт новую версию плана с даты from (понедельник). Прошедшие плановые тренировки
   * старого плана переносятся в новый без изменений, будущие остаются в старой (неактивной) версии.
   */
  function generate(profileId, opts) {
    opts = opts || {};
    const ctx = HD.svc.ctx(profileId);
    if (!ctx.prefs) return null;
    const from = D.monday(opts.from || ctx.today);
    const goal = mainGoalInput(ctx);
    const history = opts.history || (opts.fresh ? {} : actualHistory(ctx));
    // Базовый уровень и ограничения берутся из актуальной анкеты подготовки
    const prefs = Object.assign({}, ctx.prefs, ctx.assessment ? { limits: ctx.assessment.limits, sedentary: ctx.assessment.sedentary } : {});
    const baseline = ctx.assessment ? ctx.assessment.baseline : ctx.prefs.baseline;
    const generated = HD.plan.generatePlan(goal, prefs, baseline, history, from, HD.EXERCISES, ctx.scenario);
    const old = ctx.plan;
    const plan = db.insert('plans', {
      profile_id: profileId,
      goal_version_id: goal.version_id || null,
      generated_at: new Date().toISOString(),
      generator: generated.generator,
      phases: generated.phases,
      is_active: true,
      start_date: generated.start_date,
      end_date: generated.end_date,
      weeks: generated.weeks,
      rolling: generated.rolling,
      meta: generated.meta,
      warnings: generated.warnings,
      prev_plan_id: old ? old.id : null,
      reason: opts.reason || 'Новый план',
    });
    // Уже прошедшие дни текущей недели остаются за старым планом вместе с отметками
    const cut = old && ctx.today > from ? ctx.today : from;
    db.insertMany(
      'planned_sessions',
      generated.sessions.filter((s) => s.date >= cut).map((s) => Object.assign({ plan_id: plan.id, profile_id: profileId, adjustments: [] }, s)),
    );
    let moved = [];
    if (old) {
      db.update('plans', old.id, { is_active: false });
      moved = db.where('planned_sessions', (s) => s.plan_id === old.id && s.date < cut);
      for (const s of moved) s.plan_id = plan.id;
      db.save();
    }
    const change = db.insert('plan_changes', {
      profile_id: profileId,
      type: 'rebuild',
      rule: opts.rule || 'manual',
      key: opts.key || null,
      reason: opts.reason || 'План пересобран',
      payload: { new_plan_id: plan.id, old_plan_id: old ? old.id : null, moved_ids: moved.map((s) => s.id), from, peak_before: old && old.meta ? old.meta.peak_long_run : null, peak_after: plan.meta.peak_long_run },
      auto: !!opts.auto,
    });
    HD.svc.nutrition.recalc(profileId, 'Изменился план');
    return { plan, change, warnings: generated.warnings };
  }

  // «Пересобрать план»: без ИИ — заново по правилам от фактического уровня с текущей недели
  async function rebuild(profileId, reason) {
    const res = generate(profileId, { reason: reason || 'Пересборка плана от фактического уровня' });
    const provider = HD.ai.getProvider(db.state.settings);
    if (provider.enabled && res) {
      try {
        const ctx = HD.svc.ctx(profileId);
        const plan = Object.assign({}, ctx.plan, { sessions: ctx.sessions.filter((s) => s.date >= ctx.today) });
        const edits = await provider.reviewPlan(plan, { goal: mainGoalInput(ctx), today: ctx.today });
        const { accepted, rejected } = HD.ai.validateEdits(plan, edits, ctx.prefs);
        applyAiEdits(accepted);
        res.ai = { accepted: accepted.length, rejected };
      } catch (e) {
        res.ai = { error: String(e.message || e) };
      }
    }
    return res;
  }

  function applyAiEdits(edits) {
    for (const e of edits) {
      const s = db.get('planned_sessions', e.session_id);
      if (!s) continue;
      if (e.type === 'move_day') db.update('planned_sessions', s.id, { date: e.to_date, ai: true });
      else if (e.type === 'scale_volume') {
        const t = s.target;
        if (t.duration_min) t.duration_min = Math.round((t.duration_min * e.factor) / 5) * 5;
        db.update('planned_sessions', s.id, { target: t, ai: true });
      } else if (e.type === 'replace_exercise') {
        const ex = HD.exerciseByKey(e.to_key);
        (s.target.exercises || []).forEach((x) => {
          if (x.exercise_key === e.from_key) Object.assign(x, { exercise_key: ex.key, name: ex.name, weight_kg: null });
        });
        db.update('planned_sessions', s.id, { target: s.target, ai: true });
      }
    }
  }

  // Изменения, которые накладываются на тренировки недели (облегчение, рост, разгрузка)
  function applyAdjustment(profileId, action) {
    const ctx = HD.svc.ctx(profileId);
    const targets = db.where('planned_sessions', (s) => s.plan_id === ctx.plan.id && s.date >= action.from && s.date <= action.to);
    if (!targets.length) return null;
    const change = db.insert('plan_changes', {
      profile_id: profileId,
      type: action.type,
      rule: action.rule,
      key: action.key,
      reason: action.reason,
      payload: { session_ids: targets.map((s) => s.id), from: action.from, to: action.to },
      auto: true,
    });
    for (const s of targets) {
      s.adjustments = (s.adjustments || []).concat([{ change_id: change.id, type: action.type, factor: action.factor, plus_min: action.plus_min, plus_kg: action.plus_kg, reason: action.reason }]);
    }
    db.save();
    return change;
  }

  // Прогон правил адаптации: при каждой отметке и при открытии приложения (вместо ночного запуска)
  function adapt(profileId) {
    const ctx = HD.svc.ctx(profileId);
    if (!ctx.plan) return [];
    const applied = new Set(db.forProfile('plan_changes', profileId).map((c) => c.key).filter(Boolean));
    const ov = HD.svc.goals.overview(ctx);
    const actions = HD.adapt.evaluate({
      plan: ctx.plan,
      sessions: ctx.sessions,
      logs: ctx.logs,
      today: ctx.today,
      goalType: ctx.main ? ctx.main.type : null,
      goalPace: ov.main ? ov.main.pace : null,
      applied,
    });
    const changes = [];
    for (const a of actions) {
      if (a.type === 'rebuild') {
        const hist = Object.assign(actualHistory(HD.svc.ctx(profileId)), a.level.lastLongRunMin != null ? { lastLongRunMin: a.level.lastLongRunMin } : {});
        const res = generate(profileId, { from: a.from, history: hist, reason: a.reason, rule: a.rule, key: a.key, auto: true });
        if (res) {
          // Если пик стал ниже — значит запаса до дедлайна не было и пик срезан
          const p = res.change.payload;
          if (a.rule === 'underperform' && p.peak_before && p.peak_after < p.peak_before) {
            db.update('plan_changes', res.change.id, { reason: a.reason.replace('Неделя повторяется', `Пик срезан до ${p.peak_after} мин`) });
          }
          if (a.checkRealism && res.warnings.length) db.update('plan_changes', res.change.id, { reason: a.reason + '. ' + res.warnings.join(' ') });
          changes.push(db.get('plan_changes', res.change.id));
        }
      } else {
        const c = applyAdjustment(profileId, a);
        if (c) changes.push(c);
      }
    }
    return changes;
  }

  function undo(changeId) {
    const c = db.get('plan_changes', changeId);
    if (!c || c.reverted_at) return false;
    if (c.type === 'rebuild') {
      const { new_plan_id, old_plan_id, moved_ids } = c.payload;
      const np = db.get('plans', new_plan_id);
      if (!np || !np.is_active) return false;
      db.update('plans', new_plan_id, { is_active: false });
      if (old_plan_id) {
        db.update('plans', old_plan_id, { is_active: true });
        for (const id of moved_ids) {
          const s = db.get('planned_sessions', id);
          if (s) s.plan_id = old_plan_id;
        }
      }
    } else {
      for (const id of c.payload.session_ids) {
        const s = db.get('planned_sessions', id);
        if (s) (s.adjustments || []).forEach((a) => a.change_id === changeId && (a.reverted = true));
      }
    }
    db.update('plan_changes', changeId, { reverted_at: new Date().toISOString() });
    HD.svc.nutrition.recalc(c.profile_id, 'Отмена изменения плана');
    return true;
  }

  function moveToTreadmill(sessionId, value) {
    return db.update('planned_sessions', sessionId, { moved_to_treadmill: value !== false });
  }

  // Отметка выполнения (плановая или внеплановая) → сразу прогон адаптации
  function saveLog(profileId, data) {
    const row = {
      profile_id: profileId,
      planned_session_id: data.planned_session_id || null,
      date: data.date,
      done: !!data.done,
      kind: data.kind || 'other',
      title: data.title || null,
      duration_min: data.duration_min === '' || data.duration_min == null ? null : Number(data.duration_min),
      distance_km: data.distance_km === '' || data.distance_km == null ? null : Number(data.distance_km),
      wellbeing: data.wellbeing === '' || data.wellbeing == null ? null : Number(data.wellbeing),
      key_lift_kg: data.key_lift_kg === '' || data.key_lift_kg == null ? null : Number(data.key_lift_kg),
      note: data.note || null,
      source: data.source || 'manual',
    };
    // Тренировка, пройденная по шагам: упражнения с весами и ощущениями, общее ощущение, время начала и конца
    if (data.exercises) row.exercises = data.exercises;
    if (data.feel) row.feel = data.feel;
    if (data.started_at) row.started_at = data.started_at;
    if (data.finished_at) row.finished_at = data.finished_at;
    let log;
    if (data.id) log = db.update('session_logs', data.id, row);
    else if (row.planned_session_id) log = db.upsert('session_logs', (l) => l.profile_id === profileId && l.planned_session_id === row.planned_session_id, row).row;
    else log = db.insert('session_logs', row);
    const changes = adapt(profileId);
    return { log, changes };
  }

  function removeLog(logId) {
    db.remove('session_logs', logId);
  }

  // Первый запуск: план по анкете от даты анкеты (для Анны — 12.10.2026)
  function ensurePlan(profileId) {
    const ctx = HD.svc.ctx(profileId);
    if (ctx.plan || !ctx.prefs || !ctx.main) return null;
    // Первый план всегда строится с текущей недели: прошлое тренировок не планируется задним числом
    return generate(profileId, { from: ctx.today, fresh: true, reason: 'Первый план по анкете' });
  }

  function savePreferences(profileId, prefs) {
    const today = D.today();
    const existing = db.forProfile('training_preferences', profileId, (p) => p.valid_from === today)[0];
    const row = Object.assign({ profile_id: profileId, valid_from: today }, prefs);
    return existing ? db.update('training_preferences', existing.id, row) : db.insert('training_preferences', row);
  }

  function changes(profileId) {
    return db.forProfile('plan_changes', profileId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  HD.svc.plan = { generate, rebuild, adapt, undo, moveToTreadmill, saveLog, removeLog, ensurePlan, savePreferences, changes, actualHistory, mainGoalInput };
})(window.HD);
