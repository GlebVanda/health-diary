// Серия бега: подключение к профилю, утренний чек-ин, факт пробежки. Расчёты — в domain/streak.js.
// Данные: `streaks` (одна запись на профиль), `streak_days` (по записи на день: чек-ин и результат).
(function (HD) {
  const db = HD.db;
  const S = HD.streak;
  HD.svc = HD.svc || {};

  const num = (v) => (v === '' || v == null || isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

  function active(profileId) {
    return db.forProfile('streaks', profileId, (s) => s.is_active !== false)[0] || null;
  }

  // Подключить серию (и событие в календаре). Повторный вызов ничего не дублирует.
  function connect(profileId, start) {
    const ex = active(profileId);
    if (ex) return ex;
    start = start || S.START;
    const end = HD.dates.addDays(start, S.DAYS - 1);
    const st = db.insert('streaks', { profile_id: profileId, plan: 'run22', title: 'Серия бега: 22 дня', start_date: start, end_date: end, is_active: true, doctor_ok: null });
    db.insert('events', { profile_id: profileId, title: 'Серия бега: 22 дня', date: end, kind: 'challenge', streak_id: st.id });
    return st;
  }

  // Отключить серию вместе с записями дней и событием
  function disconnect(profileId) {
    const st = active(profileId);
    if (!st) return;
    db.where('streak_days', (d) => d.streak_id === st.id).forEach((d) => db.remove('streak_days', d.id));
    db.where('events', (e) => e.streak_id === st.id).forEach((e) => db.remove('events', e.id));
    db.remove('streaks', st.id);
  }

  function rows(profileId, streak) {
    return streak ? db.forProfile('streak_days', profileId, (d) => d.streak_id === streak.id) : [];
  }

  function model(ctx) {
    const st = active(ctx.profileId);
    if (!st) return null;
    const m = S.model(st, rows(ctx.profileId, st), ctx.today, { doctorOk: st.doctor_ok });
    m.streak = st;
    return m;
  }

  function day(profileId, st, date) {
    return db.forProfile('streak_days', profileId, (d) => d.streak_id === st.id && d.date === date)[0] || null;
  }

  function write(profileId, st, date, patch) {
    const ex = day(profileId, st, date);
    if (ex) return db.update('streak_days', ex.id, patch);
    return db.insert('streak_days', Object.assign({ profile_id: profileId, streak_id: st.id, date }, patch));
  }

  // Утренний чек-ин: числа приводятся к числам, флажки к булевым
  function saveCheckin(profileId, st, date, v) {
    const c = {
      pain: Math.max(0, Math.min(10, num(v.pain) || 0)),
      tender: !!v.tender,
      hop: !!v.hop,
      red_flag: !!v.red_flag,
      fever: !!v.fever,
      heavy: !!v.heavy,
      joint: !!v.joint,
      rest_hr: num(v.rest_hr),
      sleep_h: num(v.sleep_h),
      at: new Date().toISOString(),
    };
    const row = write(profileId, st, date, { checkin: c });
    // Утренний вес уходит в замеры тела (как быстрый ввод на главной) и пересчитывает норму питания
    const w = num(v.weight_kg);
    if (w != null && w >= 30 && w <= 300) {
      db.upsert('body_measurements', (m) => m.profile_id === profileId && m.date === date, { profile_id: profileId, date, weight_kg: w });
      if (HD.svc.nutrition && HD.svc.nutrition.recalc) HD.svc.nutrition.recalc(profileId, 'Новое взвешивание');
    }
    return row;
  }

  function clearCheckin(profileId, st, date) {
    const ex = day(profileId, st, date);
    if (ex) db.update('streak_days', ex.id, { checkin: null });
  }

  // Факт пробежки: км, темп мм:сс, пульс, состояние голеней. День засчитывается от минимума серии (3 км).
  function saveResult(profileId, st, date, v) {
    const km = num(v.km);
    const pace = String(v.pace || '').trim();
    const r = {
      km,
      pace: S.toSec(pace) != null ? pace : null,
      hr: num(v.hr),
      shin: ['ok', 'discomfort', 'pain'].includes(v.shin) ? v.shin : 'ok',
      note: v.note ? String(v.note).trim() : null,
      done: km != null && km >= S.MIN_KM,
      at: new Date().toISOString(),
    };
    return write(profileId, st, date, { result: r });
  }

  function clearResult(profileId, st, date) {
    const ex = day(profileId, st, date);
    if (ex) db.update('streak_days', ex.id, { result: null });
  }

  // Отметка «врач разрешил продолжать»: серия возвращается на уровень Б
  function doctorOk(profileId, st, date) {
    return db.update('streaks', st.id, { doctor_ok: date });
  }

  HD.svc.streak = { active, connect, disconnect, model, day, saveCheckin, clearCheckin, saveResult, clearResult, doctorOk };
})(window.HD);
