// Network-first for the page (so edits reach installed copies); cache-first for static assets.
// Architecture (Option A): all Hammy artwork is inlined in index.html as same-document
// <symbol>/<use> (best WebKit compatibility, no extra runtime fetch). The files under
// assets/hammy/ are editable authoring source only and are NOT loaded or cached at runtime.
const CACHE = 'isa-tracker-v8';
const ASSETS = [
  './',
  './index.html',
  './hamster.css',
  './hamster.js',
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
