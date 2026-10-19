const CACHE_NAME = "tempo-shell-v1"
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/icons/tempo.svg", "/icons/tempo-maskable.svg", "/manifest.webmanifest"])))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tempo-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const response = await fetch(request)
        if (response.ok && url.pathname.startsWith("/app")) await cache.put(request, response.clone())
        return response
      } catch {
        return (await cache.match(request)) || (url.pathname.startsWith("/app") ? await cache.match("/app") : null) || (await cache.match(OFFLINE_URL))
      }
    })())
    return
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
  }
})
