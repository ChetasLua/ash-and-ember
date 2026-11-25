'use strict';
// ---- PLAYER: one clock (the audio clock once sound is on), hands on the world, quality control ------------------------------------------
const Player = (() => {
  const cv = document.getElementById('c'), hud = document.getElementById('hud'); let base = 0, paused = false, pausedAt = 0, last = -1, lastNow = 0, running = false, hudT = 0, pinch = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), P = { down: false, moved: 0 }, ptrs = new Map();
  const say = (s, ms = 3600) => { if (!hud) return; hud.textContent = s; hud.style.opacity = 1; clearTimeout(hudT); hudT = setTimeout(() => hud.style.opacity = 0, ms); };
  const raw = () => paused ? pausedAt : Sound.on ? Sound.time() : (performance.now() - base) / 1000;
  const wrap = r => ((r % Score.DUR) + Score.DUR) % Score.DUR;
  function sound() { if (!Sound.open()) return; const go = () => { if (!Sound.ready) return Sound.prepareDone ? 0 : setTimeout(go, 120); if (Sound.on || paused) return; Sound.play(wrap(raw())); }; Sound.ctx.resume().then(go).catch(() => { }); }
  function toggle() { if (paused) { paused = false; base = performance.now() - pausedAt * 1000; if (Sound.ctx && Sound.ready) { Sound.ctx.resume(); Sound.play(wrap(pausedAt)); } } else { pausedAt = wrap(raw()); paused = true; Sound.stop(); } }
  function seek(t) { t = wrap(t); base = performance.now() - t * 1000; if (paused) pausedAt = t; if (Sound.on || (Sound.ready && Sound.ctx && Sound.ctx.state === 'running' && !paused)) Sound.play(t); last = -1; }
  // ---- live notes: a key plays the next sixteenth, and the world answers it exactly like a written note
  Score.onLive = (tr, e) => { const d = Math.max(0, e.t - Main.ctx.t), k = { koto: 'koto', harp: 'harp', celesta: 'celesta', taiko: 'taiko', wood: 'wood' }[tr]; if (k) Sound.hit(k, { m: e.m, v: (e.v || .8) * .9, delay: d }); };
  function setRay(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, Main.cam); }
  function poke(x, y) {
    setRay(x, y); const ctx = Main.ctx; let best = null, bo = null;
    for (const a of Assets.list) { if (!a.ok || !a.pick || !a.poke) continue; let L; try { L = typeof a.pick === 'function' ? a.pick() : a.pick; } catch (e) { continue; } if (!L || !L.length) continue; let h; try { h = ray.intersectObjects(L, true); } catch (e) { continue; } if (h.length && (!best || h[0].distance < best.distance)) { best = h[0]; bo = a; } }
    let snd = null; if (best && best.distance < 400) { try { snd = bo.poke(best, ctx); } catch (e) { console.warn('poke', bo.name, e); } }
    else { const fx = Assets.list.find(a => a.name === 'fx' && a.ok && a.poke); const pt = ray.ray.at(30, new THREE.Vector3()); if (fx) { try { snd = fx.poke({ point: pt, object: null, distance: 30 }, ctx); } catch (e) { } } snd = snd || 'spark'; }
    if (typeof snd === 'string') Sound.hit(snd, { v: .8, pan: ndc.x * .6 }); return snd; }
  const SECTIONS = Score.SEC.map(s => s.t0);
  function keys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; const k = e.key.toLowerCase(), t = Main.ctx.t; if (!Sound.on && !paused) sound();
    const row = 'asdfghjkl;'.indexOf(k); if (row >= 0 && !e.repeat) { const sc = Score.scaleAt(t), m = sc[row % sc.length] + 12 * Math.floor(row / sc.length) + 12; Score.live('koto', { t, m, v: .85 }); return; }
    if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'b') Score.live('taiko', { t, m: 40, v: .9 }); else if (k === 'n') Strip.toggle(); else if (k === 'm') say(Sound.mute() ? 'sound off' : 'sound on', 1400);
    else if (k === 'x') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }); }
    else if (k === 'arrowright') seek(raw() + 5); else if (k === 'arrowleft') seek(raw() - 5); else if (k >= '1' && k <= '9') { const i = +k - 1; if (SECTIONS[i] !== undefined) seek(SECTIONS[i] + .01); }
    else if (k === '0') seek(SECTIONS[9] + .01); else if (k === 'p') { Film.printLock = Film.printLock === undefined ? 1 : undefined; say(Film.printLock ? 'ink' : 'colour', 1200); }
    else if (k === '?' || k === '/') say(HELP, 9000); }
  const HELP = 'tap anything to play it · drag to look, scroll to zoom · A–; koto · B drum · 1–0 chapters · ←/→ 5 s · P ink · N the score · space pause · M mute · X full screen';
  function events() {
    const opt = { passive: false }; cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); P.down = true; P.moved = 0; P.px = e.clientX; P.py = e.clientY; if (!Sound.on && !paused) sound(); });
    cv.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { Film.free.tzoom = clamp(Film.free.tzoom * pinch / d, .45, 2.2); Film.free.hold = 3; } pinch = d; P.moved = 99; return; } if (P.down) { const dx = e.clientX - P.px, dy = e.clientY - P.py; P.moved += Math.abs(dx) + Math.abs(dy); if (P.moved > 8) { Film.free.tyaw -= dx * .0052; Film.free.tpitch = clamp(Film.free.tpitch + dy * .0036, -.9, 1.1); Film.free.hold = 3.2; cv.style.cursor = 'grabbing'; } } P.px = e.clientX; P.py = e.clientY; });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (P.down && P.moved <= 8 && e.type === 'pointerup') poke(e.clientX, e.clientY); P.down = false; cv.style.cursor = 'grab'; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); Film.free.tzoom = clamp(Film.free.tzoom * Math.exp(e.deltaY * .0011), .4, 2.4); Film.free.hold = 3.2; }, opt); addEventListener('keydown', keys);
    document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) { P.auto = true; toggle(); } else if (!document.hidden && P.auto) { P.auto = false; if (paused) toggle(); } }); }
  // keep 60: if frames run long for a while, render a little smaller; climb back when there is room
  let ema = 16, badT = 0, goodT = 0; function govern(ms, now) { ema += (ms - ema) * .06; if (ema > 21 && now - badT > 1400 && Main.quality > .56) { Main.quality = Math.max(.56, Main.quality * .88); badT = now; ema = 17; } if (ema < 12.5 && now - goodT > 6000 && Main.quality < 1) { Main.quality = Math.min(1, Main.quality * 1.08); goodT = now; } }
  function frame(now) {
    if (!running) return; requestAnimationFrame(frame); let r = raw(); if (Sound.on && !paused && r >= Score.DUR) { Sound.play(r - Score.DUR); r = r - Score.DUR; } const t = r < 0 ? 0 : wrap(r), loop = last >= 0 && t < last - 1; const dtR = last < 0 ? 1 / 60 : loop ? 1 / 60 : t - last; const jump = last < 0 || Math.abs(dtR) > .5 || loop;
    const ms = now - lastNow; lastNow = now; Sound.tick(); G.t = t; if (jump) { if (loop) Score.clearLive(); Main.update(t, 1 / 60, true); } else if (dtR > 0 || paused) { const dt = clamp(dtR, 0, .1); if (dt > .034) { const n = Math.ceil(dt / .0167); for (let i = 1; i <= n; i++) Main.update(last + dt * i / n, dt / n, false); } else Main.update(t, dt, false); }
    last = t; Main.draw(); Strip.draw(t); if (ms < 100) govern(ms, now); window.__fps = 1000 / ema; }
  async function start(ld) {
    Sound.prepare(); events(); const stt = document.getElementById('st'), bar = document.getElementById('bar'), bs = bar && bar.querySelector('s');
    Main.update(0, 1 / 60, true); Main.draw(); Main.draw();
    for (const t of [5, 20, 28, 35, 45, 55, 60, 68, 78, 92, 104, 112, 118, 122, 132, 137]) { Main.update(t, 1 / 60, true); Main.draw(); if (stt) stt.textContent = 'grinding the ink'; await new Promise(r => setTimeout(r, 0)); }
    await new Promise(r => { if (Sound.ready) return r(); const w = setInterval(() => { if (stt) stt.textContent = Sound.stage; if (bs) bs.style.width = (Sound.progress * 100).toFixed(1) + '%'; if (Sound.ready) { clearInterval(w); r(); } }, 80); });
    const begin = withSound => { if (running) return; if (ld) { ld.style.opacity = 0; ld.style.pointerEvents = 'none'; setTimeout(() => ld.remove(), 900); } running = true; last = -1; lastNow = performance.now(); base = performance.now(); if (withSound && Sound.open()) Sound.ctx.resume().then(() => Sound.play(0)).catch(() => { }); requestAnimationFrame(frame); setTimeout(() => say(withSound ? 'tap anything · drag to look around · ? for keys' : 'tap for sound', withSound ? 4200 : 9000), withSound ? 11000 : 1500); };
    if (Q.has('auto')) return begin(false); let allowed = false; try { const c = Sound.open(); if (c) { await Promise.race([c.resume(), new Promise(r => setTimeout(r, 250))]); allowed = c.state === 'running'; } } catch (e) { }
    if (allowed) return begin(true); if (bar) bar.style.opacity = 0; if (stt) { stt.textContent = 'press to begin'; stt.style.cssText += ';opacity:1;padding:12px 18px;border:1.5px solid #b8322a;color:#b8322a;border-radius:3px;margin-top:8px;cursor:pointer;font-size:12px'; }
    const go = () => { removeEventListener('keydown', go); begin(true); }; if (ld) { ld.style.cursor = 'pointer'; ld.addEventListener('pointerup', go, { once: true }); } addEventListener('keydown', go, { once: true }); }
  return { start, seek, poke, say, raw, get paused() { return paused; } };
})();
