// Проверка безопасности цели: темп, итоговый ИМТ, нагрузка относительно подготовки и здоровья.
// Это не медицинская рекомендация, а предупреждения. Уровни:
//   info — к сведению, warn — стоит пересмотреть, danger — серьёзный риск (нужно явное подтверждение),
//   block — цель задать нельзя (беременность, недовес при снижении веса и т.п.).
(function (HD) {
  const D = HD.dates;
  const G = HD.goals;
  const { num } = HD.util;

  // Недель до дедлайна (не меньше 1) или null
  function weeksLeft(deadline, today) {
    if (!deadline) return null;
    return Math.max(1, D.diffDays(today, deadline) / 7);
  }

  // Минимум недель на подготовку к дистанции (км) при уровне выносливости 0–4
  const BASE_WEEKS = [12, 9, 6, 4, 3];
  function minWeeksForDistance(km, cardioScore) {
    const lvl = Math.min(4, Math.max(0, Math.floor(cardioScore)));
    return Math.ceil(BASE_WEEKS[lvl] * Math.pow(Math.max(km, 3) / 5, 0.75));
  }

  /**
   * input: { type, role, params, today, profile: { sex, height_cm }, weight (текущий), assessment, main? }
   * → { items: [{ key, level, text }], blocked: bool, needsConfirm: bool, hint? }
   */
  function check(input) {
    const { type, params: p, today, assessment: asm } = input;
    const items = [];
    const add = (key, level, text) => items.push({ key, level, text });
    const weight = Number(input.weight) || null;
    const height = Number(input.profile && input.profile.height_cm) || null;
    const lim = (asm && asm.limits) || {};
    const lvl = asm ? asm.overall.score : 1;
    const cardio = asm ? asm.cardio.score : 1;
    let hint = null;

    if (type === 'weight_loss') {
      const start = Number(p.start_value) || weight;
      const target = Number(p.target_value);
      if (lim.noWeightLoss) add('no_loss', 'block', 'Снижение веса сейчас недоступно: ИМТ ниже нормы. Выберите другую цель.');
      if (target && start && target >= start) add('bad_dir', 'block', 'Целевой вес должен быть меньше стартового.');
      if (target && height) {
        const bmiT = target / Math.pow(height / 100, 2);
        if (bmiT < 18.5) add('target_bmi', 'block', `При весе ${num(target, 1)} кг ИМТ будет ${bmiT.toFixed(1)} — это недовес. Целевой вес не может быть ниже ${num(18.5 * Math.pow(height / 100, 2), 1)} кг.`);
        else if (bmiT < 20) add('target_bmi_low', 'warn', `ИМТ на финише ${bmiT.toFixed(1)} — у нижней границы нормы. Убедитесь, что это осознанный выбор.`);
      }
      if (start && target && target < start) {
        const total = start - target;
        const weeks = weeksLeft(p.deadline, today);
        const safeWeeks = Math.ceil(total / (start * 0.0075));
        hint = { safeWeeks, safeDate: D.addDays(today, safeWeeks * 7), safePace: Math.round(start * 0.0075 * 100) / 100 };
        if (weeks) {
          const pace = total / weeks;
          const pct = (pace / start) * 100;
          if (pct > 1.5) add('pace_danger', 'danger', `Темп ${num(pace, 2)} кг/нед (${num(pct, 1)}% веса в неделю) — это слишком быстро и небезопасно: возможна потеря мышц и проблемы со здоровьем. Рекомендуемый темп 0,5–1% веса в неделю, то есть цель достижима примерно к ${D.short(hint.safeDate, true)}.`);
          else if (pct > 1) add('pace_warn', 'warn', `Темп ${num(pace, 2)} кг/нед (${num(pct, 1)}% веса) выше рекомендуемого 0,5–1%. Реалистичнее — к ${D.short(hint.safeDate, true)}.`);
          if (pct > 0.75 && (lvl <= 1 || (height && weight && weight / Math.pow(height / 100, 2) >= 35))) add('pace_unfit', 'warn', 'При низкой подготовке или ИМТ от 35 начинайте с темпа около 0,5% в неделю: нагрузку на суставы и сердце нужно наращивать постепенно.');
        } else add('no_deadline', 'info', `Без дедлайна безопасный темп — около ${num(hint.safePace, 2)} кг/нед, примерно до ${D.short(hint.safeDate, true)}.`);
        if (total / start > 0.2 && (!weeks || weeks < 26)) add('big_loss', 'warn', `Снижение больше 20% веса быстрее чем за полгода — тяжёлая цель. Рассмотрите промежуточный рубеж.`);
      }
    }

    if (type === 'weight_gain') {
      const start = Number(p.start_value) || weight;
      const target = Number(p.target_value);
      if (target && start && target <= start) add('bad_dir', 'block', 'Целевой вес должен быть больше стартового.');
      if (target && height) {
        const bmiT = target / Math.pow(height / 100, 2);
        if (bmiT >= 30) add('target_bmi_high', 'warn', `ИМТ на финише ${bmiT.toFixed(1)} — это уже ожирение. Если речь о наборе мышц, проверьте реалистичность цели.`);
      }
      const weeks = weeksLeft(p.deadline, today);
      if (weeks && start && target > start) {
        const pct = ((target - start) / weeks / start) * 100;
        if (pct > 0.5) add('gain_pace', 'warn', `Темп набора ${num(pct, 2)}% веса в неделю быстрее 0,25–0,5%: сверх этого растёт в основном жир.`);
      }
    }

    if (type === 'strength_lift') {
      const start = Number(p.start_value);
      const target = Number(p.target_value);
      if (target && start && target <= start) add('bad_dir', 'block', 'Целевой вес должен быть больше стартового.');
      const weeks = weeksLeft(p.deadline, today);
      if (weeks && start && target > start) {
        const perWeek = (target - start) / weeks;
        const limitPct = lvl <= 1 ? 0.04 : lvl === 2 ? 0.02 : 0.01;
        if (perWeek / start > limitPct * 1.5) add('lift_pace_danger', 'danger', `Прибавка ${num(perWeek, 1)} кг в неделю слишком быстрая для вашего уровня: высокий риск травмы. Реально — до ${num(start * limitPct, 1)} кг в неделю.`);
        else if (perWeek / start > limitPct) add('lift_pace_warn', 'warn', `Прибавка ${num(perWeek, 1)} кг в неделю выше обычной для вашего уровня (до ${num(start * limitPct, 1)} кг).`);
      }
      if (weight && target) {
        const ratio = target / weight;
        const ex = HD.exerciseByKey(p.exercise_key);
        const heavy = ex && ['squat', 'hinge'].includes(ex.pattern) ? 2 : 1.5;
        if (ratio > heavy && lvl <= 2) add('lift_ratio', 'warn', `Цель — ${num(ratio, 1)} веса тела: для вашей подготовки это очень много. Лучше ставить рубежи по этапам.`);
      }
    }

    if (type === 'race') {
      const dist = Number(p.distance_max || p.distance_min || 0);
      const weeks = weeksLeft(p.deadline, today);
      if (dist && weeks != null) {
        const need = minWeeksForDistance(dist, cardio);
        if (weeks < need * 0.6) add('race_danger', 'danger', `До старта ${Math.round(weeks)} нед., а для ${dist} км при вашей выносливости нужно хотя бы ${need}. Риск травмы очень высок — лучше выбрать более близкую дистанцию или сдвинуть дату.`);
        else if (weeks < need) add('race_warn', 'warn', `До старта ${Math.round(weeks)} нед., рекомендуется не меньше ${need} для ${dist} км при вашей выносливости: подготовка будет напряжённой.`);
        hint = { minWeeks: need, earliest: D.addDays(today, need * 7) };
      }
      if (lim.lowImpact && dist >= 10) add('race_impact', 'warn', 'При текущих ограничениях ударная нагрузка бега опасна для суставов: подготовка начнётся с ходьбы и лёгких пробежек, сроки могут сдвинуться.');
      if (asm && asm.bmi >= 35 && dist >= 10) add('race_bmi', 'warn', `ИМТ ${asm.bmi}: длинные дистанции дадут сильную нагрузку на суставы. Лучше начать с меньшей дистанции.`);
    }

    if (type === 'consistency') {
      const n = Number(p.per_week);
      if (n > 6) add('too_many', 'warn', 'Больше 6 тренировок в неделю не оставляет дней на восстановление.');
      else if (n > 4 && lvl <= 1) add('too_many_new', 'warn', 'Для начального уровня 5 и более тренировок в неделю — риск перетренированности. Начните с 3.');
    }

    if (type === 'measurement') {
      const start = Number(p.start_value);
      const target = Number(p.target_value);
      const weeks = weeksLeft(p.deadline, today);
      if (weeks && start && target && start > target && (start - target) / weeks > 1) add('cm_pace', 'warn', `Минус ${num((start - target) / weeks, 1)} см в неделю быстрее реалистичного (до 0,5–1 см).`);
    }

    if (type === 'run_distance') {
      const km = Number(p.target_value);
      if (lim.lowImpact && km >= 5) add('run_lowimpact', 'warn', 'При текущих ограничениях бег вводится постепенно, после ходьбы и бег-ходьбы.');
      if (cardio < 1 && km >= 10) add('run_far', 'warn', `${km} км без остановки при нулевой выносливости — отдалённая цель. Поставьте промежуточные рубежи.`);
    }

    const blocked = items.some((i) => i.level === 'block');
    const needsConfirm = !blocked && items.some((i) => i.level === 'danger');
    const order = { block: 0, danger: 1, warn: 2, info: 3 };
    items.sort((a, b) => order[a.level] - order[b.level]);
    return { items, blocked, needsConfirm, hint };
  }

  G.safety = { check, minWeeksForDistance, weeksLeft };
})(window.HD);
