// Прогрессия весов по ощущениям: после тренировки по каждому упражнению отмечается, как оно прошло
// (легко / нормально / тяжело / не осилил), а при следующей тренировке вес подбирается по этой истории.
//
//   легко          → вес растёт на шаг (штанга и блоки +2,5 кг, гантели +1 кг, гиря +2 кг);
//   нормально      → вес тот же; два раза подряд «нормально» с одним весом → растёт на шаг;
//   тяжело         → вес тот же; два раза подряд «тяжело» с одним весом → снижается на шаг;
//   не осилил(а)   → вес снижается на шаг или на 5% (что больше);
//   разгрузочная неделя → вес без роста.
// Чистые функции: история приходит параметром, ничего не читается из хранилища.
(function (HD) {
  const FEELS = [
    ['easy', 'Легко'],
    ['ok', 'Нормально'],
    ['hard', 'Тяжело'],
    ['fail', 'Не осилил(а)'],
  ];
  const FEEL_LABEL = Object.fromEntries(FEELS);

  const round05 = (v) => Math.round(v * 2) / 2;

  // Шаг прогрессии по оборудованию упражнения; 0 — вес не растёт (вес тела, время)
  function stepFor(ex) {
    const eq = (ex && ex.equipment) || [];
    if (eq.includes('dumbbells')) return 1;
    if (eq.includes('kettlebell')) return 2;
    if (eq.some((e) => ['barbell', 'cable', 'machines'].includes(e))) return 2.5;
    return 0;
  }

  // Нужен ли вес для упражнения (есть ли что взвешивать)
  function usesWeight(ex) {
    return stepFor(ex) > 0 || (ex && ex.equipment && ex.equipment.some((e) => ['platform'].includes(e)) && ex.equipment.includes('dumbbells'));
  }

  /**
   * planned — вес по плану (может быть null); history — выполненные записи по упражнению от новых к старым:
   * [{ weight, feel, date }]; opts: { step, deload }.
   * → { weight, action: 'plan' | 'up' | 'keep' | 'down', reason, last }
   */
  function next(planned, history, opts) {
    opts = opts || {};
    const step = opts.step || 0;
    const done = (history || []).filter((h) => h && h.feel);
    const last = done[0] || null;
    if (!last || last.weight == null) {
      return { weight: planned == null ? null : planned, action: 'plan', reason: planned == null ? 'Подберите рабочий вес: после тренировки приложение запомнит его' : 'Вес по плану', last };
    }
    const w = Number(last.weight);
    if (!step) return { weight: w, action: 'keep', reason: 'Вес не меняется', last };
    // Сколько последних тренировок подряд с тем же весом и тем же ощущением
    const streak = (feels) => {
      let n = 0;
      for (const h of done) {
        if (Number(h.weight) === w && feels.includes(h.feel)) n++;
        else break;
      }
      return n;
    };
    if (last.feel === 'fail') {
      const down = Math.max(step, w * 0.05);
      return { weight: Math.max(0, round05(w - down)), action: 'down', reason: 'В прошлый раз не получилось: вес снижен', last };
    }
    if (opts.deload) return { weight: w, action: 'keep', reason: 'Разгрузочная неделя: вес без роста', last };
    if (last.feel === 'easy') return { weight: round05(w + step), action: 'up', reason: `Было легко: +${String(step).replace('.', ',')} кг`, last };
    if (last.feel === 'hard') {
      if (streak(['hard']) >= 2) return { weight: Math.max(0, round05(w - step)), action: 'down', reason: 'Два раза подряд было тяжело: вес чуть снижен', last };
      return { weight: w, action: 'keep', reason: 'Было тяжело: вес тот же', last };
    }
    // ok
    if (streak(['ok']) >= 2) return { weight: round05(w + step), action: 'up', reason: `Два раза подряд нормально: +${String(step).replace('.', ',')} кг`, last };
    return { weight: w, action: 'keep', reason: 'Было нормально: вес тот же, при следующем таком же — прибавим', last };
  }

  // Общее ощущение от тренировки по ощущениям от упражнений: больше половины «не осилил» — fail,
  // иначе самое частое; при равенстве — более тяжёлое
  function summarize(feels) {
    const f = (feels || []).filter(Boolean);
    if (!f.length) return null;
    const cnt = { easy: 0, ok: 0, hard: 0, fail: 0 };
    f.forEach((x) => cnt[x]++);
    if (cnt.fail > f.length / 2) return 'fail';
    let best = 'easy';
    for (const k of ['easy', 'ok', 'hard']) if (cnt[k] >= cnt[best]) best = k;
    if (cnt.fail > 0 && best !== 'hard' && cnt.fail >= cnt[best]) return 'hard';
    return best;
  }

  HD.progress = { FEELS, FEEL_LABEL, stepFor, usesWeight, next, summarize };
})(window.HD);
