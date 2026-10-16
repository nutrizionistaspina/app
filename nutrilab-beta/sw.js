// NutriLab beta (Dott. Federico Spina): copia locale dei file dell'app, per aprirla anche senza rete. Nessun dato dei pazienti passa da qui.
const C='nlbeta-v2';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon.svg']).catch(()=>{}))); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r=>{ const k=r.clone(); if(r.ok) caches.open(C).then(c=>c.put(e.request,k)); return r; }).catch(()=>caches.match(e.request))); });
