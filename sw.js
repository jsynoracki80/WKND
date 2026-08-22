const CACHE_NAME = "rejonizacja-v4";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./kml/index.json",
  "./kml/couriers.json",
  "./kml/addresses.json"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    // dociągnij wszystkie pliki .kml wymienione w index.json, żeby granice rejonów
    // działały nawet całkowicie offline (bez samego geokodowania adresu)
    try {
      const res = await fetch("./kml/index.json");
      const files = await res.json();
      await cache.addAll(files.map(f => "./kml/" + f));
    } catch (e) {
      // brak sieci przy pierwszej instalacji – uzupełni się przy kolejnej wizycie z internetem
    }
    // NIE wołamy tu self.skipWaiting() — nowa wersja czeka, aż użytkownik
    // kliknie "Odśwież" na banerze w apce (patrz listener "message" niżej).
  })());
});

self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    self.clients.claim();
  })());
});

// stale-while-revalidate: od razu odpowiadamy z cache (szybko, działa offline),
// a w tle dociągamy świeższą wersję na kolejny raz. Tylko dla naszej własnej domeny —
// Nominatim/Geoportal/OSM/CDN idą normalnie do sieci, nie ingerujemy w nie.
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    const networkFetch = fetch(event.request).then(res => {
      if (res && res.ok) cache.put(event.request, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      networkFetch; // odświeżenie w tle, nie blokujemy odpowiedzi
      return cached;
    }
    const netRes = await networkFetch;
    return netRes || new Response("Offline – brak tego zasobu w cache", { status: 503 });
  })());
});
