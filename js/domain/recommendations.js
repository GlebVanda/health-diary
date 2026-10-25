// Каталог правил рекомендаций (раздел 7 ТЗ). Каждое правило: id, приоритет (меньше — важнее),
// check(ctx) → null | { key, text }. key нужен, чтобы скрытая рекомендация не возвращалась в тот же период.
// В текстах нет медицинских советов.
(function (HD) {
  const D = HD.dates;
  const { num } = HD.util;

  const WINTER_MONTHS = [11, 12, 1, 2, 3];
  const isWinter = (date) => WINTER_MONTHS.includes(Number(date.slice(5, 7)));

  const RULES = [
    {
      id: 'fatigue',
      priority: 1,
      check(c) {
        const rated = c.logs.filter((l) => l.done && l.wellbeing != null && l.date <= c.today);
        if (rated.length < 2) return null;
        const [a, b] = rated.slice(-2);
        if (a.wellbeing <= 4 && b.wellbeing <= 4 && D.diffDays(b.date, c.today) <= 7) return { key: 'fatigue:' + b.id, text: 'Неделя облегчена, следи за сном' };
        return null;
      },
    },
    {
      id: 'food_missing',
      priority: 2,
      check(c) {
        const y = D.addDays(c.today, -1);
        if (c.firstFoodDate && y < c.firstFoodDate) return null;
        const f = c.foodByDate.get(y);
        if (f && f.kcal != null) return null;
        return { key: 'food_missing:' + y, text: 'Заполни вчерашний день, чтобы неделя засчиталась' };
      },
    },
    {
      id: 'budget_over',
      priority: 3,
      check(c) {
        const w = c.week;
        if (!w || !w.hasTarget || D.dow(c.today) === 6 || w.remaining >= 0) return null;
        return { key: 'budget_over:' + w.monday, text: `Перебор ${num(-w.remaining)} ккал уйдёт в следующую неделю` };
      },
    },
    {
      id: 'long_run_fuel',
      priority: 4,
      check(c) {
        const s = c.sessions.find((x) => x.kind === 'run' && x.date >= c.today && x.date <= D.addDays(c.today, 2) && (x.effective_duration || x.target.duration_min) >= 90);
        return s ? { key: 'long_run_fuel:' + s.id, text: 'Возьми воду и 30–60 г углеводов в час' } : null;
      },
    },
    {
      id: 'weigh_in',
      priority: 5,
      check(c) {
        const rows = c.measurements.filter((m) => m.weight_kg != null && m.date <= c.today);
        const last = rows.length ? rows[rows.length - 1].date : null;
        if (last && D.diffDays(last, c.today) <= 7) return null;
        return { key: 'weigh_in:' + D.monday(c.today), text: 'Взвесься, чтобы обновить норму' };
      },
    },
    {
      id: 'undereating',
      priority: 6,
      check(c) {
        const w = c.week;
        if (!w || !w.hasTarget || w.filled < 3 || w.avg == null) return null;
        return w.avg < 0.75 * w.dayNorm ? { key: 'undereating:' + w.monday, text: 'Слишком большой дефицит мешает восстановлению' } : null;
      },
    },
    {
      id: 'protein_low',
      priority: 7,
      check(c) {
        if (!c.target || !c.target.protein_g) return null;
        const days = D.range(D.addDays(c.today, -6), c.today);
        const rows = days.map((d) => c.foodByDate.get(d)).filter((f) => f && f.protein_g != null);
        const low = rows.filter((f) => f.protein_g < 0.8 * c.target.protein_g);
        if (low.length < 3) return null;
        const avg = rows.reduce((s, f) => s + Number(f.protein_g), 0) / rows.length;
        return { key: 'protein_low:' + D.monday(c.today), text: `Добавь белок, сейчас в среднем ${Math.round(avg)} г из ${c.target.protein_g}` };
      },
    },
    {
      id: 'behind_pace',
      priority: 8,
      check(c) {
        const m = c.main;
        if (!m || m.pace !== 'behind' || m.paceWeekAgo !== 'behind') return null;
        return { key: 'behind_pace:' + D.monday(c.today), text: 'Пересмотри дедлайн или добавь тренировку' };
      },
    },
    {
      id: 'plateau',
      priority: 9,
      check(c) {
        const m = c.main;
        if (!m || !['weight_loss', 'weight_gain'].includes(m.goal.type)) return null;
        const rows = c.measurements.filter((x) => x.weight_kg != null && x.date <= c.today);
        if (rows.length < 3) return null;
        const from = D.addDays(c.today, -21);
        const window = rows.filter((x) => x.date >= from);
        const before = rows.filter((x) => x.date < from);
        if (!before.length || window.length < 2) return null;
        const vals = window.map((x) => Number(x.weight_kg)).concat([Number(before[before.length - 1].weight_kg)]);
        if (Math.max(...vals) - Math.min(...vals) > 0.5) return null;
        return { key: 'plateau:' + D.monday(c.today), text: 'Плато: проверь точность подсчёта или снизь норму на 100 ккал' };
      },
    },
    {
      id: 'deload_next',
      priority: 11,
      check(c) {
        const nm = D.nextMonday(c.today);
        const s = c.sessions.find((x) => x.date >= nm && x.date <= D.addDays(nm, 6));
        return s && s.is_deload ? { key: 'deload_next:' + nm, text: 'Следующая неделя легче, это часть плана' } : null;
      },
    },
    {
      id: 'winter_run',
      priority: 12,
      check(c) {
        const s = c.sessions.find((x) => x.kind === 'run' && x.date >= c.today && x.date <= D.addDays(c.today, 6) && isWinter(x.date) && (x.target.location || 'street') === 'street' && !x.moved_to_treadmill);
        return s ? { key: 'winter_run:' + D.monday(c.today), text: 'Разминка дольше; при гололёде перенеси на дорожку' } : null;
      },
    },
  ];

  function evaluate(ctx, dismissedKeys, limit) {
    const out = [];
    for (const r of RULES) {
      let res = null;
      try {
        res = r.check(ctx);
      } catch (e) {
        res = null;
      }
      if (!res || (dismissedKeys && dismissedKeys.has(res.key))) continue;
      out.push({ id: r.id, priority: r.priority, key: res.key, text: res.text });
    }
    out.sort((a, b) => a.priority - b.priority);
    return out.slice(0, limit || 3);
  }

  HD.recommendations = { RULES, evaluate, isWinter };
})(window.HD);
