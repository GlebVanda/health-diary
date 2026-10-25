// Экран «Начать тренировку»: упражнения отмечаются галочкой, для каждого спрашивается ощущение, вес можно поправить.
// Ход тренировки хранится на устройстве, поэтому перезагрузка страницы ничего не стирает. По завершении запись
// уходит в журнал, а веса и ощущения запоминаются для подбора нагрузки в следующий раз.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const P = HD.progress;
  const { esc, num } = HD.util;
  const W = () => HD.svc.workout;

  const FEEL_DOT = { easy: '😌', ok: '🙂', hard: '😤', fail: '😣' };

  function feelChips(selected) {
    return `<div class="feels" role="group" aria-label="Как прошло">${P.FEELS.map(([k, l]) => `<button type="button" class="feel ${selected === k ? 'on f-' + k : ''}" data-feel="${k}">${l}</button>`).join('')}</div>`;
  }

  function hintText(sug) {
    if (!sug) return '';
    let t = sug.reason || '';
    if (sug.last && sug.last.weight != null) t += ` · прошлый раз ${num(sug.last.weight, 1)} кг, ${P.FEEL_LABEL[sug.last.feel].toLowerCase()}`;
    return t;
  }

  function exCard(e, d) {
    const weighted = W().isWeightEx(e.exercise_key);
    const reps = (e.sets > 1 || !/мин|с$/.test(e.reps) ? e.sets + ' × ' : '') + e.reps;
    return `<div class="wk-ex ${d.done ? 'done' : ''}" data-ex="${esc(e.exercise_key)}">
      <button type="button" class="wk-check ${d.done ? 'on' : ''}" data-check aria-label="${d.done ? 'Снять отметку' : 'Отметить выполненным'}">${ui.icon('check')}</button>
      <div class="grow">
        <b>${esc(e.name)}</b>
        <div class="small muted">${esc(reps)}</div>
        ${weighted ? `<div class="wk-w"><div class="input-unit"><input class="input" inputmode="decimal" data-weight value="${d.weight == null ? '' : esc(String(d.weight).replace('.', ','))}" placeholder="вес"><span class="unit">кг</span></div></div><div class="tiny muted wk-hint">${esc(hintText(e.suggest))}</div>` : ''}
        ${d.done ? `<div class="tiny wk-ask">Как прошло?</div>${feelChips(d.feel)}` : ''}
      </div>
    </div>`;
  }

  function strengthBody(ctx, s, draft) {
    const ex = HD.svc.suggestedWeights(ctx, s);
    const doneCount = ex.filter((e) => (draft.exercises[e.exercise_key] || {}).done).length;
    return `<div class="wk-ex ${draft.warmup ? 'done' : ''}" data-warmup>
        <button type="button" class="wk-check ${draft.warmup ? 'on' : ''}" data-check aria-label="Разминка">${ui.icon('check')}</button>
        <div class="grow"><b>Разминка</b><div class="small muted">${s.target.warmup_min || 10} мин: суставы, лёгкое кардио, подводящий подход</div></div>
      </div>
      ${ex.map((e) => exCard(e, draft.exercises[e.exercise_key] || { done: false, weight: null, feel: null })).join('')}
      <div class="small muted center" data-count>Выполнено упражнений: ${doneCount} из ${ex.length}</div>`;
  }

  function runBody(ctx, s, draft) {
    const t = s.target;
    const r = draft.run;
    const winter = s.kind === 'run' && HD.recommendations.isWinter(s.date) && (t.location === 'street' || s.moved_to_treadmill);
    return `<div class="card stack">
        <div class="kv small">
          <span>План</span><span>${s.effective_duration || '—'} мин</span>
          ${t.format_label ? `<span>Формат</span><span>${esc(t.format_label)}</span>` : ''}
          <span>Разминка</span><span>${t.warmup_min || 10} мин</span>
        </div>
        ${t.incline === 'incline_blocks' ? '<div class="notice">На дорожке: база наклон 1%, каждые 10 мин блок 3–4 мин на наклоне 6–8%</div>' : ''}
        ${t.is_long && s.effective_duration >= 90 ? '<div class="notice">Длинный бег от 90 минут: вода и 30–60 г углеводов в час</div>' : ''}
        ${winter ? `<button class="btn" data-act="treadmill">${s.moved_to_treadmill ? 'Вернуть на улицу' : '❄ Перенести на дорожку (гололёд, мороз)'}</button>` : ''}
        <div class="grid2">
          ${ui.field('Фактическая длительность', ui.numInput('duration', r.duration, 'мин', 'data-run="duration"'))}
          ${s.kind === 'run' ? ui.field('Дистанция', ui.numInput('distance', r.distance, 'км', 'data-run="distance"')) : '<div></div>'}
        </div>
        <div class="tiny wk-ask">Как прошло?</div>${feelChips(r.feel)}
      </div>`;
  }

  function summary(ctx, s, log) {
    const ex = log.exercises || [];
    return `<section class="card stack">
        <div class="session done"><div class="kind ${s.kind}">${ui.kindIcon(s.kind)}</div><div class="grow"><h2>${esc(s.title)}</h2>
        <div class="small muted">Выполнено ${D.short(log.date, true)}${log.duration_min ? ' · ' + log.duration_min + ' мин' : ''}${log.distance_km ? ' · ' + num(log.distance_km, 1) + ' км' : ''}${log.wellbeing != null ? ' · самочувствие ' + log.wellbeing + '/10' : ''}</div></div></div>
        ${log.feel ? `<div>Общее ощущение: <span class="badge ${log.feel === 'easy' ? 'good' : log.feel === 'hard' ? 'warn' : log.feel === 'fail' ? 'danger' : ''}">${esc(P.FEEL_LABEL[log.feel])}</span></div>` : ''}
        ${ex.length ? `<table class="ex-table">${ex.map((e) => `<tr><td>${e.done ? '✓' : '—'} ${esc(e.name)}</td><td>${e.done ? `${e.weight_kg != null ? num(e.weight_kg, 1) + ' кг · ' : ''}${esc(P.FEEL_LABEL[e.feel] || '')}` : 'не делал(а)'}</td></tr>`).join('')}</table>` : ''}
        ${log.note ? `<div class="small muted">${esc(log.note)}</div>` : ''}
        <div class="grid2"><a class="btn" href="#/training">К тренировкам</a><a class="btn" href="#/training/s/${s.id}">Изменить отметку</a></div>
      </section>`;
  }

  function body(ctx, r) {
    const s = ctx.sessions.find((x) => x.id === r.parts[0]);
    if (!s) return '<div class="notice warn">Тренировка не найдена (возможно, план пересобран).</div><a class="btn" style="margin-top:12px" href="#/training">К тренировкам</a>';
    const log = HD.svc.logFor(ctx, s.id);
    if (log && log.done) return summary(ctx, s, log);
    if (log && !log.done) {
      return `<div class="notice">Эта тренировка отмечена как пропущенная.</div><button class="btn primary block" style="margin-top:12px" data-act="reopen">Всё-таки выполнить</button><a class="btn block" style="margin-top:8px" href="#/training">К тренировкам</a>`;
    }
    const inProgress = !!W().loadDraft(s.id);
    if (!W().isStartable(ctx, s) && !inProgress) {
      return `<div class="notice warn">Начать тренировку можно в день, на который она назначена, или на следующий день, если она не выполнена. Для других дат есть ручная отметка.</div>
        <div class="grid2" style="margin-top:12px"><a class="btn" href="#/training">К тренировкам</a><a class="btn" href="#/training/s/${s.id}">Отметить вручную</a></div>`;
    }
    const draft = W().draftFor(ctx, s);
    const overdue = s.date !== ctx.today;
    return `<section class="card">
        <div class="session"><div class="kind ${s.kind}">${ui.kindIcon(s.kind)}</div><div class="grow"><h2>${esc(s.title)}</h2>
          <div class="small muted">${HD.plan.PHASES[s.phase] ? esc(HD.plan.PHASES[s.phase]) + ' · ' : ''}${s.is_deload ? 'разгрузка · ' : ''}${s.effective_duration || '—'} мин</div></div>
          <div class="wk-timer" data-timer title="Время с начала">0:00</div></div>
        ${overdue ? `<div class="notice warn" style="margin-top:10px">Тренировка была назначена на ${D.short(s.date)} и не выполнена: её можно сделать сегодня.</div>` : ''}
        ${s.notes && s.notes.length ? `<div class="notice" style="margin-top:10px">${s.notes.map(esc).join('<br>')}</div>` : ''}
      </section>
      <div class="stack" style="margin-top:12px">${s.kind === 'strength' ? strengthBody(ctx, s, draft) : runBody(ctx, s, draft)}</div>
      <div class="wk-bar"><button class="btn ghost danger" data-act="skip">Пропустить</button><button class="btn primary grow" data-act="finish">Завершить тренировку</button></div>`;
  }

  function elapsedText(draft) {
    const ms = Math.max(0, Date.now() - Date.parse(draft.started_at));
    const m = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }

  ui.views.workout = {
    title: 'Тренировка',
    back: () => '#/training',
    render(ctx, r) {
      return body(ctx, r);
    },
    bind(root, ctx, r) {
      const s = ctx.sessions.find((x) => x.id === r.parts[0]);
      if (!s) return;
      const reopen = root.querySelector('[data-act="reopen"]');
      if (reopen)
        reopen.onclick = () => {
          const log = HD.svc.logFor(ctx, s.id);
          if (log) HD.svc.plan.removeLog(log.id);
          ui.render();
        };
      if (!root.querySelector('[data-act="finish"]')) return;

      const draft = W().draftFor(ctx, s);
      const save = () => W().saveDraft(s.id, draft);
      const repaint = () => {
        root.innerHTML = body(ctx, r);
        wire();
      };

      // Таймер: обновляется, пока экран открыт
      const tick = () => {
        const el = root.querySelector('[data-timer]');
        if (!el || !document.body.contains(root)) return clearInterval(timer);
        el.textContent = elapsedText(draft);
      };
      const timer = setInterval(tick, 1000);

      function wire() {
        tick();
        root.querySelectorAll('.wk-ex').forEach((card) => {
          const key = card.dataset.ex;
          const chk = card.querySelector('[data-check]');
          chk.onclick = () => {
            if (card.hasAttribute('data-warmup')) draft.warmup = !draft.warmup;
            else draft.exercises[key].done = !draft.exercises[key].done;
            save();
            repaint();
          };
          const w = card.querySelector('[data-weight]');
          if (w)
            w.oninput = () => {
              draft.exercises[key].weight = w.value;
              save();
            };
          card.querySelectorAll('[data-feel]').forEach(
            (b) =>
              (b.onclick = () => {
                draft.exercises[key].feel = b.dataset.feel;
                save();
                repaint();
              }),
          );
        });
        // бег, кардио и другое: длительность, дистанция, ощущение
        root.querySelectorAll('[data-run]').forEach((inp) => (inp.oninput = () => ((draft.run[inp.dataset.run] = inp.value), save())));
        if (s.kind !== 'strength')
          root.querySelectorAll('[data-feel]').forEach(
            (b) =>
              (b.onclick = () => {
                draft.run.feel = b.dataset.feel;
                save();
                repaint();
              }),
          );
        const tm = root.querySelector('[data-act="treadmill"]');
        if (tm)
          tm.onclick = () => {
            HD.svc.plan.moveToTreadmill(s.id, !s.moved_to_treadmill);
            ui.render();
          };
        root.querySelector('[data-act="skip"]').onclick = async () => {
          if (!(await ui.confirm('Пропустить эту тренировку? Она будет отмечена как невыполненная.', 'Пропустить'))) return;
          clearInterval(timer);
          W().skip(ctx, s);
          ui.toast('Тренировка пропущена');
          ui.go('#/home');
        };
        root.querySelector('[data-act="finish"]').onclick = () => finishSheet();
      }

      function finishSheet() {
        const isStrength = s.kind === 'strength';
        const doneCount = isStrength ? Object.values(draft.exercises).filter((e) => e.done).length : 1;
        const elapsed = Math.max(1, Math.round((Date.now() - Date.parse(draft.started_at)) / 60000));
        ui.sheet(
          `<h2>Как прошла тренировка?</h2>
          ${isStrength && !doneCount ? '<div class="notice warn" style="margin-top:10px">Ни одно упражнение не отмечено: тренировка сохранится как невыполненная.</div>' : ''}
          <form class="stack" style="margin-top:12px">
            <label class="field"><span>Самочувствие: <b data-wb>7</b> из 10</span><input type="range" min="1" max="10" name="wellbeing" value="7"></label>
            ${isStrength ? ui.field('Длительность', ui.numInput('duration_min', elapsed, 'мин')) : ''}
            ${ui.field('Заметка', '<input class="input" name="note" placeholder="необязательно">')}
            <div class="grid2"><button type="button" class="btn" data-cancel>Назад</button><button class="btn primary">Сохранить</button></div>
          </form>`,
          (el, close) => {
            const range = el.querySelector('[name="wellbeing"]');
            range.oninput = () => (el.querySelector('[data-wb]').textContent = range.value);
            el.querySelector('[data-cancel]').onclick = close;
            el.querySelector('form').onsubmit = (e) => {
              e.preventDefault();
              const v = ui.formData(e.target);
              clearInterval(timer);
              const { changes } = W().finish(ctx, s, draft, { wellbeing: v.wellbeing, duration_min: v.duration_min, note: v.note });
              close();
              if (changes.length) ui.showChanges(changes);
              else ui.toast('Тренировка сохранена. Веса и ощущения запомнены');
              ui.go('#/workout/' + s.id);
            };
          },
        );
      }

      wire();
    },
  };
})(window.HD);
