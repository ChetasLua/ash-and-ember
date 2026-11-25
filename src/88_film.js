'use strict';
// ---- FILM: the shot list, the ink that becomes a world and closes again, and what the lens does. Cuts fall on bar lines and story cues. ------
// Shots read the actors through Stage.get(name) (at/head/dir) and fall back to the marks, so every shot frames something before a lane exists.
const Film = (() => {
  const C = Score.CUE, M = Stage.M, V = { p: V3(), q: V3(), fov: 35, focus: 8, ap: .012, roll: 0, near: .12, box: 30, shake: 1 };
  const A = V3(), B = V3(), D = V3(), F = V3(), S = V3(), H = V3(), K = V3(), UP = V3(0, 1, 0), p = V3(), q = V3(), tmp = V3(), tmp2 = V3();
  const E = (a, b, t) => smoother(a, b, t), L3 = (o, a, b, k) => o.lerpVectors(a, b, k);
  const EGG = V3().copy(M.NEST).setY(M.NEST.y + .25), MEM = M.MEMORY || V3(22, 44, -80);
  // ---- where things are. Lanes publish Stage.actor(name, {at(t,out), head(out), dir(out)}); marks stand in until they do
  const fbEmber = (t, o) => t < C.CAVE ? o.copy(EGG) : t < C.RAIN ? o.copy(M.ASH_SEAT).addScaledVector(M.CAVE_DIR, 1.6) : t < C.TRAIN ? o.copy(M.CAVE).addScaledVector(M.CAVE_DIR, -1.2) : t < C.RETURN ? o.copy(M.LEDGE) : t < C.DAWN ? o.copy(M.EMBER_CLIMAX) : t < C.FLY ? o.copy(M.ASH_THROWN).add(tmp2.set(1.4, 0, .6)) : M.heart2('ember', t, o);
  const fbAsh = (t, o) => t < C.RAIN ? o.copy(M.ASH_SEAT) : t < C.TRAIN ? o.copy(M.CAVE).addScaledVector(M.CAVE_DIR, -2.4) : t < C.RETURN ? o.copy(M.LEDGE).add(tmp2.set(-3, 0, -1.5)) : t < C.ASH_DOWN ? o.copy(M.ASH_CLIMAX) : t < C.FLY ? o.copy(M.ASH_THROWN) : M.heart2('ash', t, o);
  const fbPair = (t, o) => t < C.LAND ? o.set(-70 + 24 * Math.cos(t * .21), 26 + 3 * Math.sin(t * .5), 4 + 24 * Math.sin(t * .21)) : t < C.ERUPT ? o.copy(M.NEST).setY(M.NEST.y + 1.2) : o.copy(M.cinder(t, tmp2)).add(tmp.set(-7, -3, 6));
  const FB = { ember: [fbEmber, .32], ash: [fbAsh, 2.6], pair: [fbPair, 1.2], noct: [fbPair, 1.4], lune: [fbPair, 1.4], cinder: [(t, o) => M.cinder(t, o), 4] };
  const ok = v => isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
  function at(n, t, o) { const a = Stage.get(n); if (a && a.at) { try { a.at(t, o); if (ok(o)) return o; } catch (e) { } } return FB[n][0](t, o); }
  function head(n, t, o) { const a = Stage.get(n); if (a && a.head) { try { o.set(NaN, 0, 0); a.head(o); if (ok(o)) return o; } catch (e) { } } at(n, t, o); o.y += FB[n][1]; return o; }
  function face(n, t, o, fb) { const a = Stage.get(n); if (a && a.dir) { try { o.set(0, 0, 0); a.dir(o); o.y = 0; if (o.lengthSq() > 1e-6) return o.normalize(); } catch (e) { } } return o.copy(fb).setY(0).normalize(); }
  function heading(n, t, o) { at(n, t + .2, tmp); at(n, t - .2, o); o.subVectors(tmp, o).setY(0); return o.lengthSq() > 1e-6 ? o.normalize() : o.set(1, 0, 0); }
  const sideOf = (f, o) => o.set(f.z, 0, -f.x).normalize();                       // horizontal right-hand side of a facing
  const sunDir = (fb, o) => { const s = LU.uSunDir && LU.uSunDir.value; return s && s.lengthSq() > .5 ? o.copy(s).normalize() : o.copy(fb).normalize(); };
  const set = (P, Q_, fov, o = {}) => { V.p.copy(P); V.q.copy(Q_); V.fov = fov; V.focus = o.fd || V.p.distanceTo(V.q); V.ap = o.ap === undefined ? .010 : o.ap; V.box = o.box || clamp(V.focus * 1.6, 8, 60); V.roll = o.roll || 0; V.shake = o.shake === undefined ? 1 : o.shake; V.nocol = !!o.nocol; };
  const w = (x, y, z) => tmp.set(x, y, z);
  const CAVE_S = sideOf(M.CAVE_DIR, V3());
  // the heart of the dawn flight, seen square from the west with the sun behind it
  const H2C = V3().copy(M.HEART2).setY(M.HEART2.y - 2.0), H2TOP = V3().copy(M.HEART2).setY(M.HEART2.y + 4.0);
  const fight = (t, dist, flip, up) => { at('cinder', t, A); at('lune', t, B); D.subVectors(A, B).setY(0); if (D.lengthSq() < 1e-4) D.set(1, 0, 0); D.normalize(); sideOf(D, S); if (flip) S.negate(); H.lerpVectors(A, B, .5); p.copy(H).addScaledVector(S, dist).add(w(0, up, 0)); return set(p, H, 44, { ap: .006, box: 50 }); };
  const SHOTS = [
    // ---- INK: blank rice paper; the loong is painted stroke by stroke over the sea; at COLOR the colour floods in
    [0, C.WORLD, t => { const u = E(0, 10, t); set(L3(p, w(30, 7, 46), w(21, 8.5, 37), u), L3(q, w(-48, 31, -8), w(-52, 30, -12), u), lerp(40, 35, u), { ap: 0, box: 60 }); }],
    // ---- LOVE: the pair over the sunset sea
    [C.WORLD, 13.33, t => { at('pair', t, A); sunDir(M.SUNSET_DIR, S); const u = E(10, 13.4, t); p.copy(A).addScaledVector(S, -lerp(58, 50, u)); p.y = Math.max(p.y, 3); set(p, A, 30, { ap: .004, box: 50 }); }],
    [13.33, 17.33, t => { at('pair', t, A); heading('pair', t, F); sideOf(F, S); const u = E(13.33, 17.33, t); p.copy(A).addScaledVector(S, lerp(-15, -12, u)).addScaledVector(F, lerp(-5, 2, u)); p.y += 2.2; q.copy(A).addScaledVector(F, 3); set(p, q, 36, { ap: .008, box: 30 }); }],
    [17.33, 19.33, t => { head('noct', t, A); heading('noct', t, F); sideOf(F, S); p.copy(A).addScaledVector(S, -5.5).addScaledVector(F, 3.5); p.y += .9; set(p, A, 30, { ap: .02, box: 16 }); }],
    [19.33, 21.33, t => { head('lune', t, A); heading('lune', t, F); sideOf(F, S); p.copy(A).addScaledVector(S, 5.5).addScaledVector(F, 3.5); p.y += .7; set(p, A, 30, { ap: .02, box: 16 }); }],
    [21.33, 25.33, t => { at('pair', t, A); heading('pair', t, F); sideOf(F, S); const u = E(21.33, 25.33, t); p.copy(A).addScaledVector(F, -lerp(18, 14, u)).addScaledVector(S, 3); p.y -= 5; q.copy(A).addScaledVector(F, 6); set(p, q, 40, { ap: .005, box: 34, roll: .06 }); }],
    [25.33, C.LAND, t => { sunDir(M.SUNSET_DIR, S); const u = E(25.33, 29, t); A.copy(M.HEART1).y += 1; p.copy(A).addScaledVector(S, -lerp(46, 30, u)); p.y = Math.max(p.y, 4); set(p, A, 25, { ap: .004, box: 36 }); }],
    // ---- NEST: landing, the egg, the cuddle
    [C.LAND, C.EGG, t => { const u = E(30, 32, t); set(L3(p, w(-30, 22, 19), w(-27, 22.5, 17), u), w(0, 21.6, 0), 30, { ap: .005, box: 24 }); }],
    [C.EGG, C.CUDDLE, t => { const u = E(32, 34, t); set(L3(p, tmp2.copy(M.NEST).add(w(1.9, 1.1, 1.6)), A.copy(M.NEST).add(w(1.5, .8, 1.3)), u), EGG, 30, { ap: .04, box: 8 }); }],
    [C.CUDDLE, C.ERUPT, t => { const u = E(34, 38, t); set(L3(p, tmp2.copy(M.NEST).add(w(7.5, 3.0, 8.5)), A.copy(M.NEST).add(w(5.6, 2.2, 6.4)), u), B.copy(M.NEST).add(w(0, 1.4, 0)), 34, { ap: .02, box: 16 }); }],
    // ---- ATTACK
    [C.ERUPT, C.CINDER_UP, t => { const u = E(38, 39.8, t); set(L3(p, tmp2.copy(M.NEST).add(w(-5, 6.5, 9)), A.copy(M.NEST).add(w(-4, 6, 8)), u), B.copy(M.VOLCANO).add(w(0, 14, 0)), 36, { ap: .004, box: 60, shake: 2 }); }],
    [C.CINDER_UP, C.STRIKE_NEST, t => { at('cinder', t, A); set(w(46, 76, -92), A, 44, { ap: .004, box: 50, shake: 2 }); }],
    [C.STRIKE_NEST, C.FIGHT, t => { at('cinder', t, A); set(tmp2.copy(M.NEST).add(w(2.5, 1.3, 3.6)), A, 56, { ap: .004, box: 30, shake: 2.5 }); }],
    [C.FIGHT, C.WALL_CRASH, t => fight(t, lerp(26, 21, E(C.FIGHT, C.WALL_CRASH, t)), false, -4)],
    [C.WALL_CRASH, Score.T('attack', 6), t => { at('cinder', t, A); set(w(9, 27, -55), L3(q, w(33, 32, -38), A, .35), 44, { ap: .004, box: 50, shake: 2 }); }],
    [Score.T('attack', 6), C.DRIVE_BACK, t => fight(t, 22, true, 3)],
    [C.DRIVE_BACK, C.PLUNGE, t => { at('pair', t, A); at('cinder', t, B); D.subVectors(A, B).normalize(); p.copy(A).addScaledVector(D, 16).add(w(0, 4, 0)); set(p, B, 44, { ap: .004, box: 50, shake: 1.5 }); }],
    [C.PLUNGE, C.BLAST, t => { const u = E(C.PLUNGE, C.BLAST, t); set(L3(p, w(38, 97, -86), w(44, 94, -92), u), w(88, 72, -148), 38, { ap: .003, box: 70, shake: 1.5 }); }],
    [C.BLAST, C.SILENCE, t => { A.copy(M.VOLCANO).y += 26; set(tmp2.copy(M.VOLCANO).add(w(-36, 36, 42)), A, 44, { ap: .003, box: 60, shake: 3 }); }],
    // ---- LOSS: silence, ash on the empty nest
    [C.SILENCE, 59.18, t => { const u = E(56.18, 59.6, t); set(L3(p, tmp2.copy(M.NEST).add(w(4.8, 4.4, 5.8)), A.copy(M.NEST).add(w(4.1, 3.7, 5.0)), u), B.copy(M.NEST).add(w(0, .3, 0)), 30, { ap: .02, box: 12, shake: .3 }); }],
    [59.18, C.DAWN0, t => { const u = E(59.18, 62.2, t); set(L3(p, tmp2.copy(M.NEST).add(w(1.05, .58, 1.3)), A.copy(M.NEST).add(w(.86, .5, 1.06)), u), EGG, 26, { ap: .05, box: 5, shake: .2 }); }],
    // ---- HATCH
    [C.DAWN0, 63.85, t => { const u = E(62.18, 63.9, t); set(L3(p, w(47, 16, 35), w(44.5, 17, 33), u), w(0, 22, 0), 26, { ap: .004, box: 24 }); }],
    [63.85, C.HATCH, t => set(tmp2.copy(M.NEST).add(w(1.18, .62, .98)), EGG, 30, { ap: .045, box: 5 })],
    [C.HATCH, C.SUN_PROFILE, t => { head('ember', t, A); const u = E(C.HATCH, C.SUN_PROFILE, t); set(L3(p, tmp2.copy(M.NEST).add(w(1.6, .75, 1.8)), B.copy(M.NEST).add(w(1.25, .62, 1.45)), u), A, 32, { ap: .04, box: 6 }); }],
    [C.SUN_PROFILE, C.SNEEZE1, t => { at('ember', C.SUN_PROFILE + 1.0, A).y += .42; if (!SUNC) { try { Sky.apply(C.SUN_PROFILE + 1.4, A, 8); SUNC = sunDir(M.SUNRISE_DIR, V3()); } catch (e) { SUNC = M.SUNRISE_DIR.clone(); } } S.copy(SUNC); const u = E(C.SUN_PROFILE, C.SNEEZE1, t); p.copy(A).addScaledVector(S, -lerp(11.5, 10.5, u)); p.y += .38; q.copy(p).addScaledVector(S, 11).y -= .12; set(p, q, lerp(9.5, 8.6, u), { ap: .002, box: 8, shake: .4, nocol: true }); }],
    [C.SNEEZE1, C.CAVE, t => { head('ember', t, A); face('ember', t, F, w(1, 0, 0)); sideOf(F, S); p.copy(A).addScaledVector(F, .78).addScaledVector(S, .32); p.y += .04; set(p, A, 30, { ap: .05, box: 4 }); }],
    // ---- CAVE: the old smoker
    [C.CAVE, 74.58, t => { at('ember', t, A); q.copy(M.CAVE).add(w(0, 1.1, 0)).lerp(A.add(w(0, .3, 0)), .55); set(tmp2.copy(M.CAVE).addScaledVector(M.CAVE_DIR, 7).addScaledVector(CAVE_S, 2.6).add(w(0, 1.5, 0)), q, 38, { ap: .012, box: 16 }); }],
    [74.58, C.SMOKE_FACE, t => { head('ash', t, A); const u = E(74.58, 77, t); p.copy(M.ASH_SEAT).addScaledVector(M.CAVE_DIR, lerp(5.6, 5.0, u)).addScaledVector(CAVE_S, 1.5).add(w(0, 2.1, 0)); set(p, A.add(w(0, -.5, 0)), 38, { ap: .015, box: 12 }); }],
    [C.SMOKE_FACE, C.IMITATE, t => { head('ash', t, A); head('ember', t, B); H.lerpVectors(A, B, .5); p.copy(H).addScaledVector(CAVE_S, 4.6); p.y += .25; set(p, H, 34, { ap: .02, box: 10 }); }],
    [C.IMITATE, C.WHEEZE, t => { head('ash', t, A); head('ember', t, B); p.lerpVectors(B, A, .42).addScaledVector(CAVE_S, .55); set(p, B, 30, { ap: .04, box: 6 }); }],
    [C.WHEEZE, C.SNEEZE_LIGHT, t => { head('ash', t, A); p.copy(A).addScaledVector(M.CAVE_DIR, 2.4).addScaledVector(CAVE_S, -.9); p.y -= .2; set(p, B.copy(A).add(w(0, -.25, 0)), 32, { ap: .03, box: 8 }); }],
    [C.SNEEZE_LIGHT, C.RAIN, t => { head('ash', t, A); head('ember', t, B); H.lerpVectors(A, B, .5); p.copy(H).addScaledVector(CAVE_S, -4.2).addScaledVector(M.CAVE_DIR, 1.0); p.y += .5; set(p, H, 34, { ap: .02, box: 10 }); }],
    // ---- SHELTER: night rain, the wing, the lullaby
    [C.RAIN, C.WING, t => { at('ember', t, A); set(tmp2.copy(M.CAVE).addScaledVector(M.CAVE_DIR, 9.5).addScaledVector(CAVE_S, 1.5).add(w(0, 1.2, 0)), A.add(w(0, .4, 0)), 30, { ap: .02, box: 12 }); }],
    [C.WING, C.SING, t => { at('ash', t, A); p.copy(A).addScaledVector(CAVE_S, 3.0).addScaledVector(M.CAVE_DIR, .4).add(w(0, 1.3, 0)); set(p, B.copy(A).add(w(0, .9, 0)), 38, { ap: .015, box: 12 }); }],
    [C.SING, C.STUB, t => { head('ash', t, A); face('ash', t, F, M.CAVE_DIR); sideOf(F, S); const u = E(C.SING, C.STUB, t); p.copy(A).addScaledVector(F, lerp(2.3, 1.9, u)).addScaledVector(S, .7); p.y -= .15; set(p, A, 30, { ap: .04, box: 8 }); }],
    [C.STUB, C.TRAIN, t => { at('ember', t, A); const u = E(C.STUB, C.TRAIN, t); p.copy(A).addScaledVector(M.CAVE_DIR, .9).addScaledVector(CAVE_S, .6); p.y += lerp(1.1, 1.6, u); set(p, A.add(w(0, .15, 0)), 34, { ap: .03, box: 6 }); }],
    // ---- TRAIN: the ledge, three falls and a glide
    [C.TRAIN, 100.9, t => { const u = E(99.08, 100.9, t); set(L3(p, w(59.5, 15.6, 35.8), w(58.6, 15.3, 35.2), u), w(52.4, 14.5, 32.2), 30, { ap: .008, box: 14 }); }],
    [100.9, 102.72, t => { at('ember', t, A); set(tmp2.copy(A).add(w(2.6, .6, 1.8)), A.add(w(0, .3, 0)), 34, { ap: .02, box: 8 }); }],
    [102.72, 104.53, t => { at('ember', t, A); set(tmp2.copy(A).add(w(-1.2, .5, 2.6)), A.add(w(0, .3, 0)), 32, { ap: .025, box: 8 }); }],
    [104.53, C.GLIDE, t => { head('ember', t, A); face('ember', t, F, w(0, 0, 1)); sideOf(F, S); p.copy(A).addScaledVector(F, .85).addScaledVector(S, .3); set(p, A, 30, { ap: .05, box: 4 }); }],
    [C.GLIDE, C.RETURN, t => { at('ember', t, A); set(tmp2.copy(A).add(w(-1.5, .9, 5.5)), A.add(w(1, .2, 0)), 40, { ap: .01, box: 12 }); }],
    // ---- CLIMAX
    [C.RETURN, C.ASH_STANDS, t => set(tmp2.copy(M.EMBER_CLIMAX).add(w(-7, 2.2, 9)), A.copy(M.FISSURE).add(w(0, 9, 0)), 46, { ap: .004, box: 40, shake: 2.5 })],
    [C.ASH_STANDS, C.ASH_DOWN, t => { at('cinder', t, A); D.subVectors(M.EMBER_CLIMAX, A).setY(0).normalize(); sideOf(D, S); p.copy(M.EMBER_CLIMAX).addScaledVector(D, 2.3).addScaledVector(S, .7).add(w(0, .45, 0)); head('ash', t, B); set(p, B, 42, { ap: .008, box: 30, shake: 1.5 }); }],
    [C.ASH_DOWN, C.CINDER_FIRE, t => { at('cinder', t, A); D.subVectors(A, M.ASH_CLIMAX).setY(0).normalize(); sideOf(D, S); p.copy(M.ASH_CLIMAX).addScaledVector(S, 15).add(w(0, 3, 0)); set(p, L3(q, M.ASH_CLIMAX, M.ASH_THROWN, .5).add(w(0, 2.5, 0)), 44, { ap: .004, box: 36, shake: 3 }); }],
    [C.CINDER_FIRE, 114.35, t => { at('ember', t, A); at('cinder', t, B); D.subVectors(B, A).setY(0).normalize(); sideOf(D, S); p.copy(A).addScaledVector(D, -2.0).addScaledVector(S, 3.2).add(w(0, 3.0, 0)); set(p, q.copy(A).add(w(0, .3, 0)).addScaledVector(D, .8), 36, { ap: .015, box: 12, shake: 2 }); }],
    [114.35, C.ALONE, t => { at('ember', t, A); at('cinder', t, B); D.subVectors(B, A).setY(0).normalize(); sideOf(D, S); p.copy(A).addScaledVector(D, -4).addScaledVector(S, 13).add(w(0, 2.2, 0)); set(p, q.copy(A).add(w(0, 1.2, 0)).addScaledVector(D, 3.5), 36, { ap: .006, box: 24, shake: 2 }); }],
    [C.ALONE, 115.95, t => { head('ember', t, A); face('ember', t, F, w(1, 0, -1)); const u = E(C.ALONE, 116, t); p.copy(A).addScaledVector(F, lerp(.85, .72, u)); p.y += .04; set(p, A, 28, { ap: .06, box: 4, shake: .2 }); }],
    [115.95, C.INHALE, t => { head('ember', t, A); set(tmp2.copy(A).add(w(0, .15, 0)), MEM, 52, { ap: 0, box: 40, shake: .2 }); }],
    [C.INHALE, C.BLUE, t => { head('ember', t, A); face('ember', t, F, w(1, 0, -1)); const u = E(C.INHALE, C.BLUE, t); p.copy(A).addScaledVector(F, lerp(.72, .6, u)); p.y += .03; set(p, A, 27, { ap: .06, box: 4, shake: .2 }); }],
    [C.BLUE, C.LOONG, t => { at('ember', t, A); head('ember', t, H); face('ember', t, F, w(1, 0, -1)); sideOf(F, S); const u = E(C.BLUE, C.LOONG, t); p.copy(A).addScaledVector(S, lerp(5.2, 4.4, u)).addScaledVector(F, -1.4).add(w(0, lerp(3.6, 3.0, u), 0)); set(p, H.addScaledVector(F, 2.2), 42, { ap: .006, box: 20, shake: 2 }); }],
    [C.LOONG, C.PETRIFY, t => { const u = E(C.LOONG, C.PETRIFY, t), a = lerp(-.7, .15, u); p.copy(M.PLATEAU).add(w(-42 * Math.sin(a + .8), 22 - 4 * u, 42 * Math.cos(a + .8))); set(p, A.copy(M.PLATEAU).add(w(0, 8, 0)), 46, { ap: .002, box: 60, shake: .8 }); }],
    [C.PETRIFY, C.CRUMBLE, t => { head('cinder', t, A); at('ember', t, B); F.subVectors(B, A).setY(0).normalize(); sideOf(F, S); at('cinder', t, H); p.copy(H).addScaledVector(F, 15).addScaledVector(S, 9).add(w(0, 5, 0)); set(p, H.add(w(0, 4.5, 0)), 40, { ap: .006, box: 20, shake: 1.5 }); }],
    [C.CRUMBLE, C.DAWN, t => { at('cinder', t, A); set(tmp2.copy(A).add(w(-20, 7, 20)), A.add(w(0, 5, 0)), 42, { ap: .003, box: 40, shake: 2 }); }],
    // ---- DAWN: wake, fire, flight, the heart, the joke, back to ink
    [C.DAWN, C.WAKE, t => { const u = E(C.DAWN, C.WAKE, t); set(L3(p, tmp2.copy(M.ASH_THROWN).add(w(5.5, 3.6, 5)), A.copy(M.ASH_THROWN).add(w(4.6, 3.1, 4.1)), u), B.copy(M.ASH_THROWN).add(w(1, .6, 0)), 36, { ap: .015, box: 12 }); }],
    [C.WAKE, C.ASH_FIRE, t => { head('ash', t, A); set(tmp2.copy(A).add(w(1.0, 2.6, 2.2)), A.add(w(.3, -.5, .3)), 34, { ap: .035, box: 6 }); }],
    [C.ASH_FIRE, C.FLY, t => { head('ash', t, A); set(tmp2.copy(M.ASH_THROWN).add(w(4.5, 1.8, -3.5)), A, 36, { ap: .015, box: 12 }); }],
    [C.FLY, 133.04, t => { at('ember', t, A); at('ash', t, B); H.lerpVectors(A, B, .5); heading('ember', t, F); sideOf(F, S); p.copy(H).addScaledVector(F, -9).addScaledVector(S, 4).add(w(0, 2.5, 0)); set(p, q.copy(H).addScaledVector(F, 4), 42, { ap: .006, box: 24, shake: .6 }); }],
    [133.04, C.HEART2, t => { const u = E(133.04, C.HEART2, t); set(tmp2.copy(H2C).add(w(lerp(-62, -56, u), 1.5, 0)), H2C, 28, { ap: .002, box: 50, shake: .3 }); }],
    [C.HEART2, C.INK_BACK, t => set(tmp2.copy(H2TOP).add(w(-9, .8, -.6)), H2TOP, 32, { ap: .012, box: 14, shake: .3 })],
    [C.INK_BACK, Score.DUR + 1, t => { const k = E(C.INK_BACK, 139.4, t); L3(p, tmp2.copy(H2TOP).add(w(-9, .8, -.6)), A.copy(H2C).add(w(-58, 1.5, 0)), k); set(p, L3(q, H2TOP, H2C, k), lerp(32, 28, k), { ap: .0, box: 50, shake: .2 }); }],
  ];
  // ---- the title, painted once into a texture the lens lays over the paper
  function title() { const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(21,38,82,0.92)'; g.textAlign = 'right'; g.font = 'italic 500 92px Georgia, "Iowan Old Style", "Times New Roman", serif'; g.fillText('Ash & Ember', 1690, 846);
    g.font = '500 22px Georgia, serif'; g.fillStyle = 'rgba(21,38,82,0.62)'; g.fillText('a dragon story in ink and clay', 1688, 892);
    g.fillStyle = '#b8322a'; g.save(); g.translate(1724, 772); g.rotate(-.04); g.fillRect(0, 0, 58, 58); g.strokeStyle = '#efe6d6'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(14, 16); g.lineTo(44, 16); g.moveTo(29, 10); g.lineTo(29, 48); g.moveTo(14, 34); g.quadraticCurveTo(29, 26, 44, 40); g.stroke(); g.restore();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.NoColorSpace; tx.premultiplyAlpha = false; tx.needsUpdate = true; return tx; }
  const free = { yaw: 0, pitch: 0, zoom: 1, tyaw: 0, tpitch: 0, tzoom: 1, hold: 0 };
  let titleTx = null, shotI = 0, SUNC = null; const DBG = Q.has('dbgcam') ? Q.get('dbgcam').split(',').map(Number) : null;
  function update(ctx) {
    const t = ctx.t; if (!titleTx && Post.fin.uTitle) { try { titleTx = title(); Post.fin.uTitle.value = titleTx; } catch (e) { } }
    // the ink: painted 0..COLOR, floods into colour by WORLD; a memory flash in the silence before the blue fire; closes again at INK_BACK
    const flood = 1 - sm(C.COLOR, C.WORLD - .35, t), mem = pulse(t, 115.88, .14, .32) * (t < C.INHALE + .1 ? 1 : 0) + (t > 115.95 && t < C.INHALE ? 1 : 0), back = sm(C.INK_BACK, C.INK_BACK + 1.5, t);
    const pr = Film.printLock === undefined ? Math.min(1, Math.max(flood, back, mem)) : Film.printLock; LU.uPrint.value = pr;
    const B_ = Post.fin.uBlocks.value; if (t < C.WORLD) B_.set(sm(1.6, 6.5, t), sm(3.2, 7.2, t), 1, 1); else if (t > C.INK_BACK - .1) B_.set(1, sm(C.INK_BACK, C.INK_BACK + 1.2, t), 1, 1); else B_.set(1, 1, 1, 1);
    Post.fin.uBorder.value = pr * (t < 100 && t > 20 ? 0 : 1); Post.fin.uSeal.value = t < C.WORLD ? sm(C.INK_SEAL, C.INK_SEAL + .25, t) * (1 - sm(C.COLOR, C.COLOR + 1, t)) : sm(C.SEAL - .05, C.SEAL + .25, t);
    Post.fin.uTitleK.value = sm(3.0, 4.2, t) * (1 - sm(C.COLOR - .3, C.COLOR + .5, t)) + sm(138.7, 139.4, t);
    Post.fin.uFade.value = 1 - sm(0, .35, t); Post.fin.uSat.value = 1.04 * (1 - .58 * sm(C.SILENCE, C.SILENCE + .4, t) * (1 - sm(C.DAWN0 - .4, C.DAWN0 + 1.6, t)) - .35 * sm(C.ALONE, C.ALONE + .3, t) * (1 - sm(C.BLUE - .1, C.BLUE + .2, t)));
    let fl = 0; for (const b of Score.tracks.bolt || []) fl += pulse(t, b.t, .02, .16) * .55; fl += pulse(t, C.BLAST, .05, .5) * 1.4 + pulse(t, C.ERUPT, .05, .35) * .5 + pulse(t, C.RETURN, .05, .4) * .6 + pulse(t, C.BLUE, .08, .7) * .5 + pulse(t, C.PETRIFY, .05, .3) * .3; Post.fin.uFlash.value = Math.min(1.6, fl) * .22;
    LU.uPrintC.value.set(.5, t < 60 ? .55 : .5, Main.cam ? Main.cam.aspect : 16 / 9);
    free.hold = Math.max(0, free.hold - ctx.dt); if (free.hold <= 0) { const k = Math.exp(-1.1 * ctx.dt); free.tyaw *= k; free.tpitch *= k; free.tzoom = 1 + (free.tzoom - 1) * Math.exp(-.8 * ctx.dt); } const kk = 1 - Math.exp(-9 * ctx.dt); free.yaw += (free.tyaw - free.yaw) * kk; free.pitch += (free.tpitch - free.pitch) * kk; free.zoom += (free.tzoom - free.zoom) * kk;
    place(ctx); }
  function place(ctx) {
    const t = ctx.t; let i = 0; while (i < SHOTS.length - 1 && t >= SHOTS[i][1]) i++; shotI = i; V.near = .12; try { SHOTS[i][2](t); } catch (e) { if (!G.filmErr) { G.filmErr = 1; G.errors.push('film shot ' + i + ': ' + (e.stack || e)); } }
    if (!V.nocol && typeof Island !== 'undefined' && Island.collide && V.p.distanceTo(V.q) < 60) { try { Island.collide(V.p, .35, t); const g = Island.ground(V.p.x, V.p.z); if (isFinite(g)) V.p.y = Math.max(V.p.y, g + .22); } catch (e) { } }
    if (DBG) { V.p.set(DBG[0], DBG[1], DBG[2]); V.q.set(DBG[3], DBG[4], DBG[5]); V.fov = DBG[6] || 40; V.ap = 0; V.shake = 0; }
    const cam = ctx.cam; p.copy(V.p); q.copy(V.q);
    if (Math.abs(free.yaw) + Math.abs(free.pitch) + Math.abs(free.zoom - 1) > 1e-4) { D.subVectors(p, q); const R = D.length() * free.zoom, th = Math.atan2(D.x, D.z) + free.yaw, ph = clamp(Math.asin(clamp(D.y / Math.max(D.length(), 1e-6), -1, 1)) + free.pitch, -1.2, 1.35); p.set(q.x + R * Math.cos(ph) * Math.sin(th), q.y + R * Math.sin(ph), q.z + R * Math.cos(ph) * Math.cos(th)); }
    // the hand on the camera: breathing, and the blows of the fight
    const sec = Score.sec ? Score.sec(t) : ''; const hit = (Score.env('hit', t, .22) * .9 + Score.env('bolt', t, .3) * .35 + Score.env('lava', t, .25) * .25 + Score.env('flap_cinder', t, .3) * .25 + pulse(t, C.BLAST, .03, .6) * 1.6 + pulse(t, C.RETURN, .03, .5) * 1.2 + pulse(t, C.ASH_DOWN, .02, .3) * .8 + pulse(t, C.CRUMBLE, .03, .6) * .6) * V.shake;
    const amp = clamp(V.focus * .0015, .0005, .03) * (1 + hit * 5); p.x += (Math.sin(t * 1.3) + .6 * Math.sin(t * 2.9 + 1)) * amp; p.y += (Math.sin(t * 1.7 + 2) + .5 * Math.sin(t * 3.7)) * amp * .7; q.x += Math.sin(t * 23.0) * amp * hit * .8; q.y += Math.sin(t * 19.0 + 1) * amp * hit * .8;
    cam.position.copy(p); cam.up.set(0, 1, 0); const near = clamp(V.p.distanceTo(V.q) * .03, .03, .6); cam.near = near; cam.far = 1600; const asp = cam.aspect, base = 16 / 9; cam.fov = asp < base ? Math.min(100, 2 * Math.atan(Math.tan(deg(V.fov) / 2) * lerp(base / asp, 1, asp < 1 ? .42 : .25)) * 180 / PI) : V.fov; cam.fov /= Math.max(.4, free.zoom < 1 ? 1 / free.zoom * .5 + .5 : 1); cam.updateProjectionMatrix(); cam.lookAt(q); if (V.roll) cam.rotateZ(V.roll); cam.updateMatrixWorld(); }
  function view(ctx) { place(ctx); const n = Sky.S.night || 0; return { focus: V.focus, aperture: V.ap, lightFocus: tmp.copy(V.q).clone(), lightBox: V.box, shafts: lerp(1, .35, n), lanGain: 1 }; }
  return { update, view, SHOTS, free, V, get shot() { return shotI; }, printLock: undefined };
})();
