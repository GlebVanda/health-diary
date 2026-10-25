// Расчёт дневной нормы калорий и КБЖУ (раздел 5.1 ТЗ).
(function (HD) {
  const { clamp, round } = HD.util;

  const KCAL_PER_KG = 7700;

  function bmr({ sex, weightKg, heightCm, age }) {
    if (!weightKg || !heightCm || age == null) return null;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return sex === 'm' ? base + 5 : base - 161;
  }

  // 1,375 при 1–3 тренировках в неделю, 1,55 при 4 и больше, 1,2 без плана
  function activityFactor(sessionsPerWeek, fallback) {
    if (sessionsPerWeek >= 4) return 1.55;
    if (sessionsPerWeek >= 1) return 1.375;
    if (sessionsPerWeek === 0 && fallback) return fallback;
    return 1.2;
  }

  function floorKcal(sex, bmrValue) {
    const sexFloor = sex === 'm' ? 1500 : 1200;
    return Math.max(sexFloor, bmrValue || 0);
  }

  /**
   * adjust — что хочет цель:
   *   { mode: 'deficit', current, target, weeksLeft } — снижение веса/объёма
   *   { mode: 'surplus', pct } — набор
   *   { mode: 'maintenance', pct? } — поддержание (pct > 0 — небольшой профицит для силовой цели)
   * proteinPerKg, carbsMinPerKg — особенности цели
   */
  function computeTarget(input) {
    const { sex, weightKg, heightCm, age, sessionsPerWeek, activityFallback } = input;
    const adjust = input.adjust || { mode: 'maintenance' };
    const b = bmr({ sex, weightKg, heightCm, age });
    const factor = activityFactor(sessionsPerWeek || 0, activityFallback);
    const details = {
      bmr: b != null ? Math.round(b) : null,
      activity_factor: factor,
      sessions_per_week: sessionsPerWeek || 0,
      weight_kg: weightKg,
      height_cm: heightCm,
      age,
      mode: adjust.mode,
    };
    if (b == null) {
      return { daily_kcal: null, details: Object.assign(details, { error: 'Нужны вес, рост и возраст' }) };
    }
    const tdee = b * factor;
    details.tdee = Math.round(tdee);
    let kcal = tdee;
    if (adjust.mode === 'deficit') {
      // Темп 0,5–1% веса в неделю, дефицит 15–20% от расхода
      let needPace;
      if (adjust.weeksLeft && adjust.current != null && adjust.target != null) {
        needPace = Math.max(0, adjust.current - adjust.target) / Math.max(1, adjust.weeksLeft);
      } else needPace = 0.0075 * weightKg;
      const pace = clamp(needPace, 0.005 * weightKg, 0.01 * weightKg);
      let deficit = (pace * KCAL_PER_KG) / 7;
      // Дополнительные цели могут сузить дефицит (например, сохранить силу: не больше 15%)
      const maxDef = input.maxDeficitPct || 0.2;
      deficit = clamp(deficit, Math.min(0.15, maxDef) * tdee, maxDef * tdee);
      details.max_deficit_pct = maxDef;
      kcal = tdee - deficit;
      details.pace_kg_week = Math.round(pace * 100) / 100;
      details.deficit = Math.round(deficit);
    } else if (adjust.mode === 'surplus') {
      kcal = tdee * (1 + (adjust.pct || 0.1));
      details.surplus_pct = adjust.pct || 0.1;
    } else if (adjust.pct) {
      kcal = tdee * (1 + adjust.pct);
      details.surplus_pct = adjust.pct;
    }
    const floor = floorKcal(sex, b);
    details.floor = Math.round(floor);
    if (kcal < floor) {
      kcal = Math.ceil(floor / 50) * 50;
      details.floor_applied = true;
    } else kcal = round(kcal, 50);

    // КБЖУ
    const proteinPerKg = input.proteinPerKg || 1.6;
    const protein = proteinPerKg * weightKg;
    let fat = 0.8 * weightKg;
    let carbs = (kcal - protein * 4 - fat * 9) / 4;
    if (input.carbsMinPerKg && carbs < input.carbsMinPerKg * weightKg) {
      carbs = input.carbsMinPerKg * weightKg;
      fat = Math.max(0.6 * weightKg, (kcal - protein * 4 - carbs * 4) / 9);
      details.carbs_min_applied = true;
    }
    carbs = Math.max(0, carbs);
    return {
      daily_kcal: kcal,
      protein_g: Math.round(protein),
      fat_g: Math.round(fat),
      carbs_g: Math.round(carbs),
      details,
    };
  }

  // Цвет дня: ±5% нейтрально, выше — предупреждение, ниже нормы более чем на 30% — тоже предупреждение
  function dayColor(kcal, norm) {
    if (kcal == null || !norm) return 'empty';
    const r = kcal / norm;
    if (r > 1.05) return 'over';
    if (r < 0.7) return 'under';
    if (r >= 0.95) return 'ok';
    return 'good';
  }

  HD.nutrition = { bmr, activityFactor, floorKcal, computeTarget, dayColor, KCAL_PER_KG };
})(window.HD);
