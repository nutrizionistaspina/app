/* ============================================================ REGISTRATORE DELLA VISITA (NutriLab Pro)
   - Registra solo quando premi REC e solo dopo aver confermato il consenso del paziente.
   - L'audio resta nel telefono/tablet: viene tagliato in pezzi di circa 30 secondi, trascritto sul dispositivo (Whisper) e scartato.
   - Il testo va a NutriLab cifrato con la chiave dei tuoi dispositivi: il server conserva solo un blocco illeggibile finché
     NutriLab non lo prende, poi lo cancella. Nessun file audio viene salvato o inviato. */
'use strict';
const SR16 = 16000;
const RC = { w: null, ready: '', loading: false, prog: {}, err: '', stream: null, ctx: null, proc: null, src: null, buf: [], n: 0, pos: 0, wake: null, tick: null, sending: false };
const recFmt = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
const recHall = /sottotitoli (creati|a cura|e revisione)|amara\.org|grazie per (la visione|l'ascolto|aver guardato)|iscriviti al canale/i;
/* ---- bozza cifrata sul dispositivo (se la pagina si ricarica durante la visita) */
async function recKey(use) { const k = savedK(); if (!k) throw new Error('nokey'); return crypto.subtle.importKey('raw', b64d(k), 'AES-GCM', false, [use]); }
async function recSeal(obj) { const raw = new TextEncoder().encode(JSON.stringify(obj)), iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await recKey('encrypt'), raw)), o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64e(o); }
async function recOpenSeal(s) { const u = b64d(s); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await recKey('decrypt'), u.slice(12)))); }
async function recSaveDraft() { const r = A.rec; if (!r || !r.lines.length) return; try { LS.set('nlpro_txd', await recSeal({ pid: r.pid, aid: r.aid, n: r.n, lines: r.lines, el: r.el, text: r.text || '' })); } catch (e) { /* senza chiave non si salva */ } }
async function recDraft() { const s = LS.get('nlpro_txd'); if (!s) return null; try { return await recOpenSeal(s); } catch (e) { return null; } }
/* ---- modello */
function recWorker() { if (RC.w) return RC.w; RC.w = new Worker('rec-worker.js', { type: 'module' });
  RC.w.onmessage = (e) => { const d = e.data || {};
    if (d.t === 'prog') { const p = d.p || {}; if (p.file && p.total) RC.prog[p.file] = [p.loaded || 0, p.total]; if (p.status === 'done' && p.file && RC.prog[p.file]) RC.prog[p.file][0] = RC.prog[p.file][1]; recPaint(); return; }
    if (d.t === 'ready') { RC.ready = d.device; RC.loading = false; RC.err = ''; recPaint(true); recNext(); return; }
    if (d.t === 'err') { RC.loading = false; RC.err = 'Il modello non si è caricato (' + d.m + '). Controlla la connessione e riprova.'; const r = A.rec; if (r && r.st === 'stopping') { r.st = 'done'; r.text = recJoin(); r.msg = 'Trascrizione incompleta: il modello non è disponibile.'; recWake(false); } recPaint(true); return; }
    if (d.t === 'seg') { const r = A.rec; if (!r) return; const s = r.q.find((x) => x.i === d.i); if (s) { s.done = true; s.text = (d.text || '').replace(/\s+/g, ' ').trim(); if (recHall.test(s.text)) s.text = ''; if (d.err) s.err = d.err; s.audio = null; if (d.ms) r.ms = (r.ms || 0) + d.ms; }
      r.busy = false; recRebuild(); recSaveDraft(); recPaint(); recNext(); } };
  RC.w.onerror = (e) => { RC.loading = false; RC.err = 'Il motore di trascrizione non è partito su questo browser (' + (e.message || 'errore') + ').'; recPaint(true); };
  return RC.w; }
