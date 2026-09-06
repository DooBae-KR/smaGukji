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
      // 무음모드/방해금지는 OS가 결정해서 웹 알림이 뚫을 수 없다. 여기서 할 수 있는 건
      // 소리를 끄지 않고(silent:false), 진동을 주고(안드로이드), 사람이 직접 닫기 전까지
      // 계속 떠 있게(requireInteraction) 해서 최대한 알람처럼 느껴지게 하는 것까지다.
      silent: false,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 300],
      tag: 'boss-timer-alert',
      renotify: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/boss-timer.html'))
})
