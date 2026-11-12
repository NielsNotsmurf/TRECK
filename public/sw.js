// Fase 6: lege push van de Worker -> vaste herinnering; tik opent de app.
self.addEventListener('push', (e) => e.waitUntil(self.registration.showNotification('TRECK', { body: 'Al ingevoerd wat je gegeten hebt?', icon: 'icon.png' })));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((w) => (w[0] ? w[0].focus() : clients.openWindow('/'))));
});
