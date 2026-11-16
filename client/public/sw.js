/*
 * VenueFlowHQ service worker.
 *
 * Deliberately small. It makes the site installable and fast to open, and shows a
 * clear "you're offline" page — it does NOT keep bookings, payments or any API data
 * offline, because stale money or event details would be worse than none.
 *
 *  - Page loads (navigations): always from the network, so a deploy is picked up at
 *    once. Only if the network fails is the offline page shown.
 *  - /assets/*: build files with a hash in their name, so a cached copy can never be
 *    stale. Served cache-first.
 *  - Everything else (the API, uploads, PDFs, other sites, any non-GET request) is
 *    left alone and goes straight to the network.
 *
 * Bump VERSION to drop every cache this worker has made.
 */
const VERSION = "v1";
const SHELL_CACHE = "vf-shell-" + VERSION;
const ASSET_CACHE = "vf-assets-" + VERSION;
const OFFLINE_URL = "/offline.html";
const SHELL_URLS = [OFFLINE_URL, "/icon-192.png"];
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL_CACHE && key !== ASSET_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Server endpoints (API, MCP, uploads, health) are never touched.
  if (/^\/(api|mcp|uploads|healthz)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  }
  // The offline page's own files (its logo), so it still looks right with no signal.
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
