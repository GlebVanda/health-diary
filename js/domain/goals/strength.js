// Цель strength_lift: (лучший key_lift_kg − старт) / (цель − старт).
(function (HD) {
  const G = HD.goals;

  function bestLift(logs, from, to) {
    let best = null;
    for (const l of logs) {
      if (l.key_lift_kg == null || l.date > to || (from && l.date < from)) continue;
      best = best == null ? Number(l.key_lift_kg) : Math.max(best, Number(l.key_lift_kg));
    }
    return best;
  }

  G.register({
    type: 'strength_lift',
    label: 'Рост силовых показателей',
    short: 'Поднять рабочий вес в упражнении',
    roles: ['main', 'secondary'],
    fields: [
      { key: 'exercise_key', label: 'Упражнение', type: 'exercise', required: true },
      { key: 'start_value', label: 'Стартовый рабочий вес', type: 'number', unit: 'кг', required: true },
      { key: 'target_value', label: 'Целевой вес', type: 'number', unit: 'кг', required: true },
      { key: 'deadline', label: 'Дедлайн', type: 'date' },
    ],
    progress(p, ctx, asOf) {
      const start = Number(p.start_value);
      const target = Number(p.target_value);
      const best = bestLift(ctx.logs, p.start_date, asOf);
      const current = best == null ? start : Math.max(best, start);
      const pct = target === start ? 100 : ((current - start) / (target - start)) * 100;
      return { pct, current, unit: 'кг' };
    },
    nutrition() {
      return { mode: 'maintenance', pct: 0.05, proteinPerKg: 1.8 };
    },
    widget: 'lift',
    bestLift,
  });
})(window.HD);
