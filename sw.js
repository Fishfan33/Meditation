// Offline-Kopie der Meditation (Service Worker): legt alle App-Dateien auf dem Gerät ab,
// damit die App auch ohne Internet startet, und bedient sie von dort (schnell, auch offline).
// Vorlage: sw.js im Retro-Cockpit.
//
// VERSION und die „?v=…“ unten setzt werkzeuge/versionen.sh automatisch vor jedem Commit, nie von Hand.
// Ändert sich irgendeine App-Datei, ändert sich damit diese Datei: Der Browser installiert sie neu,
// und die App bietet „Neue Version verfügbar, neu laden“ an (übernommen wird erst nach dem Klick).
// Braucht die App eine neue Datei (Bild, Seite, Skript, Aufnahme), sie hier in FILES ergänzen.
const VERSION = "8fcef9fe";
const CACHE = "meditation-" + VERSION;
const FILES = [
  "./",
  "datenschutz.html",
  "app.css?v=23f90b6b",
  "js/phasen.js?v=4a1758aa",
  "js/texte.js?v=fa937935",
  "js/zustand.js?v=e2e4c913",
  "js/aufnahmen.js?v=5ee97738",
  "js/stimme.js?v=7ae9df3b",
  "js/meldungen.js?v=f4eacd6d",
  "js/plan.js?v=727a6b85",
  "js/sitzung.js?v=e2313898",
  "js/bedienung.js?v=7a5092f0",
  "config.js?v=101aa02f",
  "js/admin.js?v=77781dc2",
  "js/start.js?v=bf25bd92",
  "manifest.json",
  "fonts/AtkinsonHyperlegible-Regular.woff2",
  "fonts/AtkinsonHyperlegible-Bold.woff2",
  "fonts/InterZiffern-Regular.woff2",
  "fonts/InterZiffern-Bold.woff2",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "klang/regen.mp3",
  "klang/wald.mp3",
  "klang/wind.mp3",
  "klang/meer.mp3",
  // Aufnahmen (setzt werkzeuge/aufnahmen.py)
  "stimme/0067820eb15e.mp3",
  "stimme/008573d858b7.mp3",
  "stimme/00cd7f9a7938.mp3",
  "stimme/054c60079b47.mp3",
  "stimme/05ce38b04748.mp3",
  "stimme/07a9598e2822.mp3",
  "stimme/08bba3eb7f2c.mp3",
  "stimme/0aa8c230fb24.mp3",
  "stimme/0b36af1a6709.mp3",
  "stimme/0c807c3714ac.mp3",
  "stimme/0ea2588229d2.mp3",
  "stimme/1181bf1e9c0b.mp3",
  "stimme/15b3bea7c873.mp3",
  "stimme/193e71943c2f.mp3",
  "stimme/1d9ac3145d8f.mp3",
  "stimme/2094e548da93.mp3",
  "stimme/21b81e81d127.mp3",
  "stimme/235b5c8660f3.mp3",
  "stimme/28ca0b7f23f1.mp3",
  "stimme/2a1fd402c139.mp3",
  "stimme/2df29c4c0708.mp3",
  "stimme/2fb7f6d17c41.mp3",
  "stimme/3011078a2afd.mp3",
  "stimme/35021b7e7f83.mp3",
  "stimme/3554aa4efc46.mp3",
  "stimme/36538bf90415.mp3",
  "stimme/37c1945439cb.mp3",
  "stimme/38668c881e82.mp3",
  "stimme/3c06ef22a693.mp3",
  "stimme/3deb14bbe512.mp3",
  "stimme/3e04b2ea3c59.mp3",
  "stimme/3e133d12df10.mp3",
  "stimme/3f624b858e4f.mp3",
  "stimme/3fcd3812f023.mp3",
  "stimme/437856d77bee.mp3",
  "stimme/44ac5c47e613.mp3",
  "stimme/497ab9fb6537.mp3",
  "stimme/4a3f8216cb00.mp3",
  "stimme/4b54cb06d619.mp3",
  "stimme/4c68a4199cb9.mp3",
  "stimme/4d1f6299c3ee.mp3",
  "stimme/4ea1697b884b.mp3",
  "stimme/4ed7c504901b.mp3",
  "stimme/4f7b9f65f5ce.mp3",
  "stimme/5051baccc19c.mp3",
  "stimme/51cbaaa55759.mp3",
  "stimme/5775907b361c.mp3",
  "stimme/5c11f392cd36.mp3",
  "stimme/5f5c6266661b.mp3",
  "stimme/60df9e933a4f.mp3",
  "stimme/62275b1e000e.mp3",
  "stimme/63a0744e93d5.mp3",
  "stimme/63cc804da902.mp3",
  "stimme/64fb8ddd5d4f.mp3",
  "stimme/651227a65818.mp3",
  "stimme/65161fa48322.mp3",
  "stimme/6932b308aacd.mp3",
  "stimme/6a6683b26962.mp3",
  "stimme/6ccf08147659.mp3",
  "stimme/6d473037e088.mp3",
  "stimme/6f18a38e4ef1.mp3",
  "stimme/73a657fa5c0f.mp3",
  "stimme/73b7e7972ec8.mp3",
  "stimme/74f1b19367c3.mp3",
  "stimme/752f6cfee8bc.mp3",
  "stimme/770937938ef7.mp3",
  "stimme/7bfa36792b8a.mp3",
  "stimme/7d0412ddd393.mp3",
  "stimme/7f7bb3fc9177.mp3",
  "stimme/7ff40aeccfd9.mp3",
  "stimme/83aacfa3b0ac.mp3",
  "stimme/840d0e6c281a.mp3",
  "stimme/861b67659be4.mp3",
  "stimme/86217056c9f4.mp3",
  "stimme/8662960c9453.mp3",
  "stimme/868e514baeb6.mp3",
  "stimme/8842d44cf1b9.mp3",
  "stimme/8c0eb972e84b.mp3",
  "stimme/8e8f37d8f854.mp3",
  "stimme/8ebb50625f29.mp3",
  "stimme/90864943845a.mp3",
  "stimme/919d18e73940.mp3",
  "stimme/925bf7aeaa6f.mp3",
  "stimme/96b562c4993a.mp3",
  "stimme/97c949fa0ccd.mp3",
  "stimme/9cc39be7a1fb.mp3",
  "stimme/9f9a35548d40.mp3",
  "stimme/a0167008ccd1.mp3",
  "stimme/a0d4dee9b0ce.mp3",
  "stimme/a1b7dbb6bba8.mp3",
  "stimme/a7f7cb92a3bf.mp3",
  "stimme/a8d8e1e8d19e.mp3",
  "stimme/ac6712bf5df3.mp3",
  "stimme/af7175f8e6ef.mp3",
  "stimme/b08f93d9a9c9.mp3",
  "stimme/b0a605609345.mp3",
  "stimme/b183c8dd1519.mp3",
  "stimme/b258f9fcfb17.mp3",
  "stimme/b6bcc213cc56.mp3",
  "stimme/ba1782cb0eba.mp3",
  "stimme/ba933be4b493.mp3",
  "stimme/bc1a8674a1a1.mp3",
  "stimme/c12225a61bdf.mp3",
  "stimme/c5a317e65dca.mp3",
  "stimme/ccab8aa4ca7f.mp3",
  "stimme/cd1beaef0640.mp3",
  "stimme/ce06eb32ddf5.mp3",
  "stimme/cf30495f7d2a.mp3",
  "stimme/d044a4fd378a.mp3",
  "stimme/d056fa11df94.mp3",
  "stimme/d05ba62616de.mp3",
  "stimme/d14197abf085.mp3",
  "stimme/d2ae6722904b.mp3",
  "stimme/dc180d8e398e.mp3",
  "stimme/dee18e302939.mp3",
  "stimme/df247dff645e.mp3",
  "stimme/e7ec5e7262e2.mp3",
  "stimme/e93afebd2204.mp3",
  "stimme/eab83738f33f.mp3",
  "stimme/eb309a598d27.mp3",
  "stimme/eb558671b61e.mp3",
  "stimme/ec3207b2d8a7.mp3",
  "stimme/ece27cce1ce8.mp3",
  "stimme/edf61066e252.mp3",
  "stimme/ef33025b0668.mp3",
  "stimme/f0b333d33c02.mp3",
  "stimme/f473f56ef1e4.mp3",
  "stimme/f81fe8156486.mp3",
  "stimme/fb6b90ed89bc.mp3",
  "stimme/fec9fbc87fb9.mp3",
  // Ende Aufnahmen
];

