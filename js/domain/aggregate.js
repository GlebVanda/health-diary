// Агрегация за период и сравнение двух периодов (раздел 8 ТЗ). Одна функция для всех экранов.
(function (HD) {
  const D = HD.dates;
  const { avg, sum } = HD.util;

  /**
   * src: {
   *   foodByDate: Map, dayNormFor(date) → число | null, weeks: [результат budget.computeWeeks],
   *   logs, sessions (плановые), measurements, goalPctAt(date) → % | null
   * }
   */
  function aggregate(src, from, to) {
    const days = D.range(from, to);
    const food = days.map((d) => ({ d, f: src.foodByDate.get(d), norm: src.dayNormFor(d) }));
    const filled = food.filter((x) => x.f && x.f.kcal != null);
    const kcals = filled.map((x) => Number(x.f.kcal));
    const inNorm = filled.filter((x) => x.norm && Math.abs(x.f.kcal / x.norm - 1) <= 0.05).length;
    const withNorm = filled.filter((x) => x.norm);
    const deviation = withNorm.length ? sum(withNorm, (x) => x.f.kcal - x.norm) : null;
    const macro = (k) => avg(filled.filter((x) => x.f[k] != null).map((x) => Number(x.f[k])));

    const weeksIn = (src.weeks || []).filter((w) => w.monday >= from && D.addDays(w.monday, 6) <= to && w.hasTarget);

    const logs = src.logs.filter((l) => l.done && l.date >= from && l.date <= to);
    const planned = (src.sessions || []).filter((s) => s.date >= from && s.date <= to);
    const doneIds = new Set(logs.map((l) => l.planned_session_id).filter(Boolean));
    const runs = logs.filter((l) => l.kind === 'run');
    const wb = logs.filter((l) => l.wellbeing != null).map((l) => Number(l.wellbeing));

    const meas = src.measurements.filter((m) => m.date >= from && m.date <= to);
    const series = (k) => meas.filter((m) => m[k] != null).map((m) => Number(m[k]));
    const change = (k) => {
      const s = series(k);
      return s.length >= 2 ? s[s.length - 1] - s[0] : null;
    };
    const lifts = logs.filter((l) => l.key_lift_kg != null).map((l) => Number(l.key_lift_kg));

    const lastDay = to < D.today() ? to : D.today();
    const pctEnd = src.goalPctAt ? src.goalPctAt(lastDay) : null;
    const pctStart = src.goalPctAt ? src.goalPctAt(D.addDays(from, -1)) : null;

    return {
      from,
      to,
      days: days.length,
      kcal_avg: avg(kcals),
      kcal_sum: kcals.length ? sum(kcals) : null,
      kcal_in_norm_pct: filled.length ? (inNorm / filled.length) * 100 : null,
      kcal_deviation: deviation,
      protein_avg: macro('protein_g'),
      fat_avg: macro('fat_g'),
      carbs_avg: macro('carbs_g'),
      // Будущие дни текущего периода не считаются незаполненными
      filled_pct: (filled.length / Math.max(1, days.filter((d) => d <= (src.today || D.today())).length)) * 100,
      weeks_counted: weeksIn.filter((w) => w.counted).length,
      weeks_total: weeksIn.length,
      trainings: logs.length,
      plan_done_pct: planned.length ? (planned.filter((s) => doneIds.has(s.id)).length / planned.length) * 100 : null,
      minutes: sum(logs, (l) => Number(l.duration_min) || 0),
      run_km: sum(runs, (l) => Number(l.distance_km) || 0),
      wellbeing_avg: avg(wb),
      longest_run: runs.length ? Math.max(...runs.map((l) => Number(l.duration_min) || 0)) : null,
      weight_avg: avg(series('weight_kg')),
      weight_change: change('weight_kg'),
      waist_change: change('waist_cm'),
      hips_change: change('hips_cm'),
      chest_change: change('chest_cm'),
      goal_pct_end: pctEnd,
      goal_pct_gain: pctEnd != null && pctStart != null ? pctEnd - pctStart : null,
      best_lift: lifts.length ? Math.max(...lifts) : null,
    };
  }

  // Описание метрик для таблицы сравнения: better — что считается улучшением
  function metricDefs(goalType) {
    const loss = ['weight_loss', 'measurement'].includes(goalType);
    const gain = goalType === 'weight_gain';
    return [
      { key: 'kcal_avg', label: 'Калории, среднее в день', unit: 'ккал', better: null },
      { key: 'kcal_sum', label: 'Калории, сумма', unit: 'ккал', better: null },
      { key: 'kcal_in_norm_pct', label: 'Дней в норме (±5%)', unit: '%', better: 'higher' },
      { key: 'kcal_deviation', label: 'Отклонение от бюджета', unit: 'ккал', better: 'closer0' },
      { key: 'protein_avg', label: 'Белок, среднее', unit: 'г', better: 'higher' },
      { key: 'fat_avg', label: 'Жиры, среднее', unit: 'г', better: null },
      { key: 'carbs_avg', label: 'Углеводы, среднее', unit: 'г', better: null },
      { key: 'filled_pct', label: 'Заполнено дней', unit: '%', better: 'higher' },
      { key: 'weeks_counted', label: 'Засчитано недель ✓', unit: '', better: 'higher' },
      { key: 'trainings', label: 'Тренировок', unit: '', better: 'higher' },
      { key: 'plan_done_pct', label: 'Выполнение плана', unit: '%', better: 'higher' },
      { key: 'minutes', label: 'Минут тренировок', unit: 'мин', better: 'higher' },
      { key: 'run_km', label: 'Км бега', unit: 'км', better: 'higher', digits: 1 },
      { key: 'wellbeing_avg', label: 'Самочувствие, среднее', unit: '', better: 'higher', digits: 1 },
      { key: 'longest_run', label: 'Самый длинный бег', unit: 'мин', better: 'higher' },
      { key: 'weight_avg', label: 'Вес, среднее', unit: 'кг', better: loss ? 'lower' : gain ? 'higher' : null, digits: 1 },
      { key: 'weight_change', label: 'Изменение веса', unit: 'кг', better: loss ? 'lower' : gain ? 'higher' : null, digits: 1 },
      { key: 'waist_change', label: 'Изменение талии', unit: 'см', better: loss ? 'lower' : null, digits: 1 },
      { key: 'goal_pct_end', label: 'Цель на конец периода', unit: '%', better: 'higher' },
      { key: 'goal_pct_gain', label: 'Прирост цели', unit: 'п.п.', better: 'higher', digits: 1 },
      { key: 'best_lift', label: 'Лучший рабочий вес', unit: 'кг', better: 'higher', digits: 1 },
    ];
  }

  function compare(a, b, goalType) {
    return metricDefs(goalType).map((m) => {
      const va = a[m.key];
      const vb = b[m.key];
      const diff = va != null && vb != null ? va - vb : null;
      const pct = diff != null && vb ? (diff / Math.abs(vb)) * 100 : null;
      let verdict = null;
      if (diff != null && Math.abs(diff) > 1e-9 && m.better) {
        if (m.better === 'higher') verdict = diff > 0 ? 'better' : 'worse';
        else if (m.better === 'lower') verdict = diff < 0 ? 'better' : 'worse';
        else if (m.better === 'closer0') verdict = Math.abs(va) < Math.abs(vb) ? 'better' : 'worse';
      }
      return Object.assign({}, m, { a: va, b: vb, diff, pct, verdict });
    });
  }

  // Период по гранулярности, содержащий дату
  function periodOf(gran, date) {
    switch (gran) {
      case 'day':
        return { from: date, to: date };
      case 'week':
        return { from: D.monday(date), to: D.sunday(date) };
      case 'month':
        return { from: D.monthStart(date), to: D.monthEnd(date) };
      case 'year':
        return { from: D.yearStart(date), to: D.yearEnd(date) };
    }
  }

  function shiftPeriod(gran, period, n) {
    switch (gran) {
      case 'day':
        return periodOf('day', D.addDays(period.from, n));
      case 'week':
        return periodOf('week', D.addDays(period.from, 7 * n));
      case 'month':
        return periodOf('month', D.addMonths(period.from, n));
      case 'year':
        return periodOf('year', D.addYears(period.from, n));
    }
  }

  function periodLabel(gran, p) {
    if (gran === 'day') return D.short(p.from, true);
    if (gran === 'week') return D.weekLabel(p.from);
    if (gran === 'month') return D.monthLabel(p.from);
    if (gran === 'year') return p.from.slice(0, 4);
    return D.short(p.from, true) + ' – ' + D.short(p.to, true);
  }

  HD.aggregate = { aggregate, compare, metricDefs, periodOf, shiftPeriod, periodLabel };
})(window.HD);
