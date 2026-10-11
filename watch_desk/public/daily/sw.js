const CACHE = 'watch-desk-daily-push-v8-alerts';

const pushKeyBytes = value => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
};

// iOS can rotate an installed PWA's Web Push endpoint without a user-visible
// prompt. Keep the server's subscription registry synchronized from the
// service worker so a stale endpoint does not silently stop alerts.
async function syncPushSubscription() {
  const statusResponse = await fetch('/api/push/watch/status', {cache: 'no-store'});
  if (!statusResponse.ok) return;
  const info = await statusResponse.json();
  if (!info.configured || !info.public_key) return;
  let subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: pushKeyBytes(info.public_key),
    });
  }
  await fetch('/api/push/watch/subscribe', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(subscription),
  });
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(syncPushSubscription().catch(() => undefined));
});

self.addEventListener('push', event => {
  const data = event.data?.json() || {title: 'Watch Desk', body: 'New Daily Delta update.'};
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag || 'watch-desk-alert',
    renotify: true,
    icon: '/daily/icon-192.png',
    badge: '/daily/icon-192.png',
    data: {url: data.url || '/daily/'}
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/daily/';
  const target = new URL(rawUrl, self.location.origin);
  // Alert links must stay inside the installed Daily Delta PWA. Older alerts
  // used the Watches hostname, which sent iOS to Safari and Cloudflare auth.
  if (target.origin !== self.location.origin || !target.pathname.startsWith('/daily/')) {
    target.href = new URL('/daily/', self.location.origin).href;
  }
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(async clients => {
    const existing = clients.find(client => {
      try { return new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/daily/'); }
      catch (_) { return false; }
    });
    if (existing) {
      if (existing.navigate && existing.url !== target.href) await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
