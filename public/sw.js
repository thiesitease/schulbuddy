// Service Worker: App offline verfügbar machen und Erinnerungen anzeigen.
// tools/build.mjs ersetzt VERSION und SHELL beim Veröffentlichen automatisch.

const VERSION = 'sb-dev';
// <shell>
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'impressum.html',
  'datenschutz.html',
  'assets/app.css',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'js/account.js',
  'js/actions.js',
  'js/ai.js',
  'js/app.js',
  'js/components.js',
  'js/dates.js',
  'js/focus.js',
  'js/forms.js',
  'js/planner.js',
  'js/pwa.js',
  'js/reminders.js',
  'js/srs.js',
  'js/stats.js',
  'js/store.js',
  'js/ui.js',
  'js/views/buddy.js',
  'js/views/learn.js',
  'js/views/onboarding.js',
  'js/views/plan.js',
  'js/views/premium.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'js/views/today.js',
];
// </shell>

const DATA_CACHE = 'sb-data';
const REMINDER_URL = './__sb/reminders.json';
const SHOWN_URL = './__sb/shown.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('sb-') && k !== VERSION && k !== DATA_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    // Ohne zweites Argument: Navigationsanfragen dürfen nicht neu konstruiert werden.
    // Frisch sind sie trotzdem, weil der Server für HTML „Cache-Control: no-cache“ sendet.
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // KI-Anfragen gehen immer ins Netz.
  if (url.pathname.includes('/api/')) return;

  // Seiten (App, Impressum, Datenschutz) immer frisch aus dem Netz, offline aus dem Speicher.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetchWithTimeout(request, 4000);
        } catch {
          return (await caches.match(request, { ignoreSearch: true })) || (await caches.match('index.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      // Lokale Entwicklung (nicht gebaut): erst Netz, damit Änderungen sofort sichtbar sind.
      if (VERSION === 'sb-dev') {
        try {
          return await fetch(request, { cache: 'no-store' });
        } catch {
          return (await caches.match(request, { ignoreSearch: true })) || Response.error();
        }
      }
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

// --- Erinnerungen ----------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function readJSON(cache, url, fallback) {
  const res = await cache.match(url);
  if (!res) return fallback;
  try {
    return await res.json();
  } catch {
    return fallback;
  }
}

async function showDueReminders() {
  const cache = await caches.open(DATA_CACHE);
  const data = await readJSON(cache, REMINDER_URL, null);
  if (!data?.enabled) return;
  const now = new Date();
  const today = isoDay(now);
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // Keine Benachrichtigungen in der Nacht.
  if (time < '07:00' || time > '21:30') return;
  const shown = new Set(await readJSON(cache, SHOWN_URL, []));
  for (const item of data.items || []) {
    const key = `${item.id}@${item.date}`;
    if (item.date !== today || shown.has(key)) continue;
    // Vor der gewählten Uhrzeit nur Prüfungen und Hausaufgaben, Lernerinnerungen erst danach.
    if (item.id.startsWith('plan:') && time < item.time) continue;
    await self.registration.showNotification(item.title, {
      body: item.body,
      tag: item.id,
      icon: 'assets/icons/icon-192.png',
      data: { url: './#/today' },
    });
    shown.add(key);
  }
  await cache.put(SHOWN_URL, new Response(JSON.stringify([...shown].slice(-200)), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sb-reminders') event.waitUntil(showDueReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (client) {
        await client.focus();
        return client.navigate?.(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
