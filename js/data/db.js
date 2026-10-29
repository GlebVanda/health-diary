// Локальное хранилище: все таблицы в одном JSON-объекте, сохраняется в IndexedDB браузера
// (запасной вариант — localStorage). Таблицы повторяют модель данных из раздела 3 ТЗ,
// чтобы потом перенести их в Postgres один к одному.
(function (HD) {
  const TABLES = [
    'profiles',
    'body_measurements',
    'food_days',
    'nutrition_targets',
    'goals',
    'goal_versions',
    'training_preferences',
    'plans',
    'planned_sessions',
    'session_logs',
    'exercises',
    'events',
    'recommendations_log',
    'plan_changes',
    'body_photos',
    'assessments',
    'streaks',
    'streak_days',
  ];
  const DB_NAME = 'health-diary';
  const STORE = 'kv';
  // Фото тела — отдельное хранилище с Blob (полный снимок и миниатюра), чтобы не раздувать JSON
  const PHOTO_STORE = 'photos';
  const KEY = 'state';
  const SCHEMA_VERSION = 2;
  const LEGACY_KEY = 'legacy_backup_v1';

  let state = null;
  let saveTimer = null;
  let idb = null;
  const listeners = new Set();
  // Таблицы с естественным ключом: id строится из ключа, чтобы запись одного и того же дня с двух устройств
  // сливалась в одну, а не дублировалась при синхронизации.
  const NATURAL = {
    food_days: (r) => r.profile_id + ':' + r.date,
    body_measurements: (r) => r.profile_id + ':' + r.date,
    streak_days: (r) => r.streak_id + ':' + r.date,
  };
  const newId = (table, row) => row.id || (NATURAL[table] && row.profile_id && row.date ? NATURAL[table](row) : HD.util.uid());

  function emptyState() {
    const s = { schema: SCHEMA_VERSION, settings: {}, meta: { created_at: new Date().toISOString() } };
    for (const t of TABLES) s[t] = [];
    return s;
  }

  function openIdb() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
          if (!d.objectStoreNames.contains(PHOTO_STORE)) d.createObjectStore(PHOTO_STORE);
        };
        req.onsuccess = () => {
          const d = req.result;
          // Новая версия приложения в другой вкладке просит обновить базу — освобождаем её
          d.onversionchange = () => {
            d.close();
            location.reload();
          };
          resolve(d);
        };
        req.onblocked = () => {
          const el = document.getElementById('app');
          if (el) el.innerHTML = '<div class="lock"><h1>Обновление дневника</h1><p class="muted center">Дневник открыт в другой вкладке. Закройте её — эта страница продолжит загрузку сама.</p></div>';
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function idbGet() {
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(KEY);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function idbPut(value) {
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  }

  // Фото: в IndexedDB, а в режиме тестов или без IndexedDB — в памяти (до перезагрузки)
  const memPhotos = new Map();
  function photoTx(mode, fn) {
    return new Promise((resolve, reject) => {
      try {
        const tx = idb.transaction(PHOTO_STORE, mode);
        const r = fn(tx.objectStore(PHOTO_STORE));
        tx.oncomplete = () => resolve(r && r.result);
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function persist() {
    if (db.memoryOnly) return;
    const json = JSON.stringify(state);
    let ok = false;
    if (idb) ok = await idbPut(json);
    if (!ok) {
      try {
        localStorage.setItem(DB_NAME, json);
      } catch (e) {
        console.warn('Не удалось сохранить данные', e);
      }
    }
  }

  const db = {
    TABLES,
    // memoryOnly — для тестов: ничего не читаем и не пишем на диск
    async init(opts) {
      opts = opts || {};
      if (opts.memoryOnly) {
        state = emptyState();
        db.memoryOnly = true;
        return state;
      }
      idb = await openIdb();
      let raw = idb ? await idbGet() : null;
      if (!raw) {
        try {
          raw = localStorage.getItem(DB_NAME);
        } catch (e) {
          raw = null;
        }
      }
      state = raw ? JSON.parse(raw) : emptyState();
      // Версия 2: демо-данные (Макс и Анна) сброшены. Прежнее состояние сохраняется отдельным ключом
      // и доступно для выгрузки и последующей интеграции.
      if (raw && (state.schema || 1) < 2) {
        if (idb) await new Promise((resolve) => {
          try {
            const tx = idb.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(raw, LEGACY_KEY);
            tx.oncomplete = tx.onerror = () => resolve();
          } catch (e) {
            resolve();
          }
        });
        state = emptyState();
        await persist();
      }
      for (const t of TABLES) if (!state[t]) state[t] = [];
      if (!state.settings) state.settings = {};
      state.schema = SCHEMA_VERSION;
      return state;
    },
    // Прежние данные версии 1 (демо Макс и Анна), если они были: JSON-строка или null
    async legacyBackup() {
      if (!idb) return null;
      return new Promise((resolve) => {
        try {
          const r = idb.transaction(STORE, 'readonly').objectStore(STORE).get(LEGACY_KEY);
          r.onsuccess = () => resolve(r.result || null);
          r.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    },
    // ---- фото ----
    photosPersistent() {
      return !!idb && !db.memoryOnly;
    },
    async putPhoto(id, value) {
      if (!db.photosPersistent()) return memPhotos.set(id, value);
      await photoTx('readwrite', (st) => st.put(value, id));
    },
    async getPhoto(id) {
      if (!db.photosPersistent()) return memPhotos.get(id) || null;
      return (await photoTx('readonly', (st) => st.get(id))) || null;
    },
    async deletePhoto(id) {
      if (!db.photosPersistent()) return memPhotos.delete(id);
      await photoTx('readwrite', (st) => st.delete(id));
    },
    async clearPhotos() {
      memPhotos.clear();
      if (db.photosPersistent()) await photoTx('readwrite', (st) => st.clear());
    },
    get state() {
      return state;
    },
    save() {
      if (db.memoryOnly) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 150);
      listeners.forEach((f) => f());
    },
    async flush() {
      clearTimeout(saveTimer);
      if (!db.memoryOnly) await persist();
    },
    onChange(f) {
      listeners.add(f);
    },
    all(table) {
      return state[table];
    },
    get(table, id) {
      return state[table].find((r) => r.id === id) || null;
    },
    where(table, pred) {
      return state[table].filter(pred);
    },
    // Все чтения профильных данных идут через фильтр по profile_id
    forProfile(table, profileId, pred) {
      return state[table].filter((r) => r.profile_id === profileId && (!pred || pred(r)));
    },
    insert(table, row) {
      const r = Object.assign({ created_at: new Date().toISOString() }, row, { id: newId(table, row) });
      state[table].push(r);
      db.save();
      return r;
    },
    insertMany(table, rows) {
      const out = rows.map((row) => Object.assign({ created_at: new Date().toISOString() }, row, { id: newId(table, row) }));
      state[table].push(...out);
      db.save();
      return out;
    },
    update(table, id, patch) {
      const r = db.get(table, id);
      if (!r) return null;
      Object.assign(r, patch, { updated_at: new Date().toISOString() });
      db.save();
      return r;
    },
    // Upsert по условию совпадения (например, profile_id + date)
    upsert(table, match, row) {
      const existing = state[table].find(match);
      if (existing) {
        Object.assign(existing, row, { updated_at: new Date().toISOString() });
        db.save();
        return { row: existing, created: false };
      }
      return { row: db.insert(table, row), created: true };
    },
    remove(table, id) {
      const i = state[table].findIndex((r) => r.id === id);
      if (i >= 0) state[table].splice(i, 1);
      db.save();
    },
    setting(key, value) {
      if (value === undefined) return state.settings[key];
      state.settings[key] = value;
      db.save();
      return value;
    },
    // Резервная копия вместе с фото (фото — в виде data URL)
    async exportJSON() {
      const photos = {};
      for (const p of state.body_photos) {
        const v = await db.getPhoto(p.id);
        if (v) photos[p.id] = { full: await blobToDataUrl(v.full), thumb: await blobToDataUrl(v.thumb) };
      }
      // Служебные данные синхронизации в копию не входят
      const copy = Object.assign({}, state, { photos_data: photos });
      delete copy.sync;
      return JSON.stringify(copy);
    },
    async importJSON(text) {
      const s = JSON.parse(text);
      if (!s || typeof s !== 'object' || !Array.isArray(s.profiles)) throw new Error('Это не резервная копия дневника');
      for (const t of TABLES) if (!s[t]) s[t] = [];
      const photos = s.photos_data || {};
      delete s.photos_data;
      await db.clearPhotos();
      for (const [id, v] of Object.entries(photos)) {
        await db.putPhoto(id, { full: await (await fetch(v.full)).blob(), thumb: await (await fetch(v.thumb)).blob() });
      }
      const prevSync = state && state.sync;
      state = s;
      if (prevSync) state.sync = prevSync;
      else delete state.sync;
      await persist();
      listeners.forEach((f) => f());
    },
    // Только для тестов: подменить состояние и хранилище фото (имитация второго устройства)
    _swap(next) {
      const prev = { state, photos: new Map(memPhotos) };
      state = next.state;
      memPhotos.clear();
      next.photos.forEach((v, k) => memPhotos.set(k, v));
      return prev;
    },
    async reset() {
      await db.clearPhotos();
      state = emptyState();
      await persist();
    },
  };

  HD.db = db;
})(window.HD);
