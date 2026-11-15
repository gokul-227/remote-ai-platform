/* Remote AI Platform push service worker.
 *
 * The API sends standard Web Push messages (VAPID, RFC 8291 encryption; the
 * browser decrypts them); this worker shows them and opens the linked screen. It loads no third-party scripts and
 * never reads page data. Notification text comes from our own API.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  // Payload: {title, body, link, url}. The nested {notification, data} shape is
  // still read so a message queued before the switch renders correctly.
  const n = payload.notification || payload;
  const data = payload.data || payload;
  const title = typeof n.title === "string" && n.title ? n.title.slice(0, 120) : "Remote AI Platform";
  const body = typeof n.body === "string" ? n.body.slice(0, 240) : "";
  const link = typeof data.link === "string" && data.link.startsWith("#") ? data.link : "#notifications";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { link },
      tag: link,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "#notifications";
  const target = new URL("/" + link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
