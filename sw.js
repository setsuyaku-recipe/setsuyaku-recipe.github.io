// Service Worker for 週ぎめごはん (PWA)
// 更新時に旧画面が残らないことを最優先したキャッシュ戦略
const CACHE_VERSION = '20261029_shopping_polish';
const CACHE_PREFIX = 'setsuyaku-recipe-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './assets/gohan-kun.webp',
  './',
  './index.html',
  './privacy.html',
  './recipes.js',
  './app.js',
  './week-management.js',
  './manifest.json',
  './apple-touch-icon.png',
  './ogp.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

async function freshResponse(url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response || !response.ok) {
    throw new Error(`Failed to precache: ${url}`);
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // addAll() はブラウザHTTPキャッシュを使う場合があるため、
    // cache:'reload' でサーバーの最新版を明示的に取得して保存する。
    await Promise.all(
      PRECACHE_ASSETS.map(async (url) => {
        const response = await freshResponse(url);
        await cache.put(url, response);
      })
    );

    // An existing session activates updates only after the user chooses Update.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();

    // このアプリが作った旧バージョンのキャッシュだけを削除する。
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );

    if ('navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.disable();
      } catch (_) {}
    }

    await self.clients.claim();
  })());
});

function isExternalNoCache(url) {
  return (
    url.origin.includes('kvdb.io') ||
    url.origin.includes('google-analytics') ||
    url.origin.includes('googletagmanager') ||
    url.origin.includes('googlesyndication') ||
    url.origin.includes('doubleclick')
  );
}

function isExternalStatic(url) {
  return (
    url.origin.includes('tailwindcss.com') ||
    url.origin.includes('unpkg.com') ||
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com')
  );
}

function isCoreAppRequest(url, request) {
  if (request.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;
  return (
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path.endsWith('/app.js') ||
    path.endsWith('/week-management.js') ||
    path.endsWith('/recipes.js') ||
    path.endsWith('/manifest.json') ||
    path.endsWith('/sw.js')
  );
}

async function networkFirstFresh(request, preloadResponsePromise) {
  try {
    // ナビゲーションプリロードがあれば最優先で利用。
    const preload = preloadResponsePromise ? await preloadResponsePromise : null;
    if (preload && preload.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, preload.clone());
      return preload;
    }

    // 重要ファイルはブラウザHTTPキャッシュを使わず、必ずネットワークへ確認する。
    const response = await fetch(request, { cache: 'no-store' });

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      return caches.match('./index.html', { ignoreSearch: true });
    }

    throw _;
  }
}

self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== 'GET' || isExternalNoCache(url)) return;
  if(url.origin !== self.location.origin && !isExternalStatic(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Every app release has a complete, separate cache. Never mix script versions.
    const cached = await cache.match(request, {ignoreSearch:url.origin === self.location.origin});
    if(cached) return cached;
    const response = await fetch(request);
    if(response.ok) await cache.put(request,response.clone());
    return response;
  })());
});




