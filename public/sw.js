const CACHE_NAME = 'vitalmatch-v15';
const PRECACHE = [
  '/offline.html',
  '/css/typography.css?v=1',
  '/css/public-journey.css?v=5',
  '/js/public-experience.js?v=1',
  '/fonts/InterVariable.woff2',
  '/fonts/InterVariable-Italic.woff2',
  '/tailwind.css',
  '/js/pwa-register.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    // A missing optional public icon must not leave the unsafe older worker
    // installed. Cache each asset independently, then activate the privacy fix.
    caches.open(CACHE_NAME).then(cache => Promise.all(PRECACHE.map(asset => cache.add(asset).catch(() => {}))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key.startsWith('vitalmatch-') && key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

const cacheablePublicResponse = response => response?.status === 200 && response.type === 'basic' && !/private|no-store/i.test(response.headers.get('Cache-Control') || '');
const cachedPublicAsset = async request => {
  try {
    const cached = await (await caches.open(CACHE_NAME)).match(request);
    return cacheablePublicResponse(cached) ? cached : undefined;
  } catch { return undefined; }
};
const updatePublicCache = async (request, response) => {
  // Storage failure must never turn a successful fresh response into old bytes.
  try {
    const cache = await caches.open(CACHE_NAME);
    if (cacheablePublicResponse(response)) await cache.put(request, response.clone());
    else await cache.delete(request);
  } catch { /* Cache Storage is optional; preserve the network response. */ }
};
const unavailable = () => new Response(JSON.stringify({ error: 'Network connection required' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const networkPublicAsset = async request => {
  let response;
  try { response = await fetch(request, { cache: 'no-cache' }); }
  catch { return await cachedPublicAsset(request) || unavailable(); }
  // Await the write so the worker stays alive until a fresh fallback is stored.
  // Non-200/private/no-store results remain the actual network response and
  // remove an older entry instead of reviving it as an offline response.
  await updatePublicCache(request, response);
  return response;
};

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestURL = new URL(event.request.url);
  // Let the browser load external maps/assets under the page's CSP. Fetching
  // them here uses the worker's connect-src 'self' and turns map tiles into 503s.
  if (requestURL.origin !== self.location.origin) return;
  const isNavigationRequest = event.request.mode === 'navigate';
  // Only known public asset locations may enter Cache Storage. Authenticated
  // endpoints, recordings and uploads are network only.
  const isPublicAsset = requestURL.origin === self.location.origin && (
    ['/offline.html', '/tailwind.css', '/manifest.json'].includes(requestURL.pathname) ||
    /^\/(?:css|js|fonts|icons|images)\/[^?#]+\.(?:css|js|woff2?|png|jpe?g|webp|gif|svg|ico)$/.test(requestURL.pathname)
  );

  // Navigation and API requests: always go to network, never cache HTML
  if (isNavigationRequest || !isPublicAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => isNavigationRequest
        ? cachedPublicAsset('/offline.html').then(cached => cached || unavailable())
        : unavailable())
    );
    return;
  }

  const mustRefresh = /\.(?:js|css|html|json)$/i.test(requestURL.pathname);
  // Executable content, styles and the manifest revalidate on every online
  // request. Fonts/images keep their public cache preference; activation clears
  // older versions. Every fallback is confined to this version's public cache.
  event.respondWith(mustRefresh ? networkPublicAsset(event.request) :
    cachedPublicAsset(event.request).then(cached => cached || networkPublicAsset(event.request)));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CLEAR_PRIVATE_CACHE') return;
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vitalmatch-')).map(key => caches.delete(key)))));
});
