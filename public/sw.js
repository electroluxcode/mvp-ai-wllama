// Service Worker for offline support
const CACHE_VERSION = 'v1';
const CACHE_NAME = `wllama-cache-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/';

// 需要预缓存的资源
const PRECACHE_URLS = [
  '/',
  '/wllama/load-from-file',
  '/wllama/load-from-url',
  '/wllama/load-from-cache',
  '/wllama/manager-cache',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // WASM 文件
  '/wasm/wllama/single-thread/wllama.wasm',
  '/wasm/wllama/multi-thread/wllama.wasm',
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching resources');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache failed:', err);
        // 即使部分资源失败也继续安装
        return Promise.resolve();
      });
    }).then(() => {
      // 立即激活新的 Service Worker
      return self.skipWaiting();
    })
  );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 删除旧版本的缓存
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 立即控制所有页面
      return self.clients.claim();
    })
  );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过跨域请求（除非是同源的）
  if (url.origin !== location.origin) {
    return;
  }

  // 跳过 Service Worker 和 manifest 文件
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
    return;
  }

  // 检查是否是 WASM 文件或其他静态资源
  const isWasmFile = url.pathname.endsWith('.wasm');
  const isStaticAsset = /\.(wasm|woff|woff2|ttf|eot|png|jpg|jpeg|svg|gif|webp|ico|css|js)$/i.test(url.pathname);

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // 对于 WASM 和静态资源，优先使用缓存（Cache First）
      if (isWasmFile || isStaticAsset) {
        if (cachedResponse) {
          // 后台更新缓存（不阻塞响应）
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          }).catch(() => {
            // 网络请求失败，忽略
          });
          return cachedResponse;
        }
        
        // 没有缓存，尝试网络请求
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // WASM 文件离线时返回错误
          return new Response('WASM file unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain',
            }),
          });
        });
      }

      // 对于页面请求，使用 Cache First + 后台更新策略
      if (cachedResponse) {
        // 同时尝试更新缓存
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // 网络请求失败，忽略
        });
        return cachedResponse;
      }

      // 没有缓存，尝试网络请求
      return fetch(request).then((networkResponse) => {
        // 只缓存成功的响应
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // 网络请求失败，尝试返回离线页面
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_PAGE);
        }
        // 对于其他请求，返回错误响应
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain',
          }),
        });
      });
    })
  );
});

// 处理消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'UNREGISTER') {
    self.registration.unregister().then(() => {
      return caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      });
    });
  }
});
