import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BossTimerPage } from './BossTimerPage'
import '../App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BossTimerPage />
  </StrictMode>,
)
