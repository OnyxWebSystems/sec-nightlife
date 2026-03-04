import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { ErrorBoundary } from '@/lib/ErrorBoundary'
import '@/index.css'

window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
