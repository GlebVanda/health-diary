// Даты без времени: строки 'YYYY-MM-DD'. Вся арифметика в UTC, чтобы не зависеть от пояса устройства.
// «Сегодня» берётся в часовом поясе профиля (по умолчанию Europe/Moscow).
(function (HD) {
  const DAY = 864e5;
  let todayOverride = null;

  const D = {
    TZ: 'Europe/Moscow',
    WEEKDAYS: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    WEEKDAYS_FULL: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
    MONTHS: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    MONTHS_NOM: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],

    // Для тестов и демонстрации: ?today=2026-11-03 в адресе
    setToday(s) {
      todayOverride = s || null;
    },
    today(tz) {
      if (todayOverride) return todayOverride;
      try {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz || D.TZ,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
      } catch (e) {
        return new Date().toISOString().slice(0, 10);
      }
    },
    parse(s) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    },
    fmt(dt) {
      return dt.toISOString().slice(0, 10);
    },
    isValid(s) {
      return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(D.parse(s));
    },
    addDays(s, n) {
      return D.fmt(new Date(D.parse(s).getTime() + n * DAY));
    },
    // b − a в днях
    diffDays(a, b) {
      return Math.round((D.parse(b) - D.parse(a)) / DAY);
    },
    // 0 = понедельник … 6 = воскресенье
    dow(s) {
      return (D.parse(s).getUTCDay() + 6) % 7;
    },
    monday(s) {
      return D.addDays(s, -D.dow(s));
    },
    sunday(s) {
      return D.addDays(D.monday(s), 6);
    },
    // Ближайший понедельник строго после начала текущей недели
    nextMonday(s) {
      return D.addDays(D.monday(s), 7);
    },
    range(a, b) {
      const out = [];
      for (let d = a; d <= b; d = D.addDays(d, 1)) out.push(d);
      return out;
    },
    weekDays(monday) {
      return D.range(monday, D.addDays(monday, 6));
    },
    monthStart(s) {
      return s.slice(0, 8) + '01';
    },
    monthEnd(s) {
      const dt = D.parse(D.monthStart(s));
      return D.fmt(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)));
    },
    addMonths(s, n) {
      const dt = D.parse(s);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + n;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return D.fmt(new Date(Date.UTC(y, m, Math.min(dt.getUTCDate(), last))));
    },
    yearStart(s) {
      return s.slice(0, 4) + '-01-01';
    },
    yearEnd(s) {
      return s.slice(0, 4) + '-12-31';
    },
    addYears(s, n) {
      return D.addMonths(s, 12 * n);
    },
    age(birth, asOf) {
      if (!birth) return null;
      const b = D.parse(birth);
      const a = D.parse(asOf);
      let age = a.getUTCFullYear() - b.getUTCFullYear();
      const m = a.getUTCMonth() - b.getUTCMonth();
      if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
      return age;
    },
    min(a, b) {
      return a < b ? a : b;
    },
    max(a, b) {
      return a > b ? a : b;
    },
    // '12 окт', с годом при необходимости
    short(s, withYear) {
      const dt = D.parse(s);
      let out = dt.getUTCDate() + ' ' + D.MONTHS[dt.getUTCMonth()];
      if (withYear) out += ' ' + dt.getUTCFullYear();
      return out;
    },
    // '12.10'
    dm(s) {
      return s.slice(8, 10) + '.' + s.slice(5, 7);
    },
    // '12.10.2026'
    dmy(s) {
      return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
    },
    weekLabel(monday) {
      const sun = D.addDays(monday, 6);
      return D.short(monday) + ' – ' + D.short(sun, monday.slice(0, 4) !== D.today().slice(0, 4));
    },
    monthLabel(s) {
      const dt = D.parse(s);
      return D.MONTHS_NOM[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
    },
    // Номер ISO-недели
    isoWeek(s) {
      const dt = D.parse(s);
      const thu = new Date(dt.getTime() + (3 - ((dt.getUTCDay() + 6) % 7)) * DAY);
      const firstThu = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
      return 1 + Math.round(((thu - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    },
    // Excel serial → дата (система 1900, с учётом ложного 29.02.1900)
    fromExcelSerial(n, date1904) {
      const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      return D.fmt(new Date(base + Math.round(n) * DAY));
    },
  };

  HD.dates = D;
})(window.HD);
