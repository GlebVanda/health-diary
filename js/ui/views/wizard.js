// Анкета расписания — третий шаг первичной настройки: когда, где и чем тренируетесь.
// Цель и уровень подготовки сюда не входят: они задаются на предыдущих шагах. Сохранение создаёт новую версию
// расписания и пересобирает план с текущей недели с учётом цели, дополнительных целей и ограничений по здоровью.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const { esc, num, deepClone } = HD.util;

  const STEPS = ['Расписание', 'Ресурсы', 'Предпочтения'];
  const KINDS = [
    ['strength', 'Силовая'],
    ['run', 'Бег'],
    ['cardio', 'Кардио'],
    ['other', 'Другое'],
  ];
  const LOCS = [
    ['gym', 'Зал'],
    ['street', 'Улица'],
    ['home', 'Дом'],
  ];

  let draft = null;
  let draftFor = null;
  let step = 0;

  function emptyPrefs(ctx) {
    // Разумное расписание по уровню: новичкам — 2–3 силовые, остальным — 3
    const lvl = ctx.assessment ? ctx.assessment.overall.score : 1;
    return {
      sessions: [{ kind: 'strength', per_week: lvl <= 1 ? 2 : 3, duration_min: 60, days: lvl <= 1 ? [1, 3] : [0, 2, 4], location: 'gym' }],
      equipment: ['bodyweight'],
      likes: [],
      dislikes: [],
      relief: false,
      cold_gear: false,
      injuries: '',
      coach: false,
    };
  }

  function ensureDraft(ctx) {
    if (draft && draftFor === ctx.profileId) return;
    const src = ctx.prefs ? deepClone(ctx.prefs) : emptyPrefs(ctx);
    for (const k of ['id', 'created_at', 'updated_at', 'valid_from', 'profile_id', 'baseline', 'limits', 'sedentary']) delete src[k];
    draft = src;
    draftFor = ctx.profileId;
    step = 0;
  }

  function chips(name, options, selected) {
    return `<div class="chips" data-chips="${name}">${options.map(([k, l]) => `<button type="button" class="chip ${selected.includes(k) ? 'on' : ''}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
  }

  function stepSchedule(ctx) {
    const sc = ctx.scenario && ctx.scenario.plan;
    return `<h2>Расписание</h2><div class="small muted" style="margin:4px 0 10px">Какие занятия, сколько раз, сколько максимум по времени и в какие дни удобно.</div>
      ${sc && sc.minSessions ? `<div class="notice" style="margin-bottom:10px">Ваши цели требуют не меньше ${sc.minSessions} тренировок в неделю.</div>` : ''}
      ${ctx.assessment && ctx.assessment.limits.lowImpact ? '<div class="notice warn" style="margin-bottom:10px">Из-за ответов анкеты бег и прыжки вводятся постепенно: на старте он заменится ходьбой с наклоном и велотренажёром.</div>' : ''}
      <div class="stack">${draft.sessions
        .map(
          (s, i) => `<div class="slot stack" data-slot="${i}">
          <div class="row"><select class="input grow" data-f="kind">${KINDS.map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="icon-btn" data-del-slot="${i}">${ui.icon('close')}</button></div>
          <div class="grid3">
            ${ui.field('Раз в неделю', `<input class="input" data-f="per_week" inputmode="numeric" value="${s.per_week ?? ''}">`)}
            ${ui.field('или в месяц', `<input class="input" data-f="per_month" inputmode="numeric" value="${s.per_month ?? ''}">`)}
            ${ui.field('Макс., мин', `<input class="input" data-f="duration_min" inputmode="numeric" value="${s.duration_min ?? ''}" placeholder="${s.kind === 'run' ? 'без лимита' : ''}">`)}
          </div>
          <div class="small muted">Предпочтительные дни</div>
          <div class="chips" data-days>${D.WEEKDAYS.map((d, k) => `<button type="button" class="chip ${(s.days || []).includes(k) ? 'on' : ''}" data-v="${k}">${d}</button>`).join('')}</div>
          ${ui.field('Место', `<select class="input" data-f="location">${LOCS.map(([k, l]) => `<option value="${k}" ${s.location === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        </div>`,
        )
        .join('')}</div>
      <button type="button" class="btn block" style="margin-top:10px" data-add-slot>+ Добавить занятие</button>`;
  }

  function stepResources() {
    return `<h2>Ресурсы</h2>
      <div class="section-title">Оборудование</div>
      ${chips('equipment', HD.EQUIPMENT.map((e) => [e.key, e.label]), draft.equipment || [])}
      <div style="margin-top:10px">${ui.field('Гантели до', `<input class="input" name="dumbbells_max" inputmode="decimal" value="${draft.dumbbells_max_kg ?? ''}" placeholder="кг">`)}</div>
      <div class="section-title">Условия</div>
      <label class="check"><input type="checkbox" name="relief" ${draft.relief ? 'checked' : ''}> Рядом есть рельеф (холмы, подъёмы)</label>
      <label class="check"><input type="checkbox" name="cold_gear" ${draft.cold_gear ? 'checked' : ''}> Есть экипировка для холода</label>`;
  }

  function stepPrefs() {
    return `<h2>Предпочтения</h2>
      <div class="section-title">Нравится</div>${chips('likes', HD.PREFERENCE_TAGS.map((t) => [t.key, t.label]), draft.likes || [])}
      <div class="section-title">Не нравится (исключаем)</div>${chips('dislikes', HD.PREFERENCE_TAGS.map((t) => [t.key, t.label]), draft.dislikes || [])}
      <div style="margin-top:12px" class="stack">
        ${ui.field('Ограничения и травмы', `<textarea class="input" name="injuries">${esc(draft.injuries || '')}</textarea>`)}
        <label class="check"><input type="checkbox" name="coach" ${draft.coach ? 'checked' : ''}> Нужен тренер по технике</label>
      </div>`;
  }

  // Сбор значений текущего шага в черновик
  function collect(root) {
    const f = root.querySelector('[data-form="wizard"]');
    if (!f) return;
    if (step === 0) {
      draft.sessions = Array.from(f.querySelectorAll('[data-slot]')).map((el) => {
        const g = (k) => el.querySelector(`[data-f="${k}"]`).value;
        return {
          kind: g('kind'),
          per_week: ui.numOrNull(g('per_week')),
          per_month: ui.numOrNull(g('per_month')),
          duration_min: ui.numOrNull(g('duration_min')),
          days: Array.from(el.querySelectorAll('[data-days] .chip.on')).map((c) => Number(c.dataset.v)),
          location: g('location'),
        };
      });
    }
    f.querySelectorAll('[data-chips]').forEach((box) => (draft[box.dataset.chips] = Array.from(box.querySelectorAll('.chip.on')).map((c) => c.dataset.v)));
    const v = ui.formData(f);
    if (step === 1) {
      draft.relief = !!v.relief;
      draft.cold_gear = !!v.cold_gear;
      draft.dumbbells_max_kg = ui.numOrNull(v.dumbbells_max);
      if (!draft.equipment.includes('bodyweight')) draft.equipment.push('bodyweight');
    }
    if (step === 2) {
      draft.injuries = v.injuries;
      draft.coach = !!v.coach;
    }
  }

  // Предпросмотр плана по черновику: уровень и ограничения — из анкеты подготовки
  function preview(ctx) {
    const goal = HD.svc.plan.mainGoalInput(ctx);
    const prefs = Object.assign({}, draft, { limits: ctx.assessment ? ctx.assessment.limits : {}, sedentary: ctx.assessment ? ctx.assessment.sedentary : false });
    try {
      return HD.plan.generatePlan(goal, prefs, ctx.assessment ? ctx.assessment.baseline : {}, {}, ctx.today, HD.EXERCISES, ctx.scenario);
    } catch (e) {
      return { warnings: ['Не удалось построить план: ' + e.message], sessions: [], meta: {} };
    }
  }

  ui.views.wizard = {
    title: 'Расписание',
    back: (ctx) => (ctx.onboarding.done ? '#/profile' : null),
    render(ctx) {
      ensureDraft(ctx);
      const body = [stepSchedule, stepResources, stepPrefs][step](ctx);
      const p = preview(ctx);
      const last = step === STEPS.length - 1;
      return `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        <div class="small muted" style="margin-bottom:8px">Шаг ${step + 1} из ${STEPS.length} · ${STEPS[step]}</div>
        <form class="card" data-form="wizard">${body}</form>
        ${p.warnings.length ? `<div class="stack" style="margin-top:12px">${p.warnings.map((w) => `<div class="notice warn">${esc(w)}</div>`).join('')}</div>` : ''}
        ${last && p.weeks ? `<div class="notice" style="margin-top:12px">План: ${p.weeks} нед., ${num(p.meta.sessions_per_week, 1)} трен./нед${p.meta.peak_long_run ? `, пик длинного бега ${p.meta.peak_long_run} мин` : ''}.</div>` : ''}
        <div class="grid2" style="margin-top:12px">
          <button class="btn" data-act="prev" ${step === 0 ? 'disabled' : ''}>Назад</button>
          ${last ? `<button class="btn primary" data-act="save">${ctx.onboarding.done ? 'Сохранить и пересобрать план' : 'Построить план'}</button>` : '<button class="btn primary" data-act="next">Далее</button>'}
        </div>`;
    },
    bind(root, ctx) {
      root.querySelectorAll('.chip').forEach((c) => (c.onclick = () => c.classList.toggle('on')));
      const add = root.querySelector('[data-add-slot]');
      if (add) add.onclick = () => (collect(root), draft.sessions.push({ kind: 'run', per_week: 1, duration_min: null, days: [5], location: 'street' }), ui.render());
      root.querySelectorAll('[data-del-slot]').forEach((b) => (b.onclick = () => (collect(root), draft.sessions.splice(Number(b.dataset.delSlot), 1), ui.render())));
      const prev = root.querySelector('[data-act="prev"]');
      if (prev) prev.onclick = () => (collect(root), step--, ui.render());
      const next = root.querySelector('[data-act="next"]');
      if (next)
        next.onclick = () => {
          collect(root);
          if (step === 0 && !draft.sessions.some((s) => (s.per_week || s.per_month) > 0)) return ui.toast('Добавьте хотя бы одно занятие');
          step++;
          ui.render();
          window.scrollTo(0, 0);
        };
      root.querySelector('[data-form="wizard"]').onsubmit = (e) => e.preventDefault();
      const save = root.querySelector('[data-act="save"]');
      if (save)
        save.onclick = () => {
          collect(root);
          if (!draft.sessions.some((s) => (s.per_week || s.per_month) > 0)) return ui.toast('Добавьте хотя бы одно занятие');
          const wasDone = ctx.onboarding.done;
          HD.svc.plan.savePreferences(ctx.profileId, deepClone(draft));
          if (wasDone) HD.svc.plan.generate(ctx.profileId, { reason: 'Расписание изменено' });
          else HD.svc.onboarding.finish(ctx.profileId);
          draft = null;
          ui.toast(wasDone ? 'Расписание сохранено, план пересобран' : 'Всё готово. Можно начинать');
          ui.go(wasDone ? '#/training' : '#/home');
        };
    },
  };
})(window.HD);
