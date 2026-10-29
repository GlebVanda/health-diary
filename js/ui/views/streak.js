// Экран «Серия бега»: утренний чек-ин → светофор и цель дня → факт пробежки; календарь на 22 дня и контрольные точки.
// Маршруты: #/streak (сегодня) и #/streak/<дата> (любой день серии).
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const S = HD.streak;
  const { esc, num } = HD.util;
  const SV = () => HD.svc.streak;

  const LIGHT = { green: ['Зелёный', 'good'], yellow: ['Жёлтый', 'warn'], red: ['Красный', 'danger'] };
  const SHIN = [
    ['ok', 'Ок'],
    ['discomfort', 'Лёгкий дискомфорт'],
    ['pain', 'Боль'],
  ];
  const kmText = (v) => (v ? num(v, 1) + ' км' : '—');
  const lightDot = (l) => `<span class="lt-dot ${l || 'none'}" aria-hidden="true"></span>`;

  function targetLine(t) {
    if (t.mode === 'stop') return `<b>${esc(t.title)}</b><div class="small">${esc(t.how)}</div>`;
    return `<b>${esc(t.title)}: ${kmText(t.km)}</b><div class="small">${t.pace ? 'Темп ' + esc(t.pace) + '. ' : ''}${esc(t.how)}</div>`;
  }

  function intro() {
    return `<section class="card stack">
      <h2>Серия бега: 22 дня</h2>
      <p class="small muted">С 1 по 22 ноября: каждый день бег или быстрый шаг. Готовый календарь на 22 дня (около 99 км), утренний тест-светофор, лестница отката и контрольные точки роста 8 и 15 ноября.</p>
      <button class="btn primary block" data-act="connect">Подключить серию 1–22 ноября</button>
    </section>`;
  }

  function header(m, d, today) {
    const idx = D.diffDays(m.start, today) + 1;
    const state = today < m.start ? `старт ${D.short(m.start)} (через ${D.diffDays(today, m.start)} дн.)` : today > m.end ? 'серия завершена' : `день ${idx} из ${S.DAYS}`;
    const lv = m.level;
    return `<section class="card stack">
      <div class="card-head"><h2>Серия бега</h2><span class="badge ${lv === 'A' ? 'good' : lv === 'G' ? 'danger' : 'warn'}">${esc(S.LEVEL_NAME[lv])}</span></div>
      <div class="kv small"><span>Сегодня</span><span>${state}</span><span>Серия</span><span><b>${m.streakLen}</b> дн. подряд${m.broken ? ` · прервана ${D.short(m.broken)}` : ''}</span></div>
      <div class="small muted">${esc(S.LEVEL_HINT[lv])}</div>
      ${lv === 'G' ? `<button class="btn" data-act="doctor">Врач разрешил продолжать</button>` : ''}
    </section>`;
  }

  function checkinForm(d, c) {
    const v = c || {};
    const chk = (name, label) => `<label class="check"><input type="checkbox" name="${name}" ${v[name] ? 'checked' : ''}><span>${label}</span></label>`;
    return `<form class="stack" data-form="checkin">
      <label class="field"><span>Боль в голенях при первых шагах с кровати: <b data-pain>${v.pain || 0}</b> из 10</span><input type="range" min="0" max="10" name="pain" value="${v.pain || 0}"></label>
      ${chk('tender', 'Точечная болезненность при нажатии по внутреннему краю большеберцовой кости (3 точки на каждой ноге)')}
      ${chk('hop', 'Боль в голени при 10 прыжках на каждой ноге')}
      ${chk('red_flag', 'Хромота, боль в покое или ночью, отёк')}
      ${chk('fever', 'Температура или простуда ниже шеи')}
      ${chk('heavy', 'Тяжесть в икрах')}
      ${chk('joint', 'Лёгкая боль в колене или ахилле')}
      <div class="grid2">
        ${ui.field('Пульс покоя', ui.numInput('rest_hr', v.rest_hr, 'уд/мин'))}
        ${ui.field('Сон', ui.numInput('sleep_h', v.sleep_h, 'ч'))}
      </div>
      <button class="btn primary block">${c ? 'Обновить чек-ин' : 'Сохранить чек-ин'}</button>
    </form>`;
  }

  function resultForm(d, r) {
    const v = r || {};
    return `<form class="stack" data-form="result">
      <div class="grid2">
        ${ui.field('Дистанция', ui.numInput('km', v.km, 'км'))}
        ${ui.field('Средний темп', `<input class="input" name="pace" inputmode="numeric" placeholder="6:48" value="${esc(v.pace || '')}">`)}
      </div>
      <div class="grid2">
        ${ui.field('Средний пульс', ui.numInput('hr', v.hr, 'уд/мин'))}
        <div class="field"><span>Голени</span><div class="chips" role="group">${SHIN.map(([k, l]) => `<label class="chip ${(v.shin || 'ok') === k ? 'on' : ''}"><input type="radio" name="shin" value="${k}" ${(v.shin || 'ok') === k ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
      </div>
      ${ui.field('Заметка', `<input class="input" name="note" placeholder="необязательно" value="${esc(v.note || '')}">`)}
      <button class="btn primary block">${r ? 'Обновить результат' : 'Записать результат'}</button>
      <div class="tiny muted">День засчитывается от ${S.MIN_KM} км (бег или быстрый шаг).</div>
    </form>`;
  }

  function dayCard(m, d, today) {
    const future = d.date > today;
    const p = d.plan;
    const t = d.target;
    const adjusted = d.checkin && t.mode !== 'plan';
    const lt = d.light && LIGHT[d.light];
    return `<section class="card stack">
      <div class="card-head"><h2>День ${d.n} · ${D.WEEKDAYS[D.dow(d.date)]} ${D.short(d.date)}</h2>${d.done ? '<span class="badge good">засчитан</span>' : ''}</div>
      <div class="notice"><div class="small muted">План по календарю</div><b>${esc(p.label)}: ${kmText(p.km)}</b><div class="small">${esc(p.how)}</div></div>
      ${future ? '<div class="small muted">Чек-ин и результат можно записать в сам день.</div>' : ''}
      ${
        !future
          ? `<div>
              <h3>Утренний чек-ин</h3>
              ${d.checkin && lt ? `<div class="row" style="gap:8px;margin:6px 0">${lightDot(d.light)}<b>${lt[0]} день</b><span class="small muted">${esc(d.reasons.join('; ') || 'без жалоб')}</span></div>` : ''}
              ${d.checkin ? `<details class="small"><summary>Изменить ответы</summary>${checkinForm(d, d.checkin)}</details><button class="btn ghost small" data-act="clear-checkin">Удалить чек-ин</button>` : checkinForm(d, null)}
            </div>`
          : ''
      }
      ${
        d.checkin
          ? `<div class="notice ${t.mode === 'plan' ? 'good' : t.mode === 'stop' || t.mode === 'minimum' ? 'danger' : 'warn'}"><div class="small muted">Цель на ${d.date === today ? 'сегодня' : 'этот день'}${adjusted ? ' (изменена по самочувствию)' : ''}</div>${targetLine(t)}</div>`
          : !future
            ? '<div class="small muted">Пройдите чек-ин: по нему приложение поставит цель на день.</div>'
            : ''
      }
      ${!future && d.checkin ? `<div><h3>Результат пробежки</h3>${resultForm(d, d.result)}${d.result ? '<button class="btn ghost small" data-act="clear-result">Удалить результат</button>' : ''}</div>` : ''}
      ${!future && !d.checkin ? `<div><h3>Результат пробежки</h3>${resultForm(d, d.result)}</div>` : ''}
      <div class="tiny muted">После пробежки 5 минут дома: подъёмы на носки 3 × 15 и подъёмы носков вверх стоя у стены 3 × 15.</div>
    </section>`;
  }

  function calendar(m, selected, today) {
    return `<section class="card"><div class="card-head"><h2>Календарь</h2></div><ul class="list st-cal">${m.days
      .map((d) => {
        const shown = d.checkin ? d.target : d.plan;
        const label = d.checkin ? d.target.title : d.plan.label;
        const res = d.result ? `<span class="badge ${d.done ? 'good' : 'warn'}">${num(d.result.km, 1)} км</span>` : d.date < today ? '<span class="badge danger">нет записи</span>' : '';
        return `<li class="${d.date === selected ? 'sel' : ''}"><a class="row grow" href="#/streak/${d.date}" style="gap:10px">
          ${lightDot(d.light)}
          <span class="st-n">${d.n}</span>
          <span class="grow"><b>${D.WEEKDAYS[D.dow(d.date)]} ${D.dm(d.date)}</b><div class="small muted">${esc(label)} · ${kmText(shown.km)}</div></span>${res}</a></li>`;
      })
      .join('')}</ul></section>`;
  }

  function checkpointsCard(m) {
    return `<section class="card stack"><div class="card-head"><h2>Контрольные точки</h2></div>
      ${m.checkpoints
        .map((c) => {
          const what = `лёгкие дни +${String(c.easyPlus).replace('.', ',')} км, качественный темп быстрее на 5–10 сек/км${c.longTo ? `, длинная 8 → ${c.longTo} км` : ''}`;
          const st = c.passed === null ? '<span class="badge">ждём</span>' : c.passed ? '<span class="badge good">прогресс</span>' : '<span class="badge warn">без прогресса</span>';
          return `<div><div class="row" style="gap:8px"><b>${D.short(c.date)}</b>${st}</div><div class="small muted">Если за ${D.dm(c.from)}–${D.dm(c.to)} нет красных и не больше одного жёлтого дня: ${esc(what)}.</div>${
            c.passed === false ? `<div class="small">Не выполнено: ${esc(c.reasons.join('; '))}.${c.longTo ? ' Три дня на уровне Б.' : ' Нагрузка остаётся прежней.'}</div>` : c.passed ? '<div class="small">Новая нагрузка уже в календаре.</div>' : ''
          }</div>`;
        })
        .join('')}
      <div class="tiny muted">Потолок: лёгкий день до ${S.EASY_CAP} км, длинная до ${S.LONG_CAP} км, качественный темп не быстрее 6:00.</div>
    </section>`;
  }

  function rules() {
    return `<details class="card"><summary><b>Светофор и лестница отката</b></summary><div class="stack small" style="margin-top:10px">
      <div><b>Зелёный</b>: боль 0–1, нет точечной болезненности, прыжки без боли. Бежим по плану.</div>
      <div><b>Жёлтый</b>: боль 2–3, тяжесть в икрах, пульс покоя выше нормы на 5–9, сон меньше 6 ч, лёгкая боль в колене или ахилле. Качественный день заменяется лёгким бегом 3–4 км в 7:30 и медленнее.</div>
      <div><b>Красный</b>: боль 4 и больше, точечная болезненность кости, боль при прыжках, хромота, температура, пульс покоя выше нормы на 10+ два дня подряд. Не бежим: 3 км быстрым шагом в темпе 9:00.</div>
      <div><b>А → Б</b>: второй жёлтый день за 5 дней или два жёлтых подряд. <b>→ В</b>: красный день. <b>→ Г</b>: красный два дня подряд, боль 5+, боль в покое или ночью.</div>
      <div><b>Вверх</b>: В → Б после 2 зелёных дней подряд, Б → А после 3. Г снимается только после заключения врача.</div>
      <div class="muted">Норма пульса покоя — среднее первых трёх утр.</div></div></details>`;
  }

  ui.views.streak = {
    title: 'Серия бега',
    back: () => '#/home',
    render(ctx, r) {
      const m = SV().model(ctx);
      if (!m) return intro();
      const today = ctx.today;
      const first = m.days[0].date;
      const last = m.days[m.days.length - 1].date;
      let sel = D.isValid(r.parts[0]) ? r.parts[0] : today < first ? first : today > last ? last : today;
      if (sel < first) sel = first;
      if (sel > last) sel = last;
      const d = m.days.find((x) => x.date === sel);
      return `<div class="stack">${header(m, d, today)}${dayCard(m, d, today)}${calendar(m, sel, today)}${checkpointsCard(m)}${rules()}<button class="btn ghost danger block" data-act="disconnect">Отключить серию</button></div>`;
    },
    bind(root, ctx, r) {
      const conn = root.querySelector('[data-act="connect"]');
      if (conn)
        conn.onclick = () => {
          SV().connect(ctx.profileId);
          ui.toast('Серия подключена: событие добавлено в календарь');
          ui.render();
        };
      const st = SV().active(ctx.profileId);
      if (!st) return;
      const m = SV().model(ctx);
      const first = m.days[0].date;
      const last = m.days[m.days.length - 1].date;
      let sel = D.isValid(r.parts[0]) ? r.parts[0] : ctx.today < first ? first : ctx.today > last ? last : ctx.today;
      sel = sel < first ? first : sel > last ? last : sel;
      const forms = root.querySelectorAll('[data-form="checkin"]');
      forms.forEach((f) => {
        const range = f.querySelector('[name="pain"]');
        range.oninput = () => (f.querySelector('[data-pain]').textContent = range.value);
        f.onsubmit = (e) => {
          e.preventDefault();
          SV().saveCheckin(ctx.profileId, st, sel, ui.formData(f));
          const d = SV().model(ctx).days.find((x) => x.date === sel);
          const lt = LIGHT[d.light];
          ui.toast(`${lt[0]} день. Цель: ${d.target.mode === 'stop' ? 'серия остановлена' : kmText(d.target.km)}`);
          ui.render();
        };
      });
      const rf = root.querySelector('[data-form="result"]');
      if (rf) {
        rf.querySelectorAll('.chip input').forEach((i) => (i.onchange = () => rf.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.querySelector('input').checked))));
        rf.onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(rf);
          if (ui.numOrNull(v.km) == null) return ui.toast('Введите дистанцию в километрах');
          const res = SV().saveResult(ctx.profileId, st, sel, v).result;
          ui.toast(res.done ? `Записано: ${num(res.km, 1)} км, день засчитан` : `Записано: ${num(res.km, 1)} км. Меньше ${S.MIN_KM} км день не засчитывается`);
          ui.render();
        };
      }
      const on = (a, fn) => {
        const b = root.querySelector(`[data-act="${a}"]`);
        if (b) b.onclick = fn;
      };
      on('clear-checkin', () => (SV().clearCheckin(ctx.profileId, st, sel), ui.render()));
      on('clear-result', () => (SV().clearResult(ctx.profileId, st, sel), ui.render()));
      on('doctor', async () => {
        if (!(await ui.confirm('Врач разрешил продолжать? Серия вернётся на уровень Б.', 'Да, разрешил'))) return;
        SV().doctorOk(ctx.profileId, st, ctx.today);
        ui.render();
      });
      on('disconnect', async () => {
        if (!(await ui.confirm('Отключить серию? Чек-ины и результаты будут удалены.', 'Отключить'))) return;
        SV().disconnect(ctx.profileId);
        ui.go('#/profile');
      });
    },
  };

  // Карточка на главной: день серии, цель дня, переход к чек-ину
  ui.streakCard = (ctx) => {
    const m = SV().model(ctx);
    if (!m) return '';
    const today = ctx.today;
    if (today < D.addDays(m.start, -3) || today > D.addDays(m.end, 1)) return '';
    const d = m.days.find((x) => x.date === today);
    if (!d) return `<section class="card a-streak"><div class="card-head"><h2>Серия бега</h2><span class="muted small">старт ${D.short(m.start)}</span></div><a class="btn block" href="#/streak">Посмотреть календарь</a></section>`;
    const lt = d.light && LIGHT[d.light];
    const cta = !d.checkin ? ['Утренний чек-ин', 'primary'] : !d.result ? ['Записать пробежку', 'primary'] : ['Подробнее', ''];
    return `<section class="card a-streak">
      <div class="card-head"><h2>Серия бега · день ${d.n} из ${S.DAYS}</h2><span class="badge ${m.level === 'A' ? 'good' : m.level === 'G' ? 'danger' : 'warn'}">${esc(S.LEVEL_NAME[m.level])}</span></div>
      <div class="small">${d.checkin ? targetLine(d.target) : `<b>${esc(d.plan.label)}: ${kmText(d.plan.km)}</b><div class="muted">${esc(d.plan.how)}</div>`}</div>
      ${lt ? `<div class="row" style="gap:6px;margin-top:6px">${lightDot(d.light)}<span class="small">${lt[0]} день${d.done ? ' · засчитан ✓' : ''}</span></div>` : ''}
      <a class="btn ${cta[1]} block" style="margin-top:10px" href="#/streak">${cta[0]}</a>
    </section>`;
  };
})(window.HD);
