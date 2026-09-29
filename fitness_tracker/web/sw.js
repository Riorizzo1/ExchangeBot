const CACHE_NAME = 'form-fitness-v7-push-ui';
const APP_SHELL = ['/', '/styles.css', '/app.js?v=7', '/manifest.webmanifest', '/icon.svg'];

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
  event.waitUntil(self.registration.showNotification(data.title || 'Fitness', {
    body: data.body || 'You have a training update.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: {url: data.url || '/'}
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
    const existing = list.find(client => 'focus' in client);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || '/');
  }));
});
