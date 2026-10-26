/* ============================================================ APP DEI PAZIENTI · STIMA DELLA MASSA GRASSA DALLA FOTO E ALIMENTAZIONE DAI TRACKER
   Richiesta del Dottore (26/10/2026). Compare solo se il Dottore la attiva per il paziente in NutriLab (pacchetto: hd.foto, hd.nut).
   - Stima della massa grassa: altezza e vita danno l'RFM (Woolcott e Bergman 2018, validata sulla DXA). La vita si misura con il metro
     (più affidabile) oppure si stima da due foto in piedi dentro una sagoma (di fronte e di lato): si toccano testa, talloni e i due
     bordi del giro vita all'altezza dell'ombelico; dalla scala data dall'altezza si ottengono larghezza e profondità e la vita come ellisse.
     È una stima indicativa, non una misura: le foto restano nel telefono e si cancellano appena fatto il calcolo; al Dottore vanno solo
     i due numeri, se il paziente sceglie di inviarli.
   - Alimentazione dai tracker: media giornaliera di energia, proteine, carboidrati, grassi, fibre e acqua letta dall'app che il paziente
     usa per registrare i pasti (anche tramite l'app Salute), insieme ai dati della settimana. */
'use strict';
const FB = { mode: 'metro', step: 'f', img: { f: null, s: null }, wh: { f: null, s: null }, pts: { f: [], s: [] }, cam: null, res: null, err: '', msg: '', busy: false, h: '', sx: '', w: '' };
const fbOn = () => !!(A.P?.hd?.foto);
const nutOn = () => !!(A.P?.hd?.nut);
const FB_TIP = { f: ['la cima della testa', 'i talloni, a terra', 'il fianco sinistro, all\'altezza dell\'ombelico', 'il fianco destro, alla stessa altezza'], s: ['la cima della testa', 'i talloni, a terra', 'la pancia, all\'altezza dell\'ombelico', 'la schiena, alla stessa altezza'] };
const fbNum = (x) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return isFinite(v) ? v : null; };
/* vita come ellisse dai due diametri (approssimazione di Ramanujan) */
function fbEllipse(a, b) { const A2 = a / 2, B2 = b / 2; return Math.PI * (3 * (A2 + B2) - Math.sqrt((3 * A2 + B2) * (A2 + 3 * B2))); }
/* RFM = 64 − 20 × altezza/vita + 12 × sesso (0 uomo, 1 donna) */
function fbRfm(hcm, wcm, sx) { if (!hcm || !wcm) return null; return 64 - 20 * hcm / wcm + (sx === 'F' ? 12 : 0); }
function fbScale(k) { const P = FB.pts[k], wh = FB.wh[k]; if (P.length < 4 || !wh) return null; const px = (p) => [p[0] * wh[0], p[1] * wh[1]];
  const [h0, h1, w0, w1] = P.map(px), hpx = Math.hypot(h1[0] - h0[0], h1[1] - h0[1]), wpx = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]); const hcm = fbNum(FB.h);
  if (!hcm || hpx < 50) return null; return wpx * hcm / hpx; }
function fbCalc() { FB.err = ''; const hcm = fbNum(FB.h), sx = FB.sx; if (!hcm || hcm < 120 || hcm > 220) { FB.err = 'Scrivi l\'altezza in centimetri.'; return; } if (sx !== 'F' && sx !== 'M') { FB.err = 'Scegli il sesso per il calcolo.'; return; }
  let w = null, how = FB.mode;
  if (FB.mode === 'metro') { w = fbNum(FB.w); if (!w || w < 50 || w > 180) { FB.err = 'Scrivi la circonferenza della vita in centimetri (50-180).'; return; } }
  else { const a = fbScale('f'), b = fbScale('s'); if (!a || !b) { FB.err = 'Servono le due foto con i 4 punti ciascuna.'; return; } w = fbEllipse(a, b);
    if (w < 50 || w > 180 || b > a * 1.4 || b < a * 0.35) { FB.err = 'I punti non sembrano giusti (vita fuori misura): rifai le foto o i punti.'; return; } }
  const r = fbRfm(hcm, w, sx); FB.res = { w: Math.round(w), bf: Math.round(Math.max(3, Math.min(75, r)) * 10) / 10, how, at: new Date().toISOString() };
  FB.img = { f: null, s: null }; FB.pts = { f: [], s: [] }; FB.wh = { f: null, s: null }; /* le foto si cancellano subito */ }