function recLoad() { if (RC.ready || RC.loading) return; RC.loading = true; RC.err = ''; RC.prog = {}; recWorker().postMessage({ t: 'load', size: A.rec?.model || 'base' }); recPaint(true); }
const recPct = () => { const v = Object.values(RC.prog); const t = v.reduce((s, x) => s + x[1], 0), l = v.reduce((s, x) => s + x[0], 0); return t ? Math.round(l / t * 100) : 0; };
/* ---- coda dei pezzi */
function recNext() { const r = A.rec; if (!r || r.busy || !RC.ready) return; const s = r.q.find((x) => !x.done && !x.sent); if (!s) { if (r.st === 'stopping') { r.st = 'done'; r.text = recJoin(); recSaveDraft(); recWake(false); render(); } return; }
  s.sent = true; r.busy = true; const a = s.audio; RC.w.postMessage({ t: 'seg', i: s.i, audio: a }, [a.buffer]); }
const recJoin = () => (A.rec?.q || []).filter((s) => s.done && s.text).map((s) => `[${recFmt(s.t0)}] ${s.text}`).join('\n');
function recRebuild() { const r = A.rec; r.lines = r.q.filter((s) => s.done && s.text).map((s) => [s.t0, s.text]); }
/* ---- microfono e taglio in pezzi (circa 30 s, tagliati in una pausa) */
function recPush(f32) { RC.buf.push(f32); RC.n += f32.length; }
function recTake(n) { const out = new Float32Array(n); let o = 0; while (o < n && RC.buf.length) { const b = RC.buf[0], k = Math.min(b.length, n - o); out.set(b.subarray(0, k), o); o += k; if (k === b.length) RC.buf.shift(); else RC.buf[0] = b.subarray(k); } RC.n -= n; return out; }
function recPeek() { const out = new Float32Array(RC.n); let o = 0; for (const b of RC.buf) { out.set(b, o); o += b.length; } return out; }
function recCut(force) { const r = A.rec; if (!r) return; const MIN = 22 * SR16, MAX = 32 * SR16;
  while (RC.n >= MAX || (force && RC.n > 0) || RC.n >= MIN) {
    let n = RC.n;
    if (!force || RC.n > MAX) { const all = recPeek(), F = 1600, lo = MIN, hi = Math.min(all.length, MAX); let best = -1, bv = 1e9;
      for (let i = lo; i + F <= hi; i += F) { let s = 0; for (let j = i; j < i + F; j++) s += all[j] * all[j]; const v = s / F; if (v < bv) { bv = v; best = i + F / 2; } }
      if (RC.n < MAX && bv > 2e-5) return; /* nessuna pausa ancora: aspetto */
      n = best > 0 ? Math.round(best) : Math.min(RC.n, MAX); }
    const audio = recTake(n); let e = 0; for (let j = 0; j < audio.length; j += 4) e += audio[j] * audio[j]; const rms = Math.sqrt(e / (audio.length / 4));
    const t0 = r.pos / SR16; r.pos += audio.length;
    if (audio.length > SR16 * 0.6 && rms > 0.004) r.q.push({ i: r.q.length, t0, audio });
    if (force && RC.n <= 0) break; }
  recNext(); }
