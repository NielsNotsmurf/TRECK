// Fase 6: lege push van de Worker -> tekst ophalen bij /api/pushmsg; tik opent de app.
const DEFAULT = 'Al ingevoerd wat je gegeten hebt?';
self.addEventListener('push', (e) => e.waitUntil(self.registration.pushManager.getSubscription()
  .then((s) => fetch('/api/pushmsg?e=' + encodeURIComponent(s.endpoint)).then((r) => r.json()))
  .then((d) => d.msg || DEFAULT, () => DEFAULT)
  .then((body) => self.registration.showNotification('TRECK', { body, icon: 'icon.png' }))));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((w) => (w[0] ? w[0].focus() : clients.openWindow('/'))));
});
