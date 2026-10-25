// Настройки: тема, PIN, ИИ-модуль, резервная копия данных.
(function (HD) {
  const ui = HD.ui;
  const { esc } = HD.util;

  ui.views.settings = {
    hasLegacy: false,
    title: 'Настройки',
    back: () => '#/profile',
    // Карточка синхронизации: состояние облака, аккаунт, ручной запуск и выход
    syncCard() {
      const sb = HD.sb;
      const st = HD.sync.status;
      if (!sb.configured()) {
        return `<section class="card stack" style="margin-top:12px"><div class="card-head"><h2>Синхронизация</h2><span class="badge">не настроена</span></div>
          <p class="small muted">Сейчас дневник работает только на этом устройстве. Чтобы данные были на всех устройствах, подключите базу Supabase: инструкция в docs/DEPLOY.md, затем впишите адрес и ключ в js/config.js.</p></section>`;
      }
      if (!sb.hostAllowed()) {
        return `<section class="card stack" style="margin-top:12px"><div class="card-head"><h2>Синхронизация</h2><span class="badge warn">выключена здесь</span></div>
          <p class="small muted">На этом адресе (${esc(location.hostname)}) синхронизация отключена настройкой hosts в js/config.js: так тестовые версии не трогают реальные данные. Приложение работает локально.</p></section>`;
      }
      const label = { off: sb.signedIn() ? 'ещё не обменивались' : 'не выполнен вход', idle: 'работает', syncing: 'идёт обмен…', offline: 'нет связи', error: 'ошибка' }[st.state] || st.state;
      const cls = { idle: 'good', syncing: 'info', offline: 'warn', error: 'danger' }[st.state] || '';
      const pending = HD.sync.pendingCount();
      return `<section class="card stack" style="margin-top:12px"><div class="card-head"><h2>Синхронизация</h2><span class="badge ${cls}">${label}</span></div>
        <div class="kv small"><span>Аккаунт</span><span>${esc((sb.user() || {}).email || '—')}</span>
          <span>Последний обмен</span><span>${st.last_ok ? new Date(st.last_ok).toLocaleString('ru-RU') : '—'}</span>
          <span>Ждёт отправки</span><span>${pending}</span></div>
        ${st.error ? `<div class="notice warn">${esc(st.error)}</div>` : ''}
        <button class="btn" data-act="sync-now">Синхронизировать сейчас</button>
        <button class="btn ghost danger" data-act="sign-out">Выйти из аккаунта</button>
        <p class="tiny muted">При выходе данные с этого устройства удаляются, в облаке они остаются.</p></section>`;
    },
    render() {
      const s = HD.db.state.settings;
      const legacyBackup = !!ui.views.settings.hasLegacy;
      const theme = ui.ls.get('theme', 'auto');
      const ai = HD.ai.getProvider(s);
      return `<section class="card stack"><h2>Тема</h2>${ui.widgets.seg('theme', theme, [
        ['auto', 'Как в системе'],
        ['light', 'Светлая'],
        ['dark', 'Тёмная'],
      ])}</section>
      ${ui.views.settings.syncCard()}
      <section class="card stack" style="margin-top:12px"><div class="card-head"><h2>PIN-код</h2><span class="badge ${ui.auth.hasPin() ? 'good' : ''}">${ui.auth.hasPin() ? 'включён' : 'выключен'}</span></div>
        <p class="small muted">Необязателен: по умолчанию приложение открывается сразу. Если включить, один PIN закрывает все профили; вход действует 90 дней на этом устройстве, после 5 неверных попыток — пауза 15 минут.</p>
        <button class="btn ${ui.auth.hasPin() ? '' : 'primary'}" data-act="pin">${ui.auth.hasPin() ? 'Сменить PIN' : 'Включить PIN'}</button>
        ${ui.auth.hasPin() ? '<button class="btn ghost danger" data-act="pin-off">Отключить PIN</button>' : ''}</section>
      <form class="card stack" style="margin-top:12px" data-form="ai">
        <div class="card-head"><h2>ИИ-модуль</h2><span class="badge ${ai.enabled ? 'good' : ''}">${ai.enabled ? 'включён' : 'выключен'}</span></div>
        <p class="small muted">Без ключа всё работает на правилах. С ключом ИИ проверяет пересобранный план (правки проходят те же ограничения) и даёт одну рекомендацию недели. Ключ хранится только в этом браузере.</p>
        ${ui.field('Провайдер (AI_PROVIDER)', `<select class="input" name="ai_provider"><option value="">Выключено</option>${[
          ['anthropic', 'Anthropic'],
          ['openai', 'OpenAI-совместимый'],
          ['openrouter', 'OpenRouter'],
        ]
          .map(([k, l]) => `<option value="${k}" ${s.ai_provider === k ? 'selected' : ''}>${l}</option>`)
          .join('')}</select>`)}
        ${ui.field('Ключ (AI_API_KEY)', `<input class="input" type="password" name="ai_api_key" value="${esc(s.ai_api_key || '')}" autocomplete="off">`)}
        ${ui.field('Модель (AI_MODEL)', `<input class="input" name="ai_model" value="${esc(s.ai_model || '')}" placeholder="например, claude-sonnet-5-5">`)}
        ${ui.field('Адрес API (необязательно)', `<input class="input" name="ai_base_url" value="${esc(s.ai_base_url || '')}" placeholder="для OpenAI-совместимых">`)}
        <button class="btn">Сохранить</button>
      </form>
      <section class="card stack" style="margin-top:12px"><h2>Данные</h2>
        <p class="small muted">Данные, включая фото тела, хранятся на устройстве (IndexedDB), а при включённой синхронизации ещё и в облаке. Резервная копия включает фото и нужна на случай, если облако не подключено.</p>
        <button class="btn" data-act="export">Скачать резервную копию (JSON)</button>
        <label class="btn">Восстановить из копии<input type="file" accept=".json,application/json" class="hidden" data-restore></label>
        <button class="btn" data-act="demo">Добавить демо-профили (Макс и Анна)</button>
        ${legacyBackup ? '<button class="btn" data-act="legacy">Скачать прежние демо-данные (до сброса)</button>' : ''}
        <button class="btn danger" data-act="reset">Удалить все данные</button>
      </section>
      <p class="tiny muted center" style="margin:16px 0">Дневник здоровья · версия ${esc(window.HD_VERSION || '')}</p>`;
    },
    bind(root) {
      HD.db.legacyBackup().then((raw) => {
        if (raw && !ui.views.settings.hasLegacy) {
          ui.views.settings.hasLegacy = true;
          ui.render();
        }
      });
      root.querySelectorAll('[data-seg="theme"] button').forEach((b) => (b.onclick = () => (ui.ls.set('theme', b.dataset.v), ui.applyTheme(), ui.render())));
      root.querySelector('[data-act="pin"]').onclick = () =>
        ui.sheet(
          `<h2>${ui.auth.hasPin() ? 'Новый PIN' : 'Придумайте PIN'}</h2><form class="stack" style="margin-top:12px"><input class="input huge" name="a" inputmode="numeric" type="password" maxlength="6" placeholder="4–6 цифр" autofocus><input class="input huge" name="b" inputmode="numeric" type="password" maxlength="6" placeholder="ещё раз"><button class="btn primary">Сохранить</button></form>`,
          (el, close) =>
            (el.querySelector('form').onsubmit = (e) => {
              e.preventDefault();
              const a = e.target.a.value;
              if (!/^\d{4,6}$/.test(a)) return ui.toast('PIN — от 4 до 6 цифр');
              if (a !== e.target.b.value) return ui.toast('PIN не совпал');
              ui.auth.setPin(a);
              close();
              ui.toast('PIN включён');
              ui.render();
            }),
        );
      const off = root.querySelector('[data-act="pin-off"]');
      if (off)
        off.onclick = async () => {
          if (!(await ui.confirm('Отключить PIN? Приложение будет открываться без ввода кода.', 'Отключить'))) return;
          ui.auth.disablePin();
          ui.toast('PIN отключён');
          ui.render();
        };
      const demo = root.querySelector('[data-act="demo"]');
      if (demo)
        demo.onclick = async () => {
          if (!(await ui.confirm('Добавить два демонстрационных профиля (Макс и Анна) с готовыми целями и планом? Ваши данные не изменятся. После этого при запуске появится выбор профиля.', 'Добавить'))) return;
          const added = HD.seed.loadDemo();
          ui.toast(added.length ? 'Демо-профили добавлены' : 'Демо-профили уже есть');
          ui.render();
        };
      const legacy = root.querySelector('[data-act="legacy"]');
      if (legacy)
        legacy.onclick = async () => {
          const raw = await HD.db.legacyBackup();
          if (!raw) return ui.toast('Прежних данных нет');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
          a.download = 'health-diary-demo-v1.json';
          a.click();
        };
      const af = root.querySelector('[data-form="ai"]');
      af.onsubmit = (e) => {
        e.preventDefault();
        const v = ui.formData(af);
        for (const k of ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url']) HD.db.setting(k, v[k].trim());
        ui.toast(HD.ai.getProvider(HD.db.state.settings).enabled ? 'ИИ включён' : 'ИИ выключен');
        ui.render();
      };
      root.querySelector('[data-act="export"]').onclick = async () => {
        ui.toast('Готовлю копию вместе с фото…');
        const blob = new Blob([await HD.db.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `health-diary-${HD.dates.today()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      root.querySelector('[data-restore]').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!(await ui.confirm('Заменить все текущие данные содержимым копии?', 'Заменить'))) return;
        try {
          await HD.db.importJSON(await f.text());
          ui.toast('Данные восстановлены');
          ui.render();
        } catch (err) {
          ui.toast('Ошибка: ' + err.message);
        }
      };
      const sn = root.querySelector('[data-act="sync-now"]');
      if (sn)
        sn.onclick = async () => {
          sn.disabled = true;
          try {
            const r = await HD.sync.syncNow();
            ui.toast(r && r.pulled ? `Получено изменений: ${r.pulled}` : 'Всё синхронизировано');
          } catch (e) {
            ui.toast(e.message);
          }
          ui.render();
        };
      const so = root.querySelector('[data-act="sign-out"]');
      if (so)
        so.onclick = async () => {
          if (HD.sync.pendingCount() > 0) {
            try {
              await HD.sync.syncNow();
            } catch (e) {
              if (!(await ui.confirm('Не все изменения ушли в облако (нет связи). Если выйти сейчас, они будут потеряны. Выйти всё равно?', 'Выйти'))) return;
            }
          } else if (!(await ui.confirm('Выйти из аккаунта? Данные на этом устройстве будут удалены, в облаке они останутся.', 'Выйти'))) return;
          await HD.sync.signOutAndWipe();
          ui.ls.del('profile');
          location.hash = '';
          location.reload();
        };
      root.querySelector('[data-act="reset"]').onclick = async () => {
        const cloud = HD.sb.enabled() && HD.sb.signedIn();
        if (!(await ui.confirm(cloud ? 'Удалить все данные на этом устройстве, в облаке и на других устройствах без возможности восстановления? Сначала лучше скачать резервную копию.' : 'Удалить все данные без возможности восстановления? Сначала лучше скачать резервную копию.', 'Удалить всё'))) return;
        if (cloud) {
          try {
            await HD.sync.deleteEverywhere();
          } catch (e) {
            return ui.toast('Не удалось удалить в облаке: ' + e.message);
          }
        }
        await HD.db.reset();
        ui.ls.del('profile');
        location.reload();
      };
    },
  };
})(window.HD);
