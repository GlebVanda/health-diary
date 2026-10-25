// Цель race: 60% — лучший длинный бег за 28 дней относительно пика плана, 40% — доля выполненных тренировок.
(function (HD) {
  const G = HD.goals;
  const D = HD.dates;

  function bestLongRun(logs, from, to) {
    let best = 0;
    for (const l of logs) {
      if (!l.done || l.kind !== 'run' || l.date < from || l.date > to) continue;
      best = Math.max(best, Number(l.duration_min) || 0);
    }
    return best;
  }

  // Доля выполненных плановых тренировок с начала плана до даты
  function completionShare(sessions, logs, from, asOf) {
    const doneIds = new Set(logs.filter((l) => l.done && l.planned_session_id).map((l) => l.planned_session_id));
    let planned = 0;
    let done = 0;
    for (const s of sessions) {
      if (s.date < from || s.date > asOf) continue;
      if (s.date === asOf && !doneIds.has(s.id)) continue;
      planned++;
      if (doneIds.has(s.id)) done++;
    }
    return planned ? done / planned : null;
  }

  G.register({
    type: 'race',
    label: 'Подготовка к забегу',
    short: 'Финишировать на забеге в выбранную дату',
    roles: ['main'],
    fields: [
      { key: 'distance_min', label: 'Дистанция от', type: 'number', unit: 'км', required: true },
      { key: 'distance_max', label: 'Дистанция до', type: 'number', unit: 'км' },
      { key: 'elevation_m', label: 'Набор высоты', type: 'number', unit: 'м' },
      { key: 'deadline', label: 'Дата старта', type: 'date', required: true },
      { key: 'surface', label: 'Покрытие', type: 'select', options: [['trail', 'Трейл'], ['road', 'Дорога']] },
      { key: 'aim', label: 'Цель', type: 'select', options: [['finish', 'Финиш'], ['time', 'Время']] },
      { key: 'target_time_min', label: 'Целевое время', type: 'number', unit: 'мин' },
    ],
    progress(p, ctx, asOf) {
      const peak = ctx.plan && ctx.plan.meta && ctx.plan.meta.peak_long_run;
      const best = bestLongRun(ctx.logs, D.addDays(asOf, -27), asOf);
      const runPart = peak ? Math.min(1, best / peak) : 0;
      const from = (ctx.plan && ctx.plan.start_date) || p.start_date;
      const share = from ? completionShare(ctx.sessions || [], ctx.logs, from, asOf) : null;
      const pct = 60 * runPart + 40 * (share || 0);
      return {
        pct,
        current: best,
        unit: 'мин',
        note: `Лучший длинный бег за 28 дней: ${best} из ${peak || '—'} мин; выполнено ${share == null ? '—' : Math.round(share * 100) + '%'} тренировок`,
        bestLongRun: best,
        peak,
        completion: share,
      };
    },
    nutrition(p, ctx) {
      // Поддержание, если нет второстепенной цели по весу (её учитывает сервис нормы)
      return { mode: 'maintenance', carbsMinPerKg: 4 };
    },
    widget: 'longrun',
    bestLongRun,
    completionShare,
  });
})(window.HD);
