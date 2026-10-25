// Импорт из Excel на синтетическом файле той же структуры (раздел 9 ТЗ): проверки и идемпотентность.
(function (HD) {
  const D = HD.dates;

  // Минимальный ZIP без сжатия (method 0)
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const nameB = enc.encode(name);
      const data = enc.encode(text);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(8, 0, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(10, 0, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nameB.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, Object.keys(files).length, true);
    eocd.setUint16(10, Object.keys(files).length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of all) {
      out.set(p, o);
      o += p.length;
    }
    return out.buffer;
  }

  const serial = (d) => Math.round((D.parse(d) - Date.UTC(1899, 11, 30)) / 864e5);
  const COLS = 'ABCDEFGHIJ';

  function buildWorkbook() {
    const strings = ['Поход в зал', 'ВЕС НА 19.01', 'Блок 3.1 — норма калорий', 'ВЕС НА 26.01'];
    const rows = {};
    const set = (r, c, xml) => ((rows[r] = rows[r] || {}), (rows[r][c] = xml));
    const n = (v) => `<v>${v}</v>`;
    const s = (i) => ['t="s"', `<v>${i}</v>`];
    set(88, 'A', s(2));
    const week = (r, monday, budget, kcal, gym, formula) => {
      D.weekDays(monday).forEach((d, i) => {
        set(r, COLS[i], ['', n(serial(d))]);
        set(r + 2, COLS[i], kcal[i] == null ? null : ['', n(kcal[i])]);
        set(r + 4, COLS[i], ['t="b"', n(gym[i] ? 1 : 0)]);
      });
      set(r, 'H', ['', (formula ? `<f>${formula}</f>` : '') + n(budget)]);
      set(r + 1, 'A', ['', n(Math.round(budget / 7))]);
      set(r + 3, 'A', s(0));
    };
    week(90, '2026-01-12', 14000, [2100, 2200, 2000, 2150, 2135, 2100, 2100], [1, 0, 1, 0, 1, 0, 0]);
    set(96, 'A', s(1));
    set(96, 'J', ['', n(98.1)]);
    week(98, '2026-01-19', 13215, [1900, 2000, null, 1950, 2000, 1800, 1700], [1, 0, 1, 0, 0, 1, 0], '14000-H90+SUM(A92:G92)-14000');
    set(104, 'A', s(3));
    set(104, 'J', ['', n(97.4)]);
    // Строка с неполными датами — должна попасть в «подозрительные»
    set(110, 'A', ['', n(serial('2026-01-26'))]);
    set(110, 'B', ['', n(serial('2026-01-27'))]);
    set(110, 'C', ['', n(serial('2026-01-28'))]);
    set(110, 'D', ['', n(serial('2026-01-29'))]);
    set(110, 'F', ['', n(serial('2026-01-31'))]);
    set(311, 'A', ['t="b"', n(0)]);
    // Строка вне диапазона не читается
    set(5, 'A', ['', n(999999)]);

    const sheetRows = Object.keys(rows)
      .map(Number)
      .sort((a, b) => a - b)
      .map((r) => `<row r="${r}">${Object.entries(rows[r]).filter(([, v]) => v).map(([c, [attr, inner]]) => `<c r="${c}${r}" ${attr}>${inner}</c>`).join('')}</row>`)
      .join('');
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return zip({
      'xl/workbook.xml': `<?xml version="1.0"?><workbook ${ns}><workbookPr/><sheets><sheet name="Другое" sheetId="1" r:id="rId1"/><sheet name="Общая таблица" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
      'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${ns}>${strings.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
      'xl/worksheets/sheet2.xml': `<?xml version="1.0"?><worksheet ${ns}><sheetData>${sheetRows}</sheetData></worksheet>`,
    });
  }

  describe('Импорт из Excel (9)', () => {
    it('пробный прогон: недели, калории, тренировки, взвешивания, подозрительные строки', async () => {
      const r = await HD.xlsxImport.analyze(buildWorkbook());
      expect(r.counts.weeks).toBe(2);
      expect(r.counts.foodDays).toBe(13);
      expect(r.counts.trainings).toBe(6);
      expect(r.weighIns).toEqual([
        { date: '2026-01-19', weight_kg: 98.1, row: 96 },
        { date: '2026-01-26', weight_kg: 97.4, row: 104 },
      ]);
      expect(r.suspicious.some((x) => x.row === 110)).toBeTruthy();
      expect(r.weeks[1].base).toBe(14000);
      expect(r.checkupDone).toBe(false);
    });
    it('проверки: 14 785 ккал, среднее ≈ 2112, бюджет 19–25.01 = 13 215', async () => {
      const r = await HD.xlsxImport.analyze(buildWorkbook());
      expect(r.checks.every((c) => c.ok)).toBeTruthy();
    });
    it('запись идемпотентна: повторный запуск не создаёт дублей', async () => {
      await HD.db.init({ memoryOnly: true });
      D.setToday('2026-10-15');
      HD.seed.seed();
      const me = HD.svc.onboarding.create('Тест');
      const other = HD.svc.onboarding.create('Другой');
      const r = await HD.xlsxImport.analyze(buildWorkbook());
      HD.xlsxImport.apply(r, me.id);
      const snap = () => HD.db.TABLES.map((t) => HD.db.all(t).length).join(',');
      const a = snap();
      HD.xlsxImport.apply(await HD.xlsxImport.analyze(buildWorkbook()), me.id);
      expect(snap()).toBe(a);
      expect(HD.db.forProfile('food_days', me.id).length).toBe(13);
      expect(HD.db.forProfile('food_days', other.id).length).toBe(0);
      expect(HD.db.forProfile('goals', me.id).length).toBe(0);
      // норма из таблицы — ручная, 2000 в день; бюджет недели 19.01 в приложении = 13 215
      const ctx = HD.svc.ctx(me.id);
      expect(ctx.targets.map((t) => t.daily_kcal)).toEqual([2000]);
      expect(HD.svc.nutrition.week(ctx, '2026-01-19').budget).toBe(13215);
      // перебор → неделя 12.01 не засчитана, как и в таблице
      expect(HD.svc.nutrition.week(ctx, '2026-01-12').counted).toBeFalsy();
      expect(HD.svc.nutrition.week(ctx, '2026-01-12').trainings).toEqual({ done: 3, planned: 3 });
      expect(HD.db.forProfile('food_days', me.id).every((f) => f.source === 'xlsx')).toBeTruthy();
      D.setToday(null);
    });
  });
})(window.HD);
