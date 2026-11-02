// Service Worker for ChatForAll PWA
const CACHE_NAME = 'chatforall-cache-v5';
const ASSETS_TO_CACHE = [
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Network first for HTML navigation so updates are instant
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Handle notification clicks: focus or open the chat window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Handle push events received from server or background
self.addEventListener('push', (event) => {
  let title = 'ChatForAll';
  let body = 'Você recebeu uma nova mensagem.';
  if (event.data) {
    try {
      const json = event.data.json();
      title = json.title || title;
      body = json.body || body;
    } catch {
      body = event.data.text() || body;
    }
  }

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
