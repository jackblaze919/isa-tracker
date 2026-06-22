// Network-first for the page (so edits reach installed copies); cache-first for static assets.
// Architecture (Option A): all Hammy artwork is inlined in index.html as same-document
// <symbol>/<use> (best WebKit compatibility, no extra runtime fetch). The files under
// assets/hammy/ are editable authoring source only and are NOT loaded or cached at runtime.
const CACHE = 'isa-tracker-v20';
const ASSETS = [
  './',
  './index.html',
  './hamster.css',
  './hamster.js',
  './coach/coach.css',
  './coach/coach-config.js',
  './coach/coach-context.js',
  './coach/offline-help.js',
  './coach/coach.js',
  './coach/reminders.css',
  './coach/reminders.js',
  './fun/fun.css',
  './fun/love-notes-config.js',
  './fun/love-notes.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(res){
  return res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'default');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    // network-first; cache the fresh page under its actual URL
    e.respondWith(
      fetch(req).then(res => {
        if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || caches.match('./index.html')).then(hit => hit || Response.error())
      )
    );
  } else {
    // cache-first for static assets
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => Response.error()))
    );
  }
});

/* ---------- Hammy reminders: Web Push ---------- */
// Deep-links are restricted to this fixed same-origin category->tab map. Payload URLs are ignored.
const REMIND_TAB = { steps: 'today', workout: 'today', protein: 'today', meals: 'today', checkin: 'checkin', test: 'hammy' };

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  const title = (typeof data.title === 'string' && data.title) ? data.title : 'Hammy 🐹';
  const category = REMIND_TAB[data.category] ? data.category : 'today';
  const body = (typeof data.body === 'string') ? data.body : '';
  const tag = (typeof data.tag === 'string' && data.tag) ? data.tag : ('hammy-' + category);
  e.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    renotify: false,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { category }                 // only the category travels; the SW maps it to a known tab
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const cat = (e.notification.data && e.notification.data.category) || 'today';
  const tab = REMIND_TAB[cat] || 'today';
  const scope = self.registration.scope;                  // same-origin app root
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf(scope) === 0 && 'focus' in c) { try { c.postMessage({ type: 'hammy-remind', tab }); } catch (err) {} return c.focus(); }
      }
      return self.clients.openWindow(scope + '#hammy-remind=' + tab);
    })
  );
});
