const CACHE_NAME = 'rss-fundacional-v1';
const RUNTIME_CACHE = 'rss-fundacional-runtime';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching essential assets');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if available
        if (response) {
          return response;
        }

        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();
          const cacheName = event.request.url.includes('/api/') ? RUNTIME_CACHE : CACHE_NAME;

          caches.open(cacheName).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Return offline page or cached response
          console.log('[Service Worker] Fetch failed for:', event.request.url);
          return caches.match('/index.html');
        });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for RSS updates
self.addEventListener('sync', event => {
  if (event.tag === 'sync-feeds') {
    console.log('[Service Worker] Syncing feeds in background');
    event.waitUntil(syncFeeds());
  }
});

async function syncFeeds() {
  try {
    console.log('[Service Worker] Background sync: updating feeds');
    // Implement feed synchronization logic here
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    return Promise.reject(error);
  }
}
