#!/usr/bin/env python3
from pathlib import Path
root=Path('/Users/bobby/.openclaw/workspace/watch_desk/public')
found=[]
for p in root.rglob('sw*.js'):
    found.append(str(p))
    p.write_text("""// Cache disabled by Clarence: Watch Desk embeds live data in HTML.
// Always activate immediately and let network/no-cache server provide the latest app shell.
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
});
""")
print({'service_workers_rewritten':found})
