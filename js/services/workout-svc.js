// Прохождение тренировки по шагам: «Начать тренировку» в день, на который она назначена, или на следующий день,
// если её не выполнили. Упражнения отмечаются галочкой, для каждого спрашивается ощущение (легко / нормально /
// тяжело / не осилил), а фактические веса и ощущения запоминаются и используются при подборе следующих весов
// (domain/progress.js) и в правилах адаптации плана (domain/adapt.js).
(function (HD) {
  const D = HD.dates;
  const P = HD.progress;
  HD.svc = HD.svc || {};

  // ---- когда можно начать ----

  // Тренировку можно начать в её день или на следующий, если по ней ещё нет отметки (выполнена или пропущена)
  function isStartable(ctx, session) {
    if (!session || HD.svc.logFor(ctx, session.id)) return false;
    return session.date === ctx.today || session.date === D.addDays(ctx.today, -1);
  }

  // Тренировки, которые можно начать сейчас: сегодняшние и вчерашние невыполненные
  function startable(ctx) {
    return ctx.sessions
      .filter((s) => isStartable(ctx, s))
      .map((s) => ({ session: s, overdue: s.date !== ctx.today }))
      .sort((a, b) => (a.session.date < b.session.date ? -1 : a.session.date > b.session.date ? 1 : 0));
  }

  // ---- черновик на устройстве (нужен, чтобы перезагрузка страницы не стирала ход тренировки) ----
  const KEY = (id) => 'hd_workout:' + id;
  function loadDraft(id) {
    try {
      return JSON.parse(localStorage.getItem(KEY(id)) || 'null');
    } catch (e) {
      return null;
    }
  }
  function saveDraft(id, draft) {
    try {
      localStorage.setItem(KEY(id), JSON.stringify(draft));
    } catch (e) {}
  }
  function clearDraft(id) {
    try {
      localStorage.removeItem(KEY(id));
    } catch (e) {}
  }

  const isWeightEx = (key) => P.stepFor(HD.exerciseByKey(key)) > 0;

  // Новый черновик: веса предзаполнены подсказкой по прошлым ощущениям
  function newDraft(ctx, session) {
    const d = { session_id: session.id, started_at: new Date().toISOString(), warmup: false, exercises: {}, run: { duration: session.effective_duration || null, distance: null, feel: null, done: false } };
    for (const e of HD.svc.suggestedWeights(ctx, session)) d.exercises[e.exercise_key] = { done: false, weight: e.weight_kg == null ? null : e.weight_kg, feel: null };
    return d;
  }

  function draftFor(ctx, session) {
    const saved = loadDraft(session.id);
    if (saved && saved.session_id === session.id) {
      // Новые упражнения (план пересобрали) добавляем, старые не трогаем
      const fresh = newDraft(ctx, session);
      for (const k of Object.keys(fresh.exercises)) if (!saved.exercises[k]) saved.exercises[k] = fresh.exercises[k];
      return saved;
    }
    const d = newDraft(ctx, session);
    saveDraft(session.id, d);
    return d;
  }

  const num = (v) => (v === '' || v == null || isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

  /**
   * Завершить: собирает запись из черновика и сохраняет её (дальше сработают правила адаптации плана).
   * extra: { wellbeing, duration_min, note }
   */
  function finish(ctx, session, draft, extra) {
    extra = extra || {};
    const planned = session.target.exercises || [];
    const isStrength = session.kind === 'strength';
    const exercises = isStrength
      ? planned.map((e) => {
          const d = draft.exercises[e.exercise_key] || {};
          return {
            exercise_key: e.exercise_key,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            planned_weight_kg: e.weight_kg == null ? null : e.weight_kg,
            weight_kg: d.done && isWeightEx(e.exercise_key) ? num(d.weight) : null,
            done: !!d.done,
            feel: d.done ? d.feel || 'ok' : null,
          };
        })
      : null;
    let feel;
    let anyDone;
    if (isStrength) {
      const doneEx = exercises.filter((e) => e.done);
      anyDone = doneEx.length > 0;
      feel = P.summarize(doneEx.map((e) => e.feel));
    } else {
      anyDone = true;
      feel = draft.run.feel || 'ok';
    }
    // «Рабочий вес в целевом упражнении» для силовой цели берётся из фактического веса
    let keyLift = null;
    if (isStrength && ctx.scenario && ctx.scenario.plan.keyLifts.length) {
      const e = exercises.find((x) => x.exercise_key === ctx.scenario.plan.keyLifts[0] && x.done && x.weight_kg != null);
      if (e) keyLift = e.weight_kg;
    }
    const startedMs = draft.started_at ? Date.parse(draft.started_at) : null;
    const elapsed = startedMs ? Math.max(1, Math.round((Date.now() - startedMs) / 60000)) : null;
    const res = HD.svc.plan.saveLog(ctx.profileId, {
      planned_session_id: session.id,
      date: ctx.today,
      done: anyDone,
      kind: session.kind,
      title: session.title,
      duration_min: isStrength ? num(extra.duration_min) ?? elapsed : num(draft.run.duration) ?? num(extra.duration_min),
      distance_km: isStrength ? null : num(draft.run.distance),
      wellbeing: num(extra.wellbeing),
      key_lift_kg: keyLift,
      note: extra.note || null,
      source: 'workout',
      exercises,
      feel,
      started_at: draft.started_at,
      finished_at: new Date().toISOString(),
    });
    clearDraft(session.id);
    return res;
  }

  // «Не буду делать»: отметка о пропуске, по ней тренировка больше не предлагается начать
  function skip(ctx, session) {
    clearDraft(session.id);
    return HD.svc.plan.saveLog(ctx.profileId, { planned_session_id: session.id, date: ctx.today, done: false, kind: session.kind, title: session.title, source: 'workout' });
  }

  HD.svc.workout = { isStartable, startable, loadDraft, saveDraft, clearDraft, newDraft, draftFor, finish, skip, isWeightEx, parseNum: num };
})(window.HD);
