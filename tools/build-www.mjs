// 把網頁版需要的檔案複製到 www/，給 iOS App（Capacitor）打包用
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const out = 'www';
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
for (const f of ['index.html', 'game-core.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'])
  if (existsSync(f)) cpSync(f, `${out}/${f}`);
cpSync('sprites', `${out}/sprites`, { recursive: true });
console.log('www/ ready');
