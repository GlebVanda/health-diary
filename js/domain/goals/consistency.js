// Цель consistency: доля недель, где выполнена норма тренировок в неделю.
(function (HD) {
  const G = HD.goals;
  const D = HD.dates;

  // Недели (пн) от старта до последней завершённой недели на asOf
  function weekStats(p, logs, asOf) {
    const need = Number(p.per_week) || 1;
    const start = D.monday(p.start_date || asOf);
    const lastFull = D.addDays(D.monday(asOf), -7);
    const byWeek = new Map();
    for (const l of logs) {
      if (!l.done) continue;
      const m = D.monday(l.date);
      byWeek.set(m, (byWeek.get(m) || 0) + 1);
    }
    const weeks = [];
    for (let m = start; m <= lastFull; m = D.addDays(m, 7)) weeks.push({ monday: m, count: byWeek.get(m) || 0, ok: (byWeek.get(m) || 0) >= need });
    // Текущая неделя засчитывается, как только норма набрана
    const cur = D.monday(asOf);
    if (cur >= start && (byWeek.get(cur) || 0) >= need) weeks.push({ monday: cur, count: byWeek.get(cur), ok: true });
    let streak = 0;
    for (let i = weeks.length - 1; i >= 0 && weeks[i].ok; i--) streak++;
    return { weeks, streak, need };
  }

  G.register({
    type: 'consistency',
    label: 'Общая форма и регулярность',
    short: 'Тренироваться регулярно, не привязываясь к цифрам',
    roles: ['main', 'secondary'],
    fields: [
      { key: 'per_week', label: 'Тренировок в неделю', type: 'number', required: true },
      { key: 'deadline', label: 'Срок', type: 'date' },
    ],
    progress(p, ctx, asOf) {
      const st = weekStats(p, ctx.logs, asOf);
      const total = st.weeks.length;
      const ok = st.weeks.filter((w) => w.ok).length;
      return { pct: total ? (ok / total) * 100 : 0, current: st.streak, unit: 'нед. подряд', streak: st.streak };
    },
    nutrition() {
      return { mode: 'maintenance' };
    },
    widget: 'streak',
    weekStats,
  });
})(window.HD);
