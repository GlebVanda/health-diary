// Блок «Питание» (раздел 5.3 ТЗ): день, неделя как в таблице, норма с историей и ручным переопределением.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const { esc, num } = HD.util;
  const NS = () => HD.svc.nutrition;

  function tabs(active, ctx) {
    const t = [
      ['day', 'День', '#/food/day/' + ctx.today],
      ['week', 'Неделя', '#/food/week/' + D.monday(ctx.today)],
      ['target', 'Норма', '#/food/target'],
    ];
    return `<div class="seg" style="margin-bottom:12px">${t.map(([k, l, h]) => `<button data-href="${h}" class="${k === active ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }

  function dayView(ctx, date) {
    const f = ctx.foodByDate.get(date) || {};
    const week = NS().week(ctx, D.monday(date));
    const norm = week && week.hasTarget ? week.dayNorm : null;
    const t = NS().targetFor(ctx, date);
    const color = HD.nutrition.dayColor(f.kcal, norm);
    const hasMacros = f.protein_g != null || f.fat_g != null || f.carbs_g != null;
    const isToday = date === ctx.today;
    return `${tabs('day', ctx)}
      <div class="row between" style="margin-bottom:10px">
        <a class="icon-btn" href="#/food/day/${D.addDays(date, -1)}">${ui.icon('left')}</a>
        <div class="center"><b>${isToday ? 'Сегодня' : D.WEEKDAYS_FULL[D.dow(date)]}</b><div class="small muted">${D.short(date, true)}</div></div>
        <a class="icon-btn" href="#/food/day/${D.addDays(date, 1)}">${ui.icon('right')}</a>
      </div>
      <form class="card stack" data-form="day">
        <label class="field"><span>Калории за день</span>
          <input class="input huge k-${color}" name="kcal" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${f.kcal != null ? f.kcal : ''}" autofocus></label>
        <div class="grid2 small">
          <div><span class="muted">Норма дня</span><br><b class="num">${norm ? num(norm) : '—'} ккал</b></div>
          <div><span class="muted">Можно в день до конца недели</span><br><b class="num">${week && week.perDayLeft != null ? num(week.perDayLeft) : '—'} ккал</b></div>
        </div>
        <details ${hasMacros ? 'open' : ''}>
          <summary class="small" style="cursor:pointer;padding:6px 0">Белки, жиры, углеводы (необязательно)</summary>
          <div class="grid3" style="margin-top:8px">
            ${ui.field('Белки' + (t && t.protein_g ? ' / ' + t.protein_g : ''), ui.numInput('protein_g', f.protein_g, 'г'))}
            ${ui.field('Жиры' + (t && t.fat_g ? ' / ' + t.fat_g : ''), ui.numInput('fat_g', f.fat_g, 'г'))}
            ${ui.field('Углеводы' + (t && t.carbs_g ? ' / ' + t.carbs_g : ''), ui.numInput('carbs_g', f.carbs_g, 'г'))}
          </div>
        </details>
        ${ui.field('Заметка', `<input class="input" name="note" value="${esc(f.note || '')}" placeholder="Например: праздник">`)}
        <button class="btn primary block">Сохранить</button>
      </form>`;
  }

  function weekView(ctx, monday) {
    const w = NS().week(ctx, monday);
    const tr = NS().trainingsFor(ctx, monday);
    const rows = D.weekDays(monday)
      .map((d, i) => {
        const f = ctx.foodByDate.get(d);
        const k = f && f.kcal != null ? Number(f.kcal) : null;
        const color = HD.nutrition.dayColor(k, w && w.dayNorm);
        const trained = ctx.logs.some((l) => l.date === d && l.done);
        const planned = ctx.sessions.some((s) => s.date === d);
        return `<tr class="${d === ctx.today ? 'today' : ''}">
          <td>${D.WEEKDAYS[i]} <span class="muted small">${D.dm(d)}</span></td>
          <td class="muted">${w && w.hasTarget ? num(w.dayNorm) : '—'}</td>
          <td class="kcal k-${color}" data-day="${d}">${k != null ? num(k) : '+'}</td>
          <td class="center">${trained ? '✓' : planned ? '<span class="muted">·</span>' : ''}</td>
        </tr>`;
      })
      .join('');
    const has = w && w.hasTarget;
    return `${tabs('week', ctx)}
      <div class="row between" style="margin-bottom:10px">
        <a class="icon-btn" href="#/food/week/${D.addDays(monday, -7)}">${ui.icon('left')}</a>
        <div class="center"><b>${D.weekLabel(monday)}</b>${has ? `<div class="small">${w.counted ? '<span class="badge good">Неделя засчитана ✓</span>' : '<span class="badge">не засчитана</span>'}</div>` : ''}</div>
        <a class="icon-btn" href="#/food/week/${D.addDays(monday, 7)}">${ui.icon('right')}</a>
      </div>
      <div class="card" data-swipe>
        <table class="weekgrid">
          <thead><tr><th>День</th><th>Норма</th><th>Факт</th><th class="center">Трен.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="tiny muted" style="margin-top:8px">Нажмите на ячейку факта, чтобы изменить. Листайте недели стрелками или свайпом.</div>
      </div>
      ${has
        ? `<div class="card" style="margin-top:12px"><div class="kv">
          <span>Базовый бюджет (норма × 7)</span><span class="num">${num(w.base)}</span>
          <span>Перенос перебора прошлой недели</span><span class="num ${w.deduction ? 'k-over' : ''}">${w.deduction ? '−' + num(w.deduction) : '0'}${w.overage > w.deduction ? ` <span class="muted tiny">(из ${num(w.overage)}, ограничение)</span>` : ''}</span>
          <span>Бюджет недели</span><span class="num">${num(w.budget)}</span>
          <span>Съедено</span><span class="num">${num(w.eaten)}</span>
          <span>Остаток</span><span class="num ${w.remaining < 0 ? 'k-over' : 'k-good'}">${num(w.remaining)}</span>
          <span>Можно в день до конца недели</span><span class="num">${w.perDayLeft != null ? num(w.perDayLeft) : '—'}</span>
          <span>Среднее в день</span><span class="num">${w.avg != null ? num(w.avg) : '—'}</span>
          <span>Заполнено дней</span><span class="num">${w.filled} / 7</span>
          <span>Тренировок сделано / по плану</span><span class="num">${tr.done} / ${tr.planned}</span>
        </div></div>`
        : '<div class="notice warn" style="margin-top:12px">На эту неделю нет нормы. Задайте её на вкладке «Норма».</div>'}`;
  }

  function targetView(ctx) {
    const cur = NS().targetFor(ctx, ctx.today);
    const next = NS().targetFor(ctx, D.nextMonday(ctx.today));
    const auto = NS().autoTarget(ctx);
    const det = auto.details || {};
    const manual = cur && cur.source !== 'auto';
    const hist = ctx.targets.slice().reverse();
    const SRC = { auto: 'авто', manual: 'вручную', xlsx: 'из Excel' };
    return `${tabs('target', ctx)}
      <section class="card">
        <div class="card-head"><h2>Норма сейчас</h2>${cur ? `<span class="badge ${manual ? 'warn' : 'accent'}">${SRC[cur.source]}</span>` : ''}</div>
        ${cur ? `<div class="big num">${num(cur.daily_kcal)} <span class="small muted">ккал/день</span></div>
          <div class="small muted">${cur.protein_g ? `Б ${cur.protein_g} г · Ж ${cur.fat_g} г · У ${cur.carbs_g} г · ` : ''}действует с ${D.short(cur.valid_from, true)}</div>` : '<div class="muted">Норма ещё не задана</div>'}
        ${next && cur && next.id !== cur.id ? `<div class="notice" style="margin-top:10px">С понедельника ${D.short(next.valid_from)}: <b>${num(next.daily_kcal)}</b> ккал (${esc((next.calc_details && next.calc_details.reason) || SRC[next.source])})</div>` : ''}
      </section>
      <section class="card" style="margin-top:12px">
        <h2>Автоматический расчёт</h2>
        ${auto.daily_kcal
          ? `<div class="kv small" style="margin-top:8px">
            <span>Базовый обмен (Миффлин–Сан Жеор)</span><span>${num(det.bmr)} ккал</span>
            <span>Коэффициент активности (${num(det.sessions_per_week, 1)} трен./нед)</span><span>× ${det.activity_factor}</span>
            <span>Расход</span><span>${num(det.tdee)} ккал</span>
            ${det.deficit ? `<span>Дефицит (темп ${num(det.pace_kg_week, 2)} кг/нед)</span><span>−${num(det.deficit)} ккал</span>` : ''}
            ${det.surplus_pct ? `<span>Профицит</span><span>+${Math.round(det.surplus_pct * 100)}%</span>` : ''}
            <span>Нижняя граница</span><span>${num(det.floor)} ккал${det.floor_applied ? ' (применена)' : ''}</span>
            <span><b>Норма</b></span><span><b>${num(auto.daily_kcal)} ккал</b></span>
            <span>Белки / жиры / углеводы</span><span>${auto.protein_g} / ${auto.fat_g} / ${auto.carbs_g} г</span>
          </div>
          ${manual ? `<div class="notice warn" style="margin-top:10px">Сейчас действует ручная норма; авторасчёт показан как подсказка.</div><div class="grid2" style="margin-top:10px"><button class="btn" data-act="auto-next">Вернуть авто с пн</button><button class="btn" data-act="auto-now">Вернуть авто сейчас</button></div>` : ''}`
          : `<div class="notice warn" style="margin-top:8px">${esc(det.error || 'Недостаточно данных')}: заполните <a href="#/profile/me">профиль</a> и <a href="#/body">вес</a>.</div>`}
      </section>
      <form class="card stack" style="margin-top:12px" data-form="manual">
        <h2>Своя норма</h2>
        ${ui.field('Ккал в день', ui.numInput('daily_kcal', manual ? cur.daily_kcal : '', 'ккал', 'required'))}
        <div class="grid3">${ui.field('Белки', ui.numInput('protein_g', manual ? cur.protein_g : '', 'г'))}${ui.field('Жиры', ui.numInput('fat_g', manual ? cur.fat_g : '', 'г'))}${ui.field('Углеводы', ui.numInput('carbs_g', manual ? cur.carbs_g : '', 'г'))}</div>
        <label class="check"><input type="checkbox" name="apply_now"> Применить к текущей неделе (иначе — с понедельника)</label>
        ${ui.field('Ограничение переноса перебора, % базового бюджета', ui.numInput('cap', Math.round((ctx.profile.carry_cap_pct == null ? 0.15 : ctx.profile.carry_cap_pct) * 100), '%'))}
        <button class="btn primary">Сохранить</button>
      </form>
      <section class="card" style="margin-top:12px">
        <h2>История нормы</h2>
        <ul class="list">${hist.map((t) => `<li><span class="grow">с ${D.short(t.valid_from, true)} <span class="badge">${SRC[t.source]}</span><div class="tiny muted">${esc((t.calc_details && t.calc_details.reason) || '')}</div></span><b class="num">${num(t.daily_kcal)}</b></li>`).join('') || '<li class="muted">Пусто</li>'}</ul>
      </section>`;
  }

  function editDaySheet(ctx, date) {
    const f = ctx.foodByDate.get(date) || {};
    ui.sheet(
      `<h2>${D.WEEKDAYS_FULL[D.dow(date)]}, ${D.short(date, true)}</h2>
      <form class="stack" style="margin-top:12px"><input class="input huge" name="kcal" inputmode="numeric" pattern="[0-9]*" value="${f.kcal != null ? f.kcal : ''}" placeholder="ккал" autofocus>
      <div class="grid2"><a class="btn" href="#/food/day/${date}">Подробнее</a><button class="btn primary">Сохранить</button></div></form>`,
      (el, close) => {
        el.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          NS().saveFood(ctx.profileId, date, Object.assign({}, f, { kcal: ui.numOrNull(e.target.kcal.value) }));
          close();
          ui.render();
        };
        el.querySelector('a').onclick = close;
      },
    );
  }

  ui.views.food = {
    title: 'Питание',
    render(ctx, r) {
      const [mode, arg] = r.parts;
      if (mode === 'week') return weekView(ctx, D.monday(arg && D.isValid(arg) ? arg : ctx.today));
      if (mode === 'target') return targetView(ctx);
      return dayView(ctx, arg && D.isValid(arg) ? arg : ctx.today);
    },
    bind(root, ctx, r) {
      root.querySelectorAll('[data-href]').forEach((b) => (b.onclick = () => ui.go(b.dataset.href)));
      const day = root.querySelector('[data-form="day"]');
      if (day) {
        const date = r.parts[1] && D.isValid(r.parts[1]) ? r.parts[1] : ctx.today;
        day.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(day);
          NS().saveFood(ctx.profileId, date, { kcal: ui.numOrNull(v.kcal), protein_g: ui.numOrNull(v.protein_g), fat_g: ui.numOrNull(v.fat_g), carbs_g: ui.numOrNull(v.carbs_g), note: v.note });
          ui.toast('Сохранено');
          ui.render();
        };
      }
      root.querySelectorAll('[data-day]').forEach((td) => (td.onclick = () => editDaySheet(ctx, td.dataset.day)));
      const sw = root.querySelector('[data-swipe]');
      if (sw) {
        const monday = D.monday(r.parts[1] && D.isValid(r.parts[1]) ? r.parts[1] : ctx.today);
        ui.onSwipe(sw, () => ui.go('#/food/week/' + D.addDays(monday, 7)), () => ui.go('#/food/week/' + D.addDays(monday, -7)));
      }
      const man = root.querySelector('[data-form="manual"]');
      if (man) {
        man.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(man);
          const cap = ui.numOrNull(v.cap);
          if (cap != null) HD.db.update('profiles', ctx.profileId, { carry_cap_pct: Math.max(0, Math.min(100, cap)) / 100 });
          if (ui.numOrNull(v.daily_kcal)) {
            NS().setManual(ctx.profileId, { daily_kcal: ui.numOrNull(v.daily_kcal), protein_g: ui.numOrNull(v.protein_g), fat_g: ui.numOrNull(v.fat_g), carbs_g: ui.numOrNull(v.carbs_g) }, v.apply_now);
          }
          ui.toast('Норма сохранена');
          ui.render();
        };
      }
      const an = root.querySelector('[data-act="auto-next"]');
      if (an) an.onclick = () => (NS().revertAuto(ctx.profileId, false), ui.toast('Авторасчёт вернётся с понедельника'), ui.render());
      const aw = root.querySelector('[data-act="auto-now"]');
      if (aw) aw.onclick = () => (NS().revertAuto(ctx.profileId, true), ui.toast('Авторасчёт применён к этой неделе'), ui.render());
    },
  };
})(window.HD);
