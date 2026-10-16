// NutriLab beta: funziona anche senza rete dopo la prima apertura. Prima la rete, poi la copia salvata.
const C='nlbeta-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon.svg']).catch(()=>{}))); });
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).then(r=>{ const k=r.clone(); if(r.ok&&(e.request.url.startsWith(self.location.origin)||/cdnjs|jsdelivr/.test(e.request.url))) caches.open(C).then(c=>c.put(e.request,k)); return r; }).catch(()=>caches.match(e.request))); });
