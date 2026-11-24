const CACHE_NAME = "veritas-react-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/offline.html"];
const MAX_ENTRIES = 80;
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});
self.addEventListener("message", event => { if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("veritas-react-") && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
async function retain(request, response) {
  if (!response.ok || response.type === "opaque" || /no-store|private/i.test(response.headers.get("cache-control") || "")) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
  const keys = await cache.keys();
  const removable = keys.filter(key => !SHELL.includes(new URL(key.url).pathname));
  for (const key of removable.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
}
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization") || url.pathname.startsWith("/api/") || url.search) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (url.pathname === "/") event.waitUntil(retain("/", response.clone()));
      return response;
    }).catch(async () => (url.pathname === "/" || url.pathname.startsWith("/workspace/") ? await caches.match("/") : null) || await caches.match("/offline.html")));
    return;
  }
  const immutable = url.pathname.startsWith("/_next/static/");
  const publicAsset = ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname);
  if (!immutable && !publicAsset) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached && immutable) return cached;
    try { const response = await fetch(request); event.waitUntil(retain(request, response.clone())); return response; }
    catch (error) { if (cached) return cached; throw error; }
  })());
});
