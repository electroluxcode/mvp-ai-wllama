// Service Worker for offline support
const CACHE_VERSION = 'v1';
const CACHE_NAME = `wllama-cache-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/';

// 安装 Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    // 立即激活新的 Service Worker
    self.skipWaiting()
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

// 拦截网络请求 - 缓存所有同源请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 只缓存同源请求
  if (url.origin !== location.origin) {
    return;
  }

  // 跳过 Service Worker 文件本身（避免循环）
  if (url.pathname === '/sw.js') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // 如果有缓存，先返回缓存（Cache First）
      if (cachedResponse) {
        // 后台尝试更新缓存（不阻塞响应）
        fetch(request).then((networkResponse) => {
          // 只缓存成功的响应
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // 网络请求失败，忽略（使用缓存）
        });
        return cachedResponse;
      }

      // 没有缓存，尝试网络请求（Network First）
      return fetch(request).then((networkResponse) => {
        // 缓存所有成功的响应
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // 网络请求失败
        if (request.mode === 'navigate') {
          // 导航请求失败，尝试返回首页或任何已缓存的页面
          return caches.match(OFFLINE_PAGE).then((fallbackResponse) => {
            if (fallbackResponse) {
              return fallbackResponse;
            }
            // 如果首页也没有缓存，尝试查找任何已缓存的 HTML 页面
            return caches.open(CACHE_NAME).then((cache) => {
              return cache.keys().then((keys) => {
                // 查找任何导航请求（HTML 页面）
                for (const key of keys) {
                  if (key.mode === 'navigate' || key.url.endsWith('/') || key.url.match(/\.html?$/i)) {
                    return cache.match(key);
                  }
                }
                return null;
              });
            }).then((anyPage) => {
              // 如果找到了任何页面，返回它
              if (anyPage) {
                alert('no page found, try to back to availiable page');
                return anyPage;
              }
              // 如果完全没有缓存，让请求失败，由浏览器显示默认错误页面
              // 而不是显示 "Offline" 文本
              return fetch(request);
            });
          });
        }
        // 对于其他请求（API、静态资源等），如果没有缓存，让请求失败
        // 不返回错误响应，让浏览器或应用处理
        return fetch(request);
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
