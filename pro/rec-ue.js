/* ============================================================ REGISTRATORE · TRASCRIZIONE SU SERVER NELL'UE (NutriLab Pro)
   Richiesta del Dottore (26/10/2026): su iPhone il modello Whisper nel telefono consuma troppa memoria. In alternativa l'audio
   viene registrato già compresso dal telefono (AAC su iPhone e iPad, Opus o AAC su Android e computer, 24 kbit/s chiesti al browser:
   2 minuti ≈ 0,4-1 MB), mandato a pezzi di 2 minuti su HTTPS alla funzione nl-stt di NutriLab (Supabase, UE) che lo passa a Whisper
   large v3 di OVHcloud (AI Endpoints, Francia) e restituisce solo il testo. L'audio non viene salvato: il pezzo resta in memoria
   nel telefono finché il testo non torna, poi si cancella. Il testo segue la strada di sempre (cifrato verso NutriLab).
   Si accende in «Registra la visita» → «Dove trascrivere» con il codice del server; senza codice resta tutto come prima.
   Prima dell'uso con pazienti veri: consenso alla trascrizione (Modulo A, già previsto), fornitore nei documenti privacy,
   condizioni di OVHcloud AI Endpoints (conservazione dei dati) verificate. */
'use strict';
const UE = { mr: null, segAt: 0, busy: false };
const UE_SEG = 120, UE_BPS = 24000, UE_URL = 'https://yqmdpduabrkvbsxagwdj.supabase.co/functions/v1/nl-stt';
const ueCfg = () => { try { return JSON.parse(LS.get('nlpro_stt') || '{}'); } catch (e) { return {}; } };
const ueSet = (c) => LS.set('nlpro_stt', JSON.stringify(c));
const ueOn = () => { const c = ueCfg(); return !!(c.on && c.tok && typeof MediaRecorder !== 'undefined'); };
function ueMime() { for (const m of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* non supportato */ } } return ''; }
const ueExt = (t) => (/mp4|aac|m4a/.test(t) ? '.m4a' : /ogg/.test(t) ? '.ogg' : '.webm');
/* ---- registrazione a pezzi già compressi (nessun modello e nessun audio grezzo in memoria) */
function ueRec() { const r = A.rec; if (!r || !RC.stream) return; const mime = ueMime(), parts = [], t0 = r.el;
  let mr; try { mr = new MediaRecorder(RC.stream, mime ? { mimeType: mime, audioBitsPerSecond: UE_BPS } : { audioBitsPerSecond: UE_BPS }); } catch (e) { r.msg = 'Questo browser non registra audio compresso: usa la trascrizione sul dispositivo.'; return render(); }
  mr.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  mr.onstop = () => { const blob = new Blob(parts, { type: mr.mimeType || mime || 'audio/webm' }); if (UE.mr === mr) UE.mr = null;
    if (A.rec && blob.size > 2000) A.rec.q.push({ i: A.rec.q.length, t0, blob, mime: blob.type });
    if (A.rec && (A.rec.st === 'rec' || A.rec.st === 'pause')) { ueRec(); if (A.rec.st === 'pause') try { UE.mr?.pause(); } catch (e) { /* niente */ } }
    ueNext(); };
  mr.start(1000); UE.mr = mr; UE.segAt = Date.now(); }
async function ueStart() { const r = A.rec; if (!r.cons) return toast('Prima conferma il consenso del paziente.');
  try { RC.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { r.msg = 'Il microfono non è stato concesso: permettilo per questo sito nelle impostazioni del browser.'; return render(); }
  const tr = RC.stream.getAudioTracks()[0];
  tr.onmute = () => { if (A.rec?.st === 'rec') { A.rec.warn = 'Il microfono è in pausa (telefonata, Siri o un\'altra app che usa l\'audio). Riprende da solo quando torna libero.'; render(); } };
  tr.onunmute = () => { if (A.rec) { A.rec.warn = ''; render(); } };
  tr.onended = () => { if (A.rec?.st === 'rec' || A.rec?.st === 'pause') { A.rec.msg = 'Il microfono si è fermato (schermo bloccato o app in secondo piano): ho tenuto quello che era già registrato.'; recStop(); } };
  r.st = 'rec'; r.started = Date.now() - r.el * 1000; ueRec(); recWake(true); recOn(true);
  RC.tick = setInterval(() => { const a = A.rec; if (a?.st !== 'rec') return; a.el = (Date.now() - a.started) / 1000; recPaint(); if (Math.round(a.el) % 15 === 0) recOn(true);
    if (UE.mr && UE.mr.state === 'recording' && Date.now() - UE.segAt > UE_SEG * 1000) { UE.segAt = Date.now(); try { UE.mr.stop(); } catch (e) { /* già fermo */ } } }, 1000);
  render(); }
/* ---- invio dei pezzi alla funzione nl-stt e testo di ritorno */
async function ueSend(s) { const c = ueCfg(), fd = new FormData(); fd.append('file', s.blob, 'parte-' + (s.i + 1) + ueExt(s.mime || '')); fd.append('language', 'it');
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 120000);
  try { const r = await fetch(c.url || UE_URL, { method: 'POST', headers: { 'x-nl-stt': c.tok }, body: fd, signal: ctl.signal }); const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.code || ('http ' + r.status)); e.msg = j.message; throw e; } return String(j.text || ''); } finally { clearTimeout(to); } }
