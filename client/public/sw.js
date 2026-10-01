// Web Push service worker. Deliberately minimal: it only reacts to a push
// event and a notification click — it does not cache anything, so it adds
// no offline behavior (that's still a documented, separate gap — see
// CLAUDE.md's "Known intentional gaps").
//
// A no-op passthrough fetch handler (below) is required anyway: Chrome's
// install-to-home-screen criteria have long required a service worker that
// handles `fetch`, even one that does nothing but forward to the network —
// without it, "Add to Home Screen"/the install prompt may never offer.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Shmeera", {
      body: data.body || "",
      data: { sessionId: data.sessionId, type: data.type },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
