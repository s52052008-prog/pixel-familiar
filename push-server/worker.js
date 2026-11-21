// 幻獸日記 推播伺服器（Cloudflare Worker）
// 遊戲把「預約清單」（幾點要提醒什麼）送上來；每 5 分鐘檢查一次，到時間就推通知到手機。
// 儲存：KV（綁定名稱 PF）。VAPID 金鑰第一次啟動時自動產生，存在 KV 的 vapid。
const ORIGINS = ['https://s52052008-prog.github.io'];
const SUB = 'https://s52052008-prog.github.io/pixel-familiar/';
const MAX_ITEMS = 40, KEEP_DAYS = 30;

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
  const rs = new Uint8Array([0, 0, 16, 0]);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
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

async function users(env) { return (await env.PF.get('users', 'json')) || []; }
async function addUser(env, id) { const U = await users(env); if (!U.includes(id)) { U.push(id); await env.PF.put('users', JSON.stringify(U)); } }

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/vapid') return json(req, { key: (await vapidKeys(env)).pub });
      if (req.method !== 'POST') return json(req, { ok: true, name: 'pixel-familiar-push' });
      const b = await req.json(); if (!okId(b.id)) return json(req, { ok: false, msg: 'bad id' }, 400);
      const key = 'u:' + b.id;
      if (url.pathname === '/sub') {
        if (!okSub(b.sub)) return json(req, { ok: false, msg: 'bad sub' }, 400);
        const u = (await env.PF.get(key, 'json')) || { items: [] }; u.sub = b.sub; u.seen = Date.now();
        await env.PF.put(key, JSON.stringify(u)); await addUser(env, b.id); return json(req, { ok: true });
      }
      if (url.pathname === '/plan') {
        const u = await env.PF.get(key, 'json'); if (!u || !u.sub) return json(req, { ok: false, msg: 'no sub' }, 404);
        const now = Date.now(); u.items = (Array.isArray(b.items) ? b.items : []).map(clean).filter(i => i.at > now - 60e3 && i.at < now + 7 * 864e5).sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS); u.seen = now;
        await env.PF.put(key, JSON.stringify(u)); return json(req, { ok: true, n: u.items.length });
      }
      if (url.pathname === '/test') {
        const u = await env.PF.get(key, 'json'); if (!u || !u.sub) return json(req, { ok: false, msg: 'no sub' }, 404);
        const st = await sendPush(env, u.sub, { title: '幻獸日記', body: b.body ? String(b.body).slice(0, 140) : '🔔 通知設定好了！之後牠有事就會叫你～', tag: 'test' });
        return json(req, { ok: st >= 200 && st < 300, status: st });
      }
      if (url.pathname === '/off') { await env.PF.delete(key); return json(req, { ok: true }); }
      return json(req, { ok: false }, 404);
    } catch (e) { return json(req, { ok: false, msg: String(e && e.message || e) }, 500); }
  },
  async scheduled(ev, env) {
    const now = Date.now(), U = await users(env), keep = [];
    for (const id of U) {
      const key = 'u:' + id, u = await env.PF.get(key, 'json'); if (!u || !u.sub) continue;
      if (now - (u.seen || 0) > KEEP_DAYS * 864e5) { await env.PF.delete(key); continue; }   // 太久沒玩就不再提醒
      keep.push(id);
      const due = (u.items || []).filter(i => i.at <= now); if (!due.length) continue;
      u.items = u.items.filter(i => i.at > now);
      const last = due[due.length - 1], msg = due.length > 1 ? { title: '幻獸日記', body: due.slice(-3).map(i => i.body).join('\n'), tag: 'multi' } : last;   // 同時好幾件就合成一則
      const st = await sendPush(env, u.sub, msg);
      if (st === 404 || st === 410) { await env.PF.delete(key); keep.pop(); continue; }   // 手機取消訂閱了
      await env.PF.put(key, JSON.stringify(u));
    }
    if (keep.length !== U.length) await env.PF.put('users', JSON.stringify(keep));
  }
};