async function recStart() { const r = A.rec; if (!r.cons) return toast('Prima conferma il consenso del paziente.');
  try { RC.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { r.msg = 'Il microfono non è stato concesso: permettilo per questo sito nelle impostazioni del browser.'; return render(); }
  const AC = window.AudioContext || window.webkitAudioContext; RC.ctx = new AC(); await RC.ctx.resume?.();
  RC.src = RC.ctx.createMediaStreamSource(RC.stream); RC.proc = RC.ctx.createScriptProcessor(4096, 1, 1); const ratio = RC.ctx.sampleRate / SR16; let frac = 0;
  RC.proc.onaudioprocess = (ev) => { if (!A.rec || A.rec.st !== 'rec') return; const x = ev.inputBuffer.getChannelData(0), outN = Math.max(0, Math.ceil((x.length - frac) / ratio)), out = new Float32Array(Math.max(0, outN));
    for (let i = 0; i < outN; i++) { const p = frac + i * ratio, k = Math.floor(p), t = p - k; out[i] = x[k] * (1 - t) + (x[k + 1] ?? x[k]) * t; }
    frac = frac + outN * ratio - x.length; recPush(out); if (RC.n - (RC.lastN || 0) >= SR16 || RC.n < (RC.lastN || 0)) { RC.lastN = RC.n; recCut(false); } };
  RC.src.connect(RC.proc); RC.proc.connect(RC.ctx.destination);
  RC.stream.getAudioTracks()[0].onended = () => { if (A.rec?.st === 'rec' || A.rec?.st === 'pause') { A.rec.msg = 'Il microfono si è fermato (schermo bloccato o app in secondo piano): ho tenuto quello che era già registrato.'; recStop(); } };
  r.st = 'rec'; r.started = Date.now() - r.el * 1000; recWake(true); RC.tick = setInterval(() => { if (A.rec?.st === 'rec') { A.rec.el = (Date.now() - A.rec.started) / 1000; recPaint(); } }, 1000); render(); }
function recPause() { const r = A.rec; if (r.st === 'rec') { r.st = 'pause'; r.el = (Date.now() - r.started) / 1000; } else if (r.st === 'pause') { r.st = 'rec'; r.started = Date.now() - r.el * 1000; } render(); }
function recHw(off) { try { RC.proc && (RC.proc.onaudioprocess = null, RC.proc.disconnect()); RC.src?.disconnect(); RC.stream?.getTracks().forEach((t) => t.stop()); RC.ctx?.close(); } catch (e) { /* già chiuso */ } RC.proc = RC.src = RC.stream = RC.ctx = null; clearInterval(RC.tick); if (off) { RC.buf = []; RC.n = 0; RC.lastN = 0; } }
function recStop() { const r = A.rec; if (!r || (r.st !== 'rec' && r.st !== 'pause')) return; if (r.st === 'rec') r.el = (Date.now() - r.started) / 1000; recCut(true); recHw(true); r.st = 'stopping'; render(); recNext(); }
async function recWake(on) { try { if (on && 'wakeLock' in navigator) { RC.wake = await navigator.wakeLock.request('screen'); } else if (!on && RC.wake) { await RC.wake.release(); RC.wake = null; } } catch (e) { /* non supportato */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && A.rec?.st === 'rec') recWake(true); });
window.addEventListener('beforeunload', (e) => { if (A.rec && ['rec', 'pause', 'stopping'].includes(A.rec.st)) { e.preventDefault(); e.returnValue = ''; } });
/* ---- invio a NutriLab (cifrato) */
async function recSend() { const r = A.rec, text = String(r.text || '').trim(); if (!text) return toast('La trascrizione è vuota.'); if (RC.sending) return; RC.sending = true; render();
  try { let raw = new TextEncoder().encode(JSON.stringify({ v: 1, pid: r.pid, aid: r.aid, at: new Date().toISOString(), dur: Math.round(r.el), model: r.model, text })), z = 0;
    try { raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); z = 1; } catch (e) { /* senza compressione */ }
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await recKey('encrypt'), raw)), o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12);
    await call('tx', { blob: JSON.stringify({ v: 1, z, d: b64e(o) }) });
    LS.del('nlpro_txd'); r.st = 'sent'; toast('Trascrizione mandata a NutriLab.'); }
  catch (e) { toast(e.message === 'action' ? 'Il server non è ancora pronto per ricevere le trascrizioni.' : e.message === 'too_many' ? 'Troppe trascrizioni oggi.' : e.message === 'nokey' ? 'Sblocca l\'app con la password e riprova.' : 'Invio non riuscito: la trascrizione resta qui, riprova.'); }
  RC.sending = false; render(); }
/* ---- schermata */
function recOpen(pid, aid) { const p = pt(pid); if (!p) return toast('Questo paziente non ha ancora una scheda in NutriLab.');
  A.rec = { pid, aid: aid || '', n: p.n, cons: false, st: 'idle', q: [], lines: [], pos: 0, el: 0, busy: false, msg: '', model: LS.get('nlpro_recm') || 'base', text: '' }; render(); }
