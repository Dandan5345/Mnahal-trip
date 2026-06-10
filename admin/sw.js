const CACHE = "triptap-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./styles.css",
  "./assets/hero.svg",
  "./assets/icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => { }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function putInCache(req, res) {
  if (res && res.status === 200 && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { });
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isCode = req.mode === "navigate" || /\.(?:js|css|html)$/.test(url.pathname);
  if (isCode) {
    // קוד תמיד מהרשת קודם — כך עדכונים נכנסים מיד והאתר לא נתקע על גרסה ישנה.
    event.respondWith(
      fetch(req).then((res) => putInCache(req, res)).catch(() => caches.match(req))
    );
    return;
  }

  // נכסים סטטיים: מהמטמון מיד, עם רענון ברקע.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => putInCache(req, res)).catch(() => cached);
      return cached || network;
    })
  );
});
