// «Динамика» (раздел 8 ТЗ): день/неделя/месяц/год, листание, сравнение двух периодов одной длины.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const C = HD.charts;
  const A = HD.aggregate;
  const { esc, num } = HD.util;

  const GRANS = [
    ['day', 'День'],
    ['week', 'Неделя'],
    ['month', 'Месяц'],
    ['year', 'Год'],
  ];

  function source(ctx) {
    const NS = HD.svc.nutrition;
    const weeks = NS.weeks(ctx, D.monday(D.addDays(ctx.today, 400)));
    const byMonday = new Map(weeks.map((w) => [w.monday, w]));
    return {
      today: ctx.today,
      foodByDate: ctx.foodByDate,
      dayNormFor: (d) => {
        const w = byMonday.get(D.monday(d));
        return w && w.hasTarget ? w.dayNorm : null;
      },
      weeks,
      logs: ctx.logs,
      sessions: ctx.sessions,
      measurements: ctx.measurements,
      goalPctAt: (d) => HD.svc.goals.totalAt(ctx, d),
    };
  }

  function fmtVal(v, m) {
    if (v == null) return '—';
    return num(v, m.digits || (m.unit === '%' ? 0 : 0)) + (m.unit && m.unit !== '' ? ' ' + m.unit : '');
  }

  function summaryCards(ag) {
    const items = [
      ['Калории, среднее', ag.kcal_avg != null ? num(ag.kcal_avg) + ' ккал' : '—'],
      ['Дней в норме', ag.kcal_in_norm_pct != null ? Math.round(ag.kcal_in_norm_pct) + '%' : '—'],
      ['Отклонение от бюджета', ag.kcal_deviation != null ? (ag.kcal_deviation > 0 ? '+' : '') + num(ag.kcal_deviation) : '—'],
      ['Заполнено дней', Math.round(ag.filled_pct) + '%'],
      ['Тренировок', ag.trainings + (ag.plan_done_pct != null ? ` · план ${Math.round(ag.plan_done_pct)}%` : '')],
      ['Минут / км бега', `${num(ag.minutes)} / ${num(ag.run_km, 1)}`],
      ['Самочувствие', ag.wellbeing_avg != null ? num(ag.wellbeing_avg, 1) : '—'],
      ['Самый длинный бег', ag.longest_run ? ag.longest_run + ' мин' : '—'],
      ['Вес, среднее', ag.weight_avg != null ? num(ag.weight_avg, 1) + ' кг' : '—'],
      ['Изменение веса', ag.weight_change != null ? (ag.weight_change > 0 ? '+' : '') + num(ag.weight_change, 1) + ' кг' : '—'],
      ['Цель на конец', ag.goal_pct_end != null ? Math.round(ag.goal_pct_end) + '%' : '—'],
      ['Прирост цели', ag.goal_pct_gain != null ? (ag.goal_pct_gain >= 0 ? '+' : '') + num(ag.goal_pct_gain, 1) + ' п.п.' : '—'],
      ['Засчитано недель ✓', ag.weeks_total ? `${ag.weeks_counted} из ${ag.weeks_total}` : '—'],
      ['Белки / жиры / углеводы', ag.protein_avg != null ? `${Math.round(ag.protein_avg)} / ${ag.fat_avg != null ? Math.round(ag.fat_avg) : '—'} / ${ag.carbs_avg != null ? Math.round(ag.carbs_avg) : '—'} г` : '—'],
    ];
    if (ag.best_lift != null) items.push(['Лучший рабочий вес', num(ag.best_lift, 1) + ' кг']);
    return `<section class="card"><div class="kv small">${items.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div></section>`;
  }

  function charts(ctx, src, p, gran) {
    const days = D.range(p.from, p.to);
    const x = (d) => D.diffDays(p.from, d);
    const out = [];
    // Калории: столбцы + линия нормы (за год — средние по неделям)
    if (gran === 'year') {
      const weeks = [];
      for (let m = D.monday(p.from); m <= p.to; m = D.addDays(m, 7)) weeks.push(m);
      const bars = weeks.map((m, i) => {
        const vals = D.weekDays(m).map((d) => src.foodByDate.get(d)).filter((f) => f && f.kcal != null).map((f) => Number(f.kcal));
        return { x: i, y: vals.length ? HD.util.avg(vals) : null };
      });
      const norm = weeks.map((m, i) => ({ x: i, y: src.dayNormFor(m) }));
      out.push(`<section class="card"><h2>Калории, среднее в день по неделям</h2>${C.chart({ bars, lines: [{ points: norm, color: 'var(--chart-3)', step: true }], xTicks: weeks.map((m, i) => ({ x: i, label: D.dm(m) })).filter((_, i) => i % 8 === 0), wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Факт' }, { color: 'var(--chart-3)', label: 'Норма' }])}</section>`);
    } else if (gran !== 'day') {
      const bars = days.map((d) => {
        const f = src.foodByDate.get(d);
        const k = f && f.kcal != null ? Number(f.kcal) : null;
        const color = { over: 'var(--danger)', under: 'var(--chart-3)' }[HD.nutrition.dayColor(k, src.dayNormFor(d))] || 'var(--chart-1)';
        return { x: x(d), y: k, color, title: `${D.dm(d)}: ${k == null ? 'нет данных' : num(k) + ' ккал'}` };
      });
      const norm = days.map((d) => ({ x: x(d), y: src.dayNormFor(d) }));
      out.push(`<section class="card"><h2>Калории</h2>${C.chart({ bars, lines: [{ points: norm, color: 'var(--chart-3)', step: true }], xTicks: HD.ui.widgets.xTicksForRange(p.from, p.to), wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Факт' }, { color: 'var(--chart-3)', label: 'Норма дня' }])}</section>`);
    }
    // Вес + ступенчатая линия цели
    const wrows = ctx.measurements.filter((m) => m.weight_kg != null && m.date >= p.from && m.date <= p.to);
    if (gran !== 'day') {
      const main = ctx.main && ['weight_loss', 'weight_gain'].includes(ctx.main.type) ? ctx.main : null;
      const lines = [{ points: wrows.map((m) => ({ x: x(m.date), y: Number(m.weight_kg) })), color: 'var(--chart-1)', dots: true }];
      const markers = [];
      if (main) {
        const steps = HD.svc.goals.targetSteps(ctx, main);
        const before = steps.filter((s) => s.date <= p.from).pop();
        const pts = before ? [{ x: 0, y: before.value }] : [];
        steps.filter((s) => s.date > p.from && s.date <= p.to).forEach((s) => {
          pts.push({ x: x(s.date), y: s.value });
          markers.push({ x: x(s.date), label: s.reason });
        });
        lines.push({ points: pts, color: 'var(--chart-3)', step: true, dashed: true, extendTo: x(p.to) });
      }
      out.push(`<section class="card"><h2>Вес</h2>${C.chart({ xMin: 0, xMax: x(p.to), lines, markers, xTicks: HD.ui.widgets.xTicksForRange(p.from, p.to), yFormat: (v) => num(v, 1), wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Вес' }].concat(main ? [{ color: 'var(--chart-3)', label: 'Цель' }] : []))}</section>`);
    }
    // Тренировки по неделям: план и факт
    if (gran !== 'day') {
      const weeks = [];
      for (let m = D.monday(p.from); m <= p.to; m = D.addDays(m, 7)) weeks.push(m);
      const bars = weeks.map((m, i) => ({ x: i, y: ctx.logs.filter((l) => l.done && D.monday(l.date) === m).length, color: 'var(--chart-1)' }));
      const planLine = weeks.map((m, i) => ({ x: i, y: ctx.plan ? ctx.sessions.filter((s) => D.monday(s.date) === m).length || null : null }));
      out.push(`<section class="card"><h2>Тренировки по неделям</h2>${C.chart({ bars, lines: [{ points: planLine, color: 'var(--chart-2)', dots: true }], xTicks: weeks.map((m, i) => ({ x: i, label: D.dm(m) })).filter((_, i) => weeks.length <= 8 || i % Math.ceil(weeks.length / 8) === 0), height: 160, wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Сделано' }, { color: 'var(--chart-2)', label: 'По плану' }])}</section>`);
      // Процент цели во времени
      const step = gran === 'year' ? 7 : gran === 'month' ? 3 : 1;
      const pts = [];
      for (let d = p.from; d <= p.to && d <= ctx.today; d = D.addDays(d, step)) pts.push({ x: x(d), y: src.goalPctAt(d) });
      if (p.to >= ctx.today && p.from <= ctx.today) pts.push({ x: x(ctx.today), y: src.goalPctAt(ctx.today) });
      out.push(`<section class="card"><h2>Общий процент цели</h2>${C.chart({ xMin: 0, xMax: x(p.to), lines: [{ points: pts, color: 'var(--chart-1)', width: 3 }], yMin: 0, yMax: 100, xTicks: HD.ui.widgets.xTicksForRange(p.from, p.to), yFormat: (v) => v + '%', height: 160, wide: true })}</section>`);
    }
    return out.join('');
  }

  function presetPeriods(preset, today) {
    switch (preset) {
      case 'week': {
        const a = A.periodOf('week', today);
        return { a, b: A.shiftPeriod('week', a, -1), gran: 'week' };
      }
      case 'month': {
        const a = A.periodOf('month', today);
        return { a, b: A.shiftPeriod('month', a, -1), gran: 'month' };
      }
      case 'month_year': {
        const a = A.periodOf('month', today);
        return { a, b: A.shiftPeriod('month', a, -12), gran: 'month' };
      }
    }
    return null;
  }

  function overlay(ctx, src, a, b) {
    const len = D.diffDays(a.from, a.to) + 1;
    const byWeek = len > 62;
    const series = (p) => {
      const pts = [];
      if (byWeek) {
        let i = 0;
        for (let m = p.from; m <= p.to; m = D.addDays(m, 7), i++) {
          const vals = D.range(m, D.min(D.addDays(m, 6), p.to)).map((d) => src.foodByDate.get(d)).filter((f) => f && f.kcal != null).map((f) => Number(f.kcal));
          pts.push({ x: i + 1, y: vals.length ? HD.util.avg(vals) : null });
        }
      } else D.range(p.from, p.to).forEach((d, i) => {
        const f = src.foodByDate.get(d);
        pts.push({ x: i + 1, y: f && f.kcal != null ? Number(f.kcal) : null });
      });
      return pts;
    };
    const wser = (p) => ctx.measurements.filter((m) => m.weight_kg != null && m.date >= p.from && m.date <= p.to).map((m) => ({ x: D.diffDays(p.from, m.date) + 1, y: Number(m.weight_kg) }));
    const sa = series(a);
    const ticks = sa.filter((_, i) => i % Math.max(1, Math.ceil(sa.length / 8)) === 0).map((p) => ({ x: p.x, label: String(p.x) }));
    return `<section class="card"><h2>Калории: наложение по ${byWeek ? 'неделям' : 'дням'}</h2>${C.chart({ lines: [{ points: sa, color: 'var(--chart-1)', dots: true }, { points: series(b), color: 'var(--chart-2)', dots: true, dashed: true }], xTicks: ticks, wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Период А' }, { color: 'var(--chart-2)', label: 'Период Б' }])}</section>
      <section class="card"><h2>Вес: наложение по дням</h2>${C.chart({ lines: [{ points: wser(a), color: 'var(--chart-1)', dots: true }, { points: wser(b), color: 'var(--chart-2)', dots: true, dashed: true }], xMin: 1, xMax: len, xTicks: ticks.length ? ticks : [{ x: 1, label: '1' }], yFormat: (v) => num(v, 1), wide: true })}${C.legend([{ color: 'var(--chart-1)', label: 'Период А' }, { color: 'var(--chart-2)', label: 'Период Б' }])}</section>`;
  }

  function compareView(ctx, src, st) {
    let a;
    let b;
    let gran = 'custom';
    const pre = st.preset !== 'custom' ? presetPeriods(st.preset, ctx.today) : null;
    if (pre) ({ a, b, gran } = pre);
    else {
      a = { from: st.aFrom || D.addDays(ctx.today, -13), to: st.aTo || D.addDays(ctx.today, -7) };
      if (a.to < a.from) a = { from: a.to, to: a.from };
      const len = D.diffDays(a.from, a.to);
      const bFrom = st.bFrom || D.addDays(a.from, -(len + 1));
      b = { from: bFrom, to: D.addDays(bFrom, len) };
    }
    const agA = A.aggregate(src, a.from, a.to);
    const agB = A.aggregate(src, b.from, b.to);
    const rows = A.compare(agA, agB, ctx.main ? ctx.main.type : null);
    const label = (p) => (gran === 'custom' ? D.short(p.from, true) + ' – ' + D.short(p.to, true) : A.periodLabel(gran, p));
    const presets = [
      ['week', 'Эта ↔ прошлая неделя'],
      ['month', 'Этот ↔ прошлый месяц'],
      ['month_year', 'Месяц ↔ год назад'],
      ['custom', 'Свои даты'],
    ];
    return `<div class="chips" style="margin-bottom:10px">${presets.map(([k, l]) => `<button class="chip ${st.preset === k ? 'on' : ''}" data-preset="${k}">${l}</button>`).join('')}</div>
      ${st.preset === 'custom' ? `<form class="card grid2" data-form="custom" style="margin-bottom:12px">
        ${ui.field('А: с', `<input class="input" type="date" name="aFrom" value="${a.from}">`)}${ui.field('А: по', `<input class="input" type="date" name="aTo" value="${a.to}">`)}
        ${ui.field('Б: с (та же длина)', `<input class="input" type="date" name="bFrom" value="${b.from}">`)}<div style="align-self:end"><button class="btn primary block">Сравнить</button></div>
      </form>` : ''}
      <section class="card scroll-x">
        <table class="cmp"><thead><tr><th>Метрика</th><th>А<div class="tiny">${esc(label(a))}</div></th><th>Б<div class="tiny">${esc(label(b))}</div></th><th>Разница</th></tr></thead>
        <tbody>${rows
          .filter((m) => m.a != null || m.b != null)
          .map((m) => `<tr><td>${esc(m.label)}</td><td>${fmtVal(m.a, m)}</td><td>${fmtVal(m.b, m)}</td><td class="${m.verdict || ''}">${m.diff == null ? '—' : (m.diff > 0 ? '+' : '') + num(m.diff, m.digits || 0)}${m.pct != null && isFinite(m.pct) && m.unit !== '%' ? `<div class="tiny">${m.pct > 0 ? '+' : ''}${Math.round(m.pct)}%</div>` : ''}</td></tr>`)
          .join('')}</tbody></table>
        <div class="tiny muted" style="margin-top:6px">Зелёным — лучше, красным — хуже с учётом типа цели.</div>
      </section>
      ${overlay(ctx, src, a, b)}`;
  }

  // Раздел «Динамика» встроен в главный экран (ниже блоков «сегодня / неделя / цель»)
  function body(ctx) {
    const st = ui.ls.get('dyn', { gran: 'week', anchor: null, compare: false, preset: 'week' });
    const src = source(ctx);
    const head = `<div class="row" style="margin-bottom:10px"><div class="grow">${ui.widgets.seg('gran', st.compare ? '' : st.gran, GRANS)}</div><button class="btn small ${st.compare ? 'primary' : ''}" data-act="compare">Сравнить</button></div>`;
    if (st.compare) return head + `<div class="stack">${compareView(ctx, src, st)}</div>`;
    const anchor = st.anchor && D.isValid(st.anchor) ? st.anchor : ctx.today;
    const p = A.periodOf(st.gran, anchor);
    const ag = A.aggregate(src, p.from, p.to);
    return `${head}
      <div class="row between" style="margin-bottom:10px">
        <button class="icon-btn" data-shift="-1">${ui.icon('left')}</button>
        <b>${esc(A.periodLabel(st.gran, p))}</b>
        <button class="icon-btn" data-shift="1">${ui.icon('right')}</button>
      </div>
      <div class="stack">${summaryCards(ag)}${charts(ctx, src, p, st.gran)}</div>`;
  }

  ui.dynamics = {
    render(ctx) {
      return `<section class="a-dyn" id="dyn"><div class="section-title" style="margin-top:8px">Динамика и сравнение периодов</div>${body(ctx)}</section>`;
    },
    bind(root, ctx) {
      const st = ui.ls.get('dyn', { gran: 'week', anchor: null, compare: false, preset: 'week' });
      // Перерисовка без прыжка к началу страницы
      const save = (patch) => {
        ui.ls.set('dyn', Object.assign(st, patch));
        const y = window.scrollY;
        ui.render();
        window.scrollTo(0, y);
      };
      root.querySelectorAll('[data-seg="gran"] button').forEach((b) => (b.onclick = () => save({ gran: b.dataset.v, compare: false })));
      root.querySelector('[data-act="compare"]').onclick = () => save({ compare: !st.compare });
      const shift = (n) => {
        const anchor = st.anchor && D.isValid(st.anchor) ? st.anchor : ctx.today;
        save({ anchor: A.shiftPeriod(st.gran, A.periodOf(st.gran, anchor), n).from });
      };
      root.querySelectorAll('[data-shift]').forEach((b) => (b.onclick = () => shift(Number(b.dataset.shift))));
      if (!st.compare) ui.onSwipe(root, () => shift(1), () => shift(-1));
      root.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => save({ preset: b.dataset.preset })));
      const cf = root.querySelector('[data-form="custom"]');
      if (cf)
        cf.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(cf);
          save({ aFrom: v.aFrom, aTo: v.aTo, bFrom: v.bFrom });
        };
    },
  };

  // Старый адрес #/dynamics ведёт к разделу на главном экране
  ui.views.dynamics = {
    title: 'Главная',
    render: () => '',
    bind() {
      ui.ls.set('scroll_to_dyn', true);
      location.replace('#/home');
    },
  };
})(window.HD);
