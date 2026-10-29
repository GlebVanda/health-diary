// «Профиль»: меню (цели, анкета, тело, события, импорт, настройки, смена профиля) и личные данные.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const { esc, num } = HD.util;

  const ACTIVITY = [
    ['1.2', '1,2 — сидячий образ жизни'],
    ['1.375', '1,375 — лёгкая активность'],
    ['1.55', '1,55 — умеренная'],
    ['1.725', '1,725 — высокая'],
    ['1.9', '1,9 — очень высокая'],
  ];

  function menu(ctx) {
    const age = HD.svc.age(ctx);
    const a = ctx.assessment;
    const items = [
      ['#/profile/me', 'user', 'Личные данные', `${ctx.profile.sex === 'm' ? 'мужчина' : ctx.profile.sex === 'f' ? 'женщина' : ''}${age != null ? ', ' + age + ' лет' : ''}${ctx.profile.height_cm ? ', ' + ctx.profile.height_cm + ' см' : ''}`],
      ['#/onboard', 'check', 'Оценка подготовки', a ? `${a.overall.level.label} · выносливость: ${a.cardio.level.label.toLowerCase()}, сила: ${a.strength.level.label.toLowerCase()}` : 'не пройдена'],
      ['#/goals', 'target', 'Цели', ctx.main ? ctx.main.title + (ctx.secondaries.length ? ` + ещё ${ctx.secondaries.length}` : '') : 'не заданы'],
      ['#/wizard', 'list', 'Расписание и оборудование', ctx.prefs ? 'обновлено ' + D.short(ctx.prefs.valid_from, true) : 'не заполнено'],
      ['#/body', 'scale', 'Тело и фото', ctx.currentWeight ? num(ctx.currentWeight, 1) + ' кг' : 'вес, объёмы, фото'],
      ['#/streak', 'run', 'Серия бега 22 дня', HD.svc.streak.active(ctx.profileId) ? 'чек-ин и результаты' : 'подключить: 1–22 ноября'],
      ['#/events', 'cal', 'События', 'старты, чек-апы'],
      ['#/import', 'upload', 'Импорт из Excel', 'калории, тренировки и вес из таблицы'],
      ['#/settings', 'cog', 'Настройки', 'тема, PIN, ИИ, копия данных'],
    ];
    return `${a && a.flags.some((f) => f.severity === 'danger') ? `<div class="notice danger" style="margin-bottom:12px">${esc(a.flags.find((f) => f.severity === 'danger').text)}</div>` : ''}<section class="card menu">${items.map(([h, ic, t, s]) => `<a href="${h}"><span class="icon-btn" style="border:0;background:var(--surface-2)">${ui.icon(ic)}</span><span class="grow"><b>${t}</b><div class="small muted">${esc(s)}</div></span><span class="chev">${ui.icon('right', 'width="18" height="18"')}</span></a>`).join('')}</section>
      <button class="btn block" style="margin-top:12px" data-act="switch">Профили: сменить или добавить</button>`;
  }

  function me(ctx) {
    const p = ctx.profile;
    return `<form class="card stack" data-form="me">
      ${ui.field('Имя', `<input class="input" name="name" value="${esc(p.name)}">`)}
      ${ui.field('Пол', `<select class="input" name="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Мужчина</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Женщина</option></select>`)}
      ${ui.field('Дата рождения', `<input class="input" type="date" name="birth_date" value="${p.birth_date || ''}">`)}
      ${ui.field('Рост', ui.numInput('height_cm', p.height_cm, 'см'))}
      ${ui.field('Активность вне тренировок (если плана нет)', `<select class="input" name="activity_level"><option value="">не указано</option>${ACTIVITY.map(([v, l]) => `<option value="${v}" ${String(p.activity_level) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      <div class="tiny muted">При наличии плана коэффициент активности берётся из числа тренировок: 1,375 при 1–3 в неделю, 1,55 при 4–5.</div>
      ${ui.field('Часовой пояс', `<input class="input" name="timezone" value="${esc(p.timezone || 'Europe/Moscow')}">`)}
      <button class="btn primary block">Сохранить</button>
    </form>`;
  }

  ui.views.profile = {
    title: (ctx, r) => (r.parts[0] === 'me' ? 'Личные данные' : 'Профиль'),
    render(ctx, r) {
      this.back = r.parts[0] ? () => '#/profile' : null;
      return r.parts[0] === 'me' ? me(ctx) : menu(ctx);
    },
    bind(root, ctx) {
      const sw = root.querySelector('[data-act="switch"]');
      if (sw) sw.onclick = () => ui.switchProfileSheet();
      const f = root.querySelector('[data-form="me"]');
      if (f)
        f.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(f);
          const hadData = ctx.profile.birth_date && ctx.profile.height_cm;
          HD.db.update('profiles', ctx.profileId, {
            name: v.name.trim() || ctx.profile.name,
            sex: v.sex,
            birth_date: v.birth_date || null,
            height_cm: ui.numOrNull(v.height_cm),
            activity_level: v.activity_level ? Number(v.activity_level) : null,
            timezone: v.timezone || 'Europe/Moscow',
          });
          // Первое заполнение возраста и роста: автонорма включается с ближайшего понедельника
          let msg = 'Сохранено';
          const nctx = HD.svc.ctx(ctx.profileId);
          const last = nctx.targets[nctx.targets.length - 1];
          if (!hadData && v.birth_date && v.height_cm && last && last.source === 'xlsx') {
            const t = HD.svc.nutrition.revertAuto(ctx.profileId, false);
            if (t) msg = `Автонорма включится с ${D.short(t.valid_from)}: ${num(t.daily_kcal)} ккал`;
          } else {
            const res = HD.svc.nutrition.recalc(ctx.profileId, 'Изменились личные данные');
            if (res.target && !res.unchanged) msg = `Норма с ${D.short(res.target.valid_from)}: ${num(res.target.daily_kcal)} ккал`;
          }
          ui.toast(msg);
          ui.go('#/profile');
        };
    },
  };

  // События (старт, чек-ап)
  ui.views.events = {
    title: 'События',
    back: () => '#/profile',
    render(ctx) {
      const goals = ctx.goals.filter((g) => g.status === 'active');
      return `<form class="card stack" data-form="event">
          <h2>Новое событие</h2>
          ${ui.field('Название', `<input class="input" name="title" required placeholder="Например: старт трейла">`)}
          <div class="grid2">${ui.field('Дата', `<input class="input" type="date" name="date" required value="${ctx.today}">`)}${ui.field('Тип', `<select class="input" name="kind"><option value="race">Старт</option><option value="checkup">Чек-ап</option><option value="other">Другое</option></select>`)}</div>
          ${ui.field('Связано с целью', `<select class="input" name="goal_id"><option value="">—</option>${goals.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select>`)}
          <button class="btn primary block">Добавить</button>
        </form>
        <section class="card" style="margin-top:12px"><ul class="list">${ctx.events
          .slice()
          .reverse()
          .map((e) => `<li><span class="grow">${esc(e.title)}<div class="tiny muted">${D.short(e.date, true)}</div></span><button class="icon-btn" data-del="${e.id}">${ui.icon('close')}</button></li>`)
          .join('') || '<li class="muted">Событий нет</li>'}</ul></section>`;
    },
    bind(root, ctx) {
      const f = root.querySelector('[data-form="event"]');
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = ui.formData(f);
        HD.db.insert('events', { profile_id: ctx.profileId, title: v.title, date: v.date, kind: v.kind, goal_id: v.goal_id || null });
        ui.render();
      };
      root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => (await ui.confirm('Удалить событие?', 'Удалить')) && (HD.db.remove('events', b.dataset.del), ui.render())));
    },
  };
})(window.HD);
