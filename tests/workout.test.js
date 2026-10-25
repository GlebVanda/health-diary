// «Начать тренировку»: когда можно начать, ход тренировки, запоминание весов и ощущений, прогрессия и адаптация.
(function (HD) {
  const P = HD.progress;
  const D = HD.dates;
  const W = () => HD.svc.workout;

  const bb = HD.exerciseByKey('squat_bb');
  const db = HD.exerciseByKey('db_shoulder_press');
  const hist = (...e) => e.map(([weight, feel], i) => ({ weight, feel, date: '2026-10-' + String(20 - i).padStart(2, '0') }));

  describe('Прогрессия весов по ощущениям', () => {
    it('шаг по оборудованию: штанга 2,5, гантели 1, гиря 2, вес тела 0', () => {
      expect(P.stepFor(bb)).toBe(2.5);
      expect(P.stepFor(db)).toBe(1);
      expect(P.stepFor(HD.exerciseByKey('kb_swing'))).toBe(2);
      expect(P.stepFor(HD.exerciseByKey('pushup'))).toBe(0);
    });
    it('нет истории → вес по плану; плана нет → нужно подобрать вес', () => {
      expect(P.next(45, [], { step: 2.5 }).weight).toBe(45);
      expect(P.next(45, [], { step: 2.5 }).action).toBe('plan');
      expect(P.next(null, [], { step: 2.5 }).weight).toBeNull();
    });
    it('«легко» → вес растёт на шаг', () => {
      const r = P.next(45, hist([45, 'easy']), { step: 2.5 });
      expect(r.weight).toBe(47.5);
      expect(r.action).toBe('up');
      expect(P.next(6, hist([6, 'easy']), { step: 1 }).weight).toBe(7);
    });
    it('«нормально» → вес тот же, два раза подряд с одним весом → растёт', () => {
      expect(P.next(45, hist([45, 'ok']), { step: 2.5 }).weight).toBe(45);
      expect(P.next(45, hist([45, 'ok'], [45, 'ok']), { step: 2.5 }).weight).toBe(47.5);
      // другой вес в предыдущий раз — серия не считается
      expect(P.next(45, hist([47.5, 'ok'], [45, 'ok']), { step: 2.5 }).weight).toBe(47.5);
    });
    it('«тяжело» → вес тот же, два раза подряд → снижается на шаг', () => {
      expect(P.next(45, hist([45, 'hard']), { step: 2.5 }).weight).toBe(45);
      const r = P.next(45, hist([45, 'hard'], [45, 'hard']), { step: 2.5 });
      expect(r.weight).toBe(42.5);
      expect(r.action).toBe('down');
    });
    it('«не осилил» → вес снижается на шаг или на 5%, что больше', () => {
      expect(P.next(45, hist([45, 'fail']), { step: 2.5 }).weight).toBe(42.5);
      expect(P.next(100, hist([100, 'fail']), { step: 2.5 }).weight).toBe(95);
    });
    it('разгрузочная неделя: вес не растёт даже после «легко»', () => {
      expect(P.next(45, hist([45, 'easy']), { step: 2.5, deload: true }).weight).toBe(45);
      expect(P.next(45, hist([45, 'fail']), { step: 2.5, deload: true }).action).toBe('down');
    });
    it('вес тела: вес не меняется', () => {
      expect(P.next(null, hist([null, 'easy']), { step: 0 }).action).toBe('plan');
    });
    it('общее ощущение тренировки по ощущениям упражнений', () => {
      expect(P.summarize(['easy', 'easy', 'ok'])).toBe('easy');
      expect(P.summarize(['ok', 'hard', 'hard'])).toBe('hard');
      expect(P.summarize(['fail', 'fail', 'ok'])).toBe('fail');
      expect(P.summarize(['ok', 'ok', 'fail'])).toBe('ok');
      expect(P.summarize([])).toBeNull();
    });
  });

  describe('Начать тренировку: когда доступно и что запоминается', () => {
    async function fresh(today) {
      await HD.db.init({ memoryOnly: true });
      D.setToday(today);
      HD.seed.seed();
      HD.seed.loadDemo();
      return HD.svc.ctx('demo-anna');
    }
    const strength = (ctx, from) => ctx.sessions.find((s) => s.kind === 'strength' && s.date >= from);

    it('можно начать в день тренировки или на следующий, если она не выполнена', async () => {
      let ctx = await fresh('2026-10-13'); // вторник, силовая А
      const a = ctx.sessions.find((s) => s.date === '2026-10-13' && s.kind === 'strength');
      expect(W().isStartable(ctx, a)).toBeTruthy();
      expect(W().startable(ctx).map((x) => x.session.id)).toEqual([a.id]);
      ctx = await fresh('2026-10-14'); // среда: вчерашняя ещё доступна
      const list = W().startable(ctx);
      expect(list.length).toBe(1);
      expect(list[0].overdue).toBeTruthy();
      ctx = await fresh('2026-10-15'); // четверг: вторничная уже нет, сегодняшняя есть
      expect(W().isStartable(ctx, a)).toBeFalsy();
      expect(W().startable(ctx).map((x) => x.session.date)).toEqual(['2026-10-15']);
      D.setToday(null);
    });
    it('выполненная или пропущенная тренировка больше не предлагается', async () => {
      let ctx = await fresh('2026-10-13');
      const a = ctx.sessions.find((s) => s.date === '2026-10-13' && s.kind === 'strength');
      W().skip(ctx, a);
      ctx = HD.svc.ctx('demo-anna');
      expect(W().isStartable(ctx, a)).toBeFalsy();
      expect(HD.svc.logFor(ctx, a.id).done).toBe(false);
      D.setToday(null);
    });
    it('ход тренировки хранится в черновике и переживает перезагрузку', async () => {
      const ctx = await fresh('2026-10-13');
      const a = ctx.sessions.find((s) => s.date === '2026-10-13' && s.kind === 'strength');
      const d = W().draftFor(ctx, a);
      expect(Object.keys(d.exercises).length).toBe(a.target.exercises.length);
      expect(d.exercises.squat_bb.weight).toBe(45);
      d.exercises.squat_bb.done = true;
      W().saveDraft(a.id, d);
      expect(W().draftFor(ctx, a).exercises.squat_bb.done).toBeTruthy();
      W().clearDraft(a.id);
      expect(W().loadDraft(a.id)).toBeNull();
      D.setToday(null);
    });
    it('завершение: веса и ощущения сохраняются, следующий вес подбирается по ощущению', async () => {
      let ctx = await fresh('2026-10-13');
      const a = ctx.sessions.find((s) => s.date === '2026-10-13' && s.kind === 'strength');
      const d = W().newDraft(ctx, a);
      d.exercises.squat_bb = { done: true, weight: '47,5', feel: 'easy' };
      d.exercises.bench_bb = { done: true, weight: 30, feel: 'hard' };
      d.exercises.lat_pulldown = { done: true, weight: 30, feel: 'ok' };
      // остальные не выполнены
      const { log } = W().finish(ctx, a, d, { wellbeing: 7, duration_min: 55, note: 'норм' });
      expect(log.done).toBeTruthy();
      expect(log.source).toBe('workout');
      expect(log.feel).toBe('hard'); // легко, тяжело, нормально → при равенстве более тяжёлое
      const sq = log.exercises.find((e) => e.exercise_key === 'squat_bb');
      expect(sq.weight_kg).toBe(47.5);
      expect(sq.feel).toBe('easy');
      expect(log.exercises.find((e) => e.exercise_key === 'rdl_bb').done).toBeFalsy();
      expect(log.duration_min).toBe(55);
      // следующая такая же тренировка (силовая А через неделю)
      ctx = HD.svc.ctx('demo-anna');
      const nextA = ctx.sessions.find((s) => s.kind === 'strength' && s.target.template === 'A' && s.date > '2026-10-13');
      const w = HD.svc.suggestedWeights(ctx, nextA);
      expect(w.find((e) => e.exercise_key === 'squat_bb').weight_kg).toBe(50);
      expect(w.find((e) => e.exercise_key === 'bench_bb').weight_kg).toBe(30);
      expect(w.find((e) => e.exercise_key === 'squat_bb').suggest.action).toBe('up');
      D.setToday(null);
    });
    it('вес в целевом упражнении силовой цели попадает в прогресс цели', async () => {
      await HD.db.init({ memoryOnly: true });
      D.setToday('2026-10-14'); // среда у demo-max: силовая
      HD.seed.seed();
      HD.seed.loadDemo();
      let ctx = HD.svc.ctx('demo-max');
      const s = ctx.sessions.find((x) => x.date === '2026-10-14' && x.kind === 'strength');
      expect(!!s).toBeTruthy();
      expect(s.target.exercises[0].exercise_key).toBe('bench_bb');
      const d = W().newDraft(ctx, s);
      d.exercises.bench_bb = { done: true, weight: 65, feel: 'ok' };
      const { log } = W().finish(ctx, s, d, { wellbeing: 7 });
      expect(log.key_lift_kg).toBe(65);
      ctx = HD.svc.ctx('demo-max');
      const lift = HD.svc.goals.overview(ctx).secondary.find((i) => i.goal.type === 'strength_lift');
      expect(Math.round(lift.pct)).toBe(13); // (65 − 60) / (100 − 60)
      D.setToday(null);
    });
    it('если ничего не отмечено, тренировка сохраняется как невыполненная', async () => {
      const ctx = await fresh('2026-10-13');
      const a = ctx.sessions.find((s) => s.date === '2026-10-13' && s.kind === 'strength');
      const { log } = W().finish(ctx, a, W().newDraft(ctx, a), {});
      expect(log.done).toBe(false);
      D.setToday(null);
    });
    it('бег: фактическая длительность, дистанция и ощущение сохраняются', async () => {
      const ctx = await fresh('2026-10-17'); // суббота, длинный бег
      const run = ctx.sessions.find((s) => s.date === '2026-10-17' && s.kind === 'run');
      const d = W().newDraft(ctx, run);
      d.run = { duration: '32', distance: '3,5', feel: 'easy' };
      const { log } = W().finish(ctx, run, d, { wellbeing: 8 });
      expect(log.duration_min).toBe(32);
      expect(log.distance_km).toBe(3.5);
      expect(log.feel).toBe('easy');
      D.setToday(null);
    });
  });

  describe('Адаптация плана по ощущениям', () => {
    const plan = { start_date: '2026-10-12', end_date: '2027-05-02', phases: HD.plan.computePhases(29, { goalType: 'race', longBreak: true }) };
    const sessions = [{ id: 'a', date: '2026-10-13', week_index: 1, kind: 'strength', title: 'А', target: { duration_min: 60 } }];
    const L = (id, date, feel, kind) => ({ id, done: true, date, feel, kind: kind || 'strength' });
    it('две тяжёлые тренировки подряд → следующая неделя легче на 15%', () => {
      const a = HD.adapt.evaluate({ plan, sessions, logs: [L('1', '2026-10-13', 'hard'), L('2', '2026-10-15', 'fail')], today: '2026-10-15' });
      expect(a.length).toBe(1);
      expect(a[0].rule).toBe('feel_hard');
      expect(a[0].factor).toBe(0.85);
      expect(a[0].reason).toContain('тяжело');
    });
    it('две лёгкие подряд → небольшой рост длительности', () => {
      const a = HD.adapt.evaluate({ plan, sessions, logs: [L('1', '2026-10-13', 'easy'), L('2', '2026-10-15', 'easy', 'run')], today: '2026-10-15' });
      expect(a[0].rule).toBe('feel_easy');
      expect(a[0].plus_min).toBe(5);
    });
    it('«нормально» и смешанные ощущения ничего не меняют; повторно правило не срабатывает', () => {
      expect(HD.adapt.evaluate({ plan, sessions, logs: [L('1', '2026-10-13', 'ok'), L('2', '2026-10-15', 'hard')], today: '2026-10-15' }).length).toBe(0);
      const logs = [L('1', '2026-10-13', 'hard'), L('2', '2026-10-15', 'hard')];
      expect(HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-15', applied: new Set(['feel_hard:2']) }).length).toBe(0);
    });
    it('облегчение по самочувствию и по ощущению не дублируются', () => {
      const logs = [
        { id: '1', done: true, date: '2026-10-13', wellbeing: 3, feel: 'hard', kind: 'strength' },
        { id: '2', done: true, date: '2026-10-15', wellbeing: 4, feel: 'hard', kind: 'strength' },
      ];
      const a = HD.adapt.evaluate({ plan, sessions, logs, today: '2026-10-15' });
      expect(a.filter((x) => x.type === 'lighten').length).toBe(1);
    });
  });
})(window.HD);
