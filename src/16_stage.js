'use strict';
// ---- STAGE: the island's marks (metres, y up, sea at y = 0) and the actors' registry --------------------------------------------------
// Every lane builds to these marks. Actors register so the camera, the wind and the effects can find them:
//   Stage.actor('ember', { at(t, out), head(out), mouth(out), dir(out) })     Stage.get('ember')     Stage.focus(t, out) = where the story is
const Stage = (() => {
  const M = {
    SEA_Y: 0,
    NEST: V3(0, 20, 0), NEST_R: 6,                       // the crag top: flat, radius 6, cliffs to the sea on the west and south
    VOLCANO: V3(90, 70, -150), CRATER_R: 14, LAVA_Y: 66,  // crater rim centre; lava lake inside
    WALL0: V3(14, 22, -14), WALL1: V3(52, 31, -58),       // the ruined wall along the ridge (ref 4)
    PLATEAU: V3(42, 16, -46), PLATEAU_R: 22, BOULDER: V3(36, 16, -36), FISSURE: V3(58, 16, -62),
    CAVE: V3(40, 8, 24), CAVE_DIR: V3(.45, 0, .89).normalize(), CAVE_IN: V3(37, 8, 16), ASH_SEAT: V3(36.5, 8, 15.5),
    LEDGE: V3(54, 14, 32), DAWN_SEA: V3(140, 22, 40),
    SUNSET_DIR: V3(-1, .12, .15).normalize(), SUNRISE_DIR: V3(1, .08, .25).normalize() };
  const actors = {}, tmp = V3();
  // ---- shared paths (pure functions of t). Lanes that interact read the SAME function, so they never drift apart.
  // Cinder's root (centre of his chest, world) through the attack and the climax. Cinder's lane adds banking, bob and flap; the parents fly relative to it.
  const C = Score.CUE, kcr = keys => { const ks = keys.map(k => [k[0], V3(k[1], k[2], k[3])]); return (t, out) => { out = out || V3(); if (t <= ks[0][0]) return out.copy(ks[0][1]); for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const a = ks[Math.max(0, i - 2)], b = ks[i - 1], c = ks[i], d = ks[Math.min(ks.length - 1, i + 1)], u = (t - b[0]) / (c[0] - b[0]), u2 = u * u, u3 = u2 * u; for (const k of ['x', 'y', 'z']) out[k] = .5 * (2 * b[1][k] + (-a[1][k] + c[1][k]) * u + (2 * a[1][k] - 5 * b[1][k] + 4 * c[1][k] - d[1][k]) * u2 + (-a[1][k] + 3 * b[1][k] - 3 * c[1][k] + d[1][k]) * u3); return out; } return out.copy(ks[ks.length - 1][1]); }; };
  const cinderAttack = kcr([[C.ERUPT, 90, 58, -150], [C.CINDER_UP, 90, 74, -150], [C.CINDER_UP + .9, 88, 96, -146], [C.CINDER_UP + 1.8, 60, 72, -100], [C.STRIKE_NEST, 8, 30, -8], [C.FIGHT, 22, 40, -26], [C.FIGHT + 1.8, 30, 37, -34], [C.WALL_CRASH, 33, 30, -37], [C.WALL_CRASH + 1.8, 42, 46, -58], [C.DRIVE_BACK, 58, 60, -82], [C.DRIVE_BACK + .9, 70, 72, -110], [C.PLUNGE, 84, 80, -138], [C.PLUNGE + 1, 90, 62, -150], [C.BLAST, 90, 58, -150]]);
  const cinderClimax = kcr([[C.RETURN - .1, 58, 4, -62], [C.RETURN + .5, 58, 22, -62], [C.RETURN + 1.2, 55, 24, -58], [C.ASH_STANDS, 51, 22, -53], [C.ASH_DOWN, 49, 22, -51], [C.CINDER_FIRE, 50, 22, -52], [C.BLUE, 50, 22, -52], [C.PETRIFY, 51, 22, -53], [C.DAWN, 51, 22, -53]]);
  M.cinder = (t, out) => (t < C.RETURN - 2 ? cinderAttack : cinderClimax)(t, out);
  // where the two who fight on the plateau stand: Ash steps between Ember and Cinder, then is thrown into the rock
  M.EMBER_CLIMAX = V3(39, 16, -39); M.ASH_CLIMAX = V3(42.5, 16, -43); M.ASH_THROWN = V3(33, 16, -46);
  // HEART1: the parents meet nose to nose against the setting sun; the camera looks WEST at them from the east
  M.HEART1 = V3(-70, 26, 4); M.MEMORY = V3(22, 44, -80);   // the parents' ink heart flashes here in the silence before the blue fire (seen from the plateau)
  // HEART2 at dawn: Ember (left lobe as the camera sees it, looking east) and Ash (right lobe) trace a heart and meet at its top notch on HEART2
  M.HEART2 = V3(118, 24, 34); const H2u = V3(0, 0, 1), H2v = V3(0, 1, 0), H2S = .8;
  M.heart2 = (who, t, out) => { out = out || V3(); const t0 = C.FLY + 2.5, t1 = C.HEART2, u = clamp((t - t0) / (t1 - t0)), e = u * u * (3 - 2 * u), sgn = who === 'ember' ? -1 : 1;
    const s = PI - e * PI, hx = 16 * Math.pow(Math.sin(s), 3), hy = 13 * Math.cos(s) - 5 * Math.cos(2 * s) - 2 * Math.cos(3 * s) - Math.cos(4 * s);   // s = PI: bottom tip; s = 0: top notch
    out.copy(M.HEART2).addScaledVector(H2u, sgn * hx * H2S).addScaledVector(H2v, hy * H2S); if (t < t0) { const k = clamp((t - C.FLY) / (t0 - C.FLY)), e2 = k * k * (3 - 2 * k), a = V3(M.ASH_THROWN.x + 1.5 * sgn, M.ASH_THROWN.y, M.ASH_THROWN.z), b = V3(M.ASH_THROWN.x + 28, M.ASH_THROWN.y + 17, M.ASH_THROWN.z + 12 + 3 * sgn); out.lerpVectors(a, b, k * (.35 + .65 * k)); out.y = lerp(a.y, b.y, e2); } /* takeoff from the plateau; the cut at t0 finds them at the heart's tip over the sea */ return out; };
  // who the story is about at film time t (for lights, wind wakes and the default camera)
  const WHO = [[0, 'ink'], [10, 'pair'], [38, 'cinder'], [43.4, 'pair'], [56.2, 'nest'], [62.2, 'ember'], [72.2, 'ember'], [86.6, 'ash'], [99.1, 'ember'], [108.2, 'cinder'], [115.4, 'ember'], [124.5, 'ember']];
  function focus(t, out) { out = out || V3(); let w = WHO[0][1]; for (const q of WHO) if (t >= q[0]) w = q[1]; const a = actors[w]; if (a && a.at) return a.at(t, out); if (w === 'nest' || w === 'ink') return out.copy(M.NEST); return out.copy(M.NEST); }
  return { M, actor(n, o) { actors[n] = o; return o; }, get: n => actors[n], actors, focus };
})();
