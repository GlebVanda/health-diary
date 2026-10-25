// Недельный бюджет калорий с переносом перебора (раздел 5.2 ТЗ).
(function (HD) {
  const D = HD.dates;

  /**
   * Считает недели подряд от первой недели с нормой до weekTo.
   * input:
   *   foodByDate: Map(date → {kcal, ...})
   *   targetFor(monday) → { daily_kcal, floor } | null — норма, действующая на понедельник
   *   trainingsFor(monday) → { done, planned } — для статуса ✓
   *   capPct — максимум вычета, доля базового бюджета (по умолчанию 0,15)
   *   fromMonday, toMonday
   */
  function computeWeeks(input) {
    const capPct = input.capPct == null ? 0.15 : input.capPct;
    const out = [];
    let prevRemaining = null;
    for (let monday = input.fromMonday; monday <= input.toMonday; monday = D.addDays(monday, 7)) {
      const t = input.targetFor(monday);
      const days = D.weekDays(monday);
      const entries = days.map((d) => {
        const f = input.foodByDate.get(d);
        return f && f.kcal != null ? f : null;
      });
      const filled = entries.filter(Boolean);
      const eaten = filled.reduce((s, f) => s + Number(f.kcal), 0);
      if (!t || !t.daily_kcal) {
        out.push({ monday, days, entries, eaten, filled: filled.length, hasTarget: false });
        prevRemaining = null;
        continue;
      }
      const base = t.daily_kcal * 7;
      const overage = prevRemaining != null && prevRemaining < 0 ? -prevRemaining : 0;
      const floorWeek = (t.floor || 0) * 7;
      let deduction = Math.min(overage, capPct * base);
      if (floorWeek && base - deduction < floorWeek) deduction = Math.max(0, base - floorWeek);
      const budget = base - deduction;
      const remaining = budget - eaten;
      const unfilled = 7 - filled.length;
      const tr = input.trainingsFor ? input.trainingsFor(monday) : { done: 0, planned: 0 };
      const counted = filled.length === 7 && remaining >= 0 && tr.done >= tr.planned;
      out.push({
        monday,
        days,
        entries,
        hasTarget: true,
        daily_base: t.daily_kcal,
        base,
        overage,
        deduction,
        budget,
        dayNorm: budget / 7,
        eaten,
        filled: filled.length,
        remaining,
        perDayLeft: unfilled > 0 ? remaining / unfilled : null,
        avg: filled.length ? eaten / filled.length : null,
        trainings: tr,
        counted,
        target: t,
      });
      prevRemaining = remaining;
    }
    return out;
  }

  HD.budget = { computeWeeks };
})(window.HD);
