// 幻獸日記 Service Worker — 離線快取
// 更新遊戲時，請把 VERSION 改成新版本號，iPhone 才會換成新檔案。
const VERSION = 'pf-1.28.0';
const CORE = ['./', './index.html', './game-core.js'];
const EXTRA = ['./manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  ...['flame','tide','forest','earth','bird','elec','metal'].flatMap(el => [0,1,2,3,4].flatMap(n => ['open','closed'].map(e => `./sprites/${el}_${n}_${e}.png`))),
  ...['flame','tide','forest','earth','bird','elec','metal'].map(el => `./sprites/egg_${el}.png`),
  ...['bed_round','bed_straw','bed_cloud','toilet_pot','rug_red','rug_star','plant_pot','plant_flower','lamp_candle','lamp_moon','wall_frame','wall_clock','toy_ball','toy_block','potion','apple','berry','fish','meat','cake','seed','candy','coin','core','bone','dragon','melonw','melon','potato','nut','coconut','banana','mat_flame','mat_tide','mat_forest','mat_earth','mat_bird','mat_metal','mat_elec'].map(n => `./sprites/items/${n}.png`)];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);                                            // 必要檔案
    await Promise.all(EXTRA.map(u => c.add(u).catch(() => null)));   // 圖示等：失敗也不影響安裝
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 頁面：先試網路（最多等 3 秒），失敗就用快取 → 有網路時拿到最新版，離線也能開
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
        ]);
        if (net && net.ok) cache.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 其他檔案：快取優先，背景更新
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
