// Service worker that blocks known ad/popup domains at the network level.
// Intercepts all fetch requests (including from iframes) and returns an
// empty response for any request to a known ad domain.

const AD_DOMAINS = [
  "sentrygabiescloes.qpon",
  "devilyquondam.cyou",
  "jivingafrithm.cyou",
  "guarriancha.qpon",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

function isAdUrl(urlStr) {
  try {
    const host = new URL(urlStr).hostname;
    return AD_DOMAINS.some(
      (d) => host === d || host.endsWith("." + d),
    );
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (isAdUrl(req.url)) {
    event.respondWith(
      new Response("", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "text/plain" },
      }),
    );
    return;
  }
  // Default: let the browser handle it normally.
});
