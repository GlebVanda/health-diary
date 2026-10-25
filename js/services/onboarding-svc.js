// Профили и первичная настройка: анкета подготовки → цели → расписание. Без этого приложением пользоваться нельзя.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;

  function list() {
    return db.all('profiles');
  }

  // Новый пустой профиль: попадает в онбординг (анкета → цели → расписание)
  function create(name) {
    return db.insert('profiles', {
      name: name || 'Я',
      sex: null,
      birth_date: null,
      height_cm: null,
      activity_level: null,
      timezone: 'Europe/Moscow',
      carry_cap_pct: 0.15,
      onb_assessment: false,
    });
  }

  /**
   * Сохраняет ответы анкеты: личные данные профиля, замер веса, запись об оценке подготовки.
   * Каждое повторное прохождение — новая запись (история уровня).
   */
  function saveAssessment(profileId, answers) {
    const today = D.today();
    db.update('profiles', profileId, {
      name: String(answers.name || '').trim() || 'Я',
      sex: answers.sex,
      birth_date: answers.birth_date,
      height_cm: Number(answers.height_cm),
      onb_assessment: true,
    });
    const w = Number(answers.weight_kg);
    if (w) {
      const row = { profile_id: profileId, date: today, weight_kg: w };
      if (Number(answers.waist_cm)) row.waist_cm = Number(answers.waist_cm);
      db.upsert('body_measurements', (m) => m.profile_id === profileId && m.date === today, row);
    }
    const result = HD.fitness.assess(answers, today);
    return db.insert('assessments', { profile_id: profileId, date: today, answers: HD.util.deepClone(answers), result });
  }

  // Ответы для предзаполнения: последние сохранённые + текущие данные профиля
  function prefill(ctx) {
    const a = Object.assign({}, ctx.answers || {});
    const p = ctx.profile;
    if (p.name && p.name !== 'Я') a.name = a.name || p.name;
    a.sex = a.sex || p.sex || undefined;
    a.birth_date = a.birth_date || p.birth_date || undefined;
    a.height_cm = a.height_cm || p.height_cm || undefined;
    if (ctx.currentWeight && !a.weight_kg) a.weight_kg = Math.round(ctx.currentWeight * 10) / 10;
    return a;
  }

  // Шаг «Цели» пройден: основная цель задана, дополнительные (если нужны) добавлены
  function confirmGoals(profileId) {
    return db.update('profiles', profileId, { onb_goals_done: true });
  }

  // Завершение настройки: план по анкете, норма питания
  function finish(profileId) {
    HD.svc.plan.ensurePlan(profileId);
    const res = HD.svc.nutrition.recalc(profileId, 'Первичная настройка');
    return res;
  }

  // Переоценка при изменении подготовки: пересчёт ограничений и плана
  function reassess(profileId, answers) {
    saveAssessment(profileId, answers);
    const ctx = HD.svc.ctx(profileId);
    if (ctx.onboarding.done) HD.svc.plan.generate(profileId, { reason: 'Обновлена оценка подготовки' });
    HD.svc.nutrition.recalc(profileId, 'Обновлена оценка подготовки');
  }

  HD.svc.onboarding = { list, create, saveAssessment, prefill, confirmGoals, finish, reassess };
})(window.HD);
