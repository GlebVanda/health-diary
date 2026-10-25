// Цель measurement: как у веса, но по последнему замеру объёма.
(function (HD) {
  const G = HD.goals;
  const FIELDS = [
    ['waist_cm', 'Талия'],
    ['hips_cm', 'Бёдра'],
    ['chest_cm', 'Грудь'],
  ];

  G.register({
    type: 'measurement',
    label: 'Объём тела',
    short: 'Уменьшить или увеличить обхват',
    roles: ['secondary'],
    fields: [
      { key: 'field', label: 'Объём', type: 'select', options: FIELDS, required: true },
      { key: 'start_value', label: 'Старт', type: 'number', unit: 'см', required: true },
      { key: 'target_value', label: 'Цель', type: 'number', unit: 'см', required: true },
      { key: 'deadline', label: 'Срок', type: 'date' },
    ],
    progress(p, ctx, asOf) {
      const field = p.field || 'waist_cm';
      const current = G.currentValue(ctx.measurements, field, asOf, false);
      return { pct: G.linearProgress(Number(p.start_value), Number(p.target_value), current), current, unit: 'см', metric: field };
    },
    nutrition(p, ctx) {
      const weeksLeft = p.deadline ? Math.max(1, HD.dates.diffDays(ctx.today, p.deadline) / 7) : null;
      return { mode: 'deficit', current: null, target: null, weeksLeft, proteinPerKg: 1.8 };
    },
    widget: 'measurement',
    lowerIsBetter: true,
    FIELDS,
  });
})(window.HD);
