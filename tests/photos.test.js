// Фото тела: сжатие, хранение, сопоставление снимков из разных периодов, резервная копия с фото.
(function (HD) {
  const P = HD.photos;

  function makeImage(w, h, color) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    return new Promise((resolve) => c.toBlob((b) => resolve(new File([b], 'photo.png', { type: 'image/png' })), 'image/png'));
  }

  const meas = [
    { date: '2026-01-12', weight_kg: 99.3, waist_cm: 110 },
    { date: '2026-02-10', weight_kg: 97.1 },
    { date: '2026-04-01', weight_kg: 95.4, waist_cm: 104.5 },
  ];

  describe('Фото тела', () => {
    it('замеры на дату фото — последнее известное значение', () => {
      const m = P.measurementsAt(meas, '2026-03-01');
      expect(m.weight_kg).toEqual({ value: 97.1, date: '2026-02-10' });
      expect(m.waist_cm).toEqual({ value: 110, date: '2026-01-12' });
      expect(m.hips_cm).toBeNull();
    });
    it('разница замеров между двумя снимками', () => {
      const d = P.diff(meas, '2026-01-12', '2026-04-05');
      expect(d.find((x) => x.key === 'weight_kg').delta).toBe(-3.9);
      expect(d.find((x) => x.key === 'waist_cm').delta).toBe(-5.5);
      expect(d.find((x) => x.key === 'chest_cm').delta).toBeNull();
    });
    it('подбор пары: первое ↔ последнее и ближайшее к «месяц назад»', () => {
      const photos = [{ id: 'a', date: '2026-01-12' }, { id: 'b', date: '2026-03-03' }, { id: 'c', date: '2026-03-30' }, { id: 'd', date: '2026-04-05' }];
      expect(P.defaultPair(photos).a.id).toBe('a');
      expect(P.defaultPair(photos).b.id).toBe('d');
      expect(P.nearest(photos, '2026-03-06', 'd').id).toBe('b');
    });
    it('сжатие: длинная сторона до 1600 px, миниатюра до 360 px', async () => {
      const f = await makeImage(3000, 4000, '#127a5e');
      const r = await P.process(f);
      expect(r.width).toBe(1200);
      expect(r.height).toBe(1600);
      expect(r.full.type).toBe('image/jpeg');
      expect(r.thumb.size < r.full.size).toBeTruthy();
    });
    it('сохранение, список по ракурсу, удаление', async () => {
      await HD.db.init({ memoryOnly: true });
      HD.seed.seed();
      const f = await makeImage(400, 600, '#2a5ea8');
      const p1 = await P.add('demo-max', f, { date: '2026-01-12', angle: 'front' });
      await P.add('demo-max', f, { date: '2026-04-05', angle: 'front' });
      await P.add('demo-max', f, { date: '2026-04-05', angle: 'side' });
      expect(P.list('demo-max', 'front').length).toBe(2);
      expect(P.list('demo-max').length).toBe(3);
      expect(P.list('demo-anna').length).toBe(0);
      const stored = await HD.db.getPhoto(p1.id);
      expect(!!(stored && stored.full && stored.thumb)).toBeTruthy();
      await P.remove(p1.id);
      expect(P.list('demo-max', 'front').length).toBe(1);
      expect(await HD.db.getPhoto(p1.id)).toBeNull();
    });
    it('резервная копия содержит фото и восстанавливает их', async () => {
      await HD.db.init({ memoryOnly: true });
      HD.seed.seed();
      const p = await P.add('demo-anna', await makeImage(300, 400, '#b26a00'), { date: '2026-10-12', angle: 'back' });
      const json = await HD.db.exportJSON();
      expect(JSON.parse(json).photos_data[p.id].full.startsWith('data:image/jpeg')).toBeTruthy();
      await HD.db.init({ memoryOnly: true });
      await HD.db.importJSON(json);
      expect(HD.db.all('body_photos').length).toBe(1);
      const v = await HD.db.getPhoto(p.id);
      expect(v.full.size > 0).toBeTruthy();
    });
  });
})(window.HD);
