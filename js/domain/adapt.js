// Адаптация плана по факту (раздел 6.4 ТЗ). Чистая функция: возвращает список предлагаемых изменений,
// применяет их сервис плана. Каждое изменение имеет ключ, чтобы не срабатывать повторно.
(function (HD) {
  const D = HD.dates;

  function effectiveTarget(session) {
    const t = session.target || {};
    const adj = (session.adjustments || []).filter((a) => !a.reverted);
    let duration = t.duration_min;
    let distance = t.distance_km;
    for (const a of adj) {
      if (a.factor) {
        if (duration) duration = Math.round((duration * a.factor) / 5) * 5;
        if (distance) distance = Math.round(distance * a.factor * 10) / 10;
      }
      if (a.plus_min && duration) duration += a.plus_min;
    }
    return { duration_min: duration, distance_km: distance };
  }

  function longRunOfWeek(sessions, week) {
    const s = sessions.find((x) => x.week_index === week && x.kind === 'run' && x.target && x.target.is_long);
    return s ? s.target.duration_min : null;
  }

  /**
   * input: { plan, sessions, logs (все отметки профиля), today, goalType, goalPace, applied: Set(ключей) }
   */
  function evaluate(input) {
    const { plan, sessions, today } = input;
    const applied = input.applied || new Set();
    const out = [];
    if (!plan || !sessions || !sessions.length) return out;
    if (today < plan.start_date || today > plan.end_date) return out;

    const nextMonday = D.nextMonday(today);
    const nextWeek = { from: nextMonday, to: D.addDays(nextMonday, 6) };
    const curWeekIndex = Math.floor(D.diffDays(plan.start_date, today) / 7) + 1;
    const done = input.logs.filter((l) => l.done && l.date <= today).sort((a, b) => (a.date === b.date ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.date < b.date ? -1 : 1));
    const rated = done.filter((l) => l.wellbeing != null);
    const recentFrom = D.addDays(today, -7);
    const push = (a) => {
      if (!applied.has(a.key)) out.push(a);
    };

    // 1. Самочувствие ≤ 4 два раза подряд → следующая неделя легче на 25%
    if (rated.length >= 2) {
      const [a, b] = rated.slice(-2);
      if (a.wellbeing <= 4 && b.wellbeing <= 4 && b.date >= recentFrom) {
        push({ rule: 'fatigue', key: 'fatigue:' + b.id, type: 'lighten', factor: 0.75, ...nextWeek, reason: 'Неделя облегчена: два раза подряд самочувствие ≤ 4' });
      }
    }

    // 1б. Ощущения от тренировок (из режима «Начать тренировку»): две подряд тяжёлые → следующая неделя легче на 15%;
    //     две подряд лёгкие → небольшой рост длительности. Правила не дублируют облегчение по самочувствию.
    const felt = done.filter((l) => l.feel);
    if (felt.length >= 2) {
      const [x, y] = felt.slice(-2);
      const hardish = (f) => f === 'hard' || f === 'fail';
      if (hardish(x.feel) && hardish(y.feel) && y.date >= recentFrom && !out.some((o) => o.type === 'lighten')) {
        push({ rule: 'feel_hard', key: 'feel_hard:' + y.id, type: 'lighten', factor: 0.85, ...nextWeek, reason: 'Неделя облегчена на 15%: две тренировки подряд прошли тяжело' });
      }
      if (x.feel === 'easy' && y.feel === 'easy' && y.date >= recentFrom && !out.some((o) => o.type === 'lighten')) {
        push({ rule: 'feel_easy', key: 'feel_easy:' + y.id, type: 'boost', plus_min: 5, plus_kg: 0, ...nextWeek, reason: 'Нагрузка немного повышена (+5 мин): две тренировки подряд прошли легко' });
      }
    }

    // 2. Самочувствие ≥ 8 три раза подряд и цель отстаёт → рост на верхней границе
    if (rated.length >= 3 && input.goalPace === 'behind') {
      const last3 = rated.slice(-3);
      if (last3.every((l) => l.wellbeing >= 8) && last3[2].date >= recentFrom) {
        push({ rule: 'boost', key: 'boost:' + last3[2].id, type: 'boost', plus_min: 10, plus_kg: 2.5, ...nextWeek, reason: 'Рост на верхней границе: три раза подряд самочувствие ≥ 8, а цель отстаёт' });
      }
    }

    // 3. Факт длительности/дистанции < 80% плана → неделя повторяется (или срезается пик)
    const byId = new Map(sessions.map((s) => [s.id, s]));
    for (const l of done) {
      if (l.date < recentFrom || !l.planned_session_id) continue;
      const s = byId.get(l.planned_session_id);
      if (!s) continue;
      const t = effectiveTarget(s);
      const short =
        (t.duration_min && l.duration_min != null && Number(l.duration_min) < 0.8 * t.duration_min) ||
        (t.distance_km && l.distance_km != null && Number(l.distance_km) < 0.8 * t.distance_km);
      if (short) {
        const lr = longRunOfWeek(sessions, s.week_index);
        push({
          rule: 'underperform',
          key: 'under:' + l.id,
          type: 'rebuild',
          from: nextMonday,
          level: { lastLongRunMin: lr },
          reason: `Неделя повторяется: «${s.title}» выполнена меньше чем на 80% плана`,
        });
        break;
      }
    }

    // 4–5. Перерыв в тренировках: 7–13 дней → откат на неделю, 14+ → на 2–3 недели
    const lastDone = done.length ? done[done.length - 1].date : null;
    const ref = lastDone && lastDone >= plan.start_date ? lastDone : plan.start_date;
    const gap = D.diffDays(ref, today);
    if (gap >= 7 && D.diffDays(plan.start_date, today) >= 7) {
      const back = gap >= 21 ? 3 : gap >= 14 ? 2 : 1;
      const refWeek = Math.max(1, Math.min(curWeekIndex, Math.floor(D.diffDays(plan.start_date, ref) / 7) + 1));
      let week = Math.max(1, refWeek - back);
      while (week > 1 && HD.plan.isDeloadWeek(plan.phases, week)) week--;
      const lr = longRunOfWeek(sessions, week);
      push({
        rule: gap >= 14 ? 'gap14' : 'gap7',
        key: (gap >= 14 ? 'gap14:' : 'gap7:') + ref,
        type: 'rebuild',
        from: D.monday(today),
        level: { lastLongRunMin: lr },
        checkRealism: gap >= 14,
        reason: `Нет тренировок ${gap} ${HD.util.plural(gap, 'день', 'дня', 'дней')}: план откатан на ${back} ${HD.util.plural(back, 'неделю', 'недели', 'недель')} назад`,
      });
    }

    // 6. Рабочий вес в целевом упражнении не растёт 3 недели → разгрузка и смена схемы
    if (input.goalType === 'strength_lift') {
      const lifts = done.filter((l) => l.key_lift_kg != null);
      const cut = D.addDays(today, -21);
      const before = lifts.filter((l) => l.date < cut);
      const recent = lifts.filter((l) => l.date >= cut);
      if (before.length && recent.length >= 2) {
        const bestBefore = Math.max(...before.map((l) => Number(l.key_lift_kg)));
        const bestRecent = Math.max(...recent.map((l) => Number(l.key_lift_kg)));
        if (bestRecent <= bestBefore) {
          push({ rule: 'stall', key: 'stall:' + D.monday(today), type: 'deload_switch', ...nextWeek, reason: 'Разгрузка и смена схемы повторений: рабочий вес не растёт 3 недели' });
        }
      }
    }
    return out;
  }

  HD.adapt = { evaluate, effectiveTarget, longRunOfWeek };
})(window.HD);
