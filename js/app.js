// Точка входа: загрузка данных, начальное заполнение, первый план и норма, запуск интерфейса.
(function (HD) {
  const ui = HD.ui;

  function boot() {
    // ?today=YYYY-MM-DD — подмена «сегодня» для проверки сценариев
    const m = location.search.match(/[?&]today=(\d{4}-\d{2}-\d{2})/);
    if (m) HD.dates.setToday(m[1]);
    for (const p of HD.db.all('profiles')) {
      const ctx = HD.svc.ctx(p.id);
      if (!ctx.onboarding.done) continue;
      HD.svc.plan.ensurePlan(p.id);
      if (!ctx.targets.length) HD.svc.nutrition.recalc(p.id, 'Первый расчёт');
    }
    // Вместо ночного запуска: правила адаптации прогоняются при открытии
    const pid = ui.profileId();
    if (pid && HD.svc.ctx(pid).onboarding.done) {
      const changes = HD.svc.plan.adapt(pid);
      if (changes.length) setTimeout(() => ui.showChanges(changes), 300);
    }
  }

  HD.boot = boot;

  // Экран можно перерисовать, только если пользователь сейчас ничего не вводит
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && !document.querySelector('.sheet');
  let staleView = false;

  async function start() {
    ui.applyTheme();
    await HD.db.init();
    HD.seed.seed();
    // Просим браузер не удалять данные при нехватке места (на телефоне это важно)
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {}
    HD.sync.start();
    // Уже вошли: до показа экрана забираем свежие данные (но не ждём дольше 8 секунд, если связи нет)
    if (HD.sb.enabled() && HD.sb.signedIn()) {
      document.getElementById('app').innerHTML = '<div class="lock"><p class="muted">Синхронизация…</p></div>';
      try {
        await Promise.race([HD.sync.syncNow(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      } catch (e) {
        console.warn('Синхронизация при запуске:', e.message);
      }
    }
    HD.sync.onStatus((st, info) => {
      if (info && info.pulled) {
        if (typing()) staleView = true;
        else ui.render();
      }
    });
    boot();
    window.addEventListener('hashchange', () => {
      window.scrollTo(0, 0);
      staleView = false;
      ui.render();
    });
    ui.render();
    window.addEventListener('pagehide', () => HD.db.flush());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && HD.db.flush());
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  start().catch((e) => {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="lock"><h1>Не удалось запустить</h1><p class="muted">${HD.util.esc(e.message)}</p></div>`;
  });
})(window.HD);