async function recResume() { const d = await recDraft(); if (!d) return toast('Nessuna bozza.'); A.rec = { pid: d.pid, aid: d.aid, n: d.n, cons: true, st: 'done', q: [], lines: d.lines || [], pos: 0, el: d.el || 0, busy: false, msg: 'Bozza ripresa: controlla e manda a NutriLab.', model: LS.get('nlpro_recm') || 'base', text: d.text || (d.lines || []).map(([t, s]) => `[${recFmt(t)}] ${s}`).join('\n') }; render(); }
function recClose(force) { const r = A.rec; if (r && ['rec', 'pause', 'stopping'].includes(r.st) && !force) return toast('Prima ferma la registrazione.'); recHw(true); recWake(false); A.rec = null; render(); }
function recView() { const r = A.rec, live = r.st === 'rec' || r.st === 'pause', pend = r.q.filter((s) => !s.done).length, rt = r.el && r.ms ? (r.ms / 1000) / Math.max(1, r.q.filter((s) => s.done).length * 30) : 0;
  const model = RC.ready ? `<span class="chip ok">Trascrizione pronta · ${RC.ready === 'webgpu' ? 'scheda grafica' : 'processore'}</span>` : RC.loading ? `<span class="chip warn">Preparo il modello… ${recPct()}%</span>` : '';
  const head = `<button class="back" data-r="close">‹ Indietro</button><div class="hero"><span class="chip rose">Registra la visita</span><h2>${esc(r.n)}</h2><p>L'audio resta su questo dispositivo e viene cancellato dopo la trascrizione.</p></div>`;
  if (r.st === 'idle') return head + `<div class="card"><h2><span class="lbl">Prima di iniziare</span></h2>
    <label class="kv" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-r="cons"${r.cons ? ' checked' : ''} style="margin-top:4px"> <span>Il paziente ha dato il consenso alla registrazione e alla trascrizione della visita.</span></label>
    <p class="kv"><b>Precisione</b></p><div class="seg"><button data-r="model" data-v="base" aria-pressed="${r.model === 'base'}">Veloce</button><button data-r="model" data-v="small" aria-pressed="${r.model === 'small'}">Più precisa</button></div>
    <p class="note">La prima volta il modello si scarica (Veloce circa 100 MB, Più precisa circa 300 MB) e poi resta sul dispositivo. Meglio farlo con il Wi-Fi, prima della visita.</p>
    <div class="acts">${RC.ready ? '' : `<button class="btn" data-r="load"${RC.loading ? ' disabled' : ''}>${RC.loading ? 'Preparo… ' + recPct() + '%' : 'Prepara la trascrizione'}</button>`}<button class="btn rose" data-r="start"${r.cons ? '' : ' disabled'}>● REC</button></div>
    ${model}${RC.err ? `<p class="err">${esc(RC.err)}</p>` : ''}${r.msg ? `<p class="err">${esc(r.msg)}</p>` : ''}
    <p class="note">Tieni lo schermo acceso e l'app aperta durante la visita: se il dispositivo si blocca, il microfono si ferma.</p></div>`;
  if (live || r.st === 'stopping') return head + `<div class="card" style="text-align:center"><div id="rc-t" style="font:400 44px/1 Georgia,serif;margin:8px 0">${recFmt(r.el)}</div>
    <p class="small muted" id="rc-s">${r.st === 'pause' ? 'In pausa' : r.st === 'stopping' ? 'Finisco di trascrivere…' : '● Sto registrando'}</p>
    <div class="acts" style="justify-content:center">${live ? `<button class="btn" data-r="pause">${r.st === 'pause' ? 'Riprendi' : 'Pausa'}</button><button class="btn primary" data-r="stop">■ Stop</button>` : ''}</div>
    <p class="small muted" id="rc-q">${RC.ready ? (pend ? `${pend} ${pend === 1 ? 'pezzo' : 'pezzi'} da trascrivere` : 'Trascrizione al passo') : RC.loading ? `Preparo il modello… ${recPct()}% (registro intanto)` : 'Il modello non è pronto: registro intanto, trascrivo dopo.'}</p>${!RC.ready && !RC.loading ? '<button class="btn" data-r="load">Prepara la trascrizione</button>' : ''}${rt > 1.1 ? '<p class="note">Questo dispositivo trascrive più lentamente del parlato: a fine visita servirà qualche minuto in più.</p>' : ''}</div>
    <div class="card"><h2><span class="lbl">Trascrizione</span></h2><div class="out" id="rc-x" style="max-height:40dvh;overflow:auto">${esc(recJoin()) || '<span class="muted">Il testo compare qui man mano.</span>'}</div></div>`;
  return head + `<div class="card"><h2><span class="lbl">${r.st === 'sent' ? 'Mandata a NutriLab' : 'Controlla e manda'}</span></h2>
    <p class="note">Durata ${recFmt(r.el)}. Puoi correggere il testo prima di mandarlo. In NutriLab lo trovi nella cartella del paziente, passo «Seduta», pronto per «Compila la cartella».</p>
    <textarea data-r="text" rows="14">${esc(r.text)}</textarea>
    <div class="acts">${r.st === 'sent' ? '<button class="btn primary" data-r="close">Fatto</button>' : `<button class="btn rose" data-r="send"${RC.sending ? ' disabled' : ''}>${RC.sending ? 'Invio…' : 'Manda a NutriLab'}</button><button class="btn" data-r="copy">Copia</button><button class="btn" data-r="del">Cancella</button>`}</div>${r.msg ? `<p class="note">${esc(r.msg)}</p>` : ''}</div>`; }
