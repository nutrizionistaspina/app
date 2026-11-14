/* Service worker dell'app dei pazienti: tiene sul telefono la pagina, il manifest e le icone, così l'app si apre anche
   senza rete. Non tocca i dati: le chiamate all'archivio (Supabase) e le pagine dei pagamenti passano sempre dalla rete.
   La pagina si aggiorna dalla rete quando c'è (rete prima, copia salvata se manca). */
const V = 'nlp-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon.svg', 'fotobf.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nlp-') && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const ROOT = new URL('./', self.registration.scope).pathname;
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  const p = u.pathname; if (!p.startsWith(ROOT)) return;
  const rel = p.slice(ROOT.length);
  if (/^(paga\.html|sitemap[^/]*\.xml|pro\/|vendor\/|risorse\/)/.test(rel)) return; // sempre dalla rete
  if (r.mode === 'navigate') {
    if (rel !== '' && rel !== 'index.html') return;
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put('index.html', c)); } return res; })
      .catch(() => caches.match('index.html').then((m) => m || caches.match('./'))));
    return;
  }
  if (!CORE.some((c) => c !== './' && rel === c)) return;
  // stessa copia subito, aggiornata in sottofondo
  e.respondWith(caches.match(r).then((m) => { const f = fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); } return res; }).catch(() => m); return m || f; }));
});
