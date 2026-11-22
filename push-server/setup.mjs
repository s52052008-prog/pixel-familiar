// GitHub Actions 用：用 Cloudflare API 金鑰找到帳號、建立（或找到）KV、確認 workers.dev 子網域，寫出 wrangler.toml
import fs from 'fs';
const T = process.env.CLOUDFLARE_API_TOKEN, API = 'https://api.cloudflare.com/client/v4';
const cf = async (path, opt = {}) => { const r = await fetch(API + path, { ...opt, headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json', ...(opt.headers || {}) } }); const j = await r.json().catch(() => ({})); return j; };
const fail = m => { console.log(`::error::${m}`); process.exit(1); };
const acc = await cf('/accounts?per_page=5'); if (!acc.success || !acc.result || !acc.result.length) fail('API 金鑰讀不到帳號：建金鑰時請用「Edit Cloudflare Workers」範本，Account Resources 選 All accounts。' + JSON.stringify(acc.errors || []));
const A = acc.result[0].id; console.log('帳號：', acc.result[0].name);
const NAME = 'pixel-familiar-push';
let ns = (await cf(`/accounts/${A}/storage/kv/namespaces?per_page=100`)).result || [], kv = ns.find(n => n.title === NAME);
if (!kv) { const c = await cf(`/accounts/${A}/storage/kv/namespaces`, { method: 'POST', body: JSON.stringify({ title: NAME }) }); if (!c.success) fail('建立 KV 失敗：' + JSON.stringify(c.errors)); kv = c.result; console.log('已建立 KV'); }
let sd = await cf(`/accounts/${A}/workers/subdomain`), sub = sd.success && sd.result && sd.result.subdomain;
if (!sub) { for (let i = 0; i < 5 && !sub; i++) { const want = 'pixelfamiliar' + Math.random().toString(36).slice(2, 6); const r = await cf(`/accounts/${A}/workers/subdomain`, { method: 'PUT', body: JSON.stringify({ subdomain: want }) }); if (r.success) sub = r.result.subdomain || want; } if (!sub) fail('設定 workers.dev 子網域失敗'); console.log('已建立子網域'); }
fs.writeFileSync('push-server/wrangler.toml', `name = "${NAME}"\nmain = "worker.js"\ncompatibility_date = "2024-11-01"\nworkers_dev = true\n\n[[kv_namespaces]]\nbinding = "PF"\nid = "${kv.id}"\n\n[[durable_objects.bindings]]\nname = "STORE"\nclass_name = "Store"\n\n[[migrations]]\ntag = "v1"\nnew_sqlite_classes = ["Store"]\n\n[triggers]\ncrons = ["*/5 * * * *"]\n`);
fs.appendFileSync(process.env.GITHUB_ENV, `KV_ID=${kv.id}\nCLOUDFLARE_ACCOUNT_ID=${A}\nPUSH_URL=https://${NAME}.${sub}.workers.dev\n`);
console.log('網址：', `https://${NAME}.${sub}.workers.dev`);
