// Ближайшие события на главном экране: 14 дней, до 5 штук.
(function (HD) {
  const D = HD.dates;

  function upcoming(c, limit) {
    const to = D.addDays(c.today, 14);
    const items = [];
    const inRange = (d) => d >= c.today && d <= to;

    // Следующие тренировки (две ближайшие)
    c.sessions
      .filter((s) => inRange(s.date) && !c.doneIds.has(s.id))
      .slice(0, 2)
      .forEach((s) => items.push({ date: s.date, kind: 'session', title: s.title, ref: s.id, prio: 3 }));

    // Начало разгрузки или новой фазы
    if (c.plan) {
      for (const p of c.plan.phases) {
        const start = D.addDays(c.plan.start_date, (p.from - 1) * 7);
        if (p.from > 1 && inRange(start)) items.push({ date: start, kind: 'phase', title: 'Новая фаза: ' + p.name, prio: 2 });
      }
      for (let w = 1; w <= c.plan.weeks; w++) {
        if (!HD.plan.isDeloadWeek(c.plan.phases, w)) continue;
        const start = D.addDays(c.plan.start_date, (w - 1) * 7);
        if (inRange(start)) items.push({ date: start, kind: 'deload', title: 'Начало разгрузочной недели', prio: 2 });
      }
      // Контрольная точка: пик длинного бега
      const peak = c.sessions.find((s) => s.kind === 'run' && s.target.is_long && s.target.duration_min === c.plan.meta.peak_long_run);
      if (peak && inRange(peak.date)) items.push({ date: peak.date, kind: 'checkpoint', title: `Контрольная точка: пик ${peak.target.duration_min} мин`, prio: 1 });
    }

    // Напоминание о взвешивании
    const w = c.measurements.filter((m) => m.weight_kg != null);
    const last = w.length ? w[w.length - 1].date : null;
    if (!last || D.diffDays(last, c.today) > 7) items.push({ date: c.today, kind: 'weigh', title: 'Пора взвеситься', prio: 1 });

    // Сроки второстепенных задач и дедлайн главной цели
    for (const g of c.goals) {
      if (g.goal.status !== 'active' || !g.params || !g.params.deadline || !inRange(g.params.deadline)) continue;
      if (g.goal.role === 'main') items.push({ date: g.params.deadline, kind: 'deadline', title: 'Дедлайн цели: ' + g.goal.title, prio: 0 });
      else if (g.pct < 100) items.push({ date: g.params.deadline, kind: 'goal', title: 'Срок цели: ' + g.goal.title, prio: 1 });
    }

    // Ручные события
    for (const e of c.events) if (inRange(e.date)) items.push({ date: e.date, kind: 'event', title: e.title, ref: e.id, prio: 0 });

    items.sort((a, b) => (a.date === b.date ? a.prio - b.prio : a.date < b.date ? -1 : 1));
    // Если событий больше лимита, оставляем самые важные, сохраняя порядок по дате
    if (items.length > (limit || 5)) {
      const keep = items
        .map((x, i) => ({ x, i }))
        .sort((a, b) => a.x.prio - b.x.prio || a.i - b.i)
        .slice(0, limit || 5)
        .sort((a, b) => a.i - b.i)
        .map((o) => o.x);
      return keep;
    }
    return items;
  }

  HD.upcoming = { upcoming };
})(window.HD);
