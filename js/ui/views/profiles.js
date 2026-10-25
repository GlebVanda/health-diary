// Выбор профиля после PIN: две карточки, выбор запоминается на устройстве.
(function (HD) {
  const ui = HD.ui;
  const esc = HD.util.esc;

  ui.views.profiles = {
    render() {
      const list = HD.db.all('profiles');
      return `<div class="lock">
        <h1>Кто заполняет дневник?</h1>
        <div class="profiles">${list
          .map((p) => `<button class="profile-card" data-pid="${p.id}"><span class="avatar">${esc(p.name[0])}</span><b>${esc(p.name)}</b></button>`)
          .join('')}</div>
      </div>`;
    },
    bind(root) {
      root.querySelectorAll('[data-pid]').forEach((b) => (b.onclick = () => (ui.setProfile(b.dataset.pid), ui.go('#/home'))));
    },
  };
})(window.HD);
