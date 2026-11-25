// Replaced with a build-specific asset list by Vite at release time.
const BUILD = '9c25c01414907992'
const CACHE = `wildpass-shell-${BUILD}`
const BASE = new URL('./', self.location).pathname
const ASSETS = ["index.html","manifest.json","icon-192.png","icon-512.png","apple-touch-icon.png","favicon-32x32.png","favicon.ico","assets/browser-BzBbrBKd.js","assets/docx-preview-CmFQ80ZC.js","assets/index-B9y8rQzJ.css","assets/index-Djy8bdNL.js","assets/report-DVWwMKtM.js"]
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => BASE + asset))))
})
self.addEventListener('message', event => { if(event.data?.type === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    for(const name of await caches.keys()) if((name.startsWith('wildpass-shell-') || name.startsWith('eia-')) && name!==CACHE) await caches.delete(name)
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if(event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  if(event.request.mode === 'navigate') {
    event.respondWith((async()=>{
      try { const response=await fetch(event.request); if(response.ok)return response } catch { /* use complete cached build below */ }
      return (await caches.open(CACHE)).match(BASE+'index.html')
    })())
    return
  }
  if(!ASSETS.some(asset=>url.pathname===BASE+asset)) return
  // Public build assets are invariant. Vite/CDN Vary: Origin headers otherwise
  // make a module request miss entries fetched by cache.addAll during install.
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href,{ignoreVary:true,ignoreSearch:true})) || fetch(event.request)))
})
