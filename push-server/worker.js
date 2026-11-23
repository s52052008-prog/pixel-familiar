// 幻獸日記 伺服器（Cloudflare Worker ＋ Durable Object SQLite）
// 1. 推播：遊戲把「預約清單」送上來，每 5 分鐘檢查一次，到時間推通知到手機
// 2. 好友：好友碼、加好友、拜訪（名片）、摸摸、澆水、留言板、送禮、配對邀請
// VAPID 金鑰存在 KV（PF）的 vapid（第一次自動產生，之後不能換，不然大家的訂閱會失效）
import { DurableObject } from 'cloudflare:workers';

const ORIGINS = ['https://s52052008-prog.github.io', 'http://localhost:8790'];
const SUB = 'https://s52052008-prog.github.io/pixel-familiar/';
const MAX_ITEMS = 40, KEEP_DAYS = 30;
const GIFT_OK = { food: 10, seeds: 10, candy: 5, potion: 5, fish: 5, cake: 3, coins: 500, mush: 3, mush_c: 3, mushN: 1 };   // 可以送的東西、一次最多幾個
const DAILY = [['food', 2], ['seeds', 2], ['candy', 1], ['coins', 30], ['potion', 1]];   // 每日免費小禮物（隨機一種）
const GNAME = { mush: '🍄 飄香菇', mush_c: '🍢 烤飄香菇', mushN: '✨ 夜光菇', food: '🍎 蘋果', seeds: '🌱 種子', candy: '🍬 糖果', potion: '🧪 回復藥水', fish: '🐟 魚', cake: '🍰 蛋糕', coins: '🪙 金幣' };
const LIMIT = { pet: 1, water: 1, msg: 5, gift: 3, daily: 1, mate: 3, mateBack: 3, duel: 3, search: 1, pk: 5, mush: 1, call: 1, care: 1 };
const SPARK_MS = [3, 7, 14, 30, 50, 100];   // V1.89 好友火花：連續幾天時兩人都拿獎勵
const AWAY_CALL = 864e5, AWAY_CARE = 12 * 3600e3;   // 朋友多久沒上線才能「叫他回來」、「幫忙照顧」   // 每天對同一個朋友最多幾次

const enc = new TextEncoder();
const b64u = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

