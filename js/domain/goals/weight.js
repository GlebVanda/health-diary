// Цели weight_loss / weight_gain: прогресс по среднему весу за 7 дней.
(function (HD) {
  const G = HD.goals;
  const fields = [
    { key: 'start_value', label: 'Стартовый вес', type: 'number', unit: 'кг', required: true },
    { key: 'target_value', label: 'Целевой вес', type: 'number', unit: 'кг', required: true },
    { key: 'deadline', label: 'Дедлайн', type: 'date' },
  ];

  function progress(p, ctx, asOf) {
    const current = G.currentValue(ctx.measurements, 'weight_kg', asOf, true);
    return {
      pct: G.linearProgress(Number(p.start_value), Number(p.target_value), current),
      current,
      unit: 'кг',
      metric: 'weight_kg',
    };
  }

  G.register({
    type: 'weight_loss',
    label: 'Снижение веса',
    short: 'Сбросить вес до целевого',
    roles: ['main', 'secondary'],
    fields,
    progress,
    nutrition(p, ctx) {
      const weeksLeft = p.deadline ? Math.max(1, HD.dates.diffDays(ctx.today, p.deadline) / 7) : null;
      return { mode: 'deficit', current: ctx.currentWeight, target: Number(p.target_value), weeksLeft, proteinPerKg: 1.8 };
    },
    widget: 'weight',
    metric: 'weight_kg',
    lowerIsBetter: true,
  });

  G.register({
    type: 'weight_gain',
    label: 'Набор веса',
    short: 'Набрать вес до целевого',
    roles: ['main', 'secondary'],
    fields,
    progress,
    nutrition() {
      return { mode: 'surplus', pct: 0.1, proteinPerKg: 1.8 };
    },
    widget: 'weight',
    metric: 'weight_kg',
    lowerIsBetter: false,
  });
})(window.HD);
