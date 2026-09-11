// Web Push service worker. Deliberately minimal: it only reacts to a push
// event and a notification click — it does not intercept fetches or cache
// anything, so it adds no offline behavior (that's still a documented,
// separate gap — see CLAUDE.md's "Known intentional gaps").
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
