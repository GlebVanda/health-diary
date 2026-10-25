// Синхронизация с облаком: вход, обмен между двумя «устройствами», удаления, конфликты, фото, обрыв связи.
// Вместо настоящего Supabase используется поддельный сервер (fetch), который повторяет нужную часть его API.
(function (HD) {
  const sb = HD.sb;
  const savedSession = localStorage.getItem('hd_session');
  const savedCfg = window.HD_CONFIG;

  // Как jsonb в Postgres: порядок ключей в объектах не сохраняется
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, sortKeys(v[k])]));
    return v;
  }

  function makeServer() {
    const S = { rows: new Map(), files: new Map(), tokens: new Map(), refresh: new Map(), users: { 'a@b.ru': { id: 'u1', password: 'secret1' } }, fail: false, confirm: false, clock: 0, calls: [] };
    const json = (body, status) => new Response(body == null ? null : JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    const issue = (user, email) => {
      const access = 'acc-' + ++S.clock;
      const refresh = 'ref-' + S.clock;
      S.tokens.set(access, user.id);
      S.refresh.set(refresh, { id: user.id, email });
      return { access_token: access, refresh_token: refresh, expires_in: 3600, user: { id: user.id, email } };
    };
    const ts = () => new Date(Date.UTC(2026, 9, 25, 12, 0, 0) + ++S.clock * 1000).toISOString().replace('Z', '123+00:00');
    S.fetch = async (url, init) => {
      if (S.fail) throw new TypeError('Failed to fetch');
      init = init || {};
      const u = new URL(url);
      const path = u.pathname;
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      S.calls.push(init.method + ' ' + path);
      if (path === '/auth/v1/signup') {
        if (S.users[body.email]) return json({ msg: 'User already registered' }, 422);
        S.users[body.email] = { id: 'u' + (Object.keys(S.users).length + 1), password: body.password };
        return S.confirm ? json({ id: S.users[body.email].id, email: body.email }) : json(issue(S.users[body.email], body.email));
      }
      if (path === '/auth/v1/token') {
        const grant = u.searchParams.get('grant_type');
        if (grant === 'password') {
          const user = S.users[body.email];
          if (!user || user.password !== body.password) return json({ error_description: 'Invalid login credentials' }, 400);
          return json(issue(user, body.email));
        }
        const r = S.refresh.get(body.refresh_token);
        if (!r) return json({ error_description: 'Invalid Refresh Token' }, 400);
        return json(issue({ id: r.id }, r.email));
      }
      if (path === '/auth/v1/logout' || path === '/auth/v1/recover') return json(null, 204);
      // дальше нужна авторизация
      const auth = (init.headers || {}).Authorization || '';
      const uid = S.tokens.get(auth.replace('Bearer ', ''));
      if (!uid) return json({ message: 'JWT expired' }, 401);
      if (path === '/rest/v1/records' && init.method === 'POST') {
        const stamp = ts();
        for (const r of body) {
          if (r.user_id !== uid) return json({ message: 'RLS' }, 403);
          S.rows.set(uid + '|' + r.tbl + '|' + r.id, { tbl: r.tbl, id: r.id, data: r.data ? sortKeys(JSON.parse(JSON.stringify(r.data))) : null, deleted: !!r.deleted, updated_at: stamp, user_id: uid });
        }
        return new Response(null, { status: 201 });
      }
      if (path === '/rest/v1/records') {
        let list = [...S.rows.values()].filter((r) => r.user_id === uid);
        const f = u.searchParams.get('updated_at');
        if (f) list = list.filter((r) => r.updated_at >= f.replace('gte.', ''));
        list.sort((x, y) => (x.updated_at < y.updated_at ? -1 : x.updated_at > y.updated_at ? 1 : x.tbl < y.tbl ? -1 : x.tbl > y.tbl ? 1 : x.id < y.id ? -1 : 1));
        const off = Number(u.searchParams.get('offset') || 0);
        const lim = Number(u.searchParams.get('limit') || 1000);
        return json(list.slice(off, off + lim).map(({ user_id, ...rest }) => rest));
      }
      if (path.startsWith('/storage/v1/object/photos/') && init.method === 'POST') {
        S.files.set(decodeURIComponent(path.replace('/storage/v1/object/photos/', '')), body);
        return json({ Key: 'ok' });
      }
      if (path.startsWith('/storage/v1/object/authenticated/photos/')) {
        const f = S.files.get(decodeURIComponent(path.replace('/storage/v1/object/authenticated/photos/', '')));
        return f ? new Response(f, { status: 200 }) : json({ message: 'Not found' }, 404);
      }
      if (path === '/storage/v1/object/photos' && init.method === 'DELETE') {
        for (const p of body.prefixes) S.files.delete(p);
        return json([]);
      }
      return json({ message: 'unknown ' + path }, 404);
    };
    return S;
  }

  // «Устройства» — отдельные локальные базы с общим сервером
  let server;
  let A;
  let B;
  let cur;
  function use(dev) {
    if (cur === dev) return;
    const snap = HD.db._swap(dev);
    cur.state = snap.state;
    cur.photos = snap.photos;
    cur = dev;
  }
  async function setup() {
    server = makeServer();
    window.HD_CONFIG = { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'anon', hosts: [] };
    sb.setFetch(server.fetch);
    sb.setSession(null);
    await HD.db.init({ memoryOnly: true });
    HD.seed.seed();
    A = { state: HD.db.state, photos: new Map() };
    await HD.db.init({ memoryOnly: true });
    HD.seed.seed();
    B = { state: HD.db.state, photos: new Map() };
    cur = B;
    await sb.signIn('a@b.ru', 'secret1');
  }
  const blob = (t) => new Blob([t], { type: 'image/jpeg' });
  const rowsOf = (tbl) => [...server.rows.values()].filter((r) => r.tbl === tbl && !r.deleted);

  describe('Облако: вход', () => {
    it('включается только когда указаны адрес и ключ, на разрешённых адресах', () => {
      window.HD_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', hosts: [] };
      expect(sb.enabled()).toBeFalsy();
      window.HD_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k', hosts: [] };
      expect(sb.enabled()).toBeTruthy();
      window.HD_CONFIG.hosts = ['prod.example.com'];
      expect(sb.enabled()).toBeFalsy();
      window.HD_CONFIG.hosts = [location.hostname];
      expect(sb.enabled()).toBeTruthy();
    });
    it('вход: ошибки понятны, успешный вход сохраняет сессию', async () => {
      server = makeServer();
      window.HD_CONFIG = { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'anon', hosts: [] };
      sb.setFetch(server.fetch);
      sb.setSession(null);
      let err = null;
      try {
        await sb.signIn('a@b.ru', 'wrong');
      } catch (e) {
        err = e;
      }
      expect(err.message).toBe('Неверная почта или пароль');
      expect(sb.signedIn()).toBeFalsy();
      await sb.signIn('a@b.ru', 'secret1');
      expect(sb.signedIn()).toBeTruthy();
      expect(sb.user().email).toBe('a@b.ru');
      expect(JSON.parse(localStorage.getItem('hd_session')).user.id).toBe('u1');
    });
    it('регистрация: сразу вход или просьба подтвердить почту; повторная — понятная ошибка', async () => {
      const r1 = await sb.signUp('new@b.ru', 'secret2');
      expect(r1.signedIn).toBeTruthy();
      server.confirm = true;
      const r2 = await sb.signUp('new2@b.ru', 'secret3');
      expect(r2.needsConfirm).toBeTruthy();
      let err = null;
      try {
        await sb.signUp('new@b.ru', 'secret2');
      } catch (e) {
        err = e;
      }
      expect(err.message).toContain('уже зарегистрирована');
    });
    it('истёкший токен обновляется сам; отозванный — выводит из аккаунта', async () => {
      server = makeServer();
      sb.setFetch(server.fetch);
      await sb.signIn('a@b.ru', 'secret1');
      const s = Object.assign({}, sb.session(), { expires_at: Math.floor(Date.now() / 1000) - 10 });
      sb.setSession(s);
      await sb.request('/rest/v1/records?limit=1');
      expect(sb.session().access_token !== s.access_token).toBeTruthy();
      sb.setSession(Object.assign({}, sb.session(), { refresh_token: 'revoked', expires_at: 1 }));
      let err = null;
      try {
        await sb.request('/rest/v1/records?limit=1');
      } catch (e) {
        err = e;
      }
      expect(!!err).toBeTruthy();
      expect(sb.signedIn()).toBeFalsy();
    });
  });

  describe('Облако: обмен между устройствами', () => {
    it('порядок ключей не влияет на сравнение строк', () => {
      expect(HD.sync.canon({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } })).toBe(HD.sync.canon({ a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 }));
    });
    it('данные одного устройства появляются на другом', async () => {
      await setup();
      use(A);
      const p = HD.svc.onboarding.create('Алекс');
      HD.svc.onboarding.saveAssessment(p.id, { name: 'Алекс', sex: 'm', birth_date: '1990-01-01', height_cm: 180, weight_kg: 90 });
      HD.svc.nutrition.saveFood(p.id, '2026-10-20', { kcal: 2000 });
      const r = await HD.sync.syncNow();
      expect(r.pushed > 3).toBeTruthy();
      expect(rowsOf('exercises').length).toBe(0);
      use(B);
      expect(HD.db.all('profiles').length).toBe(0);
      const r2 = await HD.sync.syncNow();
      expect(r2.pulled > 3).toBeTruthy();
      expect(HD.db.all('profiles').map((x) => x.name)).toEqual(['Алекс']);
      expect(HD.db.all('food_days')[0].kcal).toBe(2000);
      expect(HD.db.all('assessments').length).toBe(1);
      // повторный обмен ничего не меняет и не шлёт
      const r3 = await HD.sync.syncNow();
      expect(r3.pushed).toBe(0);
      expect(r3.pulled).toBe(0);
    });
    it('правки и удаления доходят до других устройств', async () => {
      use(B);
      const pid = HD.db.all('profiles')[0].id;
      HD.svc.nutrition.saveFood(pid, '2026-10-20', { kcal: 1850 });
      HD.svc.nutrition.saveFood(pid, '2026-10-21', { kcal: 2100 });
      await HD.sync.syncNow();
      use(A);
      await HD.sync.syncNow();
      expect(HD.db.all('food_days').map((f) => f.kcal).sort()).toEqual([1850, 2100]);
      HD.svc.nutrition.saveFood(pid, '2026-10-21', { kcal: '' });
      await HD.sync.syncNow();
      use(B);
      await HD.sync.syncNow();
      expect(HD.db.all('food_days').length).toBe(1);
      expect(HD.db.all('food_days')[0].kcal).toBe(1850);
    });
    it('запись одного и того же дня с двух устройств не дублируется', async () => {
      const pid = HD.db.all('profiles')[0].id;
      use(A);
      HD.svc.nutrition.saveFood(pid, '2026-10-22', { kcal: 1700 });
      use(B);
      HD.svc.nutrition.saveFood(pid, '2026-10-22', { kcal: 1900 });
      await HD.sync.syncNow();
      use(A);
      await HD.sync.syncNow();
      await HD.sync.syncNow();
      use(B);
      await HD.sync.syncNow();
      for (const dev of [A, B]) {
        use(dev);
        const days = HD.db.all('food_days').filter((f) => f.date === '2026-10-22');
        expect(days.length).toBe(1);
      }
      expect(rowsOf('food_days').filter((r) => r.data.date === '2026-10-22').length).toBe(1);
      use(A);
      const a = HD.db.all('food_days').find((f) => f.date === '2026-10-22').kcal;
      use(B);
      expect(HD.db.all('food_days').find((f) => f.date === '2026-10-22').kcal).toBe(a);
    });
    it('нет связи: изменения не теряются и уходят позже', async () => {
      use(A);
      const pid = HD.db.all('profiles')[0].id;
      HD.svc.nutrition.saveFood(pid, '2026-10-23', { kcal: 2222 });
      expect(HD.sync.pendingCount()).toBe(1);
      server.fail = true;
      let err = null;
      try {
        await HD.sync.syncNow();
      } catch (e) {
        err = e;
      }
      expect(!!err).toBeTruthy();
      expect(HD.sync.status.state).toBe('offline');
      expect(HD.sync.pendingCount()).toBe(1);
      server.fail = false;
      const r = await HD.sync.syncNow();
      expect(r.pushed).toBe(1);
      expect(HD.sync.pendingCount()).toBe(0);
      expect(HD.sync.status.state).toBe('idle');
      use(B);
      await HD.sync.syncNow();
      expect(HD.db.all('food_days').some((f) => f.kcal === 2222)).toBeTruthy();
    });
    it('чужой аккаунт на устройстве не смешивается', async () => {
      use(A);
      const saved = sb.session();
      sb.setSession(Object.assign({}, saved, { user: { id: 'u-other', email: 'x@y.ru' } }));
      let err = null;
      try {
        await HD.sync.syncNow();
      } catch (e) {
        err = e;
      }
      expect(err.message).toContain('другого аккаунта');
      sb.setSession(saved);
    });
  });

  describe('Облако: фото', () => {
    it('фото с одного устройства скачиваются на другом по требованию, удаление доходит', async () => {
      use(A);
      const pid = HD.db.all('profiles')[0].id;
      const row = HD.db.insert('body_photos', { id: 'ph1', profile_id: pid, date: '2026-10-20', angle: 'front' });
      await HD.db.putPhoto(row.id, { full: blob('FULL'), thumb: blob('THUMB') });
      await HD.sync.syncNow();
      expect([...server.files.keys()].sort()).toEqual(['u1/ph1/full.jpg', 'u1/ph1/thumb.jpg']);
      use(B);
      await HD.sync.syncNow();
      expect(HD.db.all('body_photos').length).toBe(1);
      expect(await HD.db.getPhoto('ph1')).toBeNull();
      const url = await HD.photos.url('ph1', 'thumb');
      expect(!!url).toBeTruthy();
      expect(!!(await HD.db.getPhoto('ph1'))).toBeTruthy();
      expect(await (await HD.db.getPhoto('ph1')).thumb.text()).toBe('THUMB');
      // удаление
      await HD.photos.remove('ph1');
      await HD.sync.syncNow();
      expect(server.files.size).toBe(0);
      use(A);
      await HD.sync.syncNow();
      expect(HD.db.all('body_photos').length).toBe(0);
      expect(await HD.db.getPhoto('ph1')).toBeNull();
    });
  });

  describe('Облако: выход и удаление', () => {
    it('«удалить везде» стирает данные и на других устройствах', async () => {
      use(A);
      await HD.sync.deleteEverywhere();
      await HD.db.reset();
      use(B);
      await HD.sync.syncNow();
      expect(HD.db.all('profiles').length).toBe(0);
      expect(HD.db.all('food_days').length).toBe(0);
      expect(rowsOf('profiles').length).toBe(0);
    });
    it('выход очищает данные на устройстве и сессию', async () => {
      use(A);
      HD.db.insert('profiles', { name: 'Тест' });
      await HD.sync.signOutAndWipe();
      expect(HD.db.all('profiles').length).toBe(0);
      expect(sb.signedIn()).toBeFalsy();
    });
    it('восстановление окружения тестов', () => {
      sb.setFetch(null);
      window.HD_CONFIG = savedCfg;
      if (savedSession) localStorage.setItem('hd_session', savedSession);
      else localStorage.removeItem('hd_session');
      sb.loadSession();
      expect(true).toBeTruthy();
    });
  });
})(window.HD);
