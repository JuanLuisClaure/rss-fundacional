// Service Worker with Stale-While-Revalidate Strategy
// Includes GitHub Raw RSS manifest detection and version comparison

const CACHE_NAME = 'rss-fundacional-v1';
const MANIFEST_URL = 'https://raw.githubusercontent.com/JuanLuisClaure/rss-fundacional/main/manifest.json';
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js'
];

// Install event - cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CRITICAL_ASSETS).catch(err => {
        console.warn('Failed to cache critical assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Stale-While-Revalidate strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle GitHub Raw RSS feeds with manifest detection
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('rss')) {
    event.respondWith(staleWhileRevalidateFeed(request));
  }
  // Handle manifest requests with version comparison
  else if (url.href === MANIFEST_URL) {
    event.respondWith(staleWhileRevalidateManifest(request));
  }
  // Standard Stale-While-Revalidate for other resources
  else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/**
 * Stale-While-Revalidate strategy for RSS feeds
 * Returns cached version immediately, updates in background
 */
async function staleWhileRevalidateFeed(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Return cached version immediately if available
    const cachedResponse = await cache.match(request);
    
    // Fetch fresh version in background
    const fetchPromise = fetch(request).then(response => {
      // Only cache successful responses
      if (response.status === 200) {
        const responseToCache = response.clone();
        cache.put(request, responseToCache);
        
        // Notify clients about fresh content
        notifyClientsOfUpdate(request.url);
      }
      return response;
    });

    // Return cached version if available, otherwise wait for fetch
    return cachedResponse || fetchPromise;
  } catch (error) {
    console.error('Feed fetch failed:', error);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Feed unavailable', { status: 503 });
  }
}

/**
 * Stale-While-Revalidate strategy for manifest with version comparison
 * Compares versions and updates cache if newer version detected
 */
async function staleWhileRevalidateManifest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    const cachedResponse = await cache.match(request);
    let cachedVersion = null;
    
    // Extract version from cached manifest
    if (cachedResponse) {
      try {
        const cachedData = await cachedResponse.clone().json();
        cachedVersion = cachedData.version;
      } catch (e) {
        console.warn('Failed to parse cached manifest:', e);
      }
    }
    
    // Fetch fresh manifest in background
    const fetchPromise = fetch(request).then(async response => {
      if (response.status === 200) {
        try {
          const freshData = await response.clone().json();
          const freshVersion = freshData.version;
          
          // Compare versions
          if (isNewerVersion(freshVersion, cachedVersion)) {
            // Cache the new version
            cache.put(request, response.clone());
            
            // Notify clients about version update
            notifyClientsOfVersionUpdate(freshVersion, cachedVersion);
          }
        } catch (e) {
          console.warn('Failed to parse fresh manifest:', e);
          // Still cache the response even if parsing fails
          cache.put(request, response.clone());
        }
      }
      return response;
    });

    // Return cached version if available, otherwise wait for fetch
    return cachedResponse || fetchPromise;
  } catch (error) {
    console.error('Manifest fetch failed:', error);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Manifest unavailable', { status: 503 });
  }
}

/**
 * Standard Stale-While-Revalidate strategy for general resources
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request).then(response => {
      // Only cache successful responses for GET requests
      if (request.method === 'GET' && response.status === 200) {
        const responseToCache = response.clone();
        cache.put(request, responseToCache);
      }
      return response;
    });

    // Return cached version if available, otherwise wait for fetch
    return cachedResponse || fetchPromise;
  } catch (error) {
    console.error('Resource fetch failed:', error);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Resource unavailable', { status: 503 });
  }
}

/**
 * Compare semantic versions (e.g., "1.2.3" vs "1.2.4")
 * Returns true if fresh version is newer than cached version
 */
function isNewerVersion(freshVersion, cachedVersion) {
  if (!cachedVersion) return true;
  if (!freshVersion) return false;
  
  try {
    const fresh = freshVersion.split('.').map(Number);
    const cached = cachedVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(fresh.length, cached.length); i++) {
      const freshPart = fresh[i] || 0;
      const cachedPart = cached[i] || 0;
      
      if (freshPart > cachedPart) return true;
      if (freshPart < cachedPart) return false;
    }
    
    return false; // Versions are equal
  } catch (e) {
    console.warn('Version comparison failed:', e);
    return false;
  }
}

/**
 * Notify all clients about content updates
 */
function notifyClientsOfUpdate(url) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'FEED_UPDATED',
        url: url,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Notify all clients about manifest version updates
 */
function notifyClientsOfVersionUpdate(newVersion, oldVersion) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'MANIFEST_VERSION_UPDATED',
        newVersion: newVersion,
        oldVersion: oldVersion,
        timestamp: new Date().toISOString()
      });
    });
  });
}
