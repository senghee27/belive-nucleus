/* eslint-disable no-restricted-globals */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nucleus', {
      body: data.body || '',
      icon: '/icons/nucleus-192.png',
      badge: '/icons/nucleus-badge-72.png',
      data: { url: data.url || '/m' },
      tag: data.tag,
      renotify: true,
      requireInteraction: data.priority === 'p1',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.openWindow(event.notification.data.url || '/m')
  )
})
