// Анкета подготовки — стартовый экран приложения. Пока не заполнена, дальше пройти нельзя.
// Состоит из разделов (domain/fitness.js → SECTIONS): о себе, образ жизни, выносливость, сила, здоровье.
// По ответам считаются уровни выносливости и силы, ИМТ и ограничения, которые учитывают цели и план.
// Эту же анкету можно пройти заново из Профиля — оценка обновится, план пересоберётся.
(function (HD) {
  const ui = HD.ui;
  const F = HD.fitness;
  const { esc, num } = HD.util;

  let draft = null;
  let draftFor = null;
  let step = 0;
  let result = null;
  let firstRun = false;

  const SEV = { danger: 'danger', warn: 'warn', info: 'info', block: 'danger' };

  function ensure(ctx) {
    if (draft && draftFor === ctx.profileId) return;
    draft = HD.svc.onboarding.prefill(ctx);
    draft.lifts = Object.assign({}, draft.lifts || {});
    draftFor = ctx.profileId;
    step = 0;
    result = null;
  }

  function visible(section) {
    return section.questions.filter((q) => !q.onlySex || q.onlySex === draft.sex);
  }

  function field(q) {
    const v = draft[q.key];
    const req = q.required ? ' *' : '';
    switch (q.type) {
      case 'text':
        return ui.field(q.label + req, `<input class="input" data-q="${q.key}" value="${esc(v || '')}" autocomplete="off">`);
      case 'date':
        return ui.field(q.label + req, `<input class="input" type="date" data-q="${q.key}" value="${v || ''}" max="${HD.dates.today()}">`);
      case 'number':
        return ui.field(q.label + req, `<div class="input-unit"><input class="input" data-q="${q.key}" inputmode="decimal" value="${v == null ? '' : esc(v)}">${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ''}</div>`);
      case 'select':
        return `<div class="field"><span class="small muted">${esc(q.label)}${req}</span><div class="choices" data-choice="${q.key}">${q.options.map(([k, l]) => `<button type="button" class="choice ${v === k ? 'on' : ''}" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>`;
      case 'yesno':
        return `<div class="field"><span class="small muted">${esc(q.label)}${req}</span><div class="choices row2" data-choice="${q.key}"><button type="button" class="choice ${v === 'no' ? 'on' : ''}" data-v="no">Нет</button><button type="button" class="choice ${v === 'yes' ? 'on' : ''}" data-v="yes">Да</button></div></div>`;
      case 'checkbox':
        return `<label class="check"><input type="checkbox" data-q="${q.key}" ${v ? 'checked' : ''}> ${esc(q.label)}</label>`;
      case 'lifts':
        return `<div class="field"><span class="small muted">${esc(q.label)}</span><div class="grid2" style="margin-top:6px">${F.LIFT_KEYS.map((k) => ui.field(HD.exerciseByKey(k).name, `<div class="input-unit"><input class="input" data-lift="${k}" inputmode="decimal" value="${draft.lifts[k] != null ? draft.lifts[k] : ''}"><span class="unit">кг</span></div>`)).join('')}</div></div>`;
    }
    return '';
  }

  // Считать значения полей текущего раздела в черновик
  function collect(root) {
    root.querySelectorAll('[data-q]').forEach((el) => {
      const k = el.dataset.q;
      if (el.type === 'checkbox') draft[k] = el.checked;
      else if (el.inputMode === 'decimal') draft[k] = ui.numOrNull(el.value);
      else draft[k] = el.value || undefined;
    });
    root.querySelectorAll('[data-lift]').forEach((el) => {
      const n = ui.numOrNull(el.value);
      if (n == null) delete draft.lifts[el.dataset.lift];
      else draft.lifts[el.dataset.lift] = n;
    });
  }

  function limitCheck(section) {
    const out = [];
    for (const q of visible(section)) {
      if (q.type === 'number' && draft[q.key] != null && (q.min != null || q.max != null)) {
        if ((q.min != null && draft[q.key] < q.min) || (q.max != null && draft[q.key] > q.max)) out.push(`${q.label}: значение вне допустимых пределов (${q.min}–${q.max})`);
      }
    }
    return out;
  }

  function summary(r) {
    const lv = (x) => `<div class="level"><span class="badge accent">${esc(x.level.label)}</span><div class="small muted" style="margin-top:4px">${esc(x.level.text)}</div></div>`;
    return `<section class="card stack">
      <h2>Ваш уровень</h2>
      <div class="grid2">
        <div><div class="tiny muted">Выносливость</div>${lv(r.cardio)}</div>
        <div><div class="tiny muted">Сила</div>${lv(r.strength)}</div>
      </div>
      <div class="kv small">
        <span>Общий уровень</span><span>${esc(r.overall.level.label)}</span>
        <span>ИМТ</span><span>${r.bmi != null ? num(r.bmi, 1) + ' · ' + esc(r.bmiClass.label) : '—'}</span>
        ${r.age != null ? `<span>Возраст</span><span>${r.age}</span>` : ''}
      </div>
    </section>
    ${r.flags.length
      ? `<section class="stack" style="margin-top:12px">${r.flags.map((f) => `<div class="notice ${SEV[f.severity] === 'danger' ? 'danger' : SEV[f.severity] === 'warn' ? 'warn' : ''}">${esc(f.text)}</div>`).join('')}</section>`
      : '<div class="notice good" style="margin-top:12px">Ограничений по здоровью не выявлено.</div>'}
    <div class="tiny muted" style="margin:10px 2px">План учитывает эту оценку автоматически; изменить её можно, пройдя анкету заново (Профиль → Оценка подготовки).</div>`;
  }

  // Пока показан результат, экран остаётся открытым, даже если следующий шаг настройки уже доступен
  ui.onboardState = { get showingResult() { return !!result; } };

  ui.views.onboard = {
    title: (ctx) => (ctx.onboarding.assessment ? 'Оценка подготовки' : 'О себе и подготовка'),
    back: (ctx) => (ctx.onboarding.done ? '#/profile' : null),
    render(ctx) {
      ensure(ctx);
      const first = result ? firstRun : !ctx.onboarding.assessment;
      if (result) {
        return `${summary(result)}<button class="btn primary block" style="margin-top:12px" data-act="continue">${first ? 'Далее: цели' : 'Готово'}</button>`;
      }
      const sections = F.SECTIONS;
      const sec = sections[step];
      const qs = visible(sec);
      return `<div class="steps">${sections.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        ${first && step === 0 ? '<div class="notice" style="margin-bottom:12px">Без этих данных нельзя рассчитать норму калорий, безопасный темп и нагрузку. Займёт 3–4 минуты.</div>' : ''}
        <div class="small muted" style="margin-bottom:8px">Раздел ${step + 1} из ${sections.length}</div>
        <form class="card stack" data-form="asm">
          <h2>${esc(sec.title)}</h2>
          <div class="small muted">${esc(sec.hint)}</div>
          ${qs.map(field).join('')}
          <div class="small k-over hidden" data-err></div>
        </form>
        <div class="grid2" style="margin-top:12px">
          <button class="btn" data-act="prev" ${step === 0 ? 'disabled' : ''}>Назад</button>
          <button class="btn primary" data-act="next">${step === sections.length - 1 ? 'Рассчитать' : 'Далее'}</button>
        </div>`;
    },
    bind(root, ctx) {
      const form = root.querySelector('[data-form="asm"]');
      const cont = root.querySelector('[data-act="continue"]');
      if (cont) {
        cont.onclick = () => {
          const wasFirst = firstRun;
          result = null;
          draft = null;
          ui.go(wasFirst ? '#/goals' : '#/profile');
        };
        return;
      }
      form.querySelectorAll('[data-choice]').forEach((box) =>
        box.querySelectorAll('.choice').forEach(
          (b) =>
            (b.onclick = () => {
              draft[box.dataset.choice] = b.dataset.v;
              box.querySelectorAll('.choice').forEach((x) => x.classList.toggle('on', x === b));
              // Пол влияет на набор вопросов (беременность)
              if (box.dataset.choice === 'sex') {
                collect(form);
                ui.render();
              }
            }),
        ),
      );
      const showErr = (lines) => {
        const el = form.querySelector('[data-err]');
        el.innerHTML = lines.map(esc).join('<br>');
        el.classList.toggle('hidden', !lines.length);
        if (lines.length) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      root.querySelector('[data-act="prev"]').onclick = () => (collect(form), step--, ui.render());
      root.querySelector('[data-act="next"]').onclick = () => {
        collect(form);
        const sec = F.SECTIONS[step];
        const miss = F.missing(sec, draft);
        const bad = limitCheck(sec);
        if (miss.length || bad.length) return showErr(['Заполните: ' + miss.join(', ')].filter(() => miss.length).concat(bad));
        if (step < F.SECTIONS.length - 1) {
          step++;
          ui.render();
          window.scrollTo(0, 0);
          return;
        }
        // Последний раздел: считаем оценку и сохраняем
        const wasFirst = !ctx.onboarding.assessment;
        firstRun = wasFirst;
        const answers = HD.util.deepClone(draft);
        if (wasFirst) HD.svc.onboarding.saveAssessment(ctx.profileId, answers);
        else HD.svc.onboarding.reassess(ctx.profileId, answers);
        result = HD.svc.ctx(ctx.profileId).assessment;
        // Показываем результат до перехода: временно разрешаем экран, ctx пересчитан при render
        ui.render();
        window.scrollTo(0, 0);
      };
    },
  };
})(window.HD);
