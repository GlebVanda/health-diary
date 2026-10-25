// Главный экран (раздел 7 ТЗ): где я по цели, что меня ждёт, что сделать сейчас.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const C = HD.charts;
  const { esc, num, pct } = HD.util;
  const NS = () => HD.svc.nutrition;

  const PACE_BADGE = { ahead: 'good', on_track: 'accent', behind: 'warn' };

  function recContext(ctx, ov, week) {
    const main = ov.main;
    let paceWeekAgo = null;
    if (main) {
      const prev = HD.svc.goals.overview(ctx, D.addDays(ctx.today, -7)).main;
      paceWeekAgo = prev ? prev.pace : null;
    }
    return {
      today: ctx.today,
      logs: ctx.logs,
      foodByDate: ctx.foodByDate,
      firstFoodDate: ctx.firstFoodDate,
      week,
      measurements: ctx.measurements,
      sessions: ctx.sessions,
      target: NS().targetFor(ctx, ctx.today),
      main: main ? Object.assign({}, main, { paceWeekAgo }) : null,
      goals: ov.items,
    };
  }

  function dismissedKeys(ctx) {
    return new Set(HD.db.forProfile('recommendations_log', ctx.profileId, (r) => r.dismissed_at).map((r) => r.key));
  }

  function goalHeader(ctx, ov) {
    const m = ov.main;
    if (!m) {
      return `<section class="card a-goal"><h2>Цель не задана</h2><p class="muted small">Добавьте главную цель — от неё зависят норма питания, план тренировок и виджеты.</p><a class="btn primary" href="#/goals/new">Добавить цель</a></section>`;
    }
    const left = m.params.deadline ? D.diffDays(ctx.today, m.params.deadline) : null;
    const secondary = ov.items.filter((i) => i.goal.role === 'secondary');
    return `<section class="card a-goal">
      <div class="row" style="gap:14px">
        ${C.ring(ov.total, 104, null, 'цель')}
        <div class="grow">
          <h2 style="margin-bottom:6px">${esc(m.goal.title)}</h2>
          <div class="row wrap" style="gap:6px">
            ${m.pace ? `<span class="badge ${PACE_BADGE[m.pace]}">${HD.goals.PACE_LABEL[m.pace]}</span>` : ''}
            ${left != null ? `<span class="badge">${left >= 0 ? `${left} ${HD.util.plural(left, 'день', 'дня', 'дней')} до дедлайна` : 'дедлайн прошёл'}</span>` : ''}
          </div>
          <div class="small muted" style="margin-top:6px">${esc(m.strategy.label)}: ${pct(m.pct)}${m.current != null && m.unit ? ` · сейчас ${num(m.current, 1)} ${m.unit}` : ''}</div>
        </div>
      </div>
      ${secondary
        .map(
          (s) => `<div style="margin-top:12px"><div class="row between small"><span>${esc(s.goal.title)}</span><b class="num">${pct(s.pct)}</b></div><div class="bar" style="margin-top:4px"><i style="width:${s.pct || 0}%"></i></div></div>`,
        )
        .join('')}
    </section>`;
  }

  // Быстрый замер веса прямо на главной; объёмы, история и фото — в Профиль → Тело и фото
  function weightRow(ctx) {
    const rows = ctx.measurements.filter((m) => m.weight_kg != null && m.date <= ctx.today);
    const last = rows.length ? rows[rows.length - 1] : null;
    const days = last ? D.diffDays(last.date, ctx.today) : null;
    const stale = days == null || days > 7;
    const today = last && last.date === ctx.today ? last : null;
    return `<div style="height:1px;background:var(--border);margin:14px 0"></div>
      <form class="row" data-form="quick-weight">
        <div class="grow">
          <div class="tiny muted">Вес${last ? ` · последний ${num(last.weight_kg, 1)} кг, ${days === 0 ? 'сегодня' : D.short(last.date)}` : ''}</div>
          <div class="input-unit"><input class="input" name="weight_kg" inputmode="decimal" placeholder="Внести вес" value="${today ? today.weight_kg : ''}"><span class="unit">кг</span></div>
        </div>
        <button class="btn ${stale ? 'primary' : ''}" style="align-self:flex-end">Записать</button>
      </form>
      <div class="small" style="margin-top:6px">${stale ? '<span class="k-under">Пора взвеситься.</span> ' : ''}<a href="#/body">Объёмы, история и фото</a></div>`;
  }

  function todayCard(ctx, week) {
    // Сегодняшние тренировки и вчерашние невыполненные (их можно сделать сегодня)
    const sessions = HD.svc.sessionsForDate(ctx, ctx.today).concat(HD.svc.workout.startable(ctx).filter((x) => x.overdue).map((x) => x.session));
    const unplanned = ctx.logs.filter((l) => l.date === ctx.today && !l.planned_session_id && l.done);
    const food = ctx.foodByDate.get(ctx.today);
    const norm = week && week.hasTarget ? week.dayNorm : null;
    const sessionHtml = sessions.length
      ? sessions
          .map((s) => {
            const log = HD.svc.logFor(ctx, s.id);
            const done = log && log.done;
            const can = HD.svc.workout.isStartable(ctx, s);
            const running = !log && !!HD.svc.workout.loadDraft(s.id);
            const overdue = s.date !== ctx.today;
            const btn = done
              ? `<a class="btn small" href="#/workout/${s.id}">Готово ✓</a>`
              : log
                ? `<a class="btn small" href="#/workout/${s.id}">Пропущена</a>`
                : can
                  ? `<a class="btn small primary" href="#/workout/${s.id}">${running ? 'Продолжить' : 'Начать'}</a>`
                  : `<a class="btn small" href="#/training/s/${s.id}">Отметить</a>`;
            return `<div class="session ${done ? 'done' : ''}"><div class="kind ${s.kind}">${ui.kindIcon(s.kind)}</div>
              <div class="grow"><b>${esc(s.title)}</b>${s.is_deload ? ' <span class="badge info">разгрузка</span>' : ''}${overdue && !log ? ' <span class="badge warn">со вчера</span>' : ''}
              <div class="small muted">${s.effective_duration ? s.effective_duration + ' мин' : ''}${s.target.format_label ? ' · ' + esc(s.target.format_label) : ''}</div></div>
              ${btn}</div>`;
          })
          .join('<div style="height:10px"></div>')
      : `<div class="session"><div class="kind other">${ui.icon('check')}</div><div class="grow"><b>День отдыха</b><div class="small muted">${unplanned.length ? 'Отмечено: ' + unplanned.map((u) => esc(u.title || 'активность')).join(', ') : 'Можно добавить внеплановую активность'}</div></div><a class="btn small" href="#/training/log">+ Активность</a></div>`;
    return `<section class="card a-today">
      <div class="card-head"><h2>Сегодня</h2><span class="muted small">${D.WEEKDAYS_FULL[D.dow(ctx.today)]}, ${D.short(ctx.today)}</span></div>
      ${sessionHtml}
      <div style="height:1px;background:var(--border);margin:14px 0"></div>
      <form class="row" data-form="quick-kcal">
        <div class="grow">
          <div class="tiny muted">Калории · норма ${norm ? num(norm) : '—'}</div>
          <div class="input-unit"><input class="input" name="kcal" inputmode="numeric" pattern="[0-9]*" placeholder="Внести ккал" value="${food && food.kcal != null ? food.kcal : ''}"><span class="unit">ккал</span></div>
        </div>
        <button class="btn primary" style="align-self:flex-end">Сохранить</button>
      </form>
      ${week && week.hasTarget && week.perDayLeft != null ? `<div class="small muted" style="margin-top:6px">Можно в день до конца недели: <b class="num">${num(week.perDayLeft)}</b> ккал</div>` : ''}
      ${weightRow(ctx)}
    </section>`;
  }

  function weekCard(ctx, week) {
    const monday = D.monday(ctx.today);
    const days = D.weekDays(monday);
    const tr = NS().trainingsFor(ctx, monday);
    const plan = ctx.plan;
    const curWeek = plan ? Math.floor(D.diffDays(plan.start_date, ctx.today) / 7) + 1 : null;
    const inPlan = plan && curWeek >= 1 && curWeek <= plan.weeks;
    const phase = inPlan ? HD.plan.phaseOf(plan.phases, curWeek) : null;
    const deload = inPlan && ctx.sessions.some((s) => s.date >= monday && s.date <= days[6] && s.is_deload);
    return `<section class="card a-week">
      <div class="card-head"><h2>Эта неделя</h2>${phase ? `<span class="row" style="gap:6px"><span class="badge accent">${esc(phase.name)}</span>${deload ? '<span class="badge info">разгрузка</span>' : ''}</span>` : ''}</div>
      <div class="grid3">
        <div><div class="tiny muted">Остаток бюджета</div><b class="num ${week && week.remaining < 0 ? 'k-over' : ''}">${week && week.hasTarget ? num(week.remaining) : '—'}</b></div>
        <div><div class="tiny muted">Можно в день</div><b class="num">${week && week.perDayLeft != null ? num(week.perDayLeft) : '—'}</b></div>
        <div><div class="tiny muted">Тренировки</div><b class="num">${tr.done} / ${tr.planned}</b></div>
      </div>
      <div class="dots" style="margin-top:14px">${days
        .map((d, i) => {
          const f = ctx.foodByDate.get(d);
          const t = ctx.logs.some((l) => l.date === d && l.done);
          return `<a class="dot ${d === ctx.today ? 'today' : ''}" href="#/food/day/${d}"><i class="${f && f.kcal != null ? 'food' : ''} ${t ? 'train' : ''}"></i>${D.WEEKDAYS[i]}</a>`;
        })
        .join('')}</div>
      <div class="tiny muted" style="margin-top:8px">Заливка — питание внесено, точка — была тренировка</div>
    </section>`;
  }

  function widgetCard(ctx, ov, period) {
    const m = ov.main;
    const title = m ? ui.widgets.WIDGET_TITLE[m.strategy.widget] : 'Прогресс';
    return `<section class="card a-widget">
      <div class="card-head"><h2>${esc(title)}</h2></div>
      ${ui.widgets.seg('period', period, ui.widgets.PERIODS)}
      <div style="margin-top:10px">${ui.widgets.goalWidget(ctx, m, period)}</div>
    </section>`;
  }

  function eventsCard(ctx, ov) {
    const items = HD.upcoming.upcoming({ today: ctx.today, sessions: ctx.sessions, doneIds: ctx.doneIds, plan: ctx.plan, measurements: ctx.measurements, goals: ov.items, events: ctx.events }, 5);
    return `<section class="card a-events">
      <div class="card-head"><h2>Ближайшие события</h2><a class="small" href="#/events">+ событие</a></div>
      ${items.length ? `<ul class="list">${items
        .map((e) => {
          const left = D.diffDays(ctx.today, e.date);
          const when = left === 0 ? 'сегодня' : left === 1 ? 'завтра' : D.WEEKDAYS[D.dow(e.date)] + ', ' + D.short(e.date);
          const href = e.kind === 'session' ? `#/training/s/${e.ref}` : e.kind === 'weigh' ? '#/body' : null;
          const inner = `<span class="badge" style="min-width:86px;justify-content:center">${when}</span><span class="grow">${esc(e.title)}</span>`;
          return `<li>${href ? `<a class="li-link" href="${href}">${inner}</a>` : inner}</li>`;
        })
        .join('')}</ul>` : '<div class="muted small">На ближайшие 14 дней ничего не запланировано</div>'}
    </section>`;
  }

  function recsCard(ctx, ov, week) {
    const recs = HD.recommendations.evaluate(recContext(ctx, ov, week), dismissedKeys(ctx), 3);
    const ai = HD.ai.getProvider(HD.db.state.settings).enabled;
    return `<section class="card a-recs">
      <div class="card-head"><h2>Рекомендации</h2></div>
      ${recs.length ? `<ul class="list">${recs.map((r) => `<li><span class="grow">${esc(r.text)}</span><button class="icon-btn" data-dismiss="${esc(r.key)}" data-rule="${r.id}" data-text="${esc(r.text)}" title="Скрыть">${ui.icon('close')}</button></li>`).join('')}</ul>` : '<div class="muted small">Всё в порядке, рекомендаций нет</div>'}
      ${ai ? '<div class="notice" id="ai-rec" style="margin-top:10px">Рекомендация недели загружается…</div>' : ''}
    </section>`;
  }

  ui.views.home = {
    title: (ctx) => 'Привет, ' + ctx.profile.name,
    render(ctx, r) {
      const ov = HD.svc.goals.overview(ctx);
      const week = NS().week(ctx, D.monday(ctx.today));
      const period = ui.ls.get('home_period', 'month');
      const onboarding = !ctx.profile.birth_date || !ctx.profile.height_cm ? `<div class="notice warn">Заполните возраст и рост в <a href="#/profile/me">профиле</a> — без них норма калорий не считается автоматически.</div>` : '';
      return `${onboarding ? `<div style="margin-bottom:12px">${onboarding}</div>` : ''}<div class="home">
        ${goalHeader(ctx, ov)}
        ${todayCard(ctx, week)}
        ${weekCard(ctx, week)}
        ${widgetCard(ctx, ov, period)}
        ${eventsCard(ctx, ov)}
        ${recsCard(ctx, ov, week)}
        ${ui.dynamics.render(ctx)}
      </div>`;
    },
    bind(root, ctx) {
      ui.dynamics.bind(root.querySelector('#dyn'), ctx);
      if (ui.ls.get('scroll_to_dyn', false)) {
        ui.ls.del('scroll_to_dyn');
        setTimeout(() => root.querySelector('#dyn').scrollIntoView(), 0);
      }
      const f = root.querySelector('[data-form="quick-kcal"]');
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = ui.numOrNull(f.kcal.value);
        const prev = ctx.foodByDate.get(ctx.today) || {};
        NS().saveFood(ctx.profileId, ctx.today, Object.assign({}, prev, { kcal: v }));
        ui.toast(v == null ? 'Калории за сегодня удалены' : `Сохранено: ${num(v)} ккал`);
        ui.render();
      };
      const wf = root.querySelector('[data-form="quick-weight"]');
      if (wf)
        wf.onsubmit = (e) => {
          e.preventDefault();
          const w = ui.numOrNull(wf.weight_kg.value);
          if (!w || w < 30 || w > 300) return ui.toast('Введите вес в килограммах');
          HD.db.upsert('body_measurements', (m) => m.profile_id === ctx.profileId && m.date === ctx.today, { profile_id: ctx.profileId, date: ctx.today, weight_kg: w });
          const before = NS().targetFor(ctx, D.nextMonday(ctx.today));
          const res = NS().recalc(ctx.profileId, 'Новое взвешивание');
          let msg = `Вес ${num(w, 1)} кг записан`;
          if (res && res.target && !res.unchanged) msg += `. Норма с понедельника: ${before ? num(before.daily_kcal) + ' → ' : ''}${num(res.target.daily_kcal)} ккал`;
          ui.toast(msg);
          ui.render();
        };
      root.querySelectorAll('[data-seg="period"] button').forEach((b) => (b.onclick = () => (ui.ls.set('home_period', b.dataset.v), ui.render())));
      root.querySelectorAll('[data-dismiss]').forEach(
        (b) =>
          (b.onclick = () => {
            HD.db.insert('recommendations_log', { profile_id: ctx.profileId, rule_id: b.dataset.rule, key: b.dataset.dismiss, text: b.dataset.text, dismissed_at: new Date().toISOString() });
            ui.render();
          }),
      );
      const aiBox = root.querySelector('#ai-rec');
      if (aiBox) {
        const key = 'ai_rec:' + ctx.profileId + ':' + D.monday(ctx.today);
        const cached = HD.db.setting(key);
        if (cached) aiBox.textContent = cached;
        else
          HD.ai
            .getProvider(HD.db.state.settings)
            .getRecommendations({ today: ctx.today, goal: ctx.main && ctx.main.title, week: NS().week(ctx, D.monday(ctx.today)) && { remaining: Math.round(NS().week(ctx, D.monday(ctx.today)).remaining || 0) } })
            .then((list) => {
              aiBox.textContent = list[0] || 'ИИ не вернул рекомендацию';
              if (list[0]) HD.db.setting(key, list[0]);
            })
            .catch((e) => (aiBox.textContent = 'ИИ недоступен: ' + e.message));
      }
    },
  };
})(window.HD);