function fbCard() { if (!fbOn()) return ''; const r = FB.res, sxRadio = (v, l) => `<label class="check" style="display:inline-flex;margin-right:14px"><input type="radio" name="fbsx" data-fbsx="${v}"${FB.sx === v ? ' checked' : ''}> ${l}</label>`;
  const shot = (k, l) => { const n = FB.pts[k].length; return `<div class="fbshot"><b>${l}</b>${FB.img[k] ? `<canvas class="fbcv" data-fbcv="${k}" aria-label="Foto ${l}: tocca i punti"></canvas><p class="small">${n < 4 ? `Tocca ${FB_TIP[k][n]} (${n + 1} di 4).` : 'Punti a posto.'}</p><div class="row"><button class="btn sm" data-fb="undo" data-k="${k}"${n ? '' : ' disabled'}>Togli l'ultimo punto</button><button class="btn sm" data-fb="cam" data-k="${k}">Rifai la foto</button></div>` : `<div class="row"><button class="btn sm primary" data-fb="cam" data-k="${k}">Scatta la foto</button><label class="btn sm filebtn">Scegli una foto<input type="file" accept="image/*" data-fbfile="${k}" hidden></label></div>`}</div>`; };
  return `<details class="card fbcard"${FB.open ? ' open' : ''} data-fbdet><summary><b>Stima della massa grassa</b> <small class="muted">facoltativa</small></summary>
   <p class="small muted">Con altezza e circonferenza della vita si ottiene una stima della percentuale di grasso (RFM). È indicativa: non sostituisce la misura in studio.</p>
   <label class="hdf"><span>Altezza</span><span><input inputmode="decimal" data-fbh value="${esc(FB.h)}" placeholder="165"> <small>cm</small></span></label>
   <div style="margin:6px 0">${sxRadio('F', 'Donna')}${sxRadio('M', 'Uomo')}</div>
   <div class="seg" role="group" aria-label="Come misuri la vita"><button class="btn sm${FB.mode === 'metro' ? ' primary' : ''}" data-fb="mode" data-v="metro">Con il metro</button><button class="btn sm${FB.mode === 'foto' ? ' primary' : ''}" data-fb="mode" data-v="foto">Dalla foto</button></div>
   ${FB.mode === 'metro' ? `<p class="small muted">In piedi, a fine espirazione, metro orizzontale appena sopra le ossa del bacino (all'altezza dell'ombelico se non le senti).</p><label class="hdf"><span>Vita</span><span><input inputmode="decimal" data-fbw value="${esc(FB.w)}" placeholder="85"> <small>cm</small></span></label>`
    : `<p class="small muted">Vestiti aderenti, in piedi, piedi uniti, braccia leggermente staccate dal corpo, telefono all'altezza della pancia a 2-3 metri (o chiedi a qualcuno). Le foto restano solo qui e si cancellano dopo il calcolo.</p>${shot('f', 'Di fronte')}${shot('s', 'Di lato')}`}
   ${FB.err ? `<div class="alert" role="alert">${esc(FB.err)}</div>` : ''}
   <div class="row"><button class="btn primary" data-fb="calc">Calcola</button></div>
   ${r ? `<div class="fbres"><div><small>Vita ${r.how === 'foto' ? 'stimata' : 'misurata'}</small><b>${r.w} cm</b></div><div><small>Massa grassa stimata</small><b>${String(r.bf).replace('.', ',')}%</b></div></div>
     <p class="small muted">${r.how === 'foto' ? 'Dalla foto l\'errore può essere di qualche centimetro sulla vita e di alcuni punti sulla percentuale.' : 'La formula ha un margine di alcuni punti percentuali anche con la vita misurata bene.'} Il Dottore la confronterà con le misure dello studio.</p>
     <div class="row"><button class="btn" data-fb="send"${FB.busy ? ' disabled' : ''}>${FB.busy ? 'Invio…' : 'Invia al Dottore'}</button></div>${FB.msg ? `<p class="small"><b>${esc(FB.msg)}</b></p>` : ''}` : ''}</details>`; }
/* ---- fotocamera con sagoma */
const FB_SIL = { f: '<svg viewBox="0 0 100 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3" opacity=".9"><circle cx="50" cy="18" r="12"/><path d="M38 34h24l8 10 6 46-6 2-6-38v34l4 60-3 64H55l-5-58-5 58h-9l-3-64 4-60V54l-6 38-6-2 6-46z"/><line x1="10" y1="96" x2="90" y2="96" stroke-dasharray="2 4"/></g></svg>',
  s: '<svg viewBox="0 0 100 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3" opacity=".9"><circle cx="50" cy="18" r="12"/><path d="M44 32h12l6 16 4 40-4 10 2 56-2 60h-10l-2-58-4-58-6-10 2-40z"/><line x1="10" y1="96" x2="90" y2="96" stroke-dasharray="2 4"/></g></svg>' };
async function fbCam(k) { FB.err = ''; let st = null;
  try { st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false }); }
  catch (e) { FB.err = 'Fotocamera non disponibile: usa «Scegli una foto».'; return render(); }
  const ov = document.createElement('div'); ov.className = 'fbcam'; ov.innerHTML = `<video playsinline muted autoplay></video><div class="fbsil">${FB_SIL[k]}</div><p class="fbcamt">${k === 'f' ? 'Di fronte' : 'Di lato'}: entra nella sagoma, testa e piedi dentro il riquadro</p><div class="fbcamb"><button class="btn" data-fbc="x">Annulla</button><button class="btn primary" data-fbc="t">Scatta tra 5 secondi</button><button class="btn" data-fbc="n">Scatta ora</button></div>`;
  document.body.appendChild(ov); const v = ov.querySelector('video'); v.srcObject = st; FB.cam = { st, ov, k, v };
  try { await v.play(); } catch (e) { /* parte al tocco */ } }
function fbCamClose() { const c = FB.cam; if (!c) return; c.st.getTracks().forEach((t) => t.stop()); c.ov.remove(); FB.cam = null; }
function fbShoot() { const c = FB.cam; if (!c) return; const v = c.v, cv = document.createElement('canvas'); cv.width = v.videoWidth || 720; cv.height = v.videoHeight || 1280; cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  fbSetImg(c.k, cv.toDataURL('image/jpeg', 0.85), cv.width, cv.height); fbCamClose(); render(); }
function fbSetImg(k, url, w, h) { FB.img[k] = url; FB.wh[k] = [w, h]; FB.pts[k] = []; FB.res = null; }
function fbDraw() { document.querySelectorAll('[data-fbcv]').forEach((cv) => { const k = cv.dataset.fbcv, src = FB.img[k]; if (!src) return; const im = new Image();
    im.onload = () => { const W = Math.min(cv.parentElement.clientWidth || 320, 520), H = Math.round(W * im.height / im.width); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.drawImage(im, 0, 0, W, H);
      FB.pts[k].forEach((p, i) => { g.fillStyle = i < 2 ? '#2f7d5b' : '#b8686a'; g.beginPath(); g.arc(p[0] * W, p[1] * H, 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); });
      const P = FB.pts[k]; if (P.length >= 2) { g.strokeStyle = 'rgba(47,125,91,.8)'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(P[0][0] * W, P[0][1] * H); g.lineTo(P[1][0] * W, P[1][1] * H); g.stroke(); }
      if (P.length >= 4) { g.strokeStyle = 'rgba(184,104,106,.9)'; g.setLineDash([]); g.beginPath(); g.moveTo(P[2][0] * W, P[2][1] * H); g.lineTo(P[3][0] * W, P[3][1] * H); g.stroke(); } };
    im.src = src; }); }
async function fbSend() { const r = FB.res; if (!r) return; if (A.P.demo) { FB.msg = 'Nell\'esempio i dati non partono.'; return render(); }
  FB.busy = true; FB.msg = ''; render();
  try { await rpc('nl_app_data_add', { p_id: SID(), p_tok: A.P.tok, p_kind: 'salute', p_payload: { from: addDays(0), to: addDays(0), src: r.how === 'foto' ? 'foto' : 'metro', wst: r.w, bfr: r.bf } }); FB.msg = 'Inviata al Dottore. Grazie!'; }
  catch (e) { FB.msg = /empty|invalid/.test(e.message) ? 'Il Dottore non ha ancora attivato la ricezione di questi dati: mostrala alla prossima visita.' : /too_many/.test(e.message) ? 'Hai già inviato molti dati oggi: riprova domani.' : 'Non riesco a collegarmi: riprova.'; }
  FB.busy = false; render(); }
/* ---- alimentazione dai tracker, dentro «La tua settimana» */
const NUT_F = [['kin', 'Energia assunta', 'kcal al giorno', '1800'], ['pro', 'Proteine', 'g al giorno', '80'], ['cho', 'Carboidrati', 'g al giorno', '200'], ['fat', 'Grassi', 'g al giorno', '60'], ['fib', 'Fibre', 'g al giorno', '25'], ['h2o', 'Acqua', 'litri al giorno', '1,5']];
function nutBlock() { const f = HD.f; return `<details class="nutblk"${NUT_F.some(([k]) => f[k]) ? ' open' : ''}><summary><b>Alimentazione registrata</b> <small class="muted">se usi un'app per i pasti (anche dall'app Salute)</small></summary><p class="small muted">Media al giorno della settimana, come la mostra la tua app. Lascia vuoto quello che non c'è.</p>
  ${NUT_F.map(([k, l, u, ph]) => `<label class="hdf"><span>${l}</span><span><input inputmode="decimal" data-hd="${k}" value="${esc(f[k] ?? '')}" placeholder="${ph}"> <small>${u}</small></span></label>`).join('')}</details>`; }
{ const _s = scrSalute; scrSalute = function () { let h = _s.apply(this, arguments);
    if (nutOn()) { const c = h.indexOf('<label class="check"><input type="checkbox" id="hdok">'), m = h.indexOf('<div class="row"><button class="btn primary" data-hdsend'), at = c >= 0 && (m < 0 || c < m) ? c : m; if (at >= 0) h = h.slice(0, at) + nutBlock() + h.slice(at); }
    try { if (!FB.h && A.P?.hd?.hcm) FB.h = String(A.P.hd.hcm); if (!FB.sx && /^[FM]$/.test(A.P?.hd?.sx || '')) FB.sx = A.P.hd.sx; } catch (e) { /* niente */ }
    return h + fbCard(); }; }
{ const _r = render; render = function () { const r = _r.apply(this, arguments); try { if (document.querySelector('[data-fbcv]')) requestAnimationFrame(fbDraw); } catch (e) { /* niente */ } return r; }; }
document.addEventListener('click', (e) => { const c = e.target.closest('[data-fbc]'); if (c) { e.preventDefault(); const k = c.dataset.fbc; if (k === 'x') return fbCamClose(); if (k === 'n') return fbShoot();
    if (k === 't') { let n = 5; c.disabled = true; const t = setInterval(() => { n--; c.textContent = n > 0 ? `Scatto tra ${n}…` : 'Scatto'; if (n <= 0) { clearInterval(t); fbShoot(); } }, 1000); } return; }
  const cv = e.target.closest('[data-fbcv]'); if (cv) { const k = cv.dataset.fbcv; if (FB.pts[k].length >= 4) return; const b = cv.getBoundingClientRect(); FB.pts[k].push([(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]); FB.res = null; return render(); }
  const b = e.target.closest('[data-fb]'); if (!b) return; e.preventDefault(); const k = b.dataset.fb; FB.open = true;
  if (k === 'mode') { FB.mode = b.dataset.v; FB.err = ''; FB.res = null; return render(); }
  if (k === 'cam') return fbCam(b.dataset.k);
  if (k === 'undo') { FB.pts[b.dataset.k].pop(); FB.res = null; return render(); }
  if (k === 'calc') { fbCalc(); return render(); }
  if (k === 'send') return fbSend(); }, true);
document.addEventListener('toggle', (e) => { if (e.target?.matches?.('[data-fbdet]')) FB.open = e.target.open; }, true);
document.addEventListener('input', (e) => { const t = e.target; if (t.hasAttribute?.('data-fbh')) FB.h = t.value; else if (t.hasAttribute?.('data-fbw')) FB.w = t.value; }, true);
document.addEventListener('change', (e) => { const t = e.target; if (t.dataset?.fbsx) { FB.sx = t.dataset.fbsx; return; }
  if (t.dataset?.fbfile) { const k = t.dataset.fbfile, f = t.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { fbSetImg(k, rd.result, im.width, im.height); render(); }; im.src = rd.result; }; rd.readAsDataURL(f); } }, true);
document.head.insertAdjacentHTML('beforeend', `<style>.fbcard summary{cursor:pointer}.fbshot{margin:10px 0;padding:10px;border-radius:12px;background:var(--beige,#f3eee6)}.fbshot b{display:block;margin-bottom:6px}.fbcv{display:block;width:100%;max-width:520px;border-radius:10px;touch-action:manipulation;cursor:crosshair}
.fbres{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.fbres div{background:var(--beige,#f3eee6);border-radius:12px;padding:10px}.fbres small{display:block;color:var(--muted,#6b6b6b)}.fbres b{font:400 26px/1.1 Georgia,serif}
.fbcam{position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center}.fbcam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fbsil{position:absolute;inset:8% 18% 16%;display:flex;justify-content:center}.fbsil svg{height:100%;width:auto}.fbcamt{position:absolute;top:calc(env(safe-area-inset-top) + 12px);left:16px;right:16px;color:#fff;text-align:center;font-size:15px;text-shadow:0 1px 3px #000}
.fbcamb{position:absolute;bottom:calc(env(safe-area-inset-bottom) + 18px);left:12px;right:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.nutblk{margin:10px 0}.nutblk summary{cursor:pointer}</style>`);
