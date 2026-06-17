/* Robotics Hub service worker - web push */
self.addEventListener("push", function (event) {
  let data = { title: "Robotics Hub", body: "New activity", url: "/chat" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: { url: data.url || "/chat" },
    vibrate: [80, 40, 80],
    tag: "robotics-hub-message",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
