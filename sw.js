// Service worker: кэш оболочки приложения для установки на главный экран и офлайн-работы.
// Данные и так живут в браузере, поэтому офлайн доступно всё.
importScripts('js/version.js');
const CACHE = 'health-diary-' + (self.HD_VERSION || 'dev');
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/config.js',
  'js/version.js',
  'js/core/ns.js',
  'js/core/dates.js',
  'js/core/sha256.js',
  'js/domain/exercises.js',
  'js/domain/fitness.js',
  'js/domain/nutrition.js',
  'js/domain/budget.js',
  'js/domain/goals/registry.js',
  'js/domain/goals/weight.js',
  'js/domain/goals/race.js',
  'js/domain/goals/strength.js',
  'js/domain/goals/consistency.js',
  'js/domain/goals/measurement.js',
  'js/domain/goals/run-distance.js',
  'js/domain/goals/scenario.js',
  'js/domain/goals/safety.js',
  'js/domain/plan.js',
  'js/domain/adapt.js',
  'js/domain/recommendations.js',
  'js/domain/aggregate.js',
  'js/domain/upcoming.js',
  'js/ai/provider.js',
  'js/data/db.js',
  'js/data/seed.js',
  'js/services/context.js',
  'js/services/nutrition-svc.js',
  'js/services/goals-svc.js',
  'js/services/plan-svc.js',
  'js/services/photos-svc.js',
  'js/services/onboarding-svc.js',
  'js/sync/supabase.js',
  'js/sync/sync.js',
  'js/import/xlsx.js',
  'js/import/xlsx-import.js',
  'js/ui/charts.js',
  'js/ui/core.js',
  'js/ui/widgets.js',
  'js/ui/views/pin.js',
  'js/ui/views/login.js',
  'js/ui/views/onboard.js',
  'js/ui/views/profiles.js',
  'js/ui/views/home.js',
  'js/ui/views/food.js',
  'js/ui/views/body.js',
  'js/ui/views/training.js',
  'js/ui/views/dynamics.js',
  'js/ui/views/profile.js',
  'js/ui/views/goals.js',
  'js/ui/views/wizard.js',
  'js/ui/views/import.js',
  'js/ui/views/settings.js',
  'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала сеть (чтобы правки сразу подхватывались), при отсутствии сети — кэш
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Шрифты Google: сначала кэш, чтобы работали и без сети
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
