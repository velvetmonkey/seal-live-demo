// SPDX-License-Identifier: Apache-2.0
// Minimal offline cache: precache the kernel + shell so the replay runs offline.
// bundle.json is fetched network-first (it changes per run); everything else
// cache-first. No telemetry, no external origins.
const CACHE = "seal-replay-v0";
const ASSETS = [
  "./", "index.html", "style.css", "replay.js",
  "seal-wasm.js", "seal-config.js", "wasm/seal.js", "wasm/seal.wasm", "manifest.json",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never touch external origins
  if (url.pathname.endsWith("bundle.json")) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return; }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
