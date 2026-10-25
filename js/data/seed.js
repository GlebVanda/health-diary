// Начальные данные: библиотека упражнений. Профилей по умолчанию нет — их создаёт первичная настройка.
// Демо-профили Макса и Анны (иллюстрация и эталон проверки) загружаются отдельно: Профиль → Настройки → «Демо-данные».
(function (HD) {
  const DASHA_ANSWERS = {
    name: 'Анна',
    sex: 'f',
    birth_date: '1998-01-01',
    height_cm: 162,
    weight_kg: 79,
    work: 'sedentary',
    steps: '5to10',
    sleep_h: 8,
    regular: 'lt3',
    last: '1y',
    walk30: 'yes',
    stairs: 'easy',
    run: 'unknown',
    best_distance_km: 12,
    best_time_min: 90,
    experience: '6to24m',
    lifts: { squat_bb: 45, bench_bb: 30, lat_pulldown: 30, bulgarian_db: 10, db_shoulder_press: 6 },
  };

  const DASHA_PREFS = {
    valid_from: '2026-10-12',
    sessions: [
      { kind: 'strength', per_week: 2, duration_min: 60, days: [1, 3], location: 'gym' },
      { kind: 'run', per_week: 1, duration_min: null, days: [5], location: 'street' },
    ],
    equipment: ['barbell', 'dumbbells', 'kettlebell', 'cable', 'machines', 'treadmill', 'treadmill_incline', 'platform', 'bodyweight'],
    likes: ['strength_cardio', 'free_weights'],
    dislikes: [],
    relief: false,
    cold_gear: true,
    injuries: '',
    coach: false,
    // Базовый уровень для тестов генератора (в приложении берётся из анкеты подготовки)
    sedentary: true,
    baseline: {
      lifts: { squat_bb: 45, bench_bb: 30, lat_pulldown: 30, bulgarian_db: 10, db_shoulder_press: 6 },
      lift_reps: { bulgarian_db: 15 },
      run: { best_distance_km: 12, best_time_min: 90, trail_pace_min_km: 7.5, stadium_pace_min_km: 8, break_weeks: 12, continuous_min: null },
      sleep_h: 8,
      work: 'sedentary',
    },
  };

  const DASHA_RACE = {
    start_date: '2026-10-12',
    distance_min: 15,
    distance_max: 20,
    elevation_m: null,
    deadline: '2027-05-02',
    surface: 'trail',
    aim: 'finish',
  };

  const GLEB_ANSWERS = {
    name: 'Макс',
    sex: 'm',
    birth_date: '1988-05-10',
    height_cm: 182,
    weight_kg: 99.3,
    work: 'sedentary',
    steps: '5to10',
    sleep_h: 7,
    regular: '3to12',
    last: 'now',
    walk30: 'yes',
    stairs: 'breath',
    run: '5to15',
    experience: '6to24m',
    pushups: 15,
    squats: 25,
    plank_sec: 60,
    lifts: { squat_bb: 70, bench_bb: 60 },
  };

  function seed() {
    const db = HD.db;
    if (!db.all('exercises').length) {
      db.insertMany('exercises', HD.EXERCISES.map((e) => Object.assign({}, e)));
      db.save();
      return true;
    }
    return false;
  }

  // Демо: два заполненных профиля. Не трогает уже существующие профили с теми же id.
  function loadDemo() {
    const db = HD.db;
    const D = HD.dates;
    const added = [];
    const mkProfile = (id, answers, goals, prefs, weights) => {
      if (db.get('profiles', id)) return;
      db.insert('profiles', { id, name: answers.name, sex: answers.sex, birth_date: answers.birth_date, height_cm: answers.height_cm, timezone: 'Europe/Moscow', carry_cap_pct: 0.15, onb_assessment: true, onb_goals_done: true, demo: true });
      db.insert('assessments', { profile_id: id, date: goals.main.params.start_date, answers, result: HD.fitness.assess(answers, goals.main.params.start_date) });
      for (const [date, w] of weights) db.insert('body_measurements', { profile_id: id, date, weight_kg: w, source: 'demo' });
      const main = db.insert('goals', { profile_id: id, role: 'main', type: goals.main.type, title: goals.main.title, status: 'active', source: 'demo' });
      db.insert('goal_versions', { goal_id: main.id, valid_from: goals.main.params.start_date, params: goals.main.params, change_reason: 'Создание цели' });
      for (const g of goals.secondary || []) {
        const s = db.insert('goals', { profile_id: id, role: 'secondary', type: g.type, title: g.title, main_goal_id: main.id, status: 'active', source: 'demo' });
        db.insert('goal_versions', { goal_id: s.id, valid_from: g.params.start_date, params: g.params, change_reason: 'Создание цели' });
      }
      db.insert('training_preferences', Object.assign({ profile_id: id }, HD.util.deepClone(prefs)));
      added.push(id);
    };

    mkProfile(
      'demo-anna',
      DASHA_ANSWERS,
      { main: { type: 'race', title: 'Горный трейл 15–20 км', params: DASHA_RACE } },
      DASHA_PREFS,
      [['2026-10-12', 79]],
    );
    mkProfile(
      'demo-max',
      GLEB_ANSWERS,
      {
        main: { type: 'weight_loss', title: 'Снижение веса до 85 кг', params: { start_value: 99.3, start_date: '2026-01-12', target_value: 85, deadline: '2027-06-01' } },
        secondary: [
          { type: 'strength_lift', title: 'Жим лёжа 100 кг', params: { exercise_key: 'bench_bb', start_value: 60, target_value: 100, start_date: '2026-01-12', deadline: '2027-06-01' } },
          { type: 'measurement', title: 'Талия 95 см', params: { field: 'waist_cm', start_value: 112, target_value: 95, start_date: '2026-01-12', deadline: '2027-06-01' } },
        ],
      },
      {
        valid_from: '2026-01-12',
        sessions: [{ kind: 'strength', per_week: 3, duration_min: 60, days: [0, 2, 4], location: 'gym' }],
        equipment: ['barbell', 'dumbbells', 'cable', 'machines', 'treadmill', 'treadmill_incline', 'bodyweight'],
        likes: ['free_weights'],
        dislikes: [],
        relief: false,
        cold_gear: true,
        injuries: '',
        coach: false,
      },
      [['2026-01-12', 99.3]],
    );
    for (const id of added) {
      HD.svc.plan.ensurePlan(id);
      HD.svc.nutrition.recalc(id, 'Демо-данные');
    }
    db.save();
    return added;
  }

  HD.seed = { seed, loadDemo, DASHA_PREFS, DASHA_RACE, DASHA_ANSWERS, GLEB_ANSWERS };
})(window.HD);
