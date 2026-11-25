'use strict';
// ---- SOUND: hires a room of Workers, has the songs sung, the orchestra played, the foley made and everything mixed, then plays it.
// The audio clock is the film clock. The sources travel inside the page as <script id="audio-src" type="text/plain"> (Score + src/audio/*).
// Way one: Workers from a Blob. Way two (a locked-down preview): the same code on this thread, one job between frames. Way three: silence.
const Sound = (() => {
  const SR = 44100, el = document.getElementById('audio-src'), SRC = el ? el.textContent : '', nonce = (document.currentScript && document.currentScript.nonce) || '';
  const S = { ready: false, prepareDone: false, on: false, muted: false, ctx: null, how: '', log: [], VIS: {}, progress: 0, stage: 'waking the orchestra', ms: 0 };
  const NAMES = { voice: 'the dragons are clearing their throats', band: 'the orchestra is tuning', foley: 'grinding the ink' };
  // live one-shots: pitched instruments are rendered at a few roots and re-pitched by playback rate
  const LIVE = [['koto', 57], ['koto', 69], ['harp', 62], ['harp', 74], ['celesta', 74], ['taiko', 40], ['wood', 72]], FK = ['puff', 'spark', 'sneeze', 'crack', 'splash', 'whoosh', 'thud', 'flame', 'blue', 'chirp', 'stone'], FKN = { spark: 2, crack: 2, chirp: 3, stone: 2 };
  let master = null, mb = null, node = null, ng = null, out = null, fx = null, t0 = 0, lastT = 0, lastC = -1, lastW = 0, wall = null, shots = null; const sb = {};
  const finish = (M, t00) => { master = M; S.progress = 1; S.ready = true; S.prepareDone = true; S.ms = performance.now() - t00; S.log.push('sound ready in ' + Math.round(S.ms) + ' ms, ' + S.how); };
  async function viaWorkers() {
    if (!SRC) throw new Error('no audio source in this page'); const t00 = performance.now(), url = URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' })), phone = matchMedia('(pointer: coarse)').matches; const n = Math.max(2, Math.min(phone ? 3 : 8, (navigator.hardwareConcurrency || 4) - 1)), W = [];
    const ask = (w, msg, tr = [], ms = 150000) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('worker silent: ' + msg.cmd + ' ' + (msg.id || ''))), ms); w.onmessage = e => { clearTimeout(to); e.data.cmd === 'error' ? rej(new Error(e.data.what + ': ' + e.data.msg)) : res(e.data); }; w.onerror = e => { clearTimeout(to); e.preventDefault && e.preventDefault(); rej(new Error('worker blocked ' + (e.message || ''))); }; try { w.postMessage(msg, tr); } catch (x) { clearTimeout(to); rej(x); } });
    try {
      W.push(new Worker(url)); const L = await ask(W[0], { cmd: 'list' }, [], 9000); for (let i = 1; i < n; i++) W.push(new Worker(url)); S.how = n + ' workers';
      const jobs = []; for (const lane of ['voice', 'band', 'foley']) for (const [id, c] of L[lane]) jobs.push({ lane, id, c }); jobs.sort((x, y) => y.c - x.c); const total = jobs.length + 3; let done = 0; const stems = [];
      await Promise.all(W.map(async (w, wi) => { for (;;) { const j = jobs.shift(); if (!j) { if (wi > 1) w.terminate(); return; } S.stage = NAMES[j.lane]; const r = await ask(w, { cmd: 'job', lane: j.lane, id: j.id }); if (r.r.vis) { if (j.lane === 'voice') S.VIS[r.r.id] = r.r.vis; delete r.r.vis; } stems.push(r.r); done++; S.progress = done / total; } }));
      S.log.push('sung and played by ' + Math.round(performance.now() - t00) + ' ms'); S.stage = 'mixing';
      const tr = [...new Set(stems.flatMap(x => ['pcm', 'L', 'R'].filter(k => x[k] && x[k].buffer).map(k => x[k].buffer)))];
      const shotP = ask(W[1 % W.length], { cmd: 'shots', kinds: FK, n: FKN, band: LIVE }); const M = await ask(W[0], { cmd: 'mix', stems }, tr); S.log.push('mixed by ' + Math.round(performance.now() - t00) + ' ms'); finish(M, t00);
      const all = () => { W.forEach(w => w.terminate()); URL.revokeObjectURL(url); }; shotP.then(o => { shots = o.out; }).catch(e => S.log.push('shots: ' + e.message)).then(all);
    } catch (e) { W.forEach(w => w.terminate()); URL.revokeObjectURL(url); throw e; }
  }
  async function viaPage() {
    if (!SRC) throw new Error('no audio source in this page'); const t00 = performance.now(); S.how = 'this page'; const rest = () => new Promise(r => setTimeout(r, 12));
    const s = document.createElement('script'); if (nonce) s.nonce = nonce; s.textContent = 'window.__AUD=(()=>{' + SRC + '\n;return{VOICE,BAND,FOLEY,MIX,stem16};})();'; document.head.appendChild(s); s.remove(); const X = window.__AUD; if (!X) throw new Error('page refused the sound code');
    const jobs = []; for (const id of X.VOICE.jobs()) jobs.push(['voice', id]); for (const id of X.BAND.jobs()) jobs.push(['band', id]); for (const id of X.FOLEY.jobs()) jobs.push(['foley', id]); const stems = [];
    for (let i = 0; i < jobs.length; i++) { const [lane, id] = jobs[i]; S.stage = NAMES[lane]; await rest(); const r = (lane === 'voice' ? X.VOICE : lane === 'band' ? X.BAND : X.FOLEY).render(id); r.lane = lane; r.id = r.id || id; if (r.vis) { if (lane === 'voice') S.VIS[r.id] = r.vis; delete r.vis; } stems.push(X.stem16(r)); S.progress = i / (jobs.length + 6); }
    S.stage = 'mixing'; await rest(); const M = X.MIX.master(stems, SR, { free: true }); stems.length = 0; await rest(); shots = {};
    try { for (const k of FK) for (let q = 0; q < (FKN[k] || 1); q++) { const o = X.FOLEY.oneshot(k, 11 + q * 7); shots[k + q] = { L: Float32Array.from(o.L), R: Float32Array.from(o.R || o.L) }; } for (const [k, m] of LIVE) { const o = X.BAND.oneshot(k, m, .8); shots[k + '@' + m] = { L: Float32Array.from(o.L), R: Float32Array.from(o.R || o.L) }; } } catch (e) { S.log.push('shots: ' + e.message); }
    finish(M, t00); window.__AUD = null;
  }
  async function load() {
    try { await viaWorkers(); return; } catch (e) { S.log.push('workers: ' + (e.message || e)); console.warn('sound: no workers here, using the page (' + (e.message || e) + ')'); }
    S.progress = 0; try { await viaPage(); return; } catch (e) { S.log.push('page: ' + (e.message || e)); console.warn('sound: ' + (e.stack || e)); }
    S.silent = true; S.how = 'silent'; S.progress = 1; S.ready = true; S.prepareDone = true; S.stage = 'no sound here';
  }
  S.prepare = () => { if (!S._p) S._p = load(); return S._p; };
  S.open = () => { try { if (S.ctx) return S.ctx; const C2 = window.AudioContext || window.webkitAudioContext; if (!C2) return null; try { S.ctx = new C2({ sampleRate: SR, latencyHint: 'playback' }); } catch (e) { S.ctx = new C2(); } out = S.ctx.createGain(); out.gain.value = S.muted ? 0 : 1; out.connect(S.ctx.destination); fx = S.ctx.createGain(); fx.gain.value = .85; fx.connect(out); return S.ctx; } catch (e) { S.log.push('context: ' + e.message); return null; } };
  const buf = d => { const n = d.L.length, b = S.ctx.createBuffer(2, n, SR), q = d.q || 1, conv = a => a instanceof Float32Array ? a : Float32Array.from(a, v => v * q); b.getChannelData(0).set(conv(d.L)); b.getChannelData(1).set(conv(d.R || d.L)); return b; };
  const lat = () => { const l = S.ctx.outputLatency; return l > 0 && l < .6 ? l : (S.ctx.baseLatency > 0 && S.ctx.baseLatency < .6 ? S.ctx.baseLatency : .012); };
  S.play = t => {
    S.stop(); const now = performance.now(); lastT = t; lastW = now; wall = null; S.on = true;
    if (S.silent || !S.ctx || !(master || mb)) { wall = { t, w: now, hard: true }; return; }
    try { if (!mb) { mb = buf(master); master = null; } const s = S.ctx.createBufferSource(); s.buffer = mb; const g = S.ctx.createGain(); s.connect(g); g.connect(out); const w = S.ctx.currentTime + .06; g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(1, w + .04); if (t < mb.duration - .05) s.start(w, Math.max(0, t)); node = s; ng = g; t0 = w - t; lastC = S.ctx.currentTime; } catch (e) { S.log.push('play: ' + e.message); wall = { t, w: now, hard: true }; }
  };
  S.stop = () => { if (node) { try { ng.gain.setTargetAtTime(0, S.ctx.currentTime, .02); node.stop(S.ctx.currentTime + .15); } catch (e) { } node = null; } S.on = false; };
  // the film clock: the sound card when it really runs, the wall clock whenever it does not (a stalled or suspended context)
  S.time = () => {
    const now = performance.now(), wallT = () => wall.t + (now - wall.w) / 1000; if (wall && wall.hard) return lastT = wallT(); const c = S.ctx.currentTime;
    if (c !== lastC) { lastC = c; lastW = now; if (wall) { const t = wallT(); S.play(t); return t; } } else if (!wall && now - lastW > 500) wall = { t: lastT, w: now };
    return lastT = wall ? wallT() : c - t0 - lat();
  };
  S.tick = () => { if (S.ctx && S.ctx.state === 'suspended' && S.on && !S._resuming) { S._resuming = 1; S.ctx.resume().finally(() => S._resuming = 0); } };
  S.mute = () => { S.muted = !S.muted; if (out) out.gain.setTargetAtTime(S.muted ? 0 : 1, S.ctx.currentTime, .03); return S.muted; };
  // a live sound: kind = a foley kind (puff spark ...) or an instrument (koto harp celesta taiko wood) with m = midi
  let rr = 0; S.hit = (k, { m, v = .8, pan = 0, rate = 1, delay = 0 } = {}) => {
    if (S.silent || !S.ctx || !shots || S.ctx.state !== 'running') return; let key = null;
    if (LIVE.some(x => x[0] === k)) { let best = 1e9; for (const [kk, mm] of LIVE) if (kk === k) { const d = Math.abs((m === undefined ? mm : m) - mm); if (d < best) { best = d; key = kk + '@' + mm; rate = m === undefined ? rate : rate * Math.pow(2, (m - mm) / 12); } } }
    else { const nn = FKN[k] || 1; key = k + (rr++ % nn); }
    const d = shots[key]; if (!d) return; if (!sb[key]) sb[key] = buf(d); const s = S.ctx.createBufferSource(), g = S.ctx.createGain(), p = S.ctx.createStereoPanner ? S.ctx.createStereoPanner() : null; s.buffer = sb[key]; s.playbackRate.value = clamp(rate, .25, 4); g.gain.value = v; s.connect(g); if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(fx); } else g.connect(fx); s.start(S.ctx.currentTime + Math.max(0, delay));
  };
  return S;
})();
