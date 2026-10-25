// Дополнительная цель run_distance: пробежать N км без остановки (или за один раз).
// Прогресс — лучшая дистанция одной пробежки относительно цели.
(function (HD) {
  const G = HD.goals;

  function bestRun(logs, from, to) {
    let best = 0;
    for (const l of logs) {
      if (!l.done || l.kind !== 'run' || l.distance_km == null || l.date > to || (from && l.date < from)) continue;
      best = Math.max(best, Number(l.distance_km));
    }
    return best;
  }

  G.register({
    type: 'run_distance',
    label: 'Пробежать дистанцию',
    short: 'Пробежать N км за одну пробежку',
    roles: ['secondary'],
    fields: [
      { key: 'start_value', label: 'Сейчас пробегаю', type: 'number', unit: 'км' },
      { key: 'target_value', label: 'Хочу пробежать', type: 'number', unit: 'км', required: true },
      { key: 'deadline', label: 'Срок', type: 'date' },
    ],
    progress(p, ctx, asOf) {
      const start = Number(p.start_value) || 0;
      const target = Number(p.target_value);
      const best = Math.max(start, bestRun(ctx.logs, p.start_date, asOf));
      return { pct: target > start ? ((best - start) / (target - start)) * 100 : 100, current: best, unit: 'км' };
    },
    nutrition() {
      return { mode: 'maintenance' };
    },
    widget: 'run_distance',
    bestRun,
  });
})(window.HD);