/* aggiornamenti leggeri durante la registrazione, senza ridisegnare tutto */
function recPaint(full) { if (!A.rec) return; const r = A.rec; if (full || r.st === 'idle') { const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const t = document.getElementById('rc-t'); if (t) t.textContent = recFmt(r.el);
  const q = document.getElementById('rc-q'), pend = r.q.filter((s) => !s.done).length; if (q) q.textContent = RC.ready ? (pend ? `${pend} ${pend === 1 ? 'pezzo' : 'pezzi'} da trascrivere` : 'Trascrizione al passo') : RC.loading ? `Preparo il modello… ${recPct()}% (registro intanto)` : 'Il modello non è pronto: registro intanto, trascrivo dopo.';
  const x = document.getElementById('rc-x'); if (x) { const txt = recJoin(); if (txt && x.dataset.l !== String(txt.length)) { x.dataset.l = txt.length; x.textContent = txt; x.scrollTop = x.scrollHeight; } } }
function recCard(p, a) { if (!p) return ''; return `<div class="card"><h2><span class="lbl">Visita</span></h2><div class="acts" style="margin:4px 0"><button class="btn rose" data-r="open" data-id="${esc(p.id)}" data-ap="${esc(a?.id || '')}">● Registra la visita</button></div><p class="note">Con il consenso del paziente. Trascrizione sul dispositivo; in NutriLab arriva solo il testo, cifrato.</p></div>`; }
function recBanner() { if (A.rec || !LS.get('nlpro_txd')) return ''; return '<div class="card small"><b>C\'è una trascrizione non ancora mandata.</b> <button class="btn" data-r="resume">Apri</button></div>'; }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT') return; const k = b.dataset.r;
  if (k === 'open') return recOpen(b.dataset.id, b.dataset.ap); if (k === 'resume') return recResume(); if (k === 'close') return recClose();
  if (k === 'model' && A.rec?.st === 'idle') { if (RC.ready && b.dataset.v !== A.rec.model) { RC.w?.terminate(); RC.w = null; RC.ready = ''; } A.rec.model = b.dataset.v; LS.set('nlpro_recm', b.dataset.v); return render(); }
  if (k === 'load') return recLoad(); if (k === 'start') { recLoad(); return recStart(); } if (k === 'pause') return recPause(); if (k === 'stop') return recStop();
  if (k === 'send') return recSend();
  if (k === 'copy') { navigator.clipboard?.writeText(A.rec.text || '').then(() => toast('Copiata.'), () => toast('Copia non riuscita.')); return; }
  if (k === 'del') { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Confermi? Si cancella tutto'; return; } LS.del('nlpro_txd'); return recClose(true); } });
document.addEventListener('change', (e) => { const t = e.target; if (t.dataset?.r === 'cons' && A.rec) { A.rec.cons = t.checked; render(); } });
document.addEventListener('input', (e) => { const t = e.target; if (t.dataset?.r === 'text' && A.rec) { A.rec.text = t.value; clearTimeout(RC.dt); RC.dt = setTimeout(recSaveDraft, 800); } });
