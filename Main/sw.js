// Service Worker — 分层缓存策略
// 版本号：由 deploy workflow 在部署时注入 commit SHA（见 .github/workflows/deploy.yml）
// 这样每次部署 sw.js 字节都变 → Chrome 触发 SW update → 新 SW activate 时清除
// 所有旧 cache（包括旧 data.js / index.html），用户下次普通刷新就拿到最新。
const CACHE_VERSION = '__SHA__';
const CACHE_NAME = `ms-${CACHE_VERSION}`;

// 内容数据文件（频繁更新）— 匹配后走 network-first 策略
// data.js / data_ja.js / questions.js / school_quiz.js
const DATA_FILE_RE = /\/(data|data_ja|questions|school_quiz)\.js(\?|$)/;

// 安装：预缓存入口（其他资源按需 cache on fetch）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/', '/index.html']).catch(() => {
        // 根路径或 index.html 可能因路由重定向失败，忽略即可（fetch 阶段会补上）
      })
    ).then(() => self.skipWaiting())
  );
});

// 激活：清除旧版本缓存 + 立即接管
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('ms-') && k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      ),
      self.clients.claim(),
    ])
  );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理同源 GET
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API / delta worker endpoint — 不走缓存
  if (url.hostname.includes('workers.dev')) return;

  // HTML — network-first：优先拿最新，离线时回退缓存
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 内容数据文件（频繁更新）— network-first，避免一次刷新滞后
  if (DATA_FILE_RE.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 其他静态资源（js/*.js / CSS / SVG / 字体）— stale-while-revalidate：秒开 + 后台刷新
  event.respondWith(staleWhileRevalidate(req));
});

// network-first：尝试网络（bypass 浏览器 HTTP 缓存），失败回退 SW 缓存
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // 关键：cache: 'no-store' 让 SW 内部 fetch 不命中浏览器 HTTP 缓存，始终走真实网络
    // 这样数据文件改动后，刷新一次就能拿到最新版
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 最后兜底：尝试根路径（PWA 离线入口）
    const fallback = await cache.match('/');
    if (fallback) return fallback;
    throw err;
  }
}

// stale-while-revalidate：先返回缓存（若有），同时后台 fetch 更新
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached || Promise.reject(new Error('offline and uncached: ' + request.url)));
  return cached || networkPromise;
}