function ueNext() { const r = A.rec; if (!r || UE.busy) return; const s = r.q.find((x) => !x.done && !x.sent && x.blob);
  if (!s) { if (r.st === 'stopping' && !UE.mr && !r.q.some((x) => !x.done)) { r.st = 'done'; r.text = recJoin(); recSaveDraft(); recWake(false); render(); } return; }
  s.sent = true; UE.busy = true; r.busy = true;
  ueSend(s).then((t) => { s.text = t.replace(/\s+/g, ' ').trim(); if (recHall.test(s.text)) s.text = ''; s.done = true; s.blob = null; s.keep = null; })
    .catch((e) => { s.sent = false; s.tries = (s.tries || 0) + 1; s.err = e.message;
      if (e.message === 'not_granted' || e.message === 'not_configured' || s.tries >= 3) { s.done = true; s.keep = s.blob; s.blob = null;
        s.text = `— parte non trascritta (${recFmt(s.t0)}): ${e.message === 'not_granted' ? 'codice del server non valido' : e.message === 'not_configured' ? 'server non ancora attivato' : 'server non raggiungibile'}; l'audio di questa parte resta nel telefono finché non chiudi, puoi riprovare —`; } })
    .finally(() => { UE.busy = false; r.busy = false; recRebuild(); recSaveDraft(); recPaint(); setTimeout(ueNext, s.done ? 0 : 3000 * (s.tries || 1)); }); }
function ueRetry() { const r = A.rec; if (!r) return; let n = 0; for (const s of r.q) if (s.keep) { s.blob = s.keep; s.keep = null; s.done = false; s.sent = false; s.tries = 0; s.text = ''; n++; }
  if (!n) return; if (r.st === 'done') r.st = 'stopping'; recRebuild(); render(); ueNext(); }
