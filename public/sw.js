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
      const cache = await caches.open(CACHE_NAME);
      const pathname = url.pathname;
      
      // 优先检查缓存：精确匹配
      let cached = await cache.match(request);
      
      // 如果没有精确匹配，尝试多种匹配方式
      if (!cached) {
        // 1. 匹配路径（忽略查询参数和 hash）
        const urlNoQuery = new URL(request.url);
        urlNoQuery.search = '';
        urlNoQuery.hash = '';
        cached = await cache.match(urlNoQuery);
        
        // 2. 查找匹配路径的所有缓存
        if (!cached) {
          const keys = await cache.keys();
          for (const key of keys) {
            const keyUrl = new URL(key.url);
            if (keyUrl.pathname === pathname) {
              cached = await cache.match(key);
              if (cached) break;
            }
          }
        }
      }

      // 有缓存：立即返回，避免显示错误页面
      if (cached) {
        // 后台更新缓存（不阻塞响应）
        event.waitUntil(
          fetch(request).then((res) => {
            if (res?.status === 200) {
              return cache.put(request, res.clone());
            }
          }).catch(() => {})
        );
        return cached;
      }

      // 无缓存：网络请求（带超时，快速失败）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2秒超时，快速失败
      
      try {
        const res = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res?.status === 200) {
          event.waitUntil(cache.put(request, res.clone()));
        }
        return res;
      } catch {
        clearTimeout(timeoutId);
        // 导航请求失败：再次检查缓存（可能缓存刚更新）
        if (request.mode === 'navigate') {
          // 再次尝试匹配路径
          const urlNoQuery = new URL(request.url);
          urlNoQuery.search = '';
          urlNoQuery.hash = '';
          const fallback = await cache.match(urlNoQuery) || await cache.match('/');
          if (fallback) return fallback;
          
          // 查找任何已缓存的页面
          const keys = await cache.keys();
          for (const key of keys) {
            const keyUrl = new URL(key.url);
            if (key.mode === 'navigate' || keyUrl.pathname.endsWith('/')) {
              const page = await cache.match(key);
              if (page) return page;
            }
          }
        }
        // 其他请求失败：返回空响应
        return new Response('', { status: 503 });
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