// Installieren: alles frisch vom Server holen, nicht aus dem 10-Minuten-Zwischenspeicher von GitHub Pages
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(f => new Request(f, { cache: "reload" })));
    // Kurz nach dem Veröffentlichen liefert GitHub evtl. noch die alte Startseite (bis 10 Minuten).
    // Passt sie nicht zu den Dateien oben, abbrechen: Der Browser versucht es beim nächsten Aufruf erneut.
    const page = await (await cache.match("./")).text();
    if (!FILES.filter(f => f.includes("?v=")).every(f => page.includes(f))) {
      await caches.delete(CACHE);
      throw new Error("Startseite gehört noch zu einer anderen Version");
    }
  })());
});

// Aktivieren: Kopien älterer Versionen löschen und offene Seiten sofort übernehmen
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("meditation-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Die App schickt das nach dem Klick auf „Neu laden“: wartende neue Version jetzt übernehmen
self.addEventListener("message", event => {
  if (event.data === "aktivieren") self.skipWaiting();
});

// Anfragen zuerst aus der Offline-Kopie beantworten; unbekannte Seitenaufrufe bekommen die App.
// Alles andere geht wie gewohnt ins Netz.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const navigate = req.mode === "navigate";
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(req, { ignoreSearch: navigate })) ||
    (navigate && await cache.match("./").then(app => fetch(req).catch(() => app))) ||
    fetch(req)));
});
