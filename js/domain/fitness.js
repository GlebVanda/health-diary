// Оценка физической подготовки и здоровья по анкете.
// «Уровень подготовки» одной цифрой трактуется по-разному, поэтому считаем отдельно выносливость и силу
// по наблюдаемым фактам (сколько бежите без остановки, сколько отжиманий, стаж, перерыв).
// Результат: уровни 0–4, ИМТ, ограничения (без ударной нагрузки, недовес) и стартовые данные для плана.
// Медицинских вопросов и рекомендаций врача в анкете нет: приложение личное.
(function (HD) {
  const D = HD.dates;
  const { clamp } = HD.util;

  const LEVELS = [
    { key: 'zero', label: 'С нуля', text: 'Нагрузку вводим очень постепенно: ходьба, техника, лёгкие веса.' },
    { key: 'beginner', label: 'Начальный', text: 'Базовая выносливость и сила есть, но без системы: строим фундамент.' },
    { key: 'intermediate', label: 'Средний', text: 'Регулярные тренировки переносятся хорошо: можно планировать прогрессию.' },
    { key: 'advanced', label: 'Продвинутый', text: 'Хорошая база: план с объёмом, интенсивностью и периодизацией.' },
    { key: 'athlete', label: 'Спортивный', text: 'Высокий уровень: важны точная периодизация и восстановление.' },
  ];

  const YES_NO = [
    ['no', 'Нет'],
    ['yes', 'Да'],
  ];

  // Вопросы анкеты. Описание данных, по нему строится экран (type: text | select | number | date | yesno | lifts).
  const SECTIONS = [
    {
      key: 'about',
      title: 'О себе',
      hint: 'Нужно для расчёта нормы калорий и индекса массы тела.',
      questions: [
        { key: 'name', label: 'Имя', type: 'text', required: true },
        { key: 'sex', label: 'Пол', type: 'select', options: [['m', 'Мужчина'], ['f', 'Женщина']], required: true },
        { key: 'birth_date', label: 'Дата рождения', type: 'date', required: true },
        { key: 'height_cm', label: 'Рост', type: 'number', unit: 'см', required: true, min: 120, max: 230 },
        { key: 'weight_kg', label: 'Вес сейчас', type: 'number', unit: 'кг', required: true, min: 30, max: 300 },
        { key: 'waist_cm', label: 'Обхват талии (необязательно)', type: 'number', unit: 'см' },
      ],
    },
    {
      key: 'lifestyle',
      title: 'Образ жизни и опыт',
      hint: 'Регулярность и перерыв влияют на стартовую нагрузку сильнее, чем «уровень» на словах.',
      questions: [
        { key: 'work', label: 'Работа', type: 'select', options: [['sedentary', 'Сидячая'], ['mixed', 'Смешанная'], ['active', 'На ногах / физическая']], required: true },
        { key: 'steps', label: 'Сколько ходите в обычный день', type: 'select', options: [['lt5', 'Меньше 5 000 шагов'], ['5to10', '5 000–10 000'], ['gt10', 'Больше 10 000']], required: true },
        { key: 'sleep_h', label: 'Сон в среднем', type: 'number', unit: 'ч' },
        { key: 'regular', label: 'Сколько вы уже тренируетесь регулярно (2+ раза в неделю)', type: 'select', options: [['none', 'Не тренируюсь'], ['lt3', 'Меньше 3 месяцев'], ['3to12', '3–12 месяцев'], ['gt12', 'Больше года']], required: true },
        { key: 'joints_issue', label: 'Бег и прыжки лучше исключить (суставы, спина или старая травма)', type: 'checkbox' },
        { key: 'last', label: 'Когда была последняя регулярная неделя тренировок', type: 'select', options: [['now', 'Тренируюсь сейчас'], ['1m', '1–4 недели назад'], ['3m', '1–3 месяца назад'], ['1y', '3–12 месяцев назад'], ['more', 'Больше года назад или никогда']], required: true },
      ],
    },
    {
      key: 'cardio',
      title: 'Выносливость',
      hint: 'Отвечайте по тому, что получается сейчас, а не когда-то.',
      questions: [
        { key: 'walk30', label: 'Можете пройти 30 минут быстрым шагом без остановки?', type: 'yesno', required: true },
        { key: 'stairs', label: 'Подъём пешком на 5-й этаж', type: 'select', options: [['easy', 'Спокойно, могу говорить'], ['breath', 'Сильная одышка'], ['stops', 'Нужны остановки']], required: true },
        { key: 'run', label: 'Сколько можете бежать без остановки в лёгком темпе', type: 'select', options: [['cant', 'Не бегаю / не могу'], ['lt5', 'До 5 минут'], ['5to15', '5–15 минут'], ['15to30', '15–30 минут'], ['30to60', '30–60 минут'], ['gt60', 'Больше часа'], ['unknown', 'Не знаю']], required: true },
        { key: 'best_distance_km', label: 'Лучшая недавняя дистанция (необязательно)', type: 'number', unit: 'км' },
        { key: 'best_time_min', label: 'Время на ней', type: 'number', unit: 'мин' },
      ],
    },
    {
      key: 'strength',
      title: 'Сила',
      hint: 'Короткие тесты можно сделать прямо сейчас. Если тест не делали — оставьте пустым.',
      questions: [
        { key: 'experience', label: 'Опыт силовых тренировок', type: 'select', options: [['never', 'Не занимался(ась)'], ['lt6m', 'До 6 месяцев'], ['6to24m', '6 месяцев – 2 года'], ['gt2y', 'Больше 2 лет']], required: true },
        { key: 'pushups', label: 'Отжимания подряд с чистой техникой', type: 'number', unit: 'раз' },
        { key: 'pushups_knees', label: 'Отжимаюсь с колен', type: 'checkbox' },
        { key: 'squats', label: 'Приседания с весом тела за 1 минуту', type: 'number', unit: 'раз' },
        { key: 'plank_sec', label: 'Планка на прямых руках', type: 'number', unit: 'с' },
        { key: 'lifts', label: 'Рабочие веса на 8–10 повторов, если знаете', type: 'lifts' },
      ],
    },
  ];

  const LIFT_KEYS = ['squat_bb', 'bench_bb', 'rdl_bb', 'lat_pulldown', 'db_shoulder_press', 'bulgarian_db'];

  const RUN_MIN = { cant: 0, lt5: 3, '5to15': 10, '15to30': 20, '30to60': 40, gt60: 60, unknown: null };
  const BREAK_WEEKS = { now: 0, '1m': 3, '3m': 8, '1y': 26, more: 60 };

  // Сколько порогов пройдено: 0…4
  const steps = (v, th) => (v == null || v === '' ? null : th.filter((t) => Number(v) >= t).length);
  const half = (v) => Math.round(v * 2) / 2;

  function bmiOf(weight, height) {
    if (!weight || !height) return null;
    return weight / Math.pow(height / 100, 2);
  }

  function bmiClass(b) {
    if (b == null) return null;
    if (b < 18.5) return { key: 'under', label: 'Ниже нормы' };
    if (b < 25) return { key: 'normal', label: 'Норма' };
    if (b < 30) return { key: 'over', label: 'Избыточный вес' };
    if (b < 35) return { key: 'obese1', label: 'Ожирение I степени' };
    if (b < 40) return { key: 'obese2', label: 'Ожирение II степени' };
    return { key: 'obese3', label: 'Ожирение III степени' };
  }

  function cardioScore(a) {
    const breakW = BREAK_WEEKS[a.last] ?? 0;
    let s;
    switch (a.run) {
      case 'cant':
        s = a.walk30 === 'yes' ? 0.5 : 0;
        break;
      case 'lt5':
        s = 1;
        break;
      case '5to15':
        s = 1.5;
        break;
      case '15to30':
        s = 2;
        break;
      case '30to60':
        s = 3;
        break;
      case 'gt60':
        s = 4;
        break;
      default:
        // «Не знаю»: оцениваем по ходьбе и лестнице
        s = a.walk30 === 'yes' ? (a.stairs === 'easy' ? 1.5 : 1) : 0.5;
    }
    if (a.regular === 'gt12' && s >= 1) s += 0.5;
    if (a.stairs === 'stops') s = Math.min(s, 1);
    else if (a.stairs === 'breath') s = Math.min(s, 2);
    if (a.walk30 === 'no') s = Math.min(s, 0.5);
    if (breakW >= 26) s -= 1;
    else if (breakW >= 8) s -= 0.5;
    return clamp(half(s), 0, 4);
  }

  function strengthScore(a, sex, weight) {
    const exp = { never: 0, lt6m: 1, '6to24m': 2, gt2y: 3 }[a.experience] ?? 0;
    const tests = [];
    let pu = steps(a.pushups, sex === 'f' ? [1, 5, 15, 25] : [1, 10, 20, 35]);
    if (pu != null) tests.push(a.pushups_knees ? Math.max(0, pu - 1) : pu);
    const sq = steps(a.squats, [10, 20, 30, 40]);
    if (sq != null) tests.push(sq);
    const pl = steps(a.plank_sec, [15, 40, 90, 150]);
    if (pl != null) tests.push(pl);
    let s = tests.length ? exp * 0.4 + (tests.reduce((x, y) => x + y, 0) / tests.length) * 0.6 : exp;
    // Рабочий вес приседа относительно веса тела — самый объективный показатель, если известен
    const squat = a.lifts && Number(a.lifts.squat_bb);
    if (squat && weight) {
      const ratio = steps(squat / weight, sex === 'f' ? [0.3, 0.6, 0.9, 1.2] : [0.5, 0.9, 1.3, 1.7]);
      s = (s + ratio) / 2;
    }
    const breakW = BREAK_WEEKS[a.last] ?? 0;
    if (breakW >= 26) s -= 0.5;
    return clamp(half(s), 0, 4);
  }

  /**
   * answers — ответы анкеты (плоский объект), today — дата расчёта.
   * → { bmi, bmiClass, age, cardio, strength, overall, flags[], limits, baseline }
   */
  function assess(answers, today) {
    const a = answers || {};
    const weight = Number(a.weight_kg) || null;
    const height = Number(a.height_cm) || null;
    const age = a.birth_date ? D.age(a.birth_date, today || D.today()) : null;
    const bmi = bmiOf(weight, height);
    const bc = bmiClass(bmi);
    const cardio = cardioScore(a);
    const strength = strengthScore(a, a.sex, weight);
    const overall = Math.floor((cardio + strength) / 2 + 0.25);
    const flags = [];
    const limits = { gentle: false, lowImpact: false, noMaxEfforts: false, noWeightLoss: false };
    const flag = (key, severity, text) => flags.push({ key, severity, text });

    if (a.joints_issue) {
      limits.lowImpact = true;
      flag('joints', 'info', 'Бег и прыжки на старте заменим ходьбой с наклоном и велотренажёром.');
    }
    if (bmi != null && bmi >= 35) {
      limits.lowImpact = true;
      flag('bmi_high', 'warn', `ИМТ ${bmi.toFixed(1)}: высокая ударная нагрузка на суставы. Начнём с ходьбы, ходьбы в наклон и силовых; бег — позже.`);
    } else if (bmi != null && bmi >= 30) {
      if (cardio < 2) limits.lowImpact = true;
      flag('bmi_over', 'info', `ИМТ ${bmi.toFixed(1)}: бег вводим постепенно, после ходьбы и бег-ходьбы.`);
    } else if (bmi != null && bmi < 18.5) {
      limits.noWeightLoss = true;
      flag('bmi_under', 'warn', `ИМТ ${bmi.toFixed(1)} ниже нормы: снижать вес нельзя, в приоритете питание и сила.`);
    }
    if (cardio === 0) limits.lowImpact = true;
    if (a.sleep_h && Number(a.sleep_h) < 6) flag('sleep', 'info', 'Сон меньше 6 часов замедляет восстановление: прогрессия будет осторожнее.');

    const lifts = {};
    for (const k of LIFT_KEYS) if (a.lifts && Number(a.lifts[k]) > 0) lifts[k] = Number(a.lifts[k]);
    const breakWeeks = BREAK_WEEKS[a.last] ?? null;
    const pace = a.best_distance_km && a.best_time_min ? Number(a.best_time_min) / Number(a.best_distance_km) : null;

    return {
      date: today || D.today(),
      age,
      bmi: bmi != null ? Math.round(bmi * 10) / 10 : null,
      bmiClass: bc,
      cardio: { score: cardio, level: LEVELS[Math.floor(cardio)] },
      strength: { score: strength, level: LEVELS[Math.floor(strength)] },
      overall: { score: overall, level: LEVELS[overall] },
      flags,
      limits,
      baseline: {
        lifts,
        run: {
          continuous_min: RUN_MIN[a.run] ?? null,
          break_weeks: breakWeeks,
          best_distance_km: Number(a.best_distance_km) || null,
          best_time_min: Number(a.best_time_min) || null,
          trail_pace_min_km: pace,
        },
        sleep_h: Number(a.sleep_h) || null,
        work: a.work || null,
      },
      sedentary: a.work === 'sedentary',
    };
  }

  // Каких обязательных ответов не хватает в разделе
  function missing(section, answers) {
    return section.questions.filter((q) => q.required && (!q.onlySex || q.onlySex === answers.sex) && (answers[q.key] == null || answers[q.key] === '')).map((q) => q.label);
  }

  HD.fitness = { SECTIONS, LEVELS, LIFT_KEYS, assess, bmiOf, bmiClass, missing, cardioScore, strengthScore };
})(window.HD);
