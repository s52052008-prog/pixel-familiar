// 幻獸日記 Service Worker — 離線快取
// 更新遊戲時，請把 VERSION 改成新版本號，iPhone 才會換成新檔案。
const VERSION = 'pf-1.91.2';
const CORE = ['./', './index.html', './game-core.js', './emb.js'];
const EXTRA = ['./manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  ...['flame','tide','forest','earth','bird','elec','metal'].flatMap(el => [0,1,2,3,4].flatMap(n => ['open','closed'].map(e => `./sprites/${el}_${n}_${e}.png`))),
  ...['flame','tide','forest','earth','bird','elec','metal'].map(el => `./sprites/egg_${el}.png`),
  ...['relic_rhinoCharm','relic_reaperBlade','relic_boneShield','relic_iceScale','relic_mossHeart','relic_phoenixFeather','relic_dragonFang','relic_ghostHat','chest_bronze','chest_gold','chest_gold_c','chest_gold_h','chest_bronze_c','chest_bronze_h','bed_round','bed_straw','bed_cloud','toilet_pot','rug_red','rug_star','plant_pot','plant_flower','lamp_candle','lamp_moon','wall_frame','wall_clock','toy_ball','toy_block','den1','den2','den3','den4','den5','den6','den7','den_fusion','pig1','pig2','pig3','pig4','pig5','pig6','pigshard','pigcore','potion','potion2','soup','seed2','seed3','seed4','apple','berry','fish','meat','cake','seed','candy','coin','core','bone','dragon','melonw','melon','potato','nut','coconut','banana','mat_flame','mat_tide','mat_forest','mat_earth','mat_bird','mat_metal','mat_elec'].map(n => `./sprites/items/${n}.png`),
  ...['apple', 'backpack', 'bolt', 'book', 'calendar', 'check', 'cheese', 'chest', 'coin', 'dumbbell', 'floppy', 'gear', 'gem', 'heart', 'house', 'info', 'leaf', 'leafbook', 'levelup', 'map', 'meat', 'moon', 'paw', 'pawbook', 'pawlight', 'picture', 'question', 'refresh', 'scroll', 'shop', 'star', 'stew', 'swords', 'trophy', 'waterbowl', 'zzz'].map(n => `./sprites/ui/${n}.png`),
  ...['ball','sun','sponge','tub','shoe','bite','poop','ember','note','cranberry','blueberry','strawberry','drop','fly','worry','el_fire','el_water','el_leaf','el_earth','el_bird','el_elec','el_metal','sex_m','sex_f','bondheart'].map(n => `./sprites/items/ic_${n}.png`),
  ...['fire','bubble','leaf','rock','feather','bolt','shard','star','spark','heart','z'].map(n => `./sprites/fx/p_${n}.png`),
  ...['empty','seed','sprout','leafy','rot',...['cranberry','blueberry','strawberry','dragon','melonw','melon','potato','nut','coconut','banana'].flatMap(k => [k, k + '_over'])].map(n => `./sprites/plots/${n}.png`),
  ...['crown','tower','sparkle','shield','run','crit','skull','shake','dragonhead','snow','volcano','muscle','dodge','fist','zen','glove','bulb','rock','scissors','paper','cross','warn','bell','lock','hourglass','party','gift','egg','hatch','orb','basket','tools','chair','user','medal','wand','sound','mute','turtle','back','dice','pin'].map(n => `./sprites/ui2/${n}.png`),
  ...['burn','splash','zap'].flatMap(g => [0,1,2].map(i => `./sprites/fx/${g}${i}.png`)),
  ...['meadow_1','meadow_2','rock_1','rock_2','water_1','forest_1','forest_2','canyon_1','canyon_2','sky_1','storm_1','mine_1','tower_1','tower_2'].map(n => `./sprites/arena/${n}.png`),
  ...['bg_gym_main','bg_gym_hook','bg_waterfall','pitch0','pitch1','pitch2','pitch3','ball','ball_super','bag_r0','bag_b0','frisbee0','frisbee1','frisbee2','bubble','hoop_r'].map(n => `./sprites/train/${n}.png`),
  './sprites/wild_n.png', './sprites/wild_b.png'];

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
  if (new URL(req.url).pathname.endsWith('/push-config.json')) return;   // 推播伺服器網址：永遠拿最新的

  // 頁面：先試網路（最多等 8 秒），失敗就用快取 → 有網路時拿到最新版，離線也能開
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
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

// V1.86.9 推播通知：伺服器推過來的訊息 → 跳出通知；點通知 → 打開遊戲
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '幻獸日記', { body: d.body || '牠在等你喔～', icon: './icon-192.png', badge: './icon-192.png', tag: d.tag || 'pf', renotify: true }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const L = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of L) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
