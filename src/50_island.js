'use strict';
// ---- ISLAND: the whole set, a handmade miniature landscape ---------------------------------------------------------------------------------
// Sculpted plaster rock with painted strata, felt grass, paper flowers, chiselled stone blocks, black basalt columns, a lava lake of lit cellophane.
// Broad land = heightfield tiles (finer where the story is). Rock that must overhang = two surface-net sculptures: the NEST CRAG (sea stack,
// cliffs W+S, strata ledges, wave notch) and the CAVE HEADLAND (Ash's chamber, the arched mouth, the apron, the south sea cliffs, the LEDGE).
// API
//   Island.group                          everything
//   Island.ground(x, z, top)              walkable height. Under the cave hill = the cave floor unless top; plateau = live basalt column tops
//   Island.normal(x, z, out)              ground normal
//   Island.colliders                      [{name, c:V3, h:V3 half extents, yaw (local +x = (cos yaw, 0, -sin yaw)), t0, t1}]   Island.collide(p, r, t) pushes p out
//   Island.crag {c, r, top, nest, nestR, rim}   Island.caveMouth {p, dir, w, h}   Island.cave {in, floorY, r, ceil, seat, butts, pool}
//   Island.ledge {c, rocks:[{p, h}], pine}      Island.wall {a, b, crash:[s0,s1], keep}   Island.plateau {c, r, boulder, fissure:{c, dir, half}, open(t)}
//   Island.path [V3]  goat path crag top -> cave apron        Island.lava(t)  crater light level (pulses on 'lava', flares at ERUPT / BLAST / RETURN)
// Time: ash creeps over the crag top in LOSS, rain gloss in SHELTER and after PETRIFY, the wall breaks at WALL_CRASH, the keep falls and the
// fissure opens at RETURN, plateau cracks pulse on 'lava' and go dark + steam after PETRIFY. Every state is a pure function of film time.
const Island = (() => {
  const M = Stage.M, C = Score.CUE, group = new THREE.Group(); group.name = 'island';
  const smin = SD.smin, smax = SD.smax, n3 = NZ.n3, fbm = NZ.fbm, D2 = SD.D2, hyp = Math.hypot;
  const L = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }, mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  let T = 0;                                                     // film time, for the lantern gains
  const NEST = M.NEST, PLAT = M.PLATEAU, VX = M.VOLCANO.x, VZ = M.VOLCANO.z, VR = M.CRATER_R, RIM = M.VOLCANO.y, LAVA = M.LAVA_Y;
  const WA = M.WALL0, WB = M.WALL1, WD = V3(WB.x - WA.x, 0, WB.z - WA.z), WLEN = WD.length(); WD.normalize(); const WN = V3(-WD.z, 0, WD.x);
  const wS = (x, z) => (x - WA.x) * WD.x + (z - WA.z) * WD.z, wP = (x, z) => (x - WA.x) * WN.x + (z - WA.z) * WN.z;
  const CD = M.CAVE_DIR, CQ = V3(-CD.z, 0, CD.x), MO = M.CAVE, CI = M.CAVE_IN;
  const cA = (x, z) => (x - MO.x) * CD.x + (z - MO.z) * CD.z, cB = (x, z) => (x - MO.x) * CQ.x + (z - MO.z) * CQ.z;
  const FI = M.FISSURE, FD = V3(VX - FI.x, 0, VZ - FI.z).normalize(), FN = V3(-FD.z, 0, FD.x), FH = 6.5;          // fissure line toward the volcano
  const fU = (x, z) => (x - FI.x) * FD.x + (z - FI.z) * FD.z, fV = (x, z) => (x - FI.x) * FN.x + (z - FI.z) * FN.z;
  const segD = (x, z, ax, az, bx, bz) => { const ux = bx - ax, uz = bz - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)); return hyp(x - ax - ux * t, z - az - uz * t); };
  const FA = [FI.x - FD.x * (FH + 5), FI.z - FD.z * (FH + 5)], FB = [FI.x + FD.x * FH, FI.z + FD.z * FH];
  const fieldD = (x, z) => Math.min(hyp(x - PLAT.x, z - PLAT.z) - 20, segD(x, z, FA[0], FA[1], FB[0], FB[1]) - 4.5);     // < 0: flat basalt field at y 16
  const T_CRASH = C.WALL_CRASH, T_KEEP = C.RETURN + .12;
  const env = {                                                                                                     // the weather of the set, by film time
    ash: t => sm(C.SILENCE + .2, C.DAWN0 - .4, t) * (1 - sm(C.RAIN + 2, C.TRAIN + 2, t)),
    ashR: t => lerp(.5, 15, sm(C.SILENCE + .1, C.DAWN0 + 1, t)),
    wet: t => sm(C.RAIN - .3, C.RAIN + 2.4, t) * (1 - sm(C.TRAIN - 1.5, C.TRAIN + 3, t)) + sm(C.PETRIFY, C.PETRIFY + 1.6, t) * (1 - .75 * sm(C.FLY, C.SEAL, t)),
    lava: t => (t < C.ERUPT - 3 ? .5 : t < C.PETRIFY ? .95 : lerp(.95, .45, sm(C.PETRIFY, C.DAWN + 4, t))) * (1 + .55 * Score.env('lava', t, .45)) + 3 * pulse(t, C.ERUPT, .06, 2.2) + 4.5 * pulse(t, C.BLAST, .05, 2.6) + 2.5 * pulse(t, C.RETURN, .06, 1.8),
    glow: t => (t < C.ERUPT ? .22 : t < C.SILENCE ? .6 : t < C.RETURN - .4 ? .25 : 1) * (1 - sm(C.PETRIFY, C.PETRIFY + 1.4, t)) * (.6 + .7 * Score.env('lava', t, .5)) + .8 * pulse(t, C.RETURN, .05, 1.4),
    open: t => smoother(C.RETURN - .25, C.RETURN + .6, t),
    steam: t => sm(C.PETRIFY, C.PETRIFY + 1, t) * (1 - sm(C.DAWN + 5, C.DAWN + 11, t)) };

  // ---- the land: one height function ---------------------------------------------------------------------------------------------------------
  const landF = D2.SU(7, D2.seg(10, -6, 30, -26, 11), D2.circ(44, -47, 28), D2.circ(37, 14, 21), D2.seg(44, 30.6, 60, 31, 4.4), D2.seg(14, 7, 28, 24, 7), D2.circ(VX, VZ, 110), D2.seg(60, -12, 98, 2, 21));
  const NOTCH = [1.66, 2.62], angD = (a, b) => { let d = a - b; d -= TAU * Math.round(d / TAU); return d; };      // lava spills over the rim here
  function hVol(x, z) { const dx = x - VX, dz = z - VZ, r = hyp(dx, dz) + 1e-6; if (r > 131) return -40; const ca = dx / r, sa = dz / r, an = Math.atan2(dz, dx);
    let rim = RIM + 1.5 * n3(ca * 2.1, sa * 2.1, 4.1); for (const a of NOTCH) rim -= 3 * Math.exp(-Math.pow(angD(an, a) / .17, 2)); let h;
    if (r < VR) h = 64 + (rim - 64) * sm(9.4, VR, r); else if (r < 88) h = 16 + (rim - 16) * Math.pow((88 - r) / (88 - VR), 1.35); else h = 16 - (r - 88) * .55;
    return h + (NZ.ridged(ca * 7 + 3, sa * 7, r * .028, 3) - .42) * 5 * sm(VR + 1, VR + 10, r) * sm(92, 60, r) + 1.4 * n3(ca * 4, sa * 4, r * .06) * sm(VR, VR + 6, r); }
  const ridgeTop = keyedLin([[-13, 19.4], [-6, 18.3], [0, 17.0], [10, 16.5], [24, 16.1]]), PS0 = [9, 1.5], PS1 = [31, 27];
  function Hraw(x, z) {
    const inl = -(landF(x, z) + 2.2 * fbm(x * .035, .5, z * .035, 3)), nr = n3(x * .15, 1.1, z * .15);
    let h = -6.4 + 6.6 * sm(-14, 1, inl) + clamp(inl, 0, 30) * .1 + 4 * sm(3, 22, inl) * (.5 + .7 * n3(x * .04, 2.2, z * .04)) + .7 * fbm(x * .07, 3.3, z * .07, 2) * sm(-1, 5, inl);
    const s = wS(x, z), sc = clamp(s, -13, 24); h = smax(h, ridgeTop(sc) - 9 * sm(1.8, 15, hyp(s - sc, wP(x, z)) + 1.5 * nr), 3);       // the ridge the wall runs on
    h = smax(h, 16 - 8.5 * sm(0, 11, fieldD(x, z) + n3(x * .08, 5.5, z * .08)), 2.5);                                                   // the basalt plateau
    const ex = (x - 37) / 11.6, ez = (z - 15.6) / 11.2; h = smax(h, 20.4 + .5 * n3(x * .2, 1.7, z * .2) - 12.5 * sm(-.5, 6.5, (Math.sqrt(ex * ex + ez * ez) - 1) * 11.4 + 1.2 * nr), 2.5);   // the cave hill
    h = smax(h, 16.4 - 9 * sm(0, 8, segD(x, z, 46, 27.4, 60, 29.6) - 3.4), 2);                                                          // the ledge headland
    { const ux = PS1[0] - PS0[0], uz = PS1[1] - PS0[1], u = clamp(((x - PS0[0]) * ux + (z - PS0[1]) * uz) / (ux * ux + uz * uz)); h = smax(h, lerp(19.0, 8.8, u) - 13 * sm(2.5, 12, segD(x, z, PS0[0], PS0[1], PS1[0], PS1[1]) + 1.2 * nr), 2.5); }
    h = smax(h, hVol(x, z), 3);
    h = smin(h, -6.4 + (inl + 4.5) * 4.5, 1.2);                                                                                             // high land meets the sea in cliffs
    return Math.max(h, -6.4); }
  // the goat path: control points, heights derived from the land (monotone, <= 32 % grade), ends on the cave apron
  const PATH = [[6.6, .9], [9.6, 2.4], [12.3, 5.2], [13.2, 9.0], [16.6, 11.0], [20.8, 11.6], [23.6, 14.8], [22.8, 18.8], [25.8, 22.2], [29.2, 25.6], [32.8, 28.4], [36.9, 28.9]], PY = [];
  { const n = PATH.length, ln = [0]; for (let i = 1; i < n; i++) ln.push(hyp(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
    PY[0] = NEST.y; for (let i = 1; i < n; i++) PY[i] = clamp(Hraw(PATH[i][0], PATH[i][1]) + .1, PY[i - 1] - .32 * ln[i], PY[i - 1] - .05); PY[n - 1] = 8.05;
    for (let i = n - 2; i >= 0; i--) PY[i] = Math.min(PY[i], PY[i + 1] + .32 * ln[i + 1]); PY[0] = NEST.y; }
  const PQ = { d: 9, y: 0 };
  function pathQ(x, z) { PQ.d = 99; if (x < 3 || x > 41 || z < -3 || z > 33) return PQ; for (let i = 1; i < PATH.length; i++) { const a = PATH[i - 1], b = PATH[i], ux = b[0] - a[0], uz = b[1] - a[1], t = clamp(((x - a[0]) * ux + (z - a[1]) * uz) / (ux * ux + uz * uz)), d = hyp(x - a[0] - ux * t, z - a[1] - uz * t); if (d < PQ.d) { PQ.d = d; PQ.y = lerp(PY[i - 1], PY[i], t); } } return PQ; }
  function H(x, z) { let h = Hraw(x, z);
    const dB = Math.max(Math.abs(x - M.LEDGE.x) - 5, Math.abs(z - M.LEDGE.z) - 3); if (dB < .9) h = lerp(h, M.LEDGE.y + .03 * n3(x * 2, 0, z * 2), 1 - sm(0, .9, dB));
    const q = pathQ(x, z); if (q.d < 1.6) h = lerp(h, q.y - .03, 1 - sm(.55, 1.6, q.d));
    return h; }
  // cached heights for the sculpted pieces (bilinear)
  function cache(x0, z0, x1, z1, st) { const nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1, a = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) a[j * nx + i] = H(x0 + i * st, z0 + j * st);
    return (x, z) => { let u = (x - x0) / st, v = (z - z0) / st; u = clamp(u, 0, nx - 1.001); v = clamp(v, 0, nz - 1.001); const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * nx + i; return (a[k] * (1 - fu) + a[k + 1] * fu) * (1 - fv) + (a[k + nx] * (1 - fu) + a[k + nx + 1] * fu) * fv; }; }
  let Hc = H, Hk = H;
  const BOX_CRAG = [-14, -5.6, -14, 16, 21.4, 14], BOX_CAVE = [24, -5.6, 2.5, 62, 23.6, 41];

  // ---- the crag: a sea stack with strata ledges, joints and a wave-cut notch ------------------------------------------------------------------
  const cragTop = (x, z) => NEST.y + .12 * (1 - Math.min(1, (x * x + z * z) / 42));
  function fCrag(x, y, z) {
    const r = hyp(x - NEST.x, z - NEST.z) + 1e-6, land = (y - Hc(x, z)) * .7 - rocky(Hc, x, y, z); if (r > 15 && land > 3) return land;
    const ca = (x - NEST.x) / r, sa = (z - NEST.z) / r, n1 = n3(ca * 1.3 + 9, sa * 1.3, y * .045), n2 = n3(ca * 3.1, sa * 3.1 + 4, y * .11 + 2);
    const an = Math.atan2(sa, ca), n0 = n3(ca * .8 + 2, sa * .8, y * .02 + 7); let R = 7.1 + .07 * Math.max(0, 19.5 - y) + .03 * Math.max(0, 4 - y) ** 2 + 1.5 * n0 + .9 * n1 + .4 * n2 + .55 * Math.sin(an * 7 + 3 * n1) * sm(19.5, 16, y) + .6 * Math.max(0, ca * .7 - sa * .3);
    const st = (y + 2.2 * n1 + 40) / 1.9, fr = st - Math.floor(st); R += (.7 * (fr - .5) + .3 * sm(.84, .97, fr)) * sm(19.6, 18.6, y);
    R -= .6 * sm(-1.4, .2, y) * sm(2.4, .9, y);
    R -= .7 * Math.pow(Math.abs(Math.sin(an * 4.5 + n1 * 3)), 30) * sm(19.8, 18, y);
    const col = smax((r - R) * .8, y - (cragTop(x - NEST.x, z - NEST.z) + .03 * n2), .45);
    return smin(col, land, 1.0); }
  // ---- the cave headland: hill minus chamber minus arched mouth minus the apron gully in front ----------------------------------------------
  const rocky = (Hf, x, y, z) => { const st = sm(.75, 1.5, hyp(Hf(x + .5, z) - Hf(x - .5, z), Hf(x, z + .5) - Hf(x, z - .5))); if (st <= 0) return 0; const q = (y + 1.5 * n3(x * .1, 2, z * .1) + 40) / 1.7, fr = q - Math.floor(q); return st * (.6 * n3(x * .33, y * .33, z * .33) + .22 * n3(x * .95, y * .95 + 3, z * .95) + .32 * (fr - .5)); };
  const ellD = (dx, dy, dz, rx, ry, rz) => (Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry) + dz * dz / (rz * rz)) - 1) * Math.min(rx, ry, rz);
  const POOL = V3(40.4, 8, 12.4);
  const fb = (x, z) => .05 * n3(x * .7, 3.3, z * .7) - .07 * (1 - sm(0, .85, hyp(x - POOL.x, z - POOL.z)));
  function fCave(x, y, z) {
    const hill = (y - Hk(x, z)) * .72 - rocky(Hk, x, y, z); if (hill > 4) return hill;
    const n = .6 * n3(x * .3, y * .3, z * .3) + .22 * n3(x * .95 + 5, y * .95, z * .95), f0 = fb(x, z);
    let ch = smin(ellD(x - CI.x, y - 8.3, z - CI.z, 9.2, 7.2, 8.6), ellD(x - 32.2, y - 8.6, z - 12.4, 4.4, 4.4, 4.2), 1.6) - n * 1.1; ch = Math.max(ch, 8 + f0 - y);
    const a = cA(x, z), b = cB(x, z), arch = (Math.hypot(b / 4.15, Math.max(0, y - 9.6) / 4.4) - 1) * 4 - n * .9;
    const tun = Math.max(arch, -7 - a, a - 2.5, 8 + f0 - y), ap = Math.max(.25 - a + n * .9, Math.abs(b) - (4.6 + .3 * clamp(a, 0, 5)) + n * 1.1, 8.05 + f0 - y);
    return Math.max(hill, -ch, -tun, -ap); }
  const inCave = (x, z) => { const ex = (x - CI.x) / 9.0, ez = (z - CI.z) / 8.4; if (ex * ex + ez * ez < 1) return true; const a = cA(x, z); return a > -7 && a < .4 && Math.abs(cB(x, z)) < 3.9; };

  // ---- ground: what a foot stands on ----------------------------------------------------------------------------------------------------------
  const RH = .68, SQ3 = Math.sqrt(3), colMap = new Map(), TOPS = [];          // basalt columns by hex key; flat tops of props {x,z,hx,hz,c,s,top}
  const hexKey = (x, z) => { const px = x - PLAT.x, pz = z - PLAT.z; let q = (SQ3 / 3 * px - pz / 3) / RH, r = (2 / 3 * pz) / RH, s = -q - r; let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s); const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s); if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs; return rq * 1000 + rr; };
  let colTop = null;                                                         // live column tops (Float32Array), filled at build
  function ground(x, z, top) {
    if ((x - NEST.x) ** 2 + (z - NEST.z) ** 2 < 6.1 * 6.1) return cragTop(x - NEST.x, z - NEST.z);
    for (const p of TOPS) { const dx = x - p.x, dz = z - p.z, u = dx * p.c + dz * p.s, v = -dx * p.s + dz * p.c; if (Math.abs(u) < p.hx && Math.abs(v) < p.hz) return p.top; }
    if (x > 26 && x < 50 && z > 4 && z < 36) { if (!top && inCave(x, z)) return 8 + fb(x, z); const a = cA(x, z); if (a > .25 && Math.abs(cB(x, z)) < 4.6 + .3 * clamp(a, 0, 5)) return Math.min(H(x, z), 8.05 + fb(x, z)); }
    if (colTop && fieldD(x, z) < 5) { const k = colMap.get(hexKey(x, z)); if (k !== undefined) return colTop[k]; }
    return H(x, z); }
  function normal(x, z, out) { out = out || V3(); const e = .3; out.set(ground(x - e, z) - ground(x + e, z), 2 * e, ground(x, z - e) - ground(x, z + e)).normalize(); return out; }

  // ---- paint ----------------------------------------------------------------------------------------------------------------------------------
  const K = { g1: L('#86b85e'), g2: L('#5e9a4c'), g3: L('#a9c46d'), dry: L('#c9b276'), r1: L('#a89b8b'), r2: L('#bea883'), r3: L('#8f9298'), r4: L('#7a6f64'), r5: L('#c9bfae'), lich: L('#d6a44c'),
    sand: L('#e8d6a6'), wsand: L('#b8a07a'), sea: L('#4b6c64'), path: L('#b48f68'), earth: L('#8a6a4c'), bas: L('#2c2a29'), bas2: L('#433e3a'), ash: L('#7a746e'), ash2: L('#9a9188'), rust: L('#7e3f25'), cind: L('#3a1913'),
    cave: L('#8e8c88'), cave2: L('#777570'), caveF: L('#83807a'), soot: L('#2b2725') };
  function colAt(x, y, z, nx, ny, nz) {
    const nA = n3(x * .11, y * .11, z * .11), nB = n3(x * .45 + 3, y * .45, z * .45), band = Math.floor((y + 1.8 * nA + 60) / 1.65), hb = h1(band * 7.31 + 1.7);
    let c = hb < .28 ? K.r1 : hb < .5 ? K.r2 : hb < .72 ? K.r3 : hb < .9 ? K.r4 : K.r5; c = mulc(c, .88 + .3 * nB);
    if (ny > .3 && ny < .78 && nB > .16) c = mixc(c, K.lich, .45);
    const ledge = Math.max(Math.abs(x - M.LEDGE.x) - 5, Math.abs(z - M.LEDGE.z) - 3) < .3 ? .25 : 1, gw = sm(.7, .86, ny + .2 * nA) * sm(1.4, 2.6, y) * ledge;
    if (gw > 0) { let g = mixc(K.g1, K.g2, clamp(.5 + nA * 1.8)); g = mixc(g, K.g3, clamp(nB * 2.2)); g = mixc(g, K.dry, clamp((nA - .2) * 3) * .6); c = mixc(c, g, gw); }
    if (y < 2.4) { const sw = sm(.45, .8, ny) * sm(2.4, 1.0, y); if (sw > 0) c = mixc(c, y < .3 ? K.wsand : K.sand, sw * (.75 + .25 * nB)); }
    if (y < 0) c = mixc(c, K.sea, sm(-.2, -5, y) * .65);
    const pd = pathQ(x, z).d; if (pd < 1.1) c = mixc(c, mulc(K.path, .9 + .25 * nB), (1 - sm(.45, 1.1, pd)) * sm(.5, .8, ny));
    const nd = hyp(x - NEST.x, z - NEST.z); if (nd < 2.6 && y > 19) c = mixc(c, K.earth, (1 - sm(1.6, 2.6, nd)) * .7);
    const rv = hyp(x - VX, z - VZ);
    if (rv < 98) { let v = mixc(K.ash, K.ash2, clamp(.5 + nB * 1.5)); v = mixc(v, K.bas, sm(52, 26, rv + 7 * nA)); v = mixc(v, K.rust, sm(.15, .4, nA) * sm(44, 22, rv) * .75); v = mixc(v, K.cind, sm(VR + 1.5, VR - 2.5, rv)); c = mixc(c, v, sm(98, 74, rv) * (1 - gw * sm(66, 90, rv) * .8)); }
    const fd = fieldD(x, z); if (fd < 6) c = mixc(c, mixc(K.bas, K.bas2, clamp(.5 + nB * 1.5)), sm(6, 1, fd) * (1 - gw * .5));
    return c; }
  const SOOT = [[36.4, 15.2, 15.4, 3.0, 1], [32.4, 10.6, 12.6, 2.0, .6], [37.8, 8.0, 14.2, 1.1, 2.5]];   // x y z radius y-stretch: a hundred years of cigarettes
  function colCave(x, y, z, nx, ny, nz) {
    const a = cA(x, z); if (y > Hk(x, z) - .6 || a > .9 || !inCave(x, z) && a > -.5) return colAt(x, y, z, nx, ny, nz);
    const nB = n3(x * .5 + 3, y * .5, z * .5), nA = n3(x * .13, y * .13, z * .13); let c = mixc(K.cave, K.cave2, clamp(.5 + nB * 1.6)); if (ny > .7) c = mixc(c, K.caveF, .6);
    for (const s of SOOT) { const d = hyp(x - s[0], (y - s[1]) * s[4], z - s[2]); c = mixc(c, K.soot, (1 - sm(s[3] * .45, s[3], d + .35 * nA * s[3])) * .75); }
    return mulc(c, 1 - .26 * clamp(-a / 10)); }

  // ---- materials: the kit + the weather of the set (ash dust creeping from the nest, rain gloss outside the cave) + lava light -----------------
  const UD = { uDrip: { value: new THREE.Vector2(9, 0) } }, UW = { uIsA: { value: new THREE.Vector4(0, 0, 0, 0) } }, UL = { uIsL: { value: new THREE.Vector4(.5, .2, 0, 0) } };
  const WEATHER = { key: 'isWeather', uniforms: UW, fragPars: 'uniform vec4 uIsA;', color: /* glsl */`
    #ifdef USE_FOG
    { vec3 wup_ = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); float up_ = dot(normal, wup_);
      float ad_ = length(vWP.xz - vec2(${NEST.x.toFixed(2)}, ${NEST.z.toFixed(2)})) - uIsA.x + (nz.r - 0.5) * 2.4;
      float am_ = uIsA.y * smoothstep(0.6, -0.6, ad_) * smoothstep(-0.35, 0.45, up_) * smoothstep(13.0, 17.0, vWP.y);
      col = mix(col, vec3(0.33, 0.325, 0.318) * (0.82 + 0.4 * nz.g), am_ * 0.9); rgh = mix(rgh, 1.0, am_);
      vec2 cq_ = (vWP.xz - vec2(${CI.x.toFixed(2)}, ${CI.z.toFixed(2)})) / vec2(10.5, 10.0); float dry_ = (1.0 - smoothstep(0.9, 1.1, length(cq_))) * step(vWP.y, 16.5);
      float wm_ = uIsA.z * (1.0 - dry_) * (0.45 + 0.55 * smoothstep(-0.3, 0.6, up_));
      col *= 1.0 - 0.45 * wm_; rgh = mix(rgh, 0.14 + 0.2 * nz.r, wm_ * 0.9); }
    #endif` };
  const LAVAP = /* glsl */`uniform vec4 uIsL;
    float lvSeam(vec2 q){ float c = texture2D(tNz, q).b, c2 = texture2D(tNz, q * 2.3 + 0.17).b; return max(1.0 - smoothstep(0.0, 0.13, c), 0.55 * (1.0 - smoothstep(0.0, 0.08, c2))); }
    vec3 lvCol(float k){ return mix(vec3(1.6, 0.22, 0.03), vec3(4.2, 1.7, 0.35), k); }`;
  const CRATER = { key: 'isCrater', uniforms: UL, fragPars: 'uniform vec4 uIsL;', emissive: /* glsl */`
    #ifdef USE_FOG
    { float rv_ = length(vWP.xz - vec2(${VX.toFixed(1)}, ${VZ.toFixed(1)})); totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * uIsL.x * 0.45 * smoothstep(${(VR + 3).toFixed(1)}, ${(VR - 3).toFixed(1)}, rv_) * smoothstep(${(LAVA + 5).toFixed(1)}, ${(LAVA + .2).toFixed(1)}, vWP.y); }
    #endif` };
  const mats = {};
  function buildMats() {
    mats.land = Mat.hook(Mat.hook(Mat.make('plaster', { vcol: true, space: 'world', scale: .7, bump: .016 }), WEATHER), CRATER);
    mats.rock = Mat.hook(Mat.make('stone', { vcol: true, space: 'world', scale: .7, flat: true }), WEATHER);
    mats.block = Mat.hook(Mat.make('stone', { color: '#ffffff', scale: 1.4, bump: .008 }), WEATHER);
    mats.basalt = Mat.hook(Mat.make('stone', { color: '#ffffff', space: 'world', scale: .9, rough: .55 }), { key: 'isBasalt', uniforms: UL, fragPars: LAVAP, 
      emissive: /* glsl */`{ float cm_ = 1.0 - smoothstep(0.0, 0.11, texture2D(tNz, vOP.xz * 0.018 + 0.3).b); totalEmissiveRadiance += lvCol(0.4) * uIsL.y * cm_ * smoothstep(15.98, 15.5, vOP.y) * 0.8; }` });
    mats.bark = Mat.hook(Mat.make('bark', { vcol: true, scale: 3 }), WEATHER);
    mats.twig = Mat.hook(Mat.make('bark', { vcol: true, scale: 4, space: 'world', bump: .01 }), WEATHER);
    mats.feather = Mat.hook(Mat.make('feather', { vcol: true, double: true, wind: .9, windUV: 'y', space: 'world' }), WEATHER);
    mats.straw = Mat.hook(Mat.make('hair', { color: '#c9a86a' }), WEATHER);
    mats.pine = Mat.hook(Mat.make('felt', { vcol: true, wind: .35, space: 'world', scale: 6 }), WEATHER);
    mats.grass = Mat.hook(Mat.make('leaf', { vcol: true, wind: .7, windH: true, double: true, space: 'world', rough: .8 }), WEATHER);
    mats.fern = Mat.hook(Mat.make('leaf', { vcol: true, wind: .5, windH: true, double: true, space: 'world', rough: .75 }), WEATHER);
    mats.flower = Mat.hook(Mat.make('paper', { vcol: true, wind: .9, windH: true, double: true, space: 'world', trans: .45 }), WEATHER);
    mats.ink = Mat.make('plain', { color: '#17150f', rough: 1 });
    mats.butt = Mat.make('paper', { vcol: true, scale: 6 });
    mats.cave = Mat.make('plaster', { vcol: true, space: 'world', scale: 1.1 });
    mats.pool = Mat.hook(Mat.make('ceramic', { color: '#20262a', rough: .05, bump: .03, space: 'world' }), { key: 'isPool', uniforms: UD, fragPars: 'uniform vec2 uDrip;',
      color: `{ float r_ = length(op.xz - vec2(${POOL.x}, ${POOL.z})), a_ = uDrip.x; hgt += (sin(r_ * 46.0 - a_ * 13.0) * exp(-a_ * 1.6) + 0.5 * sin(r_ * 31.0 - a_ * 9.0 + 1.0) * exp(-a_ * 0.9)) * smoothstep(a_ * 0.42 + 0.06, a_ * 0.42 - 0.05, r_) * 2.0; }` });
    const lavaBase = Mat.make('stone', { color: '#1d110d', rough: .55, space: 'world', scale: .6, bump: .02 });
    mats.lake = Mat.hook(lavaBase, { key: 'isLake', uniforms: UL, fragPars: LAVAP, emissive: /* glsl */`{ vec2 d_ = vWP.xz - vec2(${VX.toFixed(1)}, ${VZ.toFixed(1)}); float a_ = uIsL.w * 0.012; vec2 q_ = mat2(cos(a_), -sin(a_), sin(a_), cos(a_)) * d_ * 0.045 + 0.02 * vec2(sin(uIsL.w * 0.3), cos(uIsL.w * 0.23));
      float s_ = lvSeam(q_), sh_ = smoothstep(9.5, 12.3, length(d_)); totalEmissiveRadiance += uIsL.x * (lvCol(s_) * s_ * (1.0 - 0.7 * sh_) + vec3(0.5, 0.08, 0.015) * (0.5 + 0.5 * texture2D(tNz, q_ * 0.6).r) * (1.0 - sh_)); }` });
    mats.river = Mat.hook(lavaBase, { key: 'isRiver', uniforms: UL, fragPars: LAVAP, emissive: /* glsl */`{ vec2 q_ = vec2(vTU.x * 0.55, vTU.y * 0.05 - uIsL.w * 0.04); float s_ = lvSeam(q_), core_ = 1.0 - abs(vTU.x - 0.5) * 2.0;
      totalEmissiveRadiance += uIsL.x * (lvCol(s_ * core_) * s_ * smoothstep(0.0, 0.45, core_) + vec3(0.7, 0.12, 0.02) * pow(core_, 2.0) * (0.6 + 0.4 * texture2D(tNz, q_ * 0.7).r)); }` });
    mats.magma = Mat.hook(lavaBase, { key: 'isMagma', uniforms: UL, fragPars: LAVAP + 'varying float vBand;', vertPars: 'uniform vec4 uIsL; varying float vBand;',
      vert: /* glsl */`{ float fv_ = (position.x - ${FI.x.toFixed(2)}) * ${FN.x.toFixed(4)} + (position.z - ${FI.z.toFixed(2)}) * ${FN.z.toFixed(4)}, fu_ = (position.x - ${FI.x.toFixed(2)}) * ${FD.x.toFixed(4)} + (position.z - ${FI.z.toFixed(2)}) * ${FD.z.toFixed(4)};
        vBand = smoothstep(2.2, 0.8, abs(fv_)) * smoothstep(${(FH + 1.5).toFixed(1)}, ${(FH - 1.5).toFixed(1)}, abs(fu_)); transformed.y -= uIsL.z * vBand * 6.0; }`,
      emissive: /* glsl */`{ float cm_ = 1.0 - smoothstep(0.0, 0.11, texture2D(tNz, vWP.xz * 0.018 + 0.3).b); float fl_ = 0.75 + 0.25 * texture2D(tNz, vWP.xz * 0.05 + vec2(0.0, uIsL.w * 0.02)).r;
        totalEmissiveRadiance += lvCol(0.5 + 0.5 * vBand * uIsL.z) * fl_ * (uIsL.y * cm_ * 1.6 + vBand * uIsL.z * (1.4 + 2.0 * uIsL.y)); }` });
  }

  // ---- growable buffer ----------------------------------------------------------------------------------------------------------------------
  function Buf() { const P = [], N = [], Cc = [], U = [], A = [], I = [];
    return { P, I, get n() { return P.length / 3; }, v(x, y, z, nx, ny, nz, c, a = 0, u = 0, w = 0) { P.push(x, y, z); N.push(nx, ny, nz); Cc.push(c[0], c[1], c[2]); A.push(a); U.push(u, w); return P.length / 3 - 1; },
      t(a, b, c) { I.push(a, b, c); }, q(a, b, c, d) { I.push(a, b, c, a, c, d); },
      geo(wind) { const g = new THREE.BufferGeometry(), f = (a, n) => new THREE.BufferAttribute(new Float32Array(a), n); g.setAttribute('position', f(P, 3)); g.setAttribute('normal', f(N, 3)); g.setAttribute('color', f(Cc, 3)); g.setAttribute('uv', f(U, 2)); if (wind) g.setAttribute('aWind', f(A, 1));
        g.setIndex(new THREE.BufferAttribute(P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1)); g.computeBoundingSphere(); return g; } }; }
  const refl = o => { o.traverse(q => q.layers.enable(1)); return o; };
  const STATS = { tris: {}, ms: {} }, tick = (n, t0) => { STATS.ms[n] = Math.round(performance.now() - t0); };

  // ---- heightfield tiles (finer where the story is). The land sinks under the sculpted pieces and under the basalt field ------------------------
  const TILES = [[-24, -12, 40, 52, .45], [40, -12, 104, 52, 1.0], [-24, -76, 40, -12, .6], [40, -76, 104, -12, .65], [104, -76, 136, 52, 1.6],
    [-24, -124, 24, -76, 1.8], [24, -124, 104, -76, 1.0], [104, -124, 206, -76, 2.0], [-24, -174, 66, -124, 1.6], [66, -174, 114, -124, .7], [114, -174, 206, -124, 1.8], [-24, -268, 206, -174, 2.4]];
  const inFis = (x, z) => Math.abs(fV(x, z)) < 2.3 && Math.abs(fU(x, z)) < FH + 1.8;
  function hideK(x, z) { let k = 0; for (const b of [BOX_CRAG, BOX_CAVE]) { const d = Math.min(x - b[0], b[3] - x, z - b[2], b[5] - z); if (d > 0) k = Math.max(k, .08 * sm(.05, .3, d) + 4 * sm(.9, 2.4, d)); } return k; }
  function Hmesh(x, z) { let h = H(x, z); if (h > -5.3) h -= hideK(x, z); if (fieldD(x, z) < -.4 && hVol(x, z) < 16.2) h = Math.min(h, inFis(x, z) ? 8.5 : 15.25); return h; }
  function tile(x0, z0, x1, z1, res) {
    const nx = Math.round((x1 - x0) / res), nz = Math.round((z1 - z0) / res), dx = (x1 - x0) / nx, dz = (z1 - z0) / nz, W = nx + 3, hs = new Float32Array(W * (nz + 3));
    for (let j = -1; j <= nz + 1; j++) for (let i = -1; i <= nx + 1; i++) hs[(j + 1) * W + i + 1] = Hmesh(x0 + i * dx, z0 + j * dz);
    let mx = -99; for (let i = 0; i < hs.length; i++) mx = Math.max(mx, hs[i]); if (mx < -6.3) return null;
    const B = Buf(), hh = (i, j) => hs[(j + 1) * W + i + 1], id = new Int32Array((nx + 1) * (nz + 1)), steepV = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + i * dx, z = z0 + j * dz, y = hh(i, j); let gx = (hh(i - 1, j) - hh(i + 1, j)) / (2 * dx), gz = (hh(i, j - 1) - hh(i, j + 1)) / (2 * dz); const l = hyp(gx, 1, gz), ny = 1 / l, st = sm(.8, .5, ny); let px = x, pz = z;
      if (st > 0 && y > -6) { const q = (y + 1.5 * n3(x * .1, 2, z * .1) + 40) / 1.7, d = st * (.9 * n3(x * .3, y * .3, z * .3) + .3 * n3(x * .9, y * .9 + 3, z * .9) + .45 * (q - Math.floor(q) - .5)), hl = hyp(gx, gz) + 1e-6; px += gx / hl * d; pz += gz / hl * d; steepV.push(B.n); }
      id[j * (nx + 1) + i] = B.v(px, y, pz, gx / l, ny, gz / l, colAt(x, y, z, gx / l, ny, gz / l)); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, c = d + 1; const ha = hh(i, j), hb = hh(i + 1, j), hc = hh(i + 1, j + 1), hd = hh(i, j + 1);
      if (ha < -6.3 && hb < -6.3 && hc < -6.3 && hd < -6.3) continue; if (Math.max(ha, hb, hc, hd) < Math.min(H(x0 + i * dx, z0 + j * dz), H(x0 + (i + 1) * dx, z0 + (j + 1) * dz)) - 3.5) continue;   // hidden under a sculpture
      if (Math.max(fieldD(x0 + i * dx, z0 + j * dz), fieldD(x0 + (i + 1) * dx, z0 + (j + 1) * dz), fieldD(x0 + (i + 1) * dx, z0 + j * dz), fieldD(x0 + i * dx, z0 + (j + 1) * dz)) < -.6 && Math.max(ha, hb, hc, hd) < 15.3) continue;   // under the basalt
      B.I.push(id[a], id[d], id[c], id[a], id[c], id[b]); }
    const skirt = (i0, j0, di, dj, n) => { for (let k = 0; k < n; k++) { const i = i0 + di * k, j = j0 + dj * k, i2 = i + di, j2 = j + dj, a = id[j * (nx + 1) + i], b = id[j2 * (nx + 1) + i2], P = B.P;
      const p = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], q = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]; if (p[1] < -6.2 && q[1] < -6.2) continue; const c = K.r4, a2 = B.v(p[0], p[1] - 1.5, p[2], 0, 1, 0, c), b2 = B.v(q[0], q[1] - 1.5, q[2], 0, 1, 0, c); B.I.push(a, b, b2, a, b2, a2, a, b2, b, a, a2, b2); } };
    skirt(0, 0, 1, 0, nx); skirt(0, nz, 1, 0, nx); skirt(0, 0, 0, 1, nz); skirt(nx, 0, 0, 1, nz);
    const g = B.geo(); if (steepV.length) { const N = g.attributes.normal, keep = N.array.slice(); g.computeVertexNormals(); const set = new Uint8Array(N.count); for (const v of steepV) set[v] = 1; for (let v = 0; v < N.count; v++) if (!set[v]) N.setXYZ(v, keep[v * 3], keep[v * 3 + 1], keep[v * 3 + 2]); }
    const m = Mat.mesh(g, mats.land); m.name = 'island-tile'; return m; }
  // ---- surface-net sculptures --------------------------------------------------------------------------------------------------------------
  function sculpt(f, bb, h, colFn) { const n = Math.round(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / h), r = SD.mesh(f, bb, n), nv = r.pos.length / 3, col = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { const c = colFn(r.pos[i * 3], r.pos[i * 3 + 1], r.pos[i * 3 + 2], r.nor[i * 3], r.nor[i * 3 + 1], r.nor[i * 3 + 2]); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setIndex(new THREE.BufferAttribute(r.idx, 1)); g.computeBoundingSphere(); return g; }
  // project a point onto an SDF surface (Newton), gradient into out
  function onSurf(f, p, nrm) { for (let it = 0; it < 4; it++) { const e = .03, d = f(p.x, p.y, p.z); nrm.set(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).normalize(); p.addScaledVector(nrm, -d); } return p; }

  // ---- rock pieces (faceted, hand-cut) -------------------------------------------------------------------------------------------------------
  function rockGeo(seed, flat = .62) { const g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = .78 + .34 * (n3(x * 1.3 + seed, y * 1.3, z * 1.3) + .5) * .9; x *= k; y *= k; z *= k; if (y < 0) y *= flat; P.setXYZ(i, x, y, z); }
    g.computeVertexNormals(); return Geo.idx(g); }
  function flatRock(seed, w, h, d) { const g = new THREE.IcosahedronGeometry(1, 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = .84 + .3 * (n3(x * 1.6 + seed, y * 1.6, z * 1.6) + .5) * .85; x *= k; y *= k; z *= k; y = y > .45 ? .45 + (y - .45) * .1 : Math.max(y, -.6); P.setXYZ(i, x * w / 2, (y + .6) / 1.1 * h, z * d / 2); }
    g.computeVertexNormals(); return Geo.idx(g); }
  // ---- the cave: drawn cracks, stalactites, the seat, the drip pool, the cigarette butts --------------------------------------------------------
  const cave = { seat: V3(M.ASH_SEAT.x, 8.33, M.ASH_SEAT.z), butts: V3(38.2, 8, 15.3), pool: POOL.clone(), floorY: 8, r: 9, ceil: 15.5, in: CI.clone() };
  function buildCave(out) {
    const R = rng(707), B = Buf(), p = V3(), nr = V3(), d = V3(), s = V3(), tmp = V3(), inner = (x, y, z) => -fCave(x, y, z);   // > 0 inside the rock
    const ink = [.02, .02, .02];
    const stroke = (pts, w0) => { const n = pts.length; if (n < 3) return; let base = -1; for (let i = 0; i < n; i++) { const q = pts[i], w = w0 * (1 - Math.pow(i / (n - 1), 1.6)) * (i === 0 ? .5 : 1) + .004;
        d.subVectors(pts[Math.min(n - 1, i + 1)][0], pts[Math.max(0, i - 1)][0]).normalize(); s.crossVectors(q[1], d).normalize().multiplyScalar(w); tmp.copy(q[0]).addScaledVector(q[1], .014);
        const a = B.v(tmp.x + s.x, tmp.y + s.y, tmp.z + s.z, q[1].x, q[1].y, q[1].z, ink), b = B.v(tmp.x - s.x, tmp.y - s.y, tmp.z - s.z, q[1].x, q[1].y, q[1].z, ink); if (base >= 0) B.I.push(base, base + 1, b, base, b, a); base = a; } };
    const walk = (start, dir0, steps, w0, depth) => { const pts = []; p.copy(start); d.copy(dir0);
      for (let i = 0; i < steps; i++) { onSurf(fCave, p, nr); if (p.y < 7.9 || p.y > 15.8 || !inCave(p.x, p.z) && cA(p.x, p.z) > .2) break; pts.push([p.clone(), nr.clone()]);
        d.addScaledVector(nr, -d.dot(nr)); d.applyAxisAngle(nr, (R() - .5) * 1.1).normalize(); if (depth < 1 && R() < .14) walk(p.clone(), d.clone().applyAxisAngle(nr, (R() < .5 ? 1 : -1) * (.6 + R() * .5)), 4 + R() * 6 | 0, w0 * .6, depth + 1);
        p.addScaledVector(d, .2 + R() * .14); }
      stroke(pts, w0); };
    for (let k = 0; k < 60; k++) { const th = R() * TAU, el = (R() - .35) * 1.2; d.set(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)); p.set(CI.x, 11, CI.z);
      let hit = false; for (let i = 0; i < 80; i++) { p.addScaledVector(d, .15); if (inner(p.x, p.y, p.z) > 0) { hit = true; break; } } if (!hit) continue; const st = p.clone();
      const up = Math.abs(nr.set(0, 1, 0).y) ; d.set(R() - .5, R() < .7 ? -(.5 + R()) : (R() - .5), R() - .5).normalize(); walk(st, d.clone(), 9 + R() * 16 | 0, .02 + R() * .018, 0); }
    for (let k = 0; k < 26; k++) { const a = R() * TAU, r = 1 + R() * 3.4; p.set(cave.seat.x + Math.cos(a) * r, 8.2, cave.seat.z + Math.sin(a) * r); if (!inCave(p.x, p.z)) continue;   // floor scratches, like the drawing
      p.y = 8 + fb(p.x, p.z); const pts = [], dd = V3(Math.cos(a + 1.4 + R()), 0, Math.sin(a + 1.4 + R())); for (let i = 0; i < 3 + (R() * 3 | 0); i++) { pts.push([p.clone(), V3(0, 1, 0)]); p.addScaledVector(dd, .08 + R() * .06); p.y = 8 + fb(p.x, p.z); dd.applyAxisAngle(V3(0, 1, 0), (R() - .5) * .7); } stroke(pts, .012 + R() * .01); }
    const ink_ = Mat.mesh(B.geo(), mats.ink, { cast: false }); ink_.name = 'island-cave-ink'; out.push(ink_);
    // stalactites, the seat slab, the pool rim stones
    const parts = [], stal = Geo.lathe([[.95, .4], [1, 0], [.78, -.25], [.46, -.6], [.2, -.88], [.05, -1]], 8);
    for (let k = 0; k < 40 && parts.length < 30; k++) { const a = R() * TAU, r = Math.sqrt(R()) * 7.4, x = CI.x + Math.cos(a) * r, z = CI.z + Math.sin(a) * r * .9; let y = 9.5; while (y < 16.5 && inner(x, y, z) < 0) y += .05; if (y > 15.8 || y < 11) continue;
      const near = hyp(x - POOL.x, z - POOL.z) < 1.4, Ls = near ? .9 + R() * .6 : .25 + R() * 1.1, rs = .07 + Ls * .12 * (.7 + R() * .6); if (y - Ls < 11.6 && hyp(x - cave.seat.x, z - cave.seat.z) < 2.4) continue;
      parts.push([stal, M4(x, y + .1, z, (R() - .5) * .15, R() * 6, (R() - .5) * .15, rs, Ls, rs), mixc(K.cave, [1, 1, 1], .1 + R() * .15)]); }
    for (let k = 0; k < 3; k++) { const x = POOL.x + (R() - .5) * .5, z = POOL.z + (R() - .5) * .5; let y = 9.5; while (y < 16.5 && inner(x, y, z) < 0) y += .05; if (y < 15.8) parts.push([stal, M4(x, y + .1, z, 0, R() * 6, 0, .1, .9 + R() * .5, .1), K.caveF]); }
    const slab = flatRock(5, 2.5, .36, 1.9);
    const yaw = Math.atan2(CD.x, CD.z); parts.push([Geo.paint(slab, (x, y, z, nx, ny) => mulc(L('#8f8c86'), .85 + .2 * ny)), M4(cave.seat.x, 7.96, cave.seat.z, 0, yaw, 0)]);
    TOPS.push({ x: cave.seat.x, z: cave.seat.z, hx: 1.05, hz: .78, c: Math.cos(yaw), s: Math.sin(yaw), top: cave.seat.y });
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + R() * .3; parts.push([rockGeo(k), M4(POOL.x + Math.cos(a) * .82, 7.98, POOL.z + Math.sin(a) * .82, 0, R() * 6, 0, .12 + R() * .08, .07, .1 + R() * .08), mixc(K.cave2, K.soot, .2)]); }
    const pm = Mat.mesh(Geo.merge(parts), mats.cave); pm.name = 'island-cave-props'; out.push(pm);
    const pool = Mat.mesh(Geo.at(new THREE.CircleGeometry(.8, 28).rotateX(-PI / 2), POOL.x, 7.985, POOL.z), mats.pool, { cast: false }); pool.name = 'island-pool'; out.push(pool); cave.poolMesh = pool;
    // the butts: paper, tan filter, burnt ends; crushed into a pile beside the seat
    const bg = Geo.paint(Geo.tube([[0, 0, 0], [.06, .006, 0], [.11, -.004, .012], [.16, 0, .02]], [.021, .013], 7), (x, y, z) => x < .055 ? L('#d7a05a') : x > .145 ? L('#3b3431') : L('#f2efe6'));
    const NB = 64, bm = Mat.inst(bg, mats.butt, NB), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V3();
    for (let i = 0; i < NB; i++) { const pile = i < 50, a = R() * TAU, r = pile ? Math.sqrt(R()) * .36 : .5 + R() * 1.6, x = cave.butts.x + Math.cos(a) * r, z = cave.butts.z + Math.sin(a) * r, hgt = pile ? .16 * (1 - r / .4) * R() : 0;
      e.set((R() - .5) * (pile ? 1.2 : .3), R() * TAU, (R() - .5) * (pile ? 1.2 : .3)); q.setFromEuler(e); sc.set(.8 + R() * .4, 1, 1); mm.compose(V3(x, 8 + fb(x, z) + .014 + hgt, z), q, sc); bm.setMatrixAt(i, mm); }
    bm.computeBoundingSphere(); bm.frustumCulled = true; bm.name = 'island-butts'; out.push(bm);
  }

  // ---- the nest: woven twigs, a ring of stones, a straw lining, down feathers caught everywhere --------------------------------------------------
  const nest = { c: V3(NEST.x, cragTop(0, 0), NEST.z), r: 1.6, rim: .4 };
  function buildNest(out) {
    const R = rng(31), c = nest.c, tw = [], st = [], fe = Buf(), browns = ['#6f5a47', '#8a7560', '#57483b', '#9a8f80', '#7b6a55'].map(L);
    for (let i = 0; i < 280; i++) { const floor = i < 50, th = R() * TAU, rr = floor ? Math.sqrt(R()) * .95 : .92 + Math.pow(R(), .8) * .62, prof = floor ? .02 + R() * .05 : .04 + .36 * Math.sin(clamp((rr - .9) / .7) * PI) * (.55 + .45 * R());
      const dir = th + PI / 2 + (R() - .5) * (floor ? 3 : 1.1), len = .3 + R() * (floor ? .4 : .5) + (i % 37 === 0 ? .5 : 0), tilt = (R() - .5) * .5, cx = c.x + Math.cos(th) * rr, cz = c.z + Math.sin(th) * rr, cy = c.y + prof;
      const ux = Math.cos(dir) * len / 2, uz = Math.sin(dir) * len / 2, uy = Math.sin(tilt) * len / 2, bx = (R() - .5) * .08, by = (R() - .5) * .06;
      tw.push([Geo.tube([[cx - ux, cy - uy, cz - uz], [cx + bx, cy + by, cz], [cx + ux, cy + uy, cz + uz]], [.012 + R() * .013, .01 + R() * .01], 5, { smooth: 3 }), null, browns[R() * 5 | 0]]); }
    for (let i = 0; i < 18; i++) { const th = R() * TAU, rr = 1.55 + R() * .3, s = .09 + R() * .12; st.push([rockGeo(i + 40, .5), M4(c.x + Math.cos(th) * rr, c.y + s * .25, c.z + Math.sin(th) * rr, 0, R() * 6, 0, s * 1.2, s * .8, s), mixc(K.r3, K.r5, R())]); }
    const tm = Mat.mesh(Geo.merge(tw), mats.twig); tm.name = 'island-nest-twigs'; out.push(tm);
    const sm_ = Mat.mesh(Geo.merge(st), mats.rock); sm_.name = 'island-nest-stones'; out.push(sm_);
    const lin = Mat.mesh(Geo.at(Geo.lathe([[0, .035], [.45, .045], [.85, .08], [1.05, .16], [1.12, .1]], 28), c.x, c.y, c.z), mats.straw, { cast: false }); lin.name = 'island-nest-lining'; out.push(lin);
    const fcol = ['#fbf8f2', '#f6f0f8', '#efe6f2', '#fbeef2', '#f4efe6'].map(L);
    for (let i = 0; i < 70; i++) { const inBowl = i < 46, th = R() * TAU, rr = inBowl ? Math.sqrt(R()) * .95 : 1.0 + R() * .7, y = c.y + (inBowl ? .06 + .05 * rr : .1 + R() * .3), l = .045 + R() * .05, w = l * .5, ang = R() * TAU, lift = inBowl ? .15 + R() * .3 : .5 + R() * .9, col = fcol[R() * 5 | 0];
      const ox = c.x + Math.cos(th) * rr, oz = c.z + Math.sin(th) * rr, dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx, base = fe.n;
      for (let k = 0; k <= 3; k++) { const u = k / 3, ww = w * Math.sin(.25 + u * 2.6) * (k === 3 ? .2 : 1), cy = y + Math.sin(lift) * l * u + .02 * u * u, cx = ox + dx * l * u * Math.cos(lift), cz = oz + dz * l * u * Math.cos(lift);
        fe.v(cx + px * ww, cy, cz + pz * ww, 0, 1, 0, col, 0, 0, u); fe.v(cx - px * ww, cy + .004, cz - pz * ww, 0, 1, 0, col, 0, 1, u); if (k) fe.q(base + k * 2 - 2, base + k * 2, base + k * 2 + 1, base + k * 2 - 1); } }
    const fg = fe.geo(); fg.computeVertexNormals(); const fm = Mat.mesh(fg, mats.feather, { cast: false }); fm.name = 'island-nest-down'; out.push(fm);
  }

  // ---- the plateau: a causeway of black basalt columns over glowing seams; the boulder; the fissure that opens at RETURN; steam after PETRIFY ----
  const plateau = { c: PLAT.clone(), r: M.PLATEAU_R, boulder: M.BOULDER.clone(), fissure: { c: FI.clone(), dir: FD.clone(), half: FH }, open: env.open };
  const fis = { idx: [], base: [], u: [], v: [], k: [], state: -1 }, crackPts = [];
  function hexGeo() { const B = Buf(), w = [1, 1, 1], P = []; for (let k = 0; k < 6; k++) { const a = PI / 2 + k * PI / 3; P.push([Math.cos(a), Math.sin(a)]); }
    const top = P.map(p => B.v(p[0] * .87, 0, p[1] * .87, 0, 1, 0, w)); B.t(top[0], top[2], top[1]); B.t(top[0], top[3], top[2]); B.t(top[0], top[4], top[3]); B.t(top[0], top[5], top[4]);
    for (let k = 0; k < 6; k++) { const a = P[k], b = P[(k + 1) % 6], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = hyp(mx, mz), cn = [mx / l * .6, .8, mz / l * .6];
      const i0 = B.v(a[0] * .87, 0, a[1] * .87, cn[0], cn[1], cn[2], w), i1 = B.v(b[0] * .87, 0, b[1] * .87, cn[0], cn[1], cn[2], w), o0 = B.v(a[0], -.08, a[1], cn[0], cn[1], cn[2], w), o1 = B.v(b[0], -.08, b[1], cn[0], cn[1], cn[2], w); B.I.push(i0, o0, o1, i0, o1, i1);
      const s0 = B.v(a[0], -.08, a[1], mx / l, 0, mz / l, w), s1 = B.v(b[0], -.08, b[1], mx / l, 0, mz / l, w), s2 = B.v(a[0], -1, a[1], mx / l, 0, mz / l, w), s3 = B.v(b[0], -1, b[1], mx / l, 0, mz / l, w); B.I.push(s0, s2, s3, s0, s3, s1); }
    return B.geo(); }
  const mtx = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler(), va = V3(), vb = V3(), vs = V3(), YUP = V3(0, 1, 0);
  function buildPlateau(out) {
    const R = rng(4242), list = [], bas = ['#3b3836', '#47423f', '#33302d', '#504943', '#3f3a37', '#5a524a'].map(hex);
    for (let r = -36; r <= 36; r++) for (let q = -44; q <= 44; q++) { const x = PLAT.x + RH * SQ3 * (q + r / 2), z = PLAT.z + RH * 1.5 * r, fd = fieldD(x, z); if (fd > 4.6) continue;
      const j = R(), hT = H(x, z), hv = hVol(x, z); let top;
      if (fd < 0) top = 16 + .05 * (j - .5) + .03 * n3(x * .7, 9, z * .7); else { top = Math.min(16, hT + .05 + .35 * j); top = 16 - Math.round((16 - top) / .32) * .32 + .04 * (j - .5); }
      if (hv > top + .15 || top < hT - .25) continue; const bot = Math.min(top - 1.3, hT - 1.0, 14.7); list.push({ x, z, top, bot, key: q * 1000 + r, j, c: bas[R() * bas.length | 0], tx: (R() - .5) * .03, tz: (R() - .5) * .03 }); }
    const N = list.length, im = Mat.inst(hexGeo(), mats.basalt, N); colTop = new Float32Array(N);
    list.forEach((o, i) => { const rad = RH * (.93 + .03 * o.j); eu.set(o.tx, 0, o.tz); qa.setFromEuler(eu); mtx.compose(va.set(o.x, o.top, o.z), qa, vs.set(rad, o.top - o.bot, rad)); im.setMatrixAt(i, mtx); im.setColorAt(i, o.c); colMap.set(o.key, i); colTop[i] = o.top;
      const u = fU(o.x, o.z), v = fV(o.x, o.z); if (Math.abs(v) < 3.6 && Math.abs(u) < FH + 1.5) { fis.idx.push(i); fis.base.push([o.x, o.top, o.z, rad, o.top - o.bot, o.tx, o.tz]); fis.u.push(u); fis.v.push(v); fis.k.push(R()); } });
    im.computeBoundingSphere(); im.frustumCulled = true; im.name = 'island-basalt'; plateau.cols = im; out.push(im);
    // magma sheet under the seams (and the trench that drops open along the fissure)
    const B = Buf(), w = [1, 1, 1], g0 = [PLAT.x - 22, PLAT.z - 22], gw = 48, id = new Int32Array((gw + 1) * (gw + 1)).fill(-1), Y = 15.55;
    const ok = (x, z) => fieldD(x, z) < .2 && hVol(x, z) < 16.2;
    for (let j = 0; j <= gw; j++) for (let i = 0; i <= gw; i++) { const x = g0[0] + i, z = g0[1] + j; if (ok(x, z)) id[j * (gw + 1) + i] = B.v(x, Y, z, 0, 1, 0, w); }
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) { const a = id[j * (gw + 1) + i], b = id[j * (gw + 1) + i + 1], d = id[(j + 1) * (gw + 1) + i], c = id[(j + 1) * (gw + 1) + i + 1]; const xm = g0[0] + i + .5, zm = g0[1] + j + .5;
      if (a < 0 || b < 0 || c < 0 || d < 0 || (Math.abs(fV(xm, zm)) < 2.3 && Math.abs(fU(xm, zm)) < FH + 2)) continue; B.I.push(a, d, c, a, c, b); }
    const nu = Math.round((FH + 2.5) * 2 / .25), nv = 24, t0 = B.n; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = -FH - 2.5 + i * .25, v = -3 + j * .25; B.v(FI.x + FD.x * u + FN.x * v, Y - .02, FI.z + FD.z * u + FN.z * v, 0, 1, 0, w); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = t0 + j * (nu + 1) + i, b = a + 1, d = a + nu + 1, c = d + 1; B.I.push(a, d, c, a, c, b); }
    const sheet = Mat.mesh(B.geo(), mats.magma, { cast: false }); sheet.geometry.computeVertexNormals(); sheet.name = 'island-magma'; out.push(sheet);
    // the boulder Ember hides behind (2 m), a few loose slabs
    const bp = [[Geo.paint(rockGeo(9, .7), mixc(K.bas, K.bas2, .5)), M4(M.BOULDER.x, 16 + .82, M.BOULDER.z, .1, .7, -.05, 1.3, 1.2, 1.12)]];
    for (let k = 0; k < 14; k++) { const a = R() * TAU, r = 6 + R() * 14, x = PLAT.x + Math.cos(a) * r, z = PLAT.z + Math.sin(a) * r; if (hyp(x - M.EMBER_CLIMAX.x, z - M.EMBER_CLIMAX.z) < 2 || hyp(x - M.ASH_CLIMAX.x, z - M.ASH_CLIMAX.z) < 3 || hyp(x - M.ASH_THROWN.x, z - M.ASH_THROWN.z) < 3.5 || Math.abs(wP(x, z)) < 2.2 || inFis(x, z)) continue;
      bp.push([Geo.paint(Geo.box(1.1 + R(), .18 + R() * .15, .8 + R() * .5, .05, 1), mixc(K.bas, K.bas2, R())), M4(x, 16.1, z, (R() - .5) * .2, R() * 6, (R() - .5) * .2)]); }
    const bm = Mat.mesh(Geo.merge(bp), mats.rock); bm.name = 'island-boulder'; out.push(bm);
    // glowing seams light the set: lanterns on crack points (same crack field the shader draws)
    const D = LU.tNz.value.image.data, cr = (x, z) => { let u = fract(x * .018 + .3), v = fract(z * .018 + .3); return D[(((v * 256) | 0) * 256 + ((u * 256) | 0)) * 4 + 2] / 255; };
    for (let k = 0; k < 900 && crackPts.length < 22; k++) { const a = R() * TAU, r = Math.sqrt(R()) * 19, x = PLAT.x + Math.cos(a) * r, z = PLAT.z + Math.sin(a) * r; if (cr(x, z) > .05 || crackPts.some(p => hyp(p[0] - x, p[1] - z) < 5.5)) continue; crackPts.push([x, z]); }
    crackPts.forEach(p => Lan.add({ x: p[0], y: 16.4, z: p[1], r: 4.8, color: [1, .38, .1], gain: () => 1.3 * env.glow(T) }));
    for (let k = -1; k <= 1; k++) Lan.add({ x: FI.x + FD.x * k * 4.5, y: 15, z: FI.z + FD.z * k * 4.5, r: 8, color: [1, .45, .12], gain: () => 3.2 * env.open(T) * (.6 + .4 * env.glow(T)) });
    // steam rising from the dead seams
    const NS = 72, sg = new THREE.InstancedBufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    const SA = new Float32Array(NS * 4); for (let i = 0; i < NS; i++) { const p = i < 12 ? [FI.x + FD.x * (R() - .5) * 2 * FH, FI.z + FD.z * (R() - .5) * 2 * FH] : crackPts[i % crackPts.length]; SA.set([p[0] + (R() - .5) * 3, 16 + R() * .2, p[1] + (R() - .5) * 3, R()], i * 4); }
    sg.setAttribute('aP', new THREE.InstancedBufferAttribute(SA, 4)); sg.instanceCount = NS;
    plateau.steamU = { uT: { value: 0 }, uAmt: { value: 0 }, uPrint: LU.uPrint, uCol: { value: V3(.82, .82, .84) } };
    const steam = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: plateau.steamU, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */`attribute vec4 aP; uniform float uT, uAmt; varying vec2 vQ; varying float vA; void main(){ float life = fract(uT / 2.8 + aP.w); vec3 c = aP.xyz + vec3(sin(aP.w * 40.0 + uT * 0.7) * 0.4 * life, life * 3.2, cos(aP.w * 31.0 + uT * 0.5) * 0.4 * life);
        vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * (0.3 + 1.5 * life); gl_Position = projectionMatrix * mv; vQ = position.xy; vA = sin(life * 3.14159) * uAmt; }`,
      fragmentShader: /* glsl */`uniform vec3 uCol; uniform float uPrint; varying vec2 vQ; varying float vA; void main(){ float r = dot(vQ, vQ); float a = smoothstep(1.0, 0.05, r) * vA * 0.32 * (1.0 - uPrint); if (a < 0.003) discard; gl_FragColor = vec4(uCol, a); }` }));
    steam.frustumCulled = false; steam.renderOrder = 5; steam.name = 'island-steam'; steam.visible = false; plateau.steam = steam; out.push(steam);
  }
  function fissureUpdate(t) { const o = env.open(t), st = o <= 0 ? 0 : o >= 1 && t > C.RETURN + 2 ? 2 : 1; if (st === fis.state && st !== 1) return; fis.state = st; const im = plateau.cols;
    for (let n = 0; n < fis.idx.length; n++) { const b = fis.base[n], u = fis.u[n], v = fis.v[n], k = fis.k[n], ol = smoother(0, 1, clamp((o * 1.5) - Math.abs(u) / FH * .5)); let dy = 0, tilt = 0, lift = 0;
      if (Math.abs(v) < 1.35) { dy = -(4 + 4 * k) * ol; tilt = -Math.sign(v || 1) * (.3 + .5 * k) * ol; } else { const f = 1 - (Math.abs(v) - 1.35) / 2.25; tilt = Math.sign(v) * .22 * f * ol; lift = .28 * f * ol * (.6 + .4 * k); }
      qa.setFromAxisAngle(FD, tilt); eu.set(b[5], 0, b[6]); qb.setFromEuler(eu); qa.multiply(qb); mtx.compose(va.set(b[0] + FN.x * Math.sign(v) * Math.abs(tilt) * .4, b[1] + dy + lift, b[2] + FN.z * Math.sign(v) * Math.abs(tilt) * .4), qa, vs.set(b[3], b[4], b[3])); im.setMatrixAt(fis.idx[n], mtx); colTop[fis.idx[n]] = b[1] + dy + lift; }
    im.instanceMatrix.needsUpdate = true; }

  // ---- the ruined fortress wall along the ridge: carved blocks, battlements, broken towers, arrow slits ------------------------------------------
  //      set 0 stands all film; set 1 (s 23..44) bursts at WALL_CRASH where Cinder hits it; set 2 (s 44..end + the keep at WALL1) falls at RETURN
  function blockGeo() { const B = Buf(), a = .43, w = [1, 1, 1], pil = .035, tri = (p, q, r) => { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * (p[0] + q[0] + r[0]) + ny * (p[1] + q[1] + r[1]) + nz * (p[2] + q[2] + r[2]) < 0) { const t = q; q = r; r = t; nx = -nx; ny = -ny; nz = -nz; } const l = hyp(nx, ny, nz); B.t(B.v(...p, nx / l, ny / l, nz / l, w), B.v(...q, nx / l, ny / l, nz / l, w), B.v(...r, nx / l, ny / l, nz / l, w)); };
    const F = (ax, s, u, v) => { const p = [0, 0, 0]; p[ax] = s; p[(ax + 1) % 3] = u; p[(ax + 2) % 3] = v; return p; };
    for (let ax = 0; ax < 3; ax++) for (const s of [-.5, .5]) { const c = F(ax, s * (1 + pil * 2), 0, 0), q = [F(ax, s, -a, -a), F(ax, s, a, -a), F(ax, s, a, a), F(ax, s, -a, a)]; tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3]); }
    for (let ax = 0; ax < 3; ax++) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) { const b = (ax + 1) % 3, e = (ax + 2) % 3, P = (sa, sb, t) => { const p = [0, 0, 0]; p[ax] = t; p[b] = sa; p[e] = sb; return p; };
      const p0 = P(s1 * .5, s2 * a, -a), p1 = P(s1 * .5, s2 * a, a), p2 = P(s1 * a, s2 * .5, a), p3 = P(s1 * a, s2 * .5, -a); tri(p0, p1, p2); tri(p0, p2, p3); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri([sx * .5, sy * a, sz * a], [sx * a, sy * .5, sz * a], [sx * a, sy * a, sz * .5]);
    return B.geo(); }
  const BL = { x: [], y: [], z: [], yaw: [], rx: [], rz: [], sx: [], sy: [], sz: [], c: [], set: [], yr: [] }, wall = { a: WA.clone(), b: WB.clone(), crash: [23, 44], keep: V3(), crashT: T_CRASH, keepT: T_KEEP };
  const STONE = ['#b9ab94', '#a69c8d', '#c4b69b', '#928a7e', '#ad9f88', '#9d9384'].map(L);
  function blk(x, y, z, yaw, sx, sy, sz, set, R, yRel = 0) { { const ss = (x - WA.x) * WD.x + (z - WA.z) * WD.z, dn = Math.abs((x - WA.x) * WN.x + (z - WA.z) * WN.z); if (set === 0 && ss > 25.5 && ss < 35 && dn < 2.6) { R(); R(); R(); R(); R(); R(); R(); return; } }   /* lead: a breach in the wall's footing where Ember hides and breathes the blue fire, so the climax lens sees her */
    const c = mulc(STONE[R() * STONE.length | 0], .9 + .2 * R()), mo = R() < .1 ? mixc(c, mixc(K.g2, K.r4, .5), .22) : R() < .08 ? mulc(c, .7) : c;
    BL.x.push(x); BL.y.push(y); BL.z.push(z); BL.yaw.push(yaw + (R() - .5) * .025); BL.rx.push((R() - .5) * .02); BL.rz.push((R() - .5) * .02); BL.sx.push(sx); BL.sy.push(sy); BL.sz.push(sz); BL.c.push(mo); BL.set.push(set); BL.yr.push(yRel); }
  const CH = [.72, .66, .62, .64, .58, .6, .56, .6], WT = 2.0, FDP = .56, yawW = Math.atan2(-WD.z, WD.x), gAt = s => ground(WA.x + WD.x * s, WA.z + WD.z * s);
  // a straight run of blocks from (x0,z0) along (dx,dz), course k on base y; set fn(s) -> set; slit at distance sl
  function run(x0, z0, dx, dz, len, y, h, dep, k, setFn, R, sl, yRel, ls = 1) { const yaw = Math.atan2(-dz, dx); let s = (k & 1) ? -.45 * ls : 0;
    while (s < len - .05) { let l = (.75 + R() * .55) * ls; const a = Math.max(0, s), b = Math.min(len, s + l); s += l; if (b - a < .25) continue;
      const segs = sl !== undefined && sl > a && sl < b ? [[a, sl - .08], [sl + .08, b]] : [[a, b]];
      for (const q of segs) { if (q[1] - q[0] < .18) continue; const m = (q[0] + q[1]) / 2, x = x0 + dx * m, z = z0 + dz * m; blk(x, y + h / 2, z, yaw, q[1] - q[0] - .03, h - .025, dep, setFn(x, z), R, yRel); } } }
  function buildWall(out) {
    const R = rng(1911), y0s = s => gAt(s) - .22, setOf = (s, k) => s > 23 && s < 44 && k >= 2 ? 1 : s >= 44 && k >= 1 ? 2 : 0, core = [];
    const topK = (s, f) => s > 22 ? (n3(s * .3, f, 7.7) > .32 ? 7 : 8) : clamp(8 - Math.floor(Math.max(0, n3(s * .12, 1.3 + f * .4, 3.1) + .28) * 9), 3, 8);
    // the curtain wall: two faces of ashlar + a rubble core; walkway and merlons where it still stands full height
    for (const f of [-1, 1]) for (let k = 0; k < 8; k++) { let s = .6 + ((k & 1) ? .5 : 0) + (f > 0 ? .27 : 0); const yk = CH.slice(0, k).reduce((a, b) => a + b, 0);
      while (s < WLEN - 3.3) { const l = .75 + R() * .55, m = s + l / 2; s += l; if (k >= topK(m, f) || (k > 1 && R() < .03)) continue; const off = f * (WT / 2 - FDP / 2);
        blk(WA.x + WD.x * m + WN.x * off, y0s(m) + yk + CH[k] / 2, WA.z + WD.z * m + WN.z * off, yawW, l - .03, CH[k] - .025, FDP, setOf(m, k), R, k / 8); } }
    const Y8 = CH.reduce((a, b) => a + b, 0);
    for (let s = .8; s < WLEN - 3.6; s += 1.32) { const m = s + .66, kk = Math.min(topK(m, -1), topK(m, 1)); if (m > 23) { for (let k = 1; k < kk; k++) { const yk = CH.slice(0, k).reduce((a, b) => a + b, 0); blk(WA.x + WD.x * m, y0s(m) + yk + CH[k] / 2, WA.z + WD.z * m, yawW, 1.28, CH[k] - .03, WT - 2 * FDP - .06, setOf(m, k), R, k / 8); } }
      else core.push([Geo.paint(new THREE.BoxGeometry(1.34, 1, WT - 2 * FDP), mulc(L('#6e675d'), .9 + .2 * R())), M4(WA.x + WD.x * m, y0s(m) + (CH.slice(0, kk).reduce((a, b) => a + b, 0) - .1) / 2, WA.z + WD.z * m, 0, yawW, 0, 1, CH.slice(0, kk).reduce((a, b) => a + b, 0) - .1, 1)]);
      if (kk === 8) { blk(WA.x + WD.x * m + WN.x * .3, y0s(m) + Y8 + .07, WA.z + WD.z * m + WN.z * .3, yawW, 1.28, .14, 1.36, setOf(m, 9), R, 1); if (R() > (m < 23 ? .3 : .08)) blk(WA.x + WD.x * m - WN.x * (WT / 2 - .28), y0s(m) + Y8 + .45, WA.z + WD.z * m - WN.z * (WT / 2 - .28), yawW, .98, .9, .56, setOf(m, 9), R, 1); } }
    // towers: square at WALL0, round on the plateau rim, the tall keep at WALL1 (falls at RETURN)
    const tower = (cx, cz, half, th, nk, set, broken, slits, ch = .62, ls = 1) => { const y = ground(cx, cz) - .25, cd = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let k = 0; k < nk; k++) for (let sd = 0; sd < 4; sd++) { const d = cd[sd], n = [d[1], -d[0]], full = ((k + sd) & 1) === 0, L0 = full ? half * 2 : half * 2 - th * 2, x0 = cx + n[0] * (half - th / 2) - d[0] * L0 / 2, z0 = cz + n[1] * (half - th / 2) - d[1] * L0 / 2;
        if (k > nk - 1 - broken * (1 + Math.abs(n3(sd * 1.7, k * .3, cx)) * 6)) continue; run(x0, z0, d[0], d[1], L0, y + k * ch, ch - .02, th, k, () => set, R, slits.includes(k) ? L0 / 2 : undefined, k / nk, ls); } return y + nk * ch; };
    const t0 = WA.clone().addScaledVector(WD, -2.7); tower(t0.x, t0.z, 2.6, 1.0, 14, 0, 1, [4, 5, 6, 9, 10]);
    const t1 = WA.clone().addScaledVector(WD, 21.6), ty = ground(t1.x, t1.z) - .25; for (let k = 0; k < 15; k++) { const n = 15, rr = 2.45; for (let i = 0; i < n; i++) { const a = (i + ((k & 1) ? .5 : 0)) / n * TAU; if (k > 9 + 5 * (.5 + .5 * Math.sin(a * 1.3 + 1))) continue; if ((k >= 5 && k <= 7) && i % 5 === 2) continue;
      blk(t1.x + Math.cos(a) * rr, ty + k * .62 + .31, t1.z + Math.sin(a) * rr, -a + PI / 2, TAU * rr / n - .04, .6, .95, 0, R, k / 15); } }
    const kc = WA.clone().addScaledVector(WD, WLEN + .4); wall.keep.copy(kc); const ktop = tower(kc.x, kc.z, 3.2, 1.2, 17, 2, .12, [4, 5, 8, 9, 12, 13], .9, 1.45); wall.keep.y = ktop;
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; if (i % 3 === 1) continue; blk(kc.x + Math.cos(a) * 2.75, ktop + .45, kc.z + Math.sin(a) * 2.75, -a, 1.1, .9, .7, 2, R, 1); }
    // old fallen blocks lying in the grass
    for (let i = 0; i < 60; i++) { const s = -4 + R() * (WLEN + 6), p = (R() < .5 ? -1 : 1) * (1.4 + R() * 5), x = WA.x + WD.x * s + WN.x * p, z = WA.z + WD.z * s + WN.z * p; if (blocked(x, z, 1)) continue; const sy = .45 + R() * .25;
      blk(x, ground(x, z) + sy / 2 - .06, z, R() * TAU, .8 + R() * .5, sy, .5 + R() * .2, 0, R); BL.rx[BL.rx.length - 1] = (R() - .5) * .3; }
    const cm = Mat.mesh(Geo.merge(core), mats.rock); cm.name = 'island-wall-core'; out.push(refl(cm));
  }
  // places a falling block must not come to rest: the climax marks, the fissure, the wall stump
  const EX = [[M.EMBER_CLIMAX, 1.9], [M.ASH_CLIMAX, 2.8], [M.ASH_THROWN, 3.3], [M.BOULDER, 2.4], [V3(51, 16, -53), 5.5]];
  const blocked = (x, z, m = 0) => EX.some(e => hyp(x - e[0].x, z - e[0].z) < e[1] + m * .3) || inFis(x, z) || (Math.abs(wP(x, z)) < 1.4 && wS(x, z) > -6 && wS(x, z) < WLEN + 4) || hyp(x - NEST.x, z - NEST.z) < 7;
  const G = 9.8, SETTLE = .42; let DYN = null;
  function launchAll() {
    const N = BL.x.length, D = DYN = { p0: new Float32Array(N * 3), q0: new Float32Array(N * 4), v: new Float32Array(N * 3), w: new Float32Array(N * 4), t0: new Float32Array(N), tl: new Float32Array(N), pl: new Float32Array(N * 3), pr: new Float32Array(N * 3), ql: new Float32Array(N * 4), qr: new Float32Array(N * 4), hop: new Float32Array(N), sets: [[], [], []] };
    const R = rng(77), I = M.cinder(T_CRASH, V3()), cv = M.cinder(T_CRASH + .15, V3()).sub(M.cinder(T_CRASH - .15, V3())).setY(0).normalize(), axis = V3(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), m3 = new THREE.Matrix4(), ax = [V3(), V3(), V3()];
    for (let i = 0; i < N; i++) { eu.set(BL.rx[i], BL.yaw[i], BL.rz[i], 'YXZ'); q.setFromEuler(eu); D.p0.set([BL.x[i], BL.y[i], BL.z[i]], i * 3); D.q0.set([q.x, q.y, q.z, q.w], i * 4); const set = BL.set[i]; D.sets[set].push(i); if (!set) continue;
      let vx, vy, vz, t0; const dx = BL.x[i] - I.x, dz = BL.z[i] - I.z, dist = hyp(dx, BL.y[i] - I.y, dz);
      if (set === 1) { const k = (1.6 + 4.5 * Math.exp(-dist / 5)) * (.5 + .7 * R()), h = hyp(dx, dz) + 1e-3, e = Math.exp(-dist / 7) * (1.5 + 2.5 * R()); vx = dx / h * k + cv.x * e; vz = dz / h * k + cv.z * e; vy = 1 + 2.4 * R(); t0 = T_CRASH + dist * .01; }
      else { const yr = BL.yr[i], k = (.3 + 1.9 * yr) * (.5 + .9 * R()); vx = -WN.x * k + WD.x * (R() - .4) * 1.1; vz = -WN.z * k + WD.z * (R() - .4) * 1.1; vy = .2 + 1.2 * R(); t0 = T_KEEP + (1 - yr) * .28 + R() * .12; }
      let tl = 1, xl = 0, zl = 0; for (let tr = 0; tr < 10; tr++) { const ang = tr ? (tr & 1 ? 1 : -1) * Math.ceil(tr / 2) * .45 : 0, sc = 1 + tr * .12, c = Math.cos(ang), s = Math.sin(ang), wx = (vx * c - vz * s) * sc, wz = (vx * s + vz * c) * sc;
        for (let it = 0; it < 3; it++) { xl = BL.x[i] + wx * tl; zl = BL.z[i] + wz * tl; const yr0 = ground(xl, zl) + .3, dy = BL.y[i] - yr0; tl = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * dy))) / G; }
        if (!blocked(xl + wx * .12, zl + wz * .12)) { vx = wx; vz = wz; break; }
        if (tr === 9) { let px = xl, pz = zl; for (let it = 0; it < 4; it++) { const v = fV(px, pz); if (inFis(px, pz)) { const d = (2.6 - Math.abs(v)) * (Math.sign(v) || 1); px += FN.x * d; pz += FN.z * d; }
            for (const e of EX) { const dx = px - e[0].x, dz = pz - e[0].z, d = hyp(dx, dz) + 1e-3; if (d < e[1]) { px += dx / d * (e[1] - d + .2); pz += dz / d * (e[1] - d + .2); } } }
          vx = (px - BL.x[i]) / tl; vz = (pz - BL.z[i]) / tl; xl = px; zl = pz; } }
      axis.set(R() - .5, R() - .5, R() - .5).normalize(); const rate = (2 + 5 * R()) * (set === 1 ? 1.3 : .8);
      D.v.set([vx, vy, vz], i * 3); D.w.set([axis.x, axis.y, axis.z, rate], i * 4); D.t0[i] = t0; D.tl[i] = tl;
      qs.setFromAxisAngle(axis, rate * tl).multiply(q); D.ql.set([qs.x, qs.y, qs.z, qs.w], i * 4); D.pl.set([xl, ground(xl, zl) + .3, zl], i * 3);
      m3.makeRotationFromQuaternion(qs); m3.extractBasis(ax[0], ax[1], ax[2]); let bk = 0, bd = 0; for (let k = 0; k < 3; k++) { const d = Math.abs(ax[k].y); if (d > bd) { bd = d; bk = k; } }
      const half = [BL.sx[i], BL.sy[i], BL.sz[i]][bk] / 2, align = new THREE.Quaternion().setFromUnitVectors(ax[bk].clone().multiplyScalar(Math.sign(ax[bk].y) || 1), YUP); align.multiply(qs);
      const xr = xl + vx * .12, zr = zl + vz * .12; D.pr.set([xr, ground(xr, zr) + half - .05, zr], i * 3); D.qr.set([align.x, align.y, align.z, align.w], i * 4); D.hop[i] = .1 + .05 * Math.abs(vy - G * tl); }
    D.end = [0, T_CRASH + 4, T_KEEP + 4.5]; for (let i = 0; i < N; i++) if (BL.set[i]) D.end[BL.set[i]] = Math.max(D.end[BL.set[i]], D.t0[i] + D.tl[i] + SETTLE + .05);
    D.state = [-1, -1, -1]; }
  function blockAt(i, t) { const D = DYN, tau = t - D.t0[i], j = i * 3, k = i * 4;
    if (!BL.set[i] || tau <= 0) { va.set(D.p0[j], D.p0[j + 1], D.p0[j + 2]); qa.set(D.q0[k], D.q0[k + 1], D.q0[k + 2], D.q0[k + 3]); }
    else if (tau < D.tl[i]) { va.set(D.p0[j] + D.v[j] * tau, D.p0[j + 1] + D.v[j + 1] * tau - .5 * G * tau * tau, D.p0[j + 2] + D.v[j + 2] * tau); vb.set(D.w[k], D.w[k + 1], D.w[k + 2]); qb.set(D.q0[k], D.q0[k + 1], D.q0[k + 2], D.q0[k + 3]); qa.setFromAxisAngle(vb, D.w[k + 3] * tau).multiply(qb); }
    else if (tau < D.tl[i] + SETTLE) { const u = (tau - D.tl[i]) / SETTLE, e = u * u * (3 - 2 * u); va.set(lerp(D.pl[j], D.pr[j], e), lerp(D.pl[j + 1], D.pr[j + 1], e) + D.hop[i] * Math.sin(PI * u), lerp(D.pl[j + 2], D.pr[j + 2], e)); qa.set(D.ql[k], D.ql[k + 1], D.ql[k + 2], D.ql[k + 3]); qb.set(D.qr[k], D.qr[k + 1], D.qr[k + 2], D.qr[k + 3]); qa.slerp(qb, e); }
    else { va.set(D.pr[j], D.pr[j + 1], D.pr[j + 2]); qa.set(D.qr[k], D.qr[k + 1], D.qr[k + 2], D.qr[k + 3]); }
    mtx.compose(va, qa, vs.set(BL.sx[i], BL.sy[i], BL.sz[i])); wall.mesh.setMatrixAt(i, mtx); }
  function wallUpdate(t) { const D = DYN; for (let s = 1; s <= 2; s++) { const st = t < D.t0min[s] ? 0 : t > D.end[s] ? 2 : 1; if (st === D.state[s] && st !== 1) continue; D.state[s] = st; for (const i of D.sets[s]) blockAt(i, t); wall.mesh.instanceMatrix.needsUpdate = true; } }

  // ---- the volcano's fire: the lava lake, two rivers spilling from the rim notches, the light they throw ------------------------------------------
  const rivers = [];
  function buildLava(out) {
    const lake = Mat.mesh(Geo.at(new THREE.CircleGeometry(12.6, 80, 0, TAU).rotateX(-PI / 2), VX, LAVA, VZ), mats.lake, { cast: false }); lake.name = 'island-lava-lake'; out.push(refl(lake));
    const B = Buf(), w = [1, 1, 1];
    for (const [an, stopY] of [[NOTCH[0], 24], [NOTCH[1], .6]]) { let x = VX + Math.cos(an) * 12.6, z = VZ + Math.sin(an) * 12.6, dx = Math.cos(an), dz = Math.sin(an); const pts = [];
      for (let i = 0; i < 280; i++) { const h = H(x, z); pts.push([x, z]); if (h < stopY && i > 10) break; const e = .9, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e), gl = hyp(gx, gz) + 1e-6;
        dx = dx * .72 - gx / gl * .28; dz = dz * .72 - gz / gl * .28; const l = hyp(dx, dz); dx /= l; dz /= l; x += dx * 1.1; z += dz * 1.1; }
      for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4];
      rivers.push(pts); const n = pts.length, b0 = B.n; let dist = 0;
      for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)], tx = c[0] - a[0], tz = c[1] - a[1], tl = hyp(tx, tz) + 1e-6, px = -tz / tl, pz = tx / tl, u = i / (n - 1), wd = (2 + 3.4 * Math.pow(u, .6)) * (i === n - 1 ? .3 : 1) * (1 + .15 * n3(i * .2, 4, an));
        if (i) dist += hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let k = 0; k <= 4; k++) { const cc = k / 2 - 1, x = pts[i][0] + px * cc * wd / 2, z = pts[i][1] + pz * cc * wd / 2; B.v(x, Math.max(H(x, z), H(x + .6, z), H(x - .6, z), H(x, z + .6), H(x, z - .6)) + .35 + .25 * (1 - cc * cc), z, 0, 1, 0, w, 0, k / 4, dist); } }
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) { const a = b0 + i * 5 + k, b = a + 1, d = a + 5, c = d + 1; B.I.push(a, d, c, a, c, b); }
      for (let i = 4; i < n; i += 13) Lan.add({ x: pts[i][0], y: H(pts[i][0], pts[i][1]) + 1.2, z: pts[i][1], r: 10, color: [1, .4, .1], gain: () => 1.1 * env.lava(T) }); }
    const rg = B.geo(); rg.computeVertexNormals(); const rm = Mat.mesh(rg, mats.river, { cast: false }); rm.name = 'island-lava-rivers'; out.push(refl(rm));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; Lan.add({ x: VX + Math.cos(a) * (k ? 7 : 0), y: LAVA + 2.5, z: VZ + Math.sin(a) * (k ? 7 : 0), r: k ? 16 : 30, color: [1, .42, .12], gain: () => (k ? 1.2 : 2.4) * env.lava(T) }); }
  }

  // ---- plants and stones: felt grass tufts, paper ferns and flowers, wind-bent pines, hand-cut rocks -----------------------------------------------
  function tuftGeo() { const R = rng(77), B = Buf(), base = L('#3f6b34'), tip = L('#d9e39a');
    for (let b = 0; b < 5; b++) { const a = b / 5 * TAU + R() * .7, out = .25 + R() * .45, Lb = .22 + R() * .22, w = .03 + R() * .012, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, s = B.n;
      for (let i = 0; i <= 2; i++) { const u = i / 2, x = dx * Lb * (out * u + .45 * u * u), y = Lb * (u - .3 * u * u), z = dz * Lb * (out * u + .45 * u * u), wi = w * (1 - u * .92), c = mixc(base, tip, u * .85); B.v(x + px * wi, y, z + pz * wi, dx * .35, .9, dz * .35, c); B.v(x - px * wi, y, z - pz * wi, dx * .35, .9, dz * .35, c); if (i) B.q(s + i * 2 - 2, s + i * 2 - 1, s + i * 2 + 1, s + i * 2); } }
    return B.geo(); }
  function fernGeo() { const R = rng(78), B = Buf(), c0 = L('#2f6a3c'), c1 = L('#7dbb5c');
    for (let f = 0; f < 6; f++) { const a = f / 6 * TAU + R() * .5, Lf = .45 + R() * .25, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, s = B.n;
      for (let i = 0; i <= 6; i++) { const u = i / 6, x = dx * Lf * u, y = Lf * (.75 * u - .65 * u * u) + .02, z = dz * Lf * u, wi = .1 * Math.pow(Math.sin(PI * Math.min(1, u * 1.05)), .7) * (i & 1 ? .45 : 1), c = mixc(c0, c1, .3 + .5 * u); B.v(x + px * wi, y, z + pz * wi, 0, 1, 0, c); B.v(x - px * wi, y, z - pz * wi, 0, 1, 0, c); if (i) B.q(s + i * 2 - 2, s + i * 2 - 1, s + i * 2 + 1, s + i * 2); } }
    return B.geo(); }
  function flowerGeo(pc) { const B = Buf(), st = L('#4f8a3c'), pt = L(pc), cen = L('#f2b33a'), h = .27;
    for (const r of [0, PI / 2]) { const cx = Math.cos(r) * .01, cz = Math.sin(r) * .01; B.q(B.v(-cx, 0, -cz, 0, 0, 1, st), B.v(cx, 0, cz, 0, 0, 1, st), B.v(cx, h, cz, 0, 0, 1, st), B.v(-cx, h, -cz, 0, 0, 1, st)); }
    const c = B.v(0, h + .012, 0, 0, 1, 0, cen), ring = []; for (let i = 0; i < 15; i++) { const a = i / 15 * TAU, r = .06 * (.5 + .5 * Math.abs(Math.cos(a * 2.5))); ring.push(B.v(Math.cos(a) * r, h + .004 + r * .25, Math.sin(a) * r, 0, 1, 0, i % 3 ? pt : mixc(pt, cen, .35))); }
    for (let i = 0; i < 15; i++) B.t(c, ring[(i + 1) % 15], ring[i]); return B.geo(); }
  const free = (x, z, y) => !(pathQ(x, z).d < .75 || fieldD(x, z) < 1.2 || hyp(x - NEST.x, z - NEST.z) < 2.0 || (inCave(x, z) && y < 16) || (Math.abs(cA(x, z) - 4) < 4.5 && Math.abs(cB(x, z)) < 5 && y < 9) || (Math.max(Math.abs(x - M.LEDGE.x) - 4.6, Math.abs(z - M.LEDGE.z) - 2.6) < 0) || (Math.abs(wP(x, z)) < 1.4 && wS(x, z) > -6 && wS(x, z) < WLEN + 4));
  const nrmT = V3();
  function place(R, n, x0, z0, x1, z1, ok) { const out = []; for (let k = 0; k < n * 4 && out.length < n; k++) { const x = lerp(x0, x1, R()), z = lerp(z0, z1, R()), y = ground(x, z, true), e = .35; nrmT.set(ground(x - e, z, true) - ground(x + e, z, true), 2 * e, ground(x, z - e, true) - ground(x, z + e, true)).normalize(); if (ok(x, y, z, nrmT.y) && free(x, z, y)) out.push([x, y, z, nrmT.y]); } return out; }
  function instances(geo, mat, pts, sz, cols, R, name, o = {}) { if (!pts.length) return null; const im = Mat.inst(geo, mat, pts.length, o), c = new THREE.Color();
    pts.forEach((p, i) => { const s = sz[0] + R() * (sz[1] - sz[0]); eu.set((R() - .5) * (o.tilt || .2), R() * TAU, (R() - .5) * (o.tilt || .2)); qa.setFromEuler(eu); mtx.compose(va.set(p[0], p[1] - (o.sink || 0) * s, p[2]), qa, vs.set(s * (o.sx || 1) * (.85 + .3 * R()), s * (o.sy || 1), s * (o.sx || 1) * (.85 + .3 * R()))); im.setMatrixAt(i, mtx); const q = typeof cols === 'function' ? cols(p) : cols[R() * cols.length | 0]; im.setColorAt(i, c.setRGB(q[0], q[1], q[2])); });
    im.computeBoundingSphere(); im.frustumCulled = true; im.name = name; return im; }
  function pine(trunk, fol, bx, bz, Ht, lean, k, R) { const by = ground(bx, bz, true) - .15, lx = Math.cos(lean), lz = Math.sin(lean), pts = [];
    for (let i = 0; i <= 7; i++) { const u = i / 7; pts.push([bx + lx * Ht * k * Math.pow(u, 1.6) + (R() - .5) * .12 * u, by + Ht * u * (1 - .3 * k * u), bz + lz * Ht * k * Math.pow(u, 1.6) + (R() - .5) * .12 * u]); }
    trunk.push([Geo.paint(Geo.tube(pts, u => Ht * (.062 - .047 * u), 8, { smooth: 16 }), L('#6b4c36'))]);
    const pads = [[pts[7], Ht * .2]], fc = ['#2f5e46', '#3c6f50', '#2a5340', '#4a7d55'].map(L), nb = 7 + (R() * 4 | 0);
    for (let b = 0; b < nb; b++) { const u = .42 + .55 * b / nb, i = Math.min(6, u * 7 | 0), p = pts[i], ang = lean + (R() - .5) * (k > .4 ? 1.6 : TAU), lb = Ht * (.42 - .25 * u) * (.75 + .5 * R()), e = [p[0] + Math.cos(ang) * lb, p[1] + lb * (.1 + .2 * R()), p[2] + Math.sin(ang) * lb];
      trunk.push([Geo.paint(Geo.tube([p, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2 + .1, (p[2] + e[2]) / 2], e], [Ht * .016, Ht * .008], 5), L('#5e4432'))]); pads.push([e, lb * .55 + .3]); }
    for (const [p0, r0] of pads) for (let sp = 0; sp < 3; sp++) { const r = r0 * (sp ? .55 + .2 * R() : .8), p = sp ? [p0[0] + (R() - .5) * r0 * 1.2, p0[1] + (R() - .3) * r0 * .35, p0[2] + (R() - .5) * r0 * 1.2] : p0, g = Geo.warp(Geo.sphere(1, 7, 5), (x, y, z) => { const s = 1 + .3 * n3(x * 2 + p[0], y * 2, z * 2 + p[2]); return [x * s, (y < 0 ? y * .35 : y * .6) * s, z * s]; });
      const fy = clamp((p[1] - by) / Ht); fol.push([Geo.attr(Geo.paint(g, (x, y, z, nx, ny) => mulc(fc[(R() * 4) | 0], .75 + .4 * clamp(ny * .5 + .5))), 'aWind', 1, .25 + .6 * fy), M4(p[0], p[1], p[2], 0, R() * 6, 0, r, r * .75, r * .9)]); } }
  function buildPlants(out) {
    const R = rng(9090), tuft = tuftGeo(), fern = fernGeo(), gc = ['#a8c873', '#8fbb62', '#c4cf7d', '#7aa95a', '#d6c98a', '#9bc46b'].map(L), fc = ['#ffffff', '#f6f1e6', '#e9f3dc'].map(L);
    const grassOk = (x, y, z, ny) => ny > .79 && y > 1.7 && hyp(x - VX, z - VZ) > 72, regions = [[[NEST.x - 6.2, NEST.z - 6.2, NEST.x + 6.2, NEST.z + 6.2], 380, 'crag'], [[-10, -22, 34, 34], 1000, 'west'], [[24, 2, 64, 38], 650, 'cave'], [[10, -86, 112, 30], 720, 'east']];
    for (const [r, n, nm] of regions) { const pts = place(R, n, r[0], r[1], r[2], r[3], nm === 'crag' ? (x, y, z, ny) => ny > .74 && hyp(x - NEST.x, z - NEST.z) < 6.3 && y > 19 : grassOk);
      const m = instances(tuft, mats.grass, pts, nm === 'crag' ? [.75, 1.25] : [.7, 1.4], gc, R, 'island-grass-' + nm, { cast: false, tilt: .25, sink: .03 }); if (m) out.push(m); }
    const fpts = place(R, 220, -10, -22, 64, 38, (x, y, z, ny) => ny > .45 && ny < .9 && y > 2.5 && y < 19.6);
    const fm = instances(fern, mats.fern, fpts, [.7, 1.5], fc, R, 'island-ferns', { cast: false, tilt: .35 }); if (fm) out.push(fm);
    const FL = [['#f4d03f', 0], ['#e45a9e', 0], ['#f7f3ea', 0], ['#a99cc8', 0]];
    FL.forEach((f, i) => { const crag = place(R, 110, NEST.x - 6, NEST.z - 6, NEST.x + 6, NEST.z + 6, (x, y, z, ny) => ny > .8 && y > 19.5 && hyp(x - NEST.x, z - NEST.z) < 6.2), hill = place(R, 160, -8, -30, 64, 36, (x, y, z, ny) => ny > .8 && y > 3);
      const m = instances(flowerGeo(f[0]), mats.flower, crag.concat(hill), [.8, 1.3], [[1, 1, 1]], R, 'island-flowers-' + i, { cast: false, tilt: .3 }); if (m) out.push(m); });
    // pines; the lone one on the ledge leans out over the sea, its branches streaming downwind
    const trunk = [], fol = []; pine(trunk, fol, 58.4, 30.2, 4.6, Math.atan2(.75, -.66), .55, rng(5)); ledge.pine = V3(58.4, ground(58.4, 30.2, true), 30.2);
    [[-5, -9, 5.4], [3, -12, 4.8], [8, -19, 6.1], [21, -7, 5.2], [26, -3, 5.8], [30, 5, 5.0], [70, -8, 6.6], [79, 5, 5.8], [87, -21, 6.2], [65, 17, 5.0], [18, -31, 5.6], [5, -27, 5.1], [92, 10, 5.4], [74, -30, 6.0]].forEach((p, i) => {
      const y = ground(p[0], p[1], true); if (y < 2 || fieldD(p[0], p[1]) < 2) return; { const ax = p[0] - 1.5, az = p[1], al = ax * .983 + az * .18, pd = Math.abs(ax * .18 - az * .983); if (al > 2 && al < 400 && pd < 4 + al * .08) return; }   /* lead: keep the sunrise behind Ember clear */ pine(trunk, fol, p[0], p[1], p[2], -.9 + (R() - .5) * .8, .12 + R() * .2, rng(100 + i)); });
    const tm = Mat.mesh(Geo.merge(trunk), mats.bark); tm.name = 'island-pine-trunks'; out.push(tm); const pm = Mat.mesh(Geo.merge(fol), mats.pine); pm.name = 'island-pine-foliage'; out.push(refl(pm));
    // rocks: sea boulders at the cliff feet, scree, the mouth's frame, volcanic bombs
    const rg = Geo.paint(rockGeo(3), [1, 1, 1]), grey = [K.r1, K.r3, K.r4, K.r5, K.r2], blk_ = [K.bas, K.bas2, mixc(K.bas, K.rust, .3)], west = [];
    for (let k = 0; k < 40; k++) { const a = 1.2 + R() * 2.7, r = 9.5 + R() * 4.5, x = NEST.x + Math.cos(a) * r, z = NEST.z + Math.sin(a) * r; west.push([x, Math.max(H(x, z), -2.2) + .1, z, 1]); }
    for (let k = 0; k < 140 && west.length < 70; k++) { const x = 24 + R() * 40, z = 32 + R() * 11, h = H(x, z); if (h > -3 && h < 1.2) west.push([x, h, z, 1]); }
    const wm = instances(rg, mats.rock, west, [.8, 2.6], grey, R, 'island-rocks-sea', { sink: .3, tilt: .6, sy: .75 }); out.push(wm);
    const scree = place(R, 220, -10, -30, 64, 38, (x, y, z, ny) => ny > .8 && ny < .95 && y > 1.2).concat(place(R, 60, 26, 20, 50, 34, (x, y, z, ny) => y < 9 && y > 7.5));
    for (let k = 0; k < 9; k++) { const sd = k & 1 ? 1 : -1, x = MO.x + CQ.x * sd * (4.8 + R() * .8) + CD.x * (R() * 3), z = MO.z + CQ.z * sd * (4.8 + R() * .8) + CD.z * (R() * 3); scree.push([x, ground(x, z, true) > 9 ? 8.05 : ground(x, z, true), z, 2.5]); }
    const sm_ = instances(rg, mats.rock, scree, [.12, .5], grey, R, 'island-rocks-scree', { sink: .35, tilt: 1 }); out.push(sm_);
    const vb = []; for (let k = 0; k < 90; k++) { const a = R() * TAU, r = 18 + R() * 68, x = VX + Math.cos(a) * r, z = VZ + Math.sin(a) * r, y = H(x, z); if (y > .5 && fieldD(x, z) > 3) vb.push([x, y, z, 1]); }
    const vm = instances(rg, mats.rock, vb, [.3, 1.5], blk_, R, 'island-rocks-volcano', { sink: .45, tilt: 1, sy: .7 }); out.push(vm);
    // the three practice rocks on the ledge, and their flat tops
    const lr = []; ledge.rocks.forEach((o, i) => { const g = Geo.paint(flatRock(11 + i, .95 + .25 * i, o.h + .1, .85 + .2 * i), (x, y, z, nx, ny) => mulc(mixc(K.r3, K.r1, i / 2), .8 + .3 * ny));
      lr.push([g, M4(o.p.x, o.p.y - .1, o.p.z, 0, .4 * i, 0)]); TOPS.push({ x: o.p.x, z: o.p.z, hx: (.9 + .25 * i) / 2 - .06, hz: (.8 + .2 * i) / 2 - .06, c: Math.cos(.4 * i), s: Math.sin(.4 * i), top: o.p.y + o.h }); });
    const lm = Mat.mesh(Geo.merge(lr), mats.rock); lm.name = 'island-ledge-rocks'; out.push(lm);
  }
  const ledge = { c: M.LEDGE.clone(), w: 10, d: 6, rocks: [[51.4, 31.4, .4], [53.9, 32.6, .6], [56.4, 31.6, 1.0]].map(r => ({ p: V3(r[0], M.LEDGE.y, r[1]), h: r[2] })), pine: null };

  // ---- colliders (coarse oriented boxes, with the film times they exist) -------------------------------------------------------------------------
  const colliders = [], addBox = (name, c, h, yaw = 0, t0 = -1e9, t1 = 1e9) => colliders.push({ name, c, h, yaw, t0, t1 });
  function buildColliders() { const at = s => WA.clone().addScaledVector(WD, s), gy = s => gAt(s);
    addBox('crag', V3(NEST.x, 6.8, NEST.z), V3(6.7, 13.2, 6.7));
    const seg = (n, s0, s1, hgt, t0, t1) => { const m = (s0 + s1) / 2, c = at(m); c.y = gy(m) + hgt / 2; addBox(n, c, V3((s1 - s0) / 2, hgt / 2, WT / 2), yawW, t0, t1); };
    seg('wall', .6, 23, 5.2); seg('wall-crash', 23, 44, 5.4, -1e9, T_CRASH); seg('wall-crash-stump', 23, 44, 1.3, T_CRASH, 1e9); seg('wall-keepside', 44, WLEN - 3.3, 5.4, -1e9, T_KEEP); seg('wall-keepside-stump', 44, WLEN - 3.3, .7, T_KEEP, 1e9);
    const t0 = at(-2.7); t0.y = gy(-2.7) + 4; addBox('tower0', t0, V3(2.6, 4.4, 2.6), yawW); const t1 = at(21.6); t1.y = gy(21.6) + 4.5; addBox('tower1', t1, V3(2.9, 4.6, 2.9), yawW);
    addBox('keep', V3(wall.keep.x, 16 + 7.5, wall.keep.z), V3(3.2, 7.5, 3.2), yawW, -1e9, T_KEEP);
    addBox('boulder', V3(M.BOULDER.x, 16.9, M.BOULDER.z), V3(1.25, 1.0, 1.1), .7);
    addBox('seat', V3(cave.seat.x, 8.16, cave.seat.z), V3(1.1, .17, .85), Math.atan2(CD.x, CD.z));
    ledge.rocks.forEach((o, i) => addBox('ledge-rock' + i, V3(o.p.x, o.p.y + o.h / 2, o.p.z), V3((.9 + .25 * i) / 2, o.h / 2, (.8 + .2 * i) / 2), .4 * i));
    if (ledge.pine) addBox('ledge-pine', V3(ledge.pine.x, ledge.pine.y + 1.2, ledge.pine.z), V3(.25, 1.2, .25));
    const ma = Math.atan2(CD.z, CD.x); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; if (Math.abs(angD(a, ma)) < .5) continue; addBox('cave-wall', V3(CI.x + Math.cos(a) * 9.8, 11.5, CI.z + Math.sin(a) * 9.2), V3(.9, 3.6, 2.3), -a); } }
  function collide(p, r = 0, t = T) { for (const b of colliders) { if (t < b.t0 || t >= b.t1) continue; const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = p.x - b.c.x, dz = p.z - b.c.z, u = dx * c - dz * s, w = dx * s + dz * c, v = p.y - b.c.y;
      const pu = b.h.x + r - Math.abs(u), pv = b.h.y + r - Math.abs(v), pw = b.h.z + r - Math.abs(w); if (pu <= 0 || pv <= 0 || pw <= 0) continue;
      if (pu < pw && pu < pv) { const du = Math.sign(u) * pu; p.x += du * c; p.z -= du * s; } else if (pw < pv) { const dw = Math.sign(w) * pw; p.x += dw * s; p.z += dw * c; } else p.y += Math.sign(v) * pv; } return p; }

  // ---- build / update ---------------------------------------------------------------------------------------------------------------------------
  const pick = [], hop = { t0: -99, p: V3(), n: V3(0, 1, 0), mesh: null };
  function build() {
    const T0 = performance.now(), out = []; let t0 = T0; buildMats();
    Hc = cache(BOX_CRAG[0], BOX_CRAG[2], BOX_CRAG[3], BOX_CRAG[5], .2); Hk = cache(BOX_CAVE[0], BOX_CAVE[2], BOX_CAVE[3], BOX_CAVE[5], .2); tick('cache', t0); t0 = performance.now();
    buildPlateau(out); tick('plateau', t0); t0 = performance.now();
    for (const d of TILES) { const m = tile(...d); if (m) { out.push(refl(m)); pick.push(m); } } tick('tiles', t0); t0 = performance.now();
    const crag = Mat.mesh(sculpt(fCrag, BOX_CRAG, .43, colAt), mats.land); crag.name = 'island-crag'; out.push(refl(crag)); pick.push(crag); tick('crag', t0); t0 = performance.now();
    const head = Mat.mesh(sculpt(fCave, BOX_CAVE, .47, colCave), mats.land); head.name = 'island-cave-headland'; out.push(refl(head)); pick.push(head); tick('cave', t0); t0 = performance.now();
    buildCave(out); buildNest(out); tick('props', t0); t0 = performance.now();
    buildWall(out); const N = BL.x.length, wm = Mat.inst(blockGeo(), mats.block, N), c = new THREE.Color(); wall.mesh = wm; for (let i = 0; i < N; i++) wm.setColorAt(i, c.setRGB(...BL.c[i]));
    launchAll(); DYN.t0min = [0, 1e9, 1e9]; for (let i = 0; i < N; i++) { if (BL.set[i]) DYN.t0min[BL.set[i]] = Math.min(DYN.t0min[BL.set[i]], DYN.t0[i]); blockAt(i, -1); }
    wm.computeBoundingSphere(); wm.boundingSphere.radius += 30; wm.frustumCulled = true; wm.name = 'island-wall-blocks'; out.push(refl(wm)); tick('wall', t0); t0 = performance.now();
    buildLava(out); buildPlants(out); tick('plants+lava', t0); t0 = performance.now();
    Lan.add({ x: MO.x + CD.x * .5, y: 11, z: MO.z + CD.z * .5, r: 11, color: [.5, .6, .9], gain: () => .45 });                     // sky bounce through the mouth
    Lan.add({ x: cave.seat.x - CD.x * 1.5, y: 10.5, z: cave.seat.z - CD.z * 1.5, r: 8, color: [1, .72, .48], gain: () => .3 + .25 * sm(C.RAIN, C.WING, T) });   // a cosy hollow
    buildColliders();
    hop.mesh = Mat.mesh(Geo.paint(rockGeo(2), K.r3), mats.rock); hop.mesh.visible = false; hop.mesh.name = 'island-pebble'; out.push(hop.mesh);
    for (const o of out) group.add(o); pick.push(...out.filter(o => /rocks|boulder|ledge-rocks/.test(o.name)));
    let tris = 0; group.traverse(o => { if (o.isMesh && o.geometry.index) { const k = o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : o.geometry.isInstancedBufferGeometry ? o.geometry.instanceCount : 1); STATS.tris[o.name] = (STATS.tris[o.name] || 0) + Math.round(k); tris += k; } });
    STATS.total = Math.round(tris); STATS.draws = out.length; STATS.ms.all = Math.round(performance.now() - T0);
    return group; }
  function update(ctx) { const t = ctx.t; T = t;
    UW.uIsA.value.set(env.ashR(t), env.ash(t), env.wet(t), 0); UL.uIsL.value.set(env.lava(t), env.glow(t), env.open(t), t);
    if (DYN) wallUpdate(t); if (plateau.cols) fissureUpdate(t);
    if (plateau.steam) { const a = env.steam(t); plateau.steam.visible = a > .003; plateau.steamU.uT.value = t; plateau.steamU.uAmt.value = a; }
    { const b = Score.beat(t); UD.uDrip.value.x = b.inBar * Score.byName[b.sec].beatS; }
    if (hop.mesh) { const u = (t - hop.t0) / .7; hop.mesh.visible = u >= 0 && u < 1; if (hop.mesh.visible) { hop.mesh.position.copy(hop.p).addScaledVector(hop.n, .05 + .3 * Math.sin(PI * u) * (1 - u)); hop.mesh.position.x += .35 * u; hop.mesh.rotation.set(u * 9, u * 5, 0); hop.mesh.scale.setScalar(.06); } } }
  function poke(hit, ctx) { const p = hit.point; Score.live('clack', { t: ctx.t, m: 74 + (Math.abs(Math.round(p.x * 7 + p.z * 3)) % 5) * 2, v: .7, who: 'island' }, { now: true });
    hop.t0 = ctx.t; hop.p.copy(p); if (hit.face) hop.n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld); return 'stone'; }
  Assets.add('island', { order: 8, build, update, pick, poke });
  const lavaLight = t => env.lava(t);
  return { group, ground, normal, H, colliders, collide, crag: { c: V3(NEST.x, NEST.y, NEST.z), r: M.NEST_R, top: NEST.y, nest: nest.c, nestR: nest.r, rim: nest.rim },
    caveMouth: { p: MO.clone(), dir: CD.clone(), w: 8.3, h: 6 }, cave, ledge, wall, plateau, path: PATH.map((p, i) => V3(p[0], PY[i], p[1])), lava: lavaLight, env, stats: STATS, rivers };
})();
