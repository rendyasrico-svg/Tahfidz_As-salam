/* ============================================================
   AL QUR'AN AS SALAM — sw.js (Service Worker)
   Cache Strategy: Cache First untuk aset statis,
   Network First untuk API ayat & shalat
   ============================================================ */

const CACHE_NAME    = 'assalam-v3';
const AUDIO_CACHE   = 'assalam-audio-v1';
const API_CACHE     = 'assalam-api-v1';

/* Aset utama yang di-cache saat install */
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './logo.png',
  ...
];

/* ── INSTALL ─────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install gagal untuk beberapa aset:', err))
  );
});

/* ── ACTIVATE ────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE && k !== API_CACHE)
          .map(k => {
            console.log('[SW] Hapus cache lama:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ───────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* 1. Audio everyayah.com → Cache First (hemat bandwidth) */
  if (url.hostname === 'everyayah.com') {
    event.respondWith(audioCacheStrategy(request));
    return;
  }

  /* 2. API Al-Qur'an & Aladhan → Network First, fallback cache */
  if (
    url.hostname === 'api.alquran.cloud' ||
    url.hostname === 'api.aladhan.com'   ||
    url.hostname === 'nominatim.openstreetmap.org'
  ) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  /* 3. Google Fonts → Cache First */
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  /* 4. Aset lokal (HTML, CSS, JS, logo) → Cache First */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
});

/* ── STRATEGI CACHE ──────────────────────────────────────── */

/* Cache First: ambil dari cache, jika miss fetch & simpan */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Offline & tidak ada cache — kembalikan halaman offline */
    const offline = await caches.match('./index.html');
    return offline || new Response('Aplikasi sedang offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* Network First: coba network, fallback ke cache */
async function networkFirstStrategy(request, cacheName = CACHE_NAME) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* Audio Cache: cache dulu, baru stream — maksimal 200 file */
async function audioCacheStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(AUDIO_CACHE);

      /* Batasi jumlah audio yang di-cache agar tidak membengkak */
      const keys = await cache.keys();
      if (keys.length >= 200) {
        await cache.delete(keys[0]);
      }

      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Audio tidak tersedia offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/* ── BACKGROUND SYNC (opsional future) ───────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  /* Bersihkan cache audio jika diminta */
  if (event.data && event.data.type === 'CLEAR_AUDIO_CACHE') {
    caches.delete(AUDIO_CACHE).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});
