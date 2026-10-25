// Первичная настройка: оценка подготовки, совместимость основной и дополнительных целей, проверки безопасности,
// влияние целей и ограничений на питание и план, порядок шагов.
(function (HD) {
  const F = HD.fitness;
  const G = HD.goals;
  const D = HD.dates;
  const TODAY = '2026-10-15';

  const base = {
    name: 'Тест', sex: 'm', birth_date: '1990-01-01', height_cm: 180, weight_kg: 90,
    work: 'sedentary', steps: '5to10', sleep_h: 7, regular: '3to12', last: 'now',
    walk30: 'yes', stairs: 'easy', run: '15to30', experience: '6to24m', pushups: 20, squats: 30, plank_sec: 90,
    heart: 'no', chest_pain: 'no', dizzy: 'no', bp: 'no', diabetes: 'no', joints: 'no', surgery: 'no',
  };
  const zero = Object.assign({}, base, { regular: 'none', last: 'more', run: 'cant', walk30: 'no', stairs: 'stops', experience: 'never', pushups: 0, squats: 5, plank_sec: 10 });
  const athlete = Object.assign({}, base, { regular: 'gt12', run: 'gt60', experience: 'gt2y', pushups: 50, squats: 50, plank_sec: 200, lifts: { squat_bb: 160 } });

  describe('Оценка подготовки и здоровья', () => {
    it('уровень считается по фактам, а не по самооценке: от «с нуля» до «спортивного»', () => {
      expect(F.assess(zero, TODAY).overall.level.key).toBe('zero');
      expect(F.assess(base, TODAY).overall.score >= 2).toBeTruthy();
      expect(F.assess(athlete, TODAY).overall.level.key).toBe('athlete');
    });
    it('выносливость и сила оцениваются отдельно', () => {
      const a = F.assess(Object.assign({}, base, { run: 'gt60', pushups: 0, squats: 5, plank_sec: 10, experience: 'never', lifts: undefined }), TODAY);
      expect(a.cardio.score > a.strength.score + 1).toBeTruthy();
    });
    it('долгий перерыв снижает уровень', () => {
      const a = F.assess(base, TODAY).cardio.score;
      const b = F.assess(Object.assign({}, base, { last: 'more' }), TODAY).cardio.score;
      expect(b < a).toBeTruthy();
    });
    it('«не знаю» про бег оценивается по ходьбе и лестнице', () => {
      const r = F.assess(Object.assign({}, base, { run: 'unknown', walk30: 'yes', stairs: 'easy' }), TODAY);
      expect(r.cardio.score).toBeWithin(1, 2);
      expect(r.baseline.run.continuous_min).toBeNull();
    });
    it('ИМТ и класс', () => {
      const r = F.assess(base, TODAY);
      expect(r.bmi).toBe(27.8);
      expect(r.bmiClass.key).toBe('over');
      expect(F.assess(Object.assign({}, base, { weight_kg: 120 }), TODAY).bmiClass.key).toBe('obese2');
    });
    it('сердце, боль в груди, головокружения → нужна консультация врача и щадящий режим', () => {
      for (const k of ['heart', 'chest_pain', 'dizzy']) {
        const r = F.assess(Object.assign({}, base, { [k]: 'yes' }), TODAY);
        expect(r.limits.medicalClearance).toBeTruthy();
        expect(r.limits.gentle).toBeTruthy();
        expect(r.limits.noMaxEfforts).toBeTruthy();
        expect(r.flags.some((f) => f.severity === 'danger')).toBeTruthy();
      }
    });
    it('суставы → без ударной нагрузки; недавняя операция → щадящий режим', () => {
      expect(F.assess(Object.assign({}, base, { joints: 'yes' }), TODAY).limits.lowImpact).toBeTruthy();
      expect(F.assess(Object.assign({}, base, { surgery: 'yes' }), TODAY).limits.gentle).toBeTruthy();
    });
    it('ИМТ от 35 → без бега на старте; недовес → нельзя снижать вес; беременность → снижение веса недоступно', () => {
      expect(F.assess(Object.assign({}, base, { weight_kg: 125 }), TODAY).limits.lowImpact).toBeTruthy();
      expect(F.assess(Object.assign({}, base, { weight_kg: 55 }), TODAY).limits.noWeightLoss).toBeTruthy();
      const p = F.assess(Object.assign({}, base, { sex: 'f', pregnancy: 'yes' }), TODAY);
      expect(p.limits.noWeightLoss).toBeTruthy();
      expect(p.limits.medicalClearance).toBeTruthy();
    });
    it('обязательные ответы раздела', () => {
      const sec = F.SECTIONS.find((s) => s.key === 'health');
      expect(F.missing(sec, { sex: 'm' }).length).toBe(7);
      expect(F.missing(sec, Object.assign({ sex: 'm' }, base)).length).toBe(0);
      expect(F.missing(sec, { sex: 'f', heart: 'no' }).some((x) => /Беременность/.test(x))).toBeTruthy();
    });
  });

  describe('Основная и дополнительные цели', () => {
    const main = (type, params) => ({ type, title: type, params: params || {} });
    it('дополнительная цель должна сочетаться с основной, несвязанная не добавляется', () => {
      expect(G.scenario.compat('weight_loss', 'strength_lift').ok).toBeTruthy();
      expect(G.scenario.compat('weight_loss', 'weight_gain').ok).toBeFalsy();
      expect(G.scenario.compat('race', 'weight_gain').ok).toBeFalsy();
      expect(G.scenario.compat('weight_loss', 'unknown_type').ok).toBeFalsy();
      expect(G.scenario.compat('weight_loss', 'unknown_type').reason).toContain('не связана');
    });
    it('«чек-ап» и вес цели в общем проценте больше не существуют', () => {
      expect(G.get('task')).toBe(undefined);
      expect(G.list('main').map((s) => s.type)).toEqual(['weight_loss', 'weight_gain', 'race', 'strength_lift', 'consistency']);
      expect(G.list('secondary').some((s) => s.type === 'race')).toBeFalsy();
    });
    it('дубль основной как промежуточный рубеж допустим: похудение и жим 100 кг параллельно', () => {
      const m = main('weight_loss');
      const sec = [{ type: 'strength_lift', title: 'Жим 100', params: { exercise_key: 'bench_bb', target_value: 100 } }];
      expect(G.scenario.canAdd(m, [], { type: 'weight_loss', params: { target_value: 92 } }).ok).toBeTruthy();
      expect(G.scenario.canAdd(m, sec, { type: 'strength_lift', params: { exercise_key: 'squat_bb', target_value: 120 } }).ok).toBeTruthy();
      expect(G.scenario.canAdd(m, sec, { type: 'strength_lift', params: { exercise_key: 'bench_bb', target_value: 90 } }).ok).toBeFalsy();
    });
    it('сценарий: силовая цель при снижении веса смягчает дефицит, добавляет белок и упражнение', () => {
      const sc = G.scenario.scenario(main('weight_loss'), [{ id: 's', type: 'strength_lift', params: { exercise_key: 'bench_bb' } }]);
      expect(sc.nutrition.maxDeficitPct).toBe(0.15);
      expect(sc.nutrition.proteinPerKg).toBe(1.8);
      expect(sc.plan.keyLifts).toEqual(['bench_bb']);
      expect(sc.effects.length).toBe(1);
    });
    it('сценарий: забег и снижение веса — дефицит не больше 10%; без доп. целей дефицит 20%', () => {
      expect(G.scenario.scenario(main('race'), [{ id: 'w', type: 'weight_loss', params: {} }]).nutrition.maxDeficitPct).toBe(0.1);
      expect(G.scenario.scenario(main('weight_loss'), []).nutrition.maxDeficitPct).toBe(0.2);
    });
    it('сценарий: дополнительное «регулярность» задаёт минимум тренировок', () => {
      const sc = G.scenario.scenario(main('weight_loss'), [{ id: 'c', type: 'consistency', params: { per_week: 4 } }]);
      expect(sc.plan.minSessions).toBe(4);
    });
    it('сочетание целей меняет норму: дефицит при силовой цели мягче, чем без неё', () => {
      const input = { sex: 'm', weightKg: 100, heightCm: 180, age: 35, sessionsPerWeek: 3, adjust: { mode: 'deficit', current: 100, target: 85, weeksLeft: 20 } };
      const hard = HD.nutrition.computeTarget(input);
      const soft = HD.nutrition.computeTarget(Object.assign({}, input, { maxDeficitPct: 0.15 }));
      expect(soft.daily_kcal > hard.daily_kcal).toBeTruthy();
      expect(soft.details.deficit <= 0.15 * soft.details.tdee + 1).toBeTruthy();
    });
  });

  describe('Проверки безопасности целей', () => {
    const asm = (a) => F.assess(Object.assign({}, base, a), TODAY);
    const chk = (type, params, a, extra) => G.safety.check(Object.assign({ type, params, today: TODAY, profile: { height_cm: 180 }, weight: 90, assessment: asm(a || {}) }, extra));
    it('слишком быстрое похудение — опасно и требует подтверждения', () => {
      const r = chk('weight_loss', { start_value: 90, target_value: 70, deadline: '2026-12-15' });
      expect(r.items.some((i) => i.key === 'pace_danger')).toBeTruthy();
      expect(r.needsConfirm).toBeTruthy();
      expect(r.hint.safeDate > '2026-12-15').toBeTruthy();
    });
    it('разумный темп — без предупреждений о скорости', () => {
      const r = chk('weight_loss', { start_value: 90, target_value: 82, deadline: '2027-03-15' });
      expect(r.items.some((i) => /pace/.test(i.key))).toBeFalsy();
      expect(r.blocked).toBeFalsy();
    });
    it('целевой вес с ИМТ ниже 18,5 — блокируется', () => {
      const r = chk('weight_loss', { start_value: 90, target_value: 55, deadline: '2028-01-01' });
      expect(r.blocked).toBeTruthy();
      expect(r.items[0].key).toBe('target_bmi');
    });
    it('снижение веса при недоборе массы / беременности недоступно', () => {
      expect(chk('weight_loss', { start_value: 52, target_value: 50 }, { weight_kg: 52 }).blocked).toBeTruthy();
      expect(chk('weight_loss', { start_value: 80, target_value: 70 }, { sex: 'f', pregnancy: 'yes' }).blocked).toBeTruthy();
    });
    it('высокий вес и низкая подготовка: предупреждение о темпе и необходимость врача при сердечных симптомах', () => {
      const r = chk('weight_loss', { start_value: 125, target_value: 95, deadline: '2027-01-15' }, { weight_kg: 125, regular: 'none', last: 'more', run: 'cant', experience: 'never', pushups: 0, squats: 5, plank_sec: 10 }, { weight: 125 });
      expect(r.items.some((i) => i.key === 'pace_unfit' || i.key === 'pace_warn' || i.key === 'pace_danger')).toBeTruthy();
      const m = chk('weight_loss', { start_value: 90, target_value: 85 }, { heart: 'yes' });
      expect(m.items[0].key).toBe('medical');
      expect(m.needsConfirm).toBeTruthy();
    });
    it('силовая цель: слишком быстрая прибавка и непосильное отношение к весу тела', () => {
      const fast = chk('strength_lift', { exercise_key: 'bench_bb', start_value: 60, target_value: 100, deadline: '2026-12-15' });
      expect(fast.items.some((i) => i.key === 'lift_pace_danger' || i.key === 'lift_pace_warn')).toBeTruthy();
      const heavy = chk('strength_lift', { exercise_key: 'squat_bb', start_value: 60, target_value: 200, deadline: '2028-10-15' }, { regular: 'none', last: 'more', run: 'cant', experience: 'never', pushups: 0, squats: 5, plank_sec: 10 });
      expect(heavy.items.some((i) => i.key === 'lift_ratio')).toBeTruthy();
    });
    it('забег: мало времени для дистанции при выносливости', () => {
      const lowCardio = { regular: 'none', last: 'more', run: 'cant', walk30: 'yes', stairs: 'breath', experience: 'never', pushups: 0, squats: 5, plank_sec: 10 };
      const r = chk('race', { distance_max: 21, deadline: '2026-12-15', surface: 'road' }, lowCardio);
      expect(r.items.some((i) => i.key === 'race_danger')).toBeTruthy();
      expect(r.hint.minWeeks > 8).toBeTruthy();
      const ok = chk('race', { distance_max: 10, deadline: '2027-06-01', surface: 'road' });
      expect(ok.items.some((i) => /race_(danger|warn)/.test(i.key))).toBeFalsy();
    });
    it('направление цели: вес должен идти в нужную сторону', () => {
      expect(chk('weight_loss', { start_value: 90, target_value: 95 }).blocked).toBeTruthy();
      expect(chk('weight_gain', { start_value: 70, target_value: 65 }).blocked).toBeTruthy();
    });
  });

  describe('План учитывает ограничения и дополнительные цели', () => {
    const goal = { type: 'weight_loss', params: { start_value: 90, target_value: 80, deadline: '2027-02-01' } };
    const prefs = { sessions: [{ kind: 'strength', per_week: 2, duration_min: 60, days: [1, 3] }, { kind: 'run', per_week: 1, days: [5] }], equipment: ['barbell', 'dumbbells', 'cable', 'bodyweight', 'machines'] };
    it('ограничение «без ударной нагрузки»: бег заменяется кардио без бега', () => {
      const p = HD.plan.generatePlan(goal, Object.assign({}, prefs, { limits: { lowImpact: true } }), {}, {}, TODAY);
      expect(p.sessions.some((s) => s.kind === 'run')).toBeFalsy();
      expect(p.sessions.filter((s) => s.kind === 'cardio').length > 0).toBeTruthy();
    });
    it('ограничение «без предельных усилий»: нет подходов на 3–7 повторов', () => {
      const p = HD.plan.generatePlan(goal, Object.assign({}, prefs, { limits: { noMaxEfforts: true } }), {}, {}, TODAY);
      const reps = p.sessions.filter((s) => s.kind === 'strength').flatMap((s) => s.target.exercises.filter((e) => e.role === 'main').map((e) => e.reps));
      expect(reps.some((r) => /^[3-7]–/.test(r))).toBeFalsy();
    });
    it('щадящий режим: в адаптации и базе не больше двух подходов', () => {
      const p = HD.plan.generatePlan(goal, Object.assign({}, prefs, { limits: { gentle: true } }), {}, {}, TODAY);
      const sets = p.sessions.filter((s) => s.kind === 'strength' && ['adaptation', 'base'].includes(s.phase)).flatMap((s) => s.target.exercises.filter((e) => e.role !== 'conditioning').map((e) => e.sets));
      expect(Math.max(...sets)).toBe(2);
    });
    it('дополнительная силовая цель: упражнение идёт первым в каждой силовой', () => {
      const sc = G.scenario.scenario({ type: 'weight_loss', params: goal.params }, [{ id: 'x', type: 'strength_lift', params: { exercise_key: 'bench_bb' } }]);
      const p = HD.plan.generatePlan(goal, prefs, {}, {}, TODAY, HD.EXERCISES, sc);
      expect(p.sessions.filter((s) => s.kind === 'strength').every((s) => s.target.exercises[0].exercise_key === 'bench_bb')).toBeTruthy();
    });
    it('дополнительная цель «пробежать дистанцию» добавляет бег, если его не было', () => {
      const noRun = { sessions: [{ kind: 'strength', per_week: 2, days: [1, 3] }], equipment: ['bodyweight'] };
      const sc = G.scenario.scenario({ type: 'weight_loss', params: goal.params }, [{ id: 'r', type: 'run_distance', params: { target_value: 5 } }]);
      const p = HD.plan.generatePlan(goal, noRun, {}, {}, TODAY, HD.EXERCISES, sc);
      expect(p.sessions.some((s) => s.kind === 'run')).toBeTruthy();
    });
    it('недостаточно занятий для цели — предупреждение', () => {
      const sc = G.scenario.scenario({ type: 'weight_loss', params: goal.params }, [{ id: 'c', type: 'consistency', params: { per_week: 5 } }]);
      const p = HD.plan.generatePlan(goal, prefs, {}, {}, TODAY, HD.EXERCISES, sc);
      expect(p.warnings.some((w) => /5 тренировок/.test(w))).toBeTruthy();
    });
  });

  describe('Порядок первого запуска', () => {
    async function fresh() {
      await HD.db.init({ memoryOnly: true });
      D.setToday(TODAY);
      HD.seed.seed();
    }
    it('при первом запуске нет демо-профилей, только библиотека упражнений', async () => {
      await fresh();
      expect(HD.db.all('profiles').length).toBe(0);
      expect(HD.db.all('exercises').length > 40).toBeTruthy();
    });
    it('шаги идут по порядку: анкета → цель → расписание, пока не завершены — приложение закрыто', async () => {
      await fresh();
      const p = HD.svc.onboarding.create('Я');
      let o = HD.svc.ctx(p.id).onboarding;
      expect([o.assessment, o.goal, o.schedule, o.done]).toEqual([false, false, false, false]);
      HD.svc.onboarding.saveAssessment(p.id, base);
      o = HD.svc.ctx(p.id).onboarding;
      expect([o.assessment, o.goal, o.schedule, o.done]).toEqual([true, false, false, false]);
      HD.svc.goals.replaceMain(p.id, { type: 'weight_loss', title: 'Минус 10', params: { start_value: 90, target_value: 80, deadline: '2027-03-01' } });
      o = HD.svc.ctx(p.id).onboarding;
      expect([o.assessment, o.goal, o.schedule, o.done]).toEqual([true, false, false, false]);
      HD.svc.onboarding.confirmGoals(p.id);
      o = HD.svc.ctx(p.id).onboarding;
      expect([o.assessment, o.goal, o.schedule, o.done]).toEqual([true, true, false, false]);
      HD.svc.plan.savePreferences(p.id, { sessions: [{ kind: 'strength', per_week: 3, duration_min: 60, days: [0, 2, 4] }], equipment: ['barbell', 'bodyweight'], likes: [], dislikes: [] });
      HD.svc.onboarding.finish(p.id);
      const c = HD.svc.ctx(p.id);
      expect(c.onboarding.done).toBeTruthy();
      expect(c.plan.weeks > 10).toBeTruthy();
      expect(c.targets.length).toBe(1);
      expect(HD.svc.ctx(p.id).profile.height_cm).toBe(180);
      D.setToday(null);
    });
    it('анкета заполняет профиль и вес; оценка сохраняется историей', async () => {
      await fresh();
      const p = HD.svc.onboarding.create('Я');
      HD.svc.onboarding.saveAssessment(p.id, base);
      const c = HD.svc.ctx(p.id);
      expect(c.profile.name).toBe('Тест');
      expect(c.currentWeight).toBe(90);
      expect(c.assessment.overall.score >= 0).toBeTruthy();
      HD.svc.onboarding.saveAssessment(p.id, Object.assign({}, base, { weight_kg: 88 }));
      expect(HD.db.forProfile('assessments', p.id).length).toBe(2);
      D.setToday(null);
    });
    it('смена основной цели убирает несочетаемые дополнительные, остальные переезжают', async () => {
      await fresh();
      const p = HD.svc.onboarding.create('Я');
      HD.svc.onboarding.saveAssessment(p.id, base);
      HD.svc.goals.replaceMain(p.id, { type: 'weight_loss', title: 'Минус', params: { start_value: 90, target_value: 80 } });
      HD.svc.goals.create(p.id, { role: 'secondary', type: 'strength_lift', title: 'Жим 100', params: { exercise_key: 'bench_bb', start_value: 60, target_value: 100 } });
      const out = HD.svc.goals.replaceMain(p.id, { type: 'weight_gain', title: 'Набор', params: { start_value: 90, target_value: 95 } });
      expect(out.dropped.length).toBe(0);
      const out2 = HD.svc.goals.replaceMain(p.id, { type: 'race', title: 'Забег', params: { distance_max: 10, deadline: '2027-06-01', surface: 'road' } });
      expect(out2.dropped.length).toBe(0);
      expect(HD.svc.ctx(p.id).secondaries.length).toBe(1);
      D.setToday(null);
    });
    it('нормa питания учитывает дополнительную цель и ограничения', async () => {
      await fresh();
      const p = HD.svc.onboarding.create('Я');
      HD.svc.onboarding.saveAssessment(p.id, base);
      HD.svc.goals.replaceMain(p.id, { type: 'weight_loss', title: 'Минус', params: { start_value: 90, target_value: 78, deadline: '2027-03-01' } });
      HD.svc.plan.savePreferences(p.id, { sessions: [{ kind: 'strength', per_week: 3, days: [0, 2, 4] }], equipment: ['barbell', 'bodyweight'] });
      const noSec = HD.svc.nutrition.autoTarget(HD.svc.ctx(p.id));
      HD.svc.goals.create(p.id, { role: 'secondary', type: 'strength_lift', title: 'Жим', params: { exercise_key: 'bench_bb', start_value: 60, target_value: 90 } });
      const withSec = HD.svc.nutrition.autoTarget(HD.svc.ctx(p.id));
      expect(withSec.daily_kcal >= noSec.daily_kcal).toBeTruthy();
      expect(withSec.protein_g >= noSec.protein_g).toBeTruthy();
      D.setToday(null);
    });
    it('PIN по умолчанию выключен; включается и выключается в настройках', async () => {
      await fresh();
      expect(HD.db.setting('pin_hash')).toBe(undefined);
      HD.db.setting('pin_hash', 'x');
      HD.db.setting('pin_hash', null);
      expect(!!HD.db.setting('pin_hash')).toBeFalsy();
    });
    it('демо-профили загружаются по запросу и не дублируются', async () => {
      await fresh();
      expect(HD.seed.loadDemo().length).toBe(2);
      expect(HD.seed.loadDemo().length).toBe(0);
      const g = HD.svc.ctx('demo-max');
      expect(g.onboarding.done).toBeTruthy();
      expect(g.secondaries.length).toBe(2);
      expect(HD.svc.goals.overview(g).secondary.every((i) => i.effect)).toBeTruthy();
      D.setToday(null);
    });
  });
})(window.HD);
