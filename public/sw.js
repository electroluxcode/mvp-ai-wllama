// Service Worker for offline support
const CACHE_NAME = 'wllama-cache-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/sw.js') {
    return;
  }

  event.respondWith(
    (async () => {
      // 优先检查缓存
      let cached = await caches.match(request);
      
      // 导航请求：尝试匹配路径（忽略查询参数）
      if (!cached && request.mode === 'navigate') {
        const urlNoQuery = new URL(request.url);
        urlNoQuery.search = '';
        cached = await caches.match(urlNoQuery);
        
        // 如果还没有，查找匹配路径的缓存
        if (!cached) {
          const cache = await caches.open(CACHE_NAME);
          const keys = await cache.keys();
          const pathname = url.pathname;
          
          for (const key of keys) {
            if (new URL(key.url).pathname === pathname) {
              cached = await cache.match(key);
              if (cached) break;
            }
          }
        }
      }

      // 有缓存：返回缓存，后台更新
      if (cached) {
        fetch(request).then((res) => {
          if (res?.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      // 无缓存：网络请求
      try {
        const res = await fetch(request);
        if (res?.status === 200) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
        }
        return res;
      } catch {
        // 导航请求失败：尝试返回首页
        if (request.mode === 'navigate') {
          return (await caches.match('/')) || (await caches.open(CACHE_NAME).then(async (cache) => {
            for (const key of await cache.keys()) {
              const keyUrl = new URL(key.url);
              if (key.mode === 'navigate' || keyUrl.pathname.endsWith('/')) {
                return await cache.match(key);
              }
            }
          }));
        }
        throw new Error('Offline');
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'UNREGISTER') {
    self.registration.unregister().then(() =>
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
    );
  }
});
