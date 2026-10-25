// Общее пространство имён приложения и мелкие утилиты.
// Скрипты подключаются обычными <script>, без сборщика, поэтому всё живёт в window.HD.
(function () {
  const HD = (window.HD = window.HD || {});

  HD.util = {
    uid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    },
    clamp(v, lo, hi) {
      return Math.min(hi, Math.max(lo, v));
    },
    round(v, step) {
      return Math.round(v / step) * step;
    },
    floorTo(v, step) {
      return Math.floor(v / step + 1e-9) * step;
    },
    sum(arr, f) {
      return arr.reduce((s, x) => s + (f ? f(x) : x), 0);
    },
    avg(arr) {
      return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
    },
    isNum(v) {
      return typeof v === 'number' && isFinite(v);
    },
    esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    // Число по-русски: 14 785, 93,8
    num(v, digits) {
      if (v == null || !isFinite(v)) return '—';
      const d = digits == null ? 0 : digits;
      return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d });
    },
    pct(v) {
      if (v == null || !isFinite(v)) return '—';
      return Math.round(v) + '%';
    },
    deepClone(o) {
      return JSON.parse(JSON.stringify(o));
    },
    groupBy(arr, f) {
      const m = new Map();
      for (const x of arr) {
        const k = f(x);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
      }
      return m;
    },
    plural(n, one, few, many) {
      const a = Math.abs(n) % 100;
      const b = a % 10;
      if (a > 10 && a < 20) return many;
      if (b > 1 && b < 5) return few;
      if (b === 1) return one;
      return many;
    },
  };
})();