/* ---- agganci alle funzioni del registratore: con il server UE acceso cambiano solo registrazione e trascrizione */
{ const _l = recLoad; recLoad = function () { if (ueOn()) { RC.ready = 'ue'; return; } if (RC.ready === 'ue') RC.ready = ''; return _l.apply(this, arguments); }; }
{ const _s = recStart; recStart = function () { if (ueOn()) { RC.ready = 'ue'; return ueStart(); } return _s.apply(this, arguments); }; }
{ const _n = recNext; recNext = function () { if (RC.ready === 'ue') return ueNext(); return _n.apply(this, arguments); }; }
{ const _p = recPause; recPause = function () { const r = A.rec; const was = r?.st; _p.apply(this, arguments); if (RC.ready === 'ue' && UE.mr) { try { if (was === 'rec') UE.mr.pause(); else if (was === 'pause') { UE.mr.resume(); UE.segAt = Date.now() - (UE.segAt ? 0 : 0); } } catch (e) { /* niente */ } } }; }
{ const _st = recStop; recStop = function () { const r = A.rec; if (RC.ready !== 'ue') return _st.apply(this, arguments); if (!r || (r.st !== 'rec' && r.st !== 'pause')) return;
    if (r.st === 'rec') r.el = (Date.now() - r.started) / 1000; r.st = 'stopping'; try { if (UE.mr && UE.mr.state !== 'inactive') UE.mr.stop(); } catch (e) { /* già fermo */ }
    setTimeout(() => { recHw(true); }, 400); recOn(false); render(); ueNext(); }; }
{ const _hw = recHw; recHw = function (off) { try { if (UE.mr && UE.mr.state !== 'inactive' && A.rec?.st !== 'stopping') UE.mr.stop(); } catch (e) { /* niente */ } return _hw.apply(this, arguments); }; }
{ const _o = recOpen; recOpen = async function () { const r = await _o.apply(this, arguments); RC.ready = ueOn() ? 'ue' : (RC.ready === 'ue' ? '' : RC.ready); render(); return r; }; }
{ const _v = recView; recView = function () { const r = A.rec, on = ueOn(); let h = _v.apply(this, arguments);
    if (on) h = h.replace('L\'audio resta su questo dispositivo e viene cancellato dopo la trascrizione.', 'L\'audio, già compresso, va su HTTPS al server di trascrizione nell\'UE (OVHcloud) e dal telefono si cancella appena torna il testo.')
      .replace(/Trascrizione pronta · (?:processore|scheda grafica)/, 'Trascrizione sul server nell\'UE').replace(/<p class="note">Su iPhone e iPad uso la trascrizione leggera[\s\S]*?<\/p>/, '').replace(/<p class="kv"><b>Precisione<\/b><\/p><div class="seg">[\s\S]*?<\/div>\s*<p class="note">La prima volta il modello[\s\S]*?<\/p>/, '');
    if (r.st === 'idle') { const c = ueCfg(); const blk = `<div class="card"><h2><span class="lbl">Dove trascrivere</span></h2>
      <div class="seg"><button data-ue="dev" aria-pressed="${!on}">Sul dispositivo</button><button data-ue="eu" aria-pressed="${on}"${typeof MediaRecorder === 'undefined' ? ' disabled' : ''}>Server nell'UE</button></div>
      <p class="note">${on ? 'Più leggero per iPhone e iPad: niente modello da scaricare, audio compresso a pezzi di 2 minuti. Serve la connessione durante la visita (circa 10-30 MB l\'ora, secondo il telefono).' : 'Il modello Whisper gira nel telefono: nessun invio dell\'audio, ma su iPhone e iPad usa molta memoria.'}</p>
      ${true ? `<label class="kv" style="display:block">Codice del server <input type="password" data-ue="tok" value="${esc(c.tok || '')}" autocomplete="off" style="width:100%;margin-top:4px" placeholder="lo stesso inserito in Supabase come NL_STT_TOKEN"></label>
      <div class="acts"><button class="btn" data-ue="gen">Genera un codice nuovo</button></div>${UE.newTok ? `<p class="note">Codice generato e salvato su questo dispositivo. Copialo una volta in Supabase → progetto NutriLab → Edge Functions → Secrets come <b>NL_STT_TOKEN</b>: <code style="word-break:break-all">${esc(UE.newTok)}</code></p>` : ''}` : ''}</div>`;
      h = h.replace('<div class="card"><h2><span class="lbl">Prima di iniziare</span></h2>', blk + '<div class="card"><h2><span class="lbl">Prima di iniziare</span></h2>'); }
    if ((r.st === 'done' || r.st === 'stopping') && r.q.some((s) => s.keep)) h = h.replace('<div class="acts">', `<div class="acts"><button class="btn" data-ue="retry">Ritrascrivi le parti mancanti (${r.q.filter((s) => s.keep).length})</button>`);
    return h; }; }
{ const _c = recCard; recCard = function () { let h = _c.apply(this, arguments); if (ueOn()) h = h.replace('Trascrizione sul dispositivo; in NutriLab arriva solo il testo, cifrato.', 'Trascrizione sul server nell\'UE; in NutriLab arriva solo il testo, cifrato.'); return h; }; }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-ue]'); if (!b || b.tagName === 'INPUT') return; e.preventDefault(); const k = b.dataset.ue, c = ueCfg();
  if (k === 'dev') { c.on = false; ueSet(c); if (RC.ready === 'ue') RC.ready = ''; return render(); }
  if (k === 'eu') { if (!c.tok) { toast('Prima inserisci o genera il codice del server.'); } c.on = !!c.tok; ueSet(c); RC.ready = c.on ? 'ue' : RC.ready; return render(); }
  if (k === 'gen') { const u = crypto.getRandomValues(new Uint8Array(24)); const tok = Array.from(u, (x) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 56]).join(''); c.tok = tok; ueSet(c); UE.newTok = tok; return render(); }
  if (k === 'retry') return ueRetry(); }, true);
document.addEventListener('change', (e) => { const t = e.target; if (t.dataset?.ue === 'tok') { const c = ueCfg(); c.tok = t.value.trim(); if (!c.tok) c.on = false; ueSet(c); UE.newTok = ''; render(); } });
