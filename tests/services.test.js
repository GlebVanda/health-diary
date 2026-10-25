// Сценарии на уровне сервисов (в памяти, без записи в браузерное хранилище): критерии приёмки этапов 2 и 4.
(function (HD) {
  const D = HD.dates;

  async function fresh(today) {
    await HD.db.init({ memoryOnly: true });
    D.setToday(today);
    HD.seed.seed();
    HD.seed.loadDemo();
  }

  describe('Сервисы: цели', () => {
    it('смена цели 99,3→85 на 88 даёт 49% и не трогает историю', async () => {
      await fresh('2026-10-15');
      HD.db.insert('body_measurements', { profile_id: 'demo-max', date: '2026-10-15', weight_kg: 93.8 });
      HD.svc.nutrition.saveFood('demo-max', '2026-10-14', { kcal: 2100 });
      const before = { food: HD.db.all('food_days').length, meas: HD.db.all('body_measurements').length, logs: HD.db.all('session_logs').length };
      let ctx = HD.svc.ctx('demo-max');
      let ov = HD.svc.goals.overview(ctx);
      expect(Math.round(ov.main.pct)).toBe(38);
      HD.svc.goals.updateParams(ctx.main.id, { target_value: 88 }, 'Реалистичнее');
      ctx = HD.svc.ctx('demo-max');
      ov = HD.svc.goals.overview(ctx);
      expect(Math.round(ov.main.pct)).toBe(49);
      expect(ov.main.params.start_value).toBe(99.3);
      expect(ctx.versions.get(ctx.main.id).length).toBe(2);
      expect({ food: HD.db.all('food_days').length, meas: HD.db.all('body_measurements').length, logs: HD.db.all('session_logs').length }).toEqual(before);
      // На графике — ступенька целевой линии с причиной
      const steps = HD.svc.goals.targetSteps(ctx, ctx.main);
      expect(steps.map((s) => s.value)).toEqual([85, 88]);
      expect(steps[1].reason).toBe('Реалистичнее');
    });
    it('«начать отсчёт с сегодняшнего значения» переносит старт', async () => {
      await fresh('2026-10-15');
      HD.db.insert('body_measurements', { profile_id: 'demo-max', date: '2026-10-15', weight_kg: 93.8 });
      const ctx = HD.svc.ctx('demo-max');
      HD.svc.goals.updateParams(ctx.main.id, { target_value: 88 }, 'Новый отсчёт', { resetStart: true, currentValue: 93.8 });
      const ov = HD.svc.goals.overview(HD.svc.ctx('demo-max'));
      expect(ov.main.params.start_value).toBe(93.8);
      expect(Math.round(ov.main.pct)).toBe(0);
    });
    it('смена типа главной цели: старая уходит в архив с финальным процентом', async () => {
      await fresh('2026-10-15');
      HD.db.insert('body_measurements', { profile_id: 'demo-max', date: '2026-10-15', weight_kg: 93.8 });
      const old = HD.svc.ctx('demo-max').main;
      const out = HD.svc.goals.replaceMain('demo-max', { type: 'consistency', title: '3 тренировки в неделю', params: { per_week: 3 } });
      expect(out.dropped.length).toBe(0);
      const g = HD.db.get('goals', old.id);
      expect(g.status).toBe('archived');
      expect(Math.round(g.final_progress)).toBe(38);
      expect(HD.svc.ctx('demo-max').main.type).toBe('consistency');
    });
  });

  describe('Сервисы: питание', () => {
    it('первая автонорма Анны — с текущего понедельника', async () => {
      await fresh('2026-10-15');
      const ctx = HD.svc.ctx('demo-anna');
      expect(ctx.targets.length).toBe(1);
      expect(ctx.targets[0].valid_from).toBe('2026-10-12');
      expect(ctx.targets[0].daily_kcal).toBe(2050);
    });
    it('новое взвешивание меняет норму со следующего понедельника, текущая неделя не меняется', async () => {
      await fresh('2026-10-15');
      const weekBefore = HD.svc.nutrition.week(HD.svc.ctx('demo-anna'), '2026-10-12').budget;
      HD.db.insert('body_measurements', { profile_id: 'demo-anna', date: '2026-10-15', weight_kg: 70 });
      const r = HD.svc.nutrition.recalc('demo-anna', 'Новое взвешивание');
      expect(r.target.valid_from).toBe('2026-10-19');
      const ctx = HD.svc.ctx('demo-anna');
      expect(HD.svc.nutrition.week(ctx, '2026-10-12').budget).toBe(weekBefore);
      expect(HD.svc.nutrition.week(ctx, '2026-10-19').daily_base < weekBefore / 7).toBeTruthy();
    });
    it('ручная норма: автопересчёт только подсказка; «вернуть авто»', async () => {
      await fresh('2026-10-15');
      HD.svc.nutrition.setManual('demo-anna', { daily_kcal: 1900 }, true);
      HD.db.insert('body_measurements', { profile_id: 'demo-anna', date: '2026-10-15', weight_kg: 74 });
      const r = HD.svc.nutrition.recalc('demo-anna', 'Новое взвешивание');
      expect(r.skipped).toBe('manual');
      expect(r.auto.daily_kcal > 0).toBeTruthy();
      expect(HD.svc.nutrition.targetFor(HD.svc.ctx('demo-anna'), '2026-10-20').daily_kcal).toBe(1900);
      HD.svc.nutrition.revertAuto('demo-anna', false);
      expect(HD.svc.nutrition.targetFor(HD.svc.ctx('demo-anna'), '2026-10-20').source).toBe('auto');
    });
    it('ввод калорий за день — одна запись, пустое значение удаляет', async () => {
      await fresh('2026-10-15');
      HD.svc.nutrition.saveFood('demo-anna', '2026-10-15', { kcal: '1800' });
      HD.svc.nutrition.saveFood('demo-anna', '2026-10-15', { kcal: '1850' });
      expect(HD.db.forProfile('food_days', 'demo-anna').length).toBe(1);
      expect(HD.db.forProfile('food_days', 'demo-anna')[0].kcal).toBe(1850);
      expect(HD.db.forProfile('food_days', 'demo-max').length).toBe(0);
      HD.svc.nutrition.saveFood('demo-anna', '2026-10-15', { kcal: '' });
      expect(HD.db.forProfile('food_days', 'demo-anna').length).toBe(0);
    });
  });

  describe('Сервисы: план и адаптация', () => {
    it('первый план Анны строится по анкете с 12.10.2026', async () => {
      await fresh('2026-10-15');
      const ctx = HD.svc.ctx('demo-anna');
      expect(ctx.plan.weeks).toBe(29);
      expect(ctx.sessions.length > 80).toBeTruthy();
      expect(HD.svc.ctx('demo-max').plan.weeks > 10).toBeTruthy();
    });
    it('адаптация показывает причину и отменяется', async () => {
      await fresh('2026-10-15');
      let ctx = HD.svc.ctx('demo-anna');
      const [s1, s2] = ctx.sessions;
      HD.svc.plan.saveLog('demo-anna', { planned_session_id: s1.id, date: s1.date, done: true, kind: s1.kind, duration_min: 60, wellbeing: 4 });
      const { changes } = HD.svc.plan.saveLog('demo-anna', { planned_session_id: s2.id, date: s2.date, done: true, kind: s2.kind, duration_min: 60, wellbeing: 3 });
      expect(changes.length).toBe(1);
      expect(changes[0].reason).toBe('Неделя облегчена: два раза подряд самочувствие ≤ 4');
      ctx = HD.svc.ctx('demo-anna');
      const next = ctx.sessions.find((s) => s.date >= '2026-10-19' && s.kind === 'run');
      expect(next.effective_duration).toBe(25);
      expect(next.notes[0]).toContain('облегчена');
      HD.svc.plan.undo(changes[0].id);
      const after = HD.svc.ctx('demo-anna').sessions.find((s) => s.id === next.id);
      expect(after.effective_duration).toBe(35);
      // повторная отметка не применяет то же правило ещё раз
      expect(HD.svc.plan.adapt('demo-anna').length).toBe(0);
    });
    it('пересборка плана сохраняет прошедшие отметки', async () => {
      await fresh('2026-10-15');
      D.setToday('2026-11-04');
      let ctx = HD.svc.ctx('demo-anna');
      const past = ctx.sessions.filter((s) => s.date < '2026-11-04');
      past.forEach((s) => HD.svc.plan.saveLog('demo-anna', { planned_session_id: s.id, date: s.date, done: true, kind: s.kind, duration_min: s.target.duration_min, wellbeing: 7 }));
      const logsBefore = HD.db.all('session_logs').length;
      const res = HD.svc.plan.generate('demo-anna', { reason: 'Тест пересборки' });
      ctx = HD.svc.ctx('demo-anna');
      expect(ctx.plan.id).toBe(res.plan.id);
      expect(HD.db.all('session_logs').length).toBe(logsBefore);
      expect(past.every((s) => ctx.sessions.some((x) => x.id === s.id))).toBeTruthy();
      expect(past.every((s) => ctx.doneIds.has(s.id))).toBeTruthy();
      // новый план стартует от фактического уровня: последний длинный бег
      const firstLong = ctx.sessions.find((s) => s.date >= '2026-11-04' && s.kind === 'run' && s.target.is_long);
      expect(firstLong.target.duration_min >= 30).toBeTruthy();
      // отмена возвращает старую версию плана
      HD.svc.plan.undo(res.change.id);
      expect(HD.svc.ctx('demo-anna').plan.id).toBe(res.change.payload.old_plan_id);
      D.setToday(null);
    });
    it('смена дедлайна пересобирает план с текущей недели', async () => {
      await fresh('2026-10-15');
      const ctx = HD.svc.ctx('demo-anna');
      const r = HD.svc.goals.updateParams(ctx.main.id, { deadline: '2027-05-16' }, 'Старт позже');
      expect(r.planChanged).toBeTruthy();
      HD.svc.plan.generate('demo-anna', { reason: 'Старт позже' });
      const p = HD.svc.ctx('demo-anna').plan;
      expect(p.end_date >= '2027-05-16').toBeTruthy();
      D.setToday(null);
    });
  });
})(window.HD);
