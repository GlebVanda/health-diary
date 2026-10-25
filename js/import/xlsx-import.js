// Импорт истории из Excel (раздел 9 ТЗ): калории по дням, отметки «Поход в зал» и взвешивания в текущий профиль. Файл читается только в браузере и никуда не отправляется.
// Источник: лист «Общая таблица», блок «Блок 3.1 — норма калорий», строки 88–311.
// analyze() — пробный прогон (--dry-run): отчёт без записи. apply() — запись с upsert, повторный запуск без дублей.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;
  const SHEET = 'Общая таблица';
  const ROW_FROM = 88;
  const ROW_TO = 311;
  const COLS = 'ABCDEFG'.split('');

  function cellDate(cell, date1904) {
    if (!cell || cell.v == null || cell.v === '') return null;
    if (typeof cell.v === 'number' && cell.v > 30000 && cell.v < 60000) return D.fromExcelSerial(cell.v, date1904);
    if (typeof cell.v === 'string') {
      const m = cell.v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (m) {
        const y = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
      if (D.isValid(cell.v.trim().slice(0, 10))) return cell.v.trim().slice(0, 10);
    }
    return null;
  }

  function num(cell) {
    if (!cell || cell.v == null || cell.v === '' || typeof cell.v === 'boolean') return null;
    const n = typeof cell.v === 'number' ? cell.v : Number(String(cell.v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function text(cell) {
    return cell && cell.v != null ? String(cell.v) : '';
  }

  function rowHasBooleans(cells, r) {
    return COLS.some((c) => {
      const x = cells.get(c + r);
      return x && (x.t === 'b' || x.v === 'TRUE' || x.v === 'FALSE');
    });
  }

  function bool(cell) {
    if (!cell) return false;
    return cell.v === true || cell.v === 'TRUE' || cell.v === 1;
  }

  // Базовый бюджет недели: константа в H или первое крупное число в формуле «=14000-…»
  function baseBudget(cell, prevBase) {
    if (!cell) return { base: prevBase, from: 'prev' };
    if (cell.f) {
      const m = cell.f.match(/\d{4,6}/g);
      const n = m && m.map(Number).find((x) => x >= 5000 && x <= 50000);
      if (n) return { base: n, from: 'formula' };
      return { base: prevBase, from: 'prev' };
    }
    const v = num(cell);
    return v ? { base: v, from: 'value' } : { base: prevBase, from: 'prev' };
  }

  async function analyze(arrayBuffer) {
    const wb = await HD.xlsx.open(arrayBuffer);
    if (!wb.sheets.includes(SHEET)) throw new Error(`Не найден лист «${SHEET}». Листы в файле: ${wb.sheets.join(', ')}`);
    const cells = await wb.readSheet(SHEET, ROW_FROM, ROW_TO);
    const weeks = [];
    const weighIns = [];
    const suspicious = [];
    let prevBase = null;

    for (let r = ROW_FROM; r <= ROW_TO; r++) {
      // Взвешивание: в A «ВЕС НА ДД.ММ», в J число
      const a = text(cells.get('A' + r));
      const wm = a.match(/ВЕС\s+НА\s+(\d{1,2})\.(\d{1,2})/i);
      if (wm) {
        const kg = num(cells.get('J' + r));
        const date = `2026-${wm[2].padStart(2, '0')}-${wm[1].padStart(2, '0')}`;
        if (kg && D.isValid(date)) weighIns.push({ date, weight_kg: kg, row: r });
        else suspicious.push({ row: r, reason: `Строка взвешивания «${a}» без числа в J` });
        continue;
      }
      // Строка дат недели: даты в A–G
      const dates = COLS.map((c) => cellDate(cells.get(c + r), wb.date1904));
      const nDates = dates.filter(Boolean).length;
      if (nDates < 5) continue;
      const issues = [];
      if (nDates < 7) issues.push('не все 7 дат заполнены');
      const consecutive = dates.every((d, i) => d && (i === 0 || D.diffDays(dates[i - 1], d) === 1));
      if (!consecutive) issues.push('даты идут не подряд');
      if (dates[0] && D.dow(dates[0]) !== 0) issues.push('неделя начинается не с понедельника');
      if (issues.length) {
        suspicious.push({ row: r, reason: 'Пропущена неделя: ' + issues.join(', ') });
        continue;
      }
      const budgetCell = cells.get('H' + r);
      const b = baseBudget(budgetCell, prevBase);
      if (!b.base) suspicious.push({ row: r, reason: 'Не удалось определить бюджет недели' });
      prevBase = b.base || prevBase;
      const kcal = COLS.map((c) => num(cells.get(c + (r + 2))));
      // Строка активности — после метки «Поход в зал» (обычно r+4)
      let actRow = null;
      for (let k = r + 2; k <= r + 6; k++) {
        const hasLabel = Array.from({ length: 12 }, (_, i) => text(cells.get(String.fromCharCode(65 + i) + k))).some((t) => /поход в зал/i.test(t));
        if (hasLabel) {
          actRow = rowHasBooleans(cells, k) ? k : k + 1;
          break;
        }
      }
      if (actRow == null && rowHasBooleans(cells, r + 4)) actRow = r + 4;
      const gym = actRow ? COLS.map((c) => bool(cells.get(c + actRow))) : COLS.map(() => false);
      if (actRow == null) suspicious.push({ row: r, reason: 'Не найдена строка «Поход в зал»' });
      kcal.forEach((k, i) => {
        if (k != null && (k < 300 || k > 8000)) suspicious.push({ row: r + 2, reason: `${D.dmy(dates[i])}: подозрительное значение ${k} ккал` });
      });
      weeks.push({ row: r, monday: dates[0], dates, base: b.base, baseFrom: b.from, budgetCached: num(budgetCell), kcal, gym });
      r += 2;
    }

    const checkCell = cells.get('A311');
    const checkupDone = checkCell ? bool(checkCell) : null;

    const report = {
      weeks,
      weighIns,
      suspicious,
      checkupDone,
      counts: {
        weeks: weeks.length,
        foodDays: weeks.reduce((s, w) => s + w.kcal.filter((k) => k != null).length, 0),
        trainings: weeks.reduce((s, w) => s + w.gym.filter(Boolean).length, 0),
        weighIns: weighIns.length,
        suspicious: suspicious.length,
      },
    };
    report.checks = verify(report);
    return report;
  }

  // Проверка на импортируемых данных теми же функциями, что работают в приложении
  function simulateWeeks(report) {
    const foodByDate = new Map();
    for (const w of report.weeks) w.dates.forEach((d, i) => w.kcal[i] != null && foodByDate.set(d, { kcal: w.kcal[i] }));
    const baseByMonday = new Map(report.weeks.map((w) => [w.monday, w.base]));
    const gymByMonday = new Map(report.weeks.map((w) => [w.monday, w.gym.filter(Boolean).length]));
    let last = null;
    const targetFor = (m) => {
      if (baseByMonday.has(m)) last = baseByMonday.get(m);
      return last ? { daily_kcal: last / 7, floor: 1500 } : null;
    };
    if (!report.weeks.length) return [];
    return HD.budget.computeWeeks({
      foodByDate,
      targetFor,
      trainingsFor: (m) => ({ done: gymByMonday.get(m) || 0, planned: 3 }),
      capPct: 0.15,
      fromMonday: report.weeks[0].monday,
      toMonday: report.weeks[report.weeks.length - 1].monday,
    });
  }

  function verify(report) {
    const sim = simulateWeeks(report);
    const checks = [];
    const w1 = sim.find((w) => w.monday === '2026-01-12');
    const w2 = sim.find((w) => w.monday === '2026-01-19');
    if (w1) {
      checks.push({ label: 'Сумма 12–18.01.2026 = 14 785 ккал', ok: Math.round(w1.eaten) === 14785, actual: w1.eaten });
      checks.push({ label: 'Среднее 12–18.01.2026 ≈ 2112', ok: w1.avg != null && Math.round(w1.avg) === 2112, actual: w1.avg && Math.round(w1.avg) });
    } else checks.push({ label: 'Неделя 12–18.01.2026 найдена', ok: false });
    if (w2) checks.push({ label: 'Бюджет 19–25.01.2026 = 13 215', ok: Math.round(w2.budget) === 13215, actual: w2.budget });
    // Расхождения бюджета с таблицей по всем неделям
    const mismatches = [];
    for (const w of report.weeks) {
      const s = sim.find((x) => x.monday === w.monday);
      if (s && s.hasTarget && w.budgetCached != null && Math.abs(s.budget - w.budgetCached) > 1) mismatches.push({ monday: w.monday, sheet: w.budgetCached, app: Math.round(s.budget) });
    }
    checks.push({ label: 'Бюджеты недель совпадают с таблицей', ok: mismatches.length === 0, actual: mismatches.length ? mismatches.length + ' расхождений' : 'все совпадают', mismatches });
    return checks;
  }

  // Запись в профиль profileId. Цели не создаются: они задаются в приложении при первичной настройке.
  function apply(report, profileId) {
    const stats = { food: 0, logs: 0, weights: 0, targets: 0 };
    const p = profileId;
    // Ручная норма недели — только при смене значения
    let lastDaily = null;
    const existingTargets = db.forProfile('nutrition_targets', p, (t) => t.source === 'xlsx');
    for (const w of report.weeks) {
      if (!w.base) continue;
      const daily = Math.round(w.base / 7);
      if (daily === lastDaily) continue;
      lastDaily = daily;
      const prev = existingTargets.find((t) => t.valid_from === w.monday);
      const row = { profile_id: p, valid_from: w.monday, daily_kcal: daily, protein_g: null, fat_g: null, carbs_g: null, source: 'xlsx', calc_details: { floor: 1500, reason: 'Импорт из Excel', manual: true } };
      if (prev) db.update('nutrition_targets', prev.id, row);
      else db.insert('nutrition_targets', row);
      stats.targets++;
    }
    for (const w of report.weeks) {
      w.dates.forEach((date, i) => {
        if (w.kcal[i] != null) {
          db.upsert('food_days', (f) => f.profile_id === p && f.date === date, { profile_id: p, date, kcal: w.kcal[i], source: 'xlsx' });
          stats.food++;
        }
        if (w.gym[i]) {
          db.upsert('session_logs', (l) => l.profile_id === p && l.date === date && l.source === 'xlsx', { profile_id: p, date, done: true, kind: 'other', title: 'Поход в зал', planned_session_id: null, source: 'xlsx' });
          stats.logs++;
        }
      });
    }
    for (const m of report.weighIns) {
      db.upsert('body_measurements', (x) => x.profile_id === p && x.date === m.date, { profile_id: p, date: m.date, weight_kg: m.weight_kg, source: 'xlsx' });
      stats.weights++;
    }
    db.setting('xlsx_imported_at:' + p, new Date().toISOString());
    db.save();
    return stats;
  }

  HD.xlsxImport = { analyze, apply, verify, simulateWeeks, SHEET, ROW_FROM, ROW_TO };
})(window.HD);
