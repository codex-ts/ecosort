/* EcoSort offline cache — static assets only, network-first for APIs */
const CACHE = "ecosort-v3";
const ASSETS = ["./", "./index.html", "./classify.html", "./library.html", "./bins.html", "./quiz.html", "./impact.html", "./assistant.html", "./about.html", "./css/styles.css", "./js/knowledge.js", "./js/site.js", "./js/app.js", "./manifest.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html"))));
});