async function vapidKeys(env) {
  let v = await env.PF.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await env.PF.put('vapid', JSON.stringify(v));
  }
  return v;
}
async function vapidAuth(env, endpoint) {
  const v = await vapidKeys(env), aud = new URL(endpoint).origin;
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), p = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUB })));
  const key = await crypto.subtle.importKey('jwk', v.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(h + '.' + p));
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${v.pub}`;
}
// RFC 8291 aes128gcm 加密
async function encrypt(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, secret);
  const ikm = (await hmac(prkKey, cat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16)), prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}
async function sendPush(env, sub, msg) {
  const body = await encrypt(sub, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'normal' }, body });
  return r.status;
}

const cors = req => { const o = req.headers.get('Origin') || ''; return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }; };
const json = (req, o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const okId = id => typeof id === 'string' && /^[a-z0-9]{12,40}$/.test(id);
const okSub = s => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 600 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
const clean = it => ({ at: Math.round(+it.at), title: String(it.title || '幻獸日記').slice(0, 40), body: String(it.body || '').slice(0, 140), tag: String(it.tag || '').slice(0, 24) });
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const twHour = t => new Date(t + 8 * 3600e3).getUTCHours();
const twDay = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const quiet = t => { const h = twHour(t); return h >= 23 || h < 8; };   // 晚上 11 點到早上 8 點不推好友通知（打開遊戲就看得到）
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 好友碼：去掉容易看錯的 0 O 1 I

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, card TEXT, sub TEXT, items TEXT, seen INTEGER);
      CREATE TABLE IF NOT EXISTS friends(a TEXT, b TEXT, at INTEGER, PRIMARY KEY(a,b));
      CREATE TABLE IF NOT EXISTS reqs(f TEXT, t TEXT, at INTEGER, PRIMARY KEY(f,t));
      CREATE TABLE IF NOT EXISTS inbox(n INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, f TEXT, kind TEXT, data TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS board(n INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, f TEXT, text TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS lim(k TEXT PRIMARY KEY, v INTEGER);
      CREATE TABLE IF NOT EXISTS steps(id TEXT, day TEXT, n INTEGER, at INTEGER, PRIMARY KEY(id,day));
      CREATE TABLE IF NOT EXISTS calls(f TEXT, t TEXT, at INTEGER, PRIMARY KEY(f,t));
      CREATE TABLE IF NOT EXISTS spark(a TEXT, b TEXT, n INTEGER, last TEXT, da TEXT, db TEXT, PRIMARY KEY(a,b));
      CREATE INDEX IF NOT EXISTS inbox_t ON inbox(t); CREATE INDEX IF NOT EXISTS board_t ON board(t);`);
    for (const c of ['pts INTEGER DEFAULT 1000', 'w INTEGER DEFAULT 0', 'l INTEGER DEFAULT 0']) { try { this.sql.exec('ALTER TABLE users ADD COLUMN ' + c); } catch (_) {} }   // 第二批：對戰積分
  }
  one(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  all(q, ...a) { return this.sql.exec(q, ...a).toArray(); }
  user(id) { return this.one('SELECT * FROM users WHERE id=?', id); }
  byCode(code) { return this.one('SELECT * FROM users WHERE code=?', String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')); }
  ensure(id) {
    let u = this.user(id); if (u) return u;
    let code; do { code = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CH[b % CODE_CH.length]).join(''); } while (this.byCode(code));
    this.sql.exec('INSERT INTO users(id,code,name,card,sub,items,seen) VALUES(?,?,?,?,?,?,?)', id, code, '', '{}', null, '[]', Date.now());
    return this.user(id);
  }
  isFriend(a, b) { return !!this.one('SELECT 1 AS x FROM friends WHERE a=? AND b=?', a, b); }
  petName(u) { try { return JSON.parse(u.card || '{}').pet.name || '牠'; } catch (_) { return '牠'; } }
  // V1.89 好友火花：兩個人同一天都有互動就 +1 天，斷一天就歸零
  sparkTouch(me, other, now) {
    const [a, b] = me < other ? [me, other] : [other, me], day = twDay(now), y = twDay(now - 864e5);
    let r = this.one('SELECT * FROM spark WHERE a=? AND b=?', a, b) || { n: 0, last: '', da: '', db: '' };
    if (me === a) r.da = day; else r.db = day;
    let hit = 0; if (r.da === day && r.db === day && r.last !== day) { r.n = r.last === y ? r.n + 1 : 1; r.last = day; hit = r.n; }
    this.sql.exec('INSERT OR REPLACE INTO spark(a,b,n,last,da,db) VALUES(?,?,?,?,?,?)', a, b, r.n, r.last, r.da, r.db); return hit;
  }
  sparkOf(me, other, now) {
    const [a, b] = me < other ? [me, other] : [other, me], day = twDay(now), y = twDay(now - 864e5), r = this.one('SELECT * FROM spark WHERE a=? AND b=?', a, b);
    if (!r) return { n: 0, me: false, them: false };
    const mine = me === a ? r.da : r.db, theirs = me === a ? r.db : r.da;
    return { n: r.last === day || r.last === y ? r.n : 0, me: mine === day, them: theirs === day };
  }
  async notify(u, body, tag) {   // 好友互動：馬上推一則（晚上不吵）
    if (!u || !u.sub || quiet(Date.now())) return;
    try { const st = await sendPush(this.env, JSON.parse(u.sub), { title: '幻獸日記', body, tag: tag || 'friend' }); if (st === 404 || st === 410) this.sql.exec('UPDATE users SET sub=NULL WHERE id=?', u.id); } catch (_) {}
  }
  bump(k, max) { const r = this.one('SELECT v FROM lim WHERE k=?', k), v = r ? r.v : 0; if (v >= max) return false; this.sql.exec('INSERT INTO lim(k,v) VALUES(?,1) ON CONFLICT(k) DO UPDATE SET v=v+1', k); return true; }
  befriend(a, b) { const t = Date.now(); this.sql.exec('INSERT OR IGNORE INTO friends(a,b,at) VALUES(?,?,?)', a, b, t); this.sql.exec('INSERT OR IGNORE INTO friends(a,b,at) VALUES(?,?,?)', b, a, t); this.sql.exec('DELETE FROM reqs WHERE (f=? AND t=?) OR (f=? AND t=?)', a, b, b, a); }
  mail(t, f, kind, data) { this.sql.exec('INSERT INTO inbox(t,f,kind,data,at) VALUES(?,?,?,?,?)', t, f, kind, JSON.stringify(data || {}), Date.now()); }
  pub(u) { let card = {}; try { card = JSON.parse(u.card || '{}'); } catch (_) {} return { code: u.code, name: u.name || '朋友', card, seen: u.seen, pts: u.pts ?? 1000, w: u.w || 0, l: u.l || 0 }; }

  async fetch(req) {
    const url = new URL(req.url), P = url.pathname;
    if (P === '/cron') return this.cron();
    if (P === '/vapid') return json(req, { key: (await vapidKeys(this.env)).pub });
    if (P === '/steps') {   // iPhone 捷徑送步數（GET）：先存著，遊戲打開時領走
      const k = url.searchParams.get('k') || '', n = Math.floor(+String(url.searchParams.get('n') || '').replace(/[^0-9.]/g, '')), d = /^\d{4}-\d\d-\d\d$/.test(url.searchParams.get('d') || '') ? url.searchParams.get('d') : twDay(Date.now());
      const txt = (t, st = 200) => new Response(t, { status: st, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors(req) } });
      if (!okId(k)) return txt('❌ 網址不對，請到遊戲的「👟 步數」重新複製', 400); if (!(n >= 0 && n <= 200000)) return txt('❌ 步數不對', 400);
      this.ensure(k); this.sql.exec('INSERT INTO steps(id,day,n,at) VALUES(?,?,?,?) ON CONFLICT(id,day) DO UPDATE SET n=MAX(n,excluded.n), at=excluded.at', k, d, n, Date.now());
      this.sql.exec('DELETE FROM steps WHERE at<?', Date.now() - 14 * 864e5);
      return txt(`✅ 幻獸日記：已送出今天 ${n} 步，打開遊戲就會登記`);
    }
    if (req.method !== 'POST') return json(req, { ok: true, name: 'pixel-familiar' });
    const b = await req.json().catch(() => ({})); if (!okId(b.id)) return json(req, { ok: false, msg: 'bad id' }, 400);
    const now = Date.now();
    // ---------- 推播 ----------
    if (P === '/sub') { if (!okSub(b.sub)) return json(req, { ok: false, msg: 'bad sub' }, 400); this.ensure(b.id); this.sql.exec('UPDATE users SET sub=?, seen=? WHERE id=?', JSON.stringify(b.sub), now, b.id); return json(req, { ok: true }); }
    if (P === '/plan') {
      const u = this.user(b.id); if (!u || !u.sub) return json(req, { ok: false, msg: 'no sub' }, 404);
      const items = (Array.isArray(b.items) ? b.items : []).map(clean).filter(i => i.at > now - 60e3 && i.at < now + 7 * 864e5).sort((x, y) => x.at - y.at).slice(0, MAX_ITEMS);
      this.sql.exec('UPDATE users SET items=?, seen=? WHERE id=?', JSON.stringify(items), now, b.id); return json(req, { ok: true, n: items.length });
    }
    if (P === '/test') { const u = this.user(b.id); if (!u || !u.sub) return json(req, { ok: false, msg: 'no sub' }, 404); const st = await sendPush(this.env, JSON.parse(u.sub), { title: '幻獸日記', body: b.body ? str(b.body, 140) : '🔔 通知設定好了！之後牠有事就會叫你～', tag: 'test' }); return json(req, { ok: st >= 200 && st < 300, status: st }); }
    if (P === '/off') { this.sql.exec("UPDATE users SET sub=NULL, items='[]' WHERE id=?", b.id); return json(req, { ok: true }); }
    // ---------- 好友 ----------
    if (P === '/me') {   // 上傳名片（主人名字、幻獸、房間擺設、田…），拿到自己的好友碼
      const u = this.ensure(b.id), card = JSON.stringify(b.card || {}); if (card.length > 8000) return json(req, { ok: false, msg: 'card too big' }, 400);
      this.sql.exec('UPDATE users SET name=?, card=?, seen=? WHERE id=?', str(b.name, 16), card, now, b.id); return json(req, { ok: true, code: u.code });
    }
    const me = this.ensure(b.id);
    if (P === '/social') {   // 好友名單、邀請、信箱（信箱拿了就清掉）
      this.sql.exec('UPDATE users SET seen=? WHERE id=?', now, b.id);
      for (const c of this.all('SELECT f FROM calls WHERE t=?', b.id)) {   // 被朋友叫回來了：兩個人都拿回歸禮物
        this.mail(b.id, c.f, 'callGift', {}); this.mail(c.f, b.id, 'callBack', {}); await this.notify(this.user(c.f), `🎉 ${me.name || '朋友'} 回來了！你們都拿到回歸禮物`, 'call');
      }
      this.sql.exec('DELETE FROM calls WHERE t=?', b.id);
      const friends = this.all('SELECT u.* FROM friends f JOIN users u ON u.id=f.b WHERE f.a=? ORDER BY u.seen DESC', b.id).map(u => ({ ...this.pub(u), spark: this.sparkOf(b.id, u.id, now) }));
      const reqs = this.all('SELECT u.code, u.name FROM reqs r JOIN users u ON u.id=r.f WHERE r.t=? ORDER BY r.at DESC LIMIT 20', b.id);
      const sent = this.all('SELECT u.code, u.name FROM reqs r JOIN users u ON u.id=r.t WHERE r.f=? ORDER BY r.at DESC LIMIT 20', b.id);
      const inbox = this.all('SELECT i.n, i.kind, i.data, i.at, u.code, u.name FROM inbox i LEFT JOIN users u ON u.id=i.f WHERE i.t=? ORDER BY i.n LIMIT 50', b.id).map(r => ({ ...r, data: JSON.parse(r.data || '{}') }));
      if (inbox.length) this.sql.exec('DELETE FROM inbox WHERE t=? AND n<=?', b.id, inbox[inbox.length - 1].n);
      const steps = this.all('SELECT day, n FROM steps WHERE id=? ORDER BY day', b.id); if (steps.length) this.sql.exec('DELETE FROM steps WHERE id=?', b.id);
      const board = this.all('SELECT b.text, b.at, u.name, u.code FROM board b LEFT JOIN users u ON u.id=b.f WHERE b.t=? ORDER BY b.n DESC LIMIT 30', b.id);
      return json(req, { ok: true, code: me.code, me: this.pub(this.user(b.id)), friends, reqs, sent, inbox, board, steps });
    }
    const other = this.byCode(b.code);
    if (!other) return json(req, { ok: false, msg: '找不到這個好友碼，請再確認一次' });
    if (other.id === b.id) return json(req, { ok: false, msg: '這是你自己的好友碼喔' });
    const myName = me.name || '朋友';
    if (P === '/add') {
      if (this.isFriend(b.id, other.id)) return json(req, { ok: true, msg: `你們已經是好友了` });
      if (this.one('SELECT 1 AS x FROM reqs WHERE f=? AND t=?', other.id, b.id)) { this.befriend(b.id, other.id); this.mail(other.id, b.id, 'friend', {}); await this.notify(other, `👥 ${myName} 跟你成為好友了！`); return json(req, { ok: true, friend: true, msg: `🎉 你和 ${other.name || '朋友'} 成為好友了！` }); }
      this.sql.exec('INSERT OR REPLACE INTO reqs(f,t,at) VALUES(?,?,?)', b.id, other.id, now); await this.notify(other, `👥 ${myName} 想加你好友，打開遊戲看看吧`);
      return json(req, { ok: true, msg: `已送出好友邀請給 ${other.name || '朋友'}，等對方同意` });
    }
    if (P === '/accept') {
      if (!this.one('SELECT 1 AS x FROM reqs WHERE f=? AND t=?', other.id, b.id)) return json(req, { ok: false, msg: '邀請已經不在了' });
      this.befriend(b.id, other.id); this.mail(other.id, b.id, 'friend', {}); await this.notify(other, `👥 ${myName} 同意了你的好友邀請！`); return json(req, { ok: true, msg: `🎉 你和 ${other.name || '朋友'} 成為好友了！` });
    }
    if (P === '/decline') { this.sql.exec('DELETE FROM reqs WHERE (f=? AND t=?) OR (f=? AND t=?)', other.id, b.id, b.id, other.id); return json(req, { ok: true }); }
    if (!this.isFriend(b.id, other.id)) return json(req, { ok: false, msg: '你們還不是好友' });
    if (P === '/remove') { this.sql.exec('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', b.id, other.id, other.id, b.id); return json(req, { ok: true }); }
    if (P === '/visit') {
      const board = this.all('SELECT b.text, b.at, u.name FROM board b LEFT JOIN users u ON u.id=b.f WHERE b.t=? ORDER BY b.n DESC LIMIT 20', other.id);
      const day = twDay(now), used = {}; for (const k of Object.keys(LIMIT)) { const r = this.one('SELECT v FROM lim WHERE k=?', `${k}:${b.id}:${other.id}:${day}`); used[k] = r ? r.v : 0; }
      return json(req, { ok: true, ...this.pub(other), board, used, limit: LIMIT, spark: this.sparkOf(b.id, other.id, now) });
    }
    if (P === '/duel') {   // 對戰結果：積分（像西洋棋那樣，打贏比自己強的拿比較多）
      const day = twDay(now); if (!this.bump(`duel:${b.id}:${other.id}:${day}`, LIMIT.duel)) return json(req, { ok: false, msg: '今天跟這位朋友的對戰次數用完了，明天再來吧' });
      const win = b.win === true, A = me.pts ?? 1000, Bp = other.pts ?? 1000, E = 1 / (1 + Math.pow(10, (Bp - A) / 400)), d = Math.max(1, Math.round(32 * ((win ? 1 : 0) - E) * (win ? 1 : -1)));
      const dA = win ? d : -d, dB = -dA, nA = Math.max(0, A + dA), nB = Math.max(0, Bp + dB);
      this.sql.exec(`UPDATE users SET pts=?, ${win ? 'w=w+1' : 'l=l+1'} WHERE id=?`, nA, b.id); this.sql.exec(`UPDATE users SET pts=?, ${win ? 'l=l+1' : 'w=w+1'} WHERE id=?`, nB, other.id);
      const mp = str(b.pet, 16) || '牠', op = this.petName(other);
      this.mail(other.id, b.id, 'duel', { won: !win, d: nB - Bp, pts: nB, pet: mp });
      await this.notify(other, win ? `⚔️ ${myName} 的 ${mp} 打贏了你的 ${op}…積分 ${nB - Bp}` : `🛡️ ${myName} 的 ${mp} 來挑戰，你的 ${op} 守住了！積分 +${nB - Bp}`, 'duel');
      return json(req, { ok: true, pts: nA, d: nA - A, them: nB });
    }
    if (P === '/act') {
      const kind = String(b.kind), lim = LIMIT[kind]; if (!lim) return json(req, { ok: false, msg: 'bad kind' }, 400);
      const day = twDay(now), key = `${kind}:${b.id}:${other.id}:${day}`, pn = this.petName(other);
      let data = {}, push = '', msg = '';
      const away = now - (other.seen || 0);
      if (kind === 'call') { if (away < AWAY_CALL) return json(req, { ok: false, msg: `${other.name || '朋友'} 最近有上線喔，不用叫啦` }); push = `📣 ${myName} 想你了！${pn} 在門口等你，回來你們兩個都有禮物～`; msg = `📣 叫 ${other.name || '朋友'} 回來了！他一上線，你們都會拿到回歸禮物`; }
      else if (kind === 'care') { if (away < AWAY_CARE) return json(req, { ok: false, msg: `${other.name || '朋友'} 最近有上線，${pn} 吃得飽飽的` }); push = `🍖 ${myName} 趁你不在，幫你餵了 ${pn}、陪牠玩了一下`; msg = `🍖 餵飽 ${pn}、陪牠玩了一下！`; }
      else if (kind === 'mush') { data = { k: str(b.data && b.data.k, 8) }; push = `🍄 ${myName} 來幫你採蘑菇，你們各拿到一朵！`; msg = '🍄 幫忙採蘑菇了！'; }
      else if (kind === 'pk') { const sv = Math.max(0, Math.min(5, Math.floor(+(b.data && b.data.saves) || 0))), gl = Math.max(0, Math.min(5, Math.floor(+(b.data && b.data.goals) || 0))); data = { saves: sv, goals: gl }; push = sv ? `🧤 ${myName} 來踢 PK，${pn} 撲出了 ${sv} 球！` : `⚽ ${myName} 踢 PK 進了 ${gl} 球，${pn} 下次加油！`; msg = ''; }
      else if (kind === 'search') { push = `🔍 ${myName} 幫你一起找 ${pn}！又靠近一點了`; msg = `🔍 幫忙找 ${pn}，找到一些線索了！`; }
      else if (kind === 'pet') { push = `✋ ${myName} 來你家摸了摸 ${pn}，牠好開心！`; msg = `✋ 摸了摸 ${pn}，牠很開心！`; }
      else if (kind === 'water') { push = `💧 ${myName} 幫你的田澆了水，作物長快一點了`; msg = '💧 幫忙澆水了！'; }
      else if (kind === 'msg') { const t = str(b.data && b.data.text, 60).trim(); if (!t) return json(req, { ok: false, msg: '留言是空的' }); data = { text: t }; push = `💌 ${myName}：${t}`; msg = '💌 留言送出了'; }
      else if (kind === 'gift') { const it = b.data && b.data.item, n = Math.floor(+(b.data && b.data.n)); if (!GIFT_OK[it] || !(n >= 1 && n <= GIFT_OK[it])) return json(req, { ok: false, msg: '不能送這個' }); data = { item: it, n }; push = `🎁 ${myName} 送你 ${GNAME[it]} ×${n}！`; msg = `🎁 送出 ${GNAME[it]} ×${n}`; }
      else if (kind === 'daily') { const [it, n] = DAILY[Math.floor(Math.random() * DAILY.length)]; data = { item: it, n, free: 1 }; push = `🎁 ${myName} 送你一份小禮物：${GNAME[it]} ×${n}`; msg = `🎁 送出今天的小禮物：${GNAME[it]} ×${n}`; }
      else if (kind === 'mate' || kind === 'mateBack') { const c = str(b.data && b.data.code, 3000); if (!/^PFM1\./.test(c)) return json(req, { ok: false, msg: '配對碼不對' }); data = { code: c, pet: str(b.data.pet, 16) }; push = kind === 'mate' ? `💞 ${myName} 想讓牠的幻獸跟 ${pn} 配對！` : `💞 ${myName} 答應配對了！打開遊戲完成配對`; msg = kind === 'mate' ? '💞 配對邀請送出了，等對方答應' : '💞 已經答應，對方也會拿到蛋'; }
      if (!this.bump(key, lim)) return json(req, { ok: false, msg: lim === 1 ? '今天已經做過了，明天再來吧' : '今天的次數用完了，明天再來吧' });
      if (kind === 'msg') { this.sql.exec('INSERT INTO board(t,f,text,at) VALUES(?,?,?,?)', other.id, b.id, data.text, now); this.sql.exec('DELETE FROM board WHERE t=? AND n NOT IN (SELECT n FROM board WHERE t=? ORDER BY n DESC LIMIT 30)', other.id, other.id); }
      if (kind === 'call') { this.sql.exec('INSERT OR REPLACE INTO calls(f,t,at) VALUES(?,?,?)', b.id, other.id, now); await this.notify(other, push, 'call'); return json(req, { ok: true, msg }); }
      this.mail(other.id, b.id, kind, data); await this.notify(other, push, kind);
      const hit = this.sparkTouch(b.id, other.id, now);   // 好友火花
      if (hit && SPARK_MS.includes(hit)) { this.mail(other.id, b.id, 'spark', { n: hit }); this.mail(b.id, other.id, 'spark', { n: hit }); await this.notify(other, `🔥 你和 ${myName} 的好友火花連續 ${hit} 天了！打開遊戲領獎勵`, 'spark'); }
      return json(req, { ok: true, msg, data, spark: this.sparkOf(b.id, other.id, now), hit });
    }
    return json(req, { ok: false }, 404);
  }
  async cron() {   // 每 5 分鐘：預約的通知到時間就推
    const now = Date.now();
    try {   // 發佈新版本時的全體通知（GitHub Actions 寫進 KV 的 bc），每則只送一次，晚上等到早上再送
      const bc = await this.env.PF.get('bc', 'json');
      if (bc && bc.id && bc.body && !quiet(now) && (await this.ctx.storage.get('bcSent')) !== bc.id) {
        await this.ctx.storage.put('bcSent', bc.id);
        for (const u of this.all('SELECT id, sub FROM users WHERE sub IS NOT NULL')) { try { const st = await sendPush(this.env, JSON.parse(u.sub), { title: '幻獸日記', body: str(bc.body, 140), tag: 'update' }); if (st === 404 || st === 410) this.sql.exec('UPDATE users SET sub=NULL WHERE id=?', u.id); } catch (_) {} }
      }
    } catch (_) {}
    this.sql.exec('DELETE FROM lim WHERE k NOT LIKE ?', `%:${twDay(now)}`);
    this.sql.exec('DELETE FROM inbox WHERE at<?', now - 60 * 864e5);
    for (const u of this.all("SELECT * FROM users WHERE sub IS NOT NULL AND items!='[]'")) {
      if (now - (u.seen || 0) > KEEP_DAYS * 864e5) { this.sql.exec("UPDATE users SET items='[]' WHERE id=?", u.id); continue; }   // 太久沒玩就不再提醒
      let items = []; try { items = JSON.parse(u.items || '[]'); } catch (_) {}
      const due = items.filter(i => i.at <= now); if (!due.length) continue;
      this.sql.exec('UPDATE users SET items=? WHERE id=?', JSON.stringify(items.filter(i => i.at > now)), u.id);
      const msg = due.length > 1 ? { title: '幻獸日記', body: due.slice(-3).map(i => i.body).join('\n'), tag: 'multi' } : due[0];   // 同時好幾件就合成一則
      try { const st = await sendPush(this.env, JSON.parse(u.sub), msg); if (st === 404 || st === 410) this.sql.exec("UPDATE users SET sub=NULL, items='[]' WHERE id=?", u.id); } catch (_) {}
    }
    return new Response('ok');
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    if (new URL(req.url).pathname === '/cron') return new Response('no', { status: 403 });
    try { return await env.STORE.get(env.STORE.idFromName('main')).fetch(req); }
    catch (e) { return json(req, { ok: false, msg: String(e && e.message || e) }, 500); }
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(env.STORE.get(env.STORE.idFromName('main')).fetch('https://store/cron', { method: 'POST' })); }
};
