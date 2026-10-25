// Блок «Тренировки» (раздел 6 ТЗ): неделя плана, карточка тренировки с отметкой, весь план, внеплановая активность.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const { esc, num } = HD.util;
  const PS = () => HD.svc.plan;

  const KIND = { strength: 'Силовая', run: 'Бег', cardio: 'Кардио', other: 'Другое' };
  const LOC = { gym: 'зал', street: 'улица', home: 'дом', treadmill: 'дорожка' };

  function weekIndex(plan, date) {
    return Math.floor(D.diffDays(plan.start_date, date) / 7) + 1;
  }

  function inclineText(t) {
    if (t.incline === 'incline_blocks') return 'На дорожке: база наклон 1%, каждые 10 мин блок 3–4 мин на наклоне 6–8% шагом или лёгким бегом';
    if (t.incline === 'hills') return 'Маршрут с подъёмами, подъёмы шагом';
    return '';
  }

  function sessionRow(ctx, s) {
    const log = HD.svc.logFor(ctx, s.id);
    const state = log ? (log.done ? '<span class="badge good">выполнено</span>' : '<span class="badge danger">пропуск</span>') : s.date < ctx.today ? '<span class="badge warn">не отмечено</span>' : '';
    return `<li><a class="li-link session ${log && log.done ? 'done' : ''}" href="#/training/s/${s.id}">
      <div class="kind ${s.kind}">${ui.kindIcon(s.kind)}</div>
      <div class="grow"><b>${esc(s.title)}</b> ${s.is_deload ? '<span class="badge info">разгрузка</span>' : ''}
        <div class="small muted">${D.WEEKDAYS[D.dow(s.date)]}, ${D.short(s.date)} · ${s.effective_duration || '—'} мин${s.target.format ? ' · ' + (s.target.format === 'continuous' ? 'непрерывно' : s.target.format) : ''}${s.target.incline ? ' · наклон/рельеф' : ''}</div>
        ${s.notes && s.notes.length ? `<div class="tiny" style="color:var(--info)">${esc(s.notes.join('; '))}</div>` : ''}
      </div>${state}</a></li>`;
  }

  function weekView(ctx, r) {
    const plan = ctx.plan;
    if (!plan) {
      return `<div class="card stack"><h2>Плана пока нет</h2><p class="muted small">Заполните анкету: цель, расписание, оборудование, предпочтения и текущий уровень — план построится автоматически.</p><a class="btn primary" href="#/wizard">Заполнить анкету</a><a class="btn" href="#/training/log">+ Отметить активность без плана</a></div>${logsList(ctx)}`;
    }
    const monday = D.monday(r.q.week && D.isValid(r.q.week) ? r.q.week : ctx.today);
    const w = weekIndex(plan, monday);
    const inPlan = w >= 1 && w <= plan.weeks;
    const phase = inPlan ? HD.plan.phaseOf(plan.phases, w) : null;
    const sessions = ctx.sessions.filter((s) => s.date >= monday && s.date <= D.addDays(monday, 6));
    const unplanned = ctx.logs.filter((l) => !l.planned_session_id && l.date >= monday && l.date <= D.addDays(monday, 6));
    const changes = PS().changes(ctx.profileId).filter((c) => c.auto).slice(0, 5);
    return `<div class="row between" style="margin-bottom:10px">
        <a class="icon-btn" href="#/training?week=${D.addDays(monday, -7)}">${ui.icon('left')}</a>
        <div class="center"><b>${inPlan ? `Неделя ${w} из ${plan.weeks}` : 'Вне плана'}</b><div class="small muted">${D.weekLabel(monday)}</div></div>
        <a class="icon-btn" href="#/training?week=${D.addDays(monday, 7)}">${ui.icon('right')}</a>
      </div>
      ${phase ? `<div class="row wrap" style="gap:6px;margin-bottom:10px"><span class="badge accent">Фаза: ${esc(phase.name)}</span>${sessions.some((s) => s.is_deload) ? '<span class="badge info">Разгрузочная неделя</span>' : ''}</div>` : ''}
      ${(plan.warnings || []).map((t) => `<div class="notice warn" style="margin-bottom:8px">${esc(t)}</div>`).join('')}
      <section class="card" data-swipe>
        <ul class="list">${sessions.map((s) => sessionRow(ctx, s)).join('') || '<li class="muted">На этой неделе тренировок нет</li>'}
        ${unplanned.map((l) => `<li><a class="li-link session done" href="#/training/log?id=${l.id}"><div class="kind other">${ui.icon('plus')}</div><div class="grow"><b>${esc(l.title || KIND[l.kind])}</b><div class="small muted">${D.WEEKDAYS[D.dow(l.date)]}, ${D.short(l.date)} · внеплановая${l.duration_min ? ' · ' + l.duration_min + ' мин' : ''}</div></div></a></li>`).join('')}</ul>
      </section>
      <div class="grid2" style="margin-top:12px">
        <a class="btn" href="#/training/log">+ Активность</a>
        <a class="btn" href="#/training/plan">Весь план</a>
      </div>
      <button class="btn block" style="margin-top:10px" data-act="rebuild">${ui.icon('swap')} Пересобрать план</button>
      ${changes.length ? `<div class="section-title">Автоматические изменения плана</div><section class="card"><ul class="list">${changes
        .map((c) => `<li><span class="grow small">${esc(c.reason)}<div class="tiny muted">${new Date(c.created_at).toLocaleDateString('ru-RU')}</div></span>${c.reverted_at ? '<span class="badge">отменено</span>' : `<button class="btn small" data-undo="${c.id}">${ui.icon('undo')} Отменить</button>`}</li>`)
        .join('')}</ul></section>` : ''}`;
  }

  function logsList(ctx) {
    const logs = ctx.logs.slice(-10).reverse();
    if (!logs.length) return '';
    return `<div class="section-title">Последние отметки</div><section class="card"><ul class="list">${logs.map((l) => `<li><a class="li-link" href="#/training/log?id=${l.id}"><span class="grow">${esc(l.title || KIND[l.kind])}<div class="tiny muted">${D.short(l.date, true)}</div></span>${l.done ? '✓' : '—'}</a></li>`).join('')}</ul></section>`;
  }

  function sessionView(ctx, id) {
    const s = ctx.sessions.find((x) => x.id === id) || (HD.db.get('planned_sessions', id) && HD.svc.effective(HD.db.get('planned_sessions', id)));
    if (!s) return '<div class="notice warn">Тренировка не найдена (возможно, план пересобран).</div>';
    const log = HD.svc.logFor(ctx, s.id) || {};
    const t = s.target;
    const ex = HD.svc.suggestedWeights(ctx, s);
    const mainV = ctx.main ? HD.goals.versionAt(ctx.versions.get(ctx.main.id), ctx.today).params : null;
    const keyLift = ctx.main && ctx.main.type === 'strength_lift' && s.kind === 'strength' ? HD.exerciseByKey(mainV.exercise_key) : null;
    const winter = s.kind === 'run' && HD.recommendations.isWinter(s.date) && (t.location === 'street' || s.moved_to_treadmill);
    const done = log.done !== false;
    const wb = log.wellbeing != null ? log.wellbeing : 7;
    return `<section class="card">
        <div class="session"><div class="kind ${s.kind}">${ui.kindIcon(s.kind)}</div><div class="grow">
          <h2>${esc(s.title)}</h2>
          <div class="small muted">${D.WEEKDAYS_FULL[D.dow(s.date)]}, ${D.short(s.date, true)} · ${esc(HD.plan.PHASES[s.phase] || '')}${s.is_deload ? ' · разгрузка' : ''} · ${LOC[t.location] || ''}</div>
        </div></div>
        ${s.notes && s.notes.length ? `<div class="notice" style="margin-top:10px">${s.notes.map(esc).join('<br>')}</div>` : ''}
        <div class="kv small" style="margin-top:12px">
          <span>Разминка</span><span>${t.warmup_min || 10} мин</span>
          <span>Длительность</span><span>${s.effective_duration || '—'} мин</span>
          ${t.format_label ? `<span>Формат</span><span>${esc(t.format_label)}</span>` : ''}
        </div>
        ${inclineText(t) ? `<div class="notice" style="margin-top:10px">${esc(inclineText(t))}</div>` : ''}
        ${t.is_long && s.effective_duration >= 90 ? '<div class="notice" style="margin-top:10px">Длинный бег от 90 минут: вода и 30–60 г углеводов в час</div>' : ''}
        ${ex.length ? `<table class="ex-table" style="margin-top:12px">${ex
          .map((e) => `<tr><td>${esc(e.name)}${e.role === 'main' ? '' : ''}</td><td>${e.sets > 1 || !/мин/.test(e.reps) ? e.sets + ' × ' : ''}${esc(e.reps)}${e.weight_kg != null ? `<div class="tiny muted">${num(e.weight_kg, 1)} кг</div>` : ''}</td></tr>`)
          .join('')}</table><div class="tiny muted" style="margin-top:6px">Вес растёт на 2,5 кг (штанга) или 1 кг (гантели), когда прошлая такая же тренировка прошла с самочувствием ≥ 6.</div>` : ''}
        ${winter ? `<button class="btn block" style="margin-top:12px" data-act="treadmill">${s.moved_to_treadmill ? 'Вернуть на улицу' : '❄ Перенести на дорожку (гололёд, мороз)'}</button>` : ''}
      </section>
      <form class="card stack" style="margin-top:12px" data-form="log">
        <h2>Отметка</h2>
        <div class="seg"><button type="button" data-done="1" class="${done ? 'on' : ''}">Выполнено</button><button type="button" data-done="0" class="${!done ? 'on' : ''}">Не выполнено</button></div>
        <input type="hidden" name="done" value="${done ? '1' : '0'}">
        <div class="grid2">
          ${ui.field('Длительность', ui.numInput('duration_min', log.duration_min != null ? log.duration_min : s.effective_duration, 'мин'))}
          ${s.kind === 'run' ? ui.field('Дистанция', ui.numInput('distance_km', log.distance_km, 'км')) : '<div></div>'}
        </div>
        <label class="field"><span>Самочувствие: <b data-wb>${wb}</b> из 10</span><input type="range" min="1" max="10" name="wellbeing" value="${wb}"></label>
        ${keyLift ? ui.field('Рабочий вес: ' + keyLift.name, ui.numInput('key_lift_kg', log.key_lift_kg, 'кг')) : ''}
        ${ui.field('Заметка', `<input class="input" name="note" value="${esc(log.note || '')}">`)}
        <div class="tiny muted">При боли или травме пропусти нагрузку и обратись к врачу, если не проходит.</div>
        <button class="btn primary block">Сохранить отметку</button>
        ${log.id ? '<button type="button" class="btn ghost danger block" data-act="del-log">Удалить отметку</button>' : ''}
      </form>`;
  }

  function logView(ctx, r) {
    const log = r.q.id ? HD.db.get('session_logs', r.q.id) || {} : {};
    const wb = log.wellbeing != null ? log.wellbeing : 7;
    return `<form class="card stack" data-form="unplanned">
      <h2>${log.id ? 'Отметка' : 'Внеплановая активность'}</h2>
      ${ui.field('Дата', `<input class="input" type="date" name="date" value="${log.date || ctx.today}" max="${ctx.today}">`)}
      ${ui.field('Вид', `<select class="input" name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${log.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${ui.field('Название', `<input class="input" name="title" value="${esc(log.title || '')}" placeholder="Например: прогулка с подъёмами">`)}
      <div class="grid2">${ui.field('Длительность', ui.numInput('duration_min', log.duration_min, 'мин'))}${ui.field('Дистанция', ui.numInput('distance_km', log.distance_km, 'км'))}</div>
      <label class="field"><span>Самочувствие: <b data-wb>${wb}</b> из 10</span><input type="range" min="1" max="10" name="wellbeing" value="${wb}"></label>
      ${ui.field('Заметка', `<input class="input" name="note" value="${esc(log.note || '')}">`)}
      <button class="btn primary block">Сохранить</button>
      ${log.id ? '<button type="button" class="btn ghost danger block" data-act="del-log">Удалить</button>' : ''}
    </form>`;
  }

  function planView(ctx) {
    const plan = ctx.plan;
    if (!plan) return '<div class="notice">Плана пока нет.</div>';
    const rows = [];
    for (let w = 1; w <= plan.weeks; w++) {
      const monday = D.addDays(plan.start_date, (w - 1) * 7);
      const ss = ctx.sessions.filter((s) => s.date >= monday && s.date <= D.addDays(monday, 6));
      const long = ss.find((s) => s.kind === 'run' && s.target.is_long);
      const phase = HD.plan.phaseOf(plan.phases, w);
      const deload = HD.plan.isDeloadWeek(plan.phases, w);
      const done = ss.filter((s) => ctx.doneIds.has(s.id)).length;
      rows.push(`<tr class="${monday === D.monday(ctx.today) ? 'today' : ''}"><td><a href="#/training?week=${monday}">${w}</a> <span class="muted tiny">${D.dm(monday)}</span></td><td class="small">${esc(phase.name)}${deload ? ' · <span class="badge info">разгр.</span>' : ''}</td><td>${long ? long.effective_duration : '—'}</td><td class="small">${long ? (long.target.format === 'continuous' ? 'непр.' : long.target.format) + (long.target.incline ? ' ⛰' : '') : ''}</td><td>${monday <= ctx.today ? done + '/' + ss.length : ss.length}</td></tr>`);
    }
    return `<section class="card"><h2>Фазы</h2><ul class="list">${plan.phases.map((p) => `<li><span class="grow">${esc(p.name)}</span><span class="small muted">недели ${p.from}–${p.to} · с ${D.short(D.addDays(plan.start_date, (p.from - 1) * 7))}</span></li>`).join('')}</ul>
      <div class="small muted" style="margin-top:8px">${plan.meta.peak_long_run ? `Пик длинного бега ${plan.meta.peak_long_run} мин` : ''}${plan.meta.expected_race_min ? ` · ожидаемое время старта ≈ ${Math.floor(plan.meta.expected_race_min / 60)} ч ${plan.meta.expected_race_min % 60} мин` : ''}${plan.rolling ? ' · скользящий блок 12 недель' : ''}</div></section>
      <section class="card scroll-x" style="margin-top:12px"><table class="weekgrid"><thead><tr><th>Нед.</th><th>Фаза</th><th>Длинный, мин</th><th>Формат</th><th>Трен.</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
  }

  function bindWellbeing(form) {
    const range = form.querySelector('[name="wellbeing"]');
    const label = form.querySelector('[data-wb]');
    if (range) range.oninput = () => (label.textContent = range.value);
  }

  ui.views.training = {
    title: (ctx, r) => (r.parts[0] === 's' ? 'Тренировка' : r.parts[0] === 'plan' ? 'Весь план' : r.parts[0] === 'log' ? 'Активность' : 'Тренировки'),
    back: null,
    render(ctx, r) {
      this.back = r.parts[0] ? () => '#/training' : null;
      if (r.parts[0] === 's') return sessionView(ctx, r.parts[1]);
      if (r.parts[0] === 'log') return logView(ctx, r);
      if (r.parts[0] === 'plan') return planView(ctx);
      return weekView(ctx, r);
    },
    bind(root, ctx, r) {
      const rb = root.querySelector('[data-act="rebuild"]');
      if (rb)
        rb.onclick = async () => {
          if (!(await ui.confirm('Пересобрать план с текущей недели от фактического уровня? Прошедшие тренировки и отметки сохранятся.', 'Пересобрать'))) return;
          const res = await PS().rebuild(ctx.profileId);
          ui.toast(res && res.ai && res.ai.rejected && res.ai.rejected.length ? `План пересобран; отклонено правок ИИ: ${res.ai.rejected.length}` : 'План пересобран', res ? { label: 'Отменить', run: () => (PS().undo(res.change.id), ui.render()) } : null);
          ui.render();
        };
      root.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => (PS().undo(b.dataset.undo), ui.toast('Изменение отменено'), ui.render())));
      const sw = root.querySelector('[data-swipe]');
      if (sw && ctx.plan) {
        const monday = D.monday(r.q.week && D.isValid(r.q.week) ? r.q.week : ctx.today);
        ui.onSwipe(sw, () => ui.go('#/training?week=' + D.addDays(monday, 7)), () => ui.go('#/training?week=' + D.addDays(monday, -7)));
      }

      const tm = root.querySelector('[data-act="treadmill"]');
      if (tm) {
        const s = HD.db.get('planned_sessions', r.parts[1]);
        tm.onclick = () => (PS().moveToTreadmill(s.id, !s.moved_to_treadmill), ui.render());
      }

      const lf = root.querySelector('[data-form="log"]');
      if (lf) {
        bindWellbeing(lf);
        lf.querySelectorAll('[data-done]').forEach(
          (b) =>
            (b.onclick = () => {
              lf.done.value = b.dataset.done;
              lf.querySelectorAll('[data-done]').forEach((x) => x.classList.toggle('on', x === b));
            }),
        );
        lf.onsubmit = (e) => {
          e.preventDefault();
          const s = ctx.sessions.find((x) => x.id === r.parts[1]) || HD.db.get('planned_sessions', r.parts[1]);
          const v = ui.formData(lf);
          const { changes } = PS().saveLog(ctx.profileId, {
            planned_session_id: s.id,
            date: s.date,
            done: v.done === '1',
            kind: s.kind,
            title: s.title,
            duration_min: v.done === '1' ? ui.numOrNull(v.duration_min) : null,
            distance_km: ui.numOrNull(v.distance_km),
            wellbeing: v.done === '1' ? ui.numOrNull(v.wellbeing) : null,
            key_lift_kg: ui.numOrNull(v.key_lift_kg),
            note: v.note,
          });
          if (changes.length) ui.showChanges(changes);
          else ui.toast('Отметка сохранена');
          ui.go('#/training?week=' + D.monday(s.date));
        };
      }

      const uf = root.querySelector('[data-form="unplanned"]');
      if (uf) {
        bindWellbeing(uf);
        uf.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(uf);
          const { changes } = PS().saveLog(ctx.profileId, {
            id: r.q.id || null,
            planned_session_id: r.q.id ? (HD.db.get('session_logs', r.q.id) || {}).planned_session_id : null,
            date: v.date,
            done: true,
            kind: v.kind,
            title: v.title || KIND[v.kind],
            duration_min: ui.numOrNull(v.duration_min),
            distance_km: ui.numOrNull(v.distance_km),
            wellbeing: ui.numOrNull(v.wellbeing),
            note: v.note,
            source: r.q.id ? (HD.db.get('session_logs', r.q.id) || {}).source : 'manual',
          });
          if (changes.length) ui.showChanges(changes);
          else ui.toast('Сохранено');
          ui.go('#/training');
        };
      }
      const del = root.querySelector('[data-act="del-log"]');
      if (del)
        del.onclick = async () => {
          const id = r.q.id || (HD.svc.logFor(ctx, r.parts[1]) || {}).id;
          if (id && (await ui.confirm('Удалить отметку?', 'Удалить'))) {
            PS().removeLog(id);
            ui.go('#/training');
          }
        };
    },
  };
})(window.HD);
