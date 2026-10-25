// Фото тела: сжатие в браузере, хранение в IndexedDB (Blob), миниатюры, подбор пар для сравнения.
// Строка в таблице body_photos — описание снимка; сами изображения лежат в отдельном хранилище по id.
(function (HD) {
  const D = HD.dates;
  const db = HD.db;

  const ANGLES = [
    ['front', 'Спереди'],
    ['side', 'Сбоку'],
    ['back', 'Сзади'],
    ['other', 'Другое'],
  ];
  const FULL_MAX = 1600;
  const THUMB_MAX = 360;
  const FIELDS = [
    ['weight_kg', 'Вес', 'кг'],
    ['waist_cm', 'Талия', 'см'],
    ['hips_cm', 'Бёдра', 'см'],
    ['chest_cm', 'Грудь', 'см'],
  ];

  function angleLabel(a) {
    return (ANGLES.find((x) => x[0] === a) || ANGLES[3])[1];
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('Не удалось прочитать изображение')));
      img.src = url;
    });
  }

  function resize(img, max, quality) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => c.toBlob((b) => resolve({ blob: b, w, h }), 'image/jpeg', quality));
  }

  // Сжатие: полный снимок до 1600 px по длинной стороне, миниатюра до 360 px
  async function process(file) {
    const { img, url } = await loadImage(file);
    try {
      const full = await resize(img, FULL_MAX, 0.85);
      const thumb = await resize(img, THUMB_MAX, 0.75);
      return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function add(profileId, file, meta) {
    const p = await process(file);
    const id = HD.util.uid();
    await db.putPhoto(id, { full: p.full, thumb: p.thumb });
    return db.insert('body_photos', {
      id,
      profile_id: profileId,
      date: meta.date,
      angle: meta.angle || 'front',
      note: meta.note || null,
      width: p.width,
      height: p.height,
      size_kb: Math.round(p.full.size / 1024),
    });
  }

  async function remove(id) {
    await db.deletePhoto(id);
    db.remove('body_photos', id);
    for (const size of ['full', 'thumb']) {
      const k = id + ':' + size;
      if (urls.has(k)) URL.revokeObjectURL(urls.get(k));
      urls.delete(k);
    }
  }

  function update(id, patch) {
    return db.update('body_photos', id, patch);
  }

  function list(profileId, angle) {
    return db
      .forProfile('body_photos', profileId, (p) => !angle || angle === 'all' || p.angle === angle)
      .sort((a, b) => (a.date === b.date ? ((a.created_at || '') < (b.created_at || '') ? -1 : 1) : a.date < b.date ? -1 : 1));
  }

  // Кэш object URL, чтобы не создавать их при каждой перерисовке
  const urls = new Map();
  async function url(id, size) {
    const k = id + ':' + size;
    if (urls.has(k)) return urls.get(k);
    let v = await db.getPhoto(id);
    // Фото, сделанное на другом устройстве: скачиваем из облака и кэшируем здесь
    if (!v && HD.sync) v = await HD.sync.fetchPhoto(id);
    if (!v || !v[size]) return null;
    const u = URL.createObjectURL(v[size]);
    urls.set(k, u);
    return u;
  }

  // Подставляет изображения в <img data-photo="id" data-size="thumb|full"> после отрисовки
  function hydrate(root) {
    root.querySelectorAll('img[data-photo]').forEach(async (img) => {
      const u = await url(img.dataset.photo, img.dataset.size || 'thumb');
      if (u) img.src = u;
      else img.alt = 'Фото не найдено';
    });
  }

  // ---- чистые функции для сравнения ----

  // Последнее известное значение каждого замера на дату (не позже даты)
  function measurementsAt(measurements, date) {
    const out = {};
    for (const [k] of FIELDS) {
      const rows = measurements.filter((m) => m.date <= date && m[k] != null);
      out[k] = rows.length ? { value: Number(rows[rows.length - 1][k]), date: rows[rows.length - 1].date } : null;
    }
    return out;
  }

  function diff(measurements, dateA, dateB) {
    const a = measurementsAt(measurements, dateA);
    const b = measurementsAt(measurements, dateB);
    return FIELDS.map(([k, label, unit]) => ({
      key: k,
      label,
      unit,
      a: a[k],
      b: b[k],
      delta: a[k] && b[k] ? Math.round((b[k].value - a[k].value) * 10) / 10 : null,
    }));
  }

  // Снимок того же ракурса, ближайший к дате (для пресетов «месяц назад» и т.п.)
  function nearest(photos, date, exceptId) {
    let best = null;
    for (const p of photos) {
      if (p.id === exceptId) continue;
      if (!best || Math.abs(D.diffDays(p.date, date)) < Math.abs(D.diffDays(best.date, date))) best = p;
    }
    return best;
  }

  // Пара по умолчанию: самый ранний и самый поздний снимок ракурса
  function defaultPair(photos) {
    if (!photos.length) return { a: null, b: null };
    return { a: photos[0], b: photos.length > 1 ? photos[photos.length - 1] : null };
  }

  HD.photos = { ANGLES, FIELDS, angleLabel, process, add, remove, update, list, url, hydrate, measurementsAt, diff, nearest, defaultPair };
})(window.HD);
