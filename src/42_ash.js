'use strict';
// ---- ASH: the grumpy old red dragon (ref 7). Sculpted clay puppet + his cigarettes, flint, crushed pack, cotton-wool smoke -----------------
// Model space = Ash.group space: origin on the floor under his seat, +X = the way he faces, +Y up, +Z = his right. Sitting: 3.2 m to the horn tips; 6 m long.
//   Ash.group                  the puppet (one skeleton: clay body, horns/claws/teeth/spikes, glass eyes, wings, props). Smoke + sparks are world roots.
//   Ash.at(t, out)             world body centre at film time t (pure)          Ash.head(out) Ash.mouth(out) Ash.dir(out)   this frame, world
//   Ash.fire(t?)               0..1 his own small orange fire (ASH_FIRE burst, the dawn heart trail); FX draws it from mouth()/dir()
//   Ash.cig(out)               lit tip of the cigarette, world                  Ash.cigLit(t?) 0..1 (pure)
//   Ash.wingUnder(out)         floor point under his right wing where Ember curls up (SHELTER)
//   Ash.smoke = false          FX draws the smoke + flint sparks (set by src/60_fx.js): his own smoke and spark particles switch off; the tip glow stays
const Ash = (() => {
  const C = Score.CUE, M = Stage.M, SB = Score.byName, BT = s => SB[s].beatS, T = Score.T, LOCAL = Q.has('studio') && !Q.has('place');
  const _v = V3(), _w = V3(), _u = V3(), _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _g = V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), QI = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _one = V3(1, 1, 1), YA = V3(0, 1, 0), XA = V3(1, 0, 0), ZA = V3(0, 0, 1);
  const col = h => hex(h), mixc = (a, b, k) => a.clone().lerp(b, clamp(k));
  const RED = col('#d7372e'), REDD = col('#9c231d'), REDL = col('#e2503f'), BEL = col('#ef6f6a'), BELL = col('#f7a196'), GUM = col('#6e1d24'), TONG = col('#c4505f'), DARK = col('#3c1013');
  const S2 = [['L', -1], ['R', 1]];
  const yawOf = d => Math.atan2(-d.z, d.x), leftOf = d => V3(d.z, 0, -d.x).normalize();
  const bump = (t, a, b, c, d) => sm(a, b, t) * (1 - sm(c, d, t)), bell = (t, c, w) => { const u = (t - c) / w; return Math.exp(-u * u); };
  const blink = (t, seed, per = 4.4) => { const k = Math.floor(t / per + seed), u = (t / per + seed - k) * per, a = h1(k * 7.31 + seed * 31.7) * (per - 1); const one = v => v < 0 || v > .36 ? 0 : v < .1 ? sm(0, .1, v) : 1 - sm(.14, .36, v); let o = one(u - a); if (h1(k * 3.1 + seed) > .74) o = Math.max(o, one(u - a - .45)); return o; };
  // step timeline [[t, name, tr]] -> {a, b, k}
  const TL = list => { list.sort((p, q) => p[0] - q[0]); return t => { let i = 0; while (i + 1 < list.length && t >= list[i + 1][0]) i++; const cur = list[i], prev = list[Math.max(0, i - 1)], tr = cur[2] === undefined ? .3 : cur[2]; return { a: prev[1], b: cur[1], k: i === 0 || tr <= 0 ? 1 : sm(cur[0], cur[0] + tr, t) }; }; };
  const K = ks => keyed(ks.sort((p, q) => p[0] - q[0]));

  // ================================================================ the skeleton (rest = the ref-7 seat)
  const TP = [[-.72, .42, 0], [-1.25, .24, -.12], [-1.68, .17, -.52], [-1.8, .14, -1.0], [-1.55, .12, -1.43], [-1.04, .11, -1.66], [-.47, .1, -1.63], [.03, .11, -1.41]], TRR = [.38, .29, .22, .17, .13, .1, .075, .045];
  const EYE = [.875, 2.845, .168], ER = .078, HX = .17, HF = V3(.998, .066, 0).normalize();
  const eyeFrame = s => { const L = V3(.85, .07, s * .52).normalize(), U = V3(0, 1, 0).addScaledVector(L, -L.y).normalize(), W = V3().crossVectors(L, U), A = V3().crossVectors(U, L); return { c: V3(EYE[0], EYE[1], s * EYE[2]), L, U, W, A }; };
  const EF = { L: eyeFrame(-1), R: eyeFrame(1) };
  const WARM = [-.55, .75, .35], WFORE = [.42, .85, .22], WFING = [[-.78, -.36, .12], [-.56, -.8, .14], [-.3, -.94, .12]], WLEN = [.46, .56, 1.35, 1.45, 1.1];
  const wingRest = s => { const n = a => V3(a[0], a[1], s * a[2]).normalize(), w0 = V3(-.3, 1.98, s * .34), w1 = w0.clone().addScaledVector(n(WARM), WLEN[0]), w2 = w1.clone().addScaledVector(n(WFORE), WLEN[1]); return { w0, w1, w2, tips: WFING.map((f, k) => n(f).multiplyScalar(WLEN[2 + k])) }; };
  const WRS = { L: wingRest(-1), R: wingRest(1) };
  const D = {}, bone = (n, parent, pos) => { D[n] = parent ? { parent, pos: [...pos] } : { pos: [...pos] }; };
  bone('root', null, [-.2, .66, 0]); bone('spine', 'root', [.05, 1.12, 0]); bone('chest', 'spine', [.05, 1.6, 0]); bone('neck1', 'chest', [.18, 1.95, 0]); bone('neck2', 'neck1', [.38, 2.3, 0]); bone('head', 'neck2', [.55, 2.6, 0]); bone('jaw', 'head', [.64, 2.55, 0]);
  for (const [n, s] of S2) {
    bone('eye' + n, 'head', [EYE[0], EYE[1], s * EYE[2]]); bone('lid' + n, 'head', [EYE[0], EYE[1], s * EYE[2]]); bone('brow' + n, 'head', [EYE[0], EYE[1], s * EYE[2]]);
    bone('sh' + n, 'chest', [.18, 1.8, s * .5]); bone('el' + n, 'sh' + n, [.36, 1.33, s * .6]); bone('hd' + n, 'el' + n, [.7 + HX, 1.46, s * .5]); bone('fg' + n, 'hd' + n, [.86 + HX, 1.47, s * .47]);
    bone('th' + n, 'root', [-.12, .6, s * .48]); bone('kn' + n, 'th' + n, [.58, .55, s * .6]); bone('an' + n, 'kn' + n, [.26, .15, s * .63]); bone('to' + n, 'an' + n, [.68, .085, s * .65]);
    const W = WRS[n]; bone('w' + n + '0', 'chest', W.w0.toArray()); bone('w' + n + '1', 'w' + n + '0', W.w1.toArray()); bone('w' + n + '2', 'w' + n + '1', W.w2.toArray()); for (let k = 0; k < 3; k++) bone('w' + n + (3 + k), 'w' + n + '2', W.w2.toArray());
  }
  for (let i = 0; i < 7; i++) bone('t' + i, i ? 't' + (i - 1) : 'root', TP[i]);
  bone('cig', null, [0, 0, 0]); bone('flint', null, [0, 0, 0]); bone('floor', null, [0, 0, 0]); bone('butt', null, [0, 0, 0]);
  let RIG = null, B = null, BI = null;

  // ================================================================ sculpting (SDF parts with bounding spheres -> painted, skinned surface)
  const P = (f, b, o) => Object.assign({ f, cx: b[0], cy: b[1], cz: b[2], R: b[3], k: .05 }, o);
  const E = (c, r, o) => P(SD.ell(c[0], c[1], c[2], r[0], r[1], r[2]), [c[0], c[1], c[2], Math.max(r[0], r[1], r[2])], o);
  const Sp = (c, r, o) => P(SD.sph(c[0], c[1], c[2], r), [c[0], c[1], c[2], r], o);
  const Cn = (a, b, ra, rb, o) => P(SD.cone(a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(ra, rb)], o);
  const Bx = (c, h, r, o) => P(SD.box(c[0], c[1], c[2], h[0], h[1], h[2], r), [c[0], c[1], c[2], Math.hypot(h[0], h[1], h[2])], o);
  const Lk = (A, Bq, Cq, r0, r1, o) => { const cx = (A[0] + Bq[0] + Cq[0]) / 3, cy = (A[1] + Bq[1] + Cq[1]) / 3, cz = (A[2] + Bq[2] + Cq[2]) / 3; let R = 0; for (const p of [A, Bq, Cq]) R = Math.max(R, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz)); return P(SD.lock(A, Bq, Cq, r0, r1), [cx, cy, cz, R + Math.max(r0, r1)], o); };
  const field = parts => { const S = parts.filter(p => !p.cut && !p.paint), X = parts.filter(p => p.cut), n0 = S.length;
    return (x, y, z) => { let d = 1e9;
      for (let i = 0; i < n0; i++) { const p = S[i], ax = x - p.cx, ay = y - p.cy, az = z - p.cz, lb = Math.sqrt(ax * ax + ay * ay + az * az) - p.R, k = p.k; if (lb > d + k) continue; const e = p.f(x, y, z); if (d > 1e8) { d = e; continue; } const q = d - e; if (k > 0 && q < k && q > -k) { const h = (k - (q < 0 ? -q : q)) / k; d = (d < e ? d : e) - h * h * k * .25; } else if (e < d) d = e; }
      for (let i = 0; i < X.length; i++) { const p = X[i], ax = x - p.cx, ay = y - p.cy, az = z - p.cz, lb = Math.sqrt(ax * ax + ay * ay + az * az) - p.R, k = p.k || 0; if (lb > -d + k) continue; const e = -p.f(x, y, z); d = k > 0 ? SD.smax(d, e, k) : Math.max(d, e); }
      return d; }; };
  function carve(o) {
    const S = o.parts.filter(p => !p.cut && !p.paint), A = o.parts.filter(p => p.paint), n0 = S.length, f = field(o.parts), bb = o.bb;
    const m = SD.mesh(f, bb, Math.ceil(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / o.h)), n = m.pos.length / 3;
    const cl = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Float32Array(n * 4), sw = new Float32Array(n * 4), NB = RIG.names.length, acc = new Float32Array(NB), dd = new Float32Array(n0), UV = [0, 0];
    const CF = S.map(p => typeof p.color === 'function' ? p.color : (c => () => c)(p.color ? col(p.color) : RED)), PF = A.map(p => typeof p.color === 'function' ? p.color : (c => () => c)(col(p.color)));
    const BIx = S.map(p => { const i = RIG.names.indexOf(p.bone); if (i < 0) throw new Error('ash: no bone ' + p.bone); return i; }), wb = o.wblend || .08, cb = o.cblend || .012, a1 = o.ao || .05, am = o.aoMin === undefined ? .6 : o.aoMin;
    for (let i = 0; i < n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2], nx = m.nor[i * 3], ny = m.nor[i * 3 + 1], nz = m.nor[i * 3 + 2]; let dm = 1e9;
      for (let j = 0; j < n0; j++) { const p = S[j], ax = x - p.cx, ay = y - p.cy, az = z - p.cz, lb = Math.sqrt(ax * ax + ay * ay + az * az) - p.R; dd[j] = lb > .3 ? lb : p.f(x, y, z); if (dd[j] < dm) dm = dd[j]; }
      let r = 0, g = 0, b = 0, ws = 0; for (let j = 0; j < n0; j++) { const w = Math.exp(-(dd[j] - dm) / cb); if (w < .003) continue; const c = CF[j](x, y, z, nx, ny, nz); r += c.r * w; g += c.g * w; b += c.b * w; ws += w; } r /= ws; g /= ws; b /= ws;
      for (let j = 0; j < A.length; j++) { const p = A[j], ax = x - p.cx, ay = y - p.cy, az = z - p.cz; if (Math.sqrt(ax * ax + ay * ay + az * az) - p.R > .06) continue; const e = p.f(x, y, z), s = p.soft || .01, w = 1 - sm(-s, s, e); if (w > .001) { const c = PF[j](x, y, z, nx, ny, nz), a = w * (p.a === undefined ? 1 : p.a); r += (c.r - r) * a; g += (c.g - g) * a; b += (c.b - b) * a; } }
      const ao = clamp(.45 * f(x + nx * a1, y + ny * a1, z + nz * a1) / a1 + .55 * f(x + nx * a1 * 3, y + ny * a1 * 3, z + nz * a1 * 3) / (a1 * 3)), q = lerp(am, 1, ao * ao * (3 - 2 * ao));
      cl[i * 3] = r * q; cl[i * 3 + 1] = g * lerp(q, 1, .15); cl[i * 3 + 2] = b * lerp(q, 1, .25);
      if (o.uvf) { o.uvf(x, y, z, UV); uv[i * 2] = UV[0]; uv[i * 2 + 1] = UV[1]; }
      acc.fill(0); for (let j = 0; j < n0; j++) { const w = Math.exp(-(dd[j] - dm) / (S[j].wb || wb)); if (w > acc[BIx[j]]) acc[BIx[j]] = w; }
      let tot = 0; for (let q4 = 0; q4 < 4; q4++) { let bi = -1, bw = .01; for (let k = 0; k < NB; k++) if (acc[k] > bw) { bw = acc[k]; bi = k; } if (bi < 0) break; si[i * 4 + q4] = bi; sw[i * 4 + q4] = bw; tot += bw; acc[bi] = 0; } for (let q4 = 0; q4 < 4; q4++) sw[i * 4 + q4] /= tot || 1;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setIndex(new THREE.BufferAttribute(m.idx, 1)); return { geo, f };
  }
  // rigid parts: paint + one bone (or a weight fn)
  const rigid = (g, bn, c) => { if (c !== undefined) Geo.paint(g, c); const n = g.attributes.position.count, bi = typeof bn === 'number' ? bn : RIG.names.indexOf(bn); if (bi < 0) throw new Error('ash: no bone ' + bn); const si = new Float32Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; } g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return g; };
  const bez = (A, Bq, Cq, n) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; o.push(V3(a * A[0] + b * Bq[0] + c * Cq[0], a * A[1] + b * Bq[1] + c * Cq[1], a * A[2] + b * Bq[2] + c * Cq[2])); } return o; };

  // ---- the belly band: salmon plates in rows from the throat down to the groin (uv.x = metres along it, uv.y = mask)
  let BL = [], BLS = [], BLW = [];
  const bellyUV = (x, y, z, out) => { let best = 1e9, bs = 0, bw = .2; for (let i = 0; i < BL.length - 1; i++) { const a = BL[i], b = BL[i + 1], ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, l2 = ux * ux + uy * uy + uz * uz; let h = ((x - a.x) * ux + (y - a.y) * uy + (z - a.z) * uz) / l2; h = clamp(h); const dx = x - a.x - ux * h, dy = y - a.y - uy * h, dz = z - a.z - uz * h, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bs = BLS[i] + (BLS[i + 1] - BLS[i]) * h; bw = BLW[i] + (BLW[i + 1] - BLW[i]) * h; } }
    out[0] = bs; out[1] = 1 - sm(bw - .03, bw + .015, Math.sqrt(best)); return out; };
  const UVt = [0, 0];
  const bodyCol = (x, y, z, nx, ny, nz) => { const n1 = NZ.n3(x * 2.1, y * 2.1, z * 2.1), n2 = NZ.n3(x * 7 + 3, y * 7, z * 7); let c = mixc(RED, REDD, clamp(.12 + .22 * ny * (x < .3 ? 1 : .4) + .35 * n1 + (y < .2 ? .25 : 0))); c.lerp(REDL, clamp(.25 * nz * nz + .3 * n2 - .1)); bellyUV(x, y, z, UVt); if (UVt[1] > .01) c.lerp(mixc(BEL, BELL, .25 + .4 * n2), UVt[1]); return c; };

  // ================================================================ build
  const pick = [], api = { smoke: true }; let root = null, body = null, hardM = null, eyeM = null, propM = null, memM = null, memGeo = null, smokeM = null, sparkM = null, built = false;
  const U = { uNos: { value: new THREE.Vector2() }, uThr: { value: 0 }, uBel: { value: 0 }, uSmi: { value: 0 }, uPuf: { value: 0 }, uGlow: { value: 0 } };
  const UE = { uTear: { value: 0 } }, UP = { uBurn: { value: 1 }, uAsh: { value: 0 }, uLit: { value: 0 }, uDraw: { value: 0 }, uChar: { value: 1 }, uCrush: { value: 0 }, uFl: { value: 1 } };
  const v3s = a => `vec3(${a.map(x => (+x).toFixed(4)).join(',')})`;
  const NOS = [1.465, 2.75, .078], THR = [.66, 2.34, 0], BELC = [.6, 1.05, 0], SMI = [.74, 2.548, .182], PUF = [.98, 2.62, .17];
  const LIDMAX = 1.29, LIDE0 = .85;
  const CIGL = .52, CIGF = .13, CIGR = .042;

  function buildBody() {
    const parts = [], bn = (b, n) => b + n;
    parts.push(E([-.22, .66, 0], [.66, .6, .64], { bone: 'root', k: 0 }), E([.2, 1.05, 0], [.62, .68, .6], { bone: 'spine', k: .25 }), E([.06, 1.6, 0], [.47, .5, .5], { bone: 'chest', k: .25 }), E([-.12, 1.75, 0], [.42, .38, .5], { bone: 'chest', k: .2 }),
      Cn([.1, 1.9, 0], [.36, 2.3, 0], .37, .3, { bone: 'neck1', k: .18 }), Cn([.36, 2.3, 0], [.56, 2.62, 0], .3, .25, { bone: 'neck2', k: .1 }));
    for (const [n, s] of S2) {
      parts.push(E([.12, .46, s * .5], [.56, .4, .34], { bone: bn('th', n), k: .2 }), Sp([.58, .55, s * .6], .2, { bone: bn('th', n), k: .12 }), Cn([.58, .52, s * .62], [.27, .16, s * .64], .17, .13, { bone: bn('kn', n), k: .08 }),
        Cn([.24, .12, s * .64], [.7, .09, s * .66], .135, .12, { bone: bn('an', n), k: .06 }));
      for (const dz of [-.12, 0, .12]) parts.push(Cn([.66, .085, s * .66 + dz], [.98, .075, s * .66 + dz * 1.7], .085, .07, { bone: bn('to', n), k: .04 }));
      parts.push(E([.12, 1.82, s * .42], [.2, .2, .18], { bone: bn('sh', n), k: .14 }), Cn([.16, 1.8, s * .48], [.36, 1.33, s * .6], .16, .13, { bone: bn('sh', n), k: .1 }), Sp([.36, 1.33, s * .6], .135, { bone: bn('el', n), k: .05 }), Cn([.36, 1.33, s * .6], [.68 + HX, 1.46, s * .5], .13, .095, { bone: bn('el', n), k: .06 }));
      parts.push({ paint: true, ...Sp([.62, .6, s * .74], .12), color: '#e4503e', soft: .06, a: .25 });
    }
    for (let i = 0; i < 7; i++) parts.push(Cn(TP[i], TP[i + 1], TRR[i], TRR[i + 1], { bone: 't' + i, k: i ? .05 : .2 }));
    // a few old warts / spots on the back for the third read
    const R = rng(42); for (let i = 0; i < 9; i++) { const a = R(); parts.push({ paint: true, ...Sp([-.35 - .4 * a, 1.1 + 1.0 * R(), (R() - .5) * .7], .025 + .02 * R()), color: '#8a1f1a', soft: .012, a: .55 }); }
    const F = field(parts), march = (p, d) => { const q = V3(...p), dir = V3(...d).normalize(); for (let i = 0; i < 160 && F(q.x, q.y, q.z) < 0; i++) q.addScaledVector(dir, .01); return q; };
    BL = [V3(1.25, 2.385, 0), V3(.95, 2.39, 0), march([.48, 2.42, 0], [.6, -.8, 0]), march([.33, 2.2, 0], [.85, -.5, 0]), march([.22, 1.95, 0], [1, -.2, 0]), march([.12, 1.7, 0], [1, 0, 0]), march([.15, 1.4, 0], [1, 0, 0]), march([.2, 1.1, 0], [1, 0, 0]), march([.15, .8, 0], [1, -.3, 0]), march([0, .55, 0], [.6, -.8, 0])];
    BLW = [.11, .13, .15, .17, .2, .25, .3, .32, .28, .18]; BLS = [0]; for (let i = 1; i < BL.length; i++) BLS.push(BLS[i - 1] + BL[i].distanceTo(BL[i - 1]));
    parts.forEach(p => { if (!p.paint && !p.cut && !p.color) p.color = bodyCol; });
    const bodyS = carve({ parts, bb: [-2.1, -.12, -1.82, 1.12, 2.9, .92], h: .034, wblend: .07, cblend: .02, ao: .06, aoMin: .55, uvf: bellyUV });
    // ---- head (finer)
    const hc = (x, y, z, nx, ny, nz) => { const n1 = NZ.n3(x * 9, y * 9, z * 9); let c = mixc(RED, REDD, clamp(.1 + .3 * ny * (x < .75 ? 1 : .3) + .25 * n1)); c.lerp(REDL, clamp(.3 * (1 - Math.abs(ny)) * (x > 1 ? 1 : 0) + .15 * n1)); if (y < 2.552 && ny < -.25 && x > .8 && Math.abs(z) < .16) c = mixc(c, GUM, sm(2.552, 2.538, y));
      const sx = x - .95, sy = y - 3.0, sz = z + .21, ux = -.12, uy = -.14, uz = -.1, h = clamp((sx * ux + sy * uy + sz * uz) / (ux * ux + uy * uy + uz * uz)), dsc = Math.hypot(sx - ux * h, sy - uy * h, sz - uz * h); if (dsc < .016) c = mixc(c, col('#f2b6a4'), sm(.016, .007, dsc));
      bellyUV(x, y, z, UVt); if (UVt[1] > .01) c.lerp(BEL, UVt[1]); return c; };
    const hp = [E([.6, 2.77, 0], [.3, .26, .27], { bone: 'head' }), E([.46, 2.74, 0], [.22, .22, .23], { bone: 'head', k: .12 }), Bx([1.06, 2.66, 0], [.36, .125, .185], .1, { bone: 'head', k: .12 }), E([1.37, 2.685, 0], [.12, .11, .155], { bone: 'head', k: .07 }),
      Cn([.42, 2.42, 0], [.56, 2.62, 0], .26, .24, { bone: 'neck2', k: .1 })];
    for (const [n, s] of S2) { const ef = EF[n], ep = (e, ph, r) => { const d = V3().addScaledVector(ef.L, Math.cos(e) * Math.cos(ph)).addScaledVector(ef.W, Math.cos(e) * Math.sin(ph)).addScaledVector(ef.U, Math.sin(e)); return ef.c.clone().addScaledVector(d, r).toArray(); };
      hp.push(E([.74, 2.6, s * .19], [.2, .14, .12], { bone: 'head', k: .1 }), E([1.0, 2.565, s * .16], [.32, .04, .04], { bone: 'head', k: .04 }), Sp([.5, 2.96, s * .15], .072, { bone: 'head', k: .05 }),
        Lk(ep(.95, -1.35, .112), ep(1.2, 0, .116), ep(.95, 1.35, .112), .045, .036, { bone: 'head', k: .05 }), Lk(ep(-.45, -1.25, .092), ep(-.62, 0, .097), ep(-.45, 1.25, .092), .024, .02, { bone: 'head', k: .025 }),
        Lk(ep(-.75, -.9, .114), ep(-.85, 0, .118), ep(-.75, .9, .114), .011, .009, { bone: 'head', k: .02 }),
        { cut: true, ...Sp(ef.c.toArray(), ER + .011), k: .018 }, { cut: true, ...E([NOS[0], NOS[1], s * NOS[2]], [.024, .017, .022]), k: .012 }, { paint: true, ...Sp([NOS[0] + .005, NOS[1], s * NOS[2]], .032), color: '#4a1416', soft: .01 });
    }
    const R2 = rng(7); for (let i = 0; i < 6; i++) hp.push({ paint: true, ...Sp([.35 + .5 * R2(), 2.9 + .1 * R2(), (R2() - .5) * .3], .014 + .01 * R2()), color: '#8d221c', soft: .008, a: .6 });
    hp.forEach(p => { if (!p.paint && !p.cut && !p.color) p.color = hc; });
    const headS = carve({ parts: hp, bb: [.22, 2.36, -.4, 1.64, 3.1, .4], h: .0145, wblend: .05, cblend: .015, ao: .03, aoMin: .55, uvf: bellyUV });
    // ---- jaw
    const jc = (x, y, z, nx, ny, nz) => { let c = mixc(RED, REDD, clamp(.2 + .2 * NZ.n3(x * 9, y * 9, z * 9))); if (ny > .35 && Math.abs(z) < .13 && y > 2.5) c = mixc(c, GUM, sm(.35, .6, ny)); if (ny < -.3) c = mixc(c, BEL, sm(-.3, -.65, ny)); return c; };
    const jp = [Bx([1.0, 2.46, 0], [.33, .07, .15], .06, { bone: 'jaw', color: jc }), E([1.3, 2.455, 0], [.11, .075, .135], { bone: 'jaw', color: jc, k: .06 }), E([.72, 2.5, 0], [.14, .1, .17], { bone: 'jaw', color: jc, k: .08 }),
      E([.97, 2.505, 0], [.27, .035, .085], { bone: 'jaw', color: TONG.getHexString ? '#' + TONG.getHexString() : '#c4505f', k: .03 }), { cut: true, ...E([1.0, 2.555, 0], [.31, .05, .11]), k: .03 }];
    const jawS = carve({ parts: jp, bb: [.5, 2.32, -.22, 1.46, 2.6, .22], h: .0135, wblend: .05, cblend: .01, ao: .02, aoMin: .6 });
    // ---- hands (finer)
    const hands = [];
    for (const [n, s] of S2) { const hcl = (x, y, z, nx, ny) => mixc(RED, REDD, clamp(.15 + .25 * NZ.n3(x * 14, y * 14, z * 14) + .2 * ny)), z0 = s * .47;
      const hpp = [E([.79, 1.46, z0], [.1, .07, .095], { bone: 'hd' + n }), Cn([.64, 1.455, s * .5], [.74, 1.46, s * .485], .085, .08, { bone: 'hd' + n, k: .04 }),
        Cn([.8, 1.44, s * .4], [.87, 1.42, s * .36], .034, .028, { bone: 'hd' + n, k: .03 }), Cn([.87, 1.42, s * .36], [.92, 1.415, s * .355], .028, .022, { bone: 'hd' + n, k: .015 })];
      for (const dz of [-.055, 0, .055]) hpp.push(Sp([.86, 1.49, z0 + dz], .036, { bone: 'hd' + n, k: .02 }), Cn([.86, 1.47, z0 + dz], [.95, 1.468, z0 + dz * 1.15], .036, .032, { bone: 'fg' + n, k: .02 }), Cn([.95, 1.468, z0 + dz * 1.15], [1.0, 1.425, z0 + dz * 1.2], .032, .026, { bone: 'fg' + n, k: .015 }));
      hpp.forEach(p => { p.color = p.color || hcl; p.f = SD.tr(p.f, HX, 0, 0); p.cx += HX; }); hands.push(carve({ parts: hpp, bb: [.58 + HX, 1.33, z0 - .16, 1.06 + HX, 1.57, z0 + .16], h: .0128, wblend: .03, cblend: .01, ao: .012, aoMin: .6 }).geo); }
    // ---- lids, brows (clay, rigid on their bones), wing bones
    const extra = [];
    for (const [n, s] of S2) { const ef = EF[n], dir = (e, ph) => V3().addScaledVector(ef.L, Math.cos(e) * Math.cos(ph)).addScaledVector(ef.W, Math.cos(e) * Math.sin(ph)).addScaledVector(ef.U, Math.sin(e));
      const scar = s < 0, lidC = (x, y, z) => { let c = mixc(RED, REDD, .25 + .2 * NZ.n3(x * 30, y * 30, z * 30)); const sx = x - .95, sy = y - 3.0, sz = z + .21, ux = -.12, uy = -.14, uz = -.1, h = clamp((sx * ux + sy * uy + sz * uz) / .0392), d = Math.hypot(sx - ux * h, sy - uy * h, sz - uz * h); if (scar && d < .016) c = mixc(c, col('#f2b6a4'), sm(.016, .007, d)); return c; };
      const shell = r => Geo.surf((u, v) => { const ph = (u - .5) * 3.8, e = LIDE0 + v * (PI / 2 - LIDE0 + .25); return ef.c.clone().addScaledVector(dir(e, ph), r).toArray(); }, 18, 6, { flip: r < ER + .012 });
      const rim = Geo.tube(Array.from({ length: 19 }, (_, i) => ef.c.clone().addScaledVector(dir(LIDE0, (i / 18 - .5) * 3.8), ER + .014)), .0068, 8);
      const lid = Geo.merge([Geo.paint(shell(ER + .02), lidC), Geo.paint(shell(ER + .008), REDD), Geo.paint(rim, col('#7f1915'))]); extra.push(rigid(lid, 'lid' + n));
      const browPts = (a, b) => Array.from({ length: 9 }, (_, i) => ef.c.clone().addScaledVector(dir(1.05 + .1 * Math.sin((a + (b - a) * i / 8 + 1.25) / 2.5 * PI), a + (b - a) * i / 8), ER + .036));
      const browR = u => [.027 - .01 * u, .016 - .006 * u], bc = (x, y, z) => mixc(col('#b12a22'), REDD, .3 + .3 * NZ.n3(x * 25, y * 25, z * 25));
      const brows = scar ? [Geo.tube(browPts(-1.25, -.08), u => browR(u * .45), 8), Geo.tube(browPts(.12, 1.25), u => browR(.55 + u * .45), 8)] : [Geo.tube(browPts(-1.25, 1.25), browR, 8)];
      brows.forEach(g => extra.push(rigid(Geo.paint(g, bc), 'brow' + n)));
      const W = WRS[n], wn = 'w' + n; extra.push(rigid(Geo.tube([W.w0, W.w1], [.06, .045], 10), wn + '0', RED), rigid(Geo.tube([W.w1, W.w2], [.045, .034], 10), wn + '1', RED), rigid(Geo.sphere(.05, 12, 8).translate(W.w1.x, W.w1.y, W.w1.z), wn + '1', REDD), rigid(Geo.sphere(.042, 12, 8).translate(W.w2.x, W.w2.y, W.w2.z), wn + '2', REDD));
      W.tips.forEach((tp, k) => extra.push(rigid(Geo.tube([W.w2, W.w2.clone().addScaledVector(tp, .5), W.w2.clone().add(tp)], [.026, .018, .008], 8), wn + (3 + k), REDD)));
    }
    const geo = Geo.merge([bodyS.geo, headS.geo, jawS.geo, ...hands, ...extra]);
    return { geo, F: bodyS.f, HF: headS.f };
  }

  function buildHard(F) {
    const L = [], R = rng(11), cream = (x, y, z, nx, ny, nz, u, v) => mixc(col('#efe1c0'), col('#c9b38a'), clamp(.15 + .35 * NZ.n3(x * 20, y * 20, z * 20)));
    // horns: cream, ringed, the left one chipped
    for (const [n, s] of S2) { const chip = s < 0, pts = bez([.5, 2.97, s * .15], [.41, 3.21, s * .19], [.25, 3.31, s * .255], 18), u1 = chip ? .78 : 1, ps = pts.slice(0, Math.round(18 * u1) + 1);
      const rr = u => { const q = u * u1; return lerp(.072, .012, Math.pow(q, .85)) * (1 + .07 * Math.sin(q * TAU * 5.5)); };
      const g = Geo.tube(ps, rr, 12, { caps: !chip }); Geo.paint(g, (x, y, z, nx, ny, nz, u, v) => mixc(col('#f1e6cb'), col('#b39a74'), clamp(.55 * (1 - v) * (1 - v) + .2 * Math.max(0, -Math.sin(v * u1 * TAU * 5.5)) + .15 * NZ.n3(x * 30, y * 30, z * 30))));
      L.push(rigid(g, 'head'));
      if (chip) { const e = ps[ps.length - 1], d = V3().subVectors(e, ps[ps.length - 2]).normalize(), r0 = rr(1), cap = []; const t1 = V3().crossVectors(d, YA).normalize(), t2 = V3().crossVectors(d, t1); const pos = [e.x, e.y, e.z], idx = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU, j = .004 * Math.sin(a * 5) + .006 * Math.cos(a * 3); pos.push(e.x + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * r0 + d.x * j, e.y + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * r0 + d.y * j, e.z + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * r0 + d.z * j); if (i) idx.push(0, i, i + 1); }
        const cg = Geo.make(pos, null, null, idx); L.push(rigid(Geo.paint(cg, col('#fbf4e2')), 'head')); } }
    // claws: feet and hands
    const claw = (A, Bq, Cq, r0, bn) => L.push(rigid(Geo.paint(Geo.tube(bez(A, Bq, Cq, 8), u => lerp(r0, r0 * .12, u), 8), (x, y, z, nx, ny, nz, u, v) => mixc(col('#c7b089'), col('#f5ecd6'), sm(0, .5, v))), bn));
    for (const [n, s] of S2) {
      for (const dz of [-.12, 0, .12]) { const ex = .98 + .055, ez = s * .66 + dz * 1.7; claw([ex - .03, .1, ez], [ex + .06, .11, ez + dz * .15], [ex + .12, .015, ez + dz * .25], .046, 'to' + n); }
      const z0 = s * .47; for (const dz of [-.055, 0, .055]) { const zz = z0 + dz * 1.2; claw([.995 + HX, 1.44, zz], [1.05 + HX, 1.44, zz], [1.075 + HX, 1.395, zz], .025, 'fg' + n); }
      claw([.915 + HX, 1.425, s * .355], [.96 + HX, 1.43, s * .35], [.985 + HX, 1.4, s * .345], .022, 'hd' + n);
      const W = WRS[n]; claw(W.w2.toArray(), [W.w2.x + .04, W.w2.y + .1, W.w2.z], [W.w2.x + .1, W.w2.y + .12, W.w2.z], .022, 'w' + n + '2');
    }
    // teeth: worn, one missing, two fangs over the lower lip (the right one chipped)
    const tooth = (x, y, z, h, r, up, bn) => { const g = Geo.lathe([[r, 0], [r * .98, h * .55], [r * .7, h * .85], [r * .32, h], [0, h * 1.02]], 8); Geo.paint(g, (px, py, pz, nx, ny, nz, u, v) => mixc(col('#d8c79e'), col('#f3ead2'), sm(0, .6, v))); if (!up) g.rotateX(PI); g.translate(x, y, z); return rigid(g, bn); };
    for (const [n, s] of S2) { for (let i = 0; i < 6; i++) { if (s > 0 && i === 3) continue; L.push(tooth(1.34 - i * .1, 2.548, s * (.145 - i * .004), .045 + .01 * R(), .017, false, 'head')); }
      L.push(tooth(1.27, 2.56, s * .168, s < 0 ? .1 : .065, .022, false, 'head'));
      for (let i = 0; i < 5; i++) { if (s < 0 && i === 2) continue; L.push(tooth(1.3 - i * .1, 2.512, s * (.118 - i * .003), .038 + .008 * R(), .015, true, 'jaw')); } }
    // spikes: pink fins down the neck, back and tail, found on the clay surface
    const fin = (h, b, th) => { const o = [[b * .5, 0], [b * .22, h * .55], [-b * .12, h], [-b * .3, h * .6], [-b * .5, 0]]; const g = Geo.extrude(o, th, th * .32, { curve: 24 }); return g; };
    const sp = [], walk = (p, d) => { const q = V3(...p); for (let i = 0; i < 200 && F(q.x, q.y, q.z) < 0; i++) q.addScaledVector(d, .008); return q; };
    const dors = [[.36, 2.68, -.15, .6, .14], [.2, 2.48, -.22, .7, .18], [.06, 2.25, -.32, .55, .2], [-.08, 2.02, -.45, .5, .23], [-.2, 1.8, -.6, .4, .27], [-.3, 1.55, -.75, .35, .28], [-.35, 1.3, -.88, .3, .27], [-.38, 1.05, -.98, .25, .25], [-.4, .8, -1.0, .1, .21]];
    const dorBone = ['neck2', 'neck2', 'neck1', 'neck1', 'chest', 'chest', 'spine', 'spine', 'root'];
    dors.forEach((q, i) => { const d = V3(-1, q[3], 0).normalize(), p = walk([q[0], q[1], 0], d), tg = V3(-q[3], -1, 0).normalize(); sp.push([p, d, tg, q[4], dorBone[i]]); });
    for (let i = 0; i < 7; i++) { const a = V3(...TP[i]), b = V3(...TP[i + 1]); for (let k = 0; k < (i < 3 ? 2 : 1); k++) { const u = (k + .5) / (i < 3 ? 2 : 1), p = a.clone().lerp(b, u), r = lerp(TRR[i], TRR[i + 1], u), tg = V3().subVectors(b, a).normalize().negate(); sp.push([p.add(V3(0, r * .92, 0)), V3(0, 1, 0).addScaledVector(tg, -.0).normalize(), tg, Math.max(.07, .22 - .025 * (i * 1.5 + k)), 't' + i]); } }
    sp.forEach(([p, nrm, tg, h, bn], i) => { const g = fin(h, h * 1.1, Math.max(.026, h * .32)); Geo.paint(g, (x, y, z) => mixc(col('#f7868c'), col('#c4505e'), clamp(1 - y / (h * .9)) * .7 + .1 * NZ.n3(x * 40 + i, y * 40, z * 40)));
      const up = nrm.clone(), fw = tg.clone().addScaledVector(up, -tg.dot(up)).normalize(), side = V3().crossVectors(fw, up); _m.makeBasis(fw.negate(), up, side.negate()); _m.setPosition(p.clone().addScaledVector(up, -.015)); g.applyMatrix4(_m); L.push(rigid(g, bn)); });
    return Geo.merge(L);
  }

  function buildEyes() {
    const L = [];
    for (const [n, s] of S2) { const ef = EF[n], g = Geo.sphere(ER, 32, 22); Geo.paint(g, (x, y, z) => { const d = V3(x, y, z).normalize(), a = Math.acos(clamp(d.dot(ef.L), -1, 1)); return mixc(col('#f4ecd8'), col('#e2b4a2'), sm(1.1, 1.9, a) * .55); });
      g.translate(ef.c.x, ef.c.y, ef.c.z); g.setAttribute('aTr', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4)); L.push(rigid(g, 'eye' + n));
      // the tear that wells up at STUB (lower outer corner)
      const tc = ef.c.clone().addScaledVector(ef.U, -.075).addScaledVector(ef.L, .045).addScaledVector(ef.W, -s * .035), tg = Geo.sphere(.019, 12, 8); tg.scale(1, 1.25, 1); tg.translate(tc.x, tc.y, tc.z); Geo.paint(tg, col('#dfe9f2'));
      const at = new Float32Array(tg.attributes.position.count * 4); for (let i = 0; i < at.length; i += 4) { at[i] = tc.x; at[i + 1] = tc.y; at[i + 2] = tc.z; at[i + 3] = 1; } tg.setAttribute('aTr', new THREE.BufferAttribute(at, 4)); L.push(rigid(tg, 'head')); }
    return Geo.merge(L);
  }

  function buildProps() {
    const L = [], cgAttr = (g, kind, e) => { const n = g.attributes.position.count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = typeof kind === 'function' ? kind(g.attributes.position.getX(i)) : kind; a[i * 2 + 1] = typeof e === 'function' ? e(g.attributes.position.getX(i)) : e; } g.setAttribute('aCg', new THREE.BufferAttribute(a, 2)); return g; };
    const tubeX = (x0, x1, r, segs, sides = 14) => { const p = []; for (let i = 0; i <= segs; i++) p.push(V3(lerp(x0, x1, i / segs), 0, 0)); return Geo.tube(p, r, sides, { caps: false, up: [0, 1, 0] }); };
    const disc = (x, r, flip) => { const g = new THREE.CircleGeometry(r, 14); g.rotateY(flip ? -PI / 2 : PI / 2); g.translate(x, 0, 0); return Geo.idx(g); };
    const R = rng(3), speck = (base, dk) => (x, y, z) => mixc(col(base), col(dk), clamp(.5 + 2.2 * NZ.n3(x * 90, y * 90, z * 90)) * .5);
    // the active cigarette (on bone 'cig', +X from the filter end): filter, paper, ember, growing ash
    const filt = cgAttr(Geo.merge([Geo.paint(tubeX(0, CIGF, CIGR * 1.02, 3), speck('#d99a52', '#b0703a')), Geo.paint(disc(0, CIGR * 1.02, true), col('#e8c48e'))]), .25, 0);
    const ring = cgAttr(Geo.paint(tubeX(CIGF - .012, CIGF + .004, CIGR * 1.05, 1), col('#c9a24a')), .25, 0);
    const paper = cgAttr(Geo.paint(tubeX(CIGF, .5, CIGR, 8), (x, y, z) => mixc(col('#f6f2ea'), col('#dcd4c6'), .15 + .2 * NZ.n3(x * 40, y * 40, z * 40))), 1, 0);
    const emb = cgAttr(Geo.merge([Geo.paint(tubeX(.5, .52, CIGR * .97, 1), (x, y, z) => mixc(col('#2a1d18'), col('#b2401e'), clamp(.5 + 2 * NZ.n3(y * 140, z * 140, x)))), Geo.paint(disc(.52, CIGR * .95), (x, y, z) => mixc(col('#3a2018'), col('#e0602a'), clamp(.5 + 2.5 * NZ.n3(y * 160, z * 160, 1))))]), 2, 1);
    const ashG = Geo.tube([V3(.52, 0, 0), V3(.57, .002, 0), V3(.62, -.003, 0)], u => CIGR * (.98 - .12 * u), 12, { caps: true, up: [0, 1, 0] }); Geo.warp(ashG, (x, y, z) => { const k = 1 + .08 * NZ.n3(x * 60, y * 60, z * 60); return [x, y * k, z * k]; });
    cgAttr(Geo.paint(ashG, (x, y, z) => mixc(col('#a19c94'), col('#6c6862'), clamp(.5 + 2 * NZ.n3(x * 80, y * 80, z * 80)))), 3, 0);
    L.push(rigid(filt, 'cig'), rigid(ring, 'cig'), rigid(paper, 'cig'), rigid(emb, 'cig'), rigid(ashG, 'cig'));
    // the flint: a faceted blue-grey stone
    const fl = new THREE.IcosahedronGeometry(.075, 1).toNonIndexed(); Geo.idx(fl); Geo.warp(fl, (x, y, z) => { const k = 1 + .25 * NZ.n3(x * 9 + 2, y * 9, z * 9); return [x * k * 1.25, y * k * .8, z * k]; }, { weld: false });
    L.push(cgAttr(rigid(Geo.paint(fl, (x, y, z) => mixc(col('#4d5563'), col('#8e97a3'), clamp(.4 + 1.5 * NZ.n3(x * 30, y * 30, z * 30)))), 'flint'), 0, 0));
    // floor props: the crushed pack, three old butts, a little ash heap (on bone 'floor' = the seat's floor frame)
    const pk = Geo.box(.2, .07, .3, .02, 3); Geo.warp(pk, (x, y, z) => { const k = NZ.n3(x * 14, y * 14 + 4, z * 14); return [x * (1 + .2 * k), y * (.75 + .5 * NZ.n3(x * 9, 1, z * 9)), z + .02 * k]; });
    Geo.paint(pk, (x, y, z) => (Math.abs(z) < .05 ? col('#c8322a') : Math.abs(z - .1) < .012 ? col('#d8b04a') : mixc(col('#efe6d2'), col('#c9bfac'), clamp(.5 + 2 * NZ.n3(x * 30, y * 30, z * 30)) * .5)));
    pk.rotateY(.5); pk.translate(.95, .035, -1.18); L.push(cgAttr(rigid(pk, 'floor'), 0, 0));
    const butt = (len) => { const g = Geo.merge([Geo.paint(tubeX(0, CIGF, CIGR, 2), speck('#d99a52', '#a86c38')), Geo.paint(tubeX(CIGF, CIGF + len, CIGR * .98, 2), col('#ece6da')), Geo.paint(disc(CIGF + len, CIGR * .95), col('#2d241f')), Geo.paint(disc(0, CIGR, true), col('#e8c48e'))]); Geo.warp(g, (x, y, z) => [x, y * (1 - .35 * sm(CIGF, CIGF + len, x)), z]); return g; };
    [[.62, -1.42, .3, .1], [1.25, -1.32, 2.4, .06], [.45, -1.2, 1.2, .14]].forEach(([x, z, a, l]) => { const g = butt(l); g.translate(-(CIGF + l) / 2, CIGR * .8, 0); g.rotateY(a); g.translate(x, 0, z); L.push(cgAttr(rigid(g, 'floor'), 0, 0)); });
    const heap = Geo.sphere(.09, 14, 8); heap.scale(1.4, .32, 1.1); Geo.warp(heap, (x, y, z) => [x, Math.max(0, y) * (1 + .4 * NZ.n3(x * 20, 0, z * 20)), z]); Geo.paint(heap, (x, y, z) => mixc(col('#8f8a84'), col('#57534f'), clamp(.5 + 2 * NZ.n3(x * 50, y * 50, z * 50)))); heap.translate(.82, 0, -1.4); L.push(cgAttr(rigid(heap, 'floor'), 0, 0));
    const db = butt(.07); db.translate(-(CIGF + .07) / 2, CIGR * .8, 0); L.push(cgAttr(rigid(db, 'butt'), 0, 0));
    return Geo.merge(L);
  }

  // ---- wing membrane: rebuilt every frame from the wing bones (3 scalloped panels per wing)
  const NU = 6, NV = 4, PAN = 3, PV = (NU + 1) * (NV + 1), WVN = PAN * PV;
  function buildMembrane() {
    const n = 2 * WVN, pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), idx = [];
    for (let w = 0; w < 2; w++) for (let p = 0; p < PAN; p++) { const o = w * WVN + p * PV; for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = o + i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const u = i / NU, v = j / NV, k = o + i * (NV + 1) + j, vein = Math.max(Math.exp(-v * v * 60), Math.exp(-(1 - v) * (1 - v) * 60)), vn = Math.exp(-Math.pow((v - .5 - .12 * Math.sin(u * 7)) * 9, 2)) * .5 * sm(.2, .6, u), c = mixc(col('#c42f2a'), col('#7d1a18'), clamp(.7 * vein + .5 * vn + .25 * (1 - u))).lerp(col('#e4584a'), .25 * u * (1 - vein)); cl[k * 3] = c.r; cl[k * 3 + 1] = c.g; cl[k * 3 + 2] = c.b; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); g.setIndex(idx); g.boundingSphere = new THREE.Sphere(V3(0, 1.5, 0), 6); return g;
  }

  function build() {
    const t0 = performance.now();
    RIG = Sculpt.rig(D); B = RIG.bones; BI = n => RIG.names.indexOf(n);
    const BD = buildBody();
    const mBody = Mat.hook(Mat.make('clay', { vcol: true, scale: 1.6, bump: .0032, rough: .7 }), { key: 'ashBody', uniforms: U,
      vertPars: 'uniform vec2 uNos; uniform float uThr, uBel, uSmi, uPuf;',
      vert: /* glsl */`{ vec3 p_ = transformed; vec3 a_ = vec3(p_.x - ${NOS[0]}, p_.y - ${NOS[1]}, abs(p_.z) - ${NOS[2]}); float qn_ = exp(-dot(a_, a_) / 0.0022) * (p_.z < 0.0 ? uNos.x : uNos.y);
        vec3 t_ = (p_ - ${v3s(THR)}) * vec3(5.2, 3.8, 4.4); float qt_ = exp(-dot(t_, t_)); vec3 b_ = (p_ - ${v3s(BELC)}) * vec3(1.9, 1.7, 1.8); float qb_ = exp(-dot(b_, b_)) * smoothstep(0.0, 0.3, p_.x);
        vec3 s_ = vec3(p_.x - ${SMI[0]}, p_.y - ${SMI[1]}, abs(p_.z) - ${SMI[2]}); float qs_ = exp(-dot(s_, s_) / 0.004); vec3 c_ = vec3(p_.x - ${PUF[0]}, p_.y - ${PUF[1]}, abs(p_.z) - ${PUF[2]}); float qc_ = exp(-dot(c_, c_) / 0.009);
        transformed += normal * (qn_ * 0.024 + qt_ * uThr + qb_ * uBel + qc_ * uPuf * 0.045) + vec3(-0.012, 0.028, 0.0) * qs_ * uSmi; }`,
      fragPars: 'uniform float uGlow;',
      color: /* glsl */`{ vec4 sc_ = trTri(op * 2.3, on); float bel_ = clamp(vTU.y, 0.0, 1.0), ce_ = sc_.b, ed_ = 1.0 - smoothstep(0.05, 0.42, ce_);
        float wr_ = texture2D(tNz, vec2(op.x * 1.7 + op.z * 1.3, op.y * 8.0)).a; col *= 1.0 - 0.2 * ed_ * (1.0 - bel_); col *= 0.95 + 0.1 * wr_;
        hgt = hgt * 0.25 + smoothstep(0.0, 0.55, ce_) * (1.0 - bel_) * 0.8 + wr_ * 0.12;
        if (bel_ > 0.002) { float u_ = vTU.x / 0.1, f_ = fract(u_), g_ = smoothstep(0.0, 0.16, f_) * smoothstep(1.0, 0.78, f_); col = mix(col, col * (0.72 + 0.32 * g_), bel_); hgt = mix(hgt, g_ * 1.5 + nz.g * 0.3, bel_); rgh = mix(rgh, rgh - 0.12 * g_, bel_); } }`,
      emissive: /* glsl */`{ vec3 t_ = (vOP - ${v3s(THR)}) * vec3(4.6, 3.2, 3.8); totalEmissiveRadiance += vec3(1.0, 0.36, 0.1) * uGlow * exp(-dot(t_, t_)) * 1.1; }` });
    body = Sculpt.skinned(BD.geo, mBody, RIG); body.name = 'ash.body'; body.customDepthMaterial = mBody.userData.depth;
    const skin = (geo, mat, cast) => { const m = new THREE.SkinnedMesh(geo, mat); m.bind(body.skeleton, body.bindMatrix); m.castShadow = !!cast; m.receiveShadow = true; m.frustumCulled = false; if (mat.userData.depth) m.customDepthMaterial = mat.userData.depth; body.add(m); return m; };
    hardM = skin(buildHard(BD.F), Mat.make('lacquer', { vcol: true, rough: .42 }), true); hardM.name = 'ash.hard';
    eyeM = skin(buildEyes(), Mat.hook(Mat.make('ceramic', { vcol: true, rough: .1 }), { key: 'ashEye', uniforms: UE, vertPars: 'attribute vec4 aTr; uniform float uTear;', vert: 'if (aTr.w > 0.5) transformed = aTr.xyz + (transformed - aTr.xyz) * uTear;', color: `{ float s_ = vOP.z < 0.0 ? -1.0 : 1.0; vec3 c_ = vec3(${EYE[0]}, ${EYE[1]}, s_ * ${EYE[2]}); vec3 r_ = vOP - c_; if (length(r_) < ${(ER * 1.06).toFixed(4)}) { float a_ = acos(clamp(dot(normalize(r_), normalize(vec3(.85, .07, s_ * .52))), -1.0, 1.0)), w_ = fwidth(a_) + 0.004;
        vec3 ir_ = mix(vec3(0.62, 0.36, 0.07), vec3(0.95, 0.7, 0.22), smoothstep(0.2, 0.42, a_)); col = mix(col, ir_, 1.0 - smoothstep(0.43 - w_, 0.43 + w_, a_)); col = mix(col, vec3(0.25, 0.12, 0.04), smoothstep(0.38, 0.43, a_) * (1.0 - smoothstep(0.43, 0.45, a_)));
        col = mix(col, vec3(0.02), 1.0 - smoothstep(0.235 - w_, 0.235 + w_, a_)); rgh = 0.06; } }` }), false); eyeM.name = 'ash.eyes';
    propM = skin(buildProps(), Mat.hook(Mat.make('paper', { vcol: true, rough: .8 }), { key: 'ashProps', uniforms: UP,
      vertPars: 'attribute vec2 aCg; uniform float uBurn, uAsh, uCrush; varying float vCgE;',
      vert: /* glsl */`{ vCgE = aCg.y; float tip_ = ${CIGF.toFixed(3)} + ${(.5 - CIGF).toFixed(3)} * uBurn; if (aCg.x > 0.5 && aCg.x < 1.5) transformed.x = ${CIGF.toFixed(3)} + (transformed.x - ${CIGF.toFixed(3)}) * uBurn; else if (aCg.x > 1.5 && aCg.x < 2.5) transformed.x = tip_ + (transformed.x - 0.5); else if (aCg.x > 2.5) { transformed.x = tip_ + 0.02 + (transformed.x - 0.52) * uAsh; transformed.yz *= step(0.01, uAsh); }
        if (aCg.x > 0.1 && aCg.x < 3.5 && uCrush > 0.0) { transformed.y = transformed.y * (1.0 - 0.55 * uCrush) + sin(transformed.x * 16.0) * 0.014 * uCrush; transformed.z *= 1.0 + 0.35 * uCrush; } }`,
      vertDepth: 'float vCgE_ = 0.0;',
      fragPars: 'uniform float uLit, uDraw, uChar, uFl; varying float vCgE;',
      color: '{ col = mix(col, vec3(0.92, 0.9, 0.85), vCgE * (1.0 - uChar)); col = mix(col, col * vec3(1.6, 0.7, 0.4), vCgE * uLit * 0.6); }',
      emissive: '{ totalEmissiveRadiance += vec3(1.0, 0.33, 0.07) * vCgE * uLit * (0.55 + 3.2 * uDraw) * uFl; }' }), false); propM.name = 'ash.props';
    memGeo = buildMembrane(); memM = Mat.mesh(memGeo, Mat.make('skin', { vcol: true, trans: .85, transColor: '#ff5a3c', double: true, rough: .55 })); memM.frustumCulled = false; memM.name = 'ash.wings'; body.add(memM);
    root = new THREE.Group(); root.name = 'ash'; root.add(body); [body, hardM, eyeM, memM].forEach(o => o.layers.enable(1));
    const bs = new THREE.Sphere(V3(0, 1.5, 0), 4.5); [body, hardM, eyeM].forEach(m => { m.boundingSphere = bs; });
    pick.push(body);
    // smoke: cotton-wool puffs; sparks: glitter
    const pg = new THREE.IcosahedronGeometry(1, 1); Geo.idx(pg); Geo.warp(pg, (x, y, z) => { const k = 1 + .16 * NZ.n3(x * 2.1, y * 2.1, z * 2.1) + .06 * NZ.n3(x * 6, y * 6, z * 6); return [x * k, y * k, z * k]; });
    smokeM = Mat.inst(pg, Mat.make('felt', { color: '#e9e6e2', rough: 1, scale: 14, bump: .002, trans: .5 }), NP, { cast: false }); smokeM.name = 'ash.smoke'; smokeM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3).fill(1), 3);
    const sg = new THREE.OctahedronGeometry(.012, 0); Geo.idx(sg); sparkM = Mat.inst(sg, Mat.make('plain', { color: '#ffe08a', emissive: '#ffb347', emissiveI: 6 }), NS, { cast: false }); sparkM.name = 'ash.sparks';
    _m.makeScale(0, 0, 0); for (let i = 0; i < NP; i++) smokeM.setMatrixAt(i, _m); for (let i = 0; i < NS; i++) sparkM.setMatrixAt(i, _m);
    // lights
    LT.tip = Lan.add({ x: 0, y: -99, z: 0, r: 1.8, color: [1, .5, .16], gain: () => ST.tipG }); LT.thr = Lan.add({ x: 0, y: -99, z: 0, r: 2.4, color: [1, .5, .2], gain: () => ST.thrG });
    LT.spk = Lan.add({ x: 0, y: -99, z: 0, r: 3, color: [1, .78, .4], gain: () => ST.spkG }); LT.fire = Lan.add({ x: 0, y: -99, z: 0, r: 5, color: [1, .52, .18], gain: () => ST.fireG });
    built = true; G.info.ashBuild = Math.round(performance.now() - t0);
    G.info.ashTris = Math.round([body, hardM, eyeM, propM, memM].reduce((s, m) => s + m.geometry.index.count / 3, 0) + NP * pg.index.count / 3 + NS * 8);
    return [root, smokeM, sparkM];
  }

  // ================================================================ the story: where he is, what his body does (pure functions of t)
  const AP = () => Score.tracks.puff.filter(e => !e.who || e.who === 'ash');
  const SND = Score.sounds.filter(s => s.who === 'ash');
  const cvP = AP().filter(e => e.t >= C.CAVE - .1 && e.t < C.RAIN), pf = i => (cvP[i] || { t: C.CAVE + (i + 1) * 2.4 }).t;
  const P1 = pf(0), P2 = pf(1), P3 = pf(2), P4 = pf(3);
  const DROP0 = P3 + .3, DROP = P3 + .62, PACK = P3 + .95, FRONT = C.WHEEZE - .42, TOMOUTH = C.WHEEZE + .8, FPICK = C.WHEEZE + .25, STRIKE1 = C.FLINT - .3, STRIKE2 = C.FLINT, FLICK = C.SMOKE_FACE + 2.0;
  const IMP = C.ASH_DOWN + .5, WALK0 = C.RETURN + .85, WALK1 = C.ASH_STANDS + .05, TRB = BT('train'), TRAIN_COUGH = T('train', 3) - .02;
  const ACTS = SND.concat([{ t: TRAIN_COUGH, dur: .6, kind: 'cough', who: 'ash', demo: 1 }]).sort((a, b) => a.t - b.t);
  const SEAT = M.ASH_SEAT.clone(), SEAT_YAW = yawOf(M.CAVE_DIR), SHEL = M.CAVE.clone().addScaledVector(M.CAVE_DIR, -2.9).addScaledVector(leftOf(M.CAVE_DIR), 1.35);
  const LSEAT = M.LEDGE.clone().add(V3(-3, 0, -1.8)), LYAW = yawOf(V3(4, 0, 3.3).normalize());
  const toA = V3().subVectors(M.ASH_CLIMAX, M.EMBER_CLIMAX).setY(0).normalize(), BESIDE = M.EMBER_CLIMAX.clone().addScaledVector(toA, 1.4).add(V3(-toA.z, 0, toA.x).multiplyScalar(1.5));
  const seatM = new THREE.Matrix4().compose(SEAT, new THREE.Quaternion().setFromAxisAngle(YA, SEAT_YAW), _one);
  const DUP = C.FLY - 1.0;  // he gets up for take-off
  const facing = (t, p) => { const c = M.cinder(t, _g); return yawOf(_f.set(c.x - p.x, 0, c.z - p.z).normalize()); };
  // placement: ground point + yaw (flight is solved later from the mouth)
  function place(t, out) {
    out.fly = false; out.roll = 0; out.tumble = 0;
    if (t < C.RAIN) { out.pos.copy(SEAT); out.yaw = SEAT_YAW; out.gy = SEAT.y; }
    else if (t < C.TRAIN) { out.pos.copy(SHEL); out.yaw = SEAT_YAW; out.gy = SHEL.y; }
    else if (t < C.RETURN) { out.pos.copy(LSEAT); out.yaw = LYAW; out.gy = LSEAT.y; }
    else if (t < C.ASH_DOWN) { const u = clamp((t - WALK0) / (WALK1 - WALK0)), e = u * u * (3 - 2 * u) * .3 + u * .7; out.pos.lerpVectors(BESIDE, M.ASH_CLIMAX, e); out.yaw = facing(Math.min(t, C.ASH_DOWN), out.pos); out.gy = M.ASH_CLIMAX.y; out.walk = BESIDE.distanceTo(M.ASH_CLIMAX) * e; }
    else if (t < C.FLY) { const u = clamp((t - C.ASH_DOWN) / (IMP - C.ASH_DOWN)), e = 1 - (1 - u) * (1 - u); out.pos.lerpVectors(M.ASH_CLIMAX, M.ASH_THROWN, e); out.pos.y += 2.7 * Math.sin(PI * u) * (1 - u * .3); out.yaw = facing(C.ASH_DOWN, M.ASH_CLIMAX); out.gy = M.ASH_THROWN.y; out.tumble = u;
      if (t > IMP) out.pos.addScaledVector(V3().subVectors(M.ASH_THROWN, M.ASH_CLIMAX).setY(0).normalize(), .35 * sm(IMP, IMP + .5, t)); }
    else { out.fly = true; M.heart2('ash', t, out.pos); out.gy = out.pos.y - 3; const a = M.heart2('ash', t - .06, V3()), b = M.heart2('ash', t + .06, V3()), d = V3().subVectors(b, a); let y = d.lengthSq() > 1e-6 ? yawOf(V3(d.x, 0, d.z).normalize()) : yawOf(V3(0, 0, -1));
      const w = sm(C.HEART2 - 1.4, C.HEART2 - .3, t), y2 = yawOf(V3(0, 0, -1)); let dy = y2 - y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); out.yaw = y + dy * w; out.climb = Math.atan2(d.y, Math.hypot(d.x, d.z) + 1e-4) * (1 - w);
      const a2 = M.heart2('ash', t - .2, V3()), d2 = V3().subVectors(a, a2); const y0 = d2.lengthSq() > 1e-6 ? yawOf(V3(d2.x, 0, d2.z).normalize()) : out.yaw; let tr = out.yaw - y0; tr = Math.atan2(Math.sin(tr), Math.cos(tr)); out.roll = clamp(-tr * 2.5, -.5, .5) * (1 - w); }
    return out; }
  // mode weights: sit lie stand rear crump fly
  const MODE = ['sit', 'lie', 'stand', 'rear', 'crump', 'fly'];
  function modes(t, w) {
    w.sit = w.lie = w.stand = w.rear = w.crump = w.fly = 0;
    if (t < C.RAIN) w.sit = 1; else if (t < C.TRAIN) w.lie = 1; else if (t < C.RETURN) w.sit = 1;
    else if (t < C.ASH_DOWN) { const a = sm(C.RETURN + .25, C.RETURN + .85, t), b = sm(C.ASH_STANDS - .12, C.ASH_STANDS + .38, t); w.sit = 1 - a; w.stand = a * (1 - b); w.rear = b; }
    else if (t < C.FLY) { const a = sm(C.WAKE + .7, C.WAKE + 1.9, t), b = sm(DUP, DUP + .7, t); w.crump = 1 - a; w.lie = a * (1 - b); w.stand = b; }
    else { const a = sm(C.FLY - .05, C.FLY + .45, t); w.stand = 1 - a; w.fly = a; }
    return w; }
  const MP = { sit: { rp: [0, 0, 0], pitch: 0, sp: 0, ch: 0, n1: 0, n2: 0, cx: [.15, 1.35, 0] }, lie: { rp: [.05, -.04, 0], pitch: -1.12, sp: .1, ch: .14, n1: .62, n2: .28, cx: [.5, .8, 0] },
    stand: { rp: [-.05, .42, 0], pitch: -.55, sp: -.05, ch: .05, n1: .28, n2: .14, cx: [.3, 1.8, 0] }, rear: { rp: [-.1, .58, 0], pitch: .12, sp: -.02, ch: .1, n1: -.12, n2: .08, cx: [.1, 2.0, 0] },
    crump: { rp: [0, -.06, 0], pitch: -.2, sp: .1, ch: .08, n1: -.35, n2: -.25, cx: [.2, .6, 0] }, fly: { rp: [0, 0, 0], pitch: -1.3, sp: .04, ch: .04, n1: 1.0, n2: .3, cx: [-.6, 1.2, 0] } };
  const PL = { pos: V3(), yaw: 0, gy: 0, fly: false, roll: 0, tumble: 0, climb: 0, walk: 0 }, PL2 = { pos: V3(), yaw: 0 }, MW = {}, MW2 = {};
  function at(t, out) { out = out || V3(); place(t, PL2); modes(t, MW2); _a.set(0, 0, 0); for (const k of MODE) if (MW2[k]) _a.x += MP[k].cx[0] * MW2[k], _a.y += MP[k].cx[1] * MW2[k], _a.z += MP[k].cx[2] * MW2[k]; if (PL2.fly) { _a.set(-1.4, -.2, 0); } return out.copy(_a).applyAxisAngle(YA, PL2.yaw).add(PL2.pos); }

  // ---- the cigarette's life (pure)
  const KB_OLD = K([[C.CAVE - 4, .8], [DROP, .14]]), KB_NEW = K([[C.SNEEZE_LIGHT, 1], [C.STUB, .5]]);
  const cigState = t => { // {lit, burn, ash, char, crush}
    if (t < DROP) return { lit: 1, burn: KB_OLD(t), ash: t < FLICK ? lerp(.35, .95, sm(C.CAVE - 1, FLICK, t)) : lerp(.05, .6, sm(FLICK + .15, DROP, t)), char: 1, crush: 0 };
    if (t < C.TRAIN) { const lit = t < C.SNEEZE_LIGHT ? 0 : 1 - sm(C.STUB + .15, C.STUB + .55, t); return { lit: lit * (1 + .8 * bell(t, C.SNEEZE_LIGHT + .08, .12)), burn: KB_NEW(t), ash: t < C.SNEEZE_LIGHT ? 0 : lerp(0, .9, sm(C.SNEEZE_LIGHT, C.STUB, t)) * (1 - sm(C.STUB, C.STUB + .15, t)), char: t < C.SNEEZE_LIGHT ? 0 : 1, crush: sm(C.STUB + .05, C.STUB + .5, t) }; }
    if (t < C.JOKE) return { lit: 0, burn: 1, ash: 0, char: 0, crush: 0 };
    const u = t - C.JOKE; return { lit: u < .45 ? 1.6 * (1 - sm(.25, .45, u)) : 0, burn: 1 - sm(0, .3, u), ash: .7 * bump(u, 0, .12, .3, .5), char: 1, crush: 0 }; };
  const DRAGS = [[C.CAVE + .2, P1 - .08], [P2 - 1.45, P2 - .12], [P3 - 1.3, P3 - .1], [C.ACCEPT + 1.0, C.ACCEPT + 1.75], [C.RAIN + .3, C.RAIN + 1.5], [C.HUM - 1.3, C.HUM - .35], [C.SNEEZE_LIGHT - .05, C.SNEEZE_LIGHT + .35]];
  const draw = t => { let d = 0; for (const [a, b] of DRAGS) if (t > a - .2 && t < b + .4) d = Math.max(d, sm(a, b, t) * (1 - sm(b, b + .25, t))); return d; };
  const cigLit = t => { if (t === undefined) t = ST.t; return clamp(cigState(t).lit); };
  const fire = t => { if (t === undefined) t = ST.t; const a = C.ASH_FIRE; return clamp(sm(a - .02, a + .1, t) * (1 - sm(a + .9, a + 1.35, t)) + .55 * sm(C.FLY + .8, C.FLY + 1.6, t) * (1 - sm(C.HEART2 - .15, C.HEART2 + .35, t))); };

  // ---- gesture timelines (names resolved each frame)
  const handL = TL([[-1e9, 'hold'], [P1, 'low', .35], [P2 - 1.6, 'hold', .4], [P2 - .12, 'low', .3], [P3 - 1.45, 'hold', .4], [P3 - .1, 'low', .3], [DROP0, 'floor', .32], [PACK, 'pack', .2], [PACK + .12, 'front', .45], [TOMOUTH, 'hold', .25], [TOMOUTH + .28, 'strike', .25], [C.FLINT + .45, 'rest', .4], [C.ACCEPT + .55, 'hold', .4],
    [C.RAIN, null, 0], [C.SING - 1.0, 'cigout', .35], [C.SING - .45, 'stubrest', .4], [C.STUB - .1, 'stub', .25], [C.STUB + .65, null, .5], [C.TRAIN, null, 0], [C.HEART2 + .05, 'horn', .3], [C.HEART2 + .38, 'hold', .25], [C.JOKE + .6, 'belly', .4]]);
  const handR = TL([[-1e9, 'rest'], [FPICK, 'flintpick', .3], [FPICK + .42, 'strikeR', .35], [C.FLINT + .4, 'knee', .45], [C.ACCEPT + .2, 'belly', .3], [C.RAIN, null, 0], [C.JOKE + .6, 'belly', .4], [C.JOKE + 2.2, null, .5]]);
  const cigAt = TL([[-1e9, 'mouth'], [P1 + .02, 'hand', .25], [P2 - 1.5, 'mouth', .3], [P2 - .08, 'hand', .25], [P3 - 1.35, 'mouth', .3], [P3 - .06, 'hand', .25], [DROP, 'hidden', 0], [PACK, 'hand', 0], [TOMOUTH + .02, 'mouth', .24],
    [C.RAIN, 'mouth', 0], [C.SING - .8, 'hand', .3], [C.STUB + .42, 'floor', .15], [C.TRAIN, 'horn', 0], [C.HEART2 + .3, 'hand', .12], [C.HEART2 + .5, 'mouth', .22], [C.JOKE + .65, 'fall', 0]]);
  const look = TL([[-1e9, 'fwd'], [P1 + .4, 'ember', .45], [P1 + 1.3, 'fwd', .6], [P2 - .85, 'ember', .5], [C.SMOKE_FACE + 1.72, 'away', .35], [P3 - .1, 'up', .4], [DROP0 - .05, 'floorL', .35], [PACK + .2, 'tip', .4], [C.FLINT + .35, 'tip', .2], [P4 - .25, 'sigh', .4], [C.SNEEZE_LIGHT - .05, 'tip', .12], [C.ACCEPT, 'ember', .3], [C.ACCEPT + 1.1, 'fwd', .6],
    [C.RAIN, 'rain', 0], [C.WING - .2, 'ember', .4], [C.WING + 1.7, 'rain', .7], [C.SING - .4, 'under', .6], [C.STUB - .2, 'stub', .3], [C.STUB + .75, 'rain', .9],
    [C.TRAIN, 'ember', 0], [C.RETURN, 'cinder', .25], [C.ASH_DOWN, 'free', .05], [C.WAKE, 'ember', .5], [C.ASH_FIRE - .3, 'fireup', .25], [C.ASH_FIRE + 1.2, 'ember', .4], [C.FLY, 'sky', .3], [C.HEART2 - 1.1, 'ember', .5], [C.JOKE + .9, 'laugh', .3]]);
  const eyeT = TL([[-1e9, null], [C.CAVE + .9, 'ember', .15], [C.CAVE + 1.8, null, .3], [C.IMITATE - .1, 'ember', .12], [P3 - .15, null, .2], [C.SNEEZE_LIGHT, 'tip', .06], [C.ACCEPT, null, .2], [C.RAIN + 1.0, 'ember', .2], [C.RAIN + 1.8, null, .3], [C.RAIN + 2.4, null, 0]]);
  // face curves
  const kLid = K([[C.DAWN0, .42], [P1 + .4, .56], [P1 + 1.2, .42], [P2 - .5, .34], [C.SMOKE_FACE + .9, .28], [C.SMOKE_FACE + 1.72, .02], [C.IMITATE - .15, .05], [C.IMITATE + .05, .26], [P3 + .4, .3], [DROP0, .42], [PACK + .2, .5], [C.WHEEZE - .3, .62], [C.WHEEZE + .2, .78], [C.WHEEZE + .9, .3], [FPICK + .5, .5], [C.FLINT + .3, .45], [P4 - .1, .18], [P4 + .6, .3], [C.SNEEZE_LIGHT, .3], [C.SNEEZE_LIGHT + .07, 1], [C.ACCEPT - .05, .98], [C.ACCEPT + .15, .55], [C.ACCEPT + .4, .3], [C.ACCEPT + 1.0, .42],
    [C.RAIN, .44], [C.WING, .56], [C.HUM + 1, .42], [C.SING, .52], [C.STUB, .45], [C.STUB + 1, .6], [C.TRAIN - .01, .55], [C.TRAIN, .55], [C.GLIDE - .2, .6], [C.GLIDE + .3, .8], [C.GLIDE + 1.0, .36], [C.RETURN, .6], [C.RETURN + .15, 1], [C.ASH_STANDS, .75], [C.ASH_STANDS + .4, .55], [C.ASH_STANDS + 1.3, .15], [C.ASH_DOWN, 0],
    [C.WAKE + .1, 0], [C.WAKE + .5, .26], [C.WAKE + 1.2, .45], [C.ASH_FIRE, .55], [C.ASH_FIRE + .08, 1], [C.ASH_FIRE + .6, .85], [C.ASH_FIRE + .9, .35], [C.FLY, .75], [C.HEART2 - .5, .62], [C.JOKE, .5], [C.JOKE + .3, .3], [C.JOKE + .9, .08]]);
  const kBrow = K([[C.DAWN0, -.3], [P1 + .4, -.1], [P2, -.25], [C.IMITATE, -.2], [C.WHEEZE - .4, .35], [C.WHEEZE + .9, -.2], [C.FLINT - .3, -.4], [P4, -.1], [C.SNEEZE_LIGHT, -.1], [C.SNEEZE_LIGHT + .08, 1], [C.ACCEPT + .3, .3], [C.RAIN, .05], [C.SING, .2], [C.STUB + .5, .15], [C.TRAIN, 0], [C.GLIDE, .5], [C.RETURN, .2], [C.RETURN + .15, .85], [C.ASH_STANDS, -.6], [C.ASH_STANDS + 1.3, .3], [C.ASH_DOWN, .4],
    [C.WAKE, -.1], [C.ASH_FIRE, .1], [C.ASH_FIRE + .1, 1], [C.FLY, .45], [C.JOKE, .2], [C.JOKE + .3, -.35], [C.JOKE + .9, .6]]);
  const kTilt = K([[C.DAWN0, .85], [P1 + .4, 1], [P2, .7], [C.SMOKE_FACE + 1.7, 1], [C.IMITATE, .8], [C.WHEEZE - .4, .1], [C.WHEEZE + .9, -.65], [C.FLINT - .5, .55], [P4, -.5], [C.SNEEZE_LIGHT, -.3], [C.ACCEPT + .3, -.2], [C.RAIN, -.25], [C.SING, -.5], [C.STUB + .5, -.65], [C.TRAIN, .25], [C.GLIDE, -.2], [C.RETURN, -.2], [C.ASH_STANDS, 1], [C.ASH_STANDS + 1.3, -.1], [C.ASH_DOWN, .5],
    [C.WAKE, -.4], [C.ASH_FIRE, -.4], [C.FLY, -.2], [C.JOKE, -.1], [C.JOKE + .3, .5], [C.JOKE + .9, -.3]]);
  const kSmile = K([[C.DAWN0, -.3], [C.SMOKE_FACE + .9, .3], [C.SMOKE_FACE + 1.7, -.4], [C.IMITATE, -.2], [C.WHEEZE + .9, -.55], [C.SNEEZE_LIGHT, -.1], [C.ACCEPT, .1], [C.ACCEPT + .2, .85], [C.ACCEPT + 1.2, .45], [C.RAIN, 0], [C.SING, .25], [C.STUB + .5, .15], [C.TRAIN, .05], [C.GLIDE, .1], [C.GLIDE + .4, .75], [C.RETURN, -.1], [C.ASH_STANDS, -.4],
    [C.WAKE + .8, 0], [C.WAKE + 1.6, .6], [C.ASH_FIRE, .4], [C.ASH_FIRE + .3, 1], [C.FLY, .8], [C.HEART2, .65], [C.JOKE + .3, .1], [C.JOKE + .9, 1]]);

  // ================================================================ per-frame posing (bones in group space; the group sits at identity while posing)
  const ST = { t: 0, tipG: 0, thrG: 0, spkG: 0, fireG: 0, tip: V3(), mouth: V3(), head: V3(), dir: V3(1, 0, 0), under: V3(), lastT: -1, gripL: V3(.27, -.02, .09), gripR: V3(.27, -.02, -.09), pos: V3(), flint: V3(), strike: [V3(), V3()], nosL: V3(), nosR: V3(), thr: V3() }, LT = {};
  const Gm = new THREE.Matrix4(), Gi = new THREE.Matrix4(), GQ = new THREE.Quaternion();
  const wq = (b, o) => o.setFromRotationMatrix(b.matrixWorld), wpos = (b, o) => o.setFromMatrixPosition(b.matrixWorld);
  const rotW = (b, q) => { wq(b.parent, _q2); wq(b, _q3); _q3.premultiply(q); b.quaternion.copy(_q2.invert().multiply(_q3)); b.updateMatrixWorld(true); };
  const aimV = (b, cur, des, w) => { if (w <= 0) return; _q.setFromUnitVectors(cur, des); if (w < 1) _q.slerpQuaternions(QI, _q, w); rotW(b, _q); };
  const aimBone = (b, localVec, des, w) => { _u.copy(localVec).applyQuaternion(wq(b, _q3)).normalize(); aimV(b, _u.clone(), des, w); };
  const toG = (p, o) => o.copy(p).applyMatrix4(Gi);              // world -> group
  const fromBone = (b, p, o) => o.set(p[0], p[1], p[2]).sub(_w.fromArray(D[b.name].pos)).applyMatrix4(b.matrixWorld);   // a rest-space point carried by bone b
  function ik(A, Bb, Cc, tg, pole, w) {
    if (w <= 0) return; const a = wpos(A, V3()), b = wpos(Bb, V3()), c = wpos(Cc, V3()), l1 = a.distanceTo(b), l2 = b.distanceTo(c), d = V3().subVectors(tg, a); let dist = d.length(); if (dist < 1e-5) return;
    const dn = d.clone().divideScalar(dist); dist = clamp(dist, Math.abs(l1 - l2) + .01, l1 + l2 - .005); const ca = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    const pv = V3().subVectors(pole, a); pv.addScaledVector(dn, -pv.dot(dn)); if (pv.lengthSq() < 1e-8) pv.set(0, 1, 0); pv.normalize();
    const e = a.clone().addScaledVector(dn, l1 * ca).addScaledVector(pv, l1 * sa); aimV(A, V3().subVectors(b, a).normalize(), V3().subVectors(e, a).normalize(), w);
    wpos(Bb, b); wpos(Cc, c); const end = a.clone().addScaledVector(dn, dist); aimV(Bb, V3().subVectors(c, b).normalize(), V3().subVectors(end, b).normalize(), w); }
  const sndAt = t => { const o = { laugh: 0, lu: 0, roar: 0, cough: 0, cu: 0, hr: 0, wz: 0, gr: 0, grunt: 0, tiny: 0 }; for (const s of ACTS) { const u = t - s.t; if (u < -.15 || u > s.dur + .35) continue; const w = sm(-.12, .02, u) * (1 - sm(s.dur - .05, s.dur + .3, u));
      if (s.kind === 'laugh') { if (w > o.laugh) { o.laugh = w; o.lu = u; o.tiny = s.tiny ? 1 : 0; } } else if (s.kind === 'roar') o.roar = Math.max(o.roar, w); else if (s.kind === 'cough') { if (w > o.cough) { o.cough = w; o.cu = u; } } else if (s.kind === 'hrmph') o.hr = Math.max(o.hr, w); else if (s.kind === 'grunt') o.grunt = Math.max(o.grunt, w); else if (s.kind === 'wheeze') o.wz = Math.max(o.wz, w); else if (s.kind === 'groan') o.gr = Math.max(o.gr, w * (s.soft ? .6 : 1)); } return o; };
  // world points the eyes and the head can want
  const emberHead = (t, o) => { const E = Stage.get('ember'); if (E && E.head) { E.head(o); if (o.lengthSq() > 0) return o; } if (E && E.at) { E.at(t, o); return o.add(_f.set(0, .25, 0)); }
    if (t < C.RAIN) { const k = sm(C.CAVE, C.SMOKE_FACE - .7, t); return o.copy(M.CAVE).lerp(_f.copy(SEAT).addScaledVector(M.CAVE_DIR, 1.6), k).add(_g.set(0, .35, 0)); }
    if (t < C.TRAIN) return t < C.WING + .8 ? o.copy(M.CAVE).addScaledVector(M.CAVE_DIR, -1.0).add(_f.set(0, .3, 0)) : o.copy(ST.under).add(_f.set(0, .25, 0));
    if (t < C.RETURN) return o.copy(M.LEDGE).add(_f.set(1.5, .35, 1.6));
    if (t < C.DAWN) return o.copy(M.EMBER_CLIMAX).add(_f.set(0, .35, 0));
    if (t < C.FLY) return o.copy(M.ASH_THROWN).add(_f.set(1.3, .35, 1.0));
    return M.heart2('ember', t, o); };
  function target(name, t, o) {
    switch (name) {
      case 'ember': return emberHead(t, o);
      case 'tip': return o.copy(ST.tip);
      case 'fwd': return o.set(5, 2.1, -.3).applyMatrix4(Gm);
      case 'away': return o.set(1.5, 3.4, 3.6).applyMatrix4(Gm);
      case 'up': return o.set(2.0, 4.6, .8).applyMatrix4(Gm);
      case 'floorL': return o.set(.95, .1, -1.2).applyMatrix4(seatM);
      case 'sigh': return o.set(2.4, .6, -.2).applyMatrix4(Gm);
      case 'rain': return o.copy(M.CAVE).addScaledVector(M.CAVE_DIR, 5).add(_f.set(0, 2.2, 0));
      case 'under': return o.copy(ST.under).add(_f.set(0, .35, 0));
      case 'stub': return o.set(1.75, .1, -.75).applyMatrix4(Gm);
      case 'cinder': { const c = Stage.get('cinder'); if (c && c.head) { c.head(o); if (o.lengthSq() > 0) return o; } return M.cinder(t, o).add(_f.set(0, 2, 0)); }
      case 'fireup': return o.set(5, 3.2, 0).applyMatrix4(Gm);
      case 'sky': return o.set(6, 1.2, 0).applyMatrix4(Gm);
      case 'laugh': return o.set(3, 4.5, 0).applyMatrix4(Gm);
      default: return o.set(5, 2.1, 0).applyMatrix4(Gm); } }

  // limb targets: name -> group-space point (some carried by bones)
  function handTarget(name, s, t, o) {
    const hb = B.head;
    switch (name) {
      case 'hold': return o.copy(ST.cigGrip);
      case 'low': return o.set(.66, 1.78 + .03 * Math.sin(t * 1.3), s * .66);
      case 'floor': return toG(_f.set(.68, .2, -1.08).applyMatrix4(seatM), o);
      case 'pack': return toG(_f.set(.9, .24, -1.12).applyMatrix4(seatM), o);
      case 'front': return fromBone(hb, [1.42, 2.43, -.27], o);
      case 'strike': return fromBone(hb, [1.36, 2.36, -.36], o);
      case 'rest': return o.set(.78, 1.16, s * .42);
      case 'cigout': return fromBone(hb, [1.25, 2.3, -.42], o);
      case 'stubrest': return o.set(1.62, .32, -.86);
      case 'stub': return o.set(1.7, .2 + .05 * Math.max(0, Math.sin((t - C.STUB) * 18)) * (1 - sm(C.STUB, C.STUB + .5, t)), -.8);
      case 'horn': return fromBone(hb, [.6, 3.0, -.33], o);
      case 'belly': return o.set(.86, 1.14 + .04 * Math.sin(t * 34), s * .36);
      case 'flintpick': return toG(_f.set(.98, .2, .82).applyMatrix4(seatM), o);
      case 'strikeR': { const ph = Math.max(bell(t, STRIKE1, .09), bell(t, STRIKE2, .09)); return fromBone(hb, [1.34 + .02 * ph, 2.42 - .12 * ph, -.2 - .14 * ph], o); }
      case 'knee': return o.set(.72, .98, s * .58);
    } return o.set(.78, 1.16, s * .42); }
  const LIMB = { // per mode: legs (ankle) and arms (wrist) targets [space, point], poles, ik weight, flat feet
    sit: { leg: ['g', [.26, .15, .63]], lp: ['g', [1.4, .9, 1.1]], arm: ['g', [.78, 1.16, .42]], ap: ['g', [-.3, 1.2, 1.3]], ik: 1, flat: 1 },
    lie: { leg: ['g', [.36, .13, .84]], lp: ['g', [.4, 1.6, 1.6]], arm: ['g', [1.38, .2, .52]], ap: ['g', [.3, 1.5, 1.5]], ik: 1, flat: 1 },
    stand: { leg: ['g', [-.08, .14, .6]], lp: ['g', [1.3, .9, .8]], arm: ['g', [1.05, 1.3, .56]], ap: ['g', [-.3, 1.0, 1.2]], ik: 1, flat: 1 },
    rear: { leg: ['g', [.04, .14, .66]], lp: ['g', [1.3, 1.1, .9]], arm: ['g', [.72, 2.42, 1.0]], ap: ['g', [-.4, 1.2, 1.6]], ik: 1, flat: 1 },
    crump: { leg: ['g', [.26, .15, .63]], lp: ['g', [1.4, .9, 1.1]], arm: ['g', [.78, 1.16, .42]], ap: ['g', [-.3, 1.2, 1.3]], ik: 0, flat: 0 },
    fly: { leg: ['r', [-.02, -.62, .4]], lp: ['r', [.7, -.3, .7]], arm: ['c', [.6, 1.3, .36]], ap: ['c', [-.25, 1.1, 1.2]], ik: 1, flat: 0 } };
  const limbPt = (spec, s, o) => { const p = spec[1]; if (spec[0] === 'g') return o.set(p[0], p[1], s * p[2]); return fromBone(spec[0] === 'r' ? B.root : B.chest, [p[0], p[1], s * p[2]], o); };
  // wing poses in the chest frame (right side; z flips for the left)
  const WP = { fold: [WARM, WFORE, ...WFING], open: [[-.3, .35, .9], [.1, .3, .95], [.15, .42, .9], [-.42, 0, .92], [-.85, -.3, .45]], lift: [[-.85, .45, .4], [-.3, .62, .75], [-.25, .78, .6], [-.1, .32, .95], [.15, -.25, .95]],
    blanket: [[-.45, .3, .85], [.35, .05, .94], [.62, .55, .55], [.82, -.05, .58], [.62, -.62, .45]], drape: [[-.75, .25, .45], [-.35, -.7, .5], [-.85, -.4, .3], [-.5, -.8, .3], [-.12, -.96, .25]] };
  const flapPhi = t => { // + = dorsal (up). downstrokes land on flap_ash
    if (t < C.FLY - .6) return 0; let phi = .12; const L = Score.recent('flap_ash', t + .4, 2.4); for (const e of L) { const u = t - e.t; phi += u < -.4 ? 0 : u < 0 ? .8 * sm(-.4, -.05, u) : u < .42 ? lerp(.8, -.75, sm(0, .42, u)) : u < 1.4 ? lerp(-.75, 0, sm(.42, 1.4, u)) : 0; }
    if (t > C.HEART2 - .3) { const b = Score.beat(t), f = b.f; phi += (f < .35 ? lerp(.45, -.45, sm(0, .35, f)) : lerp(-.45, .45, sm(.35, 1, f))) * sm(C.HEART2 - .3, C.HEART2 + .2, t); }
    return phi; };

  const VW = [], VWd = []; for (let i = 0; i < 7; i++) { VW.push(V3()); VWd.push(V3().subVectors(V3(...TP[i + 1]), V3(...TP[i])).normalize()); }
  const TLEN = TP.slice(1).map((p, i) => Math.hypot(p[0] - TP[i][0], p[1] - TP[i][1], p[2] - TP[i][2]));

  function pose(t, dt) {
    place(t, PL); modes(t, MW); const so = sndAt(t), cs = cigState(t), dr = draw(t);
    // planned world transform (flight: position from last frame's solve, refined below)
    if (PL.fly) PL.pos.copy(ST.pos.lengthSq() > 0 && Math.abs(t - ST.lastT) < .2 ? ST.pos : PL.pos);
    Gm.compose(PL.pos, GQ.setFromAxisAngle(YA, PL.yaw), _one); Gi.copy(Gm).invert();
    // reset to rest
    for (const n of RIG.names) { const b = B[n]; b.quaternion.identity(); b.position.copy(b.userData.rest); b.scale.set(1, 1, 1); }
    root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
    // ---- trunk
    const rp = _a.set(0, 0, 0); let pitch = 0, sp = 0, ch = 0, n1 = 0, n2 = 0;
    for (const k of MODE) { const w = MW[k]; if (!w) continue; const m = MP[k]; rp.x += m.rp[0] * w; rp.y += m.rp[1] * w; rp.z += m.rp[2] * w; pitch += m.pitch * w; sp += m.sp * w; ch += m.ch * w; n1 += m.n1 * w; n2 += m.n2 * w; }
    const asleep = MW.crump, br = Math.sin(TAU * t / (asleep > .5 ? 4.6 : 3.4)), brA = lerp(1, .35, asleep);
    const lean = t < C.RAIN ? bump(t, P2 - .85, P2 - .3, C.SMOKE_FACE + 1.1, C.SMOKE_FACE + 1.7) : 0, sighK = t < C.RAIN ? bump(t, P4 - .3, P4 + .1, P4 + .55, P4 + 1.1) : 0, freeze = t > C.SNEEZE_LIGHT && t < C.ACCEPT + .05 ? 1 : 0;
    const lau = so.laugh * (so.tiny ? .45 : 1), shake = lau * Math.sin(so.lu * TAU * 5.6), cJerk = so.cough * Math.max(0, Math.sin(so.cu * TAU * 3.4)) * (so.cu < 1.0 ? 1 : 0);
    const flinch = t > C.TRAIN && t < C.GLIDE ? Score.env('fall', t, .12) : 0, demo = bump(t, TRAIN_COUGH - .9, TRAIN_COUGH - .1, TRAIN_COUGH, TRAIN_COUGH + .3);
    rp.y += .012 * br * brA * (1 - freeze) + .025 * shake + .06 * demo; sp += -.1 * lean - .05 * sighK + .02 * shake - .06 * cJerk; ch += -.18 * lean + .012 * br * brA * (1 - freeze) - .1 * sighK - .1 * cJerk + .03 * shake + .12 * so.roar + .06 * demo - .04 * flinch;
    n1 += -.32 * lean + .06 * sighK - .1 * cJerk - .1 * so.roar; n2 += -.12 * lean - .05 * cJerk;
    let roll = PL.roll + MW.crump * 1.3, tumble = 0;
    if (t >= C.ASH_DOWN && t < IMP) { tumble = -(TAU - 1.3) * (1 - Math.pow(1 - PL.tumble, 1.6)); roll = tumble; }
    if (PL.fly) pitch += clamp((PL.climb || 0) * .45, -.35, .5) + .05 * flapPhi(t);
    B.root.position.copy(B.root.userData.rest).add(rp); B.root.quaternion.setFromEuler(new THREE.Euler(roll, 0, pitch, 'XYZ'));
    B.spine.rotation.z = sp; B.chest.rotation.set(.02 * shake, 0, ch); B.neck1.rotation.z = n1; B.neck2.rotation.z = n2;
    root.updateMatrixWorld(true);
    // ---- tail: ground-following chain, straight behind when standing, streaming in flight
    const ground = MW.sit + MW.lie + MW.crump, straight = MW.stand + MW.rear;
    for (let i = 0; i < 7; i++) { const b = B['t' + i], j0 = wpos(b, _b), tw = .05 * Math.sin(t * 1.3 + i * .6) * (i > 3 ? 1 : .3) + (i > 4 ? .12 * Math.sin(t * 7) * Math.exp(-Math.pow(mod(t, 5.3) - 2, 2) * 8) : 0);
      _c.copy(VWd[i]); _c.y = 0; _c.normalize().applyAxisAngle(YA, tw * (1 - MW.fly)); const yT = TP[i + 1][1] - (TRR[i + 1] - .02) * 0;
      let dy = clamp((yT - j0.y) / TLEN[i], -.95, .6); _c.multiplyScalar(Math.sqrt(1 - dy * dy)); _c.y = dy; const dG = _d.copy(_c);
      _e.set(-1, 0, .25 * Math.sin(t * 1.6 - i * .5) * (i / 6)).normalize(); dy = clamp(((i === 0 ? .5 : .55 + .04 * i) - j0.y) / TLEN[i], -.7, .4); _e.multiplyScalar(Math.sqrt(1 - dy * dy)); _e.y = dy;
      const fd = V3(-.15, -.99, 0).applyQuaternion(wq(B.root, _q3)).add(_v.set(-1, -.16 - .03 * i, .3 * Math.sin(t * 2.1 - i * .7) * (i / 6))).normalize();
      _w.set(0, 0, 0).addScaledVector(dG, ground + 1e-4).addScaledVector(_e, straight).addScaledVector(fd, MW.fly).normalize();
      aimBone(b, _v.subVectors(V3(...TP[i + 1]), V3(...TP[i])), _w.clone(), 1); }
    // ---- head: look target, then face
    const lk = look(t), sigh = sighK;
    target(lk.a, t, _a); target(lk.b, t, _b); toG(_a, _a); toG(_b, _b); const tg = _c.copy(_a).lerp(_b, lk.k); const free = (lk.b === 'free' ? lk.k : 0) + (lk.a === 'free' ? 1 - lk.k : 0);
    let lookW = (1 - free) * (1 - MW.crump * .85) * (1 - freeze * .7);
    if (MW.crump > .3 && t < C.WAKE + 1.5) tg.set(1.9, -.4, .9);
    const hpos = wpos(B.head, _d), hf = _e.copy(HF).applyQuaternion(wq(B.head, _q3)), des = _f.subVectors(tg, hpos).normalize();
    // keep it inside a cone round the chest's forward direction
    const cf = _g.set(1, 0, 0).applyQuaternion(wq(B.chest, _q3)); cf.y = Math.max(cf.y, -.3); cf.normalize(); const ang = Math.acos(clamp(des.dot(cf), -1, 1)); if (ang > 1.35) { _q.setFromUnitVectors(cf, des); _q.slerpQuaternions(QI, _q, 1.35 / ang); des.copy(cf).applyQuaternion(_q); }
    if (lookW > 0) { aimV(B.neck1, hf.clone(), des, .18 * lookW); _e.copy(HF).applyQuaternion(wq(B.head, _q3)); aimV(B.neck2, _e.clone(), des, .3 * lookW); _e.copy(HF).applyQuaternion(wq(B.head, _q3)); aimV(B.head, _e.clone(), des, lookW); }
    // gestures on top of the look: hrmph toss, grunt away, roar thrust, laugh head-back, cough, sigh droop, nods with the beat
    const hr = so.hr + so.grunt, nod = .02 * Math.sin(t * TAU / BT(Score.sec(t)) * .5) * (1 - asleep);
    B.head.rotation.x += .12 * so.grunt; B.head.rotateZ(.1 * hr + .25 * lau * (so.tiny ? .3 : 1) + .08 * shake - .12 * cJerk - .18 * sigh + .2 * so.roar + nod - .1 * so.gr + .1 * so.wz);
    B.head.updateMatrixWorld(true);
    // jaw
    const sg = Score.sing(t, 'ash'), hum = sg.n && Score.lines.find(L => L.notes.includes(sg.n) && L.feel.hum), singA = sg.a * (hum ? 0 : 1);
    let jaw = .02 + .1 * so.hr + .14 * so.grunt + .42 * so.wz + .95 * so.roar + .2 * so.gr + lau * (.18 + .24 * Math.max(0, Math.sin(so.lu * TAU * 5.6))) + .55 * cJerk + singA * (.14 + .3 * Math.abs(Math.sin((t - (sg.n ? sg.n.t0 : 0)) * 9)) * .4 + .25);
    jaw = Math.max(jaw, .55 * fire(t) * (t < C.FLY ? 1 : .45));
    if (t < C.RAIN) { const ex = Score.env('puff', t, .35, e => !e.who || e.who === 'ash'); jaw += .16 * clamp(ex); }
    B.jaw.rotation.z = -clamp(jaw) * .58;
    // eyes: gaze, lids (blinks), brows
    const et = eyeT(t), eyeW = (et.a ? 1 - et.k : 0) + (et.b ? et.k : 0); let ew = _a.copy(des);
    for (const [n, s] of S2) { const ef = EF[n], eb = B['eye' + n], ep = wpos(eb, _b); let gd;
      if (eyeW > .01) { const ta = et.a ? target(et.a, t, _u) : null, tb = et.b ? target(et.b, t, _w) : null; const p = ta && tb ? toG(ta, ta).lerp(toG(tb, tb), et.k) : toG(ta || tb, (ta || tb)); gd = V3().subVectors(p, ep).normalize().lerp(V3().subVectors(tg, ep).normalize(), 1 - eyeW).normalize(); }
      else gd = V3().subVectors(tg, ep).normalize();
      wq(B.head, _q3); const loc = gd.applyQuaternion(_q3.invert()), ang2 = Math.acos(clamp(loc.dot(ef.L), -1, 1)); if (ang2 > .9) { _q.setFromUnitVectors(ef.L, loc); _q.slerpQuaternions(QI, _q, .9 / ang2); loc.copy(ef.L).applyQuaternion(_q); }
      eb.quaternion.setFromUnitVectors(ef.L, loc); }
    const bl = (t > C.SNEEZE_LIGHT + .1 && t < C.ACCEPT) || (t > C.ASH_DOWN && t < C.WAKE + .3) ? 0 : blink(t, 1.7);
    const baseLid = kLid(t) * (1 - .5 * lau * (so.tiny ? .6 : 1)) * (1 - .85 * cJerk) * (1 - .6 * flinch) * (1 - .7 * so.roar * 0) , hrL = 1 - .4 * so.hr;
    const sideEye = t > C.IMITATE - .1 && t < P3 + .2 ? bump(t, C.IMITATE - .1, C.IMITATE + .1, P3, P3 + .2) : 0;
    for (const [n, s] of S2) { const ef = EF[n]; let o = clamp(baseLid * hrL * (1 - bl)) * (n === 'L' ? 1 - .25 * sideEye : 1 - .1 * sideEye); if (asleep > .5 && t < C.WAKE) o = 0; B['lid' + n].quaternion.setFromAxisAngle(ef.A, (1 - o) * LIDMAX);
      const raise = kBrow(t) + (n === 'L' ? .75 * sideEye : -.2 * sideEye) + .5 * so.wz, tilt = kTilt(t) + .3 * so.grunt; const bw = B['brow' + n]; bw.position.copy(bw.userData.rest).addScaledVector(ef.U, .022 * raise); bw.quaternion.setFromAxisAngle(ef.L, -s * .32 * tilt); }
    // ---- wings
    const wingBlanket = t >= C.RAIN && t < C.TRAIN ? sm(C.WING + 1.0, C.WING + 2.0, t) : 0, wingLift = t >= C.RAIN && t < C.TRAIN ? bump(t, C.WING - .05, C.WING + .5, C.WING + 1.0, C.WING + 1.8) : 0;
    const prep = t < C.FLY ? sm(C.ASH_FIRE + .9, C.FLY - .2, t) * .45 : 0, alarm = t > C.RETURN && t < C.ASH_DOWN ? .2 * sm(C.RETURN, C.RETURN + .4, t) : 0, phi = flapPhi(t);
    wq(B.chest, GQ);
    for (const [n, s] of S2) { const wb = 'w' + n; let wf = MW.sit + MW.lie + MW.stand + MW.crump * (n === 'R' ? 1 : 0), wo = MW.rear + MW.fly + prep + alarm, wl = 0, wbk = 0, wdr = n === 'L' ? MW.crump : 0;
      if (n === 'R') { wl = wingLift * (1 - wingBlanket); wbk = wingBlanket; wf *= 1 - Math.max(wl, wbk); }
      const ph = MW.fly ? phi : MW.rear ? .3 + .06 * Math.sin(t * 23) * so.roar : n === 'L' && MW.crump > .5 ? -.55 : .1, q = new THREE.Quaternion().setFromAxisAngle(YA, -s * ph);
      const flinchW = flinch * .4 * Math.sin(t * 40);
      for (let k = 0; k < 5; k++) { const dir = V3(); const add = (arr, w) => { if (w > 0) { const a = arr[k]; _v.set(a[0], a[1], s * a[2]).normalize(); if (arr === WP.open) _v.applyQuaternion(q); dir.addScaledVector(_v, w); } };
        add(WP.fold, wf + 1e-4); add(WP.open, wo); add(WP.lift, wl); add(WP.blanket, wbk); add(WP.drape, wdr); dir.normalize().applyQuaternion(GQ); if (flinchW) dir.y += flinchW * .2;
        const bnm = k < 2 ? wb + k : wb + (k + 1), bo = B[bnm], lv = k === 0 ? _u.copy(B[wb + '1'].userData.rest) : k === 1 ? _u.copy(B[wb + '2'].userData.rest) : _u.copy(WRS[n].tips[k - 2]);
        if (k === 1) { aimBone(B[wb + '1'], lv, dir.normalize(), 1); } else if (k === 0) aimBone(B[wb + '0'], lv, dir.normalize(), 1); else aimBone(B[wb + (k + 1)], lv, dir.normalize(), 1); } }
    // ---- legs
    const gait = t > C.RETURN && t < C.ASH_STANDS + .2 ? PL.walk || 0 : 0;
    for (const [n, s] of S2) { _a.set(0, 0, 0); _b.set(0, 0, 0); let ikw = 0, flat = 0, wsum = 0; for (const k of MODE) { const w = MW[k]; if (!w) continue; const L = LIMB[k]; _a.addScaledVector(limbPt(L.leg, s, _c), w); _b.addScaledVector(limbPt(L.lp, s, _c), w); ikw += L.ik * w; flat += L.flat * w; wsum += w; }
      _a.divideScalar(wsum); _b.divideScalar(wsum);
      if (gait > 0 && MW.stand > .3) { const Lg = 1.2, beta = .62, u = mod(gait / Lg + (s > 0 ? .5 : 0), 1); if (u < beta) _a.x += beta * Lg / 2 - u * Lg; else { const v = (u - beta) / (1 - beta); _a.x += -beta * Lg / 2 + v * beta * Lg; _a.y += .22 * Math.sin(PI * v); } }
      if (MW.sit && t > C.STUB - 9 && t < C.TRAIN) {}
      const stepA = t > C.WING && t < C.HUM + 4 ? Score.env('step_ash', t, .15) : 0; if (stepA && ((Score.last('step_ash', t) || {}).i % 2 === (s > 0 ? 0 : 1))) _a.y += .08 * stepA;
      ik(B['th' + n], B['kn' + n], B['an' + n], _a, _b, ikw);
      if (flat > 0) { wq(B['kn' + n], _q2); _q.copy(_q2).invert(); const an = B['an' + n]; an.quaternion.slerpQuaternions(QI, _q, flat); an.updateMatrixWorld(true); } }
    // ---- cigarette anchors (need the head posed)
    const hm = B.head.matrixWorld; const mouthP = fromBone(B.head, [.8, 2.548, -.168], V3()), cdir = V3(.86, -.42, -.28).normalize().transformDirection(hm);
    ST.mouthCig = mouthP.addScaledVector(cdir, -.035); ST.mouthDir = cdir; ST.cigGrip = ST.mouthCig.clone().addScaledVector(cdir, .3).add(V3(0, -.06, 0)).sub(_v.copy(ST.gripL).applyQuaternion(wq(B.hdL, _q3)).multiplyScalar(0));
    // ---- arms
    for (const [n, s] of S2) { _a.set(0, 0, 0); _b.set(0, 0, 0); let ikw = 0, wsum = 0; for (const k of MODE) { const w = MW[k]; if (!w) continue; const L = LIMB[k]; _a.addScaledVector(limbPt(L.arm, s, _c), w); _b.addScaledVector(limbPt(L.ap, s, _c), w); ikw += L.ik * w; wsum += w; }
      _a.divideScalar(wsum); _b.divideScalar(wsum);
      if (MW.stand > .3 && gait > 0) _a.y += .06 * Math.sin(gait * 4 + s);
      if (MW.rear > .3) { _a.x += .05 * Math.sin(t * 19 + s) * so.roar; _a.y += .06 * so.roar; }
      const gl = (n === 'L' ? handL : handR)(t); if (gl.a || gl.b) { const ga = gl.a ? handTarget(gl.a, s, t, V3()) : _a.clone(), gb = gl.b ? handTarget(gl.b, s, t, V3()) : _a.clone(); const gp = ga.lerp(gb, gl.k);
        if (n === 'L' && (gl.b === 'hold' || gl.a === 'hold')) { /* the grip, not the wrist, goes to the cigarette */ wq(B.hdL, _q3); gp.sub(_v.copy(ST.gripL).applyQuaternion(_q3).multiplyScalar(gl.b === 'hold' ? gl.k : 1 - gl.k)); }
        _a.copy(gp); ikw = Math.max(ikw, 1); const hw = (gl.b === 'hold' ? gl.k : 0) + (gl.a === 'hold' ? 1 - gl.k : 0); if (n === 'L' && hw > 0) _b.lerp(_v.set(1.35, .85, s * .42), hw); }
      ik(B['sh' + n], B['el' + n], B['hd' + n], _a, _b, ikw);
      const g = n === 'L' ? handL(t) : handR(t), curl = (g.b === 'hold' || g.b === 'strike' ? .35 : g.b === 'strikeR' || g.b === 'knee' || g.b === 'flintpick' ? .9 : g.b === 'belly' ? .1 : MW.rear > .5 ? -.35 : .25) + .1 * Math.sin(t * .9 + s);
      B['fg' + n].rotation.z = -curl; B['hd' + n].rotation.x = n === 'L' && g.b === 'hold' ? -.3 : 0; B['hd' + n].updateMatrixWorld(true); }
    // ---- props
    placeProps(t, cs);
    return { so, cs, dr, sg, singA, hum, lau, shake, cJerk, sighK, demo };
  }

  function placeProps(t, cs) {
    const ca = cigAt(t), cig = B.cig, an = (name, o, q) => { switch (name) {
      case 'mouth': o.copy(ST.mouthCig); q.setFromUnitVectors(XA, ST.mouthDir); return 1;
      case 'hand': { const hm = B.fgL.matrixWorld; o.setFromMatrixPosition(hm).add(_v.set(.1, -.03, .06).transformDirection(B.hdL.matrixWorld).multiplyScalar(.1)); const d = _w.set(.35, .85, -.25).normalize(); if (t > C.RAIN) d.set(.6, .2, -.6).normalize(); q.setFromUnitVectors(XA, d); o.addScaledVector(d, -.17); return 1; }
      case 'floor': { o.set(1.78, .03, -.8); q.setFromAxisAngle(YA, .6); return 1; }
      case 'horn': { fromBone(B.head, [.45, 3.08, -.21], o); q.setFromUnitVectors(XA, _w.set(.3, .05, -1).normalize()).premultiply(wq(B.head, _q3)); return 1; }
      case 'fall': { const u = t - (C.JOKE + .65); o.copy(ST.mouthCig); o.y -= 4.9 * u * u; q.setFromAxisAngle(ZA, u * 7).premultiply(_q3.setFromUnitVectors(XA, ST.mouthDir)); return u < 1.6 ? 1 : 0; }
      default: o.set(0, 0, 0); q.identity(); return 0; } };
    const pa = V3(), qa = new THREE.Quaternion(), pb = V3(), qb = new THREE.Quaternion(), sa = an(ca.a, pa, qa), sb = an(ca.b, pb, qb), k = ca.k;
    cig.position.copy(pa).lerp(pb, k); cig.quaternion.slerpQuaternions(qa, qb, k); const sc = k < .5 ? sa : sb; cig.scale.setScalar(sc ? 1.45 : 1e-4);
    // the dropped butt, the floor props (world-fixed in the cave), the flint
    B.butt.scale.setScalar(t > DROP && t < C.TRAIN ? 1 : 1e-4); _m.copy(Gi).multiply(seatM); _m.decompose(B.floor.position, B.floor.quaternion, _v); B.floor.scale.setScalar(t < C.TRAIN ? 1 : 1e-4);
    _m2.makeTranslation(.62, 0, -1.04); _m2.premultiply(_m); _m2.decompose(B.butt.position, B.butt.quaternion, _v);
    const held = t > FPICK + .15 && t < C.TRAIN; if (held) { B.flint.position.copy(wpos(B.fgR, _v)).add(_w.set(.06, -.03, 0).transformDirection(B.hdR.matrixWorld).multiplyScalar(.06)); wq(B.hdR, B.flint.quaternion); }
    else { _m2.makeTranslation(.98, .045, .82); _m2.premultiply(_m); _m2.decompose(B.flint.position, B.flint.quaternion, _v); }
    B.flint.scale.setScalar(t < C.TRAIN ? 1 : 1e-4);
    for (const n of ['cig', 'butt', 'floor', 'flint']) B[n].updateMatrixWorld(true);
    UP.uBurn.value = cs.burn; UP.uAsh.value = cs.ash; UP.uLit.value = cs.lit; UP.uChar.value = cs.char; UP.uCrush.value = cs.crush;
  }

  // ---- membrane from the wing bones (group space)
  const wb3 = [V3(), V3(), V3(), V3(), V3(), V3(), V3()];
  function membrane(t) {
    const P = memGeo.attributes.position.array, sag = .16; let o = 0;
    for (const [n, s] of S2) { const wn = 'w' + n, w0 = wpos(B[wn + '0'], wb3[0]), w1 = wpos(B[wn + '1'], wb3[1]), w2 = wpos(B[wn + '2'], wb3[2]);
      const tips = [0, 1, 2].map(k => _v.copy(WRS[n].tips[k]).applyMatrix4(_m.copy(B[wn + (3 + k)].matrixWorld).setPosition(0, 0, 0)).add(w2).clone());
      const fl = fromBone(B.spine, [-.42, 1.32, s * .4], wb3[3]);
      const ribs = [[null, fl], [w2, tips[2]], [w2, tips[1]], [w2, tips[0]]];   // panel p spans ribs p -> p+1
      for (let p = 0; p < PAN; p++) { const ra = ribs[p], rb = ribs[p + 1];
        for (let i = 0; i <= NU; i++) { const u = i / NU;
          let A; if (p === 0) { const lu = u * 2; A = lu < 1 ? _a.lerpVectors(w0, w1, lu) : _a.lerpVectors(w1, w2, lu - 1); A = A.clone(); _b.lerpVectors(w0, fl, 1).lerp(tips[2], u); } else { A = _a.lerpVectors(w2, ra[1], u).clone(); }
          const Bp = p === 0 ? _b.clone() : _b.lerpVectors(w2, rb[1], u).clone(), mid = _c.lerpVectors(A, Bp, .5), toHub = _d.subVectors(p === 0 ? _e.lerpVectors(w0, w2, .5) : w2, mid).normalize();
          for (let j = 0; j <= NV; j++) { const v = j / NV; _e.lerpVectors(A, Bp, v); const sg2 = Math.sin(PI * v) * (p === 0 ? Math.sin(PI * u) * .6 + .4 * u : u * u) * sag * A.distanceTo(Bp); _e.addScaledVector(toHub, sg2 * (p === 0 ? .6 : 1)); P[o++] = _e.x; P[o++] = _e.y; P[o++] = _e.z; } } } }
    memGeo.attributes.position.needsUpdate = true; memGeo.computeVertexNormals();
  }

  // ================================================================ smoke (stateful, re-simulated after a seek) and flint sparks
  const NP = 60, NS = 24, PT = { born: new Float32Array(NP).fill(-99), life: new Float32Array(NP), p: new Float32Array(NP * 3), v: new Float32Array(NP * 3), s0: new Float32Array(NP), s1: new Float32Array(NP), seed: new Float32Array(NP), up: new Float32Array(NP), g: new Float32Array(NP) }; let pi = 0;
  const emits = []; let lastEmit = 0;
  const spawn = (t, p, v, life, s0, s1, up, gr, shade) => { const i = pi; pi = (pi + 1) % NP; PT.born[i] = t; PT.life[i] = life; PT.p.set([p.x, p.y, p.z], i * 3); PT.v.set([v.x, v.y, v.z], i * 3); PT.s0[i] = s0; PT.s1[i] = s1; PT.up[i] = up; PT.g[i] = gr || 0; PT.seed[i] = h1(i * 13.7 + t * 3.1); const c = shade === undefined ? .92 + .08 * PT.seed[i] : shade; smokeM.instanceColor.setXYZ(i, c, c * .995, c * .985); smokeM.instanceColor.needsUpdate = true; };
  const nostrils = (o, s) => o.copy(s > 0 ? ST.nosR : s < 0 ? ST.nosL : _w.lerpVectors(ST.nosL, ST.nosR, .5));
  function smoke(t, reset, frame) {
    if (reset) { PT.born.fill(-99); emits.length = 0; lastEmit = t; ST.lastT = t - 1 / 60; }
    if (api.smoke === false) { ST.spkG = 0; emits.length = 0; return; }   // the FX lane draws the wisp, puffs, rings, the stream and the flint sparks
    const t0 = ST.lastT, R = h1;
    // the thread from the lit tip
    if (frame.cs.lit > .05 && api.smoke) { const per = .085; for (let k = Math.floor(t0 / per) + 1; k * per <= t; k++) { _a.copy(ST.tip); spawn(k * per, _a, _b.set((R(k) - .5) * .04, .42 + .12 * R(k + .3), (R(k + .7) - .5) * .04), 2.2 + .8 * R(k * 1.3), .008, .026 + .022 * R(k * 2.1) + .02 * frame.dr, .14, 0, .93); } }
    // exhaled puffs on 'puff', nostril snorts, coughs, wheeze, the sigh ring
    const evs = Score.recent('puff', t, Math.max(.001, t - t0)).filter(e => e.t > t0 && (!e.who || e.who === 'ash'));
    for (const e of evs) { if (e.t > C.TRAIN) continue; const sf = Math.abs(e.t - C.SMOKE_FACE) < .05, ring = e.ring || sf === false && Math.abs(e.t - P4) < .05; emits.push({ t0: e.t, dur: sf ? .95 : ring ? .01 : .55, n: sf ? 26 : ring ? 14 : 11, kind: sf ? 'stream' : ring ? 'ring' : 'puff', done: 0 }); }
    for (const s of ACTS) if (s.t > t0 && s.t <= t) { if (s.kind === 'hrmph' || s.kind === 'grunt') emits.push({ t0: s.t, dur: .25, n: 6, kind: 'snort', done: 0 }); else if (s.kind === 'wheeze') emits.push({ t0: s.t + .15, dur: .7, n: 4, kind: 'wheeze', done: 0 }); else if (s.kind === 'cough') emits.push({ t0: s.t, dur: .5, n: 7, kind: 'cough', done: 0 }); }
    for (const x of [C.RAIN + 1.7, C.HUM - .15, C.RAIN - .35]) if (x > t0 && x <= t) emits.push({ t0: x, dur: .4, n: 6, kind: 'snort', done: 0 });
    if (ST.poke > t0 && ST.poke <= t) emits.push({ t0: ST.poke, dur: .01, n: 14, kind: 'ring', done: 0 });
    for (let q = emits.length - 1; q >= 0; q--) { const em = emits[q]; const want = Math.min(em.n, Math.floor(em.n * clamp((t - em.t0) / em.dur) + (t >= em.t0 ? 1 : 0)));
      for (; em.done < want; em.done++) { const i = em.done, u = i / em.n, d = ST.dir, m = ST.mouth;
        if (!api.smoke) continue;
        if (em.kind === 'stream') { const e = emberHead(t, _c); _d.subVectors(e, m).normalize(); spawn(t, m, _b.copy(_d).multiplyScalar(1.9 + .4 * R(i)).add(_e.set((R(i + 1) - .5) * .3, (R(i + 2) - .5) * .2, (R(i + 3) - .5) * .3)), 1.8 + .6 * R(i + 4), .05, .16 + .08 * R(i + 5), .1, 0); }
        else if (em.kind === 'puff') spawn(t, m, _b.copy(d).multiplyScalar(.8 + .3 * R(i)).add(_e.set((R(i + 1) - .5) * .4, .1 + .2 * R(i + 2), (R(i + 3) - .5) * .4)), 2.2 + .6 * R(i), .05, .17 + .08 * R(i + 4), .14, 0);
        else if (em.kind === 'ring') { const a = u * TAU, side = _c.crossVectors(d, YA).normalize(), up = _e.crossVectors(side, d).normalize(), r = .07; nostrils(_f, 0); _f.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r); spawn(t, _f, _b.copy(d).multiplyScalar(.55).addScaledVector(side, Math.cos(a) * .2).addScaledVector(up, Math.sin(a) * .2 + .05), 2.6, .045, .07, .06, 0); }
        else if (em.kind === 'snort') { const s = i % 2 ? 1 : -1; nostrils(_f, s); spawn(t, _f, _b.copy(d).multiplyScalar(.5).add(_e.set(0, -.25, 0)).addScaledVector(_c.crossVectors(d, YA).normalize(), s * .15), 1.4 + .4 * R(i), .03, .09 + .03 * R(i + 1), .1, 0); }
        else if (em.kind === 'wheeze') spawn(t, m, _b.copy(d).multiplyScalar(.25).add(_e.set(0, .05, 0)), 1.0, .015, .04, .05, 0, .8);
        else if (em.kind === 'cough') spawn(t, m, _b.copy(d).multiplyScalar(.9 + .4 * R(i)).add(_e.set((R(i + 1) - .5) * .5, .1, (R(i + 3) - .5) * .5)), 1.2 + .4 * R(i), .04, .12, .1, 0, .7); }
      if (em.done >= em.n || t - em.t0 > em.dur + 1) emits.splice(q, 1); }
    // the ash falls off on the flick
    if (FLICK > t0 && FLICK <= t && api.smoke) spawn(FLICK, ST.tip, _b.set(0, -.2, 0), 1.0, .028, .03, 0, 1, .55);
    // integrate
    for (let i = 0; i < NP; i++) { const a = t - PT.born[i], L = PT.life[i]; if (a < 0 || a > L) { _m.makeScale(0, 0, 0); smokeM.setMatrixAt(i, _m); continue; }
      const sd = PT.seed[i], k = 1.6, f = (1 - Math.exp(-k * a)) / k, gr = PT.g[i];
      _a.set(PT.p[i * 3] + PT.v[i * 3] * f, PT.p[i * 3 + 1] + PT.v[i * 3 + 1] * f + PT.up[i] * a * a * (gr ? 0 : 1) - 4.9 * a * a * gr, PT.p[i * 3 + 2] + PT.v[i * 3 + 2] * f);
      if (gr && _a.y < PL.gy + .03) _a.y = PL.gy + .03;
      const cu = a * (gr ? 0 : 1), sw_ = PT.s1[i] < .06 ? .11 : .06; _a.x += sw_ * cu * Math.sin(a * 2.3 + PT.born[i] * 1.7); _a.z += sw_ * cu * Math.cos(a * 1.9 + PT.born[i] * 1.3); _a.y += .02 * Math.sin(a * 3 + sd * 9) * cu;
      const s = lerp(PT.s0[i], PT.s1[i], 1 - Math.exp(-a * 1.4)) * (1 - sm(L * .7, L, a)) * sm(0, .12, a);
      _q.setFromEuler(new THREE.Euler(sd * 6, sd * 11 + a * .4, sd * 3)); _m.compose(_a, _q, _v.set(s, s * (.8 + .3 * sd), s)); smokeM.setMatrixAt(i, _m); }
    smokeM.instanceMatrix.needsUpdate = true;
    // flint sparks: pure in t from the two strikes (and any live 'spark' flint events)
    let si = 0; ST.spkG = 0; const strikes = [[STRIKE1, 5, 0]]; for (const e of Score.recent('spark', t, .8)) if (e.kind === 'flint') strikes.push([e.t, 12, 1]);
    for (const [ts, n, j] of strikes) { const a = t - ts; if (a < 0 || a > .75) continue; if (ts > t0 - .02) ST.strike[j].copy(ST.flint); ST.spkG = Math.max(ST.spkG, (j ? 2.2 : 1) * Math.exp(-a * 9));
      for (let k = 0; k < n && si < NS; k++, si++) { const r1 = h1(k * 3.7 + ts), r2 = h1(k * 5.3 + ts * 2), r3 = h1(k * 9.1 + ts * 3); const v = _b.set(ST.dir.x * 1.4 + (r1 - .5) * 2.4, .6 + 1.6 * r2, ST.dir.z * 1.4 + (r3 - .5) * 2.4);
        _a.copy(ST.strike[j]).addScaledVector(v, a); _a.y -= 4.9 * a * a; const s = (1 - a / .75) * (.6 + .8 * r2); _q.setFromAxisAngle(YA, r1 * 6); _m.compose(_a, _q, _v.set(s * 1.6, s * .6, s * .6)); sparkM.setMatrixAt(si, _m); } }
    for (; si < NS; si++) { _m.makeScale(0, 0, 0); sparkM.setMatrixAt(si, _m); } sparkM.instanceMatrix.needsUpdate = true;
  }

  // ================================================================ frame
  let lastFrame = -1;
  function update(ctx) {
    if (!built) return; const t = ctx.t, dt = ctx.dt || 1 / 60; ST.t = t;
    const on = t >= C.DAWN0 - .5; root.visible = on; smokeM.visible = sparkM.visible = on && api.smoke !== false; if (!on) { ST.tipG = ST.thrG = ST.spkG = ST.fireG = 0; return; }
    const reset = ctx.reset || Math.abs(t - lastFrame) > .25 || t < lastFrame; lastFrame = t;
    const fr = pose(t, dt);
    // flight: solve the group position so the mouth rides the shared heart path
    const mouthG = fromBone(B.head, [1.5, 2.55, 0], V3());
    if (PL.fly) { M.heart2('ash', t, _a); _b.copy(mouthG).applyQuaternion(GQ.setFromAxisAngle(YA, PL.yaw)); PL.pos.copy(_a).sub(_b); PL.pos.y += .07 * Math.sin(t * TAU / BT('dawn')) * sm(C.HEART2 - .3, C.HEART2 + .3, t) - .05 * flapPhi(t); Gm.compose(PL.pos, GQ, _one); Gi.copy(Gm).invert(); }
    ST.pos.copy(PL.pos); ST.lastT = ST.lastT || t;
    // world readouts (bones are still in group space here)
    ST.mouth.copy(mouthG).applyMatrix4(Gm); wpos(B.head, ST.head).applyMatrix4(Gm); ST.dir.copy(HF).applyQuaternion(wq(B.head, _q3)).applyQuaternion(_q.setFromAxisAngle(YA, PL.yaw)).normalize();
    _a.set(CIGF + (.5 - CIGF) * fr.cs.burn + .02, 0, 0).applyMatrix4(B.cig.matrixWorld).applyMatrix4(Gm); ST.tip.copy(_a);
    ST.flint.copy(wpos(B.flint, _a)).applyMatrix4(Gm); ST.under.set(.35, 0, 1.3).applyMatrix4(Gm);
    for (const s of [-1, 1]) fromBone(B.head, [NOS[0] + .03, NOS[1] + .01, s * NOS[2]], s < 0 ? ST.nosL : ST.nosR).applyMatrix4(Gm);
    fromBone(B.neck2, [THR[0] + .1, THR[1], 0], ST.thr).applyMatrix4(Gm);
    membrane(t);
    // uniforms
    const sg = fr.sg, so = fr.so; U.uThr.value = .035 * sg.a * (fr.hum ? 1.1 : .8) * (.75 + .25 * Math.sin(t * 31)) + .02 * so.gr + .03 * so.roar + .015 * fr.lau; U.uGlow.value = sg.a * (fr.hum ? .55 : 1) * (t > C.RAIN && t < C.TRAIN ? 1 : .6) + fire(t) * .8;
    const flare = Score.env('puff', t + .25, .3, e => !e.who || e.who === 'ash') * .4 + so.hr + so.grunt * .8 + fr.dr * .5 + so.roar * .6; U.uNos.value.set(clamp(flare), clamp(flare));
    U.uBel.value = .018 * Math.sin(TAU * t / 3.4) * (1 - fr.sighK) + .03 * fr.dr + .04 * fr.lau * Math.abs(Math.sin(t * 17)) + .05 * fr.demo - .02 * fr.cJerk;
    U.uSmi.value = clamp(kSmile(t) + .5 * fr.lau, -.6, 1.2); U.uPuf.value = .6 * bump(t, P2 - .15, P2 + .05, P2 + .8, P2 + 1.0) * (t < C.RAIN ? 1 : 0) + .5 * so.wz;
    UE.uTear.value = t > C.RAIN && t < C.TRAIN ? sm(C.STUB + .5, C.STUB + 1.4, t) : 0;
    UP.uDraw.value = fr.dr; UP.uFl.value = .85 + .15 * Math.sin(t * 23) * Math.sin(t * 7.1);
    // final group transform (+ studio: keep him on the studio floor)
    root.position.copy(PL.pos); root.quaternion.setFromAxisAngle(YA, PL.yaw);
    const ref = _c.set(0, 0, 0); if (LOCAL) { if (PL.fly) ref.copy(PL.pos).sub(_d.set(0, 3, 0)); else ref.set(PL.pos.x, PL.gy, PL.pos.z); root.position.sub(ref); }
    smokeM.position.copy(ref).negate(); sparkM.position.copy(ref).negate(); root.updateMatrixWorld(true);
    // lights
    ST.tipG = clamp(fr.cs.lit) * (.12 + .55 * fr.dr) * UP.uFl.value; ST.thrG = U.uGlow.value * .32; ST.fireG = fire(t) * 2.4;
    Lan.pos(LT.tip, ST.tip.x - ref.x, ST.tip.y - ref.y, ST.tip.z - ref.z); Lan.pos(LT.thr, ST.thr.x - ref.x, ST.thr.y - ref.y, ST.thr.z - ref.z);
    Lan.pos(LT.spk, ST.strike[1].x - ref.x, ST.strike[1].y - ref.y, ST.strike[1].z - ref.z); _a.copy(ST.mouth).addScaledVector(ST.dir, .8); Lan.pos(LT.fire, _a.x - ref.x, _a.y - ref.y, _a.z - ref.z);
    smoke(t, reset, fr); ST.lastT = t;
  }

  Object.assign(api, {
    at, fire, cigLit,
    head: o => (o || V3()).copy(ST.head), mouth: o => (o || V3()).copy(ST.mouth), dir: o => (o || V3()).copy(ST.dir), cig: o => (o || V3()).copy(ST.tip), wingUnder: o => (o || V3()).copy(ST.under), S: ST });
  Object.defineProperty(api, 'group', { get: () => root, enumerable: true });
  Stage.actor('ash', api);
  Assets.add('ash', { order: 24, build, update, pick, poke(hit, ctx) { ST.poke = ctx.t; return 'puff'; } });
  return api;
})();
