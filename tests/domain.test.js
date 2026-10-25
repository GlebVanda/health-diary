// Юнит-тесты расчётной логики: даты, норма, бюджет, цели, адаптация, рекомендации, агрегаты, ИИ-валидация.
(function (HD) {
  const D = HD.dates;
  const N = HD.nutrition;
  const G = HD.goals;

  describe('Даты', () => {
    it('понедельник и день недели', () => {
      expect(D.monday('2026-10-15')).toBe('2026-10-12');
      expect(D.dow('2026-10-12')).toBe(0);
      expect(D.dow('2026-10-18')).toBe(6);
      expect(D.nextMonday('2026-10-12')).toBe('2026-10-19');
      expect(D.nextMonday('2026-10-18')).toBe('2026-10-19');
    });
    it('возраст и месяцы', () => {
      expect(D.age('1998-01-01', '2026-10-15')).toBe(28);
      expect(D.monthEnd('2027-02-10')).toBe('2027-02-28');
      expect(D.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    });
    it('Excel serial → дата', () => {
      expect(D.fromExcelSerial(46034)).toBe('2026-01-12');
    });
  });

  describe('Норма калорий (5.1)', () => {
    it('Миффлин–Сан Жеор', () => {
      expect(N.bmr({ sex: 'f', weightKg: 79, heightCm: 162, age: 28 })).toBeCloseTo(1501.5);
      expect(N.bmr({ sex: 'm', weightKg: 93.8, heightCm: 180, age: 35 })).toBeCloseTo(938 + 1125 - 175 + 5);
    });
    it('коэффициент активности по плану', () => {
      expect(N.activityFactor(3)).toBe(1.375);
      expect(N.activityFactor(4)).toBe(1.55);
      expect(N.activityFactor(0)).toBe(1.2);
      expect(N.activityFactor(0, 1.55)).toBe(1.55);
    });
    it('поддержание для забега: округление до 50 и углеводы не ниже 4 г/кг', () => {
      const r = N.computeTarget({ sex: 'f', weightKg: 79, heightCm: 162, age: 28, sessionsPerWeek: 3, adjust: { mode: 'maintenance' }, carbsMinPerKg: 4 });
      expect(r.daily_kcal).toBe(2050);
      expect(r.carbs_g).toBe(316);
      expect(r.protein_g).toBe(126);
    });
    it('дефицит 15–20% от расхода и темп 0,5–1% веса в неделю', () => {
      const r = N.computeTarget({ sex: 'm', weightKg: 93.8, heightCm: 180, age: 35, sessionsPerWeek: 3, adjust: { mode: 'deficit', current: 93.8, target: 85, weeksLeft: null }, proteinPerKg: 1.8 });
      const tdee = r.details.tdee;
      expect(r.details.deficit).toBeWithin(0.15 * tdee - 1, 0.2 * tdee + 1);
      expect(r.details.pace_kg_week).toBeWithin(0.469, 0.938);
      expect(r.daily_kcal % 50).toBe(0);
      expect(r.protein_g).toBe(169);
    });
    it('нижняя граница: не ниже базового обмена и 1200/1500', () => {
      const r = N.computeTarget({ sex: 'f', weightKg: 50, heightCm: 150, age: 60, sessionsPerWeek: 0, adjust: { mode: 'deficit', current: 50, target: 40, weeksLeft: 2 } });
      expect(r.daily_kcal >= 1200).toBeTruthy();
      expect(r.daily_kcal >= r.details.bmr).toBeTruthy();
      expect(r.details.floor_applied).toBeTruthy();
    });
    it('без роста или возраста норма не считается', () => {
      expect(N.computeTarget({ sex: 'm', weightKg: 93, heightCm: null, age: null }).daily_kcal).toBeNull();
    });
    it('цвет дня', () => {
      expect(N.dayColor(2000, 2000)).toBe('ok');
      expect(N.dayColor(2110, 2000)).toBe('over');
      expect(N.dayColor(1700, 2000)).toBe('good');
      expect(N.dayColor(1300, 2000)).toBe('under');
      expect(N.dayColor(null, 2000)).toBe('empty');
    });
  });

  describe('Недельный бюджет (5.2) — как в Excel', () => {
    const food = (m, arr) => {
      const map = new Map();
      D.weekDays(m).forEach((d, i) => arr[i] != null && map.set(d, { kcal: arr[i] }));
      return map;
    };
    it('перебор 785 ккал уменьшает бюджет следующей недели до 13 215', () => {
      const f = food('2026-01-12', [2100, 2200, 2000, 2150, 2135, 2100, 2100]);
      const weeks = HD.budget.computeWeeks({ foodByDate: f, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), fromMonday: '2026-01-12', toMonday: '2026-01-19' });
      expect(weeks[0].eaten).toBe(14785);
      expect(Math.round(weeks[0].avg)).toBe(2112);
      expect(weeks[0].remaining).toBe(-785);
      expect(weeks[1].budget).toBe(13215);
      expect(weeks[1].dayNorm).toBeCloseTo(13215 / 7);
    });
    it('недобор не переносится', () => {
      const f = food('2026-01-12', [1500, 1500, 1500, 1500, 1500, 1500, 1500]);
      const weeks = HD.budget.computeWeeks({ foodByDate: f, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), fromMonday: '2026-01-12', toMonday: '2026-01-19' });
      expect(weeks[1].budget).toBe(14000);
    });
    it('вычет не больше 15% базового бюджета и не ниже нижней границы × 7', () => {
      const f = food('2026-01-12', [5000, 5000, 5000, 5000, 2000, 2000, 2000]);
      const w = HD.budget.computeWeeks({ foodByDate: f, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), fromMonday: '2026-01-12', toMonday: '2026-01-19' });
      expect(w[1].deduction).toBe(2100);
      expect(w[1].budget).toBe(11900);
      const w2 = HD.budget.computeWeeks({ foodByDate: f, targetFor: () => ({ daily_kcal: 1600, floor: 1500 }), fromMonday: '2026-01-12', toMonday: '2026-01-19' });
      expect(w2[1].budget).toBe(10500);
    });
    it('«можно в день» и статус ✓', () => {
      const f = food('2026-01-12', [2000, 2000, 2000, null, null, null, null]);
      const w = HD.budget.computeWeeks({ foodByDate: f, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), trainingsFor: () => ({ done: 3, planned: 3 }), fromMonday: '2026-01-12', toMonday: '2026-01-12' })[0];
      expect(w.perDayLeft).toBe(2000);
      expect(w.counted).toBeFalsy();
      const full = food('2026-01-12', [2000, 2000, 2000, 2000, 2000, 2000, 2000]);
      const ok = HD.budget.computeWeeks({ foodByDate: full, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), trainingsFor: () => ({ done: 3, planned: 3 }), fromMonday: '2026-01-12', toMonday: '2026-01-12' })[0];
      expect(ok.counted).toBeTruthy();
      const lazy = HD.budget.computeWeeks({ foodByDate: full, targetFor: () => ({ daily_kcal: 2000, floor: 1500 }), trainingsFor: () => ({ done: 2, planned: 3 }), fromMonday: '2026-01-12', toMonday: '2026-01-12' })[0];
      expect(lazy.counted).toBeFalsy();
    });
  });

  describe('Цели (4)', () => {
    const meas = [
      { date: '2026-01-12', weight_kg: 99.3 },
      { date: '2026-10-10', weight_kg: 93.9 },
      { date: '2026-10-15', weight_kg: 93.7 },
    ];
    it('прогресс веса по среднему за 7 дней: 99,3 → 85 при 93,8 = 38%', () => {
      const r = G.get('weight_loss').progress({ start_value: 99.3, target_value: 85 }, { measurements: meas }, '2026-10-15');
      expect(r.current).toBeCloseTo(93.8);
      expect(Math.round(r.pct)).toBe(38);
    });
    it('смена цели на 88 без сброса старта = 49%', () => {
      const versions = [
        { valid_from: '2026-01-12', params: { start_value: 99.3, start_date: '2026-01-12', target_value: 85 } },
        { valid_from: '2026-10-15', params: { start_value: 99.3, start_date: '2026-01-12', target_value: 88 } },
      ];
      const goal = { id: 'g', type: 'weight_loss', status: 'active' };
      expect(Math.round(G.goalProgress(goal, versions, { measurements: meas }, '2026-10-15').pct)).toBe(49);
      expect(Math.round(G.goalProgress(goal, versions, { measurements: meas }, '2026-10-14').pct)).toBe(38);
    });
    it('прогресс ограничен 0–100%', () => {
      expect(G.linearProgress(99.3, 85, 101)).toBe(0);
      expect(G.linearProgress(99.3, 85, 80)).toBe(100);
    });
    it('темп: опережаем / по графику / отстаём', () => {
      expect(G.paceStatus(60, 50)).toBe('ahead');
      expect(G.paceStatus(53, 50)).toBe('on_track');
      expect(G.paceStatus(40, 50)).toBe('behind');
      expect(G.expectedPct({ start_date: '2026-01-01', deadline: '2026-01-11' }, '2026-01-06')).toBe(50);
    });
    it('общий процент равен прогрессу основной цели, весов у целей нет', () => {
      const goals = [{ id: 'a', role: 'main', status: 'active' }];
      expect(G.normalizeWeights).toBe(undefined);
      expect(G.totalProgress).toBe(undefined);
      expect(goals.every((g) => g.weight_in_total === undefined)).toBeTruthy();
    });
    it('пробежать дистанцию: лучшая пробежка относительно цели', () => {
      const logs = [{ done: true, kind: 'run', date: '2026-10-01', distance_km: 3 }, { done: true, kind: 'run', date: '2026-10-10', distance_km: 6 }];
      const r = G.get('run_distance').progress({ start_value: 2, target_value: 10, start_date: '2026-09-01' }, { logs }, '2026-10-15');
      expect(r.pct).toBe(50);
    });
    it('забег: 60% лучший длинный бег за 28 дней + 40% выполнение', () => {
      const sessions = [{ id: 's1', date: '2026-10-13' }, { id: 's2', date: '2026-10-15' }, { id: 's3', date: '2026-10-17' }];
      const logs = [{ done: true, kind: 'run', date: '2026-10-17', duration_min: 75, planned_session_id: 's3' }, { done: true, kind: 'strength', date: '2026-10-13', planned_session_id: 's1' }];
      const r = G.get('race').progress({}, { logs, sessions, plan: { start_date: '2026-10-12', meta: { peak_long_run: 150 } } }, '2026-10-18');
      // 60 × 75/150 + 40 × 2/3
      expect(r.pct).toBeCloseTo(30 + 26.667, 0.01);
    });
    it('силовая цель и регулярность', () => {
      const r = G.get('strength_lift').progress({ start_value: 40, target_value: 60, start_date: '2026-01-01' }, { logs: [{ date: '2026-02-01', key_lift_kg: 50 }] }, '2026-03-01');
      expect(r.pct).toBe(50);
      const logs = [{ done: true, date: '2026-10-05' }, { done: true, date: '2026-10-06' }, { done: true, date: '2026-10-13' }];
      const c = G.get('consistency').progress({ per_week: 2, start_date: '2026-09-28' }, { logs }, '2026-10-15');
      expect(c.pct).toBe(50);
    });
  });

  describe('Адаптация по факту (6.4)', () => {
    const plan = { start_date: '2026-10-12', end_date: '2027-05-02', phases: HD.plan.computePhases(29, { goalType: 'race', longBreak: true }) };
    const sessions = [
      { id: 'a', date: '2026-10-13', week_index: 1, kind: 'strength', title: 'Силовая А', target: { duration_min: 60 } },
      { id: 'b', date: '2026-10-15', week_index: 1, kind: 'strength', title: 'Силовая Б', target: { duration_min: 60 } },
      { id: 'c', date: '2026-10-17', week_index: 1, kind: 'run', title: 'Длинный бег', target: { duration_min: 30, is_long: true } },
    ];
    it('самочувствие ≤ 4 два раза подряд → следующая неделя легче на 25%', () => {
      const logs = [{ id: 'l1', done: true, date: '2026-10-13', wellbeing: 4 }, { id: 'l2', done: true, date: '2026-10-15', wellbeing: 3 }];
      const a = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-15' });
      expect(a.length).toBe(1);
      expect(a[0].type).toBe('lighten');
      expect(a[0].factor).toBe(0.75);
      expect(a[0].from).toBe('2026-10-19');
      expect(a[0].reason).toContain('самочувствие ≤ 4');
    });
    it('повторно не срабатывает (ключ уже применён)', () => {
      const logs = [{ id: 'l1', done: true, date: '2026-10-13', wellbeing: 4 }, { id: 'l2', done: true, date: '2026-10-15', wellbeing: 3 }];
      expect(HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-15', applied: new Set(['fatigue:l2']) }).length).toBe(0);
    });
    it('≥ 8 три раза подряд и цель отстаёт → рост на верхней границе', () => {
      const logs = ['13', '15', '17'].map((d, i) => ({ id: 'x' + i, done: true, date: '2026-10-' + d, wellbeing: 9 }));
      const a = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-17', goalPace: 'behind' });
      expect(a[0].type).toBe('boost');
      expect(HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-17', goalPace: 'on_track' }).length).toBe(0);
    });
    it('факт < 80% плана → неделя повторяется', () => {
      const logs = [{ id: 'r', done: true, date: '2026-10-17', planned_session_id: 'c', duration_min: 20, wellbeing: 6 }];
      const a = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-17' });
      expect(a[0].type).toBe('rebuild');
      expect(a[0].level.lastLongRunMin).toBe(30);
    });
    it('пропуск тренировки план не меняет', () => {
      const logs = [{ id: 'm', done: false, date: '2026-10-13', planned_session_id: 'a' }];
      expect(HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-14' }).length).toBe(0);
    });
    it('нет тренировок 7–13 дней → откат на неделю; 14+ → на 2–3 недели', () => {
      const logs = [{ id: 'z', done: true, date: '2026-11-02', wellbeing: 6 }];
      const a7 = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-11-10' });
      expect(a7[0].rule).toBe('gap7');
      const a14 = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-11-17' });
      expect(a14[0].rule).toBe('gap14');
      expect(a14[0].reason).toContain('2 недели');
    });
    it('рабочий вес не растёт 3 недели → разгрузка и смена схемы', () => {
      const logs = [
        { id: 'k1', done: true, date: '2026-10-01', key_lift_kg: 60 },
        { id: 'k2', done: true, date: '2026-10-20', key_lift_kg: 60 },
        { id: 'k3', done: true, date: '2026-10-27', key_lift_kg: 57.5 },
      ];
      const p2 = Object.assign({}, plan, { start_date: '2026-09-28' });
      const a = HD.adapt.evaluate({ plan: p2, sessions, logs, today: '2026-10-28', goalType: 'strength_lift' });
      expect(a.some((x) => x.type === 'deload_switch')).toBeTruthy();
    });
  });

  describe('Рекомендации', () => {
    const base = {
      today: '2026-10-15',
      logs: [],
      foodByDate: new Map(),
      firstFoodDate: '2026-10-01',
      week: null,
      measurements: [{ date: '2026-10-14', weight_kg: 79 }],
      sessions: [],
      target: { protein_g: 126 },
      main: null,
      goals: [],
    };
    it('не внесены вчерашние калории', () => {
      const r = HD.recommendations.evaluate(base);
      expect(r[0].id).toBe('food_missing');
    });
    it('перебор недели до воскресенья, максимум 3, можно скрыть', () => {
      const c = Object.assign({}, base, { week: { hasTarget: true, monday: '2026-10-12', remaining: -300, filled: 3, avg: 2100, dayNorm: 2000 }, measurements: [] });
      const r = HD.recommendations.evaluate(c);
      expect(r.map((x) => x.id)).toEqual(['food_missing', 'budget_over', 'weigh_in']);
      expect(r[1].text).toContain('300');
      const hidden = HD.recommendations.evaluate(c, new Set([r[0].key]));
      expect(hidden[0].id).toBe('budget_over');
    });
    it('длинный бег ≥ 90 мин в ближайшие 2 дня', () => {
      const c = Object.assign({}, base, { foodByDate: new Map([['2026-10-14', { kcal: 2000 }]]), sessions: [{ id: 's', kind: 'run', date: '2026-10-17', target: { duration_min: 95 }, effective_duration: 95 }] });
      expect(HD.recommendations.evaluate(c)[0].id).toBe('long_run_fuel');
    });
  });

  describe('Агрегация и сравнение (8)', () => {
    const src = {
      foodByDate: new Map([
        ['2026-10-05', { kcal: 2000, protein_g: 120 }],
        ['2026-10-06', { kcal: 2200 }],
        ['2026-10-12', { kcal: 1900 }],
      ]),
      dayNormFor: () => 2000,
      weeks: [],
      logs: [{ done: true, date: '2026-10-06', kind: 'run', duration_min: 40, distance_km: 5, wellbeing: 7 }],
      sessions: [],
      measurements: [{ date: '2026-10-05', weight_kg: 80 }, { date: '2026-10-11', weight_kg: 79.4 }],
    };
    it('метрики недели', () => {
      const a = HD.aggregate.aggregate(src, '2026-10-05', '2026-10-11');
      expect(a.kcal_avg).toBe(2100);
      expect(a.kcal_sum).toBe(4200);
      expect(a.kcal_in_norm_pct).toBe(50);
      expect(a.kcal_deviation).toBe(200);
      expect(Math.round(a.filled_pct)).toBe(29);
      expect(a.longest_run).toBe(40);
      expect(a.weight_change).toBeCloseTo(-0.6);
    });
    it('сравнение с оценкой лучше/хуже по типу цели', () => {
      const a = HD.aggregate.aggregate(src, '2026-10-05', '2026-10-11');
      const b = HD.aggregate.aggregate(src, '2026-10-12', '2026-10-18');
      const rows = HD.aggregate.compare(a, b, 'weight_loss');
      const tr = rows.find((r) => r.key === 'trainings');
      expect(tr.diff).toBe(1);
      expect(tr.verdict).toBe('better');
      expect(rows.find((r) => r.key === 'kcal_deviation').verdict).toBe('worse');
    });
    it('периоды и сдвиги', () => {
      expect(HD.aggregate.periodOf('week', '2026-10-15')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
      expect(HD.aggregate.shiftPeriod('month', { from: '2026-10-01', to: '2026-10-31' }, -12)).toEqual({ from: '2025-10-01', to: '2025-10-31' });
    });
  });

  describe('ИИ-модуль: правки проверяются ограничениями', () => {
    const plan = {
      sessions: [
        { id: 'w1', week_index: 1, kind: 'run', date: '2026-10-17', is_deload: false, target: { is_long: true, duration_min: 60 } },
        { id: 'w2', week_index: 2, kind: 'run', date: '2026-10-24', is_deload: false, target: { is_long: true, duration_min: 65 } },
        { id: 'st', week_index: 2, kind: 'strength', date: '2026-10-22', is_deload: false, target: { exercises: [{ exercise_key: 'squat_bb' }] } },
        { id: 'dl', week_index: 4, kind: 'run', date: '2026-11-07', is_deload: true, target: { is_long: true, duration_min: 45 } },
      ],
    };
    const prefs = { equipment: ['barbell', 'dumbbells'], dislikes: ['machine'] };
    it('без провайдера ИИ выключен', () => {
      expect(HD.ai.getProvider({}).enabled).toBeFalsy();
    });
    it('отклоняет нарушения, пропускает допустимые', () => {
      const { accepted, rejected } = HD.ai.validateEdits(
        plan,
        [
          { type: 'scale_volume', session_id: 'w2', factor: 1.2 },
          { type: 'scale_volume', session_id: 'w2', factor: 1.01 },
          { type: 'scale_volume', session_id: 'dl', factor: 1.1 },
          { type: 'scale_volume', session_id: 'w1', factor: 1.5 },
          { type: 'replace_exercise', session_id: 'st', from_key: 'squat_bb', to_key: 'leg_press' },
          { type: 'replace_exercise', session_id: 'st', from_key: 'squat_bb', to_key: 'goblet_squat' },
          { type: 'move_day', session_id: 'st', to_date: '2026-10-23' },
          { type: 'move_day', session_id: 'st', to_date: '2026-10-21' },
        ],
        prefs,
      );
      expect(accepted.map((e) => e.factor || e.to_key || e.to_date)).toEqual([1.01, 'goblet_squat', '2026-10-21']);
      expect(rejected.length).toBe(5);
    });
  });
})(window.HD);
