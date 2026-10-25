// Цели: общий интерфейс GoalStrategy и расчёты, общие для всех типов (раздел 4 ТЗ).
// Основная цель одна, у неё нет «веса»: общий процент = прогресс основной цели.
// Дополнительные цели корректируют сценарий основной (см. scenario.js).
//
// GoalStrategy = {
//   type, label, roles: ['main','secondary'],
//   fields: [{ key, label, type: 'number'|'date'|'select'|'text'|'items', unit?, options?, required? }],
//   progress(params, ctx, asOf) → { pct: 0..100 | null, current, unit, note }
//   nutrition(params, ctx) → { mode, proteinPerKg?, carbsMinPerKg?, pct? }
//   widget: 'weight' | 'longrun' | 'lift' | 'streak' | 'measurement' | 'run_distance'
// }
// Новый тип цели — один файл в js/domain/goals/, который вызывает HD.goals.register(...).
(function (HD) {
  const D = HD.dates;
  const { clamp } = HD.util;
  const registry = {};

  function register(strategy) {
    registry[strategy.type] = strategy;
  }
  function get(type) {
    return registry[type];
  }
  function list(role) {
    const all = Object.values(registry);
    return role ? all.filter((s) => (s.roles || ['main', 'secondary']).includes(role)) : all;
  }

  // Версия параметров цели, действующая на дату
  function versionAt(versions, asOf) {
    const sorted = versions.slice().sort((a, b) => (a.valid_from < b.valid_from ? -1 : a.valid_from > b.valid_from ? 1 : (a.created_at || '') < (b.created_at || '') ? -1 : 1));
    let v = null;
    for (const x of sorted) if (x.valid_from <= asOf) v = x;
    return v || sorted[0] || null;
  }

  function clampPct(v) {
    if (v == null || !isFinite(v)) return null;
    return clamp(v, 0, 100);
  }

  // Прогресс между стартом и целью: (старт − текущий) / (старт − цель); подходит и для снижения, и для набора
  function linearProgress(start, target, current) {
    if (start == null || target == null || current == null) return null;
    if (start === target) return current === target ? 100 : 0;
    return clampPct(((start - current) / (start - target)) * 100);
  }

  // Ожидаемый прогресс на дату: линейно от старта до дедлайна
  function expectedPct(params, asOf) {
    if (!params || !params.deadline || !params.start_date) return null;
    const total = D.diffDays(params.start_date, params.deadline);
    if (total <= 0) return 100;
    return clampPct((D.diffDays(params.start_date, asOf) / total) * 100);
  }

  // «опережаем» (> +5 п.п.), «по графику» (±5), «отстаём»
  function paceStatus(actual, expected) {
    if (actual == null || expected == null) return null;
    const d = actual - expected;
    if (d > 5) return 'ahead';
    if (d < -5) return 'behind';
    return 'on_track';
  }

  const PACE_LABEL = { ahead: 'Опережаем', on_track: 'По графику', behind: 'Отстаём' };

  function goalProgress(goal, versions, ctx, asOf) {
    const s = get(goal.type);
    const v = versionAt(versions, asOf);
    if (!s || !v) return { pct: null, params: null };
    if (goal.status === 'archived' && goal.final_progress != null) {
      return { pct: goal.final_progress, params: v.params, final: true };
    }
    const r = s.progress(v.params, ctx, asOf) || {};
    const expected = expectedPct(v.params, asOf);
    return Object.assign({}, r, {
      pct: clampPct(r.pct),
      expected,
      pace: paceStatus(clampPct(r.pct), expected),
      params: v.params,
      version: v,
    });
  }

  // Текущий вес: среднее взвешиваний за последние 7 дней, иначе последнее
  function currentValue(measurements, field, asOf, avg7) {
    const rows = measurements.filter((m) => m.date <= asOf && m[field] != null);
    if (!rows.length) return null;
    if (avg7) {
      const from = D.addDays(asOf, -6);
      const recent = rows.filter((m) => m.date >= from);
      if (recent.length) return recent.reduce((s, m) => s + Number(m[field]), 0) / recent.length;
    }
    return Number(rows[rows.length - 1][field]);
  }

  HD.goals = {
    register,
    get,
    list,
    versionAt,
    linearProgress,
    expectedPct,
    paceStatus,
    PACE_LABEL,
    goalProgress,
    currentValue,
    clampPct,
  };
})(window.HD);
