'use strict';
// ---- CINDER: the volcano's dragon. 14 m long, wingspan 26 m. Faceted obsidian plates with lava in the seams, molten eyes, a horn crown,
//      jaws that glow inside; wing membranes made of layered cut-flame cards; turns to grey stone from the chest out and crumbles into rubble.
//   Cinder.group   .at(t, out) chest centre (pure, film metres)   .head(out) .mouth(out) .dir(out) (fire direction, unit)   .fire() breath 0..1
//   .stone() 0..1  .level() wing fire 0..1  .emitters(out[]) ember points along the wings, tail flame and crest (world)
//   .chunks [{p, v, r, land}] the rubble after CRUMBLE (world; land = film time it first hits the ground) — for dust
const Cinder = (() => {
  const C = Score.CUE, M = Stage.M, ME = Q.has('studio'), PLACE = Q.has('place');
  const T_IN0 = C.ERUPT + .1, T_OUT0 = C.BLAST + .2, T_IN1 = C.RETURN - .15, T_LAND = C.RETURN + 1.25, T_FRZ = C.PETRIFY + .16, T_ST0 = C.PETRIFY + .02, T_ST1 = C.PETRIFY + .85, T_CR = C.CRUMBLE, GROUND = M.PLATEAU.y;
  const shown = t => (t >= T_IN0 && t < T_OUT0) || t >= T_IN1;
  const group = new THREE.Group(); group.name = 'cinder'; const rig = new THREE.Group(); group.add(rig);
  const v1 = V3(), v2 = V3(), v3 = V3(), v4 = V3(), v5 = V3(), v6 = V3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler(0, 0, 0, 'YXZ'), ma = new THREE.Matrix4();

  // ---------- skeleton, rest pose in model space: chest centre at the origin, +z forward, +x his left ----------
  const D = {}, jt = (n, p, x, y, z) => { D[n] = { parent: p, pos: [x, y, z] }; };
  jt('root', null, 0, 0, 0); jt('spine', 'root', 0, -.05, -1.4); jt('hips', 'spine', 0, -.1, -2.75);
  const TAILJ = [[-.18, -3.7], [-.27, -4.7], [-.36, -5.7], [-.44, -6.6], [-.5, -7.45], [-.53, -8.25]]; TAILJ.forEach((q, i) => jt('t' + (i + 1), i ? 't' + i : 'hips', 0, q[0], q[1])); jt('tip', 't6', 0, -.55, -8.95);
  jt('n1', 'root', 0, .5, 1.4); jt('n2', 'n1', 0, 1.05, 2.15); jt('n3', 'n2', 0, 1.62, 2.82); jt('n4', 'n3', 0, 2.1, 3.38); jt('head', 'n4', 0, 2.45, 3.9); jt('jaw', 'head', 0, 2.33, 3.92);
  const FT = [[13.0, 1.9, -.6], [11.6, 1.5, -3.4], [9.4, 1.15, -5.2], [6.6, .9, -5.7]], WR = [7.4, 1.6, .5], HATT = [.95, .35, -2.95];
  for (const s of [1, -1]) { const S = s > 0 ? '_L' : '_R';
    jt('flU' + S, 'root', .85 * s, -.55, .62); jt('flL' + S, 'flU' + S, 1.05 * s, -1.8, 1.0); jt('flH' + S, 'flL' + S, 1.0 * s, -2.9, 1.42);
    jt('hlU' + S, 'hips', .75 * s, -.55, -2.6); jt('hlL' + S, 'hlU' + S, .95 * s, -1.85, -1.85); jt('hlF' + S, 'hlL' + S, .9 * s, -3.2, -2.45);
    jt('wS' + S, 'root', .9 * s, .95, .55); jt('wE' + S, 'wS' + S, 4.0 * s, 1.35, -.6); jt('wW' + S, 'wE' + S, WR[0] * s, WR[1], WR[2]);
    FT.forEach((f, i) => { const dx = f[0] - WR[0], dy = f[1] - WR[1], dz = f[2] - WR[2], l = Math.hypot(dx, dy, dz); jt('f' + i + S, 'wW' + S, (WR[0] + dx / l * .35) * s, WR[1] + dy / l * .35, WR[2] + dz / l * .35); jt('ft' + i + S, 'f' + i + S, f[0] * s, f[1], f[2]); }); }
  const RP = n => D[n].pos, RV = n => V3(...D[n].pos);
  const FANG = FT.map(f => Math.atan2(-(f[2] - WR[2]), f[0] - WR[0]));      // finger angles in the wing plane (positive = swept back)

  // ---------- plates: one Voronoi, the same integer hash in JS and GLSL, so geometric plates and lava seams line up ----------
  const hsh = (x, y, z) => { let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16; return h >>> 0; };
  const jx = h => (h & 1023) / 1023 * .8 + .1, jy = h => ((h >>> 10) & 1023) / 1023 * .8 + .1, jz = h => ((h >>> 20) & 1023) / 1023 * .8 + .1;
  const VO = { e: 0, h: 0, k: 0 };
  function voro(x, y, z) { const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), fx = x - bx, fy = y - by, fz = z - bz; let md = 8, mi = 0, mj = 0, mk = 0, mx = 0, my = 0, mz = 0, mh = 0;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const h = hsh(bx + i, by + j, bz + k), rx = i + jx(h) - fx, ry = j + jy(h) - fy, rz = k + jz(h) - fz, d = rx * rx + ry * ry + rz * rz; if (d < md) { md = d; mi = i; mj = j; mk = k; mx = rx; my = ry; mz = rz; mh = h; } }
    md = 8; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { if (!i && !j && !k) continue; const ci = mi + i, cj = mj + j, ck = mk + k, h = hsh(bx + ci, by + cj, bz + ck), rx = ci + jx(h) - fx, ry = cj + jy(h) - fy, rz = ck + jz(h) - fz, dx = rx - mx, dy = ry - my, dz = rz - mz, l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-5) continue; const d = (.5 * (mx + rx) * dx + .5 * (my + ry) * dy + .5 * (mz + rz) * dz) / l; if (d < md) md = d; }
    VO.e = md; VO.h = mh; VO.k = (bx + mi + 1024) * 4194304 + (by + mj + 1024) * 2048 + (bz + mk + 1024); return VO; }
  // flatten each cell of a sculpted mesh into a slightly tilted, lifted plate; sink a groove along the seams. Keeps the unmoved points as aRest.
  function plates(g, s, groove, wfn) {
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, rest = new Float32Array(P.array), key = new Float64Array(n), edge = new Float32Array(n), w = new Float32Array(n), acc = new Map();
    for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); w[i] = wfn(x, y, z); voro(x * s, y * s, z * s); edge[i] = VO.e / s; key[i] = VO.k; if (w[i] <= 0) continue; let a = acc.get(VO.k); if (!a) acc.set(VO.k, a = [0, 0, 0, 0, 0, 0, 0, VO.h, null]); a[0] += x; a[1] += y; a[2] += z; a[3] += N.getX(i); a[4] += N.getY(i); a[5] += N.getZ(i); a[6]++; }
    acc.forEach(a => { const c = a[6], L = Math.hypot(a[3], a[4], a[5]) || 1, nx = a[3] / L, ny = a[4] / L, nz = a[5] / L, h = a[7]; const t1 = Math.abs(ny) < .9 ? V3(0, 1, 0).cross(V3(nx, ny, nz)).normalize() : V3(1, 0, 0).cross(V3(nx, ny, nz)).normalize(), t2 = V3(nx, ny, nz).cross(t1);
      const r1 = ((h >>> 3) & 255) / 255 - .5, r2 = ((h >>> 11) & 255) / 255 - .5, lift = (.3 + .7 * (((h >>> 19) & 255) / 255)) * groove * .9, q = V3(nx, ny, nz).addScaledVector(t1, r1 * .42).addScaledVector(t2, r2 * .42).normalize();
      a[8] = [a[0] / c + nx * lift, a[1] / c + ny * lift, a[2] / c + nz * lift, q.x, q.y, q.z, L / c]; });
    for (let i = 0; i < n; i++) { if (w[i] <= 0) continue; const a = acc.get(key[i]), p = a[8], x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), dn = nx * p[3] + ny * p[4] + nz * p[5];
      let t = 0; if (dn > .35) t = clamp(((p[0] - x) * p[3] + (p[1] - y) * p[4] + (p[2] - z) * p[5]) / dn, -groove * 3, groove * 3);
      const e = edge[i], d = (t * sm(.6, .92, p[6]) * sm(groove * .35, groove * 1.9, e) - groove * (1 - sm(0, groove * .8, e))) * w[i]; P.setXYZ(i, x + nx * d, y + ny * d, z + nz * d); }
    g.computeVertexNormals(); g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3)); return g; }

  // ---------- sculpt: body (one mesh) + head (finer) ----------
  const tbox = (cx, cy, cz, hx0, hx1, hy0, hy1, hz, r) => (x, y, z) => { const u = clamp((z - cz + hz) / (2 * hz)), hx = hx0 + (hx1 - hx0) * u, hy = hy0 + (hy1 - hy0) * u, qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r, a = Math.max(qx, 0), b = Math.max(qy, 0), c = Math.max(qz, 0); return Math.sqrt(a * a + b * b + c * c) + Math.min(Math.max(qx, qy, qz), 0) - r; };
  const CB = '#211d26', CV = '#2d2321', CL = '#1c1a21';
  function bodyParts() { const p = [], A = (f, color, bone, k = .12) => p.push({ f, color, bone, k });
    A(SD.ell(0, .02, .15, 1.12, 1.22, 1.75), CB, 'root', .1); A(SD.ell(0, -.55, .8, .8, .72, .9), CV, 'root', .3); A(SD.mirX(SD.ell(.72, .78, .45, .55, .42, .75)), CB, 'root', .25);
    A(SD.ell(0, -.15, -1.35, 1.0, 1.06, 1.45), CB, 'spine', .3); A(SD.ell(0, -.42, -1.3, .78, .72, 1.2), CV, 'spine', .3); A(SD.ell(0, -.12, -2.7, .88, .9, 1.0), CB, 'hips', .3); A(SD.ell(0, .72, -.5, .3, .52, 1.7), CB, 'root', .3);
    const TP = [[-.12, -3.1, .8, 'hips'], [-.18, -3.7, .7, 't1'], [-.27, -4.7, .56, 't2'], [-.36, -5.7, .43, 't3'], [-.44, -6.6, .31, 't4'], [-.5, -7.45, .21, 't5'], [-.53, -8.25, .13, 't6'], [-.55, -8.95, .05, 't6']];
    for (let i = 0; i < TP.length - 1; i++) { const a = TP[i], b = TP[i + 1]; A(SD.cone(0, a[0], a[1], 0, b[0], b[1], a[2], b[2]), CB, a[3], .14); }
    const NP = [[.15, .85, .86, 'root'], [.5, 1.4, .72, 'n1'], [1.05, 2.15, .62, 'n2'], [1.62, 2.82, .55, 'n3'], [2.1, 3.38, .5, 'n4'], [2.42, 3.86, .45, 'n4']];
    for (let i = 0; i < NP.length - 1; i++) { const a = NP[i], b = NP[i + 1]; A(SD.cone(0, a[0], a[1], 0, b[0], b[1], a[2], b[2]), CB, a[3], .14); A(SD.cone(0, a[0] - a[2] * .45, a[1] + a[2] * .2, 0, b[0] - b[2] * .45, b[1] + b[2] * .2, a[2] * .62, b[2] * .62), CV, a[3], .12); }
    for (const s of [1, -1]) { const S = s > 0 ? '_L' : '_R';
      A(SD.ell(.82 * s, -.45, .6, .45, .55, .5), CB, 'root', .25); A(SD.cone(.85 * s, -.55, .62, 1.05 * s, -1.8, 1.0, .42, .3), CL, 'flU' + S, .1); A(SD.cone(1.05 * s, -1.8, 1.0, 1.0 * s, -2.9, 1.42, .29, .2), CL, 'flL' + S, .08); A(SD.ell(1.0 * s, -3.02, 1.6, .24, .14, .3), CL, 'flH' + S, .07);
      A(SD.ell(.7 * s, -.75, -2.55, .5, .72, .7), CB, 'hlU' + S, .2); A(SD.cone(.75 * s, -.55, -2.6, .95 * s, -1.85, -1.85, .55, .36), CL, 'hlU' + S, .1); A(SD.cone(.95 * s, -1.85, -1.85, .9 * s, -3.2, -2.45, .33, .2), CL, 'hlL' + S, .08); A(SD.cone(.9 * s, -3.2, -2.45, .9 * s, -3.42, -1.75, .2, .14), CL, 'hlF' + S, .06); }
    return p; }
  const O = D.head.pos, EYE = [V3(.305, .265, .82), V3(-.305, .265, .82)], EYE_N = EYE.map(e => V3(Math.sign(e.x) * .8, .12, .58).normalize()), EYE_T = EYE_N.map(n => V3(n.z, 0, -n.x).normalize());
  const cHot = hex('#fff3b0'), cMid = hex('#ffb12a'), cRim = hex('#e2400e'), cSlit = hex('#140608');
  function eyeCol(x, y, z) { x -= O[0]; y -= O[1]; z -= O[2]; const s = x > 0 ? 0 : 1, c = EYE[s], lx = x - c.x, ly = y - c.y, lz = z - c.z, a = Math.abs(lx * EYE_T[s].x + lz * EYE_T[s].z) + Math.abs(ly) * .12;
    if (a < .011) return cSlit.clone(); const k = sm(.012, .07, a); return k < .5 ? cHot.clone().lerp(cMid, k * 2) : cMid.clone().lerp(cRim, k * 2 - 1); }
  function headParts() { const p = [], A = (f, color, bone, k = .05) => p.push({ f: SD.tr(f, O[0], O[1], O[2]), color, bone, k });
    A(SD.ell(0, .12, .15, .4, .36, .55), CB, 'head', .08); A(SD.ell(0, .04, -.22, .37, .34, .36), CB, 'head', .1); A(tbox(0, 0, 1.12, .3, .19, .16, .13, .82, .07), CB, 'head', .1);
    A(SD.cone(0, .17, .5, 0, .12, 1.88, .12, .07), CB, 'head', .05); A(SD.mirX(SD.cone(.26, .34, .42, .24, .27, 1.02, .1, .045)), CB, 'head', .05); A(SD.mirX(SD.ell(.34, -.02, .35, .13, .2, .38)), CB, 'head', .06);
    A(SD.mirX(SD.ell(.3, -.12, .02, .13, .18, .22)), CB, 'head', .05); A(SD.mirX(SD.sph(.305, .265, .82, .072)), eyeCol, 'head', 0); A(SD.mirX(SD.cone(.32, .185, .68, .31, .19, .95, .032, .022)), CB, 'head', .02);
    A(tbox(0, -.31, 1.0, .27, .15, .1, .08, .88, .05), CB, 'jaw', 0); A(SD.ell(0, -.33, 1.78, .13, .09, .14), CB, 'jaw', .04); A(SD.mirX(SD.cone(.24, -.31, .15, .15, -.31, 1.7, .07, .05)), CB, 'jaw', .03);
    A(SD.ell(0, -.245, .85, .15, .035, .55), '#7a1c0b', 'jaw', .02); A(SD.ell(0, -.4, .1, .25, .17, .42), CV, 'jaw', .05);
    p.push({ f: SD.tr(SD.mirX(SD.sph(.1, .12, 1.86, .045)), O[0], O[1], O[2]), cut: true, k: .015 }); return p; }
  const eyeSD = (x, y, z) => { x -= O[0]; y -= O[1]; z -= O[2]; return Math.min(Math.hypot(x - EYE[0].x, y - EYE[0].y, z - EYE[0].z), Math.hypot(x - EYE[1].x, y - EYE[1].y, z - EYE[1].z)) - .072; };
  const mouthM = (x, y, z) => { x -= O[0]; y -= O[1]; z -= O[2]; const w = lerp(.21, .12, clamp((z - .3) / 1.6)); return (1 - sm(w - .05, w + .02, Math.abs(x))) * sm(-.3, -.255, y) * (1 - sm(-.13, -.1, y)) * sm(.02, .22, z) * (1 - sm(1.82, 1.96, z)); };
  const throatM = (x, y, z) => { const yc = .15 + (z - .9) * (2.27 / 2.95); return sm(.15, .5, yc - y) * sm(.5, 1.2, z) * (1 - sm(3.7, 4.1, z)); };

  // ---------- hard parts: teeth, claws, horn crown, dorsal blades, wing struts (faceted, merged into the same skinned mesh) ----------
  const facet = g => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('normal'); q.computeVertexNormals(); return Geo.idx(q); };
  const horn = (pts, r0, r1, sides, pw = 1, smooth = 0) => facet(Geo.tube(pts.map(p => p.isVector3 ? p : V3(...p)), u => Math.max(.002, r0 + (r1 - r0) * Math.pow(u, pw)), sides, smooth ? { smooth } : {}));
  function blade(p, dir, nrm, L, H, th) { const side = V3().crossVectors(dir, nrm).normalize(), back = dir.clone().negate(), ctr = p.clone().addScaledVector(nrm, H * .3), pos = [];
    const F = p.clone().addScaledVector(dir, L * .5).addScaledVector(nrm, -.06), Bk = p.clone().addScaledVector(back, L * .5).addScaledVector(nrm, -.06), Lp = p.clone().addScaledVector(side, th), Rp = p.clone().addScaledVector(side, -th), T = p.clone().addScaledVector(nrm, H).addScaledVector(back, H * .5), N2 = p.clone().addScaledVector(nrm, H * .42).addScaledVector(back, L * .5 + H * .32);
    const tri = (a, b, c) => { const nn = V3().subVectors(b, a).cross(V3().subVectors(c, a)), m = V3().add(a).add(b).add(c).multiplyScalar(1 / 3).sub(ctr); if (nn.dot(m) < 0) { const t = b; b = c; c = t; } pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
    tri(F, Lp, T); tri(F, Rp, T); tri(Lp, N2, T); tri(Rp, N2, T); tri(Lp, Bk, N2); tri(Rp, Bk, N2); return Geo.make(pos, null, null, pos.map((_, i) => i).slice(0, pos.length / 3)); }
  function hardParts(BI) { const out = [], R = rng(4646), H = (x, y, z) => V3(x + O[0], y + O[1], z + O[2]);
    const add = (g, bone, col, crack = 0, mouth = 0) => { Geo.paint(g, col); Geo.attr(g, 'aMat', 4, [crack, 0, mouth, 3.2]); Geo.attr(g, 'aMat2', 4, [0, .55, 2, 0]); g.setAttribute('aRest', g.attributes.position.clone()); Geo.attr(g, 'skinIndex', 4, [BI(bone), 0, 0, 0]); Geo.attr(g, 'skinWeight', 4, [1, 0, 0, 0]); out.push(g); };
    const TC = '#2b2427', CC = '#121014', HC = '#18151b', SC = '#1a171e';
    for (const s of [1, -1]) { const S = s > 0 ? '_L' : '_R';
      // teeth: upper row hangs outside the lower jaw (crocodile bite), fangs at the front; the throat light shines through them
      for (let i = 0; i < 11; i++) { const z = .42 + i * .137, w = lerp(.275, .175, (z - .3) / 1.64), L = i === 8 ? .3 : i === 10 ? .19 : .12 + .06 * R(), a = H(s * (w - .012), -.125, z), d = V3(-s * .1, -1, -.1 - (i > 7 ? .12 : 0)).normalize();
        add(horn([a.clone().addScaledVector(d, -.03), a.clone().addScaledVector(d, L * .55).add(V3(0, 0, -L * .07)), a.clone().addScaledVector(d, L).add(V3(0, 0, -L * .2))], .026 + L * .1, .002, 4), 'head', TC, 0, .45); }
      for (let i = 0; i < 10; i++) { const z = .5 + i * .14, w = lerp(.235, .14, (z - .12) / 1.76), L = i === 7 ? .22 : .08 + .05 * R(), a = H(s * (w - .025), -.215, z), d = V3(-s * .06, 1, .08).normalize();
        add(horn([a.clone().addScaledVector(d, -.03), a.clone().addScaledVector(d, L * .55), a.clone().addScaledVector(d, L).add(V3(0, 0, -L * .15))], .022 + L * .1, .002, 4), 'jaw', TC, 0, .45); }
      // horn crown
      add(horn([H(s * .24, .33, .0), H(s * .46, .7, -.62), H(s * .62, .9, -1.45)], .14, .004, 6, 1, 10), 'head', HC, .35);
      add(horn([H(s * .14, .42, .25), H(s * .27, .85, -.25), H(s * .33, 1.1, -.74)], .085, .003, 5, 1, 8), 'head', HC, .3);
      add(horn([H(s * .32, .17, -.3), H(s * .52, .26, -.74), H(s * .66, .22, -1.08)], .07, .003, 5, 1, 6), 'head', HC, .3);
      for (let i = 0; i < 3; i++) { const b = H(s * .43, -.04 + i * .02, .32 - i * .17); add(horn([b, b.clone().add(V3(s * (.22 - i * .03), -.06 + i * .07, -.25)), b.clone().add(V3(s * (.34 - i * .05), -.1 + i * .12, -.52 + i * .08))], .06 - i * .01, .003, 4, 1, 5), 'head', HC, .2); }
      add(horn([H(s * .27, .38, .62), H(s * .32, .5, .52), H(s * .36, .6, .36)], .045, .003, 4), 'head', HC);
      for (let i = 0; i < 3; i++) { const b = H(s * .2, -.38, .4 + i * .36); add(horn([b, b.clone().add(V3(s * .08, -.14, -.12)), b.clone().add(V3(s * .14, -.24, -.3))], .045, .003, 4), 'jaw', HC); }
      // claws
      for (let k = 0; k < 4; k++) { const b = V3((1.0 + (k - 1.5) * .11) * s, -3.08, 1.78 - Math.abs(k - 1.5) * .06); add(horn([b, b.clone().add(V3(0, -.04, .22)), b.clone().add(V3(0, -.3, .34))], .065, .003, 5, 1, 6), 'flH' + S, CC); }
      for (let k = 0; k < 3; k++) { const b = V3((.9 + (k - 1) * .13) * s, -3.45, -1.7 - Math.abs(k - 1) * .08); add(horn([b, b.clone().add(V3(0, -.02, .26)), b.clone().add(V3(0, -.27, .4))], .075, .003, 5, 1, 6), 'hlF' + S, CC); }
      add(horn([V3(.9 * s, -3.3, -2.5), V3(.92 * s, -3.5, -2.7), V3(.94 * s, -3.62, -2.92)], .06, .003, 4), 'hlF' + S, CC);
      add(horn([V3(1.08 * s, -1.75, .9), V3(1.18 * s, -1.6, .55), V3(1.25 * s, -1.4, .2)], .08, .003, 5), 'flL' + S, HC, .2);
      add(horn([V3(.98 * s, -1.85, -1.95), V3(1.1 * s, -1.55, -2.25), V3(1.18 * s, -1.2, -2.5)], .09, .003, 5), 'hlL' + S, HC, .2);
      // wing struts: obsidian bones, jagged spurs along the trailing side
      const P = (x, y, z) => V3(x * s, y, z), Sh = P(...RP('wS_L')), E = P(...RP('wE_L')), W = P(...WR);
      add(horn([Sh, Sh.clone().lerp(E, .5).add(V3(0, .25, 0)), E], .22, .15, 6, 1, 8), 'wS' + S, SC, .5);
      add(facet(Geo.at(new THREE.IcosahedronGeometry(.23, 0), E.x, E.y, E.z)), 'wE' + S, SC, .4);
      add(horn([E, E.clone().add(P(.12, .3, -.5)), E.clone().add(P(.2, .42, -1.0))], .12, .003, 5), 'wE' + S, HC, .3);
      add(horn([E, E.clone().lerp(W, .5).add(V3(0, .2, .1)), W], .16, .11, 6, 1, 8), 'wE' + S, SC, .5);
      for (let i = 0; i < 3; i++) { const b = E.clone().lerp(W, .3 + i * .22).add(V3(0, .1, .12)); add(horn([b, b.clone().add(P(.06, .2, .2)), b.clone().add(P(.1, .28, .38))], .06, .003, 4), 'wE' + S, HC); }
      add(facet(Geo.at(new THREE.IcosahedronGeometry(.17, 0), W.x, W.y, W.z)), 'wW' + S, SC, .4);
      add(horn([W, W.clone().add(P(.05, .16, .38)), W.clone().add(P(-.06, .06, .72))], .09, .003, 5, 1, 6), 'wW' + S, CC);
      add(horn([W, W.clone().add(P(0, .45, -.1)), W.clone().add(P(.06, .7, -.32))], .07, .003, 4), 'wW' + S, HC);
      FT.forEach((f, i) => { const F = P(...f), A0 = P(...RP('f' + i + '_L')), dir = V3().subVectors(F, A0).normalize(), back = V3(0, 1, 0).cross(dir).normalize().multiplyScalar(-s); if (back.z > 0) back.negate();
        add(horn([A0.clone().addScaledVector(dir, -.3), A0.clone().lerp(F, .5).add(V3(0, .12, 0)), F], .1, .028, 5, 1, 8), 'f' + i + S, SC, .45);
        for (let k = 0; k < 3; k++) { const b = A0.clone().lerp(F, .3 + k * .24), L = .28 + .14 * R(); add(horn([b, b.clone().addScaledVector(back, L * .6).addScaledVector(dir, L * .25), b.clone().addScaledVector(back, L).addScaledVector(dir, L * .55)], .045, .003, 4), 'f' + i + S, HC); } }); }
    // nose horn and chin
    add(horn([H(0, .2, 1.58), H(0, .36, 1.7), H(0, .5, 1.62)], .07, .003, 5, 1, 6), 'head', HC); add(horn([H(0, -.4, 1.72), H(0, -.55, 1.62), H(0, -.66, 1.44)], .05, .003, 4), 'jaw', HC);
    // dorsal blades: neck, back, tail
    const nn = V3(0, .79, -.61), nd = V3(0, .61, .79), Up = V3(0, 1, 0), Fw = V3(0, 0, 1);
    [.12, .3, .48, .66, .82].forEach((f, i) => { const c = V3(0, lerp(.15, 2.42, f), lerp(.85, 3.86, f)), r = lerp(.86, .45, f); add(blade(c.addScaledVector(nn, r * .92), nd, nn, .32, lerp(.62, .34, f), .07), f < .18 ? 'root' : f < .43 ? 'n1' : f < .66 ? 'n2' : f < .84 ? 'n3' : 'n4', HC, .25); });
    [[1.22, .7, .95, 'root'], [1.22, -.2, 1.0, 'root'], [1.02, -1.2, .9, 'spine'], [.9, -2.1, .78, 'spine'], [.8, -2.85, .66, 'hips']].forEach(q => add(blade(V3(0, q[0], q[1]), Fw, Up, .46, q[2], .1), q[3], HC, .25));
    [[-.18, -3.7, .7, .52, 't1'], [-.27, -4.7, .56, .44, 't2'], [-.36, -5.7, .43, .36, 't3'], [-.44, -6.6, .31, .28, 't4'], [-.5, -7.45, .21, .22, 't5'], [-.53, -8.25, .13, .16, 't6']].forEach(q => add(blade(V3(0, q[0] + q[2] * .9, q[1]), Fw, Up, .34, q[3], .07), q[4], HC, .25));
    return out; }

  // ---------- material: obsidian (glossy black plates, lava seams, molten eyes, glowing mouth) that can turn to stone ----------
  const GLSL_V = /* glsl */`
uint cHs(ivec3 c){ uint h = (uint(c.x) * 73856093u) ^ (uint(c.y) * 19349663u) ^ (uint(c.z) * 83492791u); h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u; return h; }
vec3 cJit(uint h){ return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 1023.0 * 0.8 + 0.1; }
float cVor(vec3 x, out vec3 mr, out uint ha, out uint hb){ vec3 fl = floor(x), f = x - fl; ivec3 b = ivec3(fl), mc = ivec3(0); float md = 8.0; mr = vec3(0.0); ha = 0u; hb = 0u;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { ivec3 c = ivec3(i, j, k); uint h = cHs(b + c); vec3 r = vec3(c) + cJit(h) - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mc = c; ha = h; } }
  md = 8.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { if (i == 0 && j == 0 && k == 0) continue; ivec3 c = mc + ivec3(i, j, k); uint h = cHs(b + c); vec3 r = vec3(c) + cJit(h) - f; vec3 dr = r - mr; float l = length(dr); if (l < 1e-5) continue; float d = dot(0.5 * (mr + r), dr / l); if (d < md) { md = d; hb = h; } }
  return md; }`;
  function obsidianHook(U, key) { return { key, uniforms: U,
    vertPars: 'attribute vec4 aMat; attribute vec4 aMat2; attribute vec3 aRest; varying vec4 vMat; varying vec4 vMat2; varying vec3 vRest;', vert: 'vMat = aMat; vMat2 = aMat2; vRest = aRest;',
    fragPars: GLSL_NZ + GLSL_V + 'uniform float uTime, uLava, uStoneR, uHeat, uEye, uThroat, uShard; uniform vec3 uChest; varying vec4 vMat; varying vec4 vMat2; varying vec3 vRest; vec3 cEm = vec3(0.0);',
    color: /* glsl */`{
      vec3 vc = col, mr; uint ha, hb; float sc = vMat.w, e = cVor(vRest * sc, mr, ha, hb) / sc;
      float hA = float(ha & 65535u) / 65535.0, hE = fract(hA * 7.13 + float(hb & 65535u) / 65535.0 * 3.71), fw = max(fwidth(e), 1e-4), cw = 0.009 + 0.009 * hE;
      float crk = (1.0 - smoothstep(cw - fw, cw + fw, e)) * clamp(1.8 * cw / fw, 0.0, 1.0) * step(0.01, vMat.x), bev = 1.0 - smoothstep(0.0, 0.05, e);
      vec3 base = col * mix(vec3(0.82, 0.8, 0.98), vec3(1.35, 0.9, 0.78), step(0.8, hA)) * (0.7 + 0.6 * fract(hA * 5.3));
      rgh = mix(0.06, 0.3, fract(hA * 3.7)) + 0.25 * bev;
      float chip = 0.0; if (fract(hA * 11.3) > 0.7 && vMat.x > 0.01) { float cd = length(mr + (cJit(ha * 7u + 3u) - 0.5) * 0.8); chip = 1.0 - smoothstep(0.22, 0.25, cd + 0.09 * nz.r + 0.06 * nzB.g); hgt += sin(cd * 70.0 + nz.g * 9.0) * chip * 0.12; }
      base = mix(base, vec3(0.11, 0.1, 0.11), chip * 0.85); rgh = mix(rgh, 0.5, chip);
      base = mix(base, vec3(0.085, 0.07, 0.068), (1.0 - smoothstep(cw + 0.004, cw + 0.03, e)) * 0.55 * step(0.01, vMat.x)); col = mix(base, vec3(0.03, 0.008, 0.004), crk); col = mix(col, vec3(0.02), clamp(vMat.y + vMat.z, 0.0, 1.0));
      float hot = smoothstep(0.74, 0.97, hE) * smoothstep(0.45, 0.85, vnoise3(vRest * 0.42 + vec3(0.0, uTime * 0.06, 0.0)) + 0.3 * vMat.x - 0.28);
      hot *= vMat.x * (uLava + vMat2.x * uThroat * 2.2);
      vec3 lavaC = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.66, 0.2), clamp(hot * 0.55, 0.0, 1.0));
      cEm += lavaC * (crk * 3.2 + bev * 0.12) * hot;
      cEm += vc * vMat.y * uEye * 6.5;
      { float mn = vnoise3(vRest * 9.0 + vec3(0.0, 0.0, -uTime * 1.7)); cEm += mix(vec3(0.7, 0.07, 0.02), vec3(1.0, 0.45, 0.08), mn) * vMat.z * uThroat * (0.35 + 2.4 * mn * mn); }
      float coat = vMat2.y * uHeat; if (coat > 0.001) { float n = vnoise3(vRest * vec3(2.2, 0.8, 2.2) + vec3(0.0, uTime * 0.8, 0.0)); float sw = 1.0 - smoothstep(0.0, (0.02 + 0.05 * coat) * 1.82 / sc, e); float m = max(smoothstep(0.8 - coat * 0.12, 0.86 - coat * 0.1, n), sw * smoothstep(0.35, 0.7, n + coat * 0.3)); cEm += mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.55, 0.12), m * coat) * m * 1.7 * coat; col = mix(col, vec3(0.1, 0.025, 0.01), m); }
      float sd_ = length(vRest - uChest) + (vnoise3(vRest * 0.9) - 0.5) * 1.4, sk = clamp(uShard + 1.0 - smoothstep(uStoneR - 0.5, uStoneR, sd_), 0.0, 1.0);
      if (sk > 0.001) { vec3 st = vec3(0.33, 0.32, 0.3) * (0.72 + 0.48 * nzB.r) * (0.88 + 0.24 * nz.g); st = mix(st, vec3(0.07, 0.066, 0.062), crk * 0.92 + bev * 0.3 + chip * 0.2);
        col = mix(col, st, sk); rgh = mix(rgh, 0.95, sk); hgt = mix(hgt, nz.r * 0.9 + nz.g * 0.5 + bev * 0.4, sk);
        float front = sk * (1.0 - sk) * 4.0 * (1.0 - uShard); cEm = cEm * (1.0 - sk) + vec3(0.3, 0.7, 1.0) * front * 1.4; }
      if (!gl_FrontFacing) { col = vec3(0.12, 0.115, 0.11) * (0.75 + 0.5 * nz.r); cEm = vec3(0.0); rgh = 0.95; }
    }`, emissive: 'totalEmissiveRadiance += cEm;' }; }

  // ---------- flames: one instanced draw of cut-flame cards driven by bone points (wings = membranes of fire, tail flame, crest) ----------
  const FU = { uP: { value: Array.from({ length: 16 }, () => V3()) }, uTl: { value: Array.from({ length: 5 }, () => V3()) }, uCr: { value: Array.from({ length: 12 }, () => V3()) }, uCrN: { value: Array.from({ length: 12 }, () => V3(0, 1, 0)) },
    uVel: { value: V3() }, uCam: { value: V3() }, uTime: LU.uTime, uFire: { value: 1 }, uTailF: { value: 1 }, uFlare: { value: 0 }, uDown: { value: 0 }, uSmoke: { value: 0 }, uSmokeT: { value: 0 }, uIgn: { value: 1 } };
  const FL_VS = /* glsl */`
attribute vec4 iA; attribute vec4 iB; attribute float iC;
uniform vec3 uP[16]; uniform vec3 uTl[5]; uniform vec3 uCr[12]; uniform vec3 uCrN[12]; uniform vec3 uVel, uCam;
uniform float uTime, uFire, uTailF, uFlare, uDown, uSmoke, uSmokeT, uIgn;
varying vec2 vQ; varying vec4 vK; varying vec3 vPan; varying float vS;
vec3 pan(float id, float u, float v){ int s = id > 3.5 ? 8 : 0; float l = id - (id > 3.5 ? 4.0 : 0.0);
  if (l < 0.5) return mix(mix(uP[s], uP[s + 2], u), mix(uP[s + 7], uP[s + 6], u), v);
  int a = s + 2 + int(l + 0.5); vec3 W = uP[s + 2]; return W + (mix(uP[a], uP[a + 1], v) - W) * u; }
vec3 tailP(float u){ float x = clamp(u, 0.0, 1.0) * 4.0; int i = int(min(floor(x), 3.0)); return mix(uTl[i], uTl[i + 1], x - float(i)); }
float fl1(float t){ return 0.5 + 0.3 * sin(t * 7.3) + 0.2 * sin(t * 13.7 + 1.3); }
void main(){
  float kind = iB.z, sd = iA.w, W = iB.x, H = iB.y; vec3 q = position;
  vec3 P = vec3(0.0), up = vec3(0.0, 1.0, 0.0), N = vec3(0.0, 0.0, 1.0), side = vec3(1.0, 0.0, 0.0);
  float heat = uFire, alive = 1.0, fade = 1.0; vPan = vec3(0.0);
  bool sheet = kind > 3.5 && kind < 4.5; float smk = sheet ? 0.0 : step(fract(sd * 3.7), 0.62) * step(0.001, uSmoke); float grow = 1.0 + uSmokeT * 0.9 * smk;
  if (!sheet) { W *= grow; H *= grow; }
  float fk = fl1(uTime * (0.8 + sd * 0.6) + sd * 40.0);
  if (kind < 1.5 || kind > 3.5) {
    float id = iA.x, u = iA.y, v = iA.z; bool quad = id < 0.5 || (id > 3.5 && id < 4.5);
    if (sheet) { u += (q.x + 0.5) * W; v += q.y * H; }
    vec3 p0 = pan(id, u, v), du = pan(id, u + 0.03, v) - pan(id, u - 0.03, v), dv = pan(id, u, v + 0.03) - pan(id, u, v - 0.03);
    vec3 cr = cross(du, dv); float ar = length(cr); N = cr / max(ar, 1e-6); float k = sqrt(clamp(ar / max(iC, 1e-6), 0.03, 1.6));
    vec3 fl = normalize((quad ? dv : du) + 1e-6), sp = normalize((quad ? du : dv) + 1e-6);
    float span = quad ? u * 0.6 : 0.6 + u * 0.4; alive *= step(span, uIgn * 1.25);
    if (sheet) { P = p0 + N * sin(uTime * 3.0 + u * 9.0 + v * 7.0) * 0.07; vPan = vec3(quad ? u : v, quad ? v : u, quad ? 0.0 : 1.0); fade = 1.0 - uSmoke; }
    else {
      if (kind < 0.5) { up = normalize(fl + sp * 0.3 + vec3(0.0, 0.75, 0.0) - uVel * 0.012); up = normalize(up - N * dot(up, N) + 1e-5); side = normalize(cross(N, up)); W *= k; H *= k * (0.75 + 0.35 * fk + 0.35 * uDown + 0.3 * uFlare); }
      else { up = normalize(fl * 0.8 + vec3(0.0, 0.8, 0.0) - uVel * 0.03); side = normalize(cross(up, normalize(uCam - p0))); W *= mix(0.6, 1.0, k); H *= (0.6 + 0.6 * fk + 0.4 * uDown + 0.4 * uFlare) * mix(0.5, 1.0, k); }
      if (kind > 4.5) { float age = fract(uTime * (0.7 + sd * 0.9) + sd * 13.0); p0 += up * age * 3.2 * k - uVel * age * 0.4; W *= 1.0 - 0.7 * age; H *= 1.0 - 0.6 * age; fade = 1.0 - age; }
      P = p0 + side * q.x * W + up * q.y * H + N * (iB.w + sin(q.y * 3.0 + uTime * 5.0 + sd * 30.0) * 0.08 * q.y * H);
    }
  } else if (kind < 2.5) {
    vec3 p0 = tailP(iA.y), d = normalize(uTl[4] - uTl[2] + 1e-5);
    up = normalize(d + vec3(0.0, 0.6, 0.0) - uVel * 0.035 + vec3(sin(uTime * 3.0 + sd * 9.0), 0.0, cos(uTime * 2.3 + sd * 7.0)) * 0.25);
    side = normalize(cross(up, normalize(uCam - p0))); heat = uTailF; H *= 0.65 + 0.55 * fk + 0.3 * uFlare; W *= 0.85 + 0.2 * fk; P = p0 + side * q.x * W + up * q.y * H;
  } else {
    float x = clamp(iA.y, 0.0, 1.0) * 11.0; int i = int(min(floor(x), 10.0)); float f = x - float(i); vec3 p0 = mix(uCr[i], uCr[i + 1], f), n = normalize(mix(uCrN[i], uCrN[i + 1], f)), tg = normalize(uCr[i + 1] - uCr[i] + 1e-5);
    up = normalize(n + tg * 0.9 - uVel * 0.02); side = normalize(cross(up, normalize(uCam - p0))); heat = uTailF; H *= 0.6 + 0.6 * fk + 0.3 * uFlare; P = p0 + side * q.x * W + up * q.y * H;
  }
  float fireA = alive * step(fract(sd * 7.31), heat * 1.15 + 0.12 * sin(uTime * 21.0 + sd * 57.0)) * step(0.02, heat);
  if (smk > 0.5) P += vec3(0.0, 1.0, 0.0) * uSmokeT * (0.7 + sd * 1.4) + side * sin(uTime * 1.1 + sd * 9.0) * uSmokeT * 0.35;
  vQ = q.xy; vK = vec4(kind, sd, heat, fade); vS = smk * (1.0 - fireA);
  gl_Position = max(fireA, smk) < 0.5 ? vec4(0.0, 0.0, -10.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}`;
  const FL_FS = GLSL_NZ + /* glsl */`
uniform float uTime, uSmoke; varying vec2 vQ; varying vec4 vK; varying vec3 vPan; varying float vS;
void main(){
  float kind = vK.x, sd = vK.y, ht = vK.z, fade = vK.w, a = 0.0, h = 0.0;
  if (kind > 3.5 && kind < 4.5) {
    float x = vPan.x, f = vPan.y, e = f / (1.0 - (vPan.z > 0.5 ? 0.24 : 0.17) * sin(3.14159 * x));
    float n = vnoise2(vec2(x * 7.0 + sd * 3.0, f * 4.0 - uTime * 1.5)) * 0.65 + vnoise2(vec2(x * 19.0 + 4.0, f * 12.0 - uTime * 2.7)) * 0.35;
    float d = e - (0.8 + 0.12 * sin(x * 37.0 + uTime * 2.4) + (n - 0.5) * 0.3), fw = fwidth(d) + 1e-4; a = 1.0 - smoothstep(-fw, fw, d);
    float tear = n + (1.0 - e) * 0.55 - (1.0 - smoothstep(0.3, 0.9, ht)) * 0.6, fw2 = fwidth(tear) + 1e-4; a *= smoothstep(0.24 - fw2, 0.24 + fw2, tear);
    float tg = abs(fract(x * 5.0 + n * 0.55 + sd * 3.0 + f * 0.6) - 0.5) * 2.0;
    h = clamp(0.8 - e * 0.42 - tg * e * 0.5 + (n - 0.5) * 0.7, 0.0, 0.86) * mix(0.35, 1.0, ht); a *= 0.62 * smoothstep(0.02, 0.15, ht);
  } else {
    float y = vQ.y, t = uTime * (2.4 + sd * 2.0) + sd * 31.0, x = vQ.x - (sin(y * 4.0 - t * 1.3) * 0.1 + sin(y * 9.0 - t * 2.1) * 0.035) * y;
    float prof = 0.5 * pow(max(1.0 - y, 0.0), 0.62) * smoothstep(-0.04, 0.2, y), n = vnoise2(vec2(x * 5.0 + sd * 13.0, y * 4.5 - t)), wd = prof * (0.6 + 0.62 * n);
    float yn = 0.42 + 0.2 * sd, nw = y > yn ? (y - yn) * (0.22 + 0.2 * n) : -1.0, cx = 0.08 * sin(t * 0.7 + sd * 6.0);
    float d = max(abs(x) - wd, nw - abs(x - cx)), fw = fwidth(d) + 1e-4; a = 1.0 - smoothstep(-fw, fw, d);
    h = clamp(1.0 - abs(x) / max(wd, 1e-3) * 0.72 - y * 0.6 + (n - 0.5) * 0.4, 0.0, 1.0) * mix(0.3, 1.05, ht);
  }
  float fw = fwidth(h) * 0.7 + 0.004;
  vec3 c = mix(vec3(0.85, 0.09, 0.025) * 1.5, vec3(1.0, 0.36, 0.05) * 2.1, smoothstep(0.36 - fw, 0.36 + fw, h)); c = mix(c, vec3(1.0, 0.7, 0.18) * 2.8, smoothstep(0.62 - fw, 0.62 + fw, h)); c = mix(c, vec3(1.0, 0.92, 0.6) * 4.0, smoothstep(0.88 - fw, 0.88 + fw, h));
  c *= 0.88 + 0.16 * vnoise2(vQ * vec2(30.0, 44.0) + sd * 17.0);
  float sk = max(uSmoke, step(0.5, vS)); c = mix(c, vec3(0.05, 0.045, 0.05) * (0.8 + 0.4 * h), sk); a *= fade * mix(1.0, 0.55, sk) * (vS > 0.5 ? smoothstep(0.0, 0.35, uSmoke) : 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(c * a, a * 0.9);
}`;
  // wing panel in JS (same as the shader): 0 = inner quad S W F3 H, 1..3 = finger fans
  function panJS(Pt, id, u, v, out) { const s = id > 3.5 ? 8 : 0, l = id - (id > 3.5 ? 4 : 0); if (l === 0) return out.copy(Pt[s]).lerp(Pt[s + 2], u).lerp(v5.copy(Pt[s + 7]).lerp(Pt[s + 6], u), v); const a = s + 2 + l; return out.copy(Pt[a]).lerp(Pt[a + 1], v).sub(Pt[s + 2]).multiplyScalar(u).add(Pt[s + 2]); }
  function buildFlames() {
    const R = rng(2826), A = [], add = (id, u, v, sd, w, h, kind, layer) => A.push([id, u, v, sd, w, h, kind, layer]);
    for (const side of [0, 4]) {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) add(side, i / 5, j / 3, R(), 1 / 5, 1 / 3, 4, 0);
      for (let l = 1; l <= 3; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) add(side + l, i / 3, j / 2, R(), 1 / 3, 1 / 2, 4, 0);
      for (let i = 0; i < 36; i++) { const u = R(), v = R() * (1 - .17 * Math.sin(PI * u)) * .9; add(side, u, v, R(), .9 + 1.1 * R(), 1.4 + 1.8 * R(), 0, (R() - .5) * .3); }
      for (let l = 1; l <= 3; l++) for (let i = 0; i < 14; i++) { const v = R(), u = .12 + R() * (1 - .24 * Math.sin(PI * v) - .22); add(side + l, u, v, R(), .7 + .9 * R(), 1.2 + 1.6 * R(), 0, (R() - .5) * .3); }
      for (let i = 0; i < 8; i++) { const u = (i + .3 + .4 * R()) / 8; add(side, u, 1 - .17 * Math.sin(PI * u), R(), .6 + .5 * R(), 1.8 + 1.8 * R(), 1, 0); }
      for (let l = 1; l <= 3; l++) for (let i = 0; i < 5; i++) { const v = (i + .3 + .4 * R()) / 5; add(side + l, 1 - .24 * Math.sin(PI * v), v, R(), .5 + .4 * R(), 1.5 + 1.6 * R(), 1, 0); }
      for (let i = 0; i < 22; i++) { const l = Math.floor(R() * 4); if (l === 0) { const u = R(); add(side, u, 1 - .17 * Math.sin(PI * u), R(), .35 + .3 * R(), .5 + .5 * R(), 5, 0); } else { const v = R(); add(side + l, 1 - .24 * Math.sin(PI * v), v, R(), .3 + .3 * R(), .45 + .45 * R(), 5, 0); } } }
    for (let i = 0; i < 32; i++) { const u = .15 + .85 * Math.pow(R(), .7); add(0, u, 0, R(), .35 + .9 * u * (.6 + .6 * R()), .8 + 2.6 * u * (.5 + .7 * R()), 2, 0); }
    for (let i = 0; i < 44; i++) { const u = R(); add(0, u, 0, R(), .25 + .35 * R(), .45 + .75 * R() * (1 - .5 * u), 3, 0); }
    // rest areas so folded wings shrink their flames
    const Pt = [], side = (s, S) => { Pt[s] = RV('wS' + S); Pt[s + 1] = RV('wE' + S); Pt[s + 2] = RV('wW' + S); for (let i = 0; i < 4; i++) Pt[s + 3 + i] = RV('ft' + i + S); Pt[s + 7] = V3(HATT[0] * (S === '_L' ? 1 : -1), HATT[1], HATT[2]); }; side(0, '_L'); side(8, '_R');
    const n = A.length, iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n), a = V3(), b = V3();
    A.forEach((q, i) => { iA.set([q[0], q[1], q[2], q[3]], i * 4); iB.set([q[4], q[5], q[6], q[7]], i * 4); if (q[6] === 2 || q[6] === 3) { iC[i] = 1; return; } const u = q[6] === 4 ? q[1] + q[4] * .5 : q[1], v = q[6] === 4 ? q[2] + q[5] * .5 : q[2];
      panJS(Pt, q[0], u + .03, v, a); panJS(Pt, q[0], u - .03, v, b); const du = V3().subVectors(a, b); panJS(Pt, q[0], u, v + .03, a); panJS(Pt, q[0], u, v - .03, b); iC[i] = du.cross(V3().subVectors(a, b)).length(); });
    const card = new THREE.PlaneGeometry(1, 1, 2, 4).translate(0, .5, 0), g = new THREE.InstancedBufferGeometry(); g.index = card.index; g.setAttribute('position', card.attributes.position);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4)); g.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 1)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ uniforms: FU, vertexShader: FL_VS, fragmentShader: FL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'cinder-fire'; mesh.layers.enable(1); return mesh; }

  // ---------- timeline: keyed poses (absolute film time; the attack and the climax) ----------
  const kPitch = keyed([[C.ERUPT, 78], [C.CINDER_UP + .45, 74], [C.CINDER_UP + .95, 30], [C.CINDER_UP + 1.45, -24], [C.STRIKE_NEST - .45, -30], [C.STRIKE_NEST - .05, -12], [C.STRIKE_NEST + .55, 28], [C.FIGHT, 38], [C.WALL_CRASH - .45, 44], [C.WALL_CRASH, 6], [C.WALL_CRASH + .7, 32], [C.DRIVE_BACK, 36], [C.PLUNGE - .2, 46], [C.PLUNGE + .6, 72], [C.BLAST, 82],
    [C.RETURN - .15, 84], [C.RETURN + .55, 76], [C.RETURN + 1.3, 40], [C.ASH_STANDS, 40], [C.ASH_DOWN - .45, 46], [C.ASH_DOWN + .05, 30], [C.ASH_DOWN + .6, 36], [C.CINDER_FIRE, 30], [C.CINDER_FIRE + 1.7, 32], [C.ALONE + .2, 28], [C.INHALE - .2, 30], [C.BLUE - .05, 42], [C.BLUE + .45, 50], [C.PETRIFY - .3, 46], [C.PETRIFY + .14, 50]]);
  const kSpread = keyed([[C.ERUPT, .04], [C.CINDER_UP - .1, .06], [C.CINDER_UP + .5, 1], [C.CINDER_UP + 1.2, .92], [C.CINDER_UP + 1.6, .6], [C.STRIKE_NEST - .3, .62], [C.STRIKE_NEST + .1, 1], [C.BLAST, .9], [C.RETURN - .15, .04], [C.RETURN + .1, .06], [C.RETURN + .65, 1]]);
  const kRaise = keyed([[C.ERUPT, .4], [C.CINDER_UP + .3, .95], [C.CINDER_UP + 1.0, .45], [C.CINDER_UP + 1.5, .12], [C.STRIKE_NEST, .5], [C.FIGHT, .35], [C.WALL_CRASH - .3, .8], [C.WALL_CRASH + .2, .1], [C.DRIVE_BACK, .35], [C.PLUNGE, .6], [C.BLAST, 1.0],
    [C.RETURN - .15, .4], [C.RETURN + .5, 1.0], [T_LAND, .55], [C.CINDER_FIRE, .45], [C.ALONE, .3], [C.INHALE, .65], [C.BLUE + .3, .95], [C.PETRIFY, .75], [T_FRZ, .9]]);
  const kSweep = keyed([[C.CINDER_UP + 1.2, 0], [C.CINDER_UP + 1.6, .5], [C.STRIKE_NEST - .35, .5], [C.STRIKE_NEST, -.35], [C.FIGHT, -.1], [C.WALL_CRASH, -.4], [C.WALL_CRASH + .5, 0], [C.PLUNGE, -.2], [C.RETURN, 0], [C.BLUE, 0], [C.BLUE + .35, -.55], [C.PETRIFY, -.3]]);
  const kAmp = keyed([[C.ERUPT, .2], [C.CINDER_UP, .3], [C.CINDER_UP + .6, 1], [C.CINDER_UP + 1.3, .4], [C.STRIKE_NEST - .2, .4], [C.STRIKE_NEST + .2, 1.05], [C.PLUNGE, 1.1], [C.BLAST, .7], [C.RETURN + .3, .4], [C.RETURN + .8, 1], [T_LAND, .42], [C.ALONE, .3]]);
  const kTuck = keyed([[C.ERUPT, 1], [C.STRIKE_NEST, 1], [C.FIGHT, .5], [C.DRIVE_BACK, .6], [C.PLUNGE, .3], [C.RETURN, .8], [T_LAND - .3, .3]]);
  const kArm = keyed([[C.ERUPT, .2], [C.STRIKE_NEST - .3, .5], [C.FIGHT, 1], [C.DRIVE_BACK, .8], [C.PLUNGE, .4], [C.RETURN, .2], [T_LAND, .6], [C.ALONE, .35], [C.BLUE, .2], [C.BLUE + .4, .8]]);
  const kNeck = keyed([[C.ERUPT, .4], [C.CINDER_UP + .9, .3], [C.CINDER_UP + 1.4, -.25], [C.STRIKE_NEST, -.2], [C.FIGHT, .2], [C.PLUNGE, .35], [C.RETURN, .45], [T_LAND, .25], [C.CINDER_FIRE, .05], [C.ALONE, -.12], [C.INHALE, .0], [C.BLUE, .1], [C.BLUE + .4, .5], [C.PETRIFY, .4], [T_FRZ, .62]]);
  const kAim = keyed([[C.ERUPT, .3], [C.CINDER_UP + 1.0, .3], [C.CINDER_UP + 1.6, .9], [C.STRIKE_NEST + .3, .9], [C.FIGHT, .6], [C.PLUNGE, .2], [C.RETURN, .2], [T_LAND, .6], [C.CINDER_FIRE, 1], [C.ALONE, .85], [C.BLUE, .8], [C.BLUE + .3, .1]]);
  const BREATH = [[C.STRIKE_NEST - .6, C.STRIKE_NEST + .45], [C.CINDER_FIRE + .05, C.CINDER_FIRE + 1.7]];
  const breathAt = t => { let f = 0; for (const b of BREATH) f = Math.max(f, sm(b[0], b[0] + .14, t) * (1 - sm(b[1] - .18, b[1], t))); return f; };
  const standW = t => t >= C.RETURN ? sm(T_LAND - .35, T_LAND + .05, t) : 0, blueW = t => sm(C.BLUE - .03, C.BLUE + .5, t);
  const S_CIN = Score.sounds.filter(s => s.who === 'cinder'), RO = { a: 0, kind: '' };
  function roarAt(t) { RO.a = 0; RO.kind = ''; for (const s of S_CIN) { if (t < s.t - .05 || t > s.t + s.dur + .5) continue; const a = sm(s.t - .04, s.t + .14, t) * (1 - sm(s.t + s.dur - .12, s.t + s.dur + .38, t)) * (s.kind === 'snarl' ? .62 : s.kind === 'screech' ? 1.08 : 1); if (a > RO.a) { RO.a = a; RO.kind = s.kind; } } return RO; }
  const hitKind = e => e.petrify ? 'petrify' : e.who === 'ash' ? 'swat' : Math.abs(e.t - C.WALL_CRASH) < .05 ? 'crash' : e.t >= C.DRIVE_BACK - .05 && e.t < C.RETURN ? 'take' : 'strike';
  const HL = { coil: 0, strike: 0, take: 0, crash: 0 };
  function hits(t) { HL.coil = HL.strike = HL.take = HL.crash = 0; const nx = Score.next('hit', t); if (nx && hitKind(nx) === 'strike' && nx.t - t < .34) HL.coil = sm(nx.t - .34, nx.t - .03, t);
    for (const e of Score.recent('hit', t, 1.0)) { const k = hitKind(e), u = t - e.t, p = sm(0, .07, u) * Math.exp(-Math.max(0, u - .1) / .28); if (k === 'strike') HL.strike = Math.max(HL.strike, p); else if (k === 'take') HL.take = Math.max(HL.take, p); else if (k === 'crash') HL.crash = Math.max(HL.crash, p); } return HL; }
  const FLP = { b: .2, fold: 0, tw: 0, bob: 0, down: 0 };
  function flap(t) { let e = null; for (const q of Score.recent('flap_cinder', t, 1.8)) if (!e || q.t > e.t) e = q; let b = .2, fold = 0, tw = 0, bob = 0, down = 0;
    if (e) { const d = Math.max(.45, e.d || .9), u = (t - e.t) / d;
      if (u < .4) { b = lerp(.88, -.62, smoother(0, .4, u)); tw = .2 * Math.sin(PI * u / .4); down = Math.sin(PI * u / .4); }
      else if (u < 1) { b = lerp(-.62, .88, smoother(.4, 1, u)); fold = .42 * Math.sin(PI * (u - .4) / .6); tw = -.22 * Math.sin(PI * (u - .4) / .6); }
      else b = lerp(.88, .2, sm(1, 1.7, u));
      bob = .4 * Math.sin(TAU * (u - .1)) * (1 - sm(1, 1.5, u)); b = lerp(.2, b, e.v); down *= e.v; }
    const nx = Score.next('flap_cinder', t); if (nx && (!e || t > e.t + (e.d || .9)) && nx.t - t < .4) b = lerp(b, .88, sm(nx.t - .4, nx.t, t));
    FLP.b = b; FLP.fold = fold; FLP.tw = tw; FLP.bob = bob; FLP.down = down; return FLP; }

  // facing: toward the nest (attack) or Ember (climax); along the dive while diving
  const NEST_T = V3(M.NEST.x, M.NEST.y + 1, M.NEST.z), ASH_T = V3(M.ASH_CLIMAX.x, M.ASH_CLIMAX.y + 2.2, M.ASH_CLIMAX.z), BOULDER_T = V3(M.BOULDER.x, M.BOULDER.y + 1.2, M.BOULDER.z), EMBER_T = V3(M.EMBER_CLIMAX.x, M.EMBER_CLIMAX.y + .4, M.EMBER_CLIMAX.z);
  const QA = new THREE.Quaternion(), QT = new THREE.Quaternion(), QQ = new THREE.Quaternion(), QI = new THREE.Quaternion(), LUNE_T = V3(), PR = V3(), PO = V3(), PV = V3(), pa = V3(), pb = V3(), wrapA = a => a - TAU * Math.round(a / TAU);
  const vel = (t, out) => { M.cinder(t + .08, pa); M.cinder(t - .08, pb); return out.subVectors(pa, pb).multiplyScalar(1 / .16); };
  function facing(t, p) { const T = t < C.RETURN - 2 ? NEST_T : EMBER_T, yT = Math.atan2(T.x - p.x, T.z - p.z); vel(t, PV); const sp = Math.hypot(PV.x, PV.z), yV = Math.atan2(PV.x, PV.z);
    const wv = t > C.CINDER_UP + .7 && t < C.STRIKE_NEST ? sm(C.CINDER_UP + .7, C.CINDER_UP + 1.3, t) * (1 - sm(C.STRIKE_NEST - .5, C.STRIKE_NEST - .1, t)) * sm(2, 8, sp) : 0; return yT + wrapA(yV - yT) * wv; }
  function offsets(t, yaw, out) { flap(t); hits(t); const st = standW(t), bl = blueW(t), amp = kAmp(t), fx = Math.sin(yaw), fz = Math.cos(yaw), sh = bl * Score.env('taiko', t, .12) * .14;
    const f = HL.strike * 1.1 - HL.take * .9 - HL.coil * .35 - 1.15 * bl, y = FLP.bob * amp * (1 - .7 * st) - .6 * st - HL.crash * .7 + .25 * bl;
    return out.set(clamp(fx * f + sh * Math.sin(t * 41), -1.5, 1.5), clamp(y + sh * Math.sin(t * 37), -1.5, 1.5), clamp(fz * f + sh * Math.cos(t * 43), -1.5, 1.5)); }
  function bankAt(t, pitchDeg) { if (t >= C.RETURN) return 0; M.cinder(t + .2, pa); M.cinder(t - .2, pb); M.cinder(t, v6); const ax = (pa.x + pb.x - 2 * v6.x) / .04, az = (pa.z + pb.z - 2 * v6.z) / .04; vel(t, PV); const sp = Math.hypot(PV.x, PV.z) + 1e-3, lat = (ax * PV.z - az * PV.x) / sp;
    return clamp(lat * .02, -.55, .55) * (1 - sm(40, 65, Math.abs(pitchDeg))); }

  // ---------- state ----------
  let body = null, flames = null, shards = null, rocks = null, B = {}, IKD = {}, mat = null, U = null, built = false, pokeT = -1, crest = [], sim = null;
  const LV = { wing: 0, tail: 0, mouth: 0, lava: 0 }, LT = { lights: [] }, ST = { fire: 0, stone: 0, wf: 0 }, chunks = [];
  const rot = (b, x, y, z) => { ea.set(x, y, z, 'YXZ'); b.quaternion.setFromEuler(ea); };
  const LEGS = [['hlU_L', 'hlL_L', 'hlF_L', 1], ['hlU_R', 'hlL_R', 'hlF_R', -1]];
  function legIK(L, w, yaw) { const b1 = B[L[0]], b2 = B[L[1]], b3 = B[L[2]], s = L[3], I = IKD[L[0]], H = v1.setFromMatrixPosition(b1.matrixWorld), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const T = v2.set(H.x + fx * .5 + fz * s * .35, GROUND + group.position.y + .36, H.z + fz * .5 - fx * s * .35), d = v3.subVectors(T, H); let dist = d.length(); d.multiplyScalar(1 / Math.max(dist, 1e-4)); dist = clamp(dist, .3, (I.L1 + I.L2) * .995);
    const A = Math.acos(clamp((I.L1 * I.L1 + dist * dist - I.L2 * I.L2) / (2 * I.L1 * dist), -1, 1)), ax = v4.crossVectors(d, v5.set(fx, .15, fz)).normalize(), u = v5.copy(d).applyAxisAngle(ax, A);
    b1.parent.getWorldQuaternion(qa).invert(); qb.setFromUnitVectors(I.d1, u.applyQuaternion(qa)); b1.quaternion.slerp(qb, w); b1.updateMatrixWorld(true);
    const K = v4.setFromMatrixPosition(b2.matrixWorld), ld = v5.subVectors(T, K).normalize(); b1.getWorldQuaternion(qa).invert(); qb.setFromUnitVectors(I.d2, ld.applyQuaternion(qa)); b2.quaternion.slerp(qb, w); b2.updateMatrixWorld(true);
    b2.getWorldQuaternion(qa).invert(); qb.setFromUnitVectors(I.d3, v5.set(fx, -.25, fz).normalize().applyQuaternion(qa)); b3.quaternion.slerp(qb, w); b3.updateMatrixWorld(true); }

  // the whole pose at film time t (frozen after the petrify). Sets the rig transform and every bone; leaves world matrices current.
  function setPose(t) {
    const tp = Math.min(t, T_FRZ); M.cinder(tp, PR); const yaw = facing(tp, PR); offsets(tp, yaw, PO); const pd = kPitch(tp), bank = bankAt(tp, pd), st = standW(tp), bl = blueW(tp);
    const ro = roarAt(tp), br = breathAt(tp), amp = kAmp(tp), pk = pokeT >= 0 && t >= pokeT ? pulse(t, pokeT, .06, .45) : 0, scr = ro.kind === 'screech' ? ro.a : 0;
    // the swat: the wing on Ash's side sweeps forward and down on the hit
    const swW = sm(C.ASH_DOWN - .55, C.ASH_DOWN - .12, tp) * (1 - sm(C.ASH_DOWN - .12, C.ASH_DOWN, tp)), swH = sm(C.ASH_DOWN - .12, C.ASH_DOWN + .02, tp) * (1 - sm(C.ASH_DOWN + .35, C.ASH_DOWN + 1.0, tp));
    rig.position.copy(PR).add(PO); ea.set(-deg(pd), yaw + (swH - swW * .5) * .22, bank, 'YXZ'); rig.quaternion.setFromEuler(ea);
    const iq = qa.copy(rig.quaternion).invert(), swSide = v1.copy(ASH_T).sub(rig.position).applyQuaternion(iq).x > 0 ? 1 : -1;
    // head aim (rig-local), at Lune in the fight if she is on stage
    let T = tp < C.RETURN - 2 ? NEST_T : tp < C.ASH_DOWN + .35 ? ASH_T : tp < C.ALONE - .1 ? BOULDER_T : EMBER_T;
    if (tp > C.STRIKE_NEST + .3 && tp < C.PLUNGE) { const l = Stage.get('lune'); if (l && l.at) { try { T = l.at(tp, LUNE_T); } catch (e) { } } }
    const hw = v3.set(0, 2.45, 3.9).applyQuaternion(rig.quaternion).add(rig.position), dT = v2.copy(T).sub(hw), aw = clamp(kAim(tp) + br * .6 + HL.strike * .3);
    ea.set(-(deg(pd) * .3 - .08), yaw, 0, 'YXZ'); QA.setFromEuler(ea); ea.set(-clamp(Math.atan2(dT.y, Math.hypot(dT.x, dT.z)), -1.1, .9), Math.atan2(dT.x, dT.z), 0, 'YXZ'); QT.setFromEuler(ea);
    QA.slerp(QT, aw); QQ.copy(rig.quaternion).invert().multiply(QA);      // head orientation relative to the chest, shared out along the neck
    const sway = Math.sin(TAU * t / 3.1) * .05, lift = kNeck(tp) + .3 * ro.a * (ro.kind === 'roar' ? 1 : .5) + .25 * bl, co = HL.coil, sk = HL.strike, tk = HL.take, thr = bl * Score.env('taiko', tp, .14);
    const nk = (b, f, x, y, z) => { ea.set(x, y, z, 'YXZ'); b.quaternion.copy(QI).slerp(QQ, f).multiply(qb.setFromEuler(ea)); };
    nk(B.n1, .16, -lift * .45 - co * .3 + sk * .22 - tk * .25, sway, 0); nk(B.n2, .16, -lift * .3 - co * .22 + sk * .2, sway * .6 + thr * .12, 0); nk(B.n3, .16, lift * .1 + co * .42 + sk * .06, -thr * .1, 0); nk(B.n4, .16, lift * .15 + co * .32, 0, 0);
    const jawA = clamp(.1 + ro.a * .9 + br * .42 + sk * .55 + co * .2 + pk * .55 + bl * .7 + (tp > C.INHALE ? .3 * sm(C.INHALE + .3, C.BLUE, tp) : 0) + .06 * Math.sin(TAU * t * .7), 0, 1.0);
    nk(B.head, .36, lift * .5 + co * .15 - sk * .05 - scr * .4 - bl * .3 - (tp > C.PETRIFY ? .3 * sm(C.PETRIFY, T_FRZ, tp) : 0), bl * .35 * swSide + thr * .3 * Math.sin(tp * 9), Math.sin(t * 31) * .06 * ro.a + thr * .15);
    rot(B.jaw, jawA * .78 + Math.sin(t * 47) * .03 * (ro.a + bl), 0, 0);
    // spine, tail
    const breathe = Math.sin(TAU * t / 2.4) * .03; rot(B.spine, -co * .08 + breathe, 0, 0); rot(B.hips, co * .05, 0, 0);
    const tw = .5 + .8 * bl + .4 * (1 - st) * amp, tl = [-.05, -.05, .15, .3, .25, .15];
    for (let i = 1; i <= 6; i++) rot(B['t' + i], tl[i - 1] * st + (1 - st) * (.04 * Math.sin(t * 1.9 - i * .7)) + (tp < C.CINDER_UP + .5 ? -.08 : 0), (.05 + .025 * i) * tw * Math.sin(t * 2.1 - i * .75) + thr * .06 * Math.sin(i + tp * 13), 0);
    // legs (flight FK; on the plateau the hind feet are planted by IK)
    const tuck = kTuck(tp), arm = clamp(kArm(tp) + sk * .3 + bl * .2), slash = sk * .5;
    for (const s of [1, -1]) { const S = s > 0 ? '_L' : '_R';
      rot(B['flU' + S], tuck * .9 - arm * 1.2 - slash, 0, s * (.18 + .15 * arm)); rot(B['flL' + S], -tuck * 1.2 + arm * .55, 0, 0); rot(B['flH' + S], tuck * .6 - arm * .4 + slash * .5, 0, 0);
      rot(B['hlU' + S], tuck * 1.15 - .2 * (1 - tuck), 0, s * .1); rot(B['hlL' + S], tuck * .6, 0, 0); rot(B['hlF' + S], tuck * 1.1, 0, 0); }
    // wings
    const spread = kSpread(tp), raise = kRaise(tp), sweep = kSweep(tp), trem = bl * .12 * Math.sin(t * 23);
    for (const s of [1, -1]) { const S = s > 0 ? '_L' : '_R', sw = s === swSide ? 1 : 0;
      let r = raise + FLP.b * amp * (1 - .5 * st) + trem + sw * (swW * .7 - swH * 1.1) + scr * .2, w = sweep + sw * (swW * .5 - swH * 1.5), fold = clamp(1 - spread + FLP.fold * amp * (1 - sw * swH)), twst = FLP.tw * amp + sw * swH * .4;
      rot(B['wS' + S], twst, s * (w + fold * 1.0), s * (r + fold * .35)); rot(B['wE' + S], 0, -s * fold * 2.4, 0); rot(B['wW' + S], 0, s * fold * 2.8, 0);
      for (let i = 0; i < 4; i++) rot(B['f' + i + S], 0, -s * (FANG[i] - FANG[0]) * (1 - spread) * .85, 0); }
    group.updateMatrixWorld(true);
    if (st > .001) for (const L of LEGS) legIK(L, st, yaw);
    ST.fire = t > T_FRZ ? 0 : br; return tp; }

  // ---------- rubble: the frozen pose cut into chunks, a stone core in each, and pebbles; rigid-body fall precomputed ----------
  function buildShards() {
    setPose(T_FRZ); const sk = body.skeleton, nb = sk.bones.length, BM = new Float32Array(nb * 16);
    for (let i = 0; i < nb; i++) { ma.multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]); BM.set(ma.elements, i * 16); }
    const g = body.geometry, Pa = g.attributes.position.array, Na = g.attributes.normal.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, n = Pa.length / 3, fp = new Float32Array(n * 3), fn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0; const px = Pa[i * 3], py = Pa[i * 3 + 1], pz = Pa[i * 3 + 2], nx = Na[i * 3], ny = Na[i * 3 + 1], nz = Na[i * 3 + 2];
      for (let k = 0; k < 4; k++) { const w = SW[i * 4 + k]; if (w < 1e-4) continue; const o = (SI[i * 4 + k] | 0) * 16, e = BM; x += w * (e[o] * px + e[o + 4] * py + e[o + 8] * pz + e[o + 12]); y += w * (e[o + 1] * px + e[o + 5] * py + e[o + 9] * pz + e[o + 13]); z += w * (e[o + 2] * px + e[o + 6] * py + e[o + 10] * pz + e[o + 14]);
        a += w * (e[o] * nx + e[o + 4] * ny + e[o + 8] * nz); b += w * (e[o + 1] * nx + e[o + 5] * ny + e[o + 9] * nz); c += w * (e[o + 2] * nx + e[o + 6] * ny + e[o + 10] * nz); }
      const l = Math.hypot(a, b, c) || 1; fp[i * 3] = x; fp[i * 3 + 1] = y; fp[i * 3 + 2] = z; fn[i * 3] = a / l; fn[i * 3 + 1] = b / l; fn[i * 3 + 2] = c / l; }
    // seeds by farthest-point sampling, triangles to the nearest seed
    const K = 54, R = rng(123), step = Math.max(1, Math.floor(n / 5000)), sub = []; for (let i = 0; i < n; i += step) sub.push(i);
    const dmin = new Float32Array(sub.length).fill(1e9), seeds = new Float32Array(K * 3); let cur = sub[Math.floor(R() * sub.length)];
    for (let k = 0; k < K; k++) { seeds[k * 3] = fp[cur * 3]; seeds[k * 3 + 1] = fp[cur * 3 + 1]; seeds[k * 3 + 2] = fp[cur * 3 + 2]; let best = -1; for (let q = 0; q < sub.length; q++) { const i = sub[q], dx = fp[i * 3] - seeds[k * 3], dy = fp[i * 3 + 1] - seeds[k * 3 + 1], dz = fp[i * 3 + 2] - seeds[k * 3 + 2], dd = dx * dx + dy * dy + dz * dz; if (dd < dmin[q]) dmin[q] = dd; if (dmin[q] > best) { best = dmin[q]; cur = i; } } }
    const idx = g.index.array, nt = idx.length / 3, tc = new Uint8Array(nt), cnt = new Int32Array(K);
    for (let t = 0; t < nt; t++) { const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2], x = (fp[a * 3] + fp[b * 3] + fp[c * 3]) / 3, y = (fp[a * 3 + 1] + fp[b * 3 + 1] + fp[c * 3 + 1]) / 3, z = (fp[a * 3 + 2] + fp[b * 3 + 2] + fp[c * 3 + 2]) / 3; let bd = 1e9, bk = 0;
      for (let k = 0; k < K; k++) { const dx = x - seeds[k * 3], dy = y - seeds[k * 3 + 1], dz = z - seeds[k * 3 + 2], dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; bk = k; } } tc[t] = bk; cnt[bk]++; }
    const ord = new Int32Array(nt), off = new Int32Array(K + 1); for (let k = 0; k < K; k++) off[k + 1] = off[k] + cnt[k]; const fill = off.slice(0, K); for (let t = 0; t < nt; t++) ord[fill[tc[t]]++] = t;
    const COL = g.attributes.color.array, AM = g.attributes.aMat.array, AM2 = g.attributes.aMat2.array, AR = g.attributes.aRest.array, stamp = new Int32Array(n).fill(-1), remap = new Int32Array(n);
    const oP = [], oN = [], oC = [], oM = [], oM2 = [], oR = [], oS = [], oI = [], cen = [], rad = [], rin = []; let nv = 0;
    for (let k = 0; k < K; k++) { const v0 = nv; let cx = 0, cy = 0, cz = 0;
      for (let q = off[k]; q < off[k + 1]; q++) { const t = ord[q]; for (let e = 0; e < 3; e++) { const i = idx[t * 3 + e]; if (stamp[i] !== k) { stamp[i] = k; remap[i] = nv++; oP.push(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]); oN.push(fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]); oC.push(COL[i * 3], COL[i * 3 + 1], COL[i * 3 + 2]); oM.push(AM[i * 4], AM[i * 4 + 1], AM[i * 4 + 2], AM[i * 4 + 3]); oM2.push(AM2[i * 4], AM2[i * 4 + 1], AM2[i * 4 + 2], AM2[i * 4 + 3]); oR.push(AR[i * 3], AR[i * 3 + 1], AR[i * 3 + 2]); oS.push(k); cx += fp[i * 3]; cy += fp[i * 3 + 1]; cz += fp[i * 3 + 2]; } oI.push(remap[i]); } }
      const m = Math.max(1, nv - v0); cx /= m; cy /= m; cz /= m; let rs = 0, rm = 1e9; for (let i = v0; i < nv; i++) { const dd = Math.hypot(oP[i * 3] - cx, oP[i * 3 + 1] - cy, oP[i * 3 + 2] - cz); rs += dd; rm = Math.min(rm, dd); } cen.push(V3(cx, cy, cz)); rad.push(rs / m); rin.push(Math.min(rm, rs / m * .6)); }
    const sg = new THREE.BufferGeometry(), F = a => new THREE.BufferAttribute(new Float32Array(a), a === oM || a === oM2 ? 4 : 3); sg.setAttribute('position', F(oP)); sg.setAttribute('normal', F(oN)); sg.setAttribute('color', F(oC)); sg.setAttribute('aMat', F(oM)); sg.setAttribute('aMat2', F(oM2)); sg.setAttribute('aRest', F(oR));
    const si = new Float32Array(nv * 4), sw = new Float32Array(nv * 4); for (let i = 0; i < nv; i++) { si[i * 4] = oS[i]; sw[i * 4] = 1; } sg.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); sg.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); sg.setIndex(new THREE.BufferAttribute(new Uint32Array(oI), 1));
    const SU = Object.assign({}, U, { uShard: { value: 1 }, uStoneR: { value: 99 } }), smat = Mat.hook(mat, obsidianHook(SU, 'cinder-obsidian')); smat.side = THREE.DoubleSide; smat.clearcoat = 0;
    const bones = cen.map(c => { const b = new THREE.Bone(); b.position.copy(c); return b; }), sm_ = new THREE.SkinnedMesh(sg, smat); bones.forEach(b => sm_.add(b)); sm_.updateMatrixWorld(true); sm_.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
    sm_.castShadow = sm_.receiveShadow = true; sm_.frustumCulled = false; sm_.visible = false; sm_.layers.enable(1); sm_.name = 'cinder-rubble';
    // stone cores and pebbles
    const NP = 26, NB = K + NP, rg = new THREE.IcosahedronGeometry(1, 1), RA = rg.attributes.position; for (let i = 0; i < RA.count; i++) { const x = RA.getX(i), y = RA.getY(i), z = RA.getZ(i), k = 1 + .25 * NZ.n3(x * 1.7 + 3, y * 1.7, z * 1.7); RA.setXYZ(i, x * k, y * k * .8, z * k); }
    rg.deleteAttribute('normal'); rg.computeVertexNormals(); const rk = Mat.inst(Geo.idx(rg), Mat.make('stone', { color: '#7a756e', scale: 1.4 }), NB); rk.visible = false; rk.layers.enable(1); rk.name = 'cinder-cores';
    const body0 = V3().copy(rig.position), p = new Float64Array(NB * 3), vv = new Float64Array(NB * 3), q = new Float64Array(NB * 4), w = new Float64Array(NB * 3), rc = new Float64Array(NB), rgd = new Float64Array(NB), rel = new Float64Array(NB), sz = new Float32Array(NB), rq = [], land = new Float64Array(NB).fill(-1), sleep = new Uint8Array(NB);
    for (let i = 0; i < NB; i++) { let px, py, pz, dx, dz, up, spd; if (i < K) { px = cen[i].x; py = cen[i].y; pz = cen[i].z; rc[i] = rad[i] * .55; rgd[i] = Math.max(.12, rad[i] * .45); sz[i] = clamp(rin[i] * .9, .05, 1.3); dx = px - body0.x; dz = pz - body0.z; up = .2 + .6 * R(); spd = .3 + 1.3 * R(); rel[i] = .03 + .3 * R(); }
      else { const vi = Math.floor(R() * n); px = fp[vi * 3] - fn[vi * 3] * .1; py = fp[vi * 3 + 1] - fn[vi * 3 + 1] * .1; pz = fp[vi * 3 + 2] - fn[vi * 3 + 2] * .1; sz[i] = .06 + .14 * R(); rc[i] = rgd[i] = sz[i]; dx = fn[vi * 3] + R() - .5; dz = fn[vi * 3 + 2] + R() - .5; up = .5 + 2.5 * R(); spd = .6 + 3.6 * R() * R(); rel[i] = .02 + .25 * R(); }
      const l = Math.hypot(dx, dz) || 1; p[i * 3] = px; p[i * 3 + 1] = py; p[i * 3 + 2] = pz; vv[i * 3] = dx / l * spd + (R() - .5) * .5; vv[i * 3 + 1] = up; vv[i * 3 + 2] = dz / l * spd + (R() - .5) * .5; q[i * 4 + 3] = 1;
      const ax = V3(R() - .5, R() - .5, R() - .5).normalize().multiplyScalar((i < K ? .6 : 3) + 2 * R()); w[i * 3] = ax.x; w[i * 3 + 1] = ax.y; w[i * 3 + 2] = ax.z; rq.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6))); }
    const SR = 30, DUR = 4.4, NS = Math.ceil(DUR * SR) + 1, rec = new Float32Array(NB * NS * 7), H = 1 / 240, gy = GROUND, qq = new THREE.Quaternion(), qw = new THREE.Quaternion();
    for (let s = 0, f = 0; f < NS; s++) { const tt = s * H;
      if (s % 8 === 0) { for (let i = 0; i < NB; i++) { const o = (f * NB + i) * 7; rec[o] = p[i * 3]; rec[o + 1] = p[i * 3 + 1]; rec[o + 2] = p[i * 3 + 2]; rec[o + 3] = q[i * 4]; rec[o + 4] = q[i * 4 + 1]; rec[o + 5] = q[i * 4 + 2]; rec[o + 6] = q[i * 4 + 3]; } f++; }
      for (let i = 0; i < NB; i++) { if (tt < rel[i] || sleep[i]) continue; vv[i * 3 + 1] -= 9.8 * H; p[i * 3] += vv[i * 3] * H; p[i * 3 + 1] += vv[i * 3 + 1] * H; p[i * 3 + 2] += vv[i * 3 + 2] * H;
        qq.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]); qw.set(w[i * 3] * H * .5, w[i * 3 + 1] * H * .5, w[i * 3 + 2] * H * .5, 0).multiply(qq); qq.set(qq.x + qw.x, qq.y + qw.y, qq.z + qw.z, qq.w + qw.w).normalize(); q[i * 4] = qq.x; q[i * 4 + 1] = qq.y; q[i * 4 + 2] = qq.z; q[i * 4 + 3] = qq.w;
        if (p[i * 3 + 1] - rgd[i] < gy) { p[i * 3 + 1] = gy + rgd[i]; if (land[i] < 0) land[i] = T_CR + tt; if (vv[i * 3 + 1] < 0) vv[i * 3 + 1] *= -.22; const fr = Math.exp(-4 * H); vv[i * 3] *= fr; vv[i * 3 + 2] *= fr; const fw = Math.exp(-3.5 * H); w[i * 3] *= fw; w[i * 3 + 1] *= fw; w[i * 3 + 2] *= fw;
          if (Math.abs(vv[i * 3 + 1]) < .25 && Math.hypot(vv[i * 3], vv[i * 3 + 2]) < .08 && tt > rel[i] + .3) { sleep[i] = 1; vv[i * 3] = vv[i * 3 + 1] = vv[i * 3 + 2] = 0; w[i * 3] = w[i * 3 + 1] = w[i * 3 + 2] = 0; } } }
      for (let i = 0; i < NB; i++) { if (tt < rel[i]) continue; for (let j = i + 1; j < NB; j++) { if (tt < rel[j]) continue; const dx = p[j * 3] - p[i * 3], dy = p[j * 3 + 1] - p[i * 3 + 1], dz = p[j * 3 + 2] - p[i * 3 + 2], rr = rc[i] + rc[j], dd = dx * dx + dy * dy + dz * dz; if (dd >= rr * rr || dd < 1e-8) continue;
        const dl = Math.sqrt(dd), nx = dx / dl, ny = dy / dl, nz = dz / dl, mi = rc[i] ** 3, mj = rc[j] ** 3, ki = mj / (mi + mj), kj = mi / (mi + mj), pen = rr - dl; p[i * 3] -= nx * pen * ki; p[i * 3 + 1] -= ny * pen * ki; p[i * 3 + 2] -= nz * pen * ki; p[j * 3] += nx * pen * kj; p[j * 3 + 1] += ny * pen * kj; p[j * 3 + 2] += nz * pen * kj;
        const rv = (vv[j * 3] - vv[i * 3]) * nx + (vv[j * 3 + 1] - vv[i * 3 + 1]) * ny + (vv[j * 3 + 2] - vv[i * 3 + 2]) * nz; if (rv < 0) { const im = 1.1 * rv; vv[i * 3] += nx * im * ki; vv[i * 3 + 1] += ny * im * ki; vv[i * 3 + 2] += nz * im * ki; vv[j * 3] -= nx * im * kj; vv[j * 3 + 1] -= ny * im * kj; vv[j * 3 + 2] -= nz * im * kj; sleep[i] = sleep[j] = 0; } } } }
    for (let i = 0; i < NB; i++) chunks.push({ p: V3(), v: V3(), r: i < K ? rad[i] : sz[i], land: land[i], core: i < K });
    sim = { K, NB, NS, SR, rec, bones, rq, sz }; shards = sm_; rocks = rk; group.add(sm_, rk); }
  const sq_ = new THREE.Quaternion(), sq2 = new THREE.Quaternion(), sp_ = V3(), ss_ = V3();
  function updateShards(t) { const S = sim, f = clamp((t - T_CR) * S.SR, 0, S.NS - 1.001), i0 = Math.floor(f), k = f - i0, rec = S.rec;
    for (let i = 0; i < S.NB; i++) { const a = (i0 * S.NB + i) * 7, b = a + S.NB * 7; sp_.set(lerp(rec[a], rec[b], k), lerp(rec[a + 1], rec[b + 1], k), lerp(rec[a + 2], rec[b + 2], k)); sq_.set(rec[a + 3], rec[a + 4], rec[a + 5], rec[a + 6]).slerp(sq2.set(rec[b + 3], rec[b + 4], rec[b + 5], rec[b + 6]), k);
      const c = chunks[i]; c.v.set(rec[b] - rec[a], rec[b + 1] - rec[a + 1], rec[b + 2] - rec[a + 2]).multiplyScalar(S.SR); c.p.copy(sp_).add(group.position);
      if (i < S.K) { S.bones[i].position.copy(sp_); S.bones[i].quaternion.copy(sq_); }
      const s = S.sz[i]; ma.compose(sp_, sq2.copy(sq_).multiply(S.rq[i]), ss_.set(s, s, s)); rocks.setMatrixAt(i, ma); }
    rocks.instanceMatrix.needsUpdate = true; shards.updateMatrixWorld(true); }

  // ---------- build ----------
  function build() {
    const t0 = performance.now(), rg = Sculpt.rig(D), BI = n => Math.max(0, rg.names.indexOf(n)); rg.list.forEach(b => B[b.name] = b);
    const bg = Sculpt.build({ parts: bodyParts(), bb: [-1.55, -3.7, -9.1, 1.55, 3.0, 4.45], res: +(Q.get('cinres') || 200), rig: rg, wblend: .14 });
    Geo.attr(bg, 'aMat', 4, (i, x, y, z) => [.75 + .5 * sm(.2, -.8, y) + .4 * throatM(x, y, z), 0, 0, 1.82]); Geo.attr(bg, 'aMat2', 4, (i, x, y, z) => [throatM(x, y, z), 1, 0, 0]); plates(bg, 1.82, .03, () => 1);
    const hg = Sculpt.build({ parts: headParts(), bb: [O[0] - .56, O[1] - .62, O[2] - .64, O[0] + .56, O[1] + .6, O[2] + 2.08], res: +(Q.get('cinhres') || 105), rig: rg, wblend: .08 });
    const em = (x, y, z) => 1 - sm(.003, .014, eyeSD(x, y, z)); Geo.attr(hg, 'aMat', 4, (i, x, y, z) => { const e = em(x, y, z), m = mouthM(x, y, z); return [(1 - e) * (1 - m), e, m * lerp(1, .3, clamp((z - O[2]) / 1.9)), 3.85]; }); Geo.attr(hg, 'aMat2', 4, (i, x, y, z) => [.6 * sm(-.15, -.4, y - O[1]) * (1 - sm(.6, 1.2, z - O[2])), .8, 1, 0]);
    plates(hg, 3.85, .014, (x, y, z) => (1 - em(x, y, z)) * (1 - mouthM(x, y, z)));
    const geo = Geo.merge([bg, hg, ...hardParts(BI)]);
    U = { uLava: { value: 1 }, uStoneR: { value: -1 }, uHeat: { value: 0 }, uEye: { value: 1 }, uThroat: { value: .2 }, uShard: { value: 0 }, uChest: { value: V3(0, .1, .2) } };
    mat = Mat.make('ceramic', { vcol: true, rough: .2, coat: .8, coatRough: .06, bump: .0016, scale: 2.4 }); const bm = Mat.hook(mat, obsidianHook(U, 'cinder-obsidian'));
    body = Sculpt.skinned(geo, bm, rg); body.name = 'cinder-body'; body.layers.enable(1); rig.add(body); rig.updateMatrixWorld(true);
    for (const L of LEGS) IKD[L[0]] = { L1: RV(L[1]).distanceTo(RV(L[0])), L2: RV(L[2]).distanceTo(RV(L[1])), d1: RV(L[1]).sub(RV(L[0])).normalize(), d2: RV(L[2]).sub(RV(L[1])).normalize(), d3: V3(0, -.22, .7).normalize() };
    // crest points (bone, local point, local normal) head -> tail
    const nn = V3(0, .79, -.61), cp = [['n4', V3(0, 2.1, 3.38).addScaledVector(nn, .5)], ['n3', V3(0, 1.62, 2.82).addScaledVector(nn, .55)], ['n2', V3(0, 1.05, 2.15).addScaledVector(nn, .62)], ['n1', V3(0, .5, 1.4).addScaledVector(nn, .72)], ['root', V3(0, 1.22, .3)], ['spine', V3(0, 1.08, -1.3)], ['hips', V3(0, .9, -2.6)], ['t1', V3(0, .5, -3.7)], ['t2', V3(0, .27, -4.7)], ['t3', V3(0, .06, -5.7)], ['t4', V3(0, -.14, -6.6)], ['t5', V3(0, -.3, -7.45)]];
    crest = cp.map(([b, p], i) => ({ b: B[b], p: p.sub(RV(b)), n: i < 4 ? nn.clone() : V3(0, 1, 0) }));
    flames = buildFlames(); group.add(flames);
    buildShards(); G.cinderBuild = { ms: Math.round(performance.now() - t0), tris: geo.index.count / 3, verts: geo.attributes.position.count, shardTris: shards.geometry.index.count / 3 };
    // lights that really light the set: two per wing, the tail flame, the mouth, the lava in the chest
    const L = (r, c, k) => Lan.add({ x: 0, y: -99, z: 0, r, color: c, gain: () => LV[k] });
    LT.lights = [L(11, [1, .46, .14], 'wing'), L(11, [1, .46, .14], 'wing'), L(11, [1, .46, .14], 'wing'), L(11, [1, .46, .14], 'wing'), L(6, [1, .5, .15], 'tail'), L(9, [1, .55, .2], 'mouth'), L(6, [1, .3, .06], 'lava')];
    api.pick.push(body); built = true; return group; }

  // ---------- per frame ----------
  const wp = (i, b) => FU.uP.value[i].setFromMatrixPosition(b.matrixWorld).sub(group.position), mp = V3(), HIP_L = V3(HATT[0] - RP('hips')[0], HATT[1] - RP('hips')[1], HATT[2] - RP('hips')[2]), HIP_R = HIP_L.clone().setX(-HATT[0] - RP('hips')[0]);
  const lpos = (k, x, y, z) => { const id = LT.lights[k]; if (id !== undefined && id >= 0) Lan.pos(id, x, y, z); };
  function update(ctx) {
    const t = ctx.t; if (!built) return;
    if (ME && !PLACE) { M.cinder(t, v1); group.position.set(-v1.x, -v1.y + 6, -v1.z); } else group.position.set(0, 0, 0);
    const vis = shown(t), rub = t >= T_CR; group.visible = vis; LV.wing = LV.tail = LV.mouth = LV.lava = 0; ST.wf = 0; ST.fire = 0;
    ST.stone = clamp((t - T_ST0) / (T_ST1 - T_ST0)); if (!vis) { for (let k = 0; k < LT.lights.length; k++) lpos(k, 0, -99, 0); return; }
    const tp = setPose(t), ro = roarAt(tp), br = breathAt(tp), bl = blueW(tp), pk = pokeT >= 0 && t >= pokeT ? pulse(t, pokeT, .06, .45) : 0;
    body.visible = !rub; shards.visible = rocks.visible = rub; if (rub) updateShards(t);
    // fire levels
    const ign = tp < C.RETURN - 2 ? sm(C.CINDER_UP - .15, C.CINDER_UP + .45, tp) : sm(C.RETURN + .05, C.RETURN + .6, tp);
    const gut = 1 - .62 * sm(C.BLUE, C.PETRIFY - .2, t) + .2 * Math.sin(t * 17.3) * Math.sin(t * 5.1) * sm(C.BLUE, C.BLUE + .5, t) * (1 - sm(C.PETRIFY - .4, C.PETRIFY, t)), die = 1 - sm(C.PETRIFY, C.PETRIFY + .45, t);
    const flare = .35 * ro.a + .6 * pk + .3 * br, wf = clamp((.25 + .75 * ign) * gut * die + flare * die, 0, 1.6); ST.wf = Math.min(1, wf);
    const smoke = sm(C.PETRIFY + .05, C.PETRIFY + .45, t) * (1 - sm(T_CR + 1.4, T_CR + 2.6, t));
    FU.uFire.value = wf; FU.uTailF.value = clamp(gut * die + flare * die, 0, 1.5); FU.uIgn.value = ign; FU.uFlare.value = flare; FU.uDown.value = FLP.down * kAmp(tp); FU.uSmoke.value = smoke; FU.uSmokeT.value = Math.max(0, t - C.PETRIFY - .05);
    flames.visible = wf > .01 || smoke > .01; if (t > T_FRZ) FU.uVel.value.set(0, 0, 0); else vel(tp, FU.uVel.value);
    FU.uCam.value.copy(ctx.cam.position).sub(group.position);
    for (const [s, S] of [[0, '_L'], [8, '_R']]) { wp(s, B['wS' + S]); wp(s + 1, B['wE' + S]); wp(s + 2, B['wW' + S]); for (let i = 0; i < 4; i++) wp(s + 3 + i, B['ft' + i + S]); FU.uP.value[s + 7].copy(s ? HIP_R : HIP_L).applyMatrix4(B.hips.matrixWorld).sub(group.position); }
    ['t4', 't5', 't6', 'tip'].forEach((n, i) => FU.uTl.value[i].setFromMatrixPosition(B[n].matrixWorld).sub(group.position));
    FU.uTl.value[4].copy(FU.uTl.value[3]).sub(FU.uTl.value[2]).normalize().multiplyScalar(1.3).add(FU.uTl.value[3]);
    crest.forEach((c, i) => { FU.uCr.value[i].copy(c.p).applyMatrix4(c.b.matrixWorld).sub(group.position); FU.uCrN.value[i].copy(c.n).transformDirection(c.b.matrixWorld); });
    // body uniforms
    const inh = tp > C.ALONE ? sm(C.INHALE - .3, C.BLUE, tp) * (1 - bl) : 0, throat = Math.max(ro.a * .95, br * 1.3, inh, pk * .6, .14 + .05 * Math.sin(TAU * t / 1.9));
    const sr = t < T_ST0 ? -1 : 15 * smoother(T_ST0, T_ST1, t);
    U.uLava.value = (.4 + 1.3 * Score.env('lava', tp, .3) + .3 * ro.a + .25 * Math.sin(TAU * t / 2.3) * .5) * (1 - .55 * bl); U.uThroat.value = throat; U.uStoneR.value = sr; body.material.clearcoat = Math.max(.03, .8 * (1 - ST.stone));
    U.uEye.value = (1 + .5 * ro.a + .3 * br + .4 * bl) * (1 - sm(T_ST0 + .18, T_ST0 + .34, t));
    U.uHeat.value = tp < C.RETURN - 2 ? sm(C.ERUPT, C.ERUPT + .3, tp) * (1 - sm(C.CINDER_UP + .3, C.CINDER_UP + 2.8, tp)) : 1 - sm(C.RETURN + .2, C.RETURN + 2.0, tp);
    // lights
    LV.wing = wf * 1.3 * die; LV.tail = FU.uTailF.value; LV.mouth = (throat * .9 + br * 2.2) * (1 - ST.stone); LV.lava = U.uLava.value * .35 * (1 - ST.stone);
    const P16 = FU.uP.value, lp = [[0, .5, .45], [2, .55, .5], [4, .5, .45], [6, .55, .5]];
    lp.forEach((q, i) => { panJS(P16, q[0], q[1], q[2], mp).add(group.position); lpos(i, mp.x, mp.y, mp.z); });
    mp.copy(FU.uTl.value[3]).add(group.position); lpos(4, mp.x, mp.y, mp.z); api.mouth(mp); lpos(5, mp.x, mp.y, mp.z); mp.setFromMatrixPosition(B.root.matrixWorld); lpos(6, mp.x, mp.y - .8, mp.z);
    ST.fire = br; }

  // ---------- API ----------
  const api = { group, pick: [],
    at(t, out) { out = out || V3(); M.cinder(t, out); const tp = Math.min(t, T_FRZ); return out.add(offsets(tp, facing(tp, out), v6)); },
    head(out) { return (out || V3()).set(0, .1, .6).applyMatrix4(B.head.matrixWorld); },
    mouth(out) { out = out || V3(); out.set(0, -.12, 1.95).applyMatrix4(B.head.matrixWorld); return out.add(v6.set(0, -.22, 1.9).add(v5.fromArray(O)).sub(v4.fromArray(RP('jaw'))).applyMatrix4(B.jaw.matrixWorld)).multiplyScalar(.5); },
    dir(out) { out = out || V3(); const j = B.jaw.rotation.x * .2; return out.set(0, -Math.sin(j), Math.cos(j)).transformDirection(B.head.matrixWorld); },
    fire: () => ST.fire, stone: () => ST.stone, level: () => ST.wf, chunks,
    emitters(out) { let k = 0; const put = (x, y, z) => { if (!out[k]) out[k] = V3(); out[k++].set(x, y, z); };
      if (group.visible && ST.wf > .05) { const P16 = FU.uP.value, g = group.position; for (const s of [0, 8]) { for (let i = 3; i < 7; i++) put(P16[s + i].x + g.x, P16[s + i].y + g.y, P16[s + i].z + g.z); panJS(P16, s ? 4 : 0, .5, .9, mp); put(mp.x + g.x, mp.y + g.y, mp.z + g.z); panJS(P16, s ? 6 : 2, .9, .5, mp); put(mp.x + g.x, mp.y + g.y, mp.z + g.z); }
        for (const i of [3, 4]) put(FU.uTl.value[i].x + g.x, FU.uTl.value[i].y + g.y, FU.uTl.value[i].z + g.z); for (const i of [2, 6]) put(FU.uCr.value[i].x + g.x, FU.uCr.value[i].y + g.y, FU.uCr.value[i].z + g.z); }
      out.length = k; return out; } };
  Stage.actor('cinder', api);
  Assets.add('cinder', { order: 28, build, update, pick: api.pick, poke(hit, ctx) { pokeT = ctx.t; return 'roar'; } });
  return api;
})();
