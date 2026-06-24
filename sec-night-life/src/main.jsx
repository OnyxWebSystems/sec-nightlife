import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { ErrorBoundary } from '@/lib/ErrorBoundary'
import { removeBootSplash } from '@/lib/removeBootSplash'
import {
  clearChunkReloadAttemptFlag,
  isStaleChunkLoadError,
  scheduleChunkReloadOnce,
} from '@/lib/chunkLoadRecovery'
import '@/index.css'
import { initNativeShell } from '@/lib/capacitorNative'
import { initPushNotifications } from '@/lib/pushNotifications'
import { startSessionKeepalive } from '@/lib/sessionKeepalive'

void import('@/lib/sentry').then(({ initSentry }) => initSentry())

window.addEventListener('load', () => {
  window.setTimeout(clearChunkReloadAttemptFlag, 2500)
})

window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error || e.message)
  const err = e.error || e.message
  if (isStaleChunkLoadError(err) && scheduleChunkReloadOnce()) {
    e.preventDefault?.()
  }
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
  if (isStaleChunkLoadError(e.reason) && scheduleChunkReloadOnce()) {
    e.preventDefault?.()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

requestAnimationFrame(() => {
  requestAnimationFrame(removeBootSplash)
})

void initNativeShell()
void initPushNotifications()
startSessionKeepalive()
