// Ядро интерфейса: роутер на hash, раскладка, иконки, лист снизу, уведомления, вход по PIN.
(function (HD) {
  const esc = HD.util.esc;
  const ui = (HD.ui = HD.ui || {});
  ui.views = {};

  // ---------- хранение в браузере (только удобства конкретного устройства) ----------
  const ls = {
    get(k, d) {
      try {
        const v = localStorage.getItem('hd_' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('hd_' + k, JSON.stringify(v));
      } catch (e) {}
    },
    del(k) {
      try {
        localStorage.removeItem('hd_' + k);
      } catch (e) {}
    },
  };
  ui.ls = ls;

  // ---------- PIN ----------
  const SESSION_DAYS = 90;
  const MAX_ATTEMPTS = 5;
  const LOCK_MIN = 15;
  ui.auth = {
    // PIN необязателен: включается в Профиль → Настройки
    hasPin() {
      return !!HD.db.setting('pin_hash');
    },
    disablePin() {
      HD.db.setting('pin_hash', null);
      HD.db.setting('pin_salt', null);
      ls.del('session_until');
      ls.del('pin_fail');
    },
    setPin(pin) {
      const salt = HD.util.uid();
      HD.db.setting('pin_salt', salt);
      HD.db.setting('pin_hash', HD.sha256(salt + ':' + pin));
      ui.auth.startSession();
    },
    lockedUntil() {
      const s = ls.get('pin_fail', { n: 0, until: 0 });
      return s.until > Date.now() ? s.until : 0;
    },
    check(pin) {
      if (ui.auth.lockedUntil()) return { ok: false, locked: true };
      const ok = HD.sha256(HD.db.setting('pin_salt') + ':' + pin) === HD.db.setting('pin_hash');
      if (ok) {
        ls.del('pin_fail');
        ui.auth.startSession();
        return { ok: true };
      }
      const s = ls.get('pin_fail', { n: 0, until: 0 });
      s.n = (s.n || 0) + 1;
      if (s.n >= MAX_ATTEMPTS) {
        s.until = Date.now() + LOCK_MIN * 60000;
        s.n = 0;
      }
      ls.set('pin_fail', s);
      return { ok: false, left: MAX_ATTEMPTS - s.n, locked: !!s.until && s.until > Date.now() };
    },
    startSession() {
      ls.set('session_until', Date.now() + SESSION_DAYS * 864e5);
    },
    valid() {
      return ls.get('session_until', 0) > Date.now();
    },
    logout() {
      ls.del('session_until');
    },
  };

  // ---------- иконки ----------
  const P = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11"/>',
    train: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    run: '<circle cx="15" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v5M6 11l3-3 4 1 3 4 3 1M11 15l-2-3"/>',
    strength: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
    cardio: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0l-2 3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
    undo: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  };
  ui.icon = (name, extra) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}>${P[name] || ''}</svg>`;

  // ---------- маршруты ----------
  ui.route = () => {
    const h = (location.hash || '#/home').slice(2);
    const [path, query] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const q = {};
    (query || '').split('&').filter(Boolean).forEach((kv) => {
      const [k, v] = kv.split('=');
      q[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { name: parts[0] || 'home', parts: parts.slice(1), q };
  };
  ui.go = (hash) => {
    if (location.hash === hash) ui.render();
    else location.hash = hash;
  };

  const chosen = {
    get() {
      try {
        return sessionStorage.getItem('hd_chosen') === '1';
      } catch (e) {
        return false;
      }
    },
    set() {
      try {
        sessionStorage.setItem('hd_chosen', '1');
      } catch (e) {}
    },
  };
  // Текущий профиль: сохранённый, иначе единственный/первый
  ui.profileId = () => {
    const all = HD.db.all('profiles');
    const saved = ls.get('profile', null);
    if (saved && all.some((p) => p.id === saved)) return saved;
    return all.length ? all[0].id : null;
  };
  ui.setProfile = (id) => {
    ls.set('profile', id);
    chosen.set();
    const changes = HD.svc.plan.adapt(id);
    ui.render();
    ui.showChanges(changes);
  };

  const NAV = [
    ['home', 'Главная', 'home'],
    ['food', 'Питание', 'food'],
    ['training', 'Тренировки', 'train'],
    ['profile', 'Профиль', 'user'],
  ];
  const SECTION = { workout: 'training', dynamics: 'home', body: 'profile', goals: 'profile', onboard: 'profile', wizard: 'profile', import: 'profile', settings: 'profile', events: 'profile' };

  // Шаги первичной настройки и разрешённые на них экраны
  const ONB_STEPS = [
    ['assessment', 'onboard', 'Анкета'],
    ['goal', 'goals', 'Цели'],
    ['schedule', 'wizard', 'Расписание'],
  ];

  ui.render = () => {
    const root = document.getElementById('app');
    // Облако настроено, но на этом устройстве нет входа: сначала вход (данные подтянутся с сервера)
    if (HD.sb.enabled() && !HD.sb.signedIn()) {
      root.innerHTML = ui.views.login.render();
      ui.views.login.bind(root);
      return;
    }
    if (ui.auth.hasPin() && !ui.auth.valid()) {
      root.innerHTML = ui.views.pin.render();
      ui.views.pin.bind(root);
      return;
    }
    // Первый запуск: создаём пустой профиль и ведём его через настройку
    if (!HD.db.all('profiles').length) ui.setProfile(HD.svc.onboarding.create().id);
    // Несколько профилей: при запуске предлагаем выбрать
    if (HD.db.all('profiles').length > 1 && !chosen.get()) {
      root.innerHTML = ui.views.profiles.render();
      ui.views.profiles.bind(root);
      return;
    }
    const pid = ui.profileId();
    const r = ui.route();
    const view = ui.views[r.name] || ui.views.home;
    const ctx = HD.svc.ctx(pid);
    // Пока настройка не завершена, другие экраны недоступны
    let onbStep = null;
    if (!ctx.onboarding.done) {
      onbStep = ONB_STEPS.findIndex(([k]) => !ctx.onboarding[k]);
      let allowed = ONB_STEPS[onbStep][1];
      if (r.name === 'onboard' && ui.onboardState && ui.onboardState.showingResult) {
        onbStep = 0;
        allowed = 'onboard';
      }
      if (r.name !== allowed) {
        location.replace('#/' + allowed);
        return ui.render();
      }
    }
    let body;
    try {
      body = view.render(ctx, r);
    } catch (e) {
      console.error(e);
      body = `<div class="notice danger">Ошибка экрана: ${esc(e.message)}</div>`;
    }
    const title = typeof view.title === 'function' ? view.title(ctx, r) : view.title;
    const active = SECTION[r.name] || r.name;
    const onb = onbStep != null;
    root.innerHTML = `<div class="app ${onb ? 'onb' : ''}">
      <header class="topbar">
        ${!onb && view.back && view.back(ctx, r) ? `<a class="icon-btn" href="${view.back(ctx, r)}" aria-label="Назад">${ui.icon('left')}</a>` : ''}
        <h1>${esc(onb ? 'Настройка · шаг ' + (onbStep + 1) + ' из 3' : title || '')}</h1>
        ${onb ? '' : `<button class="avatar" data-act="switch-profile" title="Сменить профиль">${esc((ctx.profile.name || 'Я')[0])}</button>`}
      </header>
      ${onb ? `<div class="onb-steps">${ONB_STEPS.map(([, , label], i) => `<span class="${i < onbStep ? 'done' : i === onbStep ? 'on' : ''}">${i + 1}. ${label}</span>`).join('')}</div>` : ''}
      <main id="view">${body}</main>
      ${onb ? '' : `<nav class="bottomnav">${NAV.map(([k, label, ic]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ui.icon(ic)}<span>${label}</span></a>`).join('')}</nav>`}
    </div>`;
    const sw = root.querySelector('[data-act="switch-profile"]');
    if (sw) sw.onclick = () => ui.switchProfileSheet();
    if (view.bind) {
      try {
        view.bind(root.querySelector('#view'), ctx, r);
      } catch (e) {
        console.error(e);
      }
    }
  };

  ui.switchProfileSheet = () => {
    const profiles = HD.db.all('profiles');
    ui.sheet(
      `<h2>Сменить профиль</h2><div class="stack" style="margin-top:12px">${profiles
        .map((p) => `<button class="btn block" data-pid="${p.id}">${esc(p.name)}${p.id === ui.profileId() ? ' · сейчас' : ''}</button>`)
        .join('')}<button class="btn primary block" data-act="add">+ Добавить профиль</button>${ui.auth.hasPin() ? '<button class="btn ghost block" data-act="lock">Заблокировать (выйти по PIN)</button>' : ''}</div>`,
      (el, close) => {
        el.querySelectorAll('[data-pid]').forEach((b) => (b.onclick = () => (close(), ui.setProfile(b.dataset.pid), ui.go('#/home'))));
        el.querySelector('[data-act="add"]').onclick = () => {
          close();
          ui.setProfile(HD.svc.onboarding.create().id);
          ui.go('#/onboard');
        };
        const lock = el.querySelector('[data-act="lock"]');
        if (lock) lock.onclick = () => (close(), ui.auth.logout(), ui.render());
      },
    );
  };

  // ---------- лист снизу ----------
  ui.sheet = (html, bind) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => e.target === wrap && close());
    document.body.appendChild(wrap);
    if (bind) bind(wrap.querySelector('.sheet'), close);
    const first = wrap.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 50);
    return close;
  };

  ui.confirm = (text, okLabel) =>
    new Promise((resolve) => {
      ui.sheet(`<p>${esc(text)}</p><div class="grid2" style="margin-top:12px"><button class="btn" data-no>Отмена</button><button class="btn primary" data-yes>${esc(okLabel || 'Да')}</button></div>`, (el, close) => {
        el.querySelector('[data-no]').onclick = () => (close(), resolve(false));
        el.querySelector('[data-yes]').onclick = () => (close(), resolve(true));
      });
    });

  // ---------- уведомление ----------
  let toastTimer;
  ui.toast = (text, action) => {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => (t.remove(), action.run());
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), action ? 7000 : 3000);
  };

  // Показ автоматических изменений плана с причиной и отменой
  ui.showChanges = (changes) => {
    if (!changes || !changes.length) return;
    const c = changes[changes.length - 1];
    ui.toast(c.reason, { label: 'Отменить', run: () => (HD.svc.plan.undo(c.id), ui.toast('Изменение отменено'), ui.render()) });
  };

  // ---------- формы ----------
  ui.formData = (form) => {
    const o = {};
    form.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') {
        if (el.checked) o[el.name] = el.value;
      } else o[el.name] = el.value;
    });
    return o;
  };
  ui.numOrNull = (v) => (v === '' || v == null || isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

  ui.field = (label, inner) => `<label class="field"><span>${esc(label)}</span>${inner}</label>`;
  ui.numInput = (name, value, unit, attrs) =>
    `<div class="input-unit"><input class="input" name="${name}" inputmode="decimal" value="${value == null ? '' : esc(value)}" ${attrs || ''}>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div>`;

  ui.kindIcon = (kind) => ui.icon(kind === 'run' ? 'run' : kind === 'strength' ? 'strength' : 'cardio');

  // Свайп влево/вправо для листания периодов
  ui.onSwipe = (el, onLeft, onRight) => {
    let x0 = null;
    let y0 = null;
    el.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
      x0 = null;
    });
  };

  // Тема
  ui.applyTheme = () => {
    const t = ls.get('theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };
})(window.HD);
