// Серия бега на 22 дня: готовый календарь, утренний чек-ин (светофор), лестница отката и контрольные точки роста.
// Чистые функции: все данные приходят параметрами, ничего не читается из хранилища.
//
//   чек-ин утром → светофор дня (зелёный / жёлтый / красный) → уровень лестницы (А / Б / В / Г) → цель дня;
//   после пробежки записывается факт (км, темп, пульс, состояние голеней);
//   на контрольных точках (8 и 15 ноября) по чек-инам и фактам за прошлую неделю решается, растёт ли нагрузка.
(function (HD) {
  const D = HD.dates;

  const START = '2026-11-01';
  const MIN_KM = 3; // минимум серии: меньше 3 км день не засчитывается
  const EASY_CAP = 5; // потолок лёгкого дня, км
  const LONG_CAP = 9; // потолок длинной, км
  const PACE_FLOOR = 6 * 60; // качественный темп не быстрее 6:00 на км
  const SLOW = '7:30 и медленнее';

  // ---- темп ----
  const toSec = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const fmtPace = (sec) => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  const range = (lo, hi) => (lo === hi ? fmtPace(lo) : fmtPace(lo) + '–' + fmtPace(hi));
  const km = (v) => String(v).replace('.', ',');

  // ---- календарь: 22 дня, начиная с 1 ноября (вс) ----
  const BASE = [
    { type: 'long', km: 5 },
    { type: 'easy', km: 3.5, test: true },
    { type: 'quality_a', km: 5, work: 3 },
    { type: 'easy', km: 4, group: true },
    { type: 'easy', km: 3.5 },
    { type: 'quality_b', km: 5, reps: 5 },
    { type: 'recovery', km: 3 },
    { type: 'long', km: 7 },
    { type: 'easy', km: 3.5 },
    { type: 'quality_a', km: 5.5, work: 3.5 },
    { type: 'easy', km: 4 },
    { type: 'easy', km: 3.5 },
    { type: 'quality_b', km: 5.5, reps: 6 },
    { type: 'recovery', km: 3 },
    { type: 'long', km: 8, peak: true },
    { type: 'easy', km: 3.5 },
    { type: 'quality_a', km: 6, work: 4 },
    { type: 'easy', km: 4 },
    { type: 'easy', km: 3.5 },
    { type: 'quality_b', km: 5, reps: 5, soft: true },
    { type: 'recovery', km: 3 },
    { type: 'finish', km: 5 },
  ];
  const DAYS = BASE.length;

  const LABEL = { long: 'Длинный лёгкий', easy: 'Лёгкий', quality_a: 'Качественный А', quality_b: 'Качественный Б', recovery: 'Восстановительный', finish: 'Финиш серии' };
  const isQuality = (type) => type === 'quality_a' || type === 'quality_b';
  const BASE_PACE = { quality_a: [6 * 60 + 15, 6 * 60 + 30], quality_b: [6 * 60, 6 * 60 + 15] };

  // Контрольные точки: дата, окно проверки (7 дней до неё), что растёт
  function checkpoints(start) {
    start = start || START;
    return [
      { n: 1, date: D.addDays(start, 7), from: start, to: D.addDays(start, 6), easyPlus: 0.5, shiftLo: 5, shiftHi: 10, longTo: null, noYellowLast3: false },
      { n: 2, date: D.addDays(start, 14), from: D.addDays(start, 7), to: D.addDays(start, 13), easyPlus: 0.5, shiftLo: 5, shiftHi: 5, longTo: LONG_CAP, noYellowLast3: true },
    ];
  }

  // Что изменилось к дате: суммарная прибавка по пройденным точкам
  function effectAt(date, cps) {
    const e = { easyPlus: 0, shiftLo: 0, shiftHi: 0, longTo: null };
    for (const c of cps || []) {
      if (c.passed !== true || c.date > date) continue;
      e.easyPlus += c.easyPlus;
      e.shiftLo += c.shiftLo;
      e.shiftHi += c.shiftHi;
      if (c.longTo) e.longTo = c.longTo;
    }
    return e;
  }

  // План дня по календарю с учётом пройденных контрольных точек
  function dayPlan(i, start, cps) {
    start = start || START;
    const b = BASE[i];
    const date = D.addDays(start, i);
    const eff = effectAt(date, cps);
    let kmv = b.km;
    let pace = '7:00–7:45';
    let how;
    if (b.type === 'easy') kmv = Math.min(EASY_CAP, b.km + eff.easyPlus);
    if (b.type === 'long' && b.peak && eff.longTo) kmv = eff.longTo;
    if (isQuality(b.type)) {
      const base = BASE_PACE[b.type];
      const lo = Math.max(PACE_FLOOR, base[0] - eff.shiftLo);
      const hi = Math.max(lo, base[1] - eff.shiftHi);
      pace = range(lo, hi);
      how = b.type === 'quality_a' ? `1 км разминка, ${km(b.work)} км в ${pace}, 1 км заминка` : `1 км разминка, ${b.reps} × (2 мин в ${pace} + 2 мин трусцой), заминка до ${km(b.km)} км`;
    }
    if (b.type === 'recovery') pace = SLOW;
    if (b.test) how = '6:45–7:00, смотри пульс: если он ниже ~155, лёгкий темп можно чуть ускорить';
    if (b.type === 'finish') how = 'лёгко, без героизма';
    if (b.group) how = 'с группой, в своём темпе';
    if (!how) how = pace;
    return {
      n: i + 1,
      date,
      type: b.type,
      quality: isQuality(b.type),
      long: b.type === 'long',
      label: (b.test ? 'Лёгкий (проверка темпа)' : b.soft ? 'Качественный Б (мягче)' : LABEL[b.type]) + (b.peak ? ' (пик серии)' : ''),
      km: kmv,
      pace,
      how,
    };
  }

  // ---- светофор по утреннему чек-ину ----
  // checkin: { pain 0–10, tender, hop, red_flag (хромота, боль в покое или ночью, отёк), fever (температура/простуда ниже шеи),
  //            heavy (тяжесть в икрах), joint (колено/ахилл), rest_hr, sleep_h }
  // baseHr — пульс покоя в норме (среднее первых трёх утр); prevDelta — отклонение пульса вчера; prevPain — вчерашний бег прошёл с болью
  function light(c, ctx) {
    ctx = ctx || {};
    if (!c) return null;
    const red = [];
    const yellow = [];
    const pain = Number(c.pain) || 0;
    const delta = c.rest_hr != null && ctx.baseHr ? Number(c.rest_hr) - ctx.baseHr : 0;
    if (pain >= 4) red.push('боль в голени ' + pain + ' из 10');
    if (c.tender) red.push('точечная болезненность кости');
    if (c.hop) red.push('боль при прыжках на одной ноге');
    if (c.red_flag) red.push('хромота, боль в покое или ночью, отёк');
    if (c.fever) red.push('температура или простуда ниже шеи');
    if (delta >= 10 && ctx.prevDelta >= 10) red.push('пульс покоя выше нормы на 10+ уд/мин два дня подряд');
    if (pain >= 2 && pain <= 3) yellow.push('боль в голени ' + pain + ' из 10');
    if (c.heavy) yellow.push('тяжесть в икрах');
    if (c.joint) yellow.push('лёгкая боль в колене или ахилле');
    if (delta >= 5 && !(delta >= 10 && ctx.prevDelta >= 10)) yellow.push('пульс покоя выше нормы на ' + Math.round(delta) + ' уд/мин');
    if (c.sleep_h != null && c.sleep_h !== '' && Number(c.sleep_h) < 6) yellow.push('сон меньше 6 часов');
    if (ctx.prevShinPain) yellow.push('вчера на пробежке болела голень');
    const L = red.length ? 'red' : yellow.length ? 'yellow' : 'green';
    return { light: L, reasons: red.length ? red : yellow };
  }

  const LEVELS = ['A', 'B', 'V', 'G'];
  const LEVEL_NAME = { A: 'А · План', B: 'Б · Защита', V: 'В · Минимум', G: 'Г · Стоп' };
  const LEVEL_HINT = {
    A: 'Бежим по календарю.',
    B: 'Только лёгкие дни: 3–4 км в 7:30 и медленнее, длинная не больше 5 км, без качественных.',
    V: 'Минимум серии: 3 км быстрым шагом в темпе 9:00 или быстрее.',
    G: 'Серия остановлена. Нужен визит к спортивному врачу (УЗИ или МРТ голеней).',
  };

  /**
   * Лестница откатов по истории чек-инов. days: [{ date, checkin, result }] по возрастанию даты.
   * Спускаемся сразу в день симптома, поднимаемся только после зелёных дней: В → Б после 2, Б → А после 3.
   * Возвращает карту дата → { level, light, reasons } и итоговый уровень.
   */
  function ladder(days, opts) {
    opts = opts || {};
    const out = {};
    let level = 'A';
    let greens = 0;
    let redStreak = 0;
    let tenderAtV = 0;
    const yellows = [];
    const hrs = [];
    let prevDelta = 0;
    let prevShinPain = false;
    let prevDate = null;
    let doctorUsed = false;
    for (const d of days) {
      if (!d.checkin) {
        prevShinPain = !!(d.result && d.result.shin === 'pain');
        continue;
      }
      const c = d.checkin;
      if (c.rest_hr != null && c.rest_hr !== '' && hrs.length < 3) hrs.push(Number(c.rest_hr));
      const baseHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
      const delta = c.rest_hr != null && c.rest_hr !== '' && baseHr ? Number(c.rest_hr) - baseHr : 0;
      const prevDay = prevDate && D.diffDays(prevDate, d.date) === 1;
      const L = light(c, { baseHr, prevDelta: prevDay ? prevDelta : 0, prevShinPain: prevDay && prevShinPain });
      if (level === 'G') {
        // Выход из стопа — только после заключения врача (отметка на серии)
        if (opts.doctorOk && !doctorUsed && d.date > opts.doctorOk) {
          level = 'B';
          doctorUsed = true;
          greens = 0;
        }
      }
      if (level !== 'G') {
        const pain = Number(c.pain) || 0;
        if (L.light === 'red') {
          redStreak++;
          greens = 0;
          if (level === 'V' && c.tender) tenderAtV++;
          else if (level !== 'V') tenderAtV = c.tender ? 1 : 0;
          const stop = pain >= 5 || c.red_flag || redStreak >= 2 || tenderAtV >= 3;
          level = stop ? 'G' : 'V';
        } else {
          redStreak = 0;
          tenderAtV = 0;
          if (L.light === 'yellow') {
            greens = 0;
            const recent = yellows.filter((y) => D.diffDays(y, d.date) <= 5);
            const yesterdayYellow = yellows.length && D.diffDays(yellows[yellows.length - 1], d.date) === 1;
            yellows.push(d.date);
            if (level === 'A' && (recent.length >= 1 || yesterdayYellow)) level = 'B';
          } else {
            greens++;
            if (level === 'V' && greens >= 2) (level = 'B'), (greens = 0);
            else if (level === 'B' && greens >= 3) (level = 'A'), (greens = 0);
          }
        }
      }
      out[d.date] = { level, light: L.light, reasons: L.reasons };
      prevDelta = delta;
      prevShinPain = !!(d.result && d.result.shin === 'pain');
      prevDate = d.date;
    }
    return { byDate: out, level };
  }

  // ---- цель дня: план × светофор × уровень ----
  // forcedB — откат на уровень Б после проваленной контрольной точки
  function target(plan, level, lightColor, forcedB) {
    let lv = level || 'A';
    if (forcedB && lv === 'A') lv = 'B';
    if (lv === 'G') return { mode: 'stop', level: lv, title: 'Серия остановлена', km: 0, pace: null, how: LEVEL_HINT.G };
    if (lv === 'V' || lightColor === 'red') return { mode: 'minimum', level: lv === 'V' ? 'V' : lv, title: 'Минимум серии: быстрый шаг', km: MIN_KM, pace: '9:00 или быстрее', how: 'Не бежим. 3 км быстрым шагом по ровной поверхности, чтобы серия не прервалась.' };
    if (lv === 'B') {
      if (plan.long) return { mode: 'protect', level: lv, title: 'Лёгкий бег (защита)', km: Math.min(5, plan.km), pace: SLOW, how: 'Защитный режим: длинная не больше 5 км, в 7:30 и медленнее.' };
      const kmv = plan.type === 'recovery' ? 3 : Math.min(4, Math.max(3, plan.km));
      return { mode: 'protect', level: lv, title: 'Лёгкий бег (защита)', km: kmv, pace: SLOW, how: 'Защитный режим: только лёгкие дни, 3–4 км в 7:30 и медленнее.' };
    }
    if (lightColor === 'yellow' && plan.quality) return { mode: 'swap_easy', level: lv, title: 'Лёгкий бег вместо качественного', km: 4, pace: SLOW, how: 'Жёлтый день: качественную заменяем лёгким бегом 3–4 км в 7:30 и медленнее.' };
    return { mode: 'plan', level: lv, title: plan.label, km: plan.km, pace: plan.pace, how: plan.how };
  }

  // ---- контрольные точки ----
  // map: дата → { checkin, light, result }; today — текущая дата
  function evalCheckpoint(cp, plans, map, today) {
    if (today < cp.date) return { passed: null, reasons: [] };
    const reasons = [];
    let reds = 0;
    let yellows = 0;
    let missing = 0;
    let qualityMissed = 0;
    const dates = D.range(cp.from, cp.to);
    let yellowLast3 = 0;
    dates.forEach((dt, k) => {
      const m = map[dt];
      if (!m || !m.light) return missing++;
      if (m.light === 'red') reds++;
      if (m.light === 'yellow') {
        yellows++;
        if (k >= dates.length - 3) yellowLast3++;
      }
    });
    for (const p of plans) if (p.quality && p.date >= cp.from && p.date <= cp.to) if (!(map[p.date] && map[p.date].result && map[p.date].result.done)) qualityMissed++;
    if (missing) reasons.push('нет утреннего чек-ина за ' + missing + ' дн.');
    if (reds) reasons.push('красных дней: ' + reds);
    if (yellows > 1) reasons.push('жёлтых дней больше одного: ' + yellows);
    if (qualityMissed) reasons.push('качественных дней не выполнено: ' + qualityMissed);
    if (cp.noYellowLast3 && yellowLast3) reasons.push('жёлтый день в последние 3 дня недели');
    return { passed: reasons.length === 0, reasons };
  }

  /**
   * Полная модель серии. streak: { start_date }, rows: [{ date, checkin, result }], today, opts: { doctorOk }.
   * Возвращает дни с планом, светофором, уровнем, целью и статусом, контрольные точки и счётчик серии.
   */
  function model(streak, rows, today, opts) {
    opts = opts || {};
    const start = (streak && streak.start_date) || START;
    const byDate = new Map((rows || []).map((r) => [r.date, r]));
    const sorted = D.range(start, D.addDays(start, DAYS - 1)).map((date) => byDate.get(date) || { date });
    const lad = ladder(sorted.filter((r) => r.date <= today), { doctorOk: opts.doctorOk });
    // Контрольные точки зависят от светофора, а план дня — от пройденных точек: считаем по порядку
    const cps = checkpoints(start);
    const lightMap = {};
    for (const r of sorted) lightMap[r.date] = { light: lad.byDate[r.date] ? lad.byDate[r.date].light : null, result: r.result, checkin: r.checkin };
    for (const cp of cps) {
      const plans = Array.from({ length: DAYS }, (_, i) => dayPlan(i, start, null));
      Object.assign(cp, evalCheckpoint(cp, plans, lightMap, today));
    }
    const days = sorted.map((r, i) => {
      const plan = dayPlan(i, start, cps);
      const l = lad.byDate[r.date] || null;
      const failedCp = cps.find((c) => c.passed === false && c.longTo && r.date >= c.date && r.date <= D.addDays(c.date, 2));
      const tgt = r.date <= today || l ? target(plan, l ? l.level : prevLevel(lad, sorted, i), l ? l.light : null, !!failedCp) : target(plan, 'A', null, false);
      const done = !!(r.result && r.result.done);
      return Object.assign({}, r, { n: i + 1, plan, light: l ? l.light : null, reasons: l ? l.reasons : [], level: l ? l.level : null, target: tgt, done, forcedB: !!failedCp });
    });
    // Счётчик серии: подряд идущие засчитанные дни от старта; сегодняшний день, пока не выполнен, серию не рвёт
    let len = 0;
    let broken = null;
    for (const d of days) {
      if (d.date > today) break;
      if (d.done) len++;
      else if (d.date < today) {
        broken = d.date;
        break;
      }
    }
    return { start, end: D.addDays(start, DAYS - 1), days, checkpoints: cps, level: lad.level, streakLen: len, broken, today };
  }

  // Уровень на день без чек-ина: тот, что остался с предыдущего дня с чек-ином
  function prevLevel(lad, sorted, i) {
    for (let k = i - 1; k >= 0; k--) if (lad.byDate[sorted[k].date]) return lad.byDate[sorted[k].date].level;
    return 'A';
  }

  HD.streak = { START, DAYS, MIN_KM, EASY_CAP, LONG_CAP, PACE_FLOOR, LEVELS, LEVEL_NAME, LEVEL_HINT, BASE, toSec, fmtPace, dayPlan, checkpoints, effectAt, light, ladder, target, evalCheckpoint, model, isQuality };
})(window.HD);
