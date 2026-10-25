// Цели — второй шаг первичной настройки (после анкеты подготовки), без цели приложением пользоваться нельзя.
// Основная цель одна и верхнеуровневая (вес, сила, забег, общая форма): её достигает план и питание.
// Дополнительные цели вносят поправки в сценарий основной; несочетаемые с ней добавить нельзя.
// При задании любой цели показывается проверка безопасности (темп, ИМТ, нагрузка относительно подготовки и здоровья).
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const G = HD.goals;
  const { esc, num, pct } = HD.util;

  const LIFT_CHOICES = ['squat_bb', 'bench_bb', 'deadlift', 'ohp_bb', 'rdl_bb', 'hip_thrust_bb', 'lat_pulldown', 'bb_row'];
  const MAIN_ICON = { weight_loss: 'scale', weight_gain: 'scale', strength_lift: 'strength', race: 'run', consistency: 'cardio' };
  const LEVEL_LABEL = { block: 'Нельзя', danger: 'Опасно', warn: 'Внимание', info: 'К сведению' };

  function autoTitle(type, p) {
    const n = (v) => num(Number(v), 1);
    switch (type) {
      case 'weight_loss':
        return p.target_value ? `Снижение веса до ${n(p.target_value)} кг` : 'Снижение веса';
      case 'weight_gain':
        return p.target_value ? `Набор веса до ${n(p.target_value)} кг` : 'Набор веса';
      case 'strength_lift': {
        const ex = HD.exerciseByKey(p.exercise_key);
        return ex && p.target_value ? `${ex.name}: ${n(p.target_value)} кг` : 'Рост силовых показателей';
      }
      case 'race': {
        const d = p.distance_max || p.distance_min;
        return d ? `${p.surface === 'trail' ? 'Трейл' : 'Забег'} ${d} км` : 'Подготовка к забегу';
      }
      case 'consistency':
        return p.per_week ? `${p.per_week} ${HD.util.plural(Number(p.per_week), 'тренировка', 'тренировки', 'тренировок')} в неделю` : 'Общая форма';
      case 'measurement': {
        const f = (G.get('measurement').FIELDS.find((x) => x[0] === p.field) || [0, 'Объём'])[1];
        return p.target_value ? `${f}: ${n(p.target_value)} см` : f;
      }
      case 'run_distance':
        return p.target_value ? `Пробежать ${n(p.target_value)} км` : 'Пробежать дистанцию';
    }
    return G.get(type).label;
  }

  // Подстановка разумных значений по умолчанию в форму новой цели
  function defaults(ctx, type) {
    const d = {};
    const w = ctx.currentWeight ? Math.round(ctx.currentWeight * 10) / 10 : null;
    if (['weight_loss', 'weight_gain'].includes(type)) d.start_value = w;
    if (type === 'strength_lift') {
      d.exercise_key = 'bench_bb';
      const l = ctx.assessment && ctx.assessment.baseline.lifts;
      if (l && l[d.exercise_key]) d.start_value = l[d.exercise_key];
    }
    if (type === 'race') {
      d.surface = 'trail';
      d.aim = 'finish';
    }
    if (type === 'consistency') d.per_week = 3;
    if (type === 'measurement') {
      d.field = 'waist_cm';
      const m = ctx.measurements.filter((x) => x.waist_cm != null).pop();
      if (m) d.start_value = m.waist_cm;
    }
    return d;
  }

  function paramFields(strategy, params) {
    params = params || {};
    return strategy.fields
      .map((f) => {
        const v = params[f.key];
        if (f.type === 'number') return ui.field(f.label + (f.required ? ' *' : ''), ui.numInput('p_' + f.key, v, f.unit));
        if (f.type === 'date') return ui.field(f.label + (f.required ? ' *' : ''), `<input class="input" type="date" name="p_${f.key}" value="${v || ''}">`);
        if (f.type === 'select') return ui.field(f.label, `<select class="input" name="p_${f.key}">${f.options.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
        if (f.type === 'exercise') return ui.field(f.label, `<select class="input" name="p_${f.key}">${LIFT_CHOICES.map((k) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(HD.exerciseByKey(k).name)}</option>`).join('')}</select>`);
        return '';
      })
      .join('');
  }

  function readParams(form, strategy) {
    const v = ui.formData(form);
    const out = {};
    for (const f of strategy.fields) {
      const raw = v['p_' + f.key];
      if (f.type === 'number') out[f.key] = ui.numOrNull(raw);
      else out[f.key] = raw || null;
    }
    return out;
  }

  function requiredMissing(strategy, params) {
    return strategy.fields.filter((f) => f.required && (params[f.key] == null || params[f.key] === '')).map((f) => f.label);
  }

  function safetyHtml(res, type) {
    if (!res.items.length) return '<div class="notice good">Проверка безопасности: замечаний нет.</div>';
    const cls = { block: 'danger', danger: 'danger', warn: 'warn', info: '' };
    let html = `<div class="stack">${res.items.map((i) => `<div class="notice ${cls[i.level]}"><b>${LEVEL_LABEL[i.level]}.</b> ${esc(i.text)}</div>`).join('')}</div>`;
    if (res.hint && res.hint.safeDate && type === 'weight_loss') html += `<button type="button" class="btn small" style="margin-top:8px" data-set-deadline="${res.hint.safeDate}">Поставить безопасный срок: ${D.short(res.hint.safeDate, true)}</button>`;
    if (res.hint && res.hint.earliest && type === 'race') html += `<div class="small muted" style="margin-top:8px">Реалистично стартовать не раньше ${D.short(res.hint.earliest, true)}.</div>`;
    if (res.needsConfirm) html += `<label class="check" style="margin-top:8px"><input type="checkbox" name="confirm"> Я понимаю риски и всё равно хочу поставить эту цель</label>`;
    return html;
  }

  // ---------- экраны ----------

  function typeCard(s, href, icon, compat) {
    const dis = compat && !compat.ok;
    const body = `<span class="icon-btn" style="border:0;background:var(--accent);color:#000;flex:none">${ui.icon(icon || 'target')}</span><span class="grow"><b>${esc(s.label)}</b><div class="small muted">${esc(dis ? compat.reason : s.short || '')}</div>${compat && compat.ok && compat.effect ? `<div class="tiny" style="margin-top:4px">${esc(compat.effect)}</div>` : ''}</span>`;
    return dis ? `<div class="type-card off">${body}</div>` : `<a class="type-card" href="${href}">${body}</a>`;
  }

  function chooser(ctx, role) {
    if (role === 'main') {
      return `<div class="notice" style="margin-bottom:12px">Основная цель — одна, про занятия спортом в целом. Её достигает план тренировок и питание. Более мелкие цели добавляются потом как дополнительные.</div>
        <div class="stack">${G.scenario.typesFor('main').map((s) => typeCard(s, `#/goals/new?role=main&type=${s.type}`, MAIN_ICON[s.type])).join('')}</div>`;
    }
    const existing = ctx.secondaries.map((g) => ({ id: g.id, type: g.type, title: g.title, params: HD.svc.goals.paramsOf(ctx, g) }));
    const main = { type: ctx.main.type, title: ctx.main.title, params: HD.svc.goals.paramsOf(ctx, ctx.main) };
    return `<div class="notice" style="margin-bottom:12px">Дополнительная цель корректирует сценарий основной («${esc(ctx.main.title)}»). Несвязанные цели добавлять нет смысла — они не повлияют на план.</div>
      <div class="stack">${G.scenario.typesFor('secondary')
        .map((s) => {
          const c = G.scenario.canAdd(main, existing, { type: s.type, params: {} });
          const base = c;
          return typeCard(s, `#/goals/new?role=secondary&type=${s.type}`, MAIN_ICON[s.type] || 'target', c);
        })
        .join('')}</div>`;
  }

  function newForm(ctx, r) {
    const role = r.q.role === 'secondary' ? 'secondary' : 'main';
    const type = r.q.type;
    const s = G.get(type);
    if (!s || !s.roles.includes(role)) return chooser(ctx, role);
    if (role === 'secondary' && !ctx.main) return '<div class="notice warn">Сначала задайте основную цель.</div>';
    const compat = role === 'secondary' ? G.scenario.compat(ctx.main.type, type) : null;
    if (compat && !compat.ok) return `<div class="notice danger">${esc(compat.reason)}</div><a class="btn" href="#/goals/new?role=secondary" style="margin-top:12px">Выбрать другую цель</a>`;
    const def = defaults(ctx, type);
    return `<form class="card stack" data-form="new">
      <div class="row"><span class="icon-btn" style="border:0;background:var(--accent);color:#000">${ui.icon(MAIN_ICON[type] || 'target')}</span><div class="grow"><h2>${esc(s.label)}</h2><div class="small muted">${role === 'main' ? 'Основная цель' : 'Дополнительная цель'}</div></div></div>
      ${role === 'secondary' && compat.effect ? `<div class="notice">Как повлияет на план: ${esc(compat.effect)}</div>` : ''}
      ${role === 'main' && ctx.main ? `<div class="notice warn">Текущая основная цель «${esc(ctx.main.title)}» уйдёт в архив с достигнутым процентом. Несовместимые дополнительные цели тоже будут убраны.</div>` : ''}
      ${paramFields(s, def)}
      ${ui.field('Название (необязательно)', `<input class="input" name="title" placeholder="${esc(autoTitle(type, def))}">`)}
      <div data-safety></div>
      <button class="btn primary block" data-submit>Поставить цель</button>
    </form>`;
  }

  function goalCard(i, main) {
    const href = `#/goals/${i.goal.id}`;
    return `<li><a class="li-link" href="${href}"><span class="grow"><b>${esc(i.goal.title)}</b>
      <div class="small muted">${esc(i.strategy.label)}${i.params && i.params.deadline ? ' · до ' + D.short(i.params.deadline, true) : ''}${i.pace ? ' · ' + G.PACE_LABEL[i.pace].toLowerCase() : ''}</div>
      ${i.effect ? `<div class="tiny" style="margin-top:4px">↳ ${esc(i.effect)}</div>` : ''}
      <div class="bar" style="margin-top:6px"><i style="width:${i.pct || 0}%"></i></div></span><b class="num">${pct(i.pct)}</b></a></li>`;
  }

  function list(ctx) {
    if (!ctx.main) return chooser(ctx, 'main');
    const ov = HD.svc.goals.overview(ctx);
    const archived = ctx.goals.filter((g) => g.status !== 'active');
    const onb = !ctx.onboarding.done;
    const m = ov.main;
    const safety = HD.svc.goals.safetyFor(ctx, { type: m.goal.type, role: 'main', params: m.params });
    return `<section class="card">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.04em">Основная цель</div>
        <ul class="list">${goalCard(m, true)}</ul>
        <div class="grid2" style="margin-top:6px"><a class="btn small" href="#/goals/${m.goal.id}">Изменить</a><a class="btn small" href="#/goals/new?role=main">Сменить цель</a></div>
        ${safety.items.length ? `<div class="stack" style="margin-top:10px">${safety.items.filter((x) => x.level !== 'info').map((x) => `<div class="notice ${x.level === 'warn' ? 'warn' : 'danger'}">${esc(x.text)}</div>`).join('')}</div>` : ''}
      </section>
      <div class="section-title">Дополнительные цели</div>
      <section class="card">
        ${ov.secondary.length ? `<ul class="list">${ov.secondary.map((i) => goalCard(i)).join('')}</ul>` : '<div class="muted small">Пока нет. Дополнительная цель уточняет основную: например, «жим лёжа 100 кг» при снижении веса сохранит силу — дефицит калорий станет мягче, а упражнение попадёт в каждую силовую.</div>'}
        <a class="btn block" style="margin-top:10px" href="#/goals/new?role=secondary">+ Дополнительная цель</a>
      </section>
      ${ov.scenario.nutrition.notes.length ? `<div class="notice" style="margin-top:12px">${ov.scenario.nutrition.notes.map(esc).join(' ')}</div>` : ''}
      ${onb ? `<button class="btn primary block" style="margin-top:16px" data-act="goals-next">Далее: расписание</button>` : ''}
      ${archived.length ? `<div class="section-title">Архив</div><section class="card"><ul class="list">${archived.map((g) => `<li><a class="li-link" href="#/goals/${g.id}"><span class="grow">${esc(g.title)}<div class="tiny muted">${g.status === 'achieved' ? 'достигнута' : esc(g.archive_reason || 'в архиве')}${g.archived_at ? ' · ' + D.short(g.archived_at, true) : ''}</div></span><b class="num">${pct(g.final_progress)}</b></a></li>`).join('')}</ul></section>` : ''}`;
  }

  function editGoal(ctx, id) {
    const goal = ctx.goals.find((g) => g.id === id);
    if (!goal) return '<div class="notice warn">Цель не найдена</div>';
    const s = G.get(goal.type);
    const versions = ctx.versions.get(id).slice().sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
    const cur = G.versionAt(ctx.versions.get(id), ctx.today);
    const info = HD.svc.goals.overview(ctx).items.find((i) => i.goal.id === id);
    const active = goal.status === 'active';
    return `<section class="card"><div class="row">${HD.charts.ring(info ? info.pct : goal.final_progress, 84)}<div class="grow"><h2>${esc(goal.title)}</h2><div class="small muted">${esc(s.label)} · ${goal.role === 'main' ? 'основная' : 'дополнительная'}</div>${info && info.note ? `<div class="tiny muted" style="margin-top:4px">${esc(info.note)}</div>` : ''}${info && info.expected != null ? `<div class="tiny muted">Ожидалось на сегодня: ${pct(info.expected)}</div>` : ''}</div></div>
      ${info && info.effect ? `<div class="notice" style="margin-top:10px">Как влияет на план: ${esc(info.effect)}</div>` : ''}</section>
      ${active ? `<form class="card stack" style="margin-top:12px" data-form="edit">
        <h2>Параметры</h2>
        ${ui.field('Название', `<input class="input" name="title" value="${esc(goal.title)}">`)}
        ${paramFields(s, cur.params)}
        ${s.fields.some((f) => f.key === 'start_value') ? `<label class="check"><input type="checkbox" name="reset_start"> Начать отсчёт с сегодняшнего значения</label>` : ''}
        ${ui.field('Причина изменения (видна на графике)', `<input class="input" name="reason" placeholder="Например: реалистичнее">`)}
        <div data-safety></div>
        <div class="tiny muted">Изменение создаёт новую версию с сегодняшнего дня; записи питания, веса и тренировок не меняются.</div>
        <button class="btn primary block" data-submit>Сохранить</button>
      </form>
      <div class="grid2" style="margin-top:12px"><button class="btn" data-status="achieved">Достигнута</button><button class="btn danger" data-status="archived">${goal.role === 'main' ? 'В архив' : 'Убрать цель'}</button></div>` : ''}
      <section class="card" style="margin-top:12px"><h2>История версий</h2><ul class="list">${versions.map((v) => `<li><span class="grow small">с ${D.short(v.valid_from, true)} — ${esc(v.change_reason || '')}<div class="tiny muted">${esc(describe(s, v.params))}</div></span></li>`).join('')}</ul></section>`;
  }

  function describe(s, p) {
    return s.fields
      .filter((f) => p[f.key] != null && p[f.key] !== '')
      .map((f) => `${f.label}: ${f.type === 'date' ? D.short(p[f.key], true) : f.type === 'select' ? (f.options.find((o) => o[0] === p[f.key]) || [0, p[f.key]])[1] : f.type === 'exercise' ? (HD.exerciseByKey(p[f.key]) || {}).name : num(p[f.key], 1) + (f.unit ? ' ' + f.unit : '')}`)
      .join(', ');
  }

  // После изменения основной цели: пересобрать план (если есть расписание) и пересчитать норму
  function afterMainChange(profileId, reason, planChanged) {
    let msg = 'Сохранено';
    const ctx = HD.svc.ctx(profileId);
    if (planChanged && ctx.prefs) {
      const res = ctx.plan ? HD.svc.plan.generate(profileId, { reason }) : HD.svc.plan.ensurePlan(profileId);
      if (res) msg += '. План пересобран с текущей недели';
    }
    const n = HD.svc.nutrition.recalc(profileId, reason);
    if (n.target && !n.unchanged) msg += `. Норма с ${D.short(n.target.valid_from)}: ${num(n.target.daily_kcal)} ккал`;
    return msg;
  }

  function bindSafety(form, ctx, type, role, getParams, isEdit) {
    const box = form.querySelector('[data-safety]');
    const run = () => {
      const params = getParams();
      const res = HD.svc.goals.safetyFor(ctx, { type, role, params: Object.assign({ start_date: ctx.today }, params) });
      const had = form.querySelector('[name="confirm"]');
      const keep = had && had.checked;
      box.innerHTML = safetyHtml(res, type);
      const c = box.querySelector('[name="confirm"]');
      if (c && keep) c.checked = true;
      box.querySelectorAll('[data-set-deadline]').forEach((b) => (b.onclick = () => ((form.querySelector('[name="p_deadline"]').value = b.dataset.setDeadline), run())));
      form._safety = res;
    };
    form.addEventListener('input', (e) => !e.target.matches('[name="confirm"]') && run());
    form.addEventListener('change', (e) => !e.target.matches('[name="confirm"]') && run());
    run();
  }

  ui.views.goals = {
    title: (ctx, r) => (r.parts[0] === 'new' ? (r.q.role === 'secondary' ? 'Дополнительная цель' : 'Основная цель') : r.parts[0] ? 'Цель' : ctx.main ? 'Цели' : 'Ваша цель'),
    render(ctx, r) {
      this.back = r.parts[0] ? () => '#/goals' : ctx.onboarding.done ? () => '#/profile' : null;
      if (r.parts[0] === 'new') return newForm(ctx, r);
      if (r.parts[0]) return editGoal(ctx, r.parts[0]);
      return list(ctx);
    },
    bind(root, ctx, r) {
      const nf = root.querySelector('[data-form="new"]');
      if (nf) {
        const role = r.q.role === 'secondary' ? 'secondary' : 'main';
        const s = G.get(r.q.type);
        bindSafety(nf, ctx, r.q.type, role, () => readParams(nf, s));
        nf.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(nf);
          const params = readParams(nf, s);
          const miss = requiredMissing(s, params);
          if (miss.length) return ui.toast('Заполните: ' + miss.join(', '));
          const res = HD.svc.goals.safetyFor(ctx, { type: r.q.type, role, params: Object.assign({ start_date: ctx.today }, params) });
          if (res.blocked) return ui.toast('Эту цель поставить нельзя — см. предупреждение');
          if (res.needsConfirm && !v.confirm) return ui.toast('Подтвердите, что понимаете риски');
          const title = (v.title || '').trim() || autoTitle(r.q.type, params);
          if (role === 'secondary') {
            const can = HD.svc.goals.canAddSecondary(ctx, { type: r.q.type, params });
            if (!can.ok) return ui.toast(can.reason);
            const g = HD.svc.goals.create(ctx.profileId, { role, type: r.q.type, title, params, risk_confirmed: !!v.confirm });
            const planMsg = ctx.prefs ? afterMainChange(ctx.profileId, 'Новая дополнительная цель', true) : 'Цель добавлена';
            ui.toast(planMsg);
            return ui.go('#/goals');
          }
          const out = HD.svc.goals.replaceMain(ctx.profileId, { type: r.q.type, title, params, risk_confirmed: !!v.confirm });
          let msg = afterMainChange(ctx.profileId, 'Новая основная цель', true);
          if (out.dropped.length) msg += `. Убраны несочетаемые цели: ${out.dropped.map((d) => d.goal.title).join(', ')}`;
          ui.toast(msg);
          ui.go('#/goals');
        };
      }
      const ef = root.querySelector('[data-form="edit"]');
      if (ef) {
        const goal = ctx.goals.find((g) => g.id === r.parts[0]);
        const s = G.get(goal.type);
        bindSafety(ef, ctx, goal.type, goal.role, () => readParams(ef, s), true);
        ef.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(ef);
          const params = readParams(ef, s);
          const miss = requiredMissing(s, params);
          if (miss.length) return ui.toast('Заполните: ' + miss.join(', '));
          const res = HD.svc.goals.safetyFor(ctx, { type: goal.type, role: goal.role, params: Object.assign({ start_date: ctx.today }, params) });
          if (res.blocked) return ui.toast('Так поставить цель нельзя — см. предупреждение');
          if (res.needsConfirm && !v.confirm) return ui.toast('Подтвердите, что понимаете риски');
          const resetStart = !!v.reset_start;
          const curVal = resetStart ? (s.progress(params, ctx.strategyCtx, ctx.today) || {}).current : null;
          const curParams = G.versionAt(ctx.versions.get(goal.id), ctx.today).params;
          if (!resetStart && params.start_value === curParams.start_value) delete params.start_value;
          const out = HD.svc.goals.updateParams(goal.id, params, v.reason || 'Изменение цели', { resetStart, currentValue: curVal });
          HD.svc.goals.updateMeta(goal.id, { title: (v.title || '').trim() || goal.title });
          ui.toast(ctx.prefs ? afterMainChange(ctx.profileId, v.reason || 'Изменение цели', out.planChanged) : 'Сохранено');
          ui.render();
        };
      }
      const gn = root.querySelector('[data-act="goals-next"]');
      if (gn)
        gn.onclick = () => {
          HD.svc.onboarding.confirmGoals(ctx.profileId);
          ui.go('#/wizard');
        };
      root.querySelectorAll('[data-status]').forEach(
        (b) =>
          (b.onclick = async () => {
            const goal = ctx.goals.find((g) => g.id === r.parts[0]);
            const text = goal.role === 'main' ? 'После этого нужно будет задать новую основную цель. Продолжить?' : b.dataset.status === 'achieved' ? 'Отметить цель достигнутой?' : 'Убрать эту цель?';
            if (!(await ui.confirm(text))) return;
            HD.svc.goals.setStatus(r.parts[0], b.dataset.status);
            if (goal.role === 'secondary' && ctx.prefs) afterMainChange(ctx.profileId, 'Убрана дополнительная цель', true);
            ui.go('#/goals');
          }),
      );
    },
  };
})(window.HD);
