/**
 * pwa.js — Register the service worker and handle the
 * "Add to Home Screen" install prompt.
 *
 * Usage in main.jsx (add BEFORE ReactDOM.createRoot):
 *   import { registerSW, setupInstallPrompt } from './lib/pwa'
 *   registerSW()
 *   setupInstallPrompt()  // optional — stores prompt for later use
 */

// ── Service Worker ────────────────────────────────────────
export function registerSW() {
  if (!('serviceWorker' in navigator)) return

  // Base path Vite built with ("/" locally, "/EIA_toolkitt/" on GitHub Pages)
  const base = import.meta.env.BASE_URL || '/'

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(base + 'sw.js', {
        scope: base,
      })

      // Check for updates every 60 minutes
      setInterval(() => reg.update(), 60 * 60 * 1000)

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — show update banner
            window.dispatchEvent(new CustomEvent('sw-update-available'))
          }
        })
      })

      console.log('[PWA] Service worker registered:', reg.scope)
    } catch (err) {
      console.error('[PWA] Service worker registration failed:', err)
    }
  })
}

// ── Install Prompt ────────────────────────────────────────
// Stores the browser's native install prompt so you can
// trigger it from a button in the UI (e.g. a banner saying
// "ホーム画面に追加する").
let deferredPrompt = null

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    window.dispatchEvent(new CustomEvent('pwa-installable'))
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new CustomEvent('pwa-installed'))
    console.log('[PWA] App installed to home screen')
  })
}

/**
 * Call this when the user clicks your "ホーム画面に追加" button.
 * Returns true if the prompt was shown.
 */
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  console.log('[PWA] Install outcome:', outcome)
  deferredPrompt = null
  return outcome === 'accepted'
}

export function isInstallable() {
  return deferredPrompt !== null
}

// ── Online/offline detection ──────────────────────────────
export function useOnlineStatus(setOnline) {
  window.addEventListener('online',  () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

// ── iOS Safari "Add to Home Screen" detection ─────────────
// Safari doesn't fire beforeinstallprompt — detect manually.
export function isIOSSafari() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua)
}

export function isRunningAsPWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}
