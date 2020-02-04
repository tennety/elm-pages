workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.precacheAndRoute(self.__precacheManifest);


// This section is based on the following workbox recipe:
// https://developers.google.com/web/tools/workbox/guides/advanced-recipes#provide_a_fallback_response_to_a_route
const CACHE_NAME = 'shell';
const FALLBACK_HTML_URL = '/index.html';

self.addEventListener('fetch', function(event) {
  event.respondWith(
    // Check for cached responses first
    caches.match(event.request).then(function(response) {
      if (response) {
        return response;
      }
      return fetch(event.request).then(function(response) {
          // debugger
        if (response.status === 404) {
          // let 404 responses propogate through
          return response
        }
        return response
      });
    }).catch(function() {
      // If there's an exception, then the user is probably offline
      return caches.match(FALLBACK_HTML_URL, {
        cacheName: CACHE_NAME,
      });
    })
  );
});

self.addEventListener('install', async (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(FALLBACK_HTML_URL))
  );
});


workbox.routing.registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new workbox.strategies.CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: []
  }),
  "GET"
);
workbox.routing.registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: []
  }),
  "GET"
);
workbox.routing.registerRoute(
  /\.(?:png|gif|jpg|jpeg|svg)$/,
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "images",
    plugins: []
  }),
  "GET"
);

workbox.routing.registerRoute(
  /content\.json/,
  new workbox.strategies.NetworkFirst({
    cacheName: "content",
    plugins: []
  }),
  "GET"
);

