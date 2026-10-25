// Эталонный тест генератора (раздел 6.6 ТЗ): план Анны к горному трейлу.
// Допуск по ТЗ: ±1 неделя и ±10 мин. Сверка с docs/reference-plan-demo.md.
(function (HD) {
  const D = HD.dates;
  const goal = { type: 'race', params: HD.seed.DASHA_RACE };
  const prefs = HD.seed.DASHA_PREFS;
  const plan = HD.plan.generatePlan(goal, prefs, prefs.baseline, {}, '2026-10-12');
  const longOf = (w) => {
    const s = plan.sessions.find((x) => x.kind === 'run' && x.target.is_long && x.week_index === w);
    return s ? s.target : null;
  };
  const phase = (key) => plan.phases.find((p) => p.key === key);
  const strength = (tpl, week) => plan.sessions.find((s) => s.kind === 'strength' && s.target.template === tpl && (week == null || s.week_index === week));
  const names = (s) => s.target.exercises.map((e) => e.name);

  // Эталон из «Плана подготовки к горному трейлу»
  const REF_LONG = [30, 35, 40, 30, 45, 50, 55, 40, 60, 65, 70, 50, 75, 80, 85, 60, 90, 95, 100, 70, 110, 120, 130, 90, 140, 150, 110, 75, 30];

  describe('Эталон 6.6: план Анны', () => {
    it('29 недель с 12.10.2026', () => {
      expect(plan.weeks).toBe(29);
      expect(plan.start_date).toBe('2026-10-12');
      expect(plan.rolling).toBeFalsy();
    });
    it('фазы: адаптация 1–6, база 7–16, развитие 17–24, специфика 25–26, подводка 27–29', () => {
      const exp = { adaptation: [1, 6], base: [7, 16], development: [17, 24], specific: [25, 26], taper: [27, 29] };
      for (const [k, [from, to]] of Object.entries(exp)) {
        expect(phase(k).from).toBeWithin(from - 1, from + 1);
        expect(phase(k).to).toBeWithin(to - 1, to + 1);
      }
    });
    it('разгрузки на неделях 4, 8, 12, 16, 20, 24', () => {
      const weeks = [...new Set(plan.sessions.filter((s) => s.is_deload).map((s) => s.week_index))];
      expect(weeks).toEqual([4, 8, 12, 16, 20, 24]);
    });
    it('длинный бег: 30 → 50 (нед. 6) → 85 (нед. 15) → 130 (нед. 23) → пик 150 (нед. 26) → 110 → 75 → 30', () => {
      expect(longOf(1).duration_min).toBe(30);
      expect(longOf(6).duration_min).toBeWithin(40, 60);
      expect(longOf(15).duration_min).toBeWithin(75, 95);
      expect(longOf(23).duration_min).toBeWithin(120, 140);
      expect(plan.meta.peak_long_run).toBe(150);
      expect(longOf(26).duration_min).toBe(150);
      expect(longOf(27).duration_min).toBeWithin(100, 120);
      expect(longOf(28).duration_min).toBeWithin(65, 85);
      expect(longOf(29).duration_min).toBeWithin(20, 40);
    });
    it('все длинные пробежки в пределах ±10 мин от эталона', () => {
      const bad = REF_LONG.map((ref, i) => ({ w: i + 1, ref, got: longOf(i + 1).duration_min })).filter((x) => Math.abs(x.got - x.ref) > 10);
      expect(bad).toEqual([]);
    });
    it('пик ≈ ожидаемое время × 0,7: 20 км × 7,5 + 600 м набора = 210 мин', () => {
      expect(plan.meta.expected_race_min).toBe(210);
    });
    it('формат: с 2/1 до непрерывного к неделе 13', () => {
      expect(longOf(1).format).toBe('2/1');
      const firstCont = REF_LONG.findIndex((_, i) => longOf(i + 1).format === 'continuous') + 1;
      expect(firstCont).toBeWithin(12, 14);
      const ladder = [...new Set(REF_LONG.map((_, i) => longOf(i + 1).format))];
      expect(ladder).toEqual(['2/1', '3/1', '5/1', '8/2', '10/1', '15/1', '20/1', 'continuous']);
    });
    it('блоки наклона на дорожке с недели 17', () => {
      const first = REF_LONG.findIndex((_, i) => longOf(i + 1).incline === 'incline_blocks') + 1;
      expect(first).toBeWithin(16, 18);
      expect(longOf(10).incline).toBeNull();
    });
    it('силовая А: присед, румынская тяга, жим, вертикальная тяга, планка, силовое кардио', () => {
      const a = names(strength('A', 1));
      expect(a[0]).toBe('Присед со штангой');
      expect(a).toContain('Румынская тяга');
      expect(a).toContain('Жим от груди');
      expect(a).toContain('Вертикальная тяга широким хватом');
      expect(a).toContain('Планка и боковая планка');
      expect(a.some((n) => /Силовое кардио/.test(n))).toBeTruthy();
    });
    it('силовая Б: болгарские выпады, платформа, ягодичный мост, жим гантелей, тяга в наклоне, икры, ходьба с наклоном', () => {
      const b = names(strength('B', 8));
      for (const n of ['Болгарские выпады', 'Подъём на платформу с гантелями', 'Ягодичный мост со штангой', 'Жим гантелей от плеч', 'Тяга гантели в наклоне', 'Подъёмы на носки на одной ноге', 'Ходьба по дорожке с наклоном']) expect(b).toContain(n);
    });
    it('стартовые веса из уровня и прогрессия подходов по фазам', () => {
      const a1 = strength('A', 1).target.exercises;
      expect(a1.find((e) => e.exercise_key === 'squat_bb').weight_kg).toBe(45);
      expect(a1.find((e) => e.exercise_key === 'squat_bb').reps).toBe('10–12');
      const a17 = strength('A', 17).target.exercises.find((e) => e.exercise_key === 'squat_bb');
      expect(a17.reps).toBe('5–6');
      const deload = strength('A', 4).target.exercises.find((e) => e.exercise_key === 'squat_bb');
      expect(deload.sets).toBe(2);
    });
    it('силовые вт и чт, длинный бег в субботу, интервал до длинного бега соблюдён', () => {
      const s1 = plan.sessions.filter((s) => s.week_index === 1);
      expect(s1.map((s) => D.dow(s.date))).toEqual([1, 3, 5]);
      expect(plan.warnings).toEqual([]);
    });
    it('неделя старта: шейкаут за 3 дня, последняя силовая не позже чем за 4 дня', () => {
      const last = plan.sessions.filter((s) => s.week_index === 29);
      const run = last.find((s) => s.kind === 'run');
      expect(run.date).toBe('2027-04-29');
      const str = last.filter((s) => s.kind === 'strength');
      expect(str.every((s) => D.diffDays(s.date, '2027-05-02') >= 4)).toBeTruthy();
    });
    it('в каждой сессии 8–10 мин разминки', () => {
      expect(plan.sessions.every((s) => s.target.warmup_min >= 8 && s.target.warmup_min <= 10)).toBeTruthy();
    });
  });

  describe('Генератор: другие сценарии', () => {
    it('без дедлайна — скользящий блок 12 недель, без подводки', () => {
      const p = HD.plan.generatePlan({ type: 'weight_loss', params: { start_value: 99, target_value: 85 } }, { sessions: [{ kind: 'strength', per_week: 3, duration_min: 60 }], equipment: ['barbell', 'dumbbells', 'machines'] }, {}, {}, '2026-10-15');
      expect(p.weeks).toBe(12);
      expect(p.rolling).toBeTruthy();
      expect(p.phases.some((x) => x.key === 'taper')).toBeFalsy();
      expect(p.sessions.filter((s) => s.week_index === 1).length).toBe(3);
    });
    it('короткий срок (< 8 недель) — фазы сжаты и предупреждение', () => {
      const p = HD.plan.generatePlan({ type: 'race', params: { distance_min: 10, deadline: '2026-11-22', surface: 'road' } }, { sessions: [{ kind: 'run', per_week: 2 }] }, {}, {}, '2026-10-12');
      expect(p.weeks).toBe(6);
      expect(p.warnings.some((w) => /реалистичн/.test(w))).toBeTruthy();
      expect(p.phases.reduce((s, x) => s + x.to - x.from + 1, 0)).toBe(6);
    });
    it('силовая цель: целевое упражнение первым в каждой силовой', () => {
      const p = HD.plan.generatePlan({ type: 'strength_lift', params: { exercise_key: 'deadlift', start_value: 80, target_value: 100 } }, { sessions: [{ kind: 'strength', per_week: 2 }], equipment: ['barbell', 'dumbbells', 'cable'] }, {}, {}, '2026-10-12');
      const st = p.sessions.filter((s) => s.kind === 'strength').slice(0, 2);
      expect(st.every((s) => s.target.exercises[0].exercise_key === 'deadlift')).toBeTruthy();
    });
    it('«не нравится» исключает, оборудование фильтрует', () => {
      const p = HD.plan.generatePlan({ type: 'weight_loss', params: {} }, { sessions: [{ kind: 'strength', per_week: 2 }], equipment: ['bodyweight'], dislikes: ['jumps'] }, {}, {}, '2026-10-12');
      const all = p.sessions.filter((s) => s.kind === 'strength').flatMap((s) => s.target.exercises.map((e) => HD.exerciseByKey(e.exercise_key)));
      expect(all.every((e) => e.equipment.every((q) => q === 'bodyweight'))).toBeTruthy();
      expect(all.some((e) => e.tags.includes('jumps'))).toBeFalsy();
    });
    it('пересборка стартует от фактического уровня, а не с нуля', () => {
      const p = HD.plan.generatePlan(goal, prefs, prefs.baseline, { lastLongRunMin: 70, formatLevel: 6 }, '2026-12-28');
      const first = p.sessions.find((s) => s.kind === 'run' && s.target.is_long);
      expect(first.target.duration_min).toBe(70);
      expect(first.target.format).toBe('20/1');
    });
    it('силовая и длинный бег в соседние дни → предупреждение', () => {
      const p = HD.plan.generatePlan(goal, Object.assign({}, prefs, { sessions: [{ kind: 'strength', per_week: 2, days: [1, 4] }, { kind: 'run', per_week: 1, days: [5] }] }), prefs.baseline, {}, '2026-10-12');
      expect(p.warnings.some((w) => /день отдыха/.test(w))).toBeTruthy();
    });
  });
})(window.HD);
