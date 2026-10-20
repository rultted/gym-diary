// Service worker: РїСЂРёР»РѕР¶РµРЅРёРµ СЂР°Р±РѕС‚Р°РµС‚ Р±РµР· РёРЅС‚РµСЂРЅРµС‚Р°.
// РЎС‚СЂР°С‚РµРіРёСЏ В«СЃРЅР°С‡Р°Р»Р° СЃРµС‚СЊ, РїРѕС‚РѕРј РєСЌС€В» вЂ” РѕР±РЅРѕРІР»РµРЅРёСЏ РїРѕРґС‚СЏРіРёРІР°СЋС‚СЃСЏ СЃР°РјРё, РѕС„Р»Р°Р№РЅ Р±РµСЂС‘С‚СЃСЏ РёР· РєСЌС€Р°.
const CACHE = 'gymlog-v4';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
