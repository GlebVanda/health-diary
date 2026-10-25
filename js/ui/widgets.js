// Виджеты цели: свой для каждого типа (раздел 4 ТЗ). Используются на главном экране и в динамике.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const C = HD.charts;
  const { esc, num } = HD.util;

  const PERIODS = [
    ['week', 'Неделя'],
    ['month', 'Месяц'],
    ['year', 'Год'],
    ['all', 'Всё'],
  ];

  function rangeFor(period, today, startDate) {
    if (period === 'week') return { from: D.addDays(today, -6), to: today };
    if (period === 'month') return { from: D.addDays(today, -29), to: today };
    if (period === 'year') return { from: D.addDays(today, -364), to: today };
    return { from: startDate || D.addDays(today, -364), to: today };
  }

  function xTicksForRange(from, to) {
    const days = D.diffDays(from, to);
    const n = Math.min(6, days + 1);
    const ticks = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round((days * i) / Math.max(1, n - 1));
      ticks.push({ x, label: D.dm(D.addDays(from, x)) });
    }
    return ticks;
  }

  // Прогноз даты достижения: линейный тренд по взвешиваниям за последние 28 дней
  function forecast(measurements, field, target, today) {
    const rows = measurements.filter((m) => m[field] != null && m.date <= today && D.diffDays(m.date, today) <= 28);
    if (rows.length < 3) return null;
    const x0 = rows[0].date;
    const xs = rows.map((r) => D.diffDays(x0, r.date));
    const ys = rows.map((r) => Number(r[field]));
    const mx = HD.util.avg(xs);
    const my = HD.util.avg(ys);
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i] - my);
      sxx += (x - mx) * (x - mx);
    });
    if (!sxx) return null;
    const slope = sxy / sxx;
    const lastX = D.diffDays(x0, today);
    const lastY = my + slope * (lastX - mx);
    if (!slope || (target - lastY) / slope <= 0) return { slope, lastY, date: null };
    const days = Math.round((target - lastY) / slope);
    if (days > 3650) return { slope, lastY, date: null };
    return { slope, lastY, date: D.addDays(today, days), days };
  }

  function seg(name, value, options) {
    return `<div class="seg" data-seg="${name}">${options.map(([k, l]) => `<button data-v="${k}" class="${k === value ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }

  function metricWidget(ctx, item, period, field, unit) {
    const p = item.params;
    const range = rangeFor(period, ctx.today, p.start_date);
    const rows = ctx.measurements.filter((m) => m[field] != null && m.date >= range.from && m.date <= range.to);
    const steps = HD.svc.goals.targetSteps(ctx, item.goal).filter((s) => s.value != null);
    const x = (d) => D.diffDays(range.from, d);
    const targetPts = [];
    let cur = null;
    for (const s of steps) {
      if (s.date <= range.from) cur = s.value;
    }
    if (cur != null) targetPts.push({ x: 0, y: cur });
    for (const s of steps) if (s.date > range.from && s.date <= range.to) targetPts.push({ x: x(s.date), y: s.value });
    const markers = steps.slice(1).filter((s) => s.date > range.from && s.date <= range.to).map((s) => ({ x: x(s.date), label: s.reason }));
    const fc = forecast(ctx.measurements, field, Number(p.target_value), ctx.today);
    const lines = [
      { points: rows.map((r) => ({ x: x(r.date), y: Number(r[field]), title: `${D.dm(r.date)}: ${num(r[field], 1)} ${unit}` })), color: 'var(--chart-1)', dots: true },
      { points: targetPts, color: 'var(--chart-3)', step: true, dashed: true, extendTo: x(range.to) },
    ];
    if (fc && rows.length) {
      const lastX = x(ctx.today);
      const endX = lastX + Math.max(7, Math.round(D.diffDays(range.from, range.to) * 0.15));
      lines.push({ points: [{ x: lastX, y: fc.lastY }, { x: endX, y: fc.lastY + fc.slope * (endX - lastX) }], color: 'var(--chart-2)', dashed: true, width: 1.6 });
    }
    const pace = fc ? fc.slope * 7 : null;
    const svg = C.chart({ xMin: 0, xMax: x(range.to) + (fc ? Math.max(7, Math.round(D.diffDays(range.from, range.to) * 0.15)) : 0), lines, markers, xTicks: xTicksForRange(range.from, range.to), yFormat: (v) => num(v, 1) });
    return `${svg}${C.legend([{ color: 'var(--chart-1)', label: 'Факт' }, { color: 'var(--chart-3)', label: 'Цель' }, { color: 'var(--chart-2)', label: 'Прогноз' }])}
      <div class="grid2" style="margin-top:10px">
        <div><div class="tiny muted">Темп</div><b class="num">${pace == null ? '—' : (pace > 0 ? '+' : '') + num(pace, 2) + ' ' + unit + '/нед'}</b></div>
        <div><div class="tiny muted">Прогноз достижения</div><b>${fc && fc.date ? D.short(fc.date, true) : '—'}</b></div>
      </div>`;
  }

  function longRunWidget(ctx, item, period) {
    if (!ctx.plan) return '<div class="muted small">План ещё не построен — заполните анкету.</div>';
    const plan = ctx.plan;
    const weeks = [];
    const curWeek = Math.floor(D.diffDays(plan.start_date, ctx.today) / 7) + 1;
    const span = period === 'week' ? 4 : period === 'month' ? 8 : plan.weeks;
    let from = period === 'all' || period === 'year' ? 1 : Math.max(1, curWeek - Math.floor(span / 2));
    let to = period === 'all' || period === 'year' ? plan.weeks : Math.min(plan.weeks, from + span - 1);
    for (let w = from; w <= to; w++) {
      const monday = D.addDays(plan.start_date, (w - 1) * 7);
      const s = ctx.sessions.find((x) => x.kind === 'run' && x.target.is_long && D.monday(x.date) === monday);
      const fact = ctx.logs.filter((l) => l.done && l.kind === 'run' && D.monday(l.date) === monday).reduce((m, l) => Math.max(m, Number(l.duration_min) || 0), 0);
      weeks.push({ w, plan: s ? s.effective_duration : null, fact: monday <= ctx.today ? fact || null : null });
    }
    const svg = C.chart({
      bars: weeks.map((x) => ({ x: x.w, y: x.fact, color: 'var(--chart-1)', title: `Нед. ${x.w}: ${x.fact || 0} мин` })),
      lines: [{ points: weeks.map((x) => ({ x: x.w, y: x.plan, title: `Нед. ${x.w}: план ${x.plan} мин` })), color: 'var(--chart-2)', dots: true }],
      xTicks: weeks.filter((x, i) => weeks.length <= 10 || i % Math.ceil(weeks.length / 8) === 0).map((x) => ({ x: x.w, label: String(x.w) })),
      yFormat: (v) => num(v),
    });
    const phase = HD.plan.phaseOf(plan.phases, Math.max(1, Math.min(plan.weeks, curWeek)));
    return `${svg}${C.legend([{ color: 'var(--chart-1)', label: 'Факт, мин' }, { color: 'var(--chart-2)', label: 'План, мин' }])}
      <div class="grid2" style="margin-top:10px">
        <div><div class="tiny muted">Лучший за 28 дней</div><b class="num">${item.bestLongRun || 0} из ${item.peak || '—'} мин</b></div>
        <div><div class="tiny muted">Фаза</div><b>${esc(phase.name)}</b> <span class="muted small">нед. ${Math.max(1, curWeek)} из ${plan.weeks}</span></div>
      </div>`;
  }

  function liftWidget(ctx, item, period) {
    const p = item.params;
    const range = rangeFor(period, ctx.today, p.start_date);
    const x = (d) => D.diffDays(range.from, d);
    const rows = ctx.logs.filter((l) => l.key_lift_kg != null && l.date >= range.from && l.date <= range.to);
    const steps = HD.svc.goals.targetSteps(ctx, item.goal);
    const tp = [{ x: 0, y: steps.filter((s) => s.date <= range.from).pop()?.value ?? steps[0].value }].concat(steps.filter((s) => s.date > range.from).map((s) => ({ x: x(s.date), y: s.value })));
    const ex = HD.exerciseByKey(p.exercise_key);
    return `${C.chart({ xMin: 0, xMax: x(range.to), lines: [{ points: rows.map((r) => ({ x: x(r.date), y: Number(r.key_lift_kg) })), color: 'var(--chart-1)', dots: true }, { points: tp, color: 'var(--chart-3)', step: true, dashed: true, extendTo: x(range.to) }], xTicks: xTicksForRange(range.from, range.to), yFormat: (v) => num(v, 1) })}
      ${C.legend([{ color: 'var(--chart-1)', label: (ex ? ex.name : 'Рабочий вес') + ', кг' }, { color: 'var(--chart-3)', label: 'Цель' }])}`;
  }

  function streakWidget(ctx, item) {
    const st = HD.goals.get('consistency').weekStats(item.params, ctx.logs, ctx.today);
    const last = st.weeks.slice(-12);
    return `<div class="row"><div class="big num">${st.streak}</div><div class="muted">${HD.util.plural(st.streak, 'неделя', 'недели', 'недель')} подряд с нормой ${st.need} в неделю</div></div>
      ${C.chart({ height: 140, bars: last.map((w, i) => ({ x: i, y: w.count, color: w.ok ? 'var(--chart-1)' : 'var(--chart-3)' })), lines: [{ points: last.map((w, i) => ({ x: i, y: st.need })), color: 'var(--chart-2)', dashed: true }], xTicks: last.map((w, i) => ({ x: i, label: D.dm(w.monday) })).filter((_, i) => i % 2 === 0) })}`;
  }

  function runDistanceWidget(ctx, item) {
    const p = item.params;
    return `<div class="bar"><i style="width:${item.pct || 0}%"></i></div>
      <div class="small muted" style="margin-top:6px">Лучшая пробежка: ${num(item.current || 0, 1)} из ${num(p.target_value, 1)} км${p.deadline ? ' · срок ' + D.short(p.deadline, true) : ''}</div>`;
  }

  function goalWidget(ctx, item, period) {
    if (!item) return '<div class="muted small">Главная цель не задана. <a href="#/goals">Добавить цель</a></div>';
    const s = item.strategy;
    switch (s.widget) {
      case 'weight':
        return metricWidget(ctx, item, period, 'weight_kg', 'кг');
      case 'measurement':
        return metricWidget(ctx, item, period, item.params.field || 'waist_cm', 'см');
      case 'longrun':
        return longRunWidget(ctx, item, period);
      case 'lift':
        return liftWidget(ctx, item, period);
      case 'streak':
        return streakWidget(ctx, item);
      case 'run_distance':
        return runDistanceWidget(ctx, item);
    }
    return '';
  }

  const WIDGET_TITLE = { weight: 'Вес', measurement: 'Объём', longrun: 'Длинные пробежки: план и факт', lift: 'Рабочий вес', streak: 'Серия недель', run_distance: 'Беговая дистанция' };

  ui.widgets = { goalWidget, seg, PERIODS, forecast, rangeFor, xTicksForRange, WIDGET_TITLE };
})(window.HD);
