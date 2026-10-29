// Серия бега на 22 дня: календарь, светофор, лестница отката, контрольные точки и запись чек-ина/результата.
(function (HD) {
  const S = HD.streak;
  const D = HD.dates;

  const ok = { pain: 0, rest_hr: 55, sleep_h: 7.5 };
  const dayOf = (i) => D.addDays(S.START, i);
  // день i (0 = 1 ноября) с чек-ином c
  const row = (i, c, result) => ({ date: dayOf(i), checkin: c, result });
  const done = (km) => ({ km: km || 5, done: true, shin: 'ok' });

  describe('Серия бега: календарь', () => {
    it('22 дня с 1 по 22 ноября, около 99 км', () => {
      const plans = Array.from({ length: S.DAYS }, (_, i) => S.dayPlan(i));
      expect(plans.length).toBe(22);
      expect(plans[0].date).toBe('2026-11-01');
      expect(plans[21].date).toBe('2026-11-22');
      const total = plans.reduce((a, p) => a + p.km, 0);
      expect(total).toBeWithin(98, 101);
      // недели: 29, 32 и 33 км, день 22 — 5 км
      const week = (a, b) => plans.slice(a, b).reduce((s, p) => s + p.km, 0);
      expect(week(0, 7)).toBe(29);
      expect(week(7, 14)).toBe(32);
      expect(week(14, 21)).toBe(33);
    });
    it('качественные дни — вторник и пятница, длинный — воскресенье', () => {
      for (let i = 0; i < S.DAYS; i++) {
        const p = S.dayPlan(i);
        if (p.quality) expect([1, 4].includes(D.dow(p.date))).toBeTruthy();
        if (p.long) expect(D.dow(p.date)).toBe(6);
      }
    });
    it('качественный день описан по-русски с темпом и разминкой', () => {
      const p = S.dayPlan(2); // вт 3.11, качественный А
      expect(p.how).toBe('1 км разминка, 3 км в 6:15–6:30, 1 км заминка');
      const b = S.dayPlan(5);
      expect(b.how).toBe('1 км разминка, 5 × (2 мин в 6:00–6:15 + 2 мин трусцой), заминка до 5 км');
    });
  });

  describe('Серия бега: светофор', () => {
    it('зелёный: нет жалоб', () => {
      expect(S.light(ok, { baseHr: 55 }).light).toBe('green');
    });
    it('жёлтый: боль 2–3, тяжесть в икрах, пульс +5…9, сон меньше 6 ч', () => {
      expect(S.light({ pain: 2 }, {}).light).toBe('yellow');
      expect(S.light({ pain: 3 }, {}).light).toBe('yellow');
      expect(S.light({ pain: 0, heavy: true }, {}).light).toBe('yellow');
      expect(S.light({ pain: 0, joint: true }, {}).light).toBe('yellow');
      expect(S.light({ pain: 0, rest_hr: 61 }, { baseHr: 55 }).light).toBe('yellow');
      expect(S.light({ pain: 0, sleep_h: 5 }, {}).light).toBe('yellow');
      expect(S.light({ pain: 0 }, { prevShinPain: true }).light).toBe('yellow');
    });
    it('красный: боль 4+, точечная болезненность, прыжки, флаги, температура', () => {
      expect(S.light({ pain: 4 }, {}).light).toBe('red');
      expect(S.light({ pain: 0, tender: true }, {}).light).toBe('red');
      expect(S.light({ pain: 0, hop: true }, {}).light).toBe('red');
      expect(S.light({ pain: 0, red_flag: true }, {}).light).toBe('red');
      expect(S.light({ pain: 0, fever: true }, {}).light).toBe('red');
    });
    it('пульс покоя выше нормы на 10+ — красный только второй день подряд', () => {
      expect(S.light({ pain: 0, rest_hr: 66 }, { baseHr: 55, prevDelta: 0 }).light).toBe('yellow');
      expect(S.light({ pain: 0, rest_hr: 66 }, { baseHr: 55, prevDelta: 11 }).light).toBe('red');
    });
  });

  describe('Серия бега: лестница отката', () => {
    it('красный день → уровень В сразу; поднимаемся после 2 зелёных (В → Б) и 3 зелёных (Б → А)', () => {
      const days = [row(0, ok), row(1, { pain: 5 - 1 }), row(2, ok), row(3, ok), row(4, ok), row(5, ok), row(6, ok)];
      const l = S.ladder(days).byDate;
      expect(l[dayOf(0)].level).toBe('A');
      expect(l[dayOf(1)].level).toBe('V');
      expect(l[dayOf(2)].level).toBe('V');
      expect(l[dayOf(3)].level).toBe('B');
      expect(l[dayOf(5)].level).toBe('B');
      expect(l[dayOf(6)].level).toBe('A');
    });
    it('два жёлтых за 5 дней → уровень Б', () => {
      const l = S.ladder([row(0, ok), row(1, { pain: 2 }), row(2, ok), row(3, { pain: 2 })]).byDate;
      expect(l[dayOf(1)].level).toBe('A');
      expect(l[dayOf(3)].level).toBe('B');
    });
    it('красный два дня подряд, боль 5+ или боль в покое → уровень Г (стоп)', () => {
      expect(S.ladder([row(0, ok), row(1, { pain: 4 }), row(2, { pain: 4 })]).level).toBe('G');
      expect(S.ladder([row(0, ok), row(1, { pain: 5 })]).level).toBe('G');
      expect(S.ladder([row(0, ok), row(1, { pain: 0, red_flag: true })]).level).toBe('G');
    });
    it('из стопа выходим только по отметке врача', () => {
      const days = [row(0, ok), row(1, { pain: 5 }), row(2, ok), row(3, ok)];
      expect(S.ladder(days).level).toBe('G');
      expect(S.ladder(days, { doctorOk: dayOf(1) }).level).toBe('B');
    });
    it('дни без чек-ина уровень не меняют', () => {
      const l = S.ladder([row(0, { pain: 4 }), { date: dayOf(1) }, row(2, ok)]);
      expect(l.byDate[dayOf(0)].level).toBe('V');
      expect(l.byDate[dayOf(2)].level).toBe('V');
    });
  });

  describe('Серия бега: цель дня', () => {
    const quality = S.dayPlan(2);
    const long = S.dayPlan(7);
    it('зелёный день на уровне А — по плану', () => {
      const t = S.target(quality, 'A', 'green');
      expect(t.mode).toBe('plan');
      expect(t.km).toBe(5);
    });
    it('жёлтый: качественный → лёгкий бег 4 км в 7:30 и медленнее; лёгкий день не меняется', () => {
      const t = S.target(quality, 'A', 'yellow');
      expect(t.mode).toBe('swap_easy');
      expect(t.km).toBe(4);
      expect(t.pace).toBe('7:30 и медленнее');
      expect(S.target(S.dayPlan(4), 'A', 'yellow').mode).toBe('plan');
    });
    it('красный: 3 км быстрым шагом в темпе 9:00', () => {
      const t = S.target(quality, 'V', 'red');
      expect(t.mode).toBe('minimum');
      expect(t.km).toBe(3);
      expect(t.pace).toBe('9:00 или быстрее');
    });
    it('уровень Б: все дни лёгкие 3–4 км, длинная не больше 5 км', () => {
      expect(S.target(quality, 'B', 'green').km).toBe(4);
      expect(S.target(S.dayPlan(6), 'B', 'green').km).toBe(3);
      expect(S.target(long, 'B', 'green').km).toBe(5);
      expect(S.target(S.dayPlan(14), 'B', 'green').km).toBe(5);
    });
    it('уровень Г — серия остановлена, цели по километрам нет', () => {
      const t = S.target(quality, 'G', 'green');
      expect(t.mode).toBe('stop');
      expect(t.km).toBe(0);
    });
  });

  describe('Серия бега: контрольные точки', () => {
    // 7 дней без красных, один жёлтый, качественные выполнены
    const week1 = (extra) => {
      const rows = [];
      for (let i = 0; i < 7; i++) rows.push(row(i, i === 4 ? { pain: 2 } : ok, S.dayPlan(i).quality ? done() : null));
      return rows.concat(extra || []);
    };
    it('неделя без красных и не больше одного жёлтого → прогресс с 8 ноября', () => {
      const m = S.model({ start_date: S.START }, week1(), '2026-11-08');
      expect(m.checkpoints[0].passed).toBe(true);
      // лёгкий день 9 ноября стал 4,0 вместо 3,5, качественный А 10 ноября — быстрее
      expect(m.days[8].plan.km).toBe(4);
      expect(m.days[9].plan.how).toBe('1 км разминка, 3,5 км в 6:10–6:20, 1 км заминка');
      // до контрольной точки календарь прежний
      expect(m.days[2].plan.how).toBe('1 км разминка, 3 км в 6:15–6:30, 1 км заминка');
    });
    it('красный день, второй жёлтый или нет чек-ина → без прогресса', () => {
      const red = week1();
      red[3] = row(3, { pain: 4 }, null);
      expect(S.model({ start_date: S.START }, red, '2026-11-08').checkpoints[0].passed).toBe(false);
      const yellows = week1();
      yellows[1] = row(1, { pain: 2 }, null);
      expect(S.model({ start_date: S.START }, yellows, '2026-11-08').checkpoints[0].passed).toBe(false);
      const missing = week1().slice(1);
      const m = S.model({ start_date: S.START }, missing, '2026-11-08');
      expect(m.checkpoints[0].passed).toBe(false);
      expect(m.checkpoints[0].reasons.join(' ')).toContain('чек-ина');
      expect(m.days[8].plan.km).toBe(3.5);
    });
    it('невыполненный качественный день тоже останавливает прогресс', () => {
      const rows = week1();
      rows[2] = row(2, ok, null);
      expect(S.model({ start_date: S.START }, rows, '2026-11-08').checkpoints[0].passed).toBe(false);
    });
    it('до контрольной точки статус «ждём»', () => {
      expect(S.model({ start_date: S.START }, week1(), '2026-11-07').checkpoints[0].passed).toBeNull();
    });
    it('вторая точка: длинная 15 ноября растёт с 8 до 9 км, потолок лёгкого дня 5 км', () => {
      const rows = [];
      for (let i = 0; i < 14; i++) rows.push(row(i, ok, S.dayPlan(i).quality ? done() : null));
      const m = S.model({ start_date: S.START }, rows, '2026-11-15');
      expect(m.checkpoints[0].passed).toBe(true);
      expect(m.checkpoints[1].passed).toBe(true);
      expect(m.days[14].plan.km).toBe(9);
      expect(m.days[17].plan.km).toBe(5); // лёгкий 18 ноября: 4 + 0,5 + 0,5, не выше 5
      expect(m.days[16].plan.how).toContain('6:05–6:15');
    });
    it('вторая точка не выполнена: 15–17 ноября уровень Б, прогресса нет', () => {
      const rows = [];
      for (let i = 0; i < 14; i++) rows.push(row(i, i === 12 ? { pain: 2 } : ok, S.dayPlan(i).quality ? done() : null));
      rows.push(row(14, ok));
      const m = S.model({ start_date: S.START }, rows, '2026-11-15');
      expect(m.checkpoints[1].passed).toBe(false);
      expect(m.days[14].target.mode).toBe('protect');
      expect(m.days[14].target.km).toBe(5);
      expect(m.days[14].plan.km).toBe(8);
    });
    it('качественный темп не быстрее 6:00', () => {
      const cps = [
        { passed: true, date: '2026-11-08', easyPlus: 0.5, shiftLo: 40, shiftHi: 60, longTo: null },
      ];
      const p = S.dayPlan(12, S.START, cps); // пт 13.11, качественный Б
      expect(p.pace).toBe('6:00');
      expect(S.dayPlan(9, S.START, cps).pace).toBe('6:00'); // качественный А тоже упирается в потолок
    });
  });

  describe('Серия бега: счётчик и сервис', () => {
    async function fresh(today) {
      await HD.db.init({ memoryOnly: true });
      D.setToday(today);
      HD.seed.seed();
      HD.seed.loadDemo();
      return HD.svc.ctx('demo-max');
    }
    it('подключение создаёт серию и событие один раз, отключение всё убирает', async () => {
      let ctx = await fresh('2026-10-29');
      const st = HD.svc.streak.connect(ctx.profileId);
      expect(st.start_date).toBe('2026-11-01');
      expect(HD.svc.streak.connect(ctx.profileId).id).toBe(st.id);
      ctx = HD.svc.ctx('demo-max');
      expect(ctx.events.filter((e) => e.streak_id === st.id).length).toBe(1);
      HD.svc.streak.disconnect(ctx.profileId);
      expect(HD.svc.streak.active(ctx.profileId)).toBeNull();
      expect(HD.svc.ctx('demo-max').events.filter((e) => e.streak_id === st.id).length).toBe(0);
    });
    it('чек-ин ставит цель дня, результат засчитывается от 3 км и копит серию', async () => {
      let ctx = await fresh('2026-11-01');
      const st = HD.svc.streak.connect(ctx.profileId);
      HD.svc.streak.saveCheckin(ctx.profileId, st, '2026-11-01', { pain: '0', rest_hr: '55', sleep_h: '7' });
      let m = HD.svc.streak.model(ctx);
      expect(m.days[0].light).toBe('green');
      expect(m.days[0].target.km).toBe(5);
      HD.svc.streak.saveResult(ctx.profileId, st, '2026-11-01', { km: '5,2', pace: '7:10', hr: '150', shin: 'ok' });
      m = HD.svc.streak.model(ctx);
      expect(m.days[0].done).toBe(true);
      expect(m.days[0].result.km).toBe(5.2);
      expect(m.streakLen).toBe(1);
      // меньше 3 км не засчитывается
      HD.svc.streak.saveResult(ctx.profileId, st, '2026-11-01', { km: '2', shin: 'ok' });
      expect(HD.svc.streak.model(ctx).days[0].done).toBe(false);
      // повторная запись того же дня не плодит строки
      expect(HD.db.forProfile('streak_days', ctx.profileId).length).toBe(1);
    });
    it('красный чек-ин → цель «3 км быстрым шагом»; пропущенный день рвёт серию', async () => {
      let ctx = await fresh('2026-11-03');
      const st = HD.svc.streak.connect(ctx.profileId);
      HD.svc.streak.saveResult(ctx.profileId, st, '2026-11-01', { km: '5' });
      HD.svc.streak.saveCheckin(ctx.profileId, st, '2026-11-03', { pain: '5' });
      const m = HD.svc.streak.model(ctx);
      expect(m.days[2].light).toBe('red');
      expect(m.days[2].target.mode).toBe('stop'); // боль 5 → стоп
      expect(m.broken).toBe('2026-11-02');
      expect(m.streakLen).toBe(1);
    });
    it('данные серии синхронизируются: таблицы включены, id дня естественный', async () => {
      const ctx = await fresh('2026-11-01');
      const st = HD.svc.streak.connect(ctx.profileId);
      const r = HD.svc.streak.saveCheckin(ctx.profileId, st, '2026-11-01', { pain: '0' });
      expect(r.id).toBe(st.id + ':2026-11-01');
      expect(HD.db.TABLES.includes('streaks')).toBeTruthy();
      expect(HD.db.TABLES.includes('streak_days')).toBeTruthy();
    });
  });
})(window.HD);
