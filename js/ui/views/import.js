// Импорт истории из Excel: сначала пробный прогон с отчётом, затем запись.
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const { esc, num } = HD.util;
  let report = null;
  let applied = null;

  function reportHtml(r) {
    const c = r.counts;
    return `<section class="card"><h2>Пробный прогон</h2>
      <div class="kv small" style="margin-top:8px">
        <span>Недель</span><span>${c.weeks}</span>
        <span>Дней с калориями</span><span>${c.foodDays}</span>
        <span>Тренировок («Поход в зал»)</span><span>${c.trainings}</span>
        <span>Взвешиваний</span><span>${c.weighIns}</span>
        <span>Пропущенные и подозрительные строки</span><span>${c.suspicious}</span>
      </div></section>
      <section class="card" style="margin-top:12px"><h2>Проверки</h2><ul class="list">${r.checks
        .map((x) => `<li><span class="badge ${x.ok ? 'good' : 'danger'}">${x.ok ? 'ок' : 'нет'}</span><span class="grow small">${esc(x.label)}${x.actual != null ? ` <span class="muted">(${esc(typeof x.actual === 'number' ? num(x.actual) : x.actual)})</span>` : ''}${x.mismatches && x.mismatches.length ? `<div class="tiny muted">${x.mismatches.slice(0, 6).map((m) => `${D.dm(m.monday)}: в таблице ${num(m.sheet)}, в приложении ${num(m.app)}`).join('; ')}</div>` : ''}</span></li>`)
        .join('')}</ul></section>
      ${r.suspicious.length ? `<section class="card" style="margin-top:12px"><h2>Пропущенные и подозрительные строки</h2><ul class="list">${r.suspicious.map((s) => `<li class="small"><span class="badge">стр. ${s.row}</span><span class="grow">${esc(s.reason)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="card" style="margin-top:12px"><h2>Недели</h2><div class="scroll-x"><table class="weekgrid"><thead><tr><th>Неделя</th><th>Бюджет (табл.)</th><th>Дней</th><th>Съедено</th><th>Зал</th></tr></thead><tbody>${r.weeks
        .map((w) => `<tr><td>${D.dm(w.monday)}</td><td>${num(w.budgetCached)}</td><td>${w.kcal.filter((k) => k != null).length}</td><td>${num(w.kcal.reduce((s, k) => s + (k || 0), 0))}</td><td>${w.gym.filter(Boolean).length}</td></tr>`)
        .join('')}</tbody></table></div></section>`;
  }

  ui.views.import = {
    title: 'Импорт из Excel',
    back: () => '#/profile',
    render(ctx) {
      const at = HD.db.setting('xlsx_imported_at:' + ctx.profileId);
      return `<section class="card stack">
          <p class="small">Файл читается только в этом браузере и никуда не отправляется. Данные попадут в текущий профиль. Берутся только лист «${HD.xlsxImport.SHEET}», строки ${HD.xlsxImport.ROW_FROM}–${HD.xlsxImport.ROW_TO}: калории по дням, отметки «Поход в зал», взвешивания и цели. Остальные листы и строки не читаются.</p>
          ${at ? `<div class="notice good">Импорт уже выполнялся ${new Date(at).toLocaleString('ru-RU')}. Повторный запуск не создаёт дублей.</div>` : ''}
          <input type="file" accept=".xlsx" class="input" data-file>
          <div class="small muted" data-status></div>
        </section>
        <div data-report style="margin-top:12px">${report ? reportHtml(report) : ''}</div>
        ${report ? `<button class="btn primary block" style="margin-top:12px" data-act="apply">Импортировать</button>` : ''}
        ${applied ? `<div class="notice good" style="margin-top:12px">Записано в профиль «${esc(ctx.profile.name)}»: калорий ${applied.food}, тренировок ${applied.logs}, взвешиваний ${applied.weights}, изменений нормы ${applied.targets}.</div>` : ''}`;
    },
    bind(root, ctx) {
      const inp = root.querySelector('[data-file]');
      if (!inp) return;
      inp.onchange = async () => {
        const file = inp.files[0];
        if (!file) return;
        const st = root.querySelector('[data-status]');
        st.textContent = 'Читаю файл…';
        try {
          report = await HD.xlsxImport.analyze(await file.arrayBuffer());
          applied = null;
          ui.render();
        } catch (e) {
          console.error(e);
          st.textContent = 'Ошибка: ' + e.message;
        }
      };
      const ap = root.querySelector('[data-act="apply"]');
      if (ap)
        ap.onclick = () => {
          applied = HD.xlsxImport.apply(report, ctx.profileId);
          report = null;
          ui.toast('Импорт завершён');
          ui.render();
        };
    },
  };
})(window.HD);
