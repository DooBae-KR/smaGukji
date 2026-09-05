// 보스 타이머 웹 푸시용 서비스워커. 백그라운드에서 push 이벤트를 받아 알림을 띄운다.
self.addEventListener('push', (event) => {
  let data = { title: '⚡ 보스 타이머', body: '보스 등장이 임박했습니다.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // 텍스트만 온 경우
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/boss-timer.html'))
})
