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
 *    stale. Served cache-first. Only a real file is ever kept: a 200 that is really
 *    an HTML page (what an unknown URL gets from the single-page-app fallback) or any
 *    non-200 is passed through but NOT cached, so an error can't stick to a file name.
 *  - Everything else (the API, uploads, PDFs, other sites, any non-GET request) is
 *    left alone and goes straight to the network.
 *
 * A failing cache write must never fail the page: the network's answer is returned
 * first and the copy is stored afterwards, ignoring errors (quota, partial content).
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

/** A response worth keeping as a build file: a 200 that isn't an HTML page. A fresh network
 *  response must also be same-origin ("basic"); one read back from the cache is not re-checked
 *  for type, only for status and content. */
function isRealAsset(response, fromCache) {
  if (!response || response.status !== 200) return false;
  if (!fromCache && response.type !== "basic") return false;
  return !/text\/html/i.test(response.headers.get("content-type") || "");
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function cacheFirst(event) {
  const request = event.request;
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) {
    if (isRealAsset(hit, true)) return hit;
    await cache.delete(request); // never serve a bad copy; fetch it fresh
  }
  const response = await fetch(request);
  if (isRealAsset(response)) {
    // Stored after the page already has its answer; a failed write is ignored.
    event.waitUntil(
      cache.put(request, response.clone()).then(() => trim(cache)).catch(() => undefined)
    );
  }
  return response;
}

// The offline page and its logo are re-fetched (revalidated, usually a 304) once per
// worker start-up, so an edited offline page reaches installed phones without a VERSION bump.
let shellRefreshed = false;
async function refreshShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: "no-cache" });
      if (response.ok && response.type === "basic") await cache.put(url, response);
    })
  );
}

async function offlineResponse() {
  const cached = await caches.match(OFFLINE_URL);
  return (
    cached ||
    new Response("You're offline. Check your connection and try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Server endpoints (API, MCP, uploads, health) are never touched.
  if (/^\/(api|mcp|uploads|healthz)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(
        (response) => {
          if (!shellRefreshed) {
            shellRefreshed = true;
            event.waitUntil(refreshShell().catch(() => { shellRefreshed = false; }));
          }
          return response;
        },
        () => offlineResponse()
      )
    );
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event));
    return;
  }
  // The offline page's own files (its logo), so it still looks right with no signal.
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
