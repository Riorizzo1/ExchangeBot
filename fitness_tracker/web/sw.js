const CACHE_NAME = 'form-fitness-v13-save-feedback';
const APP_SHELL = ['/', '/styles.css', '/app.js?v=10', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(response => response || caches.match('/')))
  );
});

self.addEventListener('push', event => {
  const data = event.data?.json?.() || {title:'Fitness',body:'You have a training update.',url:'/'};
  event.waitUntil((async () => {
    const tasks = [self.registration.showNotification(data.title || 'Fitness', {
      body: data.body || 'You have a training update.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag || 'fitness-update',
      renotify: true,
      data: {url: data.url || '/'}
    })];
    // iOS exposes the Badging API on navigator, including while a Home Screen
    // web app is handling a background push. Keep the registration fallback
    // for browsers that expose the older/nonstandard shape.
    const setBadge = navigator.setAppBadge || self.registration.setAppBadge;
    if (setBadge) tasks.push(setBadge.call(navigator, 1));
    await Promise.all(tasks);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const clearBadge = navigator.clearAppBadge || self.registration.clearAppBadge;
  event.waitUntil(Promise.resolve(clearBadge?.call(navigator)).then(() => clients.matchAll({type:'window',includeUncontrolled:true})).then(list => {
    const existing = list.find(client => 'focus' in client);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || '/');
  }));
});
