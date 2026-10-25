// Библиотека упражнений (seed). equipment — всё, что нужно одновременно; bodyweight доступен всегда.
// pattern: squat / hinge / lunge / push / pull / core / calf / conditioning
// unit: reps — повторы, sec — секунды удержания, min — минуты работы
(function (HD) {
  const E = (key, name, pattern, equipment, tags, extra) =>
    Object.assign({ id: key, key, name, pattern, equipment, unilateral: false, tags, unit: 'reps' }, extra || {});
  const U = { unilateral: true };

  HD.EQUIPMENT = [
    { key: 'barbell', label: 'Штанга' },
    { key: 'dumbbells', label: 'Гантели' },
    { key: 'kettlebell', label: 'Гири' },
    { key: 'cable', label: 'Блоки' },
    { key: 'machines', label: 'Тренажёры' },
    { key: 'treadmill', label: 'Беговая дорожка' },
    { key: 'treadmill_incline', label: 'Дорожка с наклоном' },
    { key: 'stepper', label: 'Степпер' },
    { key: 'platform', label: 'Платформа / степ' },
    { key: 'bodyweight', label: 'Вес тела' },
  ];

  // Теги для «нравится / не нравится» в анкете
  HD.PREFERENCE_TAGS = [
    { key: 'strength_cardio', label: 'Силовое кардио' },
    { key: 'free_weights', label: 'Свободные веса' },
    { key: 'machine', label: 'Тренажёры' },
    { key: 'intervals', label: 'Интервалы' },
    { key: 'kettlebell', label: 'Гиря' },
    { key: 'bodyweight', label: 'Вес тела' },
    { key: 'jumps', label: 'Прыжки' },
  ];

  HD.EXERCISES = [
    // присед
    E('squat_bb', 'Присед со штангой', 'squat', ['barbell'], ['barbell', 'free_weights']),
    E('front_squat', 'Фронтальный присед', 'squat', ['barbell'], ['barbell', 'free_weights']),
    E('goblet_squat', 'Гоблет-присед', 'squat', ['dumbbells'], ['dumbbell', 'free_weights']),
    E('leg_press', 'Жим ногами в тренажёре', 'squat', ['machines'], ['machine']),
    E('hack_squat', 'Гакк-присед', 'squat', ['machines'], ['machine']),
    E('bw_squat', 'Присед с весом тела', 'squat', ['bodyweight'], ['bodyweight']),
    // таз
    E('rdl_bb', 'Румынская тяга', 'hinge', ['barbell'], ['rdl', 'barbell', 'free_weights', 'hamstrings', 'glutes']),
    E('rdl_db', 'Румынская тяга с гантелями', 'hinge', ['dumbbells'], ['rdl', 'dumbbell', 'free_weights', 'hamstrings']),
    E('hip_thrust_bb', 'Ягодичный мост со штангой', 'hinge', ['barbell'], ['bridge', 'barbell', 'free_weights', 'glutes']),
    E('glute_bridge', 'Ягодичный мост с весом тела', 'hinge', ['bodyweight'], ['bridge', 'bodyweight', 'glutes']),
    E('deadlift', 'Становая тяга', 'hinge', ['barbell'], ['barbell', 'free_weights', 'hamstrings']),
    E('back_ext', 'Гиперэкстензия', 'hinge', ['machines'], ['machine', 'hamstrings', 'glutes']),
    E('leg_curl', 'Сгибание ног в тренажёре', 'hinge', ['machines'], ['machine', 'hamstrings']),
    E('sl_rdl', 'Румынская тяга на одной ноге', 'hinge', ['dumbbells'], ['rdl', 'dumbbell', 'free_weights', 'hamstrings'], U),
    E('hip_abduction', 'Отведение бедра в тренажёре', 'hinge', ['machines'], ['machine', 'glutes']),
    // выпады и односторонние
    E('bulgarian_db', 'Болгарские выпады', 'lunge', ['dumbbells'], ['bulgarian', 'dumbbell', 'free_weights'], U),
    E('stepup_db', 'Подъём на платформу с гантелями', 'lunge', ['dumbbells', 'platform'], ['stepup', 'dumbbell', 'free_weights'], U),
    E('step_down', 'Медленный спуск с платформы (3 с)', 'lunge', ['platform'], ['descent', 'bodyweight'], U),
    E('walking_lunge', 'Выпады в ходьбе', 'lunge', ['dumbbells'], ['dumbbell', 'free_weights'], U),
    E('reverse_lunge', 'Обратные выпады', 'lunge', ['bodyweight'], ['bodyweight'], U),
    E('split_squat_bb', 'Сплит-присед со штангой', 'lunge', ['barbell'], ['barbell', 'free_weights'], U),
    // жим
    E('bench_bb', 'Жим от груди', 'push', ['barbell'], ['horizontal', 'barbell', 'free_weights']),
    E('db_bench', 'Жим гантелей лёжа', 'push', ['dumbbells'], ['horizontal', 'dumbbell', 'free_weights']),
    E('db_shoulder_press', 'Жим гантелей от плеч', 'push', ['dumbbells'], ['vertical', 'dumbbell', 'free_weights']),
    E('ohp_bb', 'Жим штанги стоя', 'push', ['barbell'], ['vertical', 'barbell', 'free_weights']),
    E('chest_press', 'Жим в тренажёре', 'push', ['machines'], ['horizontal', 'machine']),
    E('pushup', 'Отжимания', 'push', ['bodyweight'], ['horizontal', 'bodyweight']),
    // тяга
    E('lat_pulldown', 'Вертикальная тяга широким хватом', 'pull', ['cable'], ['vertical', 'machine']),
    E('assisted_pullup', 'Подтягивания в гравитроне', 'pull', ['machines'], ['vertical', 'machine']),
    E('db_row', 'Тяга гантели в наклоне', 'pull', ['dumbbells'], ['horizontal', 'dumbbell', 'free_weights']),
    E('bb_row', 'Тяга штанги в наклоне', 'pull', ['barbell'], ['horizontal', 'barbell', 'free_weights']),
    E('cable_row', 'Тяга нижнего блока', 'pull', ['cable'], ['horizontal', 'machine']),
    E('inverted_row', 'Австралийские подтягивания', 'pull', ['bodyweight'], ['horizontal', 'bodyweight']),
    E('face_pull', 'Тяга каната к лицу', 'pull', ['cable'], ['horizontal', 'machine']),
    // корпус
    E('plank', 'Планка и боковая планка', 'core', ['bodyweight'], ['plank', 'bodyweight'], { unit: 'sec' }),
    E('dead_bug', 'Мёртвый жук', 'core', ['bodyweight'], ['bodyweight']),
    E('pallof', 'Паллоф-пресс', 'core', ['cable'], ['machine']),
    E('hanging_knee', 'Подъём коленей в висе', 'core', ['bodyweight'], ['bodyweight']),
    E('farmer_walk', 'Прогулка фермера', 'core', ['dumbbells'], ['dumbbell', 'free_weights', 'strength_cardio'], { unit: 'sec' }),
    // икры
    E('calf_single', 'Подъёмы на носки на одной ноге', 'calf', ['bodyweight'], ['bodyweight', 'unilateral'], U),
    E('calf_machine', 'Подъёмы на носки в тренажёре', 'calf', ['machines'], ['machine']),
    E('calf_bb', 'Подъёмы на носки со штангой', 'calf', ['barbell'], ['barbell', 'free_weights']),
    // силовое кардио и кондиции
    E('sc_circuit', 'Силовое кардио 30/30 (свинг гири, махи канатом, подъёмы на платформу)', 'conditioning', ['kettlebell'], ['strength_cardio', 'kettlebell', 'free_weights'], { unit: 'min' }),
    E('kb_complex', 'Комплекс с гирей (свинг, гоблет, тяга)', 'conditioning', ['kettlebell'], ['strength_cardio', 'kettlebell', 'free_weights'], { unit: 'min' }),
    E('db_thruster', 'Трастеры с гантелями', 'conditioning', ['dumbbells'], ['strength_cardio', 'dumbbell', 'free_weights'], { unit: 'min' }),
    E('bw_circuit', 'Круг с весом тела (бёрпи, приседания, выпады)', 'conditioning', ['bodyweight'], ['strength_cardio', 'bodyweight', 'jumps'], { unit: 'min' }),
    E('kb_swing', 'Свинг гири', 'conditioning', ['kettlebell'], ['strength_cardio', 'kettlebell', 'free_weights'], { unit: 'min' }),
    E('incline_walk', 'Ходьба по дорожке с наклоном', 'conditioning', ['treadmill_incline'], ['incline_walk'], { unit: 'min' }),
    E('bike_intervals', 'Интервалы на велотренажёре', 'conditioning', ['machines'], ['intervals', 'machine'], { unit: 'min' }),
    E('rower', 'Гребной тренажёр', 'conditioning', ['machines'], ['intervals', 'machine'], { unit: 'min' }),
    E('stepper_work', 'Степпер', 'conditioning', ['stepper'], ['machine'], { unit: 'min' }),
  ];

  HD.exerciseByKey = (key) => HD.EXERCISES.find((e) => e.key === key) || null;
})(window.HD);
