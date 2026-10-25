// Клиент Supabase без внешних библиотек: вход по email и паролю (GoTrue), таблица records (PostgREST), хранилище фото (Storage).
// Работает через обычный fetch, поэтому его просто тестировать подменой fetch.
(function (HD) {
  const SESSION_KEY = 'hd_session';
  let fetchImpl = null;
  let session = null;

  const cfg = () => window.HD_CONFIG || {};

  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) {
      session = null;
    }
  }

  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  // Понятные сообщения вместо технических ответов сервера
  function human(status, body) {
    const raw = String((body && (body.msg || body.error_description || body.message || body.error)) || '');
    const m = raw.toLowerCase();
    if (/invalid login credentials/.test(m)) return 'Неверная почта или пароль';
    if (/already registered|already been registered/.test(m)) return 'Эта почта уже зарегистрирована: нажмите «Войти»';
    if (/email not confirmed/.test(m)) return 'Почта не подтверждена: откройте письмо от сервиса и перейдите по ссылке';
    if (/password should be at least/.test(m)) return 'Пароль слишком короткий: нужно не меньше 6 символов';
    if (/rate limit|too many/.test(m) || status === 429) return 'Слишком много попыток, попробуйте через несколько минут';
    if (/unable to validate email|invalid.*email/.test(m)) return 'Проверьте адрес почты';
    if (/signups? (are )?(not allowed|disabled)/.test(m)) return 'Регистрация новых аккаунтов отключена в Supabase';
    return raw || 'Ошибка сервера (' + status + ')';
  }

  class HttpError extends Error {
    constructor(status, body) {
      super(human(status, body));
      this.status = status;
      this.body = body;
    }
  }

  const sb = {
    HttpError,
    configured() {
      const c = cfg();
      return !!(c.supabaseUrl && c.supabaseAnonKey);
    },
    // Синхронизация включается только на разрешённых адресах (или на любых, если список пуст)
    hostAllowed() {
      const hosts = cfg().hosts || [];
      return !hosts.length || hosts.includes(location.hostname);
    },
    enabled() {
      return sb.configured() && sb.hostAllowed();
    },
    // Для тестов: подменить fetch
    setFetch(f) {
      fetchImpl = f;
    },
    session: () => session,
    user: () => (session ? session.user : null),
    signedIn: () => !!(session && session.refresh_token),
    setSession: saveSession,
    loadSession,

    async raw(path, opts) {
      opts = opts || {};
      const c = cfg();
      const url = c.supabaseUrl.replace(/\/+$/, '') + path;
      const doFetch = fetchImpl || ((...a) => window.fetch(...a));
      const headers = Object.assign({ apikey: c.supabaseAnonKey }, opts.headers || {});
      const token = opts.anon ? c.supabaseAnonKey : session && session.access_token ? session.access_token : c.supabaseAnonKey;
      headers.Authorization = 'Bearer ' + token;
      if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
      return doFetch(url, { method: opts.method || 'GET', headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body });
    },

    // Запрос с автоматическим обновлением токена при 401. as: 'json' | 'blob' | 'none'
    async request(path, opts) {
      opts = opts || {};
      await sb.ensureFresh();
      let res = await sb.raw(path, opts);
      if (res.status === 401 && !opts.anon && session && session.refresh_token && !opts._retried) {
        await sb.refresh();
        res = await sb.raw(path, Object.assign({}, opts, { _retried: true }));
      }
      if (!res.ok) {
        let body = null;
        try {
          body = await res.json();
        } catch (e) {}
        throw new HttpError(res.status, body);
      }
      if (opts.as === 'blob') return res.blob();
      if (opts.as === 'none' || res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },

    // Обновить токен заранее, если он истекает в ближайшую минуту
    async ensureFresh() {
      if (session && session.expires_at && session.expires_at - 60 < Date.now() / 1000 && session.refresh_token) await sb.refresh();
    },

    _adopt(data) {
      const expiresAt = data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt, user: { id: data.user.id, email: data.user.email } });
    },

    async signUp(email, password) {
      const data = await sb.request('/auth/v1/signup', { method: 'POST', anon: true, json: { email, password } });
      if (data && data.access_token) {
        sb._adopt(data);
        return { signedIn: true };
      }
      // Подтверждение почты включено: нужно перейти по ссылке из письма
      return { signedIn: false, needsConfirm: true };
    },

    async signIn(email, password) {
      const data = await sb.request('/auth/v1/token?grant_type=password', { method: 'POST', anon: true, json: { email, password } });
      sb._adopt(data);
      return { signedIn: true };
    },

    async refresh() {
      if (!session || !session.refresh_token) throw new Error('Нет сессии');
      try {
        const res = await sb.raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', anon: true, json: { refresh_token: session.refresh_token } });
        if (!res.ok) {
          let body = null;
          try {
            body = await res.json();
          } catch (e) {}
          // Сессия отозвана или истекла: нужен новый вход. Сетевые ошибки сюда не попадают (fetch бросит исключение)
          if (res.status === 400 || res.status === 401 || res.status === 403) saveSession(null);
          throw new HttpError(res.status, body);
        }
        sb._adopt(await res.json());
      } catch (e) {
        throw e;
      }
    },

    async recover(email) {
      await sb.request('/auth/v1/recover', { method: 'POST', anon: true, json: { email }, as: 'none' });
    },

    async signOut() {
      try {
        if (session) await sb.raw('/auth/v1/logout', { method: 'POST' });
      } catch (e) {}
      saveSession(null);
    },

    // ---- таблица records ----
    async upsertRecords(rows) {
      await sb.request('/rest/v1/records?on_conflict=user_id,tbl,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        json: rows,
        as: 'none',
      });
    },

    async pullRecords(cursor, offset, limit) {
      let q = '/rest/v1/records?select=tbl,id,data,deleted,updated_at&order=updated_at.asc,tbl.asc,id.asc&limit=' + limit + '&offset=' + offset;
      if (cursor) q += '&updated_at=gte.' + encodeURIComponent(cursor);
      return sb.request(q);
    },

    // ---- фото (Storage, бакет photos, папка = id пользователя) ----
    async uploadPhoto(path, blob) {
      await sb.request('/storage/v1/object/photos/' + path, { method: 'POST', headers: { 'x-upsert': 'true', 'Content-Type': blob.type || 'image/jpeg' }, body: blob, as: 'none' });
    },
    async downloadPhoto(path) {
      return sb.request('/storage/v1/object/authenticated/photos/' + path, { as: 'blob' });
    },
    async removePhotos(paths) {
      await sb.request('/storage/v1/object/photos', { method: 'DELETE', json: { prefixes: paths }, as: 'none' });
    },
  };

  sb.loadSession();
  HD.sb = sb;
})(window.HD);
