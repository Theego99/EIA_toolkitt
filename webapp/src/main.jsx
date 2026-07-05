import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { registerSW, setupInstallPrompt } from './lib/pwa.js'

// Register service worker (enables offline + PWA install)
registerSW()
setupInstallPrompt()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
