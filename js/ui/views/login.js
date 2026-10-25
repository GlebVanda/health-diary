// Вход в аккаунт (Supabase): показывается, только если облако настроено в js/config.js и на этом устройстве ещё нет входа.
// Один аккаунт = один дневник на всех устройствах. Данные подтягиваются с сервера сразу после входа.
(function (HD) {
  const ui = HD.ui;
  const { esc } = HD.util;

  let mode = 'in'; // in | up | reset
  let message = '';
  let busy = false;
  let email = '';

  const TITLE = { in: 'Вход', up: 'Новый аккаунт', reset: 'Сброс пароля' };

  function render() {
    return `<div class="lock">
      <div class="avatar" style="width:56px;height:56px">${ui.icon('cardio', 'width="28" height="28"')}</div>
      <h1>${TITLE[mode]}</h1>
      <form class="login-form stack" data-form="login" novalidate>
        <input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="Почта" value="${esc(email)}" ${busy ? 'disabled' : ''}>
        ${mode === 'reset' ? '' : `<input class="input" name="password" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" placeholder="Пароль${mode === 'up' ? ' (от 6 символов)' : ''}" ${busy ? 'disabled' : ''}>`}
        <div class="small ${/^✓/.test(message) ? 'k-good' : 'k-over'} center" style="min-height:20px">${esc(message)}</div>
        <button class="btn primary block" ${busy ? 'disabled' : ''}>${busy ? 'Подождите…' : mode === 'in' ? 'Войти' : mode === 'up' ? 'Создать аккаунт' : 'Прислать ссылку'}</button>
      </form>
      <div class="login-links small">
        ${mode === 'in' ? '<a href="#" data-mode="up">Создать аккаунт</a><a href="#" data-mode="reset">Забыли пароль?</a>' : '<a href="#" data-mode="in">Уже есть аккаунт: войти</a>'}
      </div>
      <div class="tiny muted center" style="max-width:320px">Аккаунт нужен, чтобы дневник был один на всех ваших устройствах. Данные хранятся в вашей базе Supabase и защищены правилами доступа.</div>
    </div>`;
  }

  function bind(root) {
    const form = root.querySelector('[data-form="login"]');
    root.querySelectorAll('[data-mode]').forEach(
      (a) =>
        (a.onclick = (e) => {
          e.preventDefault();
          email = form.email.value;
          mode = a.dataset.mode;
          message = '';
          ui.render();
        }),
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      email = form.email.value.trim();
      const password = form.password ? form.password.value : '';
      if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg('Проверьте адрес почты');
      if (mode !== 'reset' && password.length < 6) return setMsg('Пароль: не меньше 6 символов');
      busy = true;
      message = '';
      ui.render();
      try {
        if (mode === 'reset') {
          await HD.sb.recover(email);
          message = '✓ Если такая почта есть, ссылка для сброса пароля отправлена';
          mode = 'in';
        } else if (mode === 'up') {
          const r = await HD.sb.signUp(email, password);
          if (!r.signedIn) {
            message = '✓ Аккаунт создан. Подтвердите почту по ссылке из письма и войдите';
            mode = 'in';
          }
        } else await HD.sb.signIn(email, password);
        if (HD.sb.signedIn()) {
          busy = true;
          ui.render();
          // Сначала подтягиваем данные с сервера, чтобы на новом устройстве не создавать пустой профиль
          try {
            await HD.sync.syncNow();
          } catch (err) {
            console.warn('Первая синхронизация не удалась', err);
          }
          busy = false;
          HD.boot();
          return ui.go('#/home');
        }
      } catch (err) {
        message = err.message || 'Не удалось выполнить запрос';
        if (err instanceof TypeError) message = 'Нет связи с сервером. Проверьте интернет.';
      }
      busy = false;
      ui.render();
    };
    function setMsg(t) {
      message = t;
      ui.render();
    }
  }

  ui.views.login = { render, bind };
})(window.HD);
