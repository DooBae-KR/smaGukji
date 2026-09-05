import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BossTimerPage } from './BossTimerPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BossTimerPage />
  </StrictMode>,
)
