// «Тело»: вес, объёмы и фото в любой день; после сохранения — как изменится норма с понедельника.
// Фото хранятся в браузере, их можно сравнивать между периодами (#/body/compare).
(function (HD) {
  const ui = HD.ui;
  const D = HD.dates;
  const C = HD.charts;
  const P = HD.photos;
  const { esc, num } = HD.util;

  // Фото, выбранные в форме, но ещё не сохранённые
  let pending = [];

  function angleSelect(name, value, attrs) {
    return `<select class="input" name="${name}" ${attrs || ''}>${P.ANGLES.map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function pendingHtml() {
    if (!pending.length) return '';
    return `<div class="photo-grid">${pending
      .map(
        (p, i) => `<div class="photo-pending"><img src="${p.url}" alt=""><select class="input small" data-pending-angle="${i}">${P.ANGLES.map(([k, l]) => `<option value="${k}" ${k === p.angle ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="icon-btn photo-x" data-pending-del="${i}" title="Убрать">${ui.icon('close')}</button></div>`,
      )
      .join('')}</div>`;
  }

  function measureLine(m) {
    if (!m) return '';
    return [m.weight_kg != null && num(m.weight_kg, 1) + ' кг', m.waist_cm && 'талия ' + num(m.waist_cm, 1), m.hips_cm && 'бёдра ' + num(m.hips_cm, 1), m.chest_cm && 'грудь ' + num(m.chest_cm, 1)].filter(Boolean).join(' · ');
  }

  function gallery(ctx) {
    const angle = ui.ls.get('photo_angle', 'all');
    const photos = P.list(ctx.profileId, angle);
    const byDate = HD.util.groupBy(photos.slice().reverse(), (p) => p.date);
    const all = P.list(ctx.profileId);
    return `<section class="card" style="margin-top:12px">
      <div class="card-head"><h2>Фото</h2>${all.length >= 2 ? `<a class="btn small primary" href="#/body/compare">Сравнить</a>` : ''}</div>
      ${all.length ? `<div class="chips" data-photo-angle>${[['all', 'Все']].concat(P.ANGLES).map(([k, l]) => `<button class="chip ${k === angle ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
      ${photos.length
        ? [...byDate.entries()]
            .map(([date, list]) => {
              const m = ctx.measurements.find((x) => x.date === date);
              return `<div style="margin-top:12px"><div class="row between small"><b>${D.short(date, true)}</b><span class="muted">${esc(measureLine(m))}</span></div>
                <div class="photo-grid" style="margin-top:6px">${list.map((p) => `<button class="photo-thumb" data-open-photo="${p.id}"><img data-photo="${p.id}" data-size="thumb" alt=""><span class="tag">${P.angleLabel(p.angle)}</span></button>`).join('')}</div></div>`;
            })
            .join('')
        : `<div class="muted small" style="margin-top:6px">${all.length ? 'Нет фото этого ракурса' : 'Добавьте фото в форме замера: лучше в одной позе, при похожем свете — так их проще сравнивать.'}</div>`}
      ${!HD.db.photosPersistent() ? '<div class="notice warn" style="margin-top:10px">Браузер не даёт сохранить фото надолго: они пропадут после перезагрузки.</div>' : ''}
    </section>`;
  }

  function main(ctx, r) {
    const date = r.q.date && D.isValid(r.q.date) ? r.q.date : ctx.today;
    const m = ctx.measurements.find((x) => x.date === date) || {};
    const last = ctx.measurements.filter((x) => x.weight_kg != null).pop();
    const recent = ctx.measurements.slice(-60);
    const from = recent.length ? recent[0].date : ctx.today;
    const x = (d) => D.diffDays(from, d);
    const lines = [
      { points: recent.filter((r) => r.weight_kg != null).map((r) => ({ x: x(r.date), y: Number(r.weight_kg), title: `${D.dm(r.date)}: ${num(r.weight_kg, 1)} кг` })), color: 'var(--chart-1)', dots: true },
    ];
    return `<form class="card stack" data-form="body">
        <div class="card-head"><h2>Новый замер</h2>${last ? `<span class="small muted">последний вес ${num(last.weight_kg, 1)} кг, ${D.short(last.date)}</span>` : ''}</div>
        ${ui.field('Дата', `<input class="input" type="date" name="date" value="${date}" max="${ctx.today}">`)}
        ${ui.field('Вес', ui.numInput('weight_kg', m.weight_kg, 'кг'))}
        <div class="grid3">${ui.field('Талия', ui.numInput('waist_cm', m.waist_cm, 'см'))}${ui.field('Бёдра', ui.numInput('hips_cm', m.hips_cm, 'см'))}${ui.field('Грудь', ui.numInput('chest_cm', m.chest_cm, 'см'))}</div>
        <div class="field"><span class="small muted">Фото</span>
          <div class="row" style="margin-top:4px">
            <div class="grow">${angleSelect('new_angle', ui.ls.get('last_angle', 'front'))}</div>
            <label class="btn">${ui.icon('plus')} Добавить фото<input type="file" accept="image/*" multiple class="hidden" data-photo-input></label>
          </div>
          <div data-pending style="margin-top:8px">${pendingHtml()}</div>
        </div>
        <button class="btn primary block">Сохранить</button>
        <div class="tiny muted">Фото сжимаются и хранятся только в этом браузере. Напоминание о взвешивании появится, если последнее старше 7 дней.</div>
      </form>
      ${gallery(ctx)}
      <section class="card" style="margin-top:12px"><h2>Вес</h2>${C.chart({ lines, xTicks: ui.widgets.xTicksForRange(from, recent.length ? recent[recent.length - 1].date : ctx.today), yFormat: (v) => num(v, 1) })}</section>
      <section class="card" style="margin-top:12px"><h2>История замеров</h2>
        <ul class="list">${ctx.measurements
          .slice()
          .reverse()
          .slice(0, 40)
          .map((m) => {
            const n = HD.db.forProfile('body_photos', ctx.profileId, (p) => p.date === m.date).length;
            return `<li><a class="li-link" href="#/body?date=${m.date}"><span class="grow">${D.short(m.date, true)}<div class="tiny muted">${[m.waist_cm && 'талия ' + num(m.waist_cm, 1), m.hips_cm && 'бёдра ' + num(m.hips_cm, 1), m.chest_cm && 'грудь ' + num(m.chest_cm, 1), n && n + ' фото'].filter(Boolean).join(' · ')}</div></span><b class="num">${m.weight_kg != null ? num(m.weight_kg, 1) + ' кг' : ''}</b></a></li>`;
          })
          .join('') || '<li class="muted">Пока нет замеров</li>'}</ul>
      </section>`;
  }

  // ---------- сравнение ----------

  function compareView(ctx, r) {
    const angle = r.q.angle || ui.ls.get('cmp_angle', 'front');
    const photos = P.list(ctx.profileId, angle);
    const mode = ui.ls.get('cmp_mode', 'side');
    const angles = P.ANGLES.filter(([k]) => P.list(ctx.profileId, k).length);
    const head = `<div class="chips" style="margin-bottom:10px">${angles.map(([k, l]) => `<button class="chip ${k === angle ? 'on' : ''}" data-cmp-angle="${k}">${l} · ${P.list(ctx.profileId, k).length}</button>`).join('')}</div>`;
    if (photos.length < 2) {
      return `${head}<div class="notice">Для сравнения нужно хотя бы два фото одного ракурса${photos.length ? '' : ' (выберите ракурс выше)'}. Добавить фото можно в <a href="#/body">форме замера</a>.</div>`;
    }
    const def = P.defaultPair(photos);
    let a = photos.find((p) => p.id === r.q.a) || def.a;
    let b = photos.find((p) => p.id === r.q.b) || def.b;
    if (a.id === b.id) b = photos.find((p) => p.id !== a.id);
    if (a.date > b.date) [a, b] = [b, a];
    const days = D.diffDays(a.date, b.date);
    const rows = P.diff(ctx.measurements, a.date, b.date);
    const presets = [
      ['first', 'Первое ↔ последнее'],
      ['30', 'Месяц назад'],
      ['90', '3 месяца назад'],
      ['365', 'Год назад'],
    ];
    const strip = (which, sel) =>
      `<div class="strip">${photos.map((p) => `<button class="photo-thumb mini ${p.id === sel.id ? 'sel' : ''}" data-pick="${which}" data-id="${p.id}"><img data-photo="${p.id}" data-size="thumb" alt=""><span class="tag">${D.dm(p.date)}</span></button>`).join('')}</div>`;
    const viewer =
      mode === 'curtain'
        ? `<div class="curtain" data-curtain>
            <img data-photo="${b.id}" data-size="full" alt="">
            <div class="curtain-top" style="clip-path:inset(0 50% 0 0)"><img data-photo="${a.id}" data-size="full" alt=""></div>
            <div class="curtain-line" style="left:50%"></div>
            <span class="tag left">${D.short(a.date, true)}</span><span class="tag right">${D.short(b.date, true)}</span>
          </div>
          <input type="range" min="0" max="100" value="50" data-curtain-range aria-label="Шторка">`
        : `<div class="cmp-pair">
            <figure><img data-photo="${a.id}" data-size="full" alt=""><figcaption>Было · ${D.short(a.date, true)}</figcaption></figure>
            <figure><img data-photo="${b.id}" data-size="full" alt=""><figcaption>Стало · ${D.short(b.date, true)}</figcaption></figure>
          </div>`;
    return `${head}
      <div class="row" style="margin-bottom:10px"><div class="grow">${ui.widgets.seg('cmp_mode', mode, [['side', 'Рядом'], ['curtain', 'Шторка']])}</div></div>
      <section class="card">${viewer}
        <div class="small muted center" style="margin-top:8px">${days} ${HD.util.plural(days, 'день', 'дня', 'дней')} между снимками</div>
      </section>
      <div class="chips" style="margin-top:12px">${presets.map(([k, l]) => `<button class="chip" data-preset="${k}">${l}</button>`).join('')}</div>
      <section class="card" style="margin-top:12px">
        <h2>Замеры</h2>
        <table class="cmp" style="margin-top:6px"><thead><tr><th></th><th>${D.dm(a.date)}</th><th>${D.dm(b.date)}</th><th>Разница</th></tr></thead><tbody>${rows
          .filter((x) => x.a || x.b)
          .map((x) => `<tr><td>${x.label}</td><td>${x.a ? num(x.a.value, 1) : '—'}</td><td>${x.b ? num(x.b.value, 1) : '—'}</td><td>${x.delta == null ? '—' : (x.delta > 0 ? '+' : '') + num(x.delta, 1) + ' ' + x.unit}</td></tr>`)
          .join('') || '<tr><td colspan="4" class="muted">Нет замеров на эти даты</td></tr>'}</tbody></table>
        <div class="tiny muted" style="margin-top:6px">Берётся последний замер не позже даты снимка.</div>
      </section>
      <div class="section-title">Было</div>${strip('a', a)}
      <div class="section-title">Стало</div>${strip('b', b)}`;
  }

  function photoSheet(ctx, id) {
    const p = HD.db.get('body_photos', id);
    if (!p) return;
    const m = ctx.measurements.find((x) => x.date === p.date);
    ui.sheet(
      `<img class="photo-full" data-photo="${p.id}" data-size="full" alt="">
       <div class="row between" style="margin-top:10px"><b>${D.short(p.date, true)}</b><span class="small muted">${esc(measureLine(m))}</span></div>
       <form class="stack" style="margin-top:10px">
         <div class="grid2">${ui.field('Ракурс', angleSelect('angle', p.angle))}${ui.field('Дата', `<input class="input" type="date" name="date" value="${p.date}" max="${ctx.today}">`)}</div>
         ${ui.field('Заметка', `<input class="input" name="note" value="${esc(p.note || '')}">`)}
         <div class="grid2"><button class="btn primary">Сохранить</button><a class="btn" href="#/body/compare?angle=${p.angle}&b=${p.id}">Сравнить</a></div>
         <button type="button" class="btn ghost danger" data-del>Удалить фото</button>
       </form>`,
      (el, close) => {
        P.hydrate(el);
        el.querySelector('a').onclick = close;
        el.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          const v = ui.formData(e.target);
          P.update(p.id, { angle: v.angle, date: D.isValid(v.date) ? v.date : p.date, note: v.note || null });
          close();
          ui.render();
        };
        el.querySelector('[data-del]').onclick = async () => {
          close();
          if (await ui.confirm('Удалить это фото? Восстановить его можно будет только из резервной копии.', 'Удалить')) {
            await P.remove(p.id);
            ui.render();
          }
        };
      },
    );
  }

  ui.views.body = {
    title: (ctx, r) => (r.parts[0] === 'compare' ? 'Сравнение фото' : 'Тело и фото'),
    render(ctx, r) {
      this.back = r.parts[0] === 'compare' ? () => '#/body' : () => '#/profile';
      return r.parts[0] === 'compare' ? compareView(ctx, r) : main(ctx, r);
    },
    bind(root, ctx, r) {
      P.hydrate(root);
      if (r.parts[0] === 'compare') return bindCompare(root, ctx, r);

      const f = root.querySelector('[data-form="body"]');
      const box = f.querySelector('[data-pending]');
      const redrawPending = () => {
        box.innerHTML = pendingHtml();
        box.querySelectorAll('[data-pending-del]').forEach((b) => (b.onclick = () => (URL.revokeObjectURL(pending[b.dataset.pendingDel].url), pending.splice(Number(b.dataset.pendingDel), 1), redrawPending())));
        box.querySelectorAll('[data-pending-angle]').forEach((s) => (s.onchange = () => (pending[s.dataset.pendingAngle].angle = s.value)));
      };
      redrawPending();
      f.querySelector('[data-photo-input]').onchange = (e) => {
        const angle = f.new_angle.value;
        ui.ls.set('last_angle', angle);
        for (const file of e.target.files) pending.push({ file, angle, url: URL.createObjectURL(file) });
        e.target.value = '';
        redrawPending();
      };
      root.querySelectorAll('[data-photo-angle] .chip').forEach((c) => (c.onclick = () => (ui.ls.set('photo_angle', c.dataset.v), ui.render())));
      root.querySelectorAll('[data-open-photo]').forEach((b) => (b.onclick = () => photoSheet(ctx, b.dataset.openPhoto)));

      f.onsubmit = async (e) => {
        e.preventDefault();
        const v = ui.formData(f);
        if (!D.isValid(v.date)) return ui.toast('Укажите дату');
        const row = { profile_id: ctx.profileId, date: v.date, weight_kg: ui.numOrNull(v.weight_kg), waist_cm: ui.numOrNull(v.waist_cm), hips_cm: ui.numOrNull(v.hips_cm), chest_cm: ui.numOrNull(v.chest_cm) };
        const hasMeasure = [row.weight_kg, row.waist_cm, row.hips_cm, row.chest_cm].some((x) => x != null);
        if (!hasMeasure && !pending.length) return ui.toast('Введите вес, объём или добавьте фото');
        const btn = f.querySelector('button.primary');
        btn.disabled = true;
        btn.textContent = 'Сохраняю…';
        const before = HD.svc.nutrition.targetFor(ctx, D.nextMonday(ctx.today));
        if (hasMeasure) HD.db.upsert('body_measurements', (m) => m.profile_id === ctx.profileId && m.date === v.date, row);
        let saved = 0;
        const failed = [];
        for (const p of pending) {
          try {
            await P.add(ctx.profileId, p.file, { date: v.date, angle: p.angle });
            saved++;
          } catch (err) {
            failed.push(p.file.name);
          }
          URL.revokeObjectURL(p.url);
        }
        pending = [];
        const res = row.weight_kg != null ? HD.svc.nutrition.recalc(ctx.profileId, 'Новое взвешивание') : null;
        const parts = [hasMeasure ? 'Замер сохранён' : 'Сохранено'];
        if (saved) parts.push(`фото: ${saved}`);
        if (failed.length) parts.push(`не удалось прочитать: ${failed.join(', ')}`);
        let msg = parts.join(', ') + '.';
        if (res && res.target && !res.unchanged) msg += ` Норма с понедельника: ${before ? num(before.daily_kcal) + ' → ' : ''}${num(res.target.daily_kcal)} ккал.`;
        else if (res && res.unchanged) msg += ' Норма не изменится.';
        else if (res && res.skipped === 'manual') msg += ` Действует ручная норма (авто было бы ${num(res.auto.daily_kcal)}).`;
        await HD.db.flush();
        ui.render();
        ui.sheet(`<h2>Готово</h2><p>${esc(msg)}</p><button class="btn primary block">Ок</button>`, (el, close) => (el.querySelector('button').onclick = close));
      };
    },
  };

  function bindCompare(root, ctx, r) {
    const q = Object.assign({}, r.q);
    const go = (patch) => {
      const n = Object.assign(q, patch);
      const qs = Object.entries(n)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      ui.go('#/body/compare' + (qs ? '?' + qs : ''));
    };
    root.querySelectorAll('[data-cmp-angle]').forEach((b) => (b.onclick = () => (ui.ls.set('cmp_angle', b.dataset.cmpAngle), go({ angle: b.dataset.cmpAngle, a: '', b: '' }))));
    root.querySelectorAll('[data-seg="cmp_mode"] button').forEach((b) => (b.onclick = () => (ui.ls.set('cmp_mode', b.dataset.v), ui.render())));
    root.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => go({ [b.dataset.pick]: b.dataset.id })));
    const angle = q.angle || ui.ls.get('cmp_angle', 'front');
    const photos = P.list(ctx.profileId, angle);
    root.querySelectorAll('[data-preset]').forEach(
      (b) =>
        (b.onclick = () => {
          const def = P.defaultPair(photos);
          const cur = photos.find((p) => p.id === q.b) || def.b;
          if (b.dataset.preset === 'first') return go({ a: def.a.id, b: def.b.id });
          const target = D.addDays(cur.date, -Number(b.dataset.preset));
          const a = P.nearest(photos.filter((p) => p.date < cur.date), target, cur.id);
          if (!a) return ui.toast('Нет более ранних фото этого ракурса');
          go({ a: a.id, b: cur.id });
        }),
    );
    const range = root.querySelector('[data-curtain-range]');
    if (range) {
      const top = root.querySelector('.curtain-top');
      const line = root.querySelector('.curtain-line');
      range.oninput = () => {
        top.style.clipPath = `inset(0 ${100 - range.value}% 0 0)`;
        line.style.left = range.value + '%';
      };
      // Шторку можно тянуть прямо по фото
      const box = root.querySelector('[data-curtain]');
      const move = (x) => {
        const rect = box.getBoundingClientRect();
        range.value = Math.round(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * 100);
        range.oninput();
      };
      box.addEventListener('pointerdown', (e) => {
        move(e.clientX);
        box.setPointerCapture(e.pointerId);
      });
      box.addEventListener('pointermove', (e) => e.buttons && move(e.clientX));
    }
  }
})(window.HD);
