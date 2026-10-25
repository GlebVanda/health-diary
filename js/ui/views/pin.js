// Экран PIN: при первом запуске — придумать PIN (4–6 цифр), дальше — ввод с ограничением перебора.
(function (HD) {
  const ui = HD.ui;
  let entry = '';
  let firstPin = null;
  let message = '';

  function mode() {
    return ui.auth.hasPin() ? 'enter' : firstPin ? 'confirm' : 'create';
  }

  function render() {
    const m = mode();
    const locked = ui.auth.lockedUntil();
    const title = m === 'enter' ? 'Введите PIN' : m === 'create' ? 'Придумайте PIN' : 'Повторите PIN';
    const hint =
      locked
        ? `Слишком много попыток. Попробуйте после ${new Date(locked).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : message || (m === 'create' ? 'Один PIN для всех профилей, 4–6 цифр' : m === 'enter' ? 'Дневник здоровья' : '');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'];
    return `<div class="lock">
      <div class="avatar" style="width:56px;height:56px">${ui.icon('cardio', 'width="28" height="28"')}</div>
      <h1>${title}</h1>
      <div class="pin-dots">${Array.from({ length: 6 }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="small ${message ? 'k-over' : 'muted'} center" style="min-height:20px">${HD.util.esc(hint)}</div>
      <div class="keypad">${keys
        .map((k) =>
          k === 'ok'
            ? `<button class="fn" data-k="ok" ${entry.length < 4 ? 'disabled' : ''}>Готово</button>`
            : k === 'del'
              ? `<button class="fn" data-k="del">Стереть</button>`
              : `<button data-k="${k}" ${locked ? 'disabled' : ''}>${k}</button>`,
        )
        .join('')}</div>
    </div>`;
  }

  function submit() {
    const m = mode();
    if (entry.length < 4) return;
    if (m === 'create') {
      firstPin = entry;
      message = '';
    } else if (m === 'confirm') {
      if (entry === firstPin) {
        ui.auth.setPin(entry);
        firstPin = null;
        message = '';
      } else {
        firstPin = null;
        message = 'PIN не совпал, придумайте заново';
      }
    } else {
      const r = ui.auth.check(entry);
      message = r.ok ? '' : r.locked ? '' : `Неверный PIN, осталось попыток: ${r.left}`;
    }
    entry = '';
    ui.render();
  }

  function bind(root) {
    root.querySelectorAll('[data-k]').forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.k;
          if (k === 'del') entry = entry.slice(0, -1);
          else if (k === 'ok') return submit();
          else if (entry.length < 6) entry += k;
          if (entry.length === 6) return submit();
          root.innerHTML = render();
          bind(root);
        }),
    );
    document.onkeydown = (e) => {
      if (ui.auth.valid()) return (document.onkeydown = null);
      if (/^\d$/.test(e.key) && entry.length < 6) entry += e.key;
      else if (e.key === 'Backspace') entry = entry.slice(0, -1);
      else if (e.key === 'Enter') return submit();
      else return;
      if (entry.length === 6) return submit();
      root.innerHTML = render();
      bind(root);
    };
  }

  ui.views.pin = { render, bind };
})(window.HD);
