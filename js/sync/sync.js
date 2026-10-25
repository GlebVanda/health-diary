// Синхронизация локальной базы с Supabase.
//
// Приложение остаётся «локальным в первую очередь»: все экраны работают с IndexedDB и мгновенно, а этот модуль
// в фоне отправляет изменения в облако и забирает чужие. Так приложение работает и без сети.
//
// Как это устроено:
//  - В облаке одна таблица records (user_id, tbl, id, data jsonb, deleted, updated_at): каждая строка локальных
//    таблиц — одна запись. Структура локальных таблиц не меняется, миграции в Supabase не нужны.
//  - Изменения находятся сравнением хэшей строк с тем, что уже отправлено (state.sync.hashes), поэтому не важно,
//    каким способом код изменил строку.
//  - Удаления отправляются как «надгробия» (deleted = true), чтобы другие устройства тоже удалили запись.
//  - Порядок: сначала отправка своих изменений, потом получение чужих. Конфликт одной записи решается по принципу
//    «последним синхронизировался — тот и прав» (для одного пользователя на 2–3 устройствах этого достаточно).
//  - Фото лежат в Supabase Storage (бакет photos, папка = id пользователя) и скачиваются по требованию.
(function (HD) {
  const db = HD.db;
  const sb = HD.sb;
  const PAGE = 1000;
  const CHUNK = 200;
  const EXCLUDED = ['exercises']; // библиотека упражнений одинакова на всех устройствах и приходит вместе с приложением

  const status = { state: 'off', last_ok: null, error: null, pending: 0, applied: 0 };
  const listeners = new Set();
  let timer = null;
  let running = null;
  let applying = false;
  let again = false;

  const tables = () => db.TABLES.filter((t) => !EXCLUDED.includes(t));

  function emit(patch) {
    Object.assign(status, patch);
    listeners.forEach((f) => {
      try {
        f(status);
      } catch (e) {}
    });
  }

  // Быстрый нестойкий хэш строки (cyrb53): нужен только чтобы заметить изменение
  function hash(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // Каноничная запись объекта: ключи отсортированы, потому что jsonb в базе меняет их порядок
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  const rowHash = (row) => hash(canon(row));

  function meta() {
    const st = db.state;
    if (!st.sync) st.sync = { hashes: {}, cursor: null, photos: {}, user: null };
    return st.sync;
  }

  // Что изменилось локально с прошлой отправки
  function scan() {
    const m = meta();
    const up = [];
    const seen = new Set();
    for (const t of tables()) {
      for (const r of db.state[t]) {
        const key = t + '|' + r.id;
        seen.add(key);
        const h = rowHash(r);
        if (m.hashes[key] !== h) up.push({ tbl: t, id: r.id, data: r, h });
      }
    }
    const del = [];
    for (const key of Object.keys(m.hashes)) if (!seen.has(key)) del.push(key);
    return { up, del };
  }

  function pendingCount() {
    if (!db.state) return 0;
    const s = scan();
    return s.up.length + s.del.length;
  }

  // ---- фото ----
  const photoPath = (id, size) => sb.user().id + '/' + id + '/' + size + '.jpg';

  async function pushPhotos() {
    const m = meta();
    for (const p of db.state.body_photos) {
      if (m.photos[p.id]) continue;
      const v = await db.getPhoto(p.id);
      if (!v) continue; // блоба нет локально (загрузится с сервера по требованию)
      await sb.uploadPhoto(photoPath(p.id, 'full'), v.full);
      await sb.uploadPhoto(photoPath(p.id, 'thumb'), v.thumb);
      m.photos[p.id] = true;
    }
  }

  // Скачать фото, которого нет на этом устройстве
  async function fetchPhoto(id) {
    if (!sb.enabled() || !sb.signedIn()) return null;
    try {
      const full = await sb.downloadPhoto(photoPath(id, 'full'));
      const thumb = await sb.downloadPhoto(photoPath(id, 'thumb'));
      await db.putPhoto(id, { full, thumb });
      meta().photos[id] = true;
      return { full, thumb };
    } catch (e) {
      return null;
    }
  }

  async function push() {
    const m = meta();
    const { up, del } = scan();
    const user = sb.user().id;
    const rows = up.map((x) => ({ user_id: user, tbl: x.tbl, id: x.id, data: x.data, deleted: false }));
    for (let i = 0; i < rows.length; i += CHUNK) await sb.upsertRecords(rows.slice(i, i + CHUNK));
    for (const x of up) m.hashes[x.tbl + '|' + x.id] = x.h;
    const tomb = del.map((key) => {
      const [tbl, ...rest] = key.split('|');
      return { user_id: user, tbl, id: rest.join('|'), data: null, deleted: true };
    });
    for (let i = 0; i < tomb.length; i += CHUNK) await sb.upsertRecords(tomb.slice(i, i + CHUNK));
    const goneIds = [];
    for (const key of del) {
      delete m.hashes[key];
      if (key.startsWith('body_photos|')) goneIds.push(key.split('|')[1]);
    }
    if (goneIds.length) {
      try {
        await sb.removePhotos(goneIds.flatMap((id) => [photoPath(id, 'full'), photoPath(id, 'thumb')]));
      } catch (e) {}
      goneIds.forEach((id) => delete m.photos[id]);
    }
    await pushPhotos();
    return up.length + del.length;
  }

  // Применить записи с сервера. Возвращает число реально изменённых локальных строк
  function apply(records) {
    const m = meta();
    let changed = 0;
    applying = true;
    try {
      for (const rec of records) {
        if (!tables().includes(rec.tbl)) continue;
        const arr = db.state[rec.tbl];
        const key = rec.tbl + '|' + rec.id;
        const i = arr.findIndex((r) => r.id === rec.id);
        if (rec.deleted) {
          if (i >= 0) {
            arr.splice(i, 1);
            changed++;
            if (rec.tbl === 'body_photos') db.deletePhoto(rec.id);
          }
          delete m.hashes[key];
          continue;
        }
        if (!rec.data) continue;
        const h = rowHash(rec.data);
        // Локальная копия уже совпадает с серверной
        if (i >= 0 && rowHash(arr[i]) === h) {
          m.hashes[key] = h;
          continue;
        }
        if (i >= 0) arr[i] = rec.data;
        else arr.push(rec.data);
        m.hashes[key] = h;
        changed++;
      }
    } finally {
      applying = false;
    }
    return changed;
  }

  async function pull() {
    const m = meta();
    let total = 0;
    let offset = 0;
    let maxTs = m.cursor;
    for (;;) {
      const page = (await sb.pullRecords(m.cursor, offset, PAGE)) || [];
      total += apply(page);
      for (const rec of page) if (!maxTs || rec.updated_at > maxTs) maxTs = rec.updated_at;
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    m.cursor = maxTs;
    return total;
  }

  // Один полный цикл: отправить своё, получить чужое
  async function syncNow() {
    if (!sb.enabled() || !sb.signedIn() || !db.state) return { skipped: true };
    if (running) {
      again = true;
      return running;
    }
    const attempt = (async () => {
      emit({ state: 'syncing', error: null });
      try {
        const m = meta();
        // Данные другого аккаунта на этом устройстве смешивать нельзя
        if (m.user && m.user !== sb.user().id) throw new Error('На этом устройстве данные другого аккаунта: выйдите и войдите заново');
        m.user = sb.user().id;
        const pushed = await push();
        const pulled = await pull();
        await db.flush();
        emit({ state: 'idle', last_ok: new Date().toISOString(), pending: 0, applied: pulled });
        if (pulled) listeners.forEach((f) => f(status, { pulled }));
        return { pushed, pulled };
      } catch (e) {
        const offline = e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message));
        emit({ state: offline ? 'offline' : 'error', error: offline ? 'Нет связи с сервером. Изменения сохранены на устройстве и отправятся позже.' : e.message, pending: pendingCount() });
        if (sb.session() == null) emit({ state: 'off' });
        throw e;
      }
    })();
    // Освобождаем «замок» уже после присвоения (иначе синхронная ошибка оставила бы его занятым навсегда)
    running = attempt;
    const release = () => {
      running = null;
      if (again) {
        again = false;
        schedule(500);
      }
    };
    attempt.then(release, release);
    return attempt;
  }

  // Отложенный запуск: после серии изменений отправляем один раз
  function schedule(delay) {
    if (!sb.enabled() || !sb.signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(() => {}), delay == null ? 2000 : delay);
  }

  // Удалить все данные профиля пользователя и в облаке (другие устройства получат удаления)
  async function deleteEverywhere() {
    if (sb.enabled() && sb.signedIn()) {
      for (const t of tables()) db.state[t].length = 0;
      await push();
    }
    await db.clearPhotos();
  }

  async function signOutAndWipe() {
    clearTimeout(timer);
    await sb.signOut();
    await db.reset();
    emit({ state: 'off', last_ok: null, error: null, pending: 0 });
  }

  // Подписка на изменения статуса. Второй аргумент {pulled} — пришли чужие данные
  function onStatus(f) {
    listeners.add(f);
    return () => listeners.delete(f);
  }

  function start() {
    if (!sb.enabled()) return emit({ state: 'off' });
    emit({ state: sb.signedIn() ? 'idle' : 'off' });
    db.onChange(() => {
      if (!applying) schedule();
    });
    // При возвращении в приложение, появлении сети и раз в минуту — обмен с сервером
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(300));
    window.addEventListener('online', () => schedule(300));
    setInterval(() => document.visibilityState === 'visible' && schedule(0), 60000);
  }

  HD.sync = { status, scan, hash, rowHash, canon, syncNow, schedule, fetchPhoto, deleteEverywhere, signOutAndWipe, onStatus, start, pendingCount, meta };
})(window.HD);
