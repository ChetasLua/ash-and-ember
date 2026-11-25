'use strict';
// ---- THE PAIR: Noct and Lune, Ember's parents. One rig, two looks. 7 m long, 12 m span (Lune x0.94).
//   Pair.noct / Pair.lune : { group, at(t,out) world chest (pure fn of t), head(out), mouth(out), dir(out) (posed, after update) }
//   Pair.dissolve() -> 0..1 (ink-smoke dissolve, tail to head, BLAST..SILENCE)    Pair.points(who, out[]) -> out filled with {x,y,z,s}: points on the body,
//   s = 0..1 how hard that point is turning to ink right now (emit wisps there).    Stage actors: 'pair' (midpoint), 'noct', 'lune'.
// Build: per dragon three skinned meshes on one 57-bone skeleton: clay body (lofted trunk with shader scale rows, SDF head + jaw, horns, teeth,
// legs, toes, claws, wing arms and finger struts, dorsal spines, lids), translucent membranes (5 panels a wing, frills, tail fins), glass-bead eyes.
const Pair = (() => {
  const C = Score.CUE, M = Stage.M, T = Score.T;
  // ---------------------------------------------------------------- rig (model space: forward +Z, up +Y, X = Y x Z; origin = mid torso on the spine)
  const H0 = V3(0, .06, 2.45);                                  // head joint (occiput); head parts are sculpted in head-local coords
  const DEF = { root: { pos: [0, 0, 0] }, chest: { parent: 'root', pos: [0, .02, .55] }, hip: { parent: 'root', pos: [0, 0, -.8] } };
  const NECK = [.95, 1.27, 1.59, 1.91, 2.2], TAIL = [-1.18, -1.54, -1.92, -2.32, -2.74, -3.16, -3.58, -3.94];
  NECK.forEach((z, i) => DEF['n' + (i + 1)] = { parent: i ? 'n' + i : 'chest', pos: [0, i ? .06 : .04, z] });
  DEF.head = { parent: 'n5', pos: [H0.x, H0.y, H0.z] }; DEF.jaw = { parent: 'head', pos: [0, .02, 2.5] }; DEF.thr = { parent: 'n5', pos: [0, -.12, 2.3] };
  TAIL.forEach((z, i) => DEF['t' + (i + 1)] = { parent: i ? 't' + i : 'hip', pos: [0, 0, z] });
  const EYE = s => V3(s * .112, .085, .27).add(H0), EF = s => V3(s * .62, .12, .78).normalize();
  // wings: shoulder S, elbow E, wrist W; four fingers (two bones each) fanning back from the wrist
  const FA = [.14, .58, 1.05, 1.6], FL = [[1.5, 1.35], [1.38, 1.15], [1.2, .95], [1.0, .8]];
  const WJ = s => { const S = V3(s * .34, .2, .62), E = V3(s * 1.38, .24, .5), W = V3(s * 3.05, .26, .6), F = FA.map((a, i) => { const m = V3(s * Math.cos(a), 0, -Math.sin(a)).multiplyScalar(FL[i][0]).add(W), t = V3(s * Math.cos(a + .08), -.02, -Math.sin(a + .08)).multiplyScalar(FL[i][1]).add(m); return [m, t]; }); return { S, E, W, F }; };
  const LEG = (s, fore) => fore ? [V3(s * .27, -.2, .66), V3(s * .29, -.62, .66), V3(s * .29, -1.0, .66), V3(s * .29, -1.06, .85)] : [V3(s * .3, -.16, -.75), V3(s * .32, -.64, -.75), V3(s * .32, -1.06, -.75), V3(s * .32, -1.12, -.5)];
  for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R', J = WJ(s), e = EYE(s);
    DEF['eye' + k] = { parent: 'head', pos: [e.x, e.y, e.z] }; DEF['lid' + k] = { parent: 'head', pos: [e.x, e.y, e.z] };
    DEF['wh' + k] = { parent: 'chest', pos: J.S.toArray() }; DEF['wf' + k] = { parent: 'wh' + k, pos: J.E.toArray() }; DEF['ww' + k] = { parent: 'wf' + k, pos: J.W.toArray() };
    J.F.forEach((f, i) => { DEF['w' + i + 'a' + k] = { parent: 'ww' + k, pos: J.W.toArray() }; DEF['w' + i + 'b' + k] = { parent: 'w' + i + 'a' + k, pos: f[0].toArray() }; });
    for (const [p, fore, par] of [['f', 1, 'chest'], ['b', 0, 'hip']]) { const L = LEG(s, fore); DEF[p + 'u' + k] = { parent: par, pos: L[0].toArray() }; DEF[p + 'l' + k] = { parent: p + 'u' + k, pos: L[1].toArray() }; DEF[p + 'f' + k] = { parent: p + 'l' + k, pos: L[2].toArray() }; } }
  const NAMES = Object.keys(DEF), BI = {}; NAMES.forEach((n, i) => BI[n] = i);
  const RP = n => V3(...DEF[n].pos);                              // rest joint position (model)

  // ---------------------------------------------------------------- vertex accumulator: every part says its bones, region and shader keys
  // region ids: 0 skin, 1 horn, 2 claw, 3 tooth, 4 strut, 5 spine, 6 lid, 7 ray (frill strut)
  function Acc() { return { P: [], N: [], U: [], K: [], SI: [], SW: [], R: [], A: [], B: [], I: [], n: 0 }; }
  const top4 = (w, si, sw) => { w.sort((a, b) => b[1] - a[1]); let s = 0; for (let q = 0; q < 4; q++) { const e = w[q]; si.push(e ? e[0] : 0); sw.push(e ? e[1] : 0); s += e ? e[1] : 0; } for (let q = 1; q <= 4; q++) sw[sw.length - q] /= s || 1; };
  // fn(x,y,z,u,v,nx,ny,nz) -> { w:[[bone,w]..], r, a (belly/mouth etc 0..1), b, k:[spk, scales, belly|-1 membrane] }
  function put(acc, g, fn, mtx) { if (mtx) g = g.clone().applyMatrix4(mtx); if (!g.attributes.normal) g.computeVertexNormals(); const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, base = acc.n;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), o = fn(x, y, z, U ? U.getX(i) : 0, U ? U.getY(i) : 0, N.getX(i), N.getY(i), N.getZ(i), i);
      acc.P.push(x, y, z); acc.N.push(N.getX(i), N.getY(i), N.getZ(i)); acc.U.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0); const k = o.k || [0, 0, 0]; acc.K.push(k[0], k[1], k[2]); acc.R.push(o.r || 0); acc.A.push(o.a || 0); acc.B.push(o.b || 0); top4(o.w.map(e => [BI[e[0]], e[1]]), acc.SI, acc.SW); }
    const ix = g.index ? g.index.array : [...Array(P.count).keys()]; for (let i = 0; i < ix.length; i++) acc.I.push(ix[i] + base); acc.n += P.count; }
  function toGeo(acc, paint) { const g = new THREE.BufferGeometry(), n = acc.n, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { paint(i, acc, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(acc.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.U, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(acc.K, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(acc.SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(acc.SW, 4)); g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(acc.I, 1) : new THREE.Uint16BufferAttribute(acc.I, 1)); return g; }
  const one = b => [[b, 1]];
  // ---- spine weights by rest z (intervals owned by the joint nearer the root, smooth blends across each joint)
  const SPB = [-3.94, -3.58, -3.16, -2.74, -2.32, -1.92, -1.54, -1.18, -.8, .55, .95, 1.27, 1.59, 1.91, 2.2, 2.45], SPO = ['t8', 't7', 't6', 't5', 't4', 't3', 't2', 't1', 'hip', 'root', 'chest', 'n1', 'n2', 'n3', 'n4', 'n5', 'head'];
  function spineW(z) { let i = 0; while (i < SPB.length && z >= SPB[i]) i++; const lo = SPB[i - 1], hi = SPB[i], w = [];
    const hw = j => Math.min(.11, .38 * Math.min(SPB[j] - (SPB[j - 1] === undefined ? SPB[j] - 1 : SPB[j - 1]), (SPB[j + 1] === undefined ? SPB[j] + 1 : SPB[j + 1]) - SPB[j]));
    let me = 1; if (lo !== undefined) { const h = hw(i - 1), t = sm(lo - h, lo + h, z); if (t < 1) { w.push([SPO[i - 1], 1 - t]); me = t; } }
    if (hi !== undefined) { const h = hw(i), t = sm(hi - h, hi + h, z); if (t > 0) { w.push([SPO[i + 1], t * me]); me *= 1 - t; } } w.push([SPO[i], me]); return w; }

  // ---------------------------------------------------------------- trunk: one lofted tube, tail tip to inside the skull
  const Wk = keyedCR([[-4.06, .02], [-3.8, .045], [-3.2, .08], [-2.4, .135], [-1.6, .205], [-1.0, .31], [-.75, .4], [-.3, .5], [.2, .52], [.6, .48], [.88, .38], [1.08, .27], [1.5, .2], [2.0, .17], [2.35, .155], [2.62, .13]]);
  const KT = keyedCR([[-4, 1], [-1.2, .92], [-.5, .8], [.5, .82], [1.1, .95], [2.6, 1.05]]), KB = keyedCR([[-4, .95], [-1.1, 1.0], [-.5, 1.18], [.3, 1.16], [1.0, 1.05], [2.6, 1.1]]), YS = keyedCR([[-4, 0], [.5, .02], [1.0, .045], [2.6, .06]]);
  const ridgeK = z => sm(-3.95, -3.5, z) * (1 - sm(.75, 1.05, z));
  function trunk(acc) { const SIDES = 40, rows = [], zs = []; let z = -4.06; while (z < 2.62) { zs.push(z); z += clamp(.22 * Wk(z), .02, .058); } zs.push(2.62);
    let us = 0; const pos = [], uv = [], idx = [], meta = [];
    zs.forEach((z, i) => { const w = Wk(z), rt = w * KT(z), rb = w * KB(z), ys = YS(z), per = TAU * w * .92; if (i) us += (z - zs[i - 1]) / (per / 40 * .8);
      for (let j = 0; j <= SIDES; j++) { const th = j / SIDES * TAU, c = Math.cos(th), s = Math.sin(th), d = Math.min(th, TAU - th), rid = 1 + .09 * ridgeK(z) * Math.exp(-(d / .16) * (d / .16));
        const mus = 1 + (.13 * Math.exp(-(((z - .62) / .2) ** 2)) + .15 * Math.exp(-(((z + .72) / .24) ** 2))) * sm(-.5, .4, c) * Math.abs(s), x = w * s * rid * mus * (1 - .04 * Math.max(0, -c)), y = ys + (c > 0 ? rt : rb) * c * rid; pos.push(x, y, z); uv.push(us, j / SIDES * 40); meta.push(c, z); } });
    const R = SIDES + 1; for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < SIDES; j++) { const a = i * R + j, b = a + R; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const tip = pos.length / 3; pos.push(0, YS(-4.08), -4.08); uv.push(0, 0); meta.push(1, -4.08); for (let j = 0; j < SIDES; j++) idx.push(tip, j + 1, j);
    const g = Geo.normals(Geo.make(pos, null, uv, idx), true); let q = 0;
    put(acc, g, (x, y, z) => { const c = meta[q * 2], zz = meta[q * 2 + 1]; q++; const w = spineW(zz), bel = sm(-.15, -.7, c);
      if (zz > 1.85 && zz < 2.7 && c < -.2) { const k = Math.exp(-(((zz - 2.3) / .22) ** 2)) * sm(-.2, -.7, c); w.forEach(e => e[1] *= 1 - k * .8); w.push(['thr', k * .8]); }
      return { w, r: 0, a: bel, k: [sm(-.35, .45, c), 1, bel] }; }); }

  // ---------------------------------------------------------------- head: SDF clay (upper skull + separate jaw), cached for both dragons
  let HEADG = null;
  function sculptHead() { if (HEADG) return HEADG; const E = SD.ell, mx = SD.mirX, col = (m, b) => new THREE.Color().setRGB(m, b, 0);
    const up = (x, y, z) => col(sm(-.034, -.05, y) * (1 - sm(.07, .1, Math.abs(x))) * sm(.1, .16, z), sm(-.02, -.1, y) * .7);
    const ex = .112, ey = .085, ez = .27;
    const U = Sculpt.build({ res: 62, bb: [-.27, -.2, -.2, .27, .3, .68], parts: [
      { f: E(0, .07, .1, .165, .14, .19), color: up }, { f: mx(E(.085, .135, .2, .075, .05, .11)), color: up, k: .06 }, { f: E(0, .02, .38, .105, .085, .2), color: up, k: .08 },
      { f: E(0, .005, .56, .068, .058, .055), color: up, k: .05 }, { f: mx(E(.105, -.03, .15, .085, .085, .12)), color: up, k: .06 }, { f: E(0, .02, -.06, .14, .13, .12), color: up, k: .08 },
      { f: mx(SD.sph(.1, .165, .3, .022)), color: up, k: .03 }, { f: E(0, .12, .4, .05, .03, .16), color: up, k: .05 },
      { f: SD.box(0, -.15, .42, .2, .1, .32), cut: true, k: .015 }, { f: mx(SD.sph(ex, ey, ez, .057)), cut: true, k: .012 }, { f: mx(SD.sph(.032, .035, .6, .016)), cut: true, k: .008 }] });
    const lo = (x, y, z) => col(sm(-.072, -.06, y) * (1 - sm(.055, .08, Math.abs(x))), sm(-.08, -.125, y));
    const J = Sculpt.build({ res: 44, bb: [-.2, -.2, -.05, .2, -.02, .64], parts: [
      { f: E(0, -.085, .32, .088, .046, .25), color: lo }, { f: E(0, -.078, .53, .056, .04, .06), color: lo, k: .04 }, { f: mx(E(.075, -.085, .13, .07, .06, .1)), color: lo, k: .06 },
      { f: E(0, -.068, .3, .05, .016, .17), color: lo, k: .02 }, { f: SD.box(0, .04, .42, .07, .1, .3), cut: true, k: .015 }] });
    return HEADG = { U, J }; }
  const tubeAlong = (pts, rad, sides, smooth) => Geo.tube(pts, rad, sides, { smooth });
  const cone = (r, h, seg = 6) => Geo.cyl(r, 0, h, seg).translate(0, h / 2, 0);
  const aimM = (p, d, s = 1) => { const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()); return new THREE.Matrix4().compose(p, q, V3(s, s, s)); };
  const bez = (A, B, Cc, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n; o.push(V3().addScaledVector(A, (1 - t) ** 2).addScaledVector(B, 2 * t * (1 - t)).addScaledVector(Cc, t * t)); } return o; };
  // chain weights along a tube by arc length: joints at arc positions L[], bones[], blend half-width h; root blend to body bone over the first rb metres
  const chainW = (u, L, bones, h, body, rb) => { let i = 0; while (i < L.length && u > L[i]) i++; const w = []; let me = 1;
    if (i > 0) { const t = sm(L[i - 1] - h, L[i - 1] + h, u); if (t < 1) { w.push([bones[i - 1], 1 - t]); me = t; } }
    if (i < L.length) { const t = sm(L[i] - h, L[i] + h, u); if (t > 0 && bones[i + 1]) { w.push([bones[i + 1], t * me]); me *= 1 - t; } }
    w.push([bones[i], me]); if (body && u < rb) { const k = 1 - sm(0, rb, u); w.forEach(e => e[1] *= 1 - k * .9); w.push([body, k * .9]); } return w; };

  // ---------------------------------------------------------------- looks: two dragons, one rig (colours in sRGB hex -> linear)
  const LOOK = {
    noct: { scale: 1, base: '#16151f', back: '#1b1d33', belly: '#2b2d40', mouth: '#7a2a44', horn: '#2e3146', hornTip: '#c7a457', claw: '#0b0a10', tooth: '#efe6d0', strut: '#0d0e1c', spine: '#1d2446', spineTip: '#d6b04c', ray: '#1a2a62',
      mem: '#22357a', memEdge: '#0c1230', frill: '#2b49a0', frillTip: '#16245a', fin: '#26408f', finTip: '#c9a24a', spk: '#ffcf5e', spkE: .55, spkM: .9, sheen: '#4a6fe0', sheenK: .75, iris: '#f2a228', ring: '#6e3404', slit: true,
      horns: [[[.085, .17, .05], [.155, .22, -.2], [.13, .31, -.5], .05, .007], [[.14, .02, .02], [.2, 0, -.12], [.23, .03, -.26], .026, .005]], crest: .38, fan: [.17, .13], spkMem: .6 },
    lune: { scale: .94, base: '#f2eef8', back: '#ebe4f6', belly: '#fcf4ea', mouth: '#c95b7d', horn: '#f3e6d6', hornTip: '#d9b9c9', claw: '#cbbcd8', tooth: '#fffaf0', strut: '#d7c8e6', spine: '#e7bdd8', spineTip: '#d0508f', ray: '#a52f6a',
      mem: '#efe6f6', memEdge: '#d9a9d6', frill: '#d0508f', frillTip: '#f39ac2', fin: '#e2b4dc', finTip: '#d0508f', spk: '#c97fb8', spkE: 0, spkM: 0, sheen: '#ffffff', sheenK: .3, iris: '#9fd8f6', ring: '#3a6fae', slit: false,
      horns: [[[.075, .17, .08], [.115, .24, -.04], [.1, .285, -.18], .037, .006]], crest: 1, fan: [.34, .4, .36, .26], spkMem: 0 } };
  for (const k in LOOK) { const L = LOOK[k]; for (const q in L) if (typeof L[q] === 'string' && L[q][0] === '#') L[q] = hex(L[q]); }

  // ---------------------------------------------------------------- clay body: trunk + head + everything rigid on a bone
  function bodyAcc(look, rays) { const acc = Acc(), HG = sculptHead(), toH = new THREE.Matrix4().makeTranslation(H0.x, H0.y, H0.z);
    trunk(acc);
    for (const [g, b] of [[HG.U, 'head'], [HG.J, 'jaw']]) { const cA = g.attributes.color; put(acc, g, (x, y, z, u, v, nx, ny, nz, i) => ({ w: one(b), r: 0, a: cA.getY(i), b: cA.getX(i), k: [b === 'head' ? sm(-.1, .6, ny) * (1 - cA.getY(i)) : 0, 0, 0] }), toH); }
    const tooth = (p, d, h, r, b) => put(acc, cone(r, h, 5), () => ({ w: one(b), r: 3 }), aimM(p.add(H0), d));
    for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R';
      for (let i = 0; i < 8; i++) { const z = .2 + i * .056, x = s * (.086 - .072 * (z - .2) / .42); tooth(V3(x, -.04, z), V3(s * .12, -1, .15), i === 5 ? .052 : .032, i === 5 ? .012 : .0085, 'head'); }
      for (let i = 0; i < 6; i++) { const z = .24 + i * .055, x = s * (.066 - .055 * (z - .24) / .3); tooth(V3(x, -.075, z), V3(s * .1, 1, .12), .027, .008, 'jaw'); }
      for (const H of look.horns) { const pts = bez(V3(s * H[0][0], H[0][1], H[0][2]), V3(s * H[1][0], H[1][1], H[1][2]), V3(s * H[2][0], H[2][1], H[2][2]), 16).map(p => p.add(H0)); let Lt = 0; for (let i = 1; i < pts.length; i++) Lt += pts[i].distanceTo(pts[i - 1]);
        put(acc, Geo.tube(pts, u => lerp(H[3], H[4], Math.pow(u, .8)) * (1 + .08 * Math.sin(u * 44) * (1 - u)), 9), (x, y, z, u) => ({ w: one('head'), r: 1, b: clamp(u / Lt) })); }
      // legs: one tube socket -> knee -> ankle -> toe base, toes with claws
      for (const [p, fore] of [['f', 1], ['b', 0]]) { const L = LEG(s, fore), l0 = .12, l1 = l0 + L[0].distanceTo(L[1]), l2 = l1 + L[1].distanceTo(L[2]), lt = l2 + L[2].distanceTo(L[3]);
        const rad = fore ? keyedLin([[0, .12], [.15, .13], [.45, .085], [.52, .074], [.86, .058], [1, .05]]) : keyedLin([[0, .17], [.12, .19], [.3, .16], [.48, .1], [.56, .08], [.86, .058], [1, .05]]);
        put(acc, Geo.tube([L[0].clone().add(V3(-s * .04, .12, 0)), ...L], rad, 12, { smooth: 26 }), (x, y, z, u) => ({ w: chainW(u, [l1, l2], [p + 'u' + k, p + 'l' + k, p + 'f' + k], .07, fore ? 'chest' : 'hip', .2), a: .15 }));
        const fb = p + 'f' + k, toes = fore ? [-.4, 0, .4] : [-.42, 0, .42, PI];
        toes.forEach(a => { const d = V3(s * Math.sin(a), -.22, Math.cos(a)).normalize(), b0 = L[3].clone().addScaledVector(d, -.04), len = a === PI ? .08 : fore ? .13 : .16, e = b0.clone().addScaledVector(d, len);
          put(acc, Geo.tube([b0, e], [.036, .022], 8), () => ({ w: one(fb), a: .2 })); put(acc, cone(.02, .065, 6), () => ({ w: one(fb), r: 2 }), aimM(e.clone().addScaledVector(d, -.01), d.clone().add(V3(0, -.55, 0)))); }); }
      // wing arm, knuckle, thumb claw, finger struts
      const J = WJ(s), arm = [J.S.clone().add(V3(-s * .14, -.03, 0)), J.S, J.E, J.W], la = arm[0].distanceTo(J.S), lb = la + J.S.distanceTo(J.E), lc = lb + J.E.distanceTo(J.W);
      put(acc, Geo.tube(arm, keyedLin([[0, .13], [.06, .115], [.37, .078], [.42, .07], [.96, .05], [1, .055]]), 12, { smooth: 30 }), (x, y, z, u) => ({ w: chainW(u, [la + .02, lb, lc - .04], ['chest', 'wh' + k, 'wf' + k, 'ww' + k], .07) }));
      put(acc, Geo.sphere(.066, 12, 8), () => ({ w: one('ww' + k) }), new THREE.Matrix4().makeTranslation(J.W.x, J.W.y, J.W.z));
      put(acc, cone(.034, .17, 7), () => ({ w: one('ww' + k), r: 2 }), aimM(J.W.clone().add(V3(0, .03, .03)), V3(s * .35, .2, .92)));
      J.F.forEach((f, i) => { const l1 = J.W.distanceTo(f[0]); put(acc, Geo.tube([J.W, f[0], f[1]], keyedLin([[0, .044], [.45, .026], [1, .008]]), 7, { smooth: 14 }), (x, y, z, u) => ({ w: chainW(u, [l1], ['w' + i + 'a' + k, 'w' + i + 'b' + k], .07), r: 4 })); });
      // eyelids: a clay shell over each bead; the lid bone turns it down over the eye
      const e = EYE(s), f = EF(s), uu = V3(0, 1, 0).addScaledVector(f, -f.y).normalize(), ax = uu.clone().multiplyScalar(Math.cos(.55)).addScaledVector(f, -Math.sin(.55));
      put(acc, new THREE.SphereGeometry(.0625, 20, 9, 0, TAU, 0, 1.32), (x, y, z) => ({ w: one('lid' + k), r: 6, b: 0 }), aimM(e.clone(), ax)); }
    // dorsal spines from the shoulders to the tail fin
    for (let z = .85; z > -3.72; z -= .055 + .26 * Wk(z)) { const w = Wk(z), y = YS(z) + w * KT(z) * 1.07, h = .035 + .13 * w, p = V3(0, y - .012, z);
      put(acc, cone(.022 + .06 * w, h, 6), (x, yy) => ({ w: spineW(z), r: 5, b: clamp((yy - p.y) / h) }), aimM(p, V3(0, 1, -.8))); }
    rays.forEach(R => put(acc, Geo.tube([R.a, R.b], [R.r, R.r * .3], 5), (x, y, z) => ({ w: R.w(x, y, z), r: 7 })));
    return acc; }
  function paintBody(L) { const t = new THREE.Color(); return (i, acc, c) => { const r = acc.R[i], a = acc.A[i], b = acc.B[i], j = h1(i * .37) - .5;
    if (r === 0) { c.copy(L.base).lerp(L.back, clamp(acc.K[i * 3] * .8)).lerp(L.belly, a); if (b > 0) c.lerp(L.mouth, b); }
    else if (r === 1) c.copy(L.horn).lerp(L.hornTip, sm(.45, 1, b)); else if (r === 2) c.copy(L.claw); else if (r === 3) c.copy(L.tooth); else if (r === 4) c.copy(L.strut);
    else if (r === 5) c.copy(L.spine).lerp(L.spineTip, sm(.4, 1, b)); else if (r === 6) c.copy(L.base).lerp(L.back, .5).multiplyScalar(.92); else c.copy(L.ray);
    c.multiplyScalar(1 + j * .06); }; }

  // ---------------------------------------------------------------- membranes: Coons patches on the finger bones, frills and fins as ray fans
  const SEG = {}; for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R', J = WJ(s); SEG['wh' + k] = [J.S, J.E]; SEG['wf' + k] = [J.E, J.W]; SEG['ww' + k] = [J.W, J.W.clone().add(V3(s * .05, 0, 0))];
    J.F.forEach((f, i) => { SEG['w' + i + 'a' + k] = [J.W, f[0]]; SEG['w' + i + 'b' + k] = [f[0], f[1]]; }); }
  SEG.chest = [V3(0, .1, .9), V3(0, .1, .2)]; SEG.root = [V3(0, .08, .2), V3(0, .05, -.6)]; SEG.hip = [V3(0, .05, -.6), V3(0, .03, -1.2)]; SEG.n1 = [V3(0, .1, .95), V3(0, .1, 1.3)];
  const dseg = (p, A, B) => { const ab = V3().subVectors(B, A), t = clamp(V3().subVectors(p, A).dot(ab) / Math.max(1e-6, ab.lengthSq())); return p.distanceTo(V3().copy(A).addScaledVector(ab, t)); };
  const idw = bones => (x, y, z) => { const p = V3(x, y, z); return bones.map(b => { const d = dseg(p, SEG[b][0], SEG[b][1]); return [b, 1 / (d * d + .01) ** 2]; }); };
  const poly = pts => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1])); return u => { const x = u * L[L.length - 1]; let i = 1; while (i < L.length - 1 && x > L[i]) i++; return V3().lerpVectors(pts[i - 1], pts[i], clamp((x - L[i - 1]) / (L[i] - L[i - 1]))); }; };
  const line = (A, B) => u => V3().lerpVectors(A, B, u);
  function panel(acc, c0, c1, d0, d1, nu, nv, camb, wfn, kind, edge, spk) { const P00 = c0(0), P10 = c0(1), P01 = c1(0), P11 = c1(1), pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv, p = V3().addScaledVector(c0(u), 1 - v).addScaledVector(c1(u), v).addScaledVector(d0(v), 1 - u).addScaledVector(d1(v), u)
      .addScaledVector(P00, -(1 - u) * (1 - v)).addScaledVector(P10, -u * (1 - v)).addScaledVector(P01, -(1 - u) * v).addScaledVector(P11, -u * v); p.y += camb * Math.sin(PI * u) * Math.sin(PI * v); pos.push(p.x, p.y, p.z); uv.push(u, v); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    put(acc, Geo.make(pos, null, uv, idx), (x, y, z, u, v) => { const e = edge(u, v); return { w: wfn(x, y, z), r: kind, a: e[0], b: e[1], k: [spk, 0, -1] }; }); }
  // a fan of rays (bases[i] -> tips[i]) with membrane between them, scalloped between the tips
  function fan(acc, rays, A, B, wfn, kind, nu, r, spk) { for (let j = 0; j < A.length - 1; j++) { const a0 = A[j], a1 = A[j + 1], b0 = B[j], b1 = B[j + 1];
      panel(acc, line(a0, b0), line(a1, b1), line(a0, a1), v => V3().lerpVectors(b0, b1, v).lerp(V3().lerpVectors(a0, a1, v), .2 * Math.sin(PI * v)), nu, 3, 0, wfn, kind, (u, v) => [u, 0], spk); }
    A.forEach((a, j) => rays.push({ a, b: B[j], r, w: wfn })); }
  const crestW = (x, y, z) => z > 2.38 ? one('head') : spineW(z);
  function membraneAcc(L, rays) { const acc = Acc(), spk = L.spkMem;
    for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R', J = WJ(s), S1 = V3(s * .3, .2, .62), Hp = V3(s * .27, .06, -1.02), Np = V3(s * .15, .17, 1.05), arm = poly([S1, J.E, J.W]), fin = J.F.map(f => poly([J.W, f[0], f[1]]));
      for (let i = 0; i < 3; i++) { const tA = J.F[i][1], tB = J.F[i + 1][1];
        panel(acc, fin[i], fin[i + 1], () => J.W, v => V3().lerpVectors(tA, tB, v).lerp(J.W, .24 * Math.sin(PI * v)), 16, 7, .07 + .02 * i, idw(['w' + i + 'a' + k, 'w' + i + 'b' + k, 'w' + (i + 1) + 'a' + k, 'w' + (i + 1) + 'b' + k, 'ww' + k]), 0, (u, v) => [sm(.72, 1, u), Math.max(sm(.25, 0, v), sm(.75, 1, v))], spk); }
      const tip4 = J.F[3][1];
      panel(acc, arm, u => V3().lerpVectors(Hp, tip4, u).lerp(J.E, .2 * Math.sin(PI * u)), v => V3().lerpVectors(S1, Hp, v), fin[3], 14, 12, .14, idw(['chest', 'root', 'hip', 'wh' + k, 'wf' + k, 'ww' + k, 'w3a' + k, 'w3b' + k]), 0, (u, v) => [sm(.75, 1, v), Math.max(sm(.2, 0, v), sm(.85, 1, u))], spk);
      const Wf = J.W.clone().add(V3(0, .01, .1));
      panel(acc, u => V3().lerpVectors(Np, Wf, u).add(V3(0, .01, .09 * Math.sin(PI * u))), arm, v => V3().lerpVectors(Np, S1, v), v => V3().lerpVectors(Wf, J.W, v), 14, 3, .02, idw(['n1', 'chest', 'wh' + k, 'wf' + k, 'ww' + k]), 0, (u, v) => [sm(.3, 0, v) * .6, sm(.6, 1, v)], spk);
      // head fans (behind the cheeks): Lune's big magenta frills, Noct's small ear fins
      const n = L.fan.length, A = [], B = []; for (let j = 0; j < n; j++) { const q = j / Math.max(1, n - 1), b = V3(s * .15, .07 - .13 * q, .03 - .05 * q).add(H0), d = V3(s, .75 - .9 * q, -.85).normalize(); A.push(b); B.push(b.clone().addScaledVector(d, L.fan[j])); }
      fan(acc, rays, A, B, () => one('head'), 1, 5, .011, 0);
      // tail fins
      const TA = [-3.28, -3.6, -3.88, -4.04].map(z => V3(s * .03, YS(z), z)), TB = [V3(s * .4, .01, -3.52), V3(s * .52, .02, -3.86), V3(s * .42, 0, -4.14), V3(s * .1, 0, -4.32)];
      fan(acc, rays, TA, TB, (x, y, z) => spineW(z), 2, 6, .016, 0); }
    // dorsal crest: forehead, over the skull, down the neck to the shoulders
    const path = poly([V3(0, .2, .2).add(H0), V3(0, .215, .06).add(H0), V3(0, .19, -.08).add(H0), ...[2.3, 2.0, 1.7, 1.4, 1.1, .9].map(z => V3(0, YS(z) + Wk(z) * KT(z) * .98, z))]), N = 17, A = [], B = [];
    for (let j = 0; j < N; j++) { const q = j / (N - 1), b = path(q), h = L.crest * (.13 + .15 * Math.sin(PI * Math.min(1, q * 2.4 + .1)) * (1 - .55 * q)) * (1 - .4 * q); A.push(b); B.push(b.clone().add(V3(0, h, -.55 * h - .02))); }
    fan(acc, rays, A, B, crestW, 1, 5, .009, 0);
    return acc; }
  function paintMem(L) { return (i, acc, c) => { const r = acc.R[i], a = acc.A[i], b = acc.B[i];
    if (r === 0) c.copy(L.mem).lerp(L.memEdge, clamp(a * .85 + b * .45)); else if (r === 1) c.copy(L.frill).lerp(L.frillTip, sm(.25, 1, a)); else c.copy(L.fin).lerp(L.finTip, sm(.45, 1, a)); }; }
  function eyeAcc(L) { const acc = Acc(); for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R', e = EYE(s), f = EF(s), uu = V3(0, 1, 0).addScaledVector(f, -f.y).normalize(), rr = V3().crossVectors(uu, f);
    put(acc, new THREE.SphereGeometry(.055, 28, 20), (x, y, z) => { const d = V3(x, y, z).sub(e).normalize(), c = d.dot(f), px = d.dot(rr), py = d.dot(uu); return { w: one('eye' + k), r: 0, a: c, b: L.slit ? (px / .1) ** 2 + (py / .3) ** 2 : (px * px + py * py) / (.27 * .27) }; }, new THREE.Matrix4().makeTranslation(e.x, e.y, e.z)); } return acc; }
  function paintEye(L) { const dark = hex('#0b0a12'); return (i, acc, c) => { const a = acc.A[i], b = acc.B[i]; c.copy(L.iris).lerp(L.ring, sm(.8, .62, a)).lerp(dark, sm(.62, .5, a)); if (a > 0) c.lerp(dark, sm(1.15, .85, b)); }; }

  // ---------------------------------------------------------------- choreography: every pose is a pure function of film time
  const NP = 38, IX = { nP: 0, hP: 1, nY: 2, hY: 3, hR: 4, cP: 5, cY: 6, pP: 7, pY: 8, tP: 9, tY: 10, tW: 11, tPh: 12, WL: 13, WR: 21, fT: 29, fR: 30, bT: 31, gW: 32, jaw: 33, thr: 34, lid: 35, eY: 36, eP: 37 };
  const newPose = () => ({ p: V3(), q: new THREE.Quaternion(), a: new Float32Array(NP), F: [V3(), V3(), V3(), V3()] });
  const base = P => { P.a.fill(0); P.a[IX.WL + 5] = P.a[IX.WR + 5] = 1; P.a[IX.fT] = P.a[IX.bT] = 1; return P; };
  const setW = (a, w, el, sw, fo, tw, tip, spr, hl = 0, cup = 0) => { a[w] = el; a[w + 1] = sw; a[w + 2] = fo; a[w + 3] = tw; a[w + 4] = tip; a[w + 5] = spr; a[w + 6] = hl; a[w + 7] = cup; };
  function mix(A, B, k, O) { O.p.lerpVectors(A.p, B.p, k); O.q.slerpQuaternions(A.q, B.q, k); for (let i = 0; i < NP; i++) O.a[i] = A.a[i] + (B.a[i] - A.a[i]) * k;
    const lift = Math.sin(PI * k); for (let i = 0; i < 4; i++) { const d = A.F[i].distanceTo(B.F[i]); O.F[i].lerpVectors(A.F[i], B.F[i], k); O.F[i].y += lift * Math.min(.3, d * .5); } return O; }
  const _x = V3(), _y = V3(), _z = V3(), _m = new THREE.Matrix4(), UP = V3(0, 1, 0), _qa = new THREE.Quaternion();
  function qLook(F, U, q) { _z.copy(F).normalize(); _x.crossVectors(U, _z); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize(); _y.crossVectors(_z, _x); return q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); }
  const qMul = (q, ax, ang) => q.multiply(_qa.setFromAxisAngle(ax, ang));          // rotate in the model frame
  const AX = V3(1, 0, 0), AY = V3(0, 1, 0), AZ = V3(0, 0, 1);
  const cr = keys => { const ks = keys.map(k => [k[0], V3(k[1], k[2], k[3])]); return (t, out) => { if (t <= ks[0][0]) return out.copy(ks[0][1]); for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const a = ks[Math.max(0, i - 2)], b = ks[i - 1], c = ks[i], d = ks[Math.min(ks.length - 1, i + 1)], u = (t - b[0]) / (c[0] - b[0]), u2 = u * u, u3 = u2 * u; for (const k of ['x', 'y', 'z']) out[k] = .5 * (2 * b[1][k] + (-a[1][k] + c[1][k]) * u + (2 * a[1][k] - 5 * b[1][k] + 4 * c[1][k] - d[1][k]) * u2 + (-a[1][k] + 3 * b[1][k] - 3 * c[1][k] + d[1][k]) * u3); return out; } return out.copy(ks[ks.length - 1][1]); }; };
  const herm = (t, t0, t1, A, vA, B, vB, out) => { const d = t1 - t0, u = clamp((t - t0) / d), u2 = u * u, u3 = u2 * u; return out.set(0, 0, 0).addScaledVector(A, 2 * u3 - 3 * u2 + 1).addScaledVector(vA, (u3 - 2 * u2 + u) * d).addScaledVector(B, -2 * u3 + 3 * u2).addScaledVector(vB, (u3 - u2) * d); };
  // ---- wing beats: the downstroke starts ON each flap_pair event for this dragon (who 'both' or its name; live events too)
  const fm = (e, who) => !e.who || e.who === 'both' || e.who === who;
  function flapAt(who, t) { let t0 = -99, v = .8; for (const e of Score.recent('flap_pair', t + 1e-4, 2.6)) if (fm(e, who) && e.t > t0) { t0 = e.t; v = e.v; }
    let n = Score.next('flap_pair', t); while (n && !fm(n, who)) n = Score.next('flap_pair', n.t + 1e-5); return [t0, n ? n.t : 1e9, v]; }
  const FS = { el: 0, tip: 0, hl: 0, fo: 0, heave: 0 };
  function beat(u, D, v, amp, gl) { const Td = Math.min(.42, .46 * D), Tu = Math.min(.55, .5 * D), top = .95 * v * amp + gl * .3, bot = -.62 * v * amp + gl * .4, rec = k => lerp(bot, gl, smoother(0, 1, k));
    FS.el = gl; FS.tip = FS.hl = FS.fo = FS.heave = 0; if (u < 0 || u > 60) { if (D - Math.max(u, 0) < Tu && D < 60) u = Math.max(u, 0); else return FS; }
    if (u < Td) { const k = u / Td; FS.el = lerp(top, bot, smoother(0, 1, k)); FS.tip = .5 * Math.sin(PI * k) * amp; FS.hl = .32 * Math.sin(PI * k) * amp; FS.heave = Math.sin(PI * k) * v; }
    else if (u > D - Tu) { const k = (u - (D - Tu)) / Tu, s0 = rec((D - Tu - Td) / .55); FS.el = lerp(s0, top, smoother(0, 1, k)); FS.tip = -.42 * Math.sin(PI * k) * amp; FS.hl = -.38 * Math.sin(PI * k) * amp; FS.fo = .34 * Math.sin(PI * k) * amp; }
    else { const k = (u - Td) / .55; FS.el = rec(k); FS.tip = .12 * (1 - clamp(k)); } return FS; }
  const wingsFromEvents = (who, t, amp, gl) => { const f = flapAt(who, t); return beat(t - f[0], f[1] - f[0], f[2], amp, gl); };
  const wingsCycle = (t, per, ph, amp, gl) => { const k = Math.floor((t - ph) / per); return beat(t - (ph + k * per), per, .85, amp, gl); };
  function putWings(a, f, asym = 0, sw = .05, tw = 0) { setW(a, IX.WL, f.el + asym, sw, f.fo, tw, f.tip, 1, f.hl); setW(a, IX.WR, f.el - asym, sw, f.fo, tw, f.tip, 1, f.hl); }

  // ---- LOVE: a centre line from far west toward the island; the two play round it
  const LV = (b, bt = 0) => T('love', b, bt), BT = Score.byName.attack.beatS, NB = Score.byName.nest.beatS, G0 = M.NEST.y, EGG = V3(0, .25, 0).add(M.NEST);
  const centre = cr([[LV(0) - 4, -292, 38, 58], [LV(0), -250, 34, 46], [LV(1), -228, 31, 36], [LV(2), -206, 29, 25], [LV(3), -183, 28, 14], [LV(4), -161, 30, 5], [LV(5), -140, 31, -2], [LV(6), -120, 29, -6], [LV(7), -103, 27, -5], [LV(8), -88, 27, -1], [LV(8, 2), -77, 27, 2.5], [C.HEART1, -70, 26, 4], [C.LAND, -66, 26, 5]]);
  const Fc = V3(), Sc = V3(), Uc = V3(), _p = V3(), _c = V3(), _c2 = V3();
  const cFrame = t => { centre(t + .3, Fc); centre(t - .3, _c2); Fc.sub(_c2).normalize(); Sc.crossVectors(Fc, UP).normalize(); Uc.crossVectors(Sc, Fc); };
  const PHI = t => TAU * smoother(LV(2), LV(4, 2), t);
  function rel(t, a, l, u, phi, out) { cFrame(t); const c = Math.cos(phi), s = Math.sin(phi); return centre(t, out).addScaledVector(Fc, a).addScaledVector(Sc, l * c - u * s).addScaledVector(Uc, l * s + u * c); }
  const aL0 = keyedCR([[LV(0), 0], [LV(5), 0], [LV(5, 2), 7], [LV(6), 13]]), lL0 = keyedCR([[LV(0), 2.6], [LV(5), 2.6], [LV(6), .8]]), uL0 = keyedCR([[LV(0), .5], [LV(5), .4], [LV(6), 1.6]]);
  const preL = (t, out) => rel(t, aL0(t), lL0(t), uL0(t), PHI(t), out);
  const TL0 = LV(6), TL1 = LV(7, 1.2), RL = 7.2, LP0 = preL(TL0, V3()), LF0 = V3().subVectors(preL(TL0 + .05, V3()), preL(TL0 - .05, V3())).setY(0).normalize(), LS0 = V3().crossVectors(LF0, UP);
  const loopL = (t, out) => { const th = TAU * (t - TL0) / (TL1 - TL0); return out.copy(LP0).addScaledVector(LF0, RL * Math.sin(th)).addScaledVector(UP, RL * (1 - Math.cos(th))).addScaledVector(LS0, 1.6 * Math.sin(th / 2)); };
  const relE = (() => { cFrame(TL1); centre(TL1, _p); const d = V3().subVectors(LP0, _p); return [d.dot(Fc), d.dot(Sc), d.dot(Uc)]; })();
  const aL1 = keyedCR([[TL1, relE[0]], [TL1 + .5, relE[0] + 2.5], [LV(8), 0], [C.LAND, 0]]), lL1 = keyedCR([[TL1, relE[1]], [LV(7, 2.6), 1.8], [LV(8), 2.6], [C.LAND, 2.6]]), uL1 = keyedCR([[TL1, relE[2]], [TL1 + .75, relE[2] - 7.5], [LV(8) - .4, .2], [C.LAND, .3]]);
  const luneFly = (t, out) => t < TL0 ? preL(t, out) : t < TL1 ? loopL(t, out) : rel(t, aL1(t), lL1(t), uL1(t), 0, out);
  const DEL = .8, wFol = t => smoother(LV(5, .8), LV(5, 2.4), t) * (1 - smoother(LV(8) - 1.2, LV(8) - .1, t));
  const _nf = V3();
  function noctFly(t, out) { rel(t, 0, -2.6, -.2, PHI(t), out); const w = wFol(t); if (w > 0) { luneFly(t - DEL, _nf); cFrame(t); _nf.addScaledVector(Sc, -1.3).addScaledVector(Uc, -.6); out.lerp(_nf, w); } return out; }
  const FLY = { noct: noctFly, lune: luneFly };
  // sung lines and calls turn the heads toward each other
  const singW = (who, t) => { let s = 0; for (const d of [0, .2, .4]) { s = Math.max(s, Score.sing(t - d, who).a, .75 * Score.sing(t - d, who === 'noct' ? 'lune' : 'noct').a); } for (const v of Score.sounds) if ((v.who === 'noct' || v.who === 'lune') && t > v.t - .3 && t < v.t + v.dur + .4) s = Math.max(s, .8); return sm(0, .6, s); };
  const _a = V3(), _b = V3(), _v = V3(), _ac = V3(), _F = V3(), _U = V3(), _h = V3(), _qi = new THREE.Quaternion();
  // head aim toward a world point (weight w): splits yaw and pitch between neck and head
  function aim(P, target, w, nk = .55) { if (w <= 0) return; _h.set(0, .35, 2.5).applyQuaternion(P.q).add(P.p); _a.subVectors(target, _h).applyQuaternion(_qi.copy(P.q).invert()); const yaw = clamp(Math.atan2(_a.x, _a.z), -1.7, 1.7), pit = clamp(Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -1.1, 1.1), a = P.a;
    a[IX.nY] = lerp(a[IX.nY], yaw * nk, w); a[IX.hY] = lerp(a[IX.hY], yaw * (1 - nk), w); a[IX.nP] = lerp(a[IX.nP], .1 + pit * .45, w); a[IX.hP] = lerp(a[IX.hP], pit * .55 - .1, w); }
  // flight along a path: forward = velocity, up = the lift the wings must make (banks into turns, rolls over the top of a loop)
  function flyPose(who, t, P, path, roll, lite, amp = 1) { const h = .2; path(t, P.p); path(t + h, _a); path(t - h, _b); _v.subVectors(_a, _b).divideScalar(2 * h); const sp = _v.length() || 1;
    _ac.copy(_a).add(_b).addScaledVector(P.p, -2).divideScalar(h * h); _ac.y += 9.8; _F.copy(_v).divideScalar(sp); _ac.addScaledVector(_F, -_ac.dot(_F)); const L = _ac.length();
    _U.copy(UP).addScaledVector(_F, -_F.y).normalize(); if (L > .5) _U.lerp(_ac.divideScalar(L), sm(1, 5, L)).normalize();
    qLook(_F, _U, P.q); qMul(P.q, AX, -clamp((11 - sp) / 11, -.2, 1) * .3); if (roll) qMul(P.q, AZ, roll); if (lite) return P;
    base(P); const a = P.a, X = _x.set(1, 0, 0).applyQuaternion(P.q), Y = _y.set(0, 1, 0).applyQuaternion(P.q);
    path(t + 2 * h, _a); path(t - 2 * h, _b); _a.sub(P.p).normalize(); _b.subVectors(P.p, _b).normalize(); _a.sub(_b).divideScalar(2 * h); const yr = _a.dot(X), pr = _a.dot(Y);
    const f = wingsFromEvents(who, t, amp, .14), hv = f.heave; putWings(a, f, clamp(yr * .08, -.2, .2), .05 + .1 * clamp((11 - sp) / 8, 0, 1), -.12 * hv); P.p.addScaledVector(Y, .2 * hv);
    const f2 = wingsFromEvents(who, t - .14, amp, .14);
    a[IX.nY] = clamp(yr * .22, -.5, .5); a[IX.hY] = clamp(yr * .2, -.45, .45); a[IX.tY] = clamp(-yr * .55, -.9, .9); a[IX.pY] = clamp(-yr * .12, -.3, .3); a[IX.cY] = clamp(yr * .06, -.15, .15);
    a[IX.nP] = .14 + clamp(pr * .1, -.3, .3) - .13 * f2.heave; a[IX.hP] = -.16 - clamp(pr * .06, -.2, .2) + .1 * f2.heave; a[IX.cP] = .04 * f2.heave;
    a[IX.tP] = -.06 - clamp(pr * .14, -.4, .4) + .14 * f2.heave; a[IX.tW] = .09; a[IX.tPh] = t * 2.4; a[IX.fT] = 1; a[IX.bT] = 1;
    const sw = singW(who, t); if (sw > .01) { const o = who === 'noct' ? 'lune' : 'noct'; FLY[o](t, _c); FLY[o](t + .1, _c2); _c2.sub(_c).normalize(); _c.addScaledVector(_c2, 2.6).y += .4; aim(P, _c, sw * .85); }
    return P; }

  // ---- HEART1: hover against the sun, backs to the camera (east), noses meeting at the top, outer wings the lobes, tails meeting below
  function heart(who, t, P, lite) { const sg = who === 'noct' ? 1 : -1, H = M.HEART1;      // sg = which model side faces the partner (+X Noct, -X Lune)
    P.p.set(H.x + .3, H.y + .1 + .1 * Math.sin(t * 2.2 + sg), H.z - sg * 2.15); qLook(_z.set(0, 1, -sg * .3), _y.set(1, 0, 0), P.q); if (lite) return P;
    base(P); const a = P.a, f = wingsFromEvents(who, t, .28, .05), out = sg > 0 ? IX.WR : IX.WL, inn = sg > 0 ? IX.WL : IX.WR;
    setW(a, out, .12 + f.el * .5, .78, 0, 0, -.15 + f.tip * .5, 1.08, f.hl * .5); setW(a, inn, .08 + f.el * .3, -.95, .5, 0, .1 + f.tip * .3, .92, f.hl * .3);
    a[IX.nY] = sg * 1.2; a[IX.hY] = sg * .5; a[IX.nP] = .1; a[IX.hP] = -.22; a[IX.cY] = sg * .14; a[IX.pY] = sg * .3; a[IX.tY] = sg * 1.45; a[IX.tP] = .05; a[IX.tW] = .03; a[IX.tPh] = t * 1.5;
    a[IX.fT] = .75; a[IX.bT] = .3; a[IX.lid] = .25; return P; }
  // ---- NEST marks (relative to the egg; the egg lane draws it at NEST + (0,.25,0))
  const NV = (x, z) => V3(x, 0, z).add(M.NEST).setY(G0), HV = (x, z) => V3(x, 0, z).normalize();
  const SN = NV(-1.5, -2.1), hSN = HV(.58, .81), SL = NV(-1.3, .15), hSL = HV(1, -.05), LN = NV(-.95, -1.05), hLN = HV(.85, .25), LL = NV(-.95, .95), hLL = HV(.85, -.25);
  const hNS = HV(.7, -.7), NS = V3().copy(EGG).setY(G0).addScaledVector(hNS, -.85), TDN = C.LAND + NB, TDL = C.LAND + 1.5 * NB, HS = .9, HL = .6;
  function stance(P, root, hd, sc, spread = 1, fwd = 1) { _x.crossVectors(UP, hd).normalize(); for (let i = 0; i < 4; i++) { const s = i & 1 ? -1 : 1, fore = i < 2; P.F[i].copy(root).addScaledVector(_x, s * .37 * spread * sc).addScaledVector(hd, (fore ? .8 * fwd : -.5) * sc).setY(G0); } }
  const standQ = (P, hd, pitch, roll = 0) => { qLook(hd, UP, P.q); qMul(P.q, AX, -pitch); if (roll) qMul(P.q, AZ, roll); };
  const breathe = t => .5 + .5 * Math.sin(TAU * Score.beatsAt(t) / 3);
  const APR = { noct: [V3().copy(SN).addScaledVector(hSN, -12.5).add(V3(-2, 7, -1)), V3().copy(hSN).multiplyScalar(9).add(V3(0, -3, 0))], lune: [V3().copy(SL).addScaledVector(hSL, -13).add(V3(0, 7.5, 2.5)), V3().copy(hSL).multiplyScalar(9.5).add(V3(0, -3.2, -1))] };
  // ---- LAND: a braking glide, legs reach, touchdown with weight; Noct then stands watching, Lune settles round the egg, neck curved over it
  function land(who, t, P, lite) { const n = who === 'noct', R = n ? SN : SL, hd = n ? hSN : hSL, td = n ? TDN : TDL, sc = LOOK[who].scale, ap = APR[who];
    if (t < td) { herm(t, C.LAND, td, ap[0], ap[1], _c.copy(R).setY(G0 + HS + .1), _c2.copy(hd).multiplyScalar(1.2).add(V3(0, -2.2, 0)), P.p); standQ(P, hd, .2 + .5 * sm(td - .9, td - .1, t)); }
    else { const dip = .2 * pulse(t, td, .06, .26) - .05 * ring(t, td + .2, 1.3, 3.2), hh = n ? HS : lerp(HS, .64, smoother(td + .45, td + 1.3, t)); P.p.copy(R).setY(G0 + hh - dip + .012 * breathe(t)); standQ(P, hd, .5 * (1 - smoother(td, td + .55, t)) - .06 * ring(t, td + .3, 1.2, 3)); }
    if (lite) return P; base(P); const a = P.a, k = sm(td - 1.0, td - .3, t), fo = smoother(td + .25, td + 1.4, t);
    const f = beat(t - (td - .75), .95, 1, 1.1, .25); setW(a, IX.WL, f.el * (1 - fo) + (n ? .05 : -.18) * fo, .45 * (1 - fo) + (n ? 0 : .35) * fo, n ? fo : fo * .7, 0, f.tip * (1 - fo), 1, f.hl, .4 * (1 - fo)); a.copyWithin(IX.WR, IX.WL, IX.WL + 8);
    a[IX.fT] = 1 - k; a[IX.bT] = 1 - k; a[IX.gW] = sm(td - .22, td, t); stance(P, R, hd, sc);
    const sp = pulse(t, td + .07, .1, .3); a[IX.nP] = .42 - .32 * sp; a[IX.hP] = -.32 + .22 * sp; a[IX.tP] = -.15 - .3 * pulse(t, td + .12, .1, .35); a[IX.tW] = .04; a[IX.tPh] = t;
    if (n) aim(P, t < C.EGG ? _c.copy(SL).setY(G0 + 1.6) : EGG, sm(td + .6, td + 1.6, t) * .8);
    else { const m = smoother(td + .4, td + 1.5, t); a[IX.nP] = lerp(a[IX.nP], -.62, m); a[IX.hP] = lerp(a[IX.hP], .34, m); a[IX.nY] = .12 * m; a[IX.lid] = .45 * m; a[IX.tY] = .5 * m; a[IX.pY] = .2 * m; }
    return P; }
  // ---- EGG: Lune rises off the egg (head up, wings lift), then lowers her head to look at it
  function rise(who, t, P, lite) { const sc = LOOK[who].scale, k = smoother(C.EGG, C.EGG + .8, t); P.p.copy(SL).setY(G0 + lerp(.64, HS + .05, k) + .012 * breathe(t)); standQ(P, hSL, .06 * k); if (lite) return P;
    base(P); const a = P.a; setW(a, IX.WL, lerp(-.18, .45, k) - .25 * sm(C.EGG + 1, C.EGG + 2, t), .3, lerp(.7, .45, k) + .4 * sm(C.EGG + 1, C.EGG + 2, t), 0, 0, 1); a.copyWithin(IX.WR, IX.WL, IX.WL + 8);
    a[IX.gW] = 1; stance(P, SL, hSL, sc); a[IX.nP] = lerp(-.62, .55, k); a[IX.hP] = lerp(.34, -.4, k); a[IX.tY] = .5; a[IX.pY] = .2; a[IX.tW] = .04; a[IX.tPh] = t; aim(P, EGG, sm(C.EGG + 1.1, C.EGG + 1.9, t), .45); a[IX.lid] = .3 * sm(C.EGG + 1.2, C.EGG + 2, t); return P; }
  // ---- CUDDLE: both lie curled round the egg, heads together at its east side, his resting on hers; tails ring the west side
  function lie(who, t, P, lite) { const n = who === 'noct', R = n ? LN : LL, hd = n ? hLN : hLL, sc = LOOK[who].scale; P.p.copy(R).setY(G0 + HL * sc + .015 * breathe(t)); standQ(P, hd, n ? .1 : .02); if (lite) return P;
    base(P); const a = P.a; a[IX.gW] = 1; stance(P, R, hd, sc, .95, .7);
    if (n) { a[IX.nY] = -.55; a[IX.hY] = -.12; a[IX.nP] = .28; a[IX.hP] = -.42; a[IX.hR] = -.12; a[IX.cY] = -.18; a[IX.pY] = -.25; a[IX.tY] = -1.05; a[IX.tP] = -.05; setW(a, IX.WL, .05, 0, 1, 0, 0, 1); setW(a, IX.WR, .32, -.15, .62, 0, .1, 1); a[IX.lid] = .42; }
    else { a[IX.nY] = .85; a[IX.hY] = .22; a[IX.nP] = -.12; a[IX.hP] = .05; a[IX.hR] = .1; a[IX.cY] = .22; a[IX.pY] = .35; a[IX.tY] = 1.7; a[IX.tP] = -.05; setW(a, IX.WL, .05, 0, 1, 0, 0, 1); a.copyWithin(IX.WR, IX.WL, IX.WL + 8); a[IX.lid] = .5; }
    a[IX.tW] = .025; a[IX.tPh] = t * .8; return P; }
  // ---- ERUPT: they spring up; heads snap to the volcano
  const VOLH = V3(0, 12, 0).add(M.VOLCANO);
  function alert(who, t, P, lite) { const n = who === 'noct', R = n ? LN : LL, hd = n ? hLN : hLL, sc = LOOK[who].scale; P.p.copy(R).setY(G0 + HS * sc + .03 * ring(t, C.ERUPT + .2, 2, 4)); standQ(P, hd, .12); if (lite) return P;
    base(P); const a = P.a; a[IX.gW] = 1; stance(P, R, hd, sc, 1.1); setW(a, IX.WL, .5, .15, .45, 0, 0, 1); a.copyWithin(IX.WR, IX.WL, IX.WL + 8);
    aim(P, VOLH, sm(C.ERUPT, C.ERUPT + .1, t), .5); a[IX.hY] += .22 * ring(t, C.ERUPT + .08, 2.4, 6); a[IX.hP] += .15 * ring(t, C.ERUPT + .08, 2.4, 6); a[IX.jaw] = n ? .15 : .3; a[IX.tW] = .12; a[IX.tPh] = t * 3; a[IX.tP] = .25; return P; }
  // ---- Noct: a wing-hop over the egg, then spreads his wings over the nest and roars up at Cinder
  const NH0 = C.CINDER_UP + 2 * BT, NH1 = NH0 + .62, NGO = C.WALL_CRASH - BT, NJ = C.DRIVE_BACK - 1.8, LGO = C.CINDER_UP + 2 * BT;
  function shield(who, t, P, lite) { const sc = LOOK.noct.scale, ht = HS * sc + .06;
    if (t < NH1) { herm(t, NH0, NH1, _a.copy(LN).setY(G0 + ht), V3(0, 4, 0), _b.copy(NS).setY(G0 + ht), V3(0, -3, 0), P.p); P.p.y += .55 * Math.sin(PI * clamp((t - NH0) / (NH1 - NH0))); qLook(_c.copy(hLN).lerp(hNS, smoother(NH0, NH1, t)), UP, P.q); }
    else { P.p.copy(NS).setY(G0 + ht - .18 * pulse(t, NH1, .05, .25) - .12 * sm(C.STRIKE_NEST - .4, C.STRIKE_NEST, t) * (1 - sm(C.FIGHT + .5, C.FIGHT + 1.5, t))); standQ(P, hNS, .18); }
    if (lite) return P; base(P); const a = P.a, air = sm(NH0 + .05, NH0 + .15, t) * (1 - sm(NH1 - .1, NH1, t)), sp = sm(C.STRIKE_NEST - .5, C.STRIKE_NEST - .05, t);
    a[IX.gW] = 1 - air; if (t < NH0 + .3) stance(P, LN, hLN, sc, 1.1); else stance(P, NS, hNS, sc, 1.25, 1.05);
    const f = beat(t - NH0, 1.1, 1, .9 * (1 - sp), .3); setW(a, IX.WL, lerp(f.el, -.32, sp) + .06 * ring(t, C.STRIKE_NEST, 3, 3) + .04 * Math.sin(t * 7), lerp(.1, .38, sp), lerp(.4 * (1 - air), 0, sp), .15 * sp, f.tip, lerp(1, 1.12, sp), f.hl, .3 * sp); a.copyWithin(IX.WR, IX.WL, IX.WL + 8);
    M.cinder(t, _c); aim(P, t < C.CINDER_UP + .5 ? VOLH : _c, .95, .5); a[IX.jaw] = .25 + .6 * sm(C.STRIKE_NEST - .35, C.STRIKE_NEST, t) * (1 - sm(C.FIGHT + .3, C.FIGHT + 1, t)); a[IX.thr] = a[IX.jaw] * .6;
    a[IX.tW] = .14; a[IX.tPh] = t * 3.4; a[IX.tP] = .15; a[IX.fT] = air; a[IX.bT] = air; return P; }
  // ---- fights: blows land ON 'hit' (anticipation from Score.next; a live hit still lands)
  const STK = { s: 0, j: 0 };
  function strike(t) { let s = 0, j = 0; for (const e of Score.recent('hit', t + 1e-4, .9)) { const u = t - e.t; s = Math.max(s, Math.exp(-u / .22)); }      // full extension exactly ON the hit, then recoil
    const n = Score.next('hit', t); if (n && n.t - t < .32) { const u = n.t - t; s = u < .1 ? Math.max(s, lerp(1, -.4, u / .1)) : s - .4 * sm(.32, .12, u); j = sm(.32, .12, u) * sm(0, .05, u); }   // wind up, jaw wide, snaps shut AT the hit
    STK.s = s; STK.j = j; return STK; }
  const _cv = V3(), _dn = V3(), _sd = V3(), _vd = V3();
  function cin(t) { M.cinder(t, _c); M.cinder(t + .08, _cv); M.cinder(t - .08, _vd); _cv.sub(_vd).divideScalar(.16); _dn.copy(M.NEST).sub(_c).setY(0).normalize(); _sd.crossVectors(UP, _dn).normalize(); }
  const offL = (t, out) => { cin(t); return out.copy(_c).addScaledVector(_dn, 4.2).addScaledVector(_sd, 1.3).add(_a.set(0, -3.3 + .3 * Math.sin(t * 3.1), 0)); };
  const offN = (t, out) => { cin(t); return out.copy(_c).addScaledVector(_dn, 3.4).addScaledVector(_sd, -2.9).add(_a.set(0, -1.2 + .3 * Math.sin(t * 2.7 + 1), 0)); };
  const offD = sg => (t, out) => { cin(t); _vd.copy(_cv).normalize(); _sd.crossVectors(UP, _vd).normalize(); return out.copy(_c).addScaledVector(_vd, -4.6).addScaledVector(_sd, sg * 2.5).add(_a.set(0, 1.9 + .25 * Math.sin(t * 3 + sg), 0)); };
  const DRV = { noct: offD(-1), lune: offD(1) };
  function grapple(who, t, P, lite, posFn, drive) { posFn(t, P.p); cin(t); const st = strike(t), act = who === 'lune' || t > NJ - .2 ? 1 : 0;
    _a.subVectors(_c, P.p).normalize(); P.p.addScaledVector(_a, 1.25 * st.s * act); if (drive) _F.copy(_cv).normalize().lerp(_a, .45).normalize(); else _F.copy(_a).add(_b.set(0, .55, 0)).normalize();
    qLook(_F, UP, P.q); qMul(P.q, AZ, .2 * Math.sin(t * 2.6 + (who === 'noct' ? 1.3 : 0)) + .25 * st.s * act * (who === 'noct' ? -1 : 1)); if (lite) return P;
    base(P); const a = P.a, f = wingsFromEvents(who, t, 1.15, .12); putWings(a, f, 0, .18, -.22 * f.heave); P.p.addScaledVector(_y.set(0, 1, 0).applyQuaternion(P.q), .3 * f.heave);
    aim(P, _c2.copy(_c).add(_b.set(0, 1.6, 0)), 1, .5); a[IX.nP] += .2 + .3 * st.s * act; a[IX.hP] += .12 * st.s * act; a[IX.jaw] = Math.max(.25, st.j * act); a[IX.thr] = .3 * a[IX.jaw];
    a[IX.fT] = drive ? .4 : 0; a[IX.fR] = (drive ? .3 : .65) + .35 * Math.max(0, st.s) * act; a[IX.bT] = .45; a[IX.tW] = .3; a[IX.tPh] = t * 5.2; a[IX.tP] = -.2 + .25 * f.heave; return P; }
  const PL0 = V3(), PL1 = V3(), vL0 = V3(0, 9, 0), vL1 = V3(), PN0 = V3(), PN1 = V3(), vN0 = V3(0, 11, 0), vN1 = V3();
  const launchPath = who => (t, out) => { const n = who === 'noct', t0 = n ? NGO : LGO, t1 = n ? NJ : C.STRIKE_NEST; if (n) { PN0.copy(NS).setY(G0 + HS + .1); offN(t1, PN1); vN1.copy(_cv).multiplyScalar(.8); } else { PL0.copy(LL).setY(G0 + HS); offL(t1, PL1); PL1.addScaledVector(_dn, 1.5); vL1.copy(_cv).multiplyScalar(.6).add(_b.set(0, 3, 0)); }
    return herm(t, t0, t1, n ? PN0 : PL0, n ? vN0 : vL0, n ? PN1 : PL1, n ? vN1 : vL1, out); };
  const LPATH = { noct: launchPath('noct'), lune: launchPath('lune') };
  function launch(who, t, P, lite) { flyPose(who, t, P, LPATH[who], 0, lite, 1.25); if (!lite) { const a = P.a, k = 1 - sm(0, .5, t - (who === 'noct' ? NGO : LGO)); a[IX.fT] = 1 - k; a[IX.bT] = 1 - k; aim(P, M.cinder(t, _c), .8, .5); a[IX.jaw] = .3; } return P; }
  // ---- PLUNGE+1: Cinder is in the lava; they pull up and hover face to face above the crater. BLAST throws them up; they reach for each other and turn to ink
  const HB = V3(0, 28, 0).add(M.VOLCANO), PU0 = C.PLUNGE + 1, PU1 = PU0 + 1.05;
  const HOV = who => V3().copy(HB).add(V3(0, 0, who === 'noct' ? -3.6 : 3.6));
  const _h0 = V3(), _hv = V3();
  const pullPath = who => (t, out) => { const H = HOV(who); if (t >= PU1) return out.copy(H).add(_a.set(0, .25 * Math.sin(t * 2.4), 0)); DRV[who](PU0, _h0); DRV[who](PU0 + .05, _hv); _hv.sub(_h0).divideScalar(.05); return herm(t, PU0, PU1, _h0, _hv, H, _b.set(0, 0, 0), out); };
  const PPATH = { noct: pullPath('noct'), lune: pullPath('lune') };
  function hover(who, t, P, lite) { const n = who === 'noct', bl = t >= C.BLAST ? 1 - Math.exp(-(t - C.BLAST) / .22) : 0; PPATH[who](t, P.p); P.p.y += 3.2 * bl; P.p.z += (n ? -1.4 : 1.4) * bl;
    qLook(_F.set(0, .9 - .5 * bl, n ? 1 : -1), UP, P.q); qMul(P.q, AX, .25 * bl); if (lite) return P;
    base(P); const a = P.a, f = wingsCycle(t, 2 * BT, PU0, 1 - .7 * bl, .2); setW(a, IX.WL, lerp(f.el, 1.0 + .05 * Math.sin(t * 9), bl), .1, 0, 0, lerp(f.tip, -.3, bl), lerp(1, 1.15, bl), f.hl); a.copyWithin(IX.WR, IX.WL, IX.WL + 8);
    a[IX.tW] = .15; a[IX.tPh] = t * 3; a[IX.bT] = .5; a[IX.fT] = .6; a[IX.fR] = .7 * bl;
    const other = HOV(n ? 'lune' : 'noct'); aim(P, other.setY(other.y + .6 + 3.2 * bl), .9 * (1 - bl) + bl * sm(C.BLAST + .3, C.BLAST + .7, t), .55);
    a[IX.nP] += .75 * bl * (1 - sm(C.BLAST + .3, C.BLAST + .8, t)); a[IX.hP] += .5 * bl * (1 - sm(C.BLAST + .3, C.BLAST + .8, t)); a[IX.tP] = .5 * bl; a[IX.lid] = .55 * sm(C.BLAST + .4, C.SILENCE, t); a[IX.jaw] = .2 * bl; return P; }
  // ---- the phase tables: [start, blend-in seconds, pose fn]
  const flyP = who => (w, t, P, lite) => flyPose(w, t, P, FLY[who], -PHI(t), lite);
  const PH = { noct: [[-1e9, 0, flyP('noct')], [LV(8, 1.8), .8, heart], [C.LAND, 0, land], [C.CUDDLE - .2, .9, lie], [C.ERUPT, .5, alert], [NH0, 0, shield], [NGO, 0, launch], [NJ, .45, (w, t, P, l) => grapple(w, t, P, l, offN, false)], [C.DRIVE_BACK - .3, .5, (w, t, P, l) => grapple(w, t, P, l, DRV.noct, true)], [PU0, .6, hover]],
    lune: [[-1e9, 0, flyP('lune')], [LV(8, 1.8), .8, heart], [C.LAND, 0, land], [C.EGG, .3, rise], [C.CUDDLE - .2, .9, lie], [C.ERUPT, .5, alert], [LGO, 0, launch], [C.STRIKE_NEST, .5, (w, t, P, l) => grapple(w, t, P, l, offL, false)], [C.DRIVE_BACK - .3, .5, (w, t, P, l) => grapple(w, t, P, l, DRV.lune, true)], [PU0, .6, hover]] };
  const PA = newPose(), PB = newPose();
  function pose(who, t, P, lite) { const L = PH[who]; let i = 0; while (i + 1 < L.length && t >= L[i + 1][0]) i++; const ph = L[i];
    if (i > 0 && t - ph[0] < ph[1]) { L[i - 1][2](who, t, PA, lite); ph[2](who, t, PB, lite); return mix(PA, PB, smoother(0, 1, (t - ph[0]) / ph[1]), P); }
    ph[2](who, t, P, lite); return P; }
  // ---- faces: sung vowels open the jaw, the throat swells and trembles; calls and roars; blinks
  const VO = { AA: 1, AE: .8, AH: .85, AO: .75, AW: .9, AY: .9, EH: .7, ER: .5, EY: .65, IH: .4, IY: .3, OW: .6, OY: .7, UH: .45, UW: .35, MM: .03 };
  const vowel = n => { if (n && n.ph) for (const p of n.ph) if (VO[p] !== undefined) return VO[p]; return .5; };
  const KIND = { roar: 1, cry: .85, call: .6, coo: .18 };
  function face(who, t, P) { const a = P.a, s = Score.sing(t, who); if (s.a > 0) { a[IX.jaw] = Math.max(a[IX.jaw], s.a * vowel(s.n) * .85); a[IX.thr] = Math.max(a[IX.thr], s.a * (.6 + .25 * Math.sin(t * TAU * 5.5))); a[IX.hP] += .05 * s.a; }
    for (const v of Score.sounds) if (v.who === who && t > v.t - .1 && t < v.t + v.dur + .35) { const k = sm(v.t - .1, v.t + .05, t) * (1 - sm(v.t + v.dur - .1, v.t + v.dur + .35, t)), o = KIND[v.kind] || .5; a[IX.jaw] = Math.max(a[IX.jaw], k * o); a[IX.thr] = Math.max(a[IX.thr], k * .9); a[IX.nP] += .12 * k * o; a[IX.hP] += .16 * k * o; }
    const per = who === 'noct' ? 3.9 : 3.3, kk = Math.floor(t / per), tb = (kk + .2 + .6 * h1(kk * 7.3 + (who === 'noct' ? 3 : 9))) * per; a[IX.lid] = Math.max(a[IX.lid], 1 - Math.min(1, Math.abs(t - tb) / .09), 1 - Math.min(1, Math.abs(t - C.ERUPT - .05) / .1));
    a[IX.eY] += .14 * Math.sin(Math.floor(t * 1.4 + (who === 'noct' ? 0 : .5)) * 2.3); a[IX.eP] += .05 * Math.sin(Math.floor(t * 1.1) * 1.7); }

  // ---------------------------------------------------------------- rig driver: params -> bone rotations (FK), wings by aimed bases, legs FK + IK
  const NB6 = ['n1', 'n2', 'n3', 'n4', 'n5', 'head'], NPW = [.32, .25, .18, .12, .08, .05], HPW = [0, 0, .05, .15, .3, .5], NYW = [.2, .2, .2, .2, .15, .05], HYW = [0, 0, 0, .1, .3, .6], TW = [.08, .09, .1, .11, .12, .13, .15, .17];
  const _e = new THREE.Euler(), _q1 = new THREE.Quaternion(), setE = (b, x, y, z = 0) => b.quaternion.setFromEuler(_e.set(x, y, z, 'YXZ'));
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _t1 = V3(), _t2 = V3(), _t3 = V3();
  const basisM = (d, u, m) => { _t3.copy(d).normalize(); _t1.copy(u).addScaledVector(_t3, -u.dot(_t3)).normalize(); _t2.crossVectors(_t1, _t3); return m.makeBasis(_t2, _t1, _t3); };
  const aimQ = (rd, ru, d, u, q) => { basisM(d, u, _m2); basisM(rd, ru, _m1); return q.setFromRotationMatrix(_m2.multiply(_m1.transpose())); };
  const WREST = {}, WFOLD = {}, LIDAX = {};
  for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R', J = WJ(s), o = V3(s, 0, 0), r = { hu: V3().subVectors(J.E, J.S).normalize(), fa: V3().subVectors(J.W, J.E).normalize(), f: J.F.map(f => [V3().subVectors(f[0], J.W).normalize(), V3().subVectors(f[1], f[0]).normalize()]) }; WREST[k] = r;
    const fq = { hu: aimQ(r.hu, UP, V3(s * .25, -.15, -.96), o, new THREE.Quaternion()), fa: aimQ(r.fa, UP, V3(s * .1, .3, .95), o, new THREE.Quaternion()), f: [] };
    for (let i = 0; i < 4; i++) fq.f.push([aimQ(r.f[i][0], UP, V3(s * .06, -.12 - .045 * i, -.99), o, new THREE.Quaternion()), aimQ(r.f[i][1], UP, V3(s * .05, -.16 - .05 * i, -.98), o, new THREE.Quaternion())]); WFOLD[k] = fq;
    const f = EF(s), uu = V3(0, 1, 0).addScaledVector(f, -f.y).normalize(); LIDAX[k] = V3().crossVectors(uu, f).normalize(); }
  const _o = V3(), _bk = V3(), _n = V3(), _d = V3(), _d2 = V3(), _ni = V3(), _tb = V3(), WQ = { hu: new THREE.Quaternion(), fa: new THREE.Quaternion(), f: [0, 1, 2, 3].map(() => [new THREE.Quaternion(), new THREE.Quaternion()]) };
  const plane = (s, el, sw) => { const ce = Math.cos(el), se = Math.sin(el), cs = Math.cos(sw), ss = Math.sin(sw); _o.set(s * cs * ce, cs * se, ss); _bk.set(s * ss * ce, ss * se, -cs); _n.crossVectors(_o, _bk).multiplyScalar(s); };
  function wing(D, s, a, w) { const k = s > 0 ? 'L' : 'R', R = WREST[k], F = WFOLD[k], B = D.B, el = a[w], sw = a[w + 1], fo = smoother(0, 1, a[w + 2]), tw = a[w + 3], tip = a[w + 4], spr = a[w + 5], hl = a[w + 6], cup = a[w + 7];
    plane(s, el, sw); _d.copy(_o).addScaledVector(_bk, .1).normalize(); aimQ(R.hu, UP, _d, _n, WQ.hu).slerp(F.hu, fo);
    plane(s, el + hl * .4, sw + .06); _d.copy(_o).addScaledVector(_bk, -.07).normalize(); aimQ(R.fa, UP, _d, _n, WQ.fa).slerp(F.fa, fo);
    plane(s, el + hl, sw + .04 + .25 * cup);
    for (let i = 0; i < 4; i++) { const al = FA[i] * spr - cup * .1 * i, ph = tw * Math.sin(FA[i]), c = Math.cos(ph), sn = Math.sin(ph);
      _ni.copy(_n).multiplyScalar(c).addScaledVector(_bk, -sn); _tb.copy(_bk).multiplyScalar(c).addScaledVector(_n, sn);
      _d.copy(_o).multiplyScalar(Math.cos(al)).addScaledVector(_tb, Math.sin(al)); aimQ(R.f[i][0], UP, _d, _ni, WQ.f[i][0]).slerp(F.f[i][0], fo);
      const tb = (tip + cup * .25) * (.55 + .2 * i); _d2.copy(_o).multiplyScalar(Math.cos(al + .08)).addScaledVector(_tb, Math.sin(al + .08)).multiplyScalar(Math.cos(tb)).addScaledVector(_ni, Math.sin(tb)).normalize(); aimQ(R.f[i][1], UP, _d2, _ni, WQ.f[i][1]).slerp(F.f[i][1], fo); }
    B['wh' + k].quaternion.copy(WQ.hu); B['wf' + k].quaternion.copy(_q1.copy(WQ.hu).invert().multiply(WQ.fa)); B['ww' + k].quaternion.identity();
    for (let i = 0; i < 4; i++) { B['w' + i + 'a' + k].quaternion.copy(_q1.copy(WQ.fa).invert().multiply(WQ.f[i][0])); B['w' + i + 'b' + k].quaternion.copy(_q1.copy(WQ.f[i][0]).invert().multiply(WQ.f[i][1])); } }
  const LREST = [0, 1, 2, 3].map(i => { const fore = i < 2, s = i & 1 ? -1 : 1, L = LEG(s, fore); return { fore, s, k: fore ? 'f' : 'b', sx: s > 0 ? 'L' : 'R', u: V3().subVectors(L[1], L[0]).normalize(), l: V3().subVectors(L[2], L[1]).normalize(), f: V3().subVectors(L[3], L[2]).normalize(), lu: L[0].distanceTo(L[1]), ll: L[1].distanceTo(L[2]), pole: V3(0, 0, fore ? -1 : 1) }; });
  function legsFK(D, a) { for (const R of LREST) { const B = D.B, bu = B[R.k + 'u' + R.sx], bl = B[R.k + 'l' + R.sx], bf = B[R.k + 'f' + R.sx];
    if (R.fore) { const tk = a[IX.fT], rc = clamp(a[IX.fR]); setE(bu, lerp(1.15 * tk, -1.35, rc), 0, R.s * (.1 * tk + .3 * rc)); setE(bl, lerp(-2.1 * tk, -.45, rc), 0); setE(bf, lerp(1.2 * tk, -.7, rc), 0); }
    else { const tk = a[IX.bT]; setE(bu, 1.3 * tk, 0, R.s * .08 * tk); setE(bl, .5 * tk, 0); setE(bf, .95 * tk, 0); } } }
  const _A = V3(), _T = V3(), _K = V3(), _dir = V3(), _pole = V3(), _hd = V3(), _kd = V3(), _ld = V3(), _fd = V3(), _qp = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _qf = new THREE.Quaternion();
  function ik(D, P) { const w = P.a[IX.gW]; if (w < .001) return; const sc = D.L.scale; _hd.set(0, 0, 1).applyQuaternion(D.group.quaternion).setY(0).normalize(); _x.crossVectors(UP, _hd).normalize();
    for (let i = 0; i < 4; i++) { const R = LREST[i], B = D.B, bu = B[R.k + 'u' + R.sx], bl = B[R.k + 'l' + R.sx], bf = B[R.k + 'f' + R.sx];
      bu.getWorldPosition(_A); _T.copy(P.F[i]).addScaledVector(_hd, -(R.fore ? .19 : .25) * sc); _T.y += .1 * sc;
      const lu = R.lu * sc, ll = R.ll * sc; _dir.subVectors(_T, _A); let d = _dir.length(); _dir.divideScalar(d || 1); d = clamp(d, .3 * (lu + ll), .995 * (lu + ll));
      const ca = clamp((lu * lu + d * d - ll * ll) / (2 * lu * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
      _pole.copy(_hd).multiplyScalar(R.fore ? -1 : 1).addScaledVector(_x, R.s * .25); _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
      _K.copy(_A).addScaledVector(_dir, lu * ca).addScaledVector(_pole, lu * sa); _T.copy(_A).addScaledVector(_dir, d);
      bu.parent.getWorldQuaternion(_qp).invert(); aimQ(R.u, R.pole, _kd.subVectors(_K, _A), _pole, _qu); bu.quaternion.slerp(_q1.copy(_qp).multiply(_qu), w);
      aimQ(R.l, R.pole, _ld.subVectors(_T, _K), _pole, _ql); bl.quaternion.slerp(_q1.copy(_qu).invert().multiply(_ql), w);
      aimQ(R.f, UP, _fd.copy(_hd).add(_t3.set(0, -.25, 0)), UP, _qf); bf.quaternion.slerp(_q1.copy(_ql).invert().multiply(_qf), w); }
    D.group.updateMatrixWorld(true); }
  function apply(D, P) { const a = P.a, B = D.B; D.group.position.copy(P.p); D.group.quaternion.copy(P.q);
    for (let i = 0; i < 6; i++) setE(B[NB6[i]], -(a[IX.nP] * NPW[i] + a[IX.hP] * HPW[i]), a[IX.nY] * NYW[i] + a[IX.hY] * HYW[i], i === 5 ? a[IX.hR] : 0);
    setE(B.chest, -a[IX.cP], a[IX.cY]); setE(B.hip, a[IX.pP], -a[IX.pY]);
    for (let i = 0; i < 8; i++) { const q = .3 + .7 * i / 7, wy = a[IX.tW] * Math.sin(a[IX.tPh] - i * .75) * q, wp = .35 * a[IX.tW] * Math.sin(a[IX.tPh] * .5 - i * .6) * q; setE(B['t' + (i + 1)], a[IX.tP] * TW[i] + wp, -(a[IX.tY] * TW[i] + wy)); }
    setE(B.jaw, a[IX.jaw] * .55, 0); B.thr.scale.setScalar(1 + .32 * a[IX.thr]);
    for (const s of [1, -1]) { const k = s > 0 ? 'L' : 'R'; B['lid' + k].quaternion.setFromAxisAngle(LIDAX[k], clamp(a[IX.lid]) * 1.0); setE(B['eye' + k], -a[IX.eP], a[IX.eY]); wing(D, s, a, s > 0 ? IX.WL : IX.WR); }
    legsFK(D, a); D.group.updateMatrixWorld(true); }

  // ---------------------------------------------------------------- materials: clay + velvet sheen, translucent membrane, glass beads; one shared ink dissolve
  const DIS = { value: 0 }, INK = { value: hex('#1f3f8f') };
  const GLSL = /* glsl */`
    pSpk = 0.0;
    { vec3 sp3 = vOP * 26.0; vec3 ci = floor(sp3); float hh = fract(sin(dot(ci, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      vec3 cc = vec3(fract(hh * 7.13), fract(hh * 13.37), fract(hh * 3.71)) * 0.6 + 0.2; float dd = length(fract(sp3) - cc), fs = fwidth(sp3.x) + fwidth(sp3.y);
      pSpk = vK.x * step(0.78, hh) * (1.0 - smoothstep(0.08, 0.08 + max(0.04, fs), dd)) * (1.0 - smoothstep(0.4, 0.9, fs));
      col = mix(col, uSpk, pSpk); rgh = mix(rgh, 0.32, pSpk * uSpkM); metalnessFactor = mix(metalnessFactor, 0.85, pSpk * uSpkM); }
    if (vK.y > 0.5) { vec2 q = vTU; float row = floor(q.x); q.y += 0.5 * mod(row, 2.0); vec2 f = fract(q), cq = floor(q); float jh = fract(sin(dot(cq, vec2(41.3, 289.1))) * 15731.7);
      float d = length((f - vec2(0.6 + 0.12 * (jh - 0.5), 0.5 + 0.16 * (fract(jh * 9.7) - 0.5))) * vec2(1.0, 1.15)), fs = fwidth(vTU.x) + fwidth(vTU.y), fade = 1.0 - smoothstep(0.35, 0.9, fs);
      float sc = (1.0 - smoothstep(0.38, 0.6, d)) * (0.5 + 0.5 * f.x), pl = smoothstep(0.0, 0.12, fract(vTU.x * 0.66)) * (1.0 - smoothstep(0.8, 1.0, fract(vTU.x * 0.66)));
      float h = mix(sc * (0.7 + 0.5 * jh), pl, clamp(vK.z, 0.0, 1.0)); hgt += (h - 0.5) * 0.9 * fade; col *= 1.0 - 0.07 * fade * (1.0 - h) + 0.04 * (jh - 0.5) * fade; }
    if (vK.z < -0.5) { float vv = abs(fract(vTU.y * 3.0 + 0.06 * sin(vTU.x * 11.0)) - 0.5), fs = fwidth(vTU.y) * 3.0, vein = 1.0 - smoothstep(0.0, 0.03 + fs, vv);
      col *= 1.0 - 0.22 * vein; hgt += vein * 0.8 + 0.25 * sin(vTU.x * 70.0 + vTU.y * 9.0); }
    if (uDis > 0.0) { float dz = (vOP.z + 4.3 - 0.2 * abs(vOP.x)) / 7.6, e = dz - (uDis * 1.4 - 0.2) + (nzB.r - 0.5) * 0.3 + (nz.a - 0.5) * 0.08;
      if (e < 0.0) discard;
      float ink = 1.0 - smoothstep(0.0, 0.32 + 0.1 * nz.g, e); vec3 ic = mix(uInk * (0.8 + 0.5 * nz.a), uInk * 0.25, smoothstep(0.06, 0.0, e));
      col = mix(col, ic, ink); col = mix(col, uInk * 1.2, 0.45 * uDis); rgh = mix(rgh, 1.0, ink); metalnessFactor *= 1.0 - ink; pSpk *= 1.0 - ink; }`;
  const hookFor = L => ({ key: 'pairInk', uniforms: { uDis: DIS, uInk: INK, uSpk: { value: L.spk }, uSpkE: { value: L.spkE }, uSpkM: { value: L.spkM } },
    vertPars: 'attribute vec3 aK; varying vec3 vK;', vert: 'vK = aK;', fragPars: 'varying vec3 vK; uniform float uDis, uSpkE, uSpkM; uniform vec3 uInk, uSpk; float pSpk;', color: GLSL, emissive: 'totalEmissiveRadiance += uSpk * pSpk * uSpkE;' });

  // ---------------------------------------------------------------- build, update, API
  const DR = [], HW = { noct: [V3(NaN), V3(NaN), V3(NaN)], lune: [V3(NaN), V3(NaN), V3(NaN)] };
  function buildDragon(who) { const L = LOOK[who], rays = [], mA = membraneAcc(L, rays), bA = bodyAcc(L, rays), eA = eyeAcc(L), rg = Sculpt.rig(DEF), group = new THREE.Group(); group.name = who; group.add(rg.root);
    const sk = new THREE.Skeleton(rg.list), hk = hookFor(L);
    const mats = [Mat.hook(Mat.make('clay', { vcol: true, sheen: L.sheenK, rough: .72, pair: who }), hk), Mat.hook(Mat.make('skin', { vcol: true, trans: .8, transColor: '#ffffff', double: true, rough: .55, pair: who }), hk), Mat.hook(Mat.make('ceramic', { vcol: true, pair: who }), hk)];
    mats[0].sheenColor = L.sheen.clone(); mats[0].sheenRoughness = .35;
    const meshes = [toGeo(bA, paintBody(L)), toGeo(mA, paintMem(L)), toGeo(eA, paintEye(L))].map((g, i) => { const m = new THREE.SkinnedMesh(g, mats[i]); m.bind(sk, new THREE.Matrix4()); m.frustumCulled = false; m.castShadow = i < 2; m.receiveShadow = true; group.add(m); return m; });
    group.scale.setScalar(L.scale); group.traverse(o => o.layers.enable(1)); return { who, L, group, B: rg.bones, meshes, P: newPose(), poke: -1e9 }; }
  function pokeAdd(D, t) { const u = t - D.poke; if (u < 0 || u > 1.6) return; const a = D.P.a, k = smoother(0, 1.25, u) * (1 - a[IX.gW]); qMul(D.P.q, AZ, TAU * k * (D.who === 'noct' ? 1 : -1)); a[IX.jaw] = Math.max(a[IX.jaw], .8 * pulse(t, D.poke, .08, .35)); a[IX.thr] = Math.max(a[IX.thr], .7 * pulse(t, D.poke, .08, .4)); a[IX.hP] += .3 * pulse(t, D.poke, .1, .4); }
  function update(ctx) { const t = ctx.t, vis = t >= C.COLOR && t < C.SILENCE + .03; DIS.value = smoother(C.BLAST + .05, C.SILENCE - .03, t);
    for (const D of DR) { D.group.visible = vis; if (!vis) continue; pose(D.who, t, D.P, false); face(D.who, t, D.P); pokeAdd(D, t); apply(D, D.P); D.meshes[0].castShadow = D.meshes[1].castShadow = DIS.value <= 0; }
    if (!vis || DR.length < 2) return; const N = DR[0], L = DR[1];
    const wh = smoother(LV(8, 1.8), C.HEART1, t) * (t < C.LAND ? 1 : 0);                                  // HEART1: noses meet exactly
    if (wh > 0) { N.B.head.localToWorld(_a.set(0, .005, .63)); L.B.head.localToWorld(_b.set(0, .005, .63)); _c.addVectors(_a, _b).multiplyScalar(.5); _d.subVectors(_b, _a).normalize().multiplyScalar(.04);
      N.group.position.addScaledVector(_c2.copy(_c).sub(_d).sub(_a), wh); L.group.position.addScaledVector(_c2.copy(_c).add(_d).sub(_b), wh); N.group.updateMatrixWorld(true); L.group.updateMatrixWorld(true); }
    const wc = smoother(C.CUDDLE + .3, C.CUDDLE + 1.1, t) * (1 - smoother(C.ERUPT, C.ERUPT + .3, t));    // CUDDLE: his chin rests on her crown
    if (wc > 0) { L.B.head.localToWorld(_a.set(0, .24, .02)); N.B.head.localToWorld(_b.set(0, -.13, .28)); _c.subVectors(_a, _b); _c.set(clamp(_c.x, -.7, .7), clamp(_c.y, -.25, .3), clamp(_c.z, -.7, .7)); N.group.position.addScaledVector(_c, wc); N.group.updateMatrixWorld(true); }
    for (const D of DR) { ik(D, D.P); const h = HW[D.who]; D.B.head.localToWorld(h[0].set(0, .1, .3)); D.B.jaw.localToWorld(h[1].set(0, -.06, .52)); h[2].set(0, 0, 1).applyQuaternion(D.group.quaternion); } }
  // sample points on the bodies for the ink wisps: bone chains, with s = how hard that spot is dissolving now
  const SAMP = []; { const add = (b, c, fr) => fr.forEach(f => { const o = c ? RP(c).sub(RP(b)).multiplyScalar(f) : V3(0, 0, f); const r = RP(b).add(o); SAMP.push([b, o, r.z, r.x]); });
    const sp = ['t8', 't7', 't6', 't5', 't4', 't3', 't2', 't1', 'hip', 'root', 'chest', 'n1', 'n2', 'n3', 'n4', 'n5']; for (let i = 0; i < sp.length - 1; i++) add(sp[i + 1], sp[i], [0, .5]); add('t8', null, [-.1]); add('n5', 'head', [.5]); add('head', null, [0, .3, .6]);
    for (const k of ['L', 'R']) { add('wh' + k, 'wf' + k, [0, .5]); add('wf' + k, 'ww' + k, [0, .5]); for (let i = 0; i < 4; i++) { add('w' + i + 'a' + k, 'w' + i + 'b' + k, [.5, 1]); const J = WJ(k === 'L' ? 1 : -1), o = V3().subVectors(J.F[i][1], J.F[i][0]); SAMP.push(['w' + i + 'b' + k, o, J.F[i][1].z, J.F[i][1].x]); } } }
  function points(who, out = []) { const D = DR.find(d => d.who === who); if (!D) return out; const f = DIS.value * 1.4 - .2; out.length = SAMP.length;
    SAMP.forEach((s, i) => { const o = out[i] || (out[i] = { x: 0, y: 0, z: 0, s: 0 }); D.B[s[0]].localToWorld(_a.copy(s[1])); o.x = _a.x; o.y = _a.y; o.z = _a.z; const dz = (s[2] + 4.3 - .2 * Math.abs(s[3])) / 7.6; o.s = DIS.value > 0 ? Math.exp(-(((dz - f) / .12) ** 2)) : 0; }); return out; }
  const TMP = newPose();
  const mkApi = who => ({ group: null, at: (t, out) => (out || V3()).copy(pose(who, t, TMP, true).p), head: out => (out || V3()).copy(HW[who][0]), mouth: out => (out || V3()).copy(HW[who][1]), dir: out => (out || V3()).copy(HW[who][2]) });
  const api = { noct: mkApi('noct'), lune: mkApi('lune'), dissolve: () => DIS.value, points, _dev: { pose, LOOK, IX, DR } };
  Stage.actor('noct', api.noct); Stage.actor('lune', api.lune);
  Stage.actor('pair', { at: (t, out) => { out = out || V3(); api.noct.at(t, out); return out.add(api.lune.at(t, _p)).multiplyScalar(.5); }, head: out => (out || V3()).addVectors(HW.noct[0], HW.lune[0]).multiplyScalar(.5), dir: out => (out || V3()).addVectors(HW.noct[2], HW.lune[2]).normalize() });
  const reg = Assets.add('pair', { order: 26, pick: [],
    build() { for (const who of ['noct', 'lune']) DR.push(buildDragon(who)); api.noct.group = DR[0].group; api.lune.group = DR[1].group; DR.forEach(D => reg.pick.push(D.meshes[0], D.meshes[1])); return DR.map(D => D.group); },
    update, poke(hit, ctx) { const D = DR.find(d => d.meshes.includes(hit.object)) || DR[0]; D.poke = ctx.t; return 'whoosh'; } });
  return api;
})();
