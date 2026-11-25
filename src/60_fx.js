'use strict';
// ---- FX: everything that burns, smokes, sparks, splashes and paints -------------------------------------------------------------------------
// Handmade like the puppets: fire = layered cut-cellophane flame tongues that glow and are re-cut on twos (12 fps); smoke = cotton-wool wisps;
// sparks = glitter; the loong = blue sumi-e wash and dry-brush strokes on a 3-D ribbon body that swims along its own path.
// Nearly everything is a pure function of film time: each effect walks its Score events / emission slots and rebuilds its particles every
// frame, so a seek is exact. The only state: 2-4 s pose histories of the fire mouths and the cigarette tip (rebuilt on ctx.reset) and pokes.
//   FX.fire(who)   flame intensity now, 'cinder' | 'ember' | 'ash' (0..~1.2), for sound and lights        FX.ink   the loong group
//   FX.burst(p)    a glitter burst at world point p, now (what a poke on the sky does)
// Reads actors only through Stage.get(name): at(t,o) head(o) mouth(o) dir(o) fire(); ash cig(o) cigLit(); cinder stone() emitters(); pair dissolve() points().
// Anything missing falls back to Stage.M marks and the CUE sheet, so this file runs alone (studio: &fxtest adds stand-in actors).
const FX = (() => {
  const C = Score.CUE, M = Stage.M, UP = V3(0, 1, 0);
  const hh = (a, b) => fract(Math.sin(a * 12.9898 + b * 78.233 + .5) * 43758.5453);
  const cr1 = (a, b, c, d, t) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  let TT = 0, WX = 0, WZ = 0; const camP = V3();
  const VENT = V3(M.VOLCANO.x, M.LAVA_Y + 1, M.VOLCANO.z);
  const win = (t, a, b, fi, fo) => sm(a - fi, a, t) * (1 - sm(b, b + fo, t));      // 0 before a-fi, 1 on [a, b], 0 after b+fo

  // ---------- fallbacks: where things are when no puppet answers ----------------------------------------------------------------------------
  const tA1 = V3(), tA2 = V3(), tC0 = V3(), tD1 = V3(), tD2 = V3(), tD3 = V3(), tM1 = V3(), tG1 = V3();
  function fbAt(who, t, out) {
    if (who === 'cinder') return M.cinder(t, out);
    if (who === 'ember') {
      if (t >= C.FLY) return M.heart2('ember', t, out);
      if (t >= C.DAWN) return out.lerpVectors(M.EMBER_CLIMAX, tC0.set(M.ASH_THROWN.x + 1.5, M.ASH_THROWN.y, M.ASH_THROWN.z + 1.2), sm(C.DAWN, C.WAKE, t));
      if (t >= C.RETURN) return out.copy(M.EMBER_CLIMAX);
      if (t >= C.TRAIN) return out.copy(M.LEDGE);
      if (t >= C.CAVE) return out.copy(M.ASH_SEAT).addScaledVector(M.CAVE_DIR, t >= C.WING ? .9 : 1.9);
      return out.copy(M.NEST); }
    if (t >= C.FLY) return M.heart2('ash', t, out);
    if (t >= C.ASH_DOWN) return out.copy(M.ASH_THROWN);
    if (t >= C.RETURN) return out.copy(M.ASH_CLIMAX);
    return out.copy(M.ASH_SEAT); }
  function tangentH(who, t, out) { M.heart2(who, t + .04, tA1); M.heart2(who, t - .04, tA2); out.subVectors(tA1, tA2); if (out.lengthSq() < 1e-8) out.set(1, 0, 0); return out.normalize(); }
  function fbDir(who, t, out) {
    if (who === 'cinder') { fbAt('cinder', t, tD1); if (t < C.RETURN - 2) tD2.copy(M.NEST); else tD2.set(M.EMBER_CLIMAX.x, M.EMBER_CLIMAX.y + .4, M.EMBER_CLIMAX.z); return out.subVectors(tD2, tD1).normalize(); }
    if (who === 'ember') {
      if (t >= C.FLY) return tangentH('ember', t, out);
      if (t >= C.RETURN && t < C.DAWN) { fbMouth('cinder', t, tD3); fbAt('ember', t, tD1); tD1.y += .36; return out.subVectors(tD3, tD1).normalize(); }
      if (t >= C.CAVE && t < C.TRAIN) return out.copy(M.CAVE_DIR).negate();
      return out.set(1, 0, 0); }
    if (t >= C.FLY) return tangentH('ash', t, out);
    if (t >= C.DAWN) return out.set(.3, .85, .45).normalize();
    if (t >= C.RETURN) { M.cinder(t, tD1); tD1.sub(M.ASH_CLIMAX); tD1.y = 2; return out.copy(tD1).normalize(); }
    return out.copy(M.CAVE_DIR); }
  function fbMouth(who, t, out) { fbAt(who, t, out); fbDir(who, t, tM1);
    if (who === 'cinder') return out.addScaledVector(tM1, 7.5).addScaledVector(UP, 1);
    if (who === 'ember') return out.addScaledVector(tM1, .16).addScaledVector(UP, .36);
    return out.addScaledVector(tM1, .75).addScaledVector(UP, t >= C.FLY ? .5 : 2.9); }
  function fbCig(t, out) { fbMouth('ash', t, out); fbDir('ash', t, tG1); tA2.crossVectors(tG1, UP).normalize(); return out.addScaledVector(tG1, .32).addScaledVector(tA2, .16).addScaledVector(UP, -.06); }
  const fbLit = t => t < C.CAVE - 1 ? 0 : t < C.WHEEZE - 1.2 ? 1 : t < C.SNEEZE_LIGHT + .5 ? 0 : 1 - sm(C.STUB, C.STUB + 1.2, t);
  const fbStone = t => sm(C.PETRIFY, C.PETRIFY + .9, t), fbDiss = t => sm(C.BLAST, C.BLAST + 2.6, t);
  const FB_FIRE = {
    cinder: keyedLin([[0, 0], [C.STRIKE_NEST - .3, 0], [C.STRIKE_NEST - .05, 1], [C.STRIKE_NEST + 1, 1], [C.STRIKE_NEST + 1.4, 0], [45, 0], [45.2, .85], [45.9, .85], [46.2, 0], [49, 0], [49.2, 1], [50, 1], [50.3, 0],
      [C.CINDER_FIRE - .15, 0], [C.CINDER_FIRE + .05, 1], [C.ALONE - .15, 1], [C.ALONE + .05, 0], [C.BLUE - .25, 0], [C.BLUE + .05, 1], [C.LOONG + 1, .9], [C.PETRIFY - .4, .6], [C.PETRIFY, 0]]),
    ember: keyedLin([[0, 0], [C.BLUE - .12, 0], [C.BLUE + .1, 1], [C.CRUMBLE - .3, 1], [C.CRUMBLE + .2, 0]]),
    ash: keyedLin([[0, 0], [C.ASH_FIRE - .1, 0], [C.ASH_FIRE + .08, .9], [C.ASH_FIRE + 1.5, .85], [C.ASH_FIRE + 2, 0]]) };
  const EM = Array.from({ length: 20 }, () => V3()), eT = V3(), eD = V3(), eS = V3();
  function fbEmit(t) { M.cinder(t, eT); fbDir('cinder', t, eD); eS.crossVectors(eD, UP).normalize(); const fl = Math.sin(TAU * t / .9);
    for (let j = 0; j < 20; j++) { const sg = j < 10 ? -1 : 1, k = (j % 10) / 9; EM[j].copy(eT).addScaledVector(eS, sg * (3 + 10 * k)).addScaledVector(eD, -2 - 3 * k * k).addScaledVector(UP, 2 + fl * 3 * k + (j % 2) * 1.2); } return EM; }
  const PP = []; for (let d = 0; d < 2; d++) { const c = d ? V3(97, 79, -143) : V3(82, 76, -138), sg = d ? -1 : 1; for (let i = 0; i < 16; i++) { const u = i / 15; PP.push(i < 8 ? V3(c.x + sg * (u * 2 - .5) * 7, c.y + Math.sin(u * 7) * .8, c.z + u * 3) : V3(c.x + sg * (u - .5) * 3, c.y + 1 + Math.sin(u * PI) * 4, c.z + (u - .5) * 12)); } }

  // ---------- actor access: Stage.get first, marks second ---------------------------------------------------------------------------------------
  const ok3 = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  function ask(who, fn, out, t, fb) { const a = Stage.get(who); if (a && typeof a[fn] === 'function') { try { out.set(NaN, NaN, NaN); const r = fn === 'at' ? a.at(t, out) : a[fn](out); if (r && r.isVector3 && r !== out) out.copy(r); if (ok3(out)) return out; } catch (e) { } } return fb(who, t, out); }
  const aAt = (w, t, o) => ask(w, 'at', o, t, fbAt), aMouth = (w, t, o) => ask(w, 'mouth', o, t, fbMouth);
  const aHead = (w, t, o) => ask(w, 'head', o, t, fbMouth), aDir = (w, t, o) => { ask(w, 'dir', o, t, fbDir); if (o.lengthSq() < 1e-8) o.set(1, 0, 0); return o.normalize(); };
  const aCig = (t, o) => ask('ash', 'cig', o, t, (w, tt, oo) => fbCig(tt, oo));
  function num(who, fn, fb) { const a = Stage.get(who); if (a && typeof a[fn] === 'function') { try { const v = +a[fn](); if (Number.isFinite(v)) return v; } catch (e) { } } return fb; }
  const aFire = (w, t) => clamp(num(w, 'fire', NaN), 0, 1.5) || (Stage.get(w) && typeof Stage.get(w).fire === 'function' ? 0 : FB_FIRE[w](t));
  const LB = {}, real = n => { const a = Stage.get(n); return !!a && !a._fx; };
  function aList(who, fn) { const a = Stage.get(who); if (a && typeof a[fn] === 'function') { try { const buf = LB[who + fn] || (LB[who + fn] = []), L = a[fn](buf); return L && typeof L.length === 'number' ? L : buf; } catch (e) { } } return null; }   // a puppet's empty list means 'none now'

  // ---------- pose histories (the only state): mouth xyz, dir xyz, fire, extra -------------------------------------------------------------
  const Hist = n => ({ n, t: new Float64Array(n), d: new Float32Array(n * 8), k: 0, c: 0 });
  function hpush(H, t, a, b, c, d, e, f, g, h) { if (H.c) { const ln = (H.k - 1 + H.n) % H.n; if (t < H.t[ln] - 1e-6) H.c = 0; else if (t - H.t[ln] < 1e-5) { H.k = ln; H.c--; } }
    const i = H.k, D = H.d, o = i * 8; H.t[i] = t; D[o] = a; D[o + 1] = b; D[o + 2] = c; D[o + 3] = d; D[o + 4] = e; D[o + 5] = f; D[o + 6] = g; D[o + 7] = h; H.k = (i + 1) % H.n; if (H.c < H.n) H.c++; }
  const SMP = new Float32Array(8);
  function hat(H, tau, j0) { const n = H.n, c = H.c, D = H.d; if (!c) return 0; let j = j0 || 0; while (j < c - 1 && H.t[(H.k - 1 - j + 2 * n) % n] > tau) j++;
    const i1 = (H.k - 1 - j + 2 * n) % n, o1 = i1 * 8; if (j === 0 || H.t[i1] >= tau) { for (let q = 0; q < 8; q++) SMP[q] = D[o1 + q]; return j; }
    const i2 = (H.k - j + 2 * n) % n, o2 = i2 * 8, u = clamp((tau - H.t[i1]) / Math.max(1e-6, H.t[i2] - H.t[i1])); for (let q = 0; q < 8; q++) SMP[q] = D[o1 + q] + (D[o2 + q] - D[o1 + q]) * u; return j; }
  const ST = { cinder: { m: V3(), d: V3(), f: 0, p: 0, H: Hist(150) }, ember: { m: V3(), d: V3(), f: 0, p: 0, H: Hist(150) }, ash: { m: V3(), d: V3(), f: 0, p: 0, H: Hist(150) } };
  const CIG = { p: V3(), lit: 0, H: Hist(260) }; let pokes = [];
  function resetState() { for (const w in ST) ST[w].H.c = 0; CIG.H.c = 0; pokes = []; }

  // ---------- shaders -------------------------------------------------------------------------------------------------------------------
  const U = { uTime: LU.uTime, uPrint: LU.uPrint, tNz: LU.tNz, uCap: { value: 1 }, uFogD: { value: .002 }, uFogC: { value: V3(.6, .7, .8) }, uAmb: { value: V3(.3, .35, .4) }, uSun: { value: V3(1.4, 1.3, 1.1) }, uSunV: { value: V3(0, 1, 0) } };
  const QUAD_VS_GLOW = /* glsl */`attribute vec4 aP, aC, aV; attribute vec2 aX; varying vec2 vQ; varying vec4 vC; varying vec3 vX; varying float vD;
    void main(){ vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); float dz = max(-mv.z, 0.05), s = min(aP.w, dz * 0.1); vec2 vd = (mat3(viewMatrix) * aV.xyz).xy; float vl = length(vd);
      vec2 ax = vl > 1e-5 ? vd / vl : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x); float st = 1.0 + min(vl * aX.y / max(s, 1e-3), 8.0);
      vQ = position.xy; mv.xy += (ax * position.x * st + ay * position.y) * s; vC = aC; vX = vec3(aX.x, aV.w, st); vD = dz; gl_Position = projectionMatrix * mv; }`;
  const GLOW_FS = /* glsl */`uniform float uTime, uCap, uPrint, uFogD; varying vec2 vQ; varying vec4 vC; varying vec3 vX; varying float vD;
    void main(){ float r2 = dot(vQ, vQ); if (r2 > 1.0) discard; float sh = vX.y, a;
      if (sh < 0.5) { float an = vX.x * 6.2831 + uTime * (vX.x - 0.5) * 4.0, cs = cos(an), sn = sin(an); vec2 q = vec2(cs * vQ.x - sn * vQ.y, sn * vQ.x + cs * vQ.y);
        float spk = max(exp(-abs(q.x) * 16.0) * max(1.0 - abs(q.y), 0.0), exp(-abs(q.y) * 16.0) * max(1.0 - abs(q.x), 0.0)); a = exp(-r2 * 18.0) + spk * spk * 0.9 + exp(-r2 * 4.0) * 0.12; }
      else if (sh < 1.5) a = exp(-r2 * 9.0) + exp(-r2 * 60.0) * 0.8;
      else if (sh < 2.5) a = exp(-vQ.y * vQ.y * 9.0) * (1.0 - smoothstep(0.2, 1.0, abs(vQ.x))) * 1.3;
      else a = exp(-r2 * 3.5) * 0.9;
      a *= vC.a * uCap * exp(-vD * uFogD) * (1.0 - uPrint); if (a < 0.002) discard; gl_FragColor = vec4(vC.rgb * a, 1.0); }`;
  // cotton smoke (0), ash flake (1), ink wisp (2), dust (3). premultiplied, sorted back to front
  const SMOKE_VS = /* glsl */`attribute vec4 aP, aC, aS; varying vec2 vQ; varying vec4 vC, vS; varying float vD;
    void main(){ vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); float an = aS.z, cs = cos(an), sn = sin(an); vec2 q = position.xy; vec2 o = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) * aP.w;
      if (aS.y > 0.5 && aS.y < 1.5) o.y *= 0.5; mv.xy += o; vQ = q; vC = aC; vS = aS; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SMOKE_FS = /* glsl */`uniform sampler2D tNz; uniform vec3 uAmb, uSun, uSunV, uFogC; uniform float uFogD, uPrint; varying vec2 vQ; varying vec4 vC, vS; varying float vD;
    void main(){ float r2 = dot(vQ, vQ); if (r2 > 1.0) discard; float sh = vS.y, sd = vS.x; vec4 n = texture2D(tNz, vQ * 0.3 + vec2(sd * 0.37, sd * 0.61)), m = texture2D(tNz, vQ * 0.7 + vec2(sd * 0.11, sd * 0.83)); float a; vec3 c; float r = sqrt(r2);
      if (sh < 0.5 || sh > 2.5) { float rr = r + (n.r - 0.5) * 0.75 + (m.r - 0.5) * 0.3; a = 1.0 - smoothstep(0.46, 0.76, rr); vec3 N = normalize(vec3(vQ, 0.8 - rr * 0.5)); float l = clamp(dot(N, uSunV) * 0.55 + 0.45, 0.0, 1.0);
        c = vC.rgb * (uAmb + uSun * l) * (0.78 + 0.34 * n.r) * (0.9 + 0.2 * m.a); c += vec3(1.0, 0.36, 0.08) * vS.w * (0.5 + 0.6 * n.r) * (1.0 - 0.45 * vQ.y); if (sh > 2.5) a *= 0.85; }
      else if (sh < 1.5) { float rr = max(abs(vQ.x), abs(vQ.y)) + (n.r - 0.5) * 0.7; a = 1.0 - smoothstep(0.5, 0.62, rr); c = vC.rgb * (uAmb + uSun * 0.5) * (0.85 + 0.3 * m.g); }
      else { float rr = r + (n.r - 0.5) * 0.8 + (m.b - 0.5) * 0.3; a = 1.0 - smoothstep(0.5, 0.62, rr); float rim = smoothstep(0.3, 0.58, rr); c = mix(vC.rgb, vC.rgb * 0.35, rim * 0.85) * (0.8 + 0.35 * m.g); a *= 0.7 + 0.3 * rim; }
      if (sh < 1.5 || sh > 2.5) { c = mix(c, uFogC, 1.0 - exp(-vD * uFogD)); a *= 1.0 - uPrint; }
      a *= vC.a; if (a < 0.004) discard; gl_FragColor = vec4(c * a, a); }`;
  // flame tongues: x along the flow (-1 base .. +1 tip), three cut layers (outer, mid, core), re-cut every 1/12 s
  const FLAME_VS = /* glsl */`attribute vec4 aP, aD, aC; varying vec2 vQ; varying vec4 vC;
    void main(){ vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); vec3 dv = mat3(viewMatrix) * aD.xyz; float l = length(dv.xy), pl = l / max(length(dv), 1e-4);
      vec2 ax = l > 1e-5 ? dv.xy / l : vec2(0.0, 1.0), ay = vec2(-ax.y, ax.x); float asp = mix(1.0, aD.w, pl), s = aP.w * 0.5;
      vQ = position.xy; mv.xy += ax * position.x * s * asp + ay * position.y * s; vC = aC; gl_Position = projectionMatrix * mv; }`;
  const FLAME_FS = /* glsl */`uniform float uTime, uPrint; varying vec2 vQ; varying vec4 vC;
    float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
    void main(){ float pal = vC.x, age = vC.y, sd = vC.z; float u = vQ.x * 0.5 + 0.5, v = vQ.y;
      float st = floor(uTime * 12.0 + sd * 3.0), ph = h11(sd * 1.13 + st) * 6.2831, ph2 = h11(sd * 0.71 + st * 1.3 + 4.0) * 6.2831;
      float w = 0.92 * pow(max(1.0 - u, 0.0), 0.75) * sqrt(smoothstep(0.0, 0.3, u + 0.02)) * (1.0 - 0.25 * age);
      float cy = (sin(u * 4.0 + ph) * 0.22 + sin(u * 9.0 + ph2) * 0.07) * u;
      float sw = v > cy ? fract(u * 3.2 + ph * 0.16) : fract(u * 2.7 + ph2 * 0.16); w += sw * sw * 0.34 * u * (1.0 - u * 0.6);
      float d = abs(v - cy) - w, aa = fwidth(d) + 1e-3;
      float o1 = 1.0 - smoothstep(-aa, aa, d), o2 = 1.0 - smoothstep(-aa, aa, d + w * (0.3 + 0.25 * age) + 0.03), o3 = (1.0 - smoothstep(-aa, aa, d + w * (0.58 + 0.3 * age) + 0.05)) * (1.0 - smoothstep(0.55, 0.8, u + age * 0.3));
      if (o1 < 0.01) discard;
      vec3 c1, c2, c3; if (pal < 0.5) { c1 = vec3(1.55, 0.26, 0.05); c2 = vec3(2.5, 0.92, 0.12); c3 = vec3(3.1, 2.4, 0.85); } else if (pal < 1.5) { c1 = vec3(0.06, 0.2, 2.4); c2 = vec3(0.3, 0.95, 3.0); c3 = vec3(2.1, 2.7, 3.2); } else { c1 = vec3(1.8, 0.34, 0.08); c2 = vec3(2.8, 1.15, 0.2); c3 = vec3(3.0, 2.6, 1.3); }
      if (pal < 0.5 || pal > 1.5) c1 = mix(c1, vec3(0.32, 0.07, 0.03), smoothstep(0.6, 1.0, age) * 0.85); else c1 = mix(c1, vec3(0.05, 0.12, 0.9), smoothstep(0.6, 1.0, age) * 0.6);
      vec3 c = mix(mix(c1, c2, o2), c3, o3);
      float edge = max(max(o1 - o2, 0.0) * smoothstep(-0.07, 0.0, d), 0.0); c *= 1.0 - 0.18 * edge; c *= 1.0 + 0.12 * sin((vQ.x + vQ.y) * 6.0 + sd * 20.0);
      float a = o1 * mix(0.84, 0.96, o2) * vC.w * (1.0 - uPrint); gl_FragColor = vec4(c * a, a); }`;
  const RIB_VS = /* glsl */`attribute vec4 aU; varying vec4 vU; varying float vD; void main(){ vU = aU; vec4 mv = viewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const WISP_FS = GLSL_NZ + /* glsl */`uniform vec3 uAmb, uSun; uniform float uTime, uPrint; varying vec4 vU; varying float vD;
    void main(){ float across = abs(vU.y), n = fbm3(vec3(vU.x * 7.0 - uTime * 0.4, vU.y * 1.2 + vU.x * 2.0, uTime * 0.3));
      float strand = exp(-pow((vU.y - 0.4 * sin(vU.x * 19.0 - uTime * 1.1)) * 2.4, 2.0)) + 0.7 * exp(-pow((vU.y + 0.45 * sin(vU.x * 15.0 - uTime * 0.8 + 1.0)) * 2.8, 2.0));
      float a = (strand * 0.6 + (1.0 - smoothstep(0.2, 1.0, across)) * 0.35) * (0.4 + 0.9 * n) * vU.z * (1.0 - uPrint) * smoothstep(0.15, 0.5, vD); if (a < 0.003) discard;
      vec3 c = vec3(0.80, 0.80, 0.83) * (uAmb + uSun * 0.55); gl_FragColor = vec4(c * a, a); }`;
  const TRAIL_FS = GLSL_NZ + /* glsl */`uniform vec3 uC1, uC2, uC3, uInk; uniform float uTime, uPrint, uFade; varying vec4 vU;
    void main(){ float st = floor(uTime * 12.0), L = vU.w; float lk = fract(L * 0.8 + 0.31 * hash11(floor(L * 0.8) + st));
      float y = abs(vU.y + 0.18 * sin(L * 1.3 - uTime * 4.0)), wv = 0.5 + 0.42 * pow(1.0 - lk, 2.0) * (0.6 + 0.4 * sin(L * 2.1 + uTime * 3.0)); float d = y - wv, aa = fwidth(d) + 1e-3;
      float o1 = 1.0 - smoothstep(-aa, aa, d), o2 = 1.0 - smoothstep(-aa, aa, d + 0.22), o3 = 1.0 - smoothstep(-aa, aa, y - 0.12 - 0.06 * sin(L * 3.7 + uTime * 5.0)); if (o1 < 0.01) discard;
      vec3 c = mix(mix(uC1, uC2, o2), uC3, o3); float g = hash21(floor(vec2(L * 5.0, vU.y * 3.0)) + st); c += step(0.92, g) * uC3 * 1.2 * o1;
      c = mix(c, uInk, uPrint); float a = o1 * vU.z * uFade * mix(0.9, 1.0, o2); gl_FragColor = vec4(c * a, a); }`;
  const BOLT_FS = /* glsl */`varying vec4 vU; void main(){ float y = abs(vU.y); vec3 c = vec3(2.6, 2.5, 3.2) * exp(-y * y * 30.0) + vec3(0.6, 0.5, 1.4) * exp(-y * y * 4.0) * 0.35; gl_FragColor = vec4(c * vU.z, 1.0); }`;
  // the ink: one stroke kit for the loong (spine-mapped) and the memory heart (FLAT, plane in object space)
  const INK_VS = /* glsl */`#define NSP 48
    uniform vec4 uSP[NSP]; uniform vec4 uSU[NSP]; uniform float uScale, uTime; attribute float aS; attribute vec4 aN; attribute vec2 aW; attribute vec4 aK; attribute vec2 aV; attribute float aX;
    varying vec4 vK; varying vec2 vV; varying float vRim, vS;
    vec3 crP(vec3 a, vec3 b, vec3 c, vec3 d, float t){ return 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t * t + (-a + 3.0 * b - 3.0 * c + d) * t * t * t); }
    vec3 crD(vec3 a, vec3 b, vec3 c, vec3 d, float t){ return 0.5 * ((-a + c) + 2.0 * (2.0 * a - 5.0 * b + 4.0 * c - d) * t + 3.0 * (-a + 3.0 * b - 3.0 * c + d) * t * t); }
    void frame(float s, out vec3 P, out vec3 F, out vec3 Uv, out vec3 B){ float f = clamp(s, 0.0, 1.0) * float(NSP - 1), fi = min(floor(f), float(NSP - 2)), u = f - fi; int i = int(fi);
      vec3 a = uSP[max(i - 1, 0)].xyz, b = uSP[i].xyz, c = uSP[i + 1].xyz, d = uSP[min(i + 2, NSP - 1)].xyz; P = crP(a, b, c, d, u); F = -normalize(crD(a, b, c, d, u) + vec3(0.0, 1e-6, 0.0));
      vec3 up = mix(uSU[i].xyz, uSU[i + 1].xyz, u); Uv = normalize(up - F * dot(up, F) + vec3(1e-6)); B = cross(F, Uv); }
    #ifdef FLAT
    vec3 place(float s, vec3 o){ return (modelMatrix * vec4(o, 1.0)).xyz; }
    #else
    vec3 place(float s, vec3 o){ vec3 P, F, Uv, B; frame(s, P, F, Uv, B); return P + (B * o.x + Uv * o.y + F * o.z) * uScale; }
    #endif
    vec3 sway(vec3 o, float amp, float s){ return o + vec3(sin(uTime * 1.9 + s * 23.0 + o.y * 2.0), 0.7 * sin(uTime * 1.5 + s * 17.0 + 1.3), 0.0) * amp; }
    void main(){ float kind = aK.x, amp = kind > 3.5 ? 0.0 : aX; vec3 o = sway(position, amp, aS), wp, wn;
      if (kind < 0.5 || (kind > 2.5 && kind < 3.5)) {
      #ifdef FLAT
        wp = place(aS, o); wn = normalize(mat3(modelMatrix) * aN.yzw);
      #else
        vec3 P, F, Uv, B; frame(aS, P, F, Uv, B); wp = P + (B * o.x + Uv * o.y + F * o.z) * uScale; wn = normalize(B * aN.y + Uv * aN.z + F * aN.w);
      #endif
      } else { vec3 p0 = place(aS, o), V = normalize(cameraPosition - p0);
        if (kind > 3.5) { vec3 r = normalize(cross(V, vec3(0.0, 1.0, 0.0)) + vec3(1e-5)), u = cross(r, V); wp = p0 + (r * aW.x + u * aW.y) * aX * uScale; }
        else { vec3 p1 = place(aN.x, sway(aN.yzw, amp, aN.x)), T = p1 - p0; if (dot(T, T) < 1e-10) T = vec3(0.0, 1.0, 0.0); wp = p0 + normalize(cross(T, V) + vec3(1e-6)) * aW.x * aW.y * uScale; }
        wn = V; }
      vec4 mv = viewMatrix * vec4(wp, 1.0); vRim = 1.0 - abs(dot(normalize(mat3(viewMatrix) * wn), normalize(-mv.xyz))); vK = aK; vV = aV; vS = aS; gl_Position = projectionMatrix * mv; }`;
  const INK_FS = /* glsl */`uniform float uP[16]; uniform float uAlpha, uGlow, uQh, uL, uQe, uArcS, uArcT, uPlate; uniform sampler2D tNz; varying vec4 vK; varying vec2 vV; varying float vRim, vS;
    void main(){ float kind = vK.x, along = vK.z, tone = vK.w; int sid = int(vK.y + 0.5); float p = uP[sid];
      float A0 = (1.0 - smoothstep(p * 1.12 - 0.12, p * 1.12, along)) * smoothstep(uQe, uQe + 6.0, uQh - vS * uL) * uAlpha; if (A0 < 0.01) discard;
      vec4 n = texture2D(tNz, vec2(vS * 2.3 + vV.y * 0.11, vV.y * 0.7 + 0.13)), n2 = texture2D(tNz, vec2(vS * 9.0, vV.y * 2.1 + 0.5)), nb = texture2D(tNz, vec2(vS * 0.6 + 0.21, vV.y * 0.33 + 0.4));
      vec3 deep = vec3(0.016, 0.05, 0.50), mid = vec3(0.06, 0.15, 0.66), pale = vec3(0.17, 0.29, 0.76), navy = vec3(0.005, 0.012, 0.09), paper = vec3(0.86, 0.87, 0.86), grey = vec3(0.17, 0.19, 0.27); vec3 c; float a;
      if (kind < 0.5 || (kind > 2.5 && kind < 3.5)) { float sn = sin(vV.y * 6.2831853), stk = texture2D(tNz, vec2(vV.y * 0.9 + 0.3, vS * 0.35)).a;
        float pig = clamp(0.45 + 1.25 * (nb.r - 0.5) + 0.55 * (n.r - 0.5) + 0.28 * sn + 0.35 * (stk - 0.5), 0.0, 1.0);
        c = mix(pale, mid, smoothstep(0.08, 0.42, pig)); c = mix(c, deep, smoothstep(0.38, 0.75, pig)); c = mix(c, navy, smoothstep(0.78, 1.0, pig) * 0.7); if (kind > 2.5) c = mix(deep, navy, 0.35 + 0.4 * nb.r);
        c = mix(c, pale * 1.1, smoothstep(0.68, 0.92, n.b) * smoothstep(0.3, 0.6, nb.g) * 0.55); c *= 0.78 + 0.36 * n2.g * n2.g;
        if (kind < 0.5) { float belly = smoothstep(-0.35, -0.7, sn), pb = 1.0 - smoothstep(uP[8] * 1.12 - 0.12, uP[8] * 1.12, vS);
          if (belly * pb > 0.01) { float pl = fract(vS * uPlate + sqrt(abs(sn + 1.0)) * 0.3), ln = 1.0 - smoothstep(0.0, 0.1, min(pl, 1.0 - pl)); vec3 bc = mix(grey, paper, 0.14 * nb.r); bc = mix(bc, navy, ln * 0.9); c = mix(c, bc, belly * pb); }
          float ps = 1.0 - smoothstep(uP[9] * 1.12 - 0.12, uP[9] * 1.12, vS);
          if (ps > 0.01) { vec2 g = vec2(vS * uArcS, vV.y * uArcT); g.x += 0.5 * mod(floor(g.y), 2.0); vec2 f = fract(g) - vec2(0.5, 1.0); float arc = abs(length(f * vec2(1.0, 1.2)) - 0.62);
            c = mix(c, mix(pale, paper, 0.5), (1.0 - smoothstep(0.06, 0.13, arc)) * 0.9 * (1.0 - belly) * ps * smoothstep(0.15, 0.45, n.r + 0.3)); } }
        c = mix(c, navy, smoothstep(0.55, 0.9, vRim) * 0.85); a = 0.96 * (1.0 - smoothstep(0.9, 1.0, vRim) * (0.3 + 0.7 * n2.r)) * (0.82 + 0.18 * smoothstep(0.2, 0.6, pig)); }
      else if (kind < 1.5) { float acr = vV.y, bris = texture2D(tNz, vec2(acr * 0.37 + vK.y * 0.131 + vS * 3.0, along * 0.05 + vS)).a, dry = 0.16 + 0.5 * smoothstep(0.4, 1.0, along);
        a = smoothstep(dry - 0.06, dry + 0.06, bris + 0.32 * (1.0 - acr * acr)) * (1.0 - smoothstep(0.78, 1.0, abs(acr) + (n2.r - 0.5) * 0.35));
        c = tone < 0.5 ? mix(navy, deep, 0.3 * n.r) : tone < 1.5 ? mix(deep, mid, 0.45 * n.r) : tone < 2.5 ? paper : mix(mid, pale, 0.5 * n.r); }
      else { float rr = length(vV) + (n.r - 0.5) * 0.45; a = 1.0 - smoothstep(0.55, 0.72, rr); c = tone > 2.5 ? mix(pale, mid, 0.4 * n.r) : mix(deep, mid, smoothstep(0.1, 0.6, rr)); if (tone > 2.5) a *= 0.55; }
      c += vec3(0.2, 0.5, 1.0) * uGlow * (0.12 + 1.4 * vRim * vRim); a *= A0; if (a < 0.02) discard; gl_FragColor = vec4(c, a); }`;

  // ---------- pools ----------------------------------------------------------------------------------------------------------------------
  const NG = 3200, NSM = 1700, NF = 760, NR = 240;
  function quadPool(n, defs, mat, order) { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = {}, AT = []; for (const k in defs) { const at = new THREE.InstancedBufferAttribute(new Float32Array(n * defs[k]), defs[k]); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, at); A[k] = at.array; AT.push(at); }
    g.instanceCount = 0; const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order; return { g, m, A, AT }; }
  function flush(P, n) { P.g.instanceCount = n; for (const at of P.AT) { at.clearUpdateRanges(); if (n) at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; } P.m.visible = n > 0; }
  let GL, SMK_P, FLM, ROCKS, rHeat, rHeatA;
  let gN = 0, gE = 0, sN = 0, fN = 0, rN = 0;
  function GLW(x, y, z, s, r, g, b, a, sh, sd, vx, vy, vz, st) { if (gN >= NG || a < .004 || !(s > 0)) return; const i = gN++, P = GL.A.aP, Cc = GL.A.aC, Vv = GL.A.aV, X = GL.A.aX, o = i * 4;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = s; Cc[o] = r; Cc[o + 1] = g; Cc[o + 2] = b; Cc[o + 3] = a; Vv[o] = vx || 0; Vv[o + 1] = vy || 0; Vv[o + 2] = vz || 0; Vv[o + 3] = sh; X[i * 2] = sd; X[i * 2 + 1] = st || 0;
    const dx = x - camP.x, dy = y - camP.y, dz = z - camP.z; gE += a * (r + g + b) * .33 * Math.min(s * s / Math.max(dx * dx + dy * dy + dz * dz, .01), .01); }
  const sP = new Float32Array(NSM * 4), sC = new Float32Array(NSM * 4), sS = new Float32Array(NSM * 4), sD = new Float32Array(NSM), sIdx = [];
  function SMK(x, y, z, s, r, g, b, a, sh, sd, rot, glow) { if (sN >= NSM || a < .004 || !(s > 0)) return; const i = sN++, o = i * 4; sP[o] = x; sP[o + 1] = y; sP[o + 2] = z; sP[o + 3] = s; sC[o] = r; sC[o + 1] = g; sC[o + 2] = b; sC[o + 3] = Math.min(a, 1);
    sS[o] = sd % 97; sS[o + 1] = sh; sS[o + 2] = rot; sS[o + 3] = glow; const dx = x - camP.x, dy = y - camP.y, dz = z - camP.z; sD[i] = dx * dx + dy * dy + dz * dz; }
  function FLM_(x, y, z, s, dx, dy, dz, asp, pal, age, sd, al) { if (fN >= NF || !(s > 0)) return; const i = fN++, o = i * 4, P = FLM.A.aP, D = FLM.A.aD, Cc = FLM.A.aC; P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = s; D[o] = dx; D[o + 1] = dy; D[o + 2] = dz; D[o + 3] = asp; Cc[o] = pal; Cc[o + 1] = age; Cc[o + 2] = sd; Cc[o + 3] = al; }
  const rM = new THREE.Matrix4(), rQ = new THREE.Quaternion(), rS = V3(), rT = V3(), rAx = V3(), rCol = new THREE.Color();
  function RCK(x, y, z, s, sd, ang, heat, cr, cg, cb) { if (rN >= NR || !(s > .003)) return; rAx.set(hh(sd, 1) - .5, hh(sd, 2) - .5, hh(sd, 3) - .5).normalize(); rQ.setFromAxisAngle(rAx, ang); rT.set(x, y, z); rS.set(s, s * (.65 + .5 * hh(sd, 4)), s * (.8 + .4 * hh(sd, 5)));
    rM.compose(rT, rQ, rS); ROCKS.setMatrixAt(rN, rM); rCol.setRGB(cr, cg, cb); ROCKS.setColorAt(rN, rCol); rHeat[rN] = heat; rN++; }

  // ---------- small effect kits ----------------------------------------------------------------------------------------------------------
  const PALS = [[[2.6, 2.0, .7], [2.7, 2.7, 2.5], [1.0, 1.9, 2.9], [2.5, 1.0, 1.8]], [[2.8, 1.1, .2], [3, 2.1, .6], [2.8, 2.6, 2.0]], [[2.6, 2.9, 3.2], [.9, 1.8, 3.2], [.3, .8, 3.0]], [[2.6, 2.3, 1.2], [1.6, 2.2, 2.8], [2.7, 2.7, 2.5]]];
  const e1 = V3(), e2 = V3(), q1 = V3(), q2 = V3(), q3 = V3(), q4 = V3();
  function perp(d, a, b) { if (Math.abs(d.y) < .9) a.crossVectors(d, UP); else a.set(1, 0, 0).cross(d); a.normalize(); b.crossVectors(d, a).normalize(); }
  // glitter burst: sphere (D null) or cone round D; drag-slowed, falling, twinkling
  function glitter(P, D, spread, t0, t, n, sp, size, sd, life, grav, pal, st) { const a0 = t - t0; if (a0 < 0 || a0 > life * 1.4) return; const PL = PALS[pal]; if (D) perp(D, e1, e2);
    for (let i = 0; i < n; i++) { const s = sd + i * 1.37, r1 = hh(s, 21), r2 = hh(s, 22), r3 = hh(s, 23), r4 = hh(s, 24), lf = life * (.6 + .7 * r4); if (a0 > lf) continue; let dx, dy, dz;
      if (D) { const an = r1 * TAU, rr = spread * Math.sqrt(r2); dx = D.x + (e1.x * Math.cos(an) + e2.x * Math.sin(an)) * rr; dy = D.y + (e1.y * Math.cos(an) + e2.y * Math.sin(an)) * rr; dz = D.z + (e1.z * Math.cos(an) + e2.z * Math.sin(an)) * rr; }
      else { const th = r1 * TAU, ph = Math.acos(2 * r2 - 1); dx = Math.sin(ph) * Math.cos(th); dy = Math.cos(ph); dz = Math.sin(ph) * Math.sin(th); }
      const v = sp * (.35 + .65 * r3), ex = Math.exp(-a0 * 3), k = (1 - ex) / 3, c = PL[i % PL.length], tw = .55 + .45 * Math.sin(a0 * 25 + i * 2.1);
      GLW(P.x + dx * v * k, P.y + dy * v * k - .5 * grav * a0 * a0, P.z + dz * v * k, size * (.6 + .8 * r4), c[0], c[1], c[2], tw * (1 - sm(lf * .45, lf, a0)), st ? 2 : i % 3 === 0 ? 1 : 0, r4, dx * v * ex, dy * v * ex - grav * a0, dz * v * ex, st || .01); } }
  // a cotton puff out of a mouth: slowing, rising, growing
  function cloud(P, D, t0, t, n, sp, size, sd, life, cr, cg, cb, al, rise) { const a0 = t - t0; if (a0 < 0 || a0 > life) return; perp(D, e1, e2);
    for (let i = 0; i < n; i++) { const s = sd + i * 3.1, r1 = hh(s, 31), r2 = hh(s, 32), r3 = hh(s, 33), an = r1 * TAU, cs = .38 * Math.sqrt(r2), ca = Math.cos(an), sa = Math.sin(an);
      const v = sp * (.5 + .7 * r3), k = (1 - Math.exp(-a0 * 1.8)) / 1.8, wob = Math.sin(a0 * 1.3 + i) * .2 * a0 * size;
      SMK(P.x + (D.x + (e1.x * ca + e2.x * sa) * cs) * v * k + wob, P.y + (D.y + (e1.y * ca + e2.y * sa) * cs) * v * k + rise * a0 * a0, P.z + (D.z + (e1.z * ca + e2.z * sa) * cs) * v * k - wob,
        size * (.5 + .5 * r3) * (1 + 2.2 * a0), cr, cg, cb, al * sm(0, .1, a0) * (1 - sm(life * .4, life, a0 + .3 * r2)), 0, r1 * 70, an + a0 * .5, 0); } }
  // ground dust: a low ring that rolls out and rises
  function dust(P, t0, t, n, sc, cr, cg, cb, sd, life) { const a0 = t - t0; if (a0 < 0 || a0 > life) return;
    for (let i = 0; i < n; i++) { const r1 = hh(sd + i, 1), r2 = hh(sd + i, 2), r3 = hh(sd + i, 3), an = r1 * TAU, k = 1 - Math.exp(-a0 * (2.4 + r2)), rr = sc * (.4 + 1.6 * r2) * k;
      SMK(P.x + Math.cos(an) * rr, P.y + sc * (.1 + .6 * r3) * k + a0 * .18 * sc, P.z + Math.sin(an) * rr, sc * (.25 + .55 * r3) * (.5 + 1.1 * k + a0 * .25), cr, cg, cb, .72 * sm(0, .06, a0) * (1 - sm(life * .35, life, a0 + r3 * .3)), 3, r1 * 50, an + a0 * (r2 - .5), 0); } }
  // rock chips / chunks: ballistic, come to rest on the ground, sink away
  function chips(P, spread, t0, t, n, sc, ground, sd, cr, cg, cb, heat) { const a0 = t - t0; if (a0 < 0 || a0 > 5) return;
    for (let i = 0; i < n; i++) { const s = sd + i, r1 = hh(s, 11), r2 = hh(s, 12), r3 = hh(s, 13), r4 = hh(s, 14), an = r1 * TAU, vh = sc * (1.5 + 4 * r2), vy = sc * (1.5 + 5 * r3), g = 9.8;
      const ox = (r2 - .5) * 2 * spread, oz = (r4 - .5) * 2 * spread, oy = (r3 - .5) * spread * .6, y0 = P.y + oy, tg = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, y0 - ground))) / g, tf = Math.min(a0, tg);
      const sz = sc * (.08 + .22 * r2 * r2) * (spread > 1 ? 4 : 1); RCK(P.x + ox + Math.cos(an) * vh * tf, Math.max(ground, y0 + vy * tf - .5 * g * tf * tf) - sm(3.5, 5, a0) * sz, P.z + oz + Math.sin(an) * vh * tf, sz, s, tf * (2 + 6 * r3), heat * Math.exp(-a0 / 2), cr, cg, cb); } }
  // lava blobs: glowing, ballistic, cooling from yellow to dark red
  function lavaBurst(P, t0, t, mag, sd) { const a0 = t - t0; if (a0 < 0 || a0 > 3.4) return; const n = Math.round(26 * mag);
    for (let i = 0; i < n; i++) { const s = sd + i, tl = t0 + hh(s, 1) * .25, a = t - tl; if (a < 0) continue; const vy = (9 + 13 * hh(s, 2)) * Math.sqrt(mag), vh = 1.5 + 5 * hh(s, 3), an = hh(s, 4) * TAU, y = P.y + vy * a - 4.9 * a * a; if (y < P.y - 6) continue;
      const heat = Math.exp(-a / 1.6); GLW(P.x + Math.cos(an) * vh * a, y, P.z + Math.sin(an) * vh * a, (.5 + .9 * hh(s, 5)) * Math.sqrt(mag), 2.2 * heat + .35, .75 * heat * heat + .04, .12 * heat * heat * heat, .9 * sm(0, .05, a), 1, hh(s, 6), Math.cos(an) * vh, vy - 9.8 * a, Math.sin(an) * vh, .05); }
    GLW(P.x, P.y + 2, P.z, 9 * mag, 1.8, .6, .12, .55 * Math.exp(-a0 / .5), 3, 0);
    for (let i = 0; i < 5; i++) { const a = a0 - i * .08; if (a < 0) continue; SMK(P.x + (hh(sd, 40 + i) - .5) * 6, P.y + 2 + a * 3.5, P.z + (hh(sd, 50 + i) - .5) * 6, 3 + 2.5 * a, .18, .16, .15, .55 * (1 - sm(1.5, 3.4, a)), 0, sd + i, i, Math.exp(-a / .8) * 1.2); } }
  // steam: rain on hot rock
  function steam(P, t, w, n, sc, sd) { if (w <= .001) return; const life = 7, per = life / n;
    for (let i = 0; i < n; i++) { const ph = t + i * per, cyc = Math.floor(ph / life), a = ph - cyc * life, s = sd + i * 13 + cyc * 7, r1 = hh(s, 1), r2 = hh(s, 2), r3 = hh(s, 3), an = r1 * TAU, rr = sc * 8 * Math.sqrt(r2);
      SMK(P.x + Math.cos(an) * rr + WX * a * 1.4, P.y + a * (1.6 + 1.2 * r3) * sc, P.z + Math.sin(an) * rr + WZ * a * 1.4, sc * (2 + 1.5 * a) * (.7 + .6 * r3), .9, .91, .93, .3 * w * sm(0, 1, a) * (1 - sm(life * .45, life, a)), 0, s, r1 * 6, 0); } }
  // falling embers (mode 0) or grey ash flakes (mode 1) in a world-anchored box round the story
  function rainVol(F, t, n, mode, lev, sd) { if (lev <= .001) return; const W = 70, H = 44, x0 = F.x - W / 2, y0 = F.y - 10, z0 = F.z - W / 2;
    for (let i = 0; i < n; i++) { const r1 = hh(sd + i, 1), r2 = hh(sd + i, 2), r3 = hh(sd + i, 3), r4 = hh(sd + i, 4), vy = mode ? .55 + .5 * r4 : 1.2 + 1.6 * r4, sw = Math.sin(t * (1.1 + r1) + i) * (mode ? .6 : .9);
      const x = x0 + mod(r1 * W + sw + WX * t * .6 - x0, W), y = y0 + mod(r2 * H - vy * t - y0, H), z = z0 + mod(r3 * W + Math.cos(t * (.9 + r2) + i) * .7 + WZ * t * .6 - z0, W);
      const ef = clamp(Math.min(x - x0, x0 + W - x, y - y0, y0 + H - y, z - z0, z0 + W - z) / 5);
      if (mode === 0) GLW(x, y, z, .07 + .07 * r3, 2.4, .85 + .5 * r1, .22, .9 * (.55 + .45 * Math.sin(t * (6 + 5 * r2) + i * 1.7)) * ef * lev, r1 < .3 ? 0 : 1, r4, 0, -vy, 0, .02);
      else SMK(x, y, z, .05 + .07 * r3, .56, .55, .53, .85 * ef * lev, 1, r4 * 40, t * (1 + 2 * r1) + i, 0); } }

  // ---------- FIRE BREATH -----------------------------------------------------------------------------------------------------------------
  const SRC = [
    { who: 'cinder', fi: 6, pal: 0, rate: 150, life: .85, range: 21, r0: .45, spread: .2, s0: 1.3, s1: 5.2, rise: 3, asp: 1.8, side: -1 },
    { who: 'ember', fi: 6, pal: 1, rate: 190, life: .8, range: 17, r0: .06, spread: .19, s0: .25, s1: 4.6, rise: 1.5, asp: 1.9, side: 1 },
    { who: 'ash', fi: 6, pal: 2, rate: 70, life: .55, range: 2.6, r0: .06, spread: .2, s0: .14, s1: .8, rise: .5, asp: 1.7, side: 0 },
    { who: 'ember', fi: 7, pal: 1, rate: 90, life: .4, range: 1.1, r0: .02, spread: .25, s0: .06, s1: .4, rise: .1, asp: 1.5, side: 0 }];
  const CL = { on: false, A: V3(), B: V3(), ax: V3(), D: 0, lim: 0, F: V3() };
  const FRONT = keyedLin([[0, .3], [C.BLUE, .3], [C.BLUE + 1.2, .45], [C.LOONG + .5, .5], [C.LOONG + 2.5, .62], [C.PETRIFY - .3, .85], [C.PETRIFY + .1, 1.08]]);
  function clash(t) { const E = ST.ember, K = ST.cinder; CL.on = false; if (E.f < .12 || K.f < .12) return; CL.A.copy(E.m); CL.B.copy(K.m); CL.ax.subVectors(CL.B, CL.A); CL.D = CL.ax.length(); if (CL.D < 2 || CL.D > 45) return; CL.ax.multiplyScalar(1 / CL.D);
    if (E.d.dot(CL.ax) < .3 || K.d.dot(CL.ax) > -.3) return; CL.lim = clamp(FRONT(t) + .12 * (E.f - K.f), .15, 1.1) * CL.D; CL.F.copy(CL.A).addScaledVector(CL.ax, CL.lim); CL.on = true; }
  const fp = V3(), fd = V3(), fm = V3(), fr = V3();
  function fireCards(S, t) { const H = ST[S.who].H; if (!H.c) return; const n = Math.ceil(S.life * S.rate), base = Math.floor(t * S.rate); let j = 0;
    for (let k = 0; k < n; k++) { const id = base - k, tau = id / S.rate, a = t - tau; if (a > S.life) break; j = hat(H, tau, j); const f = SMP[S.fi]; if (f < .03) continue;
      fm.set(SMP[0], SMP[1], SMP[2]); fd.set(SMP[3], SMP[4], SMP[5]); if (fd.lengthSq() < 1e-8) fd.set(1, 0, 0); fd.normalize();
      const u = a / S.life, sd = id * 7.31 + S.pal * 101, r1 = hh(sd, 1), r2 = hh(sd, 2), r3 = hh(sd, 3), r4 = hh(sd, 4), fc = Math.min(f, 1.2);
      const L = S.range * Math.sqrt(fc) * (.78 + .35 * r3), x = L * (1 - Math.pow(1 - u, 1.8)); perp(fd, e1, e2);
      const an = r1 * TAU, rad = (S.r0 + S.spread * x) * Math.sqrt(r2) * (1 + .35 * Math.sin(a * 9 + r4 * 6)), ca = Math.cos(an), sa = Math.sin(an);
      fp.copy(fm).addScaledVector(fd, x).addScaledVector(e1, ca * rad).addScaledVector(e2, sa * rad); fp.y += S.rise * u * u * Math.min(fc, 1);
      let vx = fd.x + (e1.x * ca + e2.x * sa) * S.spread * 1.5, vy = fd.y + (e1.y * ca + e2.y * sa) * S.spread * 1.5 + u * .7, vz = fd.z + (e1.z * ca + e2.z * sa) * S.spread * 1.5;
      if (CL.on && S.side) { const O = S.side > 0 ? CL.A : CL.B, lim = S.side > 0 ? CL.lim : CL.D - CL.lim; fr.subVectors(fp, O); const xa = fr.dot(CL.ax) * S.side;
        if (xa > lim) { const ex = xa - lim; fr.addScaledVector(CL.ax, -xa * S.side); let rl = fr.length(); if (rl < 1e-3) { fr.copy(e1); rl = 1; } fr.multiplyScalar(1 / rl);
          const ez = Math.min(ex, 3.5) + Math.max(0, ex - 3.5) * .15; fp.addScaledVector(CL.ax, -ex * S.side - ez * .35 * S.side).addScaledVector(fr, ez * .5).addScaledVector(e2, Math.sin(a * 11 + r1 * 9) * ez * .25); fp.y += ez * .45; vx = fr.x - CL.ax.x * S.side * .6; vy = fr.y + .6; vz = fr.z - CL.ax.z * S.side * .6; } }
      const size = lerp(S.s0, S.s1, Math.pow(u, .65)) * (.65 + .55 * r4) * (.55 + .45 * Math.min(fc, 1)) * (u > .82 ? Math.max(.2, 1 - (u - .82) * 4) : 1);
      FLM_(fp.x, fp.y, fp.z, size, vx, vy, vz, S.asp * (.8 + .4 * r3), S.pal, u, r4 * 100, .93); }
    const s = ST[S.who], f = S.fi === 7 ? s.p : s.f; if (f > .03) { const c = S.pal === 1 ? [1.6, 2.4, 3.2] : [3, 1.7, .5]; GLW(s.m.x, s.m.y, s.m.z, S.s0 * 2.2, c[0], c[1], c[2], .35 * Math.min(f, 1), 3, 0); } }

  // ---------- VOLCANO ----------------------------------------------------------------------------------------------------------------------
  const ERUPTS = [[C.ERUPT, 1], [C.BLAST, 1.7]];
  function volcano(t) {
    if (t > C.WORLD - 1) for (let i = 0; i < 26; i++) { const life = 22, ph = t + i * life / 26, cyc = Math.floor(ph / life), a = ph - cyc * life, s = i * 17 + cyc * 3, r1 = hh(s, 1), r2 = hh(s, 2);
      SMK(VENT.x + (r1 - .5) * 10 + WX * a * 1.2, VENT.y + 2 + a * (1.1 + .5 * r2), VENT.z + (r2 - .5) * 10 + WZ * a * 1.2, 5 + 1.1 * a, .55, .53, .5, .3 * sm(0, 2, a) * (1 - sm(life * .55, life, a)) * sm(C.WORLD - 1, C.WORLD + 2, t), 0, s, r1 * 6, 0); }
    const clr = 1 - sm(C.DAWN0 - 1, C.DAWN0 + 3, t);                                   // the night's plume has blown away by dawn
    for (const [t0, mag] of ERUPTS) { const a0 = t - t0; if (a0 < 0 || a0 > 26 || clr <= 0) continue; const N = Math.round(80 * mag), dur = 4.5 * mag;
      for (let i = 0; i < N; i++) { const tb = t0 + Math.pow(i / N, 1.6) * dur, a = t - tb; if (a < 0) continue; const s = i * 7 + mag * 1000, life = 16 + 6 * hh(s, 9); if (a > life) continue;
        const r1 = hh(s, 11), r2 = hh(s, 12), r3 = hh(s, 13), v0 = (30 + 26 * r1) * Math.sqrt(mag), tc = 1.5 + r3, hg = v0 * tc * (1 - Math.exp(-a / tc)) + a * 1.2;
        const an = r2 * TAU, rad = (3 + 2.5 * a * (.4 + r3)) * mag + Math.max(0, hg - 55 * mag) * .35, k = sm(0, 8, a);
        SMK(VENT.x + Math.cos(an) * rad + WX * a * 1.6, VENT.y + hg, VENT.z + Math.sin(an) * rad + WZ * a * 1.6, Math.min(34, (5 + 3.2 * a) * Math.sqrt(mag)) * (.8 + .4 * r1), lerp(.13, .38, k), lerp(.115, .36, k), lerp(.11, .34, k),
          .9 * clr * sm(0, .4, a) * (1 - sm(life * .6, life, a)), 0, s, an + a * .1 * (r3 - .5), Math.exp(-a / 1.3) * 1.6 * (hg < 40 ? 1 : .5)); }
      const NRK = Math.round(36 * mag); for (let i = 0; i < NRK; i++) { const s = i * 13 + mag * 777, a = t - (t0 + hh(s, 21) * 1.2 * mag); if (a < 0 || a > 14) continue;
        const vy = (24 + 22 * hh(s, 22)) * Math.sqrt(mag), vh = (5 + 14 * hh(s, 23)) * mag, an = hh(s, 24) * TAU, g = 11, pos = (aa, o) => o.set(VENT.x + Math.cos(an) * vh * aa, VENT.y + vy * aa - .5 * g * aa * aa, VENT.z + Math.sin(an) * vh * aa);
        pos(a, q1); if (q1.y < VENT.y - 45 || t > C.DAWN0) continue; const sz = (.5 + 1.4 * hh(s, 25) * hh(s, 25)) * (mag > 1 ? 1.4 : 1), heat = Math.exp(-a / 5);
        RCK(q1.x, q1.y, q1.z, sz, s, a * (1 + 3 * hh(s, 26)), heat, .24, .21, .2); GLW(q1.x, q1.y, q1.z, sz * 3, 1, .35, .08, .45 * heat, 1, hh(s, 27));
        for (let k = 1; k <= 3; k++) { const ak = a - k * .18; if (ak < 0) break; pos(ak, q2); SMK(q2.x, q2.y, q2.z, sz * 1.2 + k * .8, .2, .18, .17, .45 * (1 - k / 4) * heat, 0, s + k, k, heat * .6); } }
      if (a0 < 1.2) GLW(VENT.x, VENT.y + 8, VENT.z, 70 * mag, 2, .9, .35, Math.pow(1 - a0 / 1.2, 2) * .7, 3, 0);
      if (mag > 1.2 && a0 < 5) for (let i = 0; i < 36; i++) { const an = i / 36 * TAU + hh(i, 61) * .2, rr = 14 + 55 * (1 - Math.exp(-a0 / .9)); SMK(VENT.x + Math.cos(an) * rr, VENT.y + 3 + a0 * 2, VENT.z + Math.sin(an) * rr, 8 + a0 * 3, .3, .28, .27, .7 * (1 - sm(.5, 5, a0)), 0, i + 500, an, Math.exp(-a0) * .8); }
      lavaBurst(VENT, t0, t, mag * 2.5, 4000 + mag * 100); }
    for (const e of Score.recent('lava', t, 3.5)) { const fis = e.t > 100; lavaBurst(fis ? M.FISSURE : VENT, e.t, t, (e.v || 1) * (fis ? .8 : 1.4), Math.round(e.t * 1000) % 100000); }
    const f0 = C.RETURN - .1, f1 = C.RETURN + 3.2; if (t > f0 && t < f1 + 2.6) { const rate = 70, base = Math.floor(t * rate);
      for (let k = 0; k < 2.5 * rate; k++) { const id = base - k, tau = id / rate; if (tau < f0 || tau > f1) continue; const a = t - tau, s = id * 3.3, vy = (12 + 14 * hh(s, 2)) * (1.15 - .3 * (tau - f0) / (f1 - f0)), vh = 1 + 3.5 * hh(s, 3), an = hh(s, 4) * TAU, y = M.FISSURE.y + vy * a - 4.9 * a * a; if (y < M.FISSURE.y - 3) continue;
        const heat = Math.exp(-a / 1.4); GLW(M.FISSURE.x + Math.cos(an) * vh * a + (hh(s, 5) - .5) * 4, y, M.FISSURE.z + Math.sin(an) * vh * a + (hh(s, 6) - .5) * 4, .5 + .9 * hh(s, 7), 2.3 * heat + .35, .8 * heat * heat + .04, .14 * heat * heat * heat, .9, 1, hh(s, 8), Math.cos(an) * vh, vy - 9.8 * a, Math.sin(an) * vh, .015); } }
    if (t > C.RETURN - .2 && t < C.BLUE + 3) for (let i = 0; i < 18; i++) { const life = 5, ph = t + i * life / 18, cyc = Math.floor(ph / life), a = ph - cyc * life, s = i * 31 + cyc;
      SMK(M.FISSURE.x + (hh(s, 1) - .5) * 8 + WX * a, M.FISSURE.y + 1 + a * 2.6, M.FISSURE.z + (hh(s, 2) - .5) * 8 + WZ * a, 1.5 + 1.4 * a, .17, .16, .16, .55 * sm(0, .5, a) * (1 - sm(2.5, 5, a)) * win(t, C.RETURN, C.BLUE + 1, .2, 2), 0, s, i, Math.exp(-a / .9)); }
    steam(VENT, t, win(t, C.SILENCE + .5, C.DAWN0 + 6, 2, 3) + win(t, C.RAIN, C.TRAIN, 2, 2), 24, 1.4, 900);
    steam(M.FISSURE, t, win(t, C.RAIN + 1, C.TRAIN, 2, 2) * .8, 14, .5, 1300); }

  // ---------- story moments ---------------------------------------------------------------------------------------------------------------
  const v1 = V3(), v2 = V3(), v3 = V3(), v4 = V3(), BOLTP = V3();
  function bolts(t) { let e = null; for (const q of Score.recent('bolt', t, .5)) if (!e || q.t > e.t) e = q; if (!e) return 0; const a = t - e.t, fl = (a < .06 ? 1 : a < .11 ? .2 : a < .2 ? .85 : a < .26 ? .15 : a < .34 ? .5 : 0) * (1 - a / .5); if (fl <= 0) return 0;
    const sd = Math.round(e.t * 100); if (e.t > 100) v1.set(66 + 12 * hh(sd, 1), 108 + 10 * hh(sd, 2), -102 + 14 * hh(sd, 3)); else v1.set(VENT.x - 18 + 36 * hh(sd, 1), VENT.y + 70 + 25 * hh(sd, 2), VENT.z - 10 + 20 * hh(sd, 3));
    v2.set(v1.x - 8 + 16 * hh(sd, 4), v1.y - 38 - 20 * hh(sd, 5), v1.z - 8 + 16 * hh(sd, 6)); let ox = 0, oz = 0; const n = 26;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); ox += (hh(sd, 10 + i) - .5) * 5; oz += (hh(sd, 50 + i) - .5) * 5; const k = Math.sin(PI * u); RW[i * 3] = lerp(v1.x, v2.x, u) + ox * k; RW[i * 3 + 1] = lerp(v1.y, v2.y, u) + (hh(sd, 90 + i) - .5) * 2; RW[i * 3 + 2] = lerp(v1.z, v2.z, u) + oz * k;
      RA[i * 4] = .45 + .6 * (1 - u); RA[i * 4 + 1] = fl; RA[i * 4 + 2] = u; RA[i * 4 + 3] = 0; if (i % 5 === 2) GLW(RW[i * 3], RW[i * 3 + 1], RW[i * 3 + 2], 11, .8, .75, 1.3, .18 * fl, 3, 0); }
    ribbonWrite(BOLT, n); BOLTP.set(RW[39], RW[40], RW[41]); return fl; }
  function cinderBits(t) { const vis = (t > C.CINDER_UP - .3 && t < C.BLAST + .4) || (t > C.RETURN - .2 && t < C.CRUMBLE + 5); if (!vis) return; const stone = clamp(num('cinder', 'stone', fbStone(t)));
    const pts = aList('cinder', 'emitters') || fbEmit(t), flat = typeof pts[0] === 'number', np = flat ? Math.floor(pts.length / 3) : pts.length, step = Math.max(1, Math.ceil(np / 24));
    aAt('cinder', t, v1); aAt('cinder', t - .05, v2); v1.sub(v2).multiplyScalar(20);
    for (let j = 0, jj = 0; j < np; j += step, jj++) { const px = flat ? pts[j * 3] : pts[j].x, py = flat ? pts[j * 3 + 1] : pts[j].y, pz = flat ? pts[j * 3 + 2] : pts[j].z;
      if (stone < .95 && t < C.PETRIFY + .6) for (let k = 0; k < 9; k++) { const id = Math.floor(t / .16) - k, s = jj * 131 + id, a = t - (id + hh(s, 9)) * .16, lf = .9 + .9 * hh(s, 5); if (a < 0 || a > lf) continue;
        const rx = (hh(s, 6) - .5) * 3, ry = .8 + 1.6 * hh(s, 7), rz = (hh(s, 8) - .5) * 3, ox = (hh(s, 10) - .5) * 2.5, oz = (hh(s, 11) - .5) * 2.5;
        GLW(px + ox + (rx - v1.x * .8) * a + Math.sin(a * 5 + s) * .4 * a, py + ry * a + .3 * a * a, pz + oz + (rz - v1.z * .8) * a + Math.cos(a * 4.3 + s) * .4 * a, .2 + .22 * hh(s, 1), 2.6, 1.0 + .6 * hh(s, 2), .25, (1 - a / lf) * (1 - stone) * .9, hh(s, 3) < .4 ? 0 : 1, hh(s, 4), rx - v1.x * .8, ry, rz - v1.z * .8, .01); }
      if (t > C.PETRIFY - .1) for (let k = 0; k < 15; k++) { const id = Math.floor(t / .25) - k, tau = (id + hh(jj, id + 7)) * .25, a = t - tau; if (a < 0 || a > 3.5 || tau < C.PETRIFY - .1 || tau > C.CRUMBLE + 1.5) continue; const s = jj * 71 + id;
        SMK(px + WX * a * .6 + Math.sin(a + s) * .3 * a, py + 1.2 * a + .2 * a * a, pz + WZ * a * .6, .8 + 1.2 * a, lerp(.2, .42, a / 3.5), lerp(.19, .41, a / 3.5), lerp(.18, .4, a / 3.5), .55 * sm(0, .2, a) * (1 - sm(1.8, 3.5, a)), 0, s, s, Math.exp(-a * 1.5) * (1 - stone * .7)); } } }
  function inkDissolve(t) { if (t < C.BLAST - .2 || t > C.BLAST + 8) return; const pr = Stage.get('pair'), dis = num('pair', 'dissolve', fbDiss(t)); const pts = aList('pair', 'points') || PP;
    const flat = typeof pts[0] === 'number', np = flat ? Math.floor(pts.length / 3) : pts.length, step = Math.max(1, Math.ceil(np / 36)), per = .22, life = 3.4, gate = pr && pr.dissolve ? (dis > .01 || t > C.BLAST + 1 ? 1 : 0) : 1;
    for (let j = 0, jj = 0; j < np; j += step, jj++) { const px = flat ? pts[j * 3] : pts[j].x, py = flat ? pts[j * 3 + 1] : pts[j].y, pz = flat ? pts[j * 3 + 2] : pts[j].z;
      for (let k = 0; k < 16; k++) { const id = Math.floor(t / per) - k, tau = (id + hh(jj, id)) * per, a = t - tau; if (a < 0 || a > life) continue; const w = win(tau, C.BLAST + .15, C.BLAST + 3.2, .3, 1) * gate; if (w < .02) continue; const s = jj * 53 + id;
        SMK(px + WX * a * 1.5 + Math.sin(a * 1.7 + s) * .7 * a, py + 1.4 * a + .25 * a * a, pz + WZ * a * 1.5 + Math.cos(a * 1.3 + s) * .7 * a, .9 + 1.6 * a, lerp(.015, .08, a / life), lerp(.035, .15, a / life), lerp(.24, .45, a / life),
          .8 * w * sm(0, .2, a) * (1 - sm(life * .5, life, a)), 2, s, s * .7 + a * .3, 0); } } }
  function moments(t) {
    for (const e of Score.recent('hit', t, 5)) { const a = t - e.t, s = Math.round(e.t * 100);
      if (e.who === 'ash') { aAt('ash', e.t, v1); v1.y = M.PLATEAU.y + .7; dust(v1, e.t, t, 60, 2.2, .3, .29, .28, s, 4.5); chips(v1, .6, e.t, t, 28, 1.2, v1.y - 1.2, s, .16, .15, .15, 0); }
      else if (!e.petrify && e.t < 60 && a < 1) { aAt('cinder', e.t, v1); v1.x += (hh(s, 1) - .5) * 6; v1.y += 1 + hh(s, 2) * 3; v1.z += (hh(s, 3) - .5) * 6; glitter(v1, null, 0, e.t, t, 22, 9, .35, s, .7, 6, 1, .02); } }
    { const P = M.cinder(C.WALL_CRASH, v1); v2.set(P.x, 27, P.z); dust(v2, C.WALL_CRASH, t, 80, 3.5, .33, .31, .3, 2101, 5); chips(v2, 1, C.WALL_CRASH, t, 40, 2, 26, 2102, .2, .18, .17, 0); }
    if (t > C.CRUMBLE - .1 && t < C.CRUMBLE + 6) { aAt('cinder', C.CRUMBLE, v1); v2.set(v1.x, Math.max(v1.y - 4, 16.2), v1.z); dust(v2, C.CRUMBLE, t, 120, 5, .48, .47, .45, 3101, 6); chips(v1, 5, C.CRUMBLE, t, 60, 1.6, 16.2, 3102, .45, .44, .42, 0); }
    // the egg: a sparkle on each crack, a burst on the hatch, lingering twinkles
    if (t > C.DAWN0 && t < C.HATCH + 4) { aAt('ember', C.HATCH - .01, v1); if (!real('ember')) v1.y += .25; for (const e of Score.recent('crack', t, 3)) { const s = Math.round(e.t * 100); glitter(v1, null, 0, e.t, t, e.hatch ? 70 : 12, e.hatch ? 1.6 : .7, e.hatch ? .06 : .04, s, e.hatch ? 1.3 : .9, .6, 3); if (e.hatch) dust(v1, e.t, t, 10, .25, .8, .78, .72, s, 1.5); }
      const a = t - C.HATCH; if (a > 0 && a < 3) for (let i = 0; i < 24; i++) { const an = hh(i, 71) * TAU + a * (.6 + hh(i, 72)), r = .3 + .25 * hh(i, 73), c = PALS[3][i % 3]; GLW(v1.x + Math.cos(an) * r, v1.y + (hh(i, 74) - .3) * .5 + a * .08, v1.z + Math.sin(an) * r, .04, c[0], c[1], c[2], .8 * (1 - sm(1.5, 3, a)) * (.5 + .5 * Math.sin(a * 13 + i)), 0, hh(i, 75)); } }
    // sneezes: glitter out of her nose; the second one sends seekers onto his cigarette tip
    for (const e of Score.recent('sneeze', t, 1.6)) { const j = hat(ST.ember.H, e.t, 0); v1.set(SMP[0], SMP[1], SMP[2]); v2.set(SMP[3], SMP[4], SMP[5]).normalize(); const s = Math.round(e.t * 100);
      glitter(v1, v2, .6, e.t, t, 46, 3, .045, s, 1.1, 1.5, 0, 0); cloud(v1, v2, e.t, t, 5, .5, .05, s, 1.2, .8, .8, .82, .45, .03);
      if (e.lights) { aCig(t, v3); const a = t - e.t; for (let i = 0; i < 7; i++) { const T0 = .42 + .08 * hh(s, i), u = a / T0; if (u < 1) for (let k = 0; k < 3; k++) { const uk = u - k * .05; if (uk < 0) break; v4.lerpVectors(v1, v3, uk); v4.y += Math.sin(PI * uk) * (.18 + .1 * hh(s, i + 9)); v4.x += Math.sin(uk * 9 + i) * .03; GLW(v4.x, v4.y, v4.z, .045 - k * .01, 2.8, 2.1, .7, 1 - k * .3, 0, hh(s, i)); } }
        if (a > .42 && a < 1) GLW(v3.x, v3.y, v3.z, .14, 2.8, 1.5, .5, 1 - (a - .42) / .58, 3, 0); } }
    // flint: his claws strike, orange streak sparks spray down and die
    for (const e of Score.recent('spark', t, .9)) if (e.kind === 'flint') { const j = hat(CIG.H, e.t, 0); v1.set(SMP[0], SMP[1] - .05, SMP[2]); v2.copy(ST.ash.d); v2.y -= .5; v2.normalize(); glitter(v1, v2, .9, e.t, t, 32, 4, .03, Math.round(e.t * 100), .5, 6, 1, .035); }
    // smoke: puffs, the stream into her face, the ring; her coughs; his wheeze; his roar that is only a cough
    for (const e of Score.recent('puff', t, 5)) { const s = Math.round(e.t * 100);
      if (e.who === 'ember') { const j = hat(ST.ember.H, e.t, 0); v1.set(SMP[0], SMP[1], SMP[2]); v2.set(SMP[3], SMP[4], SMP[5]).normalize();
        if (e.blue) { aCig(t, v3); cloud(v3, UP, e.t + .12, t, 10, .2, .06, s, 2, .7, .7, .72, .5, .05); glitter(v3, UP, 1.2, e.t + .1, t, 14, 1, .04, s, .8, 1, 2, 0); for (let i = 0; i < 6; i++) { const a = t - e.t - .15; if (a > 0 && a < 2) SMK(v3.x + (hh(s, i) - .5) * .1, v3.y - a * .35, v3.z + (hh(s, i + 9) - .5) * .1, .025, .5, .5, .5, .9 * (1 - a / 2), 1, i, a * 3 + i, 0); } }
        else cloud(v1, v2, e.t, t, 14, .7, .04, s, 2.2, .72, .72, .74, .55, .04); continue; }
      const j = hat(ST.ash.H, e.t, 0); v1.set(SMP[0], SMP[1], SMP[2]); v2.set(SMP[3], SMP[4], SMP[5]).normalize();
      if (e.ring) ringPuff(v1, v2, e.t, t, s); else if (Math.abs(e.t - C.SMOKE_FACE) < .05) stream(v1, e.t, t, s); else cloud(v1, v2, e.t, t, 26, 1.2, .08, s, 4, .78, .78, .8, .55, .05); }
    for (const e of Score.recent('cough', t, 2.5)) if (e.who === 'ember') { hat(ST.ember.H, e.t, 0); v1.set(SMP[0], SMP[1], SMP[2]); v2.set(SMP[3], SMP[4], SMP[5]).normalize(); cloud(v1, v2, e.t, t, 8, .6, .035, Math.round(e.t * 100), 2, .74, .74, .76, .45 * (e.fake ? .5 : 1), .03); }
    for (const [tq, n, sz] of [[C.WHEEZE + .15, 10, .06], [C.ASH_STANDS + .4, 16, .12]]) if (t > tq && t < tq + 3) { hat(ST.ash.H, tq, 0); v1.set(SMP[0], SMP[1], SMP[2]); v2.set(SMP[3], SMP[4], SMP[5]).normalize(); cloud(v1, v2, tq, t, n, .5, sz, Math.round(tq * 10), 2.8, .62, .62, .64, .5, .06); if (t < tq + .6) glitter(v1, v2, .5, tq, t, 4, .6, .02, 77, .5, 1, 1, 0); }
    // dust on her falls and footsteps
    for (const e of Score.recent('fall', t, 1.6)) { aAt('ember', e.t, v1); dust(v1, e.t, t, 16, .3, .62, .56, .48, Math.round(e.t * 100), 1.6); }
    for (const e of Score.recent('step_ember', t, .8)) { aAt('ember', e.t, v1); dust(v1, e.t, t, 3, .1, .62, .57, .5, Math.round(e.t * 100), .8); }
    for (const p of pokes) { if (t - p.t > 1.8 || t < p.t) continue; glitter(p.p, null, 0, p.t, t, 60, 6, .3, p.sd, 1.4, 2, 0, 0); } }
  function ringPuff(P, D, t0, t, sd) { const a = t - t0, life = 3.4; if (a < 0 || a > life) return; perp(D, e1, e2); const dist = 1.7 * (1 - Math.exp(-a * .9)), R = .07 + .22 * (1 - Math.exp(-a * 1.1)) + .04 * a, al = .75 * sm(0, .15, a) * (1 - sm(1.9, life, a));
    q1.copy(P).addScaledVector(D, dist); q1.y += .05 * a; const n = 32;
    for (let i = 0; i < n; i++) { const an = i / n * TAU + a * .4, w = 1 + .08 * Math.sin(an * 3 + a * 2), ca = Math.cos(an) * R * w, sa = Math.sin(an) * R * w;
      SMK(q1.x + e1.x * ca + e2.x * sa, q1.y + e1.y * ca + e2.y * sa, q1.z + e1.z * ca + e2.z * sa, .055 + .045 * a, .84, .84, .86, al, 0, sd + i, a * 3 + i, 0); }
    SMK(q1.x, q1.y, q1.z, R * .9, .84, .84, .86, al * .12, 0, sd + 99, 0, 0); }
  function stream(P, t0, t, sd) { aHead('ember', t, q3); const n = 64, T = .7;
    for (let j = 0; j < n; j++) { const a = t - (t0 + j / n * 1.3); if (a < 0 || a > 4.2) continue; const r1 = hh(sd + j, 1), r2 = hh(sd + j, 2), r3 = hh(sd + j, 3);
      if (a < T) { const u = a / T; q2.lerpVectors(P, q3, .5); q2.y += .25; const b0 = (1 - u) * (1 - u), b1 = 2 * u * (1 - u), b2 = u * u;
        SMK(P.x * b0 + q2.x * b1 + q3.x * b2 + (r1 - .5) * .06, P.y * b0 + q2.y * b1 + q3.y * b2 + (r2 - .5) * .06, P.z * b0 + q2.z * b1 + q3.z * b2 + (r3 - .5) * .06, .05 + .07 * u, .8, .8, .82, .6, 0, sd + j, j, 0); }
      else { const b = a - T, an = r1 * TAU + b * 3.2, rr = .16 + .07 * b + .05 * r2; SMK(q3.x + Math.cos(an) * rr, q3.y + (r3 - .5) * .2 + .09 * b, q3.z + Math.sin(an) * rr, .11 + .07 * b, .8, .8, .82, .6 * (1 - sm(1.4, 3.5, b)), 0, sd + j, an, 0); } } }
  function heartTrails(t) { const t0 = C.FLY + 2.52, on = t > t0 + .05 && t < C.INK_BACK + 3.5; for (const R of TRAILS) R.R.m.visible = false; if (!on) return; const t1 = Math.min(t, C.HEART2 + .25), fade = 1 - .35 * sm(C.HEART2 + 1.5, C.HEART2 + 6, t);
    for (const R of TRAILS) { const n = 220; for (let i = 0; i < n; i++) { const u = i / (n - 1), tau = lerp(t1, t0, u); M.heart2(R.who, tau, q1); RW[i * 3] = q1.x; RW[i * 3 + 1] = q1.y; RW[i * 3 + 2] = q1.z; RA[i * 4] = R.w * (.35 + .65 * sm(0, .03, u)); RA[i * 4 + 1] = sm(0, .02, 1 - u) * .95; RA[i * 4 + 2] = u; }
      let L = 0; RA[(n - 1) * 4 + 3] = 0; for (let i = n - 2; i >= 0; i--) { L += Math.hypot(RW[i * 3] - RW[i * 3 + 3], RW[i * 3 + 1] - RW[i * 3 + 4], RW[i * 3 + 2] - RW[i * 3 + 5]); RA[i * 4 + 3] = L; }
      ribbonWrite(R.R, n); R.R.mat.uniforms.uFade.value = fade; const c = R.c;
      for (let g = 0; g < 90; g++) { const u = hh(g, R.sd), tau = lerp(t1, t0, u); M.heart2(R.who, tau, q1); const tw = .5 + .5 * Math.sin(t * (7 + 6 * hh(g, R.sd + 1)) + g); const dr = (t - tau) * .25;
        GLW(q1.x + (hh(g, R.sd + 2) - .5) * 1.6, q1.y + (hh(g, R.sd + 3) - .5) * 1.6 - dr, q1.z + (hh(g, R.sd + 4) - .5) * 1.6, .25 + .2 * hh(g, R.sd + 5), c[0], c[1], c[2], tw * fade * .8, 0, hh(g, R.sd + 6)); }
      if (t < C.HEART2 + .3) { M.heart2(R.who, t, q1); tangentH(R.who, t, q2); for (let k = 0; k < 8; k++) { const a = fract(t * 3 + k / 8), sd = Math.floor(t * 3 + k / 8) * 8 + k; FLM_(q1.x - q2.x * a * 2.2 + (hh(sd, 1) - .5) * .5, q1.y - q2.y * a * 2.2 + (hh(sd, 2) - .5) * .5, q1.z - q2.z * a * 2.2, .9 * (1 - a * .6), -q2.x, -q2.y + .3, -q2.z, 1.8, R.pal, a, hh(sd, 3) * 100, .9); } } } }
  function loongSmoke(t) { if (t < C.RETURN + 1.5 || t > C.LOONG + 4) return; const P = CLI_PTS[1], w = win(t, C.RETURN + 3, C.LOONG + 1.5, 1.5, 2.5);
    for (let i = 0; i < 34; i++) { const life = 8, ph = t + i * life / 34, cyc = Math.floor(ph / life), a = ph - cyc * life, s = i * 19 + cyc * 5, r1 = hh(s, 1), r2 = hh(s, 2), r3 = hh(s, 3);
      SMK(P.x + (r1 - .5) * 26 + WX * a, P.y - 4 + (r2 - .5) * 12 + a * .8, P.z + (r3 - .5) * 20 + WZ * a, 7 + 1.2 * a, .26, .26, .29, .6 * w * sm(0, 1.5, a) * (1 - sm(5, 8, a)), 0, s, r1 * 6 + a * .1, 0); } }
  function wisp(t) { WISP.m.visible = false; if (!CIG.H.c || t < C.CAVE - 1 || (t > C.STUB + 4 && t < C.JOKE - 1)) return; const n = 90, life = 3; let j = 0, any = 0;
    for (let i = 0; i < n; i++) { const u = i / (n - 1), age = u * life, tau = t - age; j = hat(CIG.H, tau, j); const lit = SMP[3]; any += lit;
      RW[i * 3] = SMP[0] + Math.sin(age * 2.6 + tau * 1.3) * .045 * age + WX * .05 * age * age; RW[i * 3 + 1] = SMP[1] + .22 * age + .05 * age * age; RW[i * 3 + 2] = SMP[2] + Math.cos(age * 2.1 + tau * 1.7) * .045 * age + WZ * .05 * age * age;
      RA[i * 4] = .008 + .045 * age; RA[i * 4 + 1] = Math.min(1, 1.5 * lit * sm(0, .06, age) * Math.pow(1 - u, 1.1)); RA[i * 4 + 2] = u; RA[i * 4 + 3] = 0; }
    if (any > .01) ribbonWrite(WISP, n); }

  // ---------- ribbons --------------------------------------------------------------------------------------------------------------------
  const RW = new Float32Array(300 * 3), RA = new Float32Array(300 * 4); let WISP, BOLT; const TRAILS = [];
  function ribbon(N, mat, order) { const g = new THREE.BufferGeometry(), P = new THREE.BufferAttribute(new Float32Array(N * 6), 3), A = new THREE.BufferAttribute(new Float32Array(N * 8), 4); P.setUsage(THREE.DynamicDrawUsage); A.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', P); g.setAttribute('aU', A); const ix = []; for (let i = 0; i < N - 1; i++) { const q = i * 2; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } g.setIndex(ix); g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order; m.visible = false; return { g, m, P, A, mat }; }
  function ribbonWrite(R, n) { const P = R.P.array, A = R.A.array; let k = 0;
    for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3, o = i * 3; q1.set(RW[i1] - RW[i0], RW[i1 + 1] - RW[i0 + 1], RW[i1 + 2] - RW[i0 + 2]); q2.set(RW[o] - camP.x, RW[o + 1] - camP.y, RW[o + 2] - camP.z); q3.crossVectors(q1, q2); const l = q3.length() || 1, w = RA[i * 4] / l;
      for (const sg of [1, -1]) { P[k * 3] = RW[o] + q3.x * w * sg; P[k * 3 + 1] = RW[o + 1] + q3.y * w * sg; P[k * 3 + 2] = RW[o + 2] + q3.z * w * sg; A[k * 4] = RA[i * 4 + 2]; A[k * 4 + 1] = sg; A[k * 4 + 2] = RA[i * 4 + 1]; A[k * 4 + 3] = RA[i * 4 + 3]; k++; } }
    R.g.setDrawRange(0, (n - 1) * 6); R.P.clearUpdateRanges(); R.P.addUpdateRange(0, n * 6); R.P.needsUpdate = true; R.A.clearUpdateRanges(); R.A.addUpdateRange(0, n * 8); R.A.needsUpdate = true; R.m.visible = n > 1; }

  // ---------- THE INK LOONG -----------------------------------------------------------------------------------------------------------------
  // geometry lives in spine space: aS = 0 head .. 1 tail tip, position = offset in the spine frame (x side, y dorsal, z forward), metres at uScale 1
  const newLG = () => ({ S: [], O: [], N: [], W: [], K: [], V: [], X: [], I: [] });
  function lv(G, s, o, n4, w2, k4, v2, x) { G.S.push(s); G.O.push(o[0], o[1], o[2]); G.N.push(n4[0], n4[1], n4[2], n4[3]); G.W.push(w2[0], w2[1]); G.K.push(k4[0], k4[1], k4[2], k4[3]); G.V.push(v2[0], v2[1]); G.X.push(x); return G.S.length - 1; }
  function tubeSeg(G, s0, s1, nr, na, sid, rad) { const b = G.S.length;
    for (let i = 0; i <= nr; i++) { const s = lerp(s0, s1, i / nr), r = rad(s), rx = r, ry = r * .9; for (let j = 0; j <= na; j++) { const th = j / na, c = Math.cos(th * TAU), sn = Math.sin(th * TAU), nx = c / rx, ny = sn / ry, nl = Math.hypot(nx, ny); lv(G, s, [c * rx, sn * ry, 0], [0, nx / nl, ny / nl, 0], [0, 0], [0, sid, i / nr, 0], [s, th], 0); } }
    for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) { const a = b + i * (na + 1) + j, c = a + na + 1; G.I.push(a, c, a + 1, a + 1, c, c + 1); } }
  function headTube(G, keys, nr, na, sid) { const b = G.S.length, z0 = keys[0][0], z1 = keys[keys.length - 1][0], kw = keyedCR(keys.map(k => [k[0], k[1]])), kh = keyedCR(keys.map(k => [k[0], k[2]])), ky = keyedCR(keys.map(k => [k[0], k[3]]));
    for (let i = 0; i <= nr; i++) { const z = lerp(z0, z1, i / nr), w = Math.max(.01, kw(z)), h = Math.max(.01, kh(z)), yc = ky(z), dw = (kw(z + .02) - kw(z - .02)) / .04;
      for (let j = 0; j <= na; j++) { const th = j / na, c = Math.cos(th * TAU), sn = Math.sin(th * TAU), n = V3(c, sn, -dw).normalize(); lv(G, 0, [c * w, yc + sn * h, z], [0, n.x, n.y, n.z], [0, 0], [3, sid, i / nr, 0], [i / nr, th], 0); } }
    for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) { const a = b + i * (na + 1) + j, c = a + na + 1; G.I.push(a, c, a + 1, a + 1, c, c + 1); } }
  function strokeG(G, pts, w0, w1, sid, tone, sway, seg) { const n = seg || 14, P = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1) * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), v = f - k, a = pts[Math.max(0, k - 1)], b = pts[k], c = pts[k + 1], d = pts[Math.min(pts.length - 1, k + 2)]; P.push([0, 1, 2, 3].map(q => cr1(a[q], b[q], c[q], d[q], v))); }
    const b = G.S.length; for (let i = 0; i < n; i++) { const u = i / (n - 1), p = P[i], q = i < n - 1 ? P[i + 1] : p.map((x, k) => 2 * x - P[i - 1][k]), w = lerp(w0, w1, u) * (.45 + .55 * sm(0, .18, u));
      for (const sg of [-1, 1]) lv(G, p[0], [p[1], p[2], p[3]], q, [sg, w], [1, sid, u, tone], [u, sg], sway * Math.pow(u, 1.5)); }
    for (let i = 0; i < n - 1; i++) { const a = b + i * 2; G.I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  function dotG(G, s, x, y, z, r, sid, along, tone) { const b = G.S.length; for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lv(G, s, [x, y, z], [s, x, y, z], [cx, cy], [4, sid, along, tone], [cx, cy], r); G.I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  function geoOf(G, HS) { if (HS) for (let i = 0; i < G.S.length; i++) { const k = G.K[i * 4]; if (G.S[i] === 0) { for (let q = 0; q < 3; q++) G.O[i * 3 + q] *= HS; if (k > .5 && k < 1.5) G.W[i * 2 + 1] *= HS; } if (k > .5 && k < 1.5 && G.N[i * 4] === 0) for (let q = 1; q < 4; q++) G.N[i * 4 + q] *= HS; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.O, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(G.S, 1)); g.setAttribute('aN', new THREE.Float32BufferAttribute(G.N, 4));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(G.W, 2)); g.setAttribute('aK', new THREE.Float32BufferAttribute(G.K, 4)); g.setAttribute('aV', new THREE.Float32BufferAttribute(G.V, 2)); g.setAttribute('aX', new THREE.Float32BufferAttribute(G.X, 1)); g.setIndex(G.I); return g; }
  // strokes in koto order: 0 head, 1 antlers, 2-5 body wash, 6 tail brush, 7 mane, 8 belly plates, 9 scale arcs, 10 fore legs, 11 hind legs, 12 whiskers, 13 splatter, 14 eye + brow, 15 beard
  function buildLoong() { const G = newLG(), R = keyedCR([[.02, .46], [.1, .5], [.25, .62], [.45, .6], [.62, .5], [.76, .32], [.86, .12]]), rr = rng(117);
    headTube(G, [[-.75, .5, .45, .02], [-.3, .62, .6, .05], [.25, .56, .55, .06], [.8, .4, .36, -.02], [1.4, .32, .26, -.08], [1.72, .2, .16, -.1], [1.85, .03, .03, -.1]], 18, 14, 0);
    headTube(G, [[.05, .34, .16, -.3], [.6, .3, .13, -.38], [1.2, .22, .1, -.47], [1.6, .03, .03, -.52]], 10, 10, 0);
    [[.025, .3, 2], [.3, .55, 3], [.55, .8, 4], [.8, .87, 5]].forEach(q => tubeSeg(G, q[0], q[1], Math.round((q[1] - q[0]) * 170), 14, q[2], R));
    for (const sg of [-1, 1]) { strokeG(G, [[0, .3 * sg, .5, -.15], [0, .45 * sg, 1.15, -.55], [0, .6 * sg, 1.75, -1.05], [0, .55 * sg, 2.3, -1.75]], .17, .04, 1, 0, 0);
      strokeG(G, [[0, .5 * sg, 1.3, -.6], [0, .85 * sg, 1.75, -.25], [0, 1.0 * sg, 2.0, .1]], .09, .02, 1, 0, 0, 10); strokeG(G, [[0, .62 * sg, 1.85, -1.1], [0, 1.05 * sg, 2.35, -.95], [0, 1.2 * sg, 2.55, -.7]], .08, .02, 1, 0, 0, 10); }
    for (let i = 0; i < 16; i++) { const s0 = .8 + .06 * rr(), sg = i % 2 ? 1 : -1, sx = sg * (.3 + 1.6 * rr()), y = (rr() - .3) * 1.1, e = Math.min(1, s0 + .13 + .05 * rr()); strokeG(G, [[s0, 0, R(s0) * .5 * rr(), 0], [s0 + (e - s0) * .35, sx * .3, y * .4, 0], [s0 + (e - s0) * .7, sx * .75, y * .8, 0], [e, sx, y + .2 * sg, 0]], .24, .02, 6, 0, .35, 16); }
    for (let i = 0; i < 8; i++) { const s0 = .58 + i * .028; strokeG(G, [[s0, 0, R(s0) * .85, 0], [s0 + .015, (rr() - .5) * .3, R(s0) + .35, 0], [s0 + .04, (rr() - .5) * .5, R(s0) + .45, 0]], .09, .015, 6, 0, .2, 8); }
    for (let i = 0; i < 24; i++) { const s0 = .03 + i * .019, sg = i % 2 ? 1 : -1, y0 = R(s0) * .85, L = .025 + .03 * rr(); strokeG(G, [[s0, (rr() - .5) * .15, y0, 0], [s0 + L * .3, sg * .15, y0 + .35, 0], [s0 + L * .65, sg * .3, y0 + .5, 0], [s0 + L, sg * .5, y0 + .42, 0]], .12, .015, 7, 0, .25, 10); }
    for (let i = 0; i < 8; i++) { const x = (i - 3.5) * .09, L = .06 + .05 * rr(); strokeG(G, [[0, x, .5, -.5], [L * .3, x * 1.6, .85, 0], [L * .6, x * 2.2, 1.0, 0], [L, x * 2.6, .8, 0]], .13, .015, 7, 0, .3, 12); }
    for (const [s, sid] of [[.16, 10], [.5, 11]]) for (const sg of [-1, 1]) { const r = R(s); strokeG(G, [[s, sg * r * .7, -r * .4, 0], [s, sg * (r + .3), -r - .35, .25], [s, sg * (r + .45), -r - .75, .05], [s, sg * (r + .55), -r - .95, .45]], .4, .2, sid, 1, .08, 10);
      const fx = sg * (r + .55), fy = -r - .95, fz = .45; for (let c = 0; c < 3; c++) strokeG(G, [[s, fx, fy, fz], [s, fx + sg * .1 * (c - 1), fy - .12, fz + .25], [s, fx + sg * .18 * (c - 1), fy - .3, fz + .3]], .07, .01, sid, 0, .05, 6);
      strokeG(G, [[s, sg * (r + .3), -r - .35, .2], [s + .01, sg * (r + .6), -r - .3, 0], [s + .025, sg * (r + .8), -r - .1, 0]], .07, .01, sid, 0, .15, 6); }
    for (const sg of [-1, 1]) strokeG(G, [[0, sg * .25, -.05, 1.55], [0, sg * .7, .05, 1.2], [.02, sg * 1.3, .2, 0], [.05, sg * 1.7, -.1, 0], [.09, sg * 1.9, .3, 0]], .065, .008, 12, 0, .4, 18);
    for (let i = 0; i < 28; i++) { const s = .03 + .85 * rr(), an = rr() * TAU, d = R(s) * (1.6 + 1.6 * rr()); dotG(G, s, Math.cos(an) * d, Math.sin(an) * d, (rr() - .5) * .4, .04 + .12 * rr() * rr(), 13, rr(), 1); }
    for (const sg of [-1, 1]) { strokeG(G, [[0, sg * .52, .2, .52], [0, sg * .56, .28, .7], [0, sg * .54, .32, .86]], .075, .03, 14, 2, 0, 6); strokeG(G, [[0, sg * .42, .42, .35], [0, sg * .55, .52, .65], [0, sg * .5, .5, .98]], .09, .02, 14, 0, 0, 8); }
    for (let i = 0; i < 5; i++) { const x = (i - 2) * .1; strokeG(G, [[0, x, -.42, .95], [.012, x * 1.4, -.85, .3], [.03, x * 1.7, -1.05, 0]], .08, .012, 15, 0, .25, 8); }
    return geoOf(G, 1.4); }
  // the parents' heart, painted from memory (plane, unit = half-width)
  function buildMemory() { const G = newLG(), f = (p, sg) => [0, p[0] * sg, p[1], 0];
    for (const sg of [1, -1]) { const tone = 0, S = (pts, w0, w1, n) => strokeG(G, pts.map(p => f(p, sg)), w0 * 1.9, w1 * 2.2, 0, tone, 0, n);
      S([[-.04, .5], [-.14, .57], [-.24, .62]], .12, .07, 6); S([[-.2, .64], [-.3, .78], [-.38, .84]], .05, .01, 6); S([[-.3, .62], [-.25, .72]], .03, .01, 4);
      S([[-.24, .6], [-.42, .82], [-.7, .9], [-.95, .75], [-1.05, .42], [-.95, .05], [-.7, -.3], [-.4, -.62], [-.12, -.9], [.08, -1.08]], .09, .02, 40);
      for (const e of [[-.75, 1.12], [-1, 1.05], [-1.18, .82], [-1.2, .55]]) S([[-.45, .72], e], .04, .01, 6);
      S([[-.62, 1.1], [-.95, 1.12], [-1.2, .85], [-1.22, .5]], .035, .012, 12); S([[.08, -1.08], [.2, -1.12], [.3, -1.05]], .035, .006, 6);
      for (const d of [[-.55, .45, .3], [-.72, .15, .24], [-.42, .02, .22], [-.3, .35, .2]]) dotG(G, 0, d[0] * sg, d[1], 0, d[2], 0, .5, 3); }
    return geoOf(G); }
  const inkMat = (flat) => new THREE.ShaderMaterial({ vertexShader: INK_VS, fragmentShader: INK_FS, defines: flat ? { FLAT: 1 } : {}, transparent: true, depthWrite: true, side: THREE.DoubleSide,
    uniforms: { uSP: { value: SPP }, uSU: { value: SPU }, uScale: { value: 1 }, uTime: LU.uTime, uP: { value: new Array(16).fill(1) }, uAlpha: { value: 0 }, uGlow: { value: 0 }, uQh: { value: 0 }, uL: { value: 1 }, uQe: { value: -1e9 }, uArcS: { value: 200 }, uArcT: { value: 11 }, uPlate: { value: 120 }, tNz: LU.tNz } });
  const SPN = 48, SPP = Array.from({ length: SPN }, () => new THREE.Vector4()), SPU = Array.from({ length: SPN }, () => new THREE.Vector4(0, 1, 0, 0)), SQ = Array.from({ length: SPN }, () => V3()), sT = V3(), sU = V3(), sW = V3();
  function mkPath(ctrl) { const D = [], ns = ctrl.length - 1; for (let k = 0; k < ns; k++) { const a = ctrl[Math.max(0, k - 1)], b = ctrl[k], c = ctrl[k + 1], d = ctrl[Math.min(ns, k + 2)]; for (let i = 0; i < 40; i++) { const v = i / 40; D.push([cr1(a.x, b.x, c.x, d.x, v), cr1(a.y, b.y, c.y, d.y, v), cr1(a.z, b.z, c.z, d.z, v)]); } }
    D.push([ctrl[ns].x, ctrl[ns].y, ctrl[ns].z]); const cum = [0]; for (let i = 1; i < D.length; i++) cum.push(cum[i - 1] + Math.hypot(D[i][0] - D[i - 1][0], D[i][1] - D[i - 1][1], D[i][2] - D[i - 1][2]));
    const len = cum[cum.length - 1], ds = .25, n = Math.floor(len / ds) + 1, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n); let j = 0;
    for (let i = 0; i < n; i++) { const q = i * ds; while (j < D.length - 2 && cum[j + 1] < q) j++; const u = clamp((q - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])); X[i] = lerp(D[j][0], D[j + 1][0], u); Y[i] = lerp(D[j][1], D[j + 1][1], u); Z[i] = lerp(D[j][2], D[j + 1][2], u); }
    return { X, Y, Z, n, ds, len: (n - 1) * ds, kn: ctrl.map((_, k) => cum[k * 40]) }; }
  function pathAt(P, q, out) { const n = P.n, X = P.X, Y = P.Y, Z = P.Z;
    if (q <= 0 || q >= P.len) { const e = q <= 0, i = e ? 0 : n - 2, dx = X[i + 1] - X[i], dy = Y[i + 1] - Y[i], dz = Z[i + 1] - Z[i], l = Math.hypot(dx, dy, dz) || 1, k = e ? q : q - P.len, b = e ? 0 : n - 1; return out.set(X[b] + dx / l * k, Y[b] + dy / l * k, Z[b] + dz / l * k); }
    const f = q / P.ds, i = Math.min(n - 2, Math.floor(f)), u = f - i; return out.set(X[i] + (X[i + 1] - X[i]) * u, Y[i] + (Y[i + 1] - Y[i]) * u, Z[i] + (Z[i + 1] - Z[i]) * u); }
  function spine(P, qh, L, t, wob) {
    for (let i = 0; i < SPN; i++) { const s = i / (SPN - 1), p = SQ[i], w = wob * (.25 + s); pathAt(P, qh - s * L, p); p.x += Math.sin(TAU * (s * 1.3 - t * .21)) * w * .6; p.y += Math.sin(TAU * (s * 1.1 - t * .17) + 1) * w; p.z += Math.cos(TAU * (s * 1.2 - t * .19)) * w * .6; }
    for (let i = 0; i < SPN; i++) { sT.subVectors(SQ[Math.max(0, i - 1)], SQ[Math.min(SPN - 1, i + 1)]).normalize(); if (i === 0) sU.copy(UP); sU.addScaledVector(sT, -sU.dot(sT)); sW.copy(UP).addScaledVector(sT, -sT.y); sU.addScaledVector(sW, .2);
      if (sU.lengthSq() < 1e-8) sU.set(1, 0, 0).addScaledVector(sT, -sT.x); sU.normalize(); SPP[i].set(SQ[i].x, SQ[i].y, SQ[i].z, 0); SPU[i].set(sU.x, sU.y, sU.z, 0); } }
  // prologue: the loong in the paper sky west of the crag, composed for the ink lens at ~(25,8,42) -> (-50,31,-10); screen-left = Lv
  const LO = V3(-50, 30.5, -10), Lv = V3(-.57, 0, .82).normalize(), Dv = V3(.82, 0, .57).normalize(), kP = 1.3, kZ = 1.45;
  const PRO_PTS = [[-6, -21, 0], [-2, -17.5, 1], [1, -13.5, 0], [-1, -9.5, -1], [-5, -6, 0], [-6.5, -1.5, 1], [-4, 2.5, 2], [1, 4, 1], [4.5, 1, -1], [2.5, -2.5, -2], [-2, -1.5, -1], [-3.5, 3, 0], [-1.5, 7.5, 1], [2.5, 10.5, 1],
    [6.5, 12.5, 0], [10.5, 15, -2], [13.5, 19, -4], [15, 24, -7], [13.5, 29, -11], [9, 33, -16], [3, 36, -22], [-5, 38.5, -30], [-13, 40.5, -40], [-21, 42, -52], [-28, 43, -66]].map(p => V3().copy(LO).addScaledVector(Lv, p[0] * kP * kZ).addScaledVector(UP, p[1] * kP).addScaledVector(Dv, p[2] * kP));
  // climax: out of the battle smoke over the plateau, one and a quarter coils round Cinder and Ember, up into the sunrise
  const CLI_PTS = [V3(24, 60, -86), V3(34, 46, -74), V3(42, 34, -64)].concat([29, 26, 24, 23, 23, 24, 26, 28, 31, 34, 37].map((y, i) => { const a = deg(-90 + 45 * i); return V3(45 + 12.5 * Math.cos(a), y, -46 + 12.5 * Math.sin(a)); }))
    .concat([V3(66, 42, -44), V3(82, 52, -38), V3(100, 64, -30), V3(122, 78, -20), V3(146, 94, -8)]);
  let PRO, CLI, proDist, cliQ, LOONG, MEMO, INKG; const UPs = new Array(16).fill(1);
  function loongUpdate(t) { const u = LOONG.material.uniforms; let P = null, qh = 0, L = 1, sc = 1, al = 0, gl = 0, qe = -1e9, wob = 0;
    if (t < 17.5) { P = PRO; L = PRO.L; qh = PRO.L + proDist(t); sc = 3.0; al = 1 - sm(12, 17, t); wob = .5; }
    else if (t > 117.8 && t < C.DAWN + 4.6) { P = CLI; L = 50; qh = cliQ(t); sc = 1.7; qe = CLI.qe; al = sm(117.9, 118.4, t) * (1 - sm(C.DAWN + .8, C.DAWN + 4.4, t)); gl = (.3 + .55 * sm(C.LOONG - .3, C.LOONG + 1.2, t) + .25 * sm(C.DAWN, C.DAWN + 3, t)) * (.9 + .1 * Math.sin(t * 5)) + .15 * Score.env('choir', t, .5); wob = .8; }
    LOONG.visible = !!P && al > .005; if (!LOONG.visible) return;
    spine(P, qh, L, t, wob); u.uScale.value = sc; u.uQh.value = qh; u.uL.value = L; u.uQe.value = qe; u.uAlpha.value = al; u.uGlow.value = gl; u.uArcS.value = L / (.3 * sc); u.uPlate.value = L / (.55 * sc);
    if (t < 14) { const ev = Score.recent('stroke', t, 14).sort((a, b) => a.t - b.t); for (let k = 0; k < 16; k++) UPs[k] = k < ev.length ? sm(ev[k].t, ev[k].t + .45, t) : 0; } else UPs.fill(1); u.uP.value = UPs; }
  const MEM_T0 = 115.88, MEM_T1 = 116.54;
  function memoryUpdate(t) { const on = t > MEM_T0 - .1 && t < MEM_T1 + .12; MEMO.visible = on; if (!on) return; const u = MEMO.material.uniforms; u.uAlpha.value = sm(MEM_T0 - .08, MEM_T0 + .02, t) * (1 - sm(MEM_T1 - .04, MEM_T1 + .08, t)); u.uP.value.fill(sm(MEM_T0 - .05, MEM_T0 + .28, t)); }

  // ---------- lights ---------------------------------------------------------------------------------------------------------------------
  const LT = {}; const lset = (k, p, lev) => { const id = LT[k]; if (id === undefined || id < 0) return; if (p) Lan.pos(id, p.x, p.y, p.z); Lan.level(id, Math.max(0, lev)); };
  function lights(t, boltL) { const add = (k, col, r) => { if (LT[k] === undefined) LT[k] = Lan.add({ x: 0, y: -999, z: 0, r, color: col, gain: 1, level: 0 }); };
    const ashOwn = real('ash'); for (const S of SRC) { if (S.fi === 7 || (S.who === 'ash' && ashOwn)) continue; const s = ST[S.who], f = Math.min(s.f, 1.2), L = S.range * Math.sqrt(f); add(S.who + '0', S.pal === 1 ? [.9, 1.6, 3.2] : [3, 1.4, .45], S.range * .6 + 2); add(S.who + '1', S.pal === 1 ? [.9, 1.6, 3.2] : [3, 1.3, .4], S.range * .8 + 2);
      q1.copy(s.m).addScaledVector(s.d, L * .15); lset(S.who + '0', q1, f * (S.who === 'ash' ? 1.2 : 4) * (.85 + .15 * Math.sin(t * 31 + S.pal))); q1.copy(s.m).addScaledVector(s.d, L * .55); lset(S.who + '1', q1, f * (S.who === 'ash' ? .6 : 3.5) * (.85 + .15 * Math.sin(t * 23)));
      if (S.who === 'ember') { add('puff', [.9, 1.6, 3.2], 2); lset('puff', s.m, s.p * 1.5); } }
    add('cig', [1.5, .6, .2], 1.6); lset('cig', CIG.p, CIG.H.c && !ashOwn ? CIG.lit * .5 * (.8 + .2 * Math.sin(t * 13)) : 0);
    add('clash', [2.6, 2.6, 3], 14); lset('clash', CL.on ? CL.F : null, CL.on ? 5 : 0);
    add('erupt', [3, 1.2, .3], 60); lset('erupt', VENT, 2 * Math.exp(-Math.max(0, t - C.ERUPT) / 3) * (t > C.ERUPT ? 1 : 0) + 4 * Math.exp(-Math.max(0, t - C.BLAST) / 2.5) * (t > C.BLAST ? 1 : 0) + 1.5 * Score.env('lava', t, .5) * (t < 60 ? 1 : 0));
    add('fiss', [3, 1.1, .25], 22); lset('fiss', M.FISSURE, (win(t, C.RETURN, C.RETURN + 3.2, .1, 2) * 3 + Score.env('lava', t, .5) * 2) * (t > 100 ? 1 : 0));
    add('bolt', [2.2, 2.2, 3], 70); lset('bolt', BOLTP, boltL * 6);
    add('loong', [.4, .8, 2.4], 26); lset('loong', LOONG.visible && t > 100 ? SQ[16] : null, LOONG.visible && t > 100 ? LOONG.material.uniforms.uGlow.value * LOONG.material.uniforms.uAlpha.value * 2.5 : 0);
    add('hatch', [2.4, 2.2, 1.4], 3); aAt('ember', C.HATCH, q2); q2.y += .3; lset('hatch', q2, 2 * pulse(t, C.HATCH, .05, .6) + .6 * Score.env('crack', t, .25) * (t < 70 ? 1 : 0));
    add('snz', [2.6, 2.1, 1.2], 1.5); let sz = 0; for (const e of Score.recent('sneeze', t, .6)) sz += pulse(t, e.t, .02, .2); if (!ashOwn) for (const e of Score.recent('spark', t, .4)) sz += pulse(t, e.t, .02, .12) * .8; lset('snz', ST.ember.m, sz * 1.5);
    add('hB', [.9, 1.6, 3.2], 12); add('hO', [3, 1.4, .45], 12); const hv = win(t, C.FLY + 2.5, C.HEART2 + .3, .4, 1.5) * 3; M.heart2('ember', t, q1); lset('hB', q1, hv); M.heart2('ash', t, q1); lset('hO', q1, hv);
    add('poke', [2.4, 2.2, 2.4], 8); let pk = 0; for (const p of pokes) if (t >= p.t) pk = Math.max(pk, pulse(t, p.t, .02, .25)); lset('poke', pokes.length ? pokes[pokes.length - 1].p : null, pk * 3); }

  // ---------- stand-ins (studio only: &fxtest) ---------------------------------------------------------------------------------------------
  const SI = [];
  function standIns(roots) { const defs = { cinder: [Geo.sphere(1, 16, 10), '#2a2624', [3.2, 2.2, 7]], ember: [Geo.sphere(1, 12, 8), '#7fb8e6', [.2, .27, .25]], ash: [Geo.sphere(1, 12, 8), '#d7372e', [.9, 1.6, 1.1]] };
    for (const n in defs) { if (Stage.get(n)) continue; const m = Mat.mesh(defs[n][0], Mat.make('clay', { color: defs[n][1] }), { cast: false }); m.scale.set(...defs[n][2]); roots.push(m); SI.push([n, m]);
      const api = { _fx: 1, at: (t, o) => fbAt(n, t, o || V3()), mouth: o => fbMouth(n, TT, o || V3()), head: o => fbMouth(n, TT, o || V3()), dir: o => fbDir(n, TT, o || V3()), fire: () => FB_FIRE[n](TT) };
      if (n === 'ash') { api.cig = o => fbCig(TT, o || V3()); api.cigLit = () => fbLit(TT); } if (n === 'cinder') { api.stone = () => fbStone(TT); api.emitters = () => fbEmit(TT); } Stage.actor(n, api); }
    if (!Stage.get('pair')) Stage.actor('pair', { _fx: 1, dissolve: () => fbDiss(TT), points: () => PP }); }

  // ---------- build / update -------------------------------------------------------------------------------------------------------------
  let pickBall;
  function build() { const roots = [];
    const glowMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS_GLOW, fragmentShader: GLOW_FS, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pm = (vs, fs, extra) => new THREE.ShaderMaterial(Object.assign({ vertexShader: vs, fragmentShader: fs, uniforms: U, transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }, extra || {}));
    SMK_P = quadPool(NSM, { aP: 4, aC: 4, aS: 4 }, pm(SMOKE_VS, SMOKE_FS), 20); FLM = quadPool(NF, { aP: 4, aD: 4, aC: 4 }, pm(FLAME_VS, FLAME_FS), 22); GL = quadPool(NG, { aP: 4, aC: 4, aV: 4, aX: 2 }, glowMat, 24);
    SMK_P.m.onBeforeRender = (r, s, cam) => { const S = Sky.S; U.uAmb.value.copy(S.mid).multiplyScalar(.5 * S.env).addScaledVector(S.gnd, .25 * S.env); U.uSun.value.copy(S.sun).multiplyScalar(1 / PI); U.uSunV.value.copy(S.sunDir).transformDirection(cam.matrixWorldInverse); const f = LU.uFogA.value; U.uFogC.value.set(f.x, f.y, f.z); U.uFogD.value = f.w; };
    const rg = Geo.warp(Geo.sphere(1, 9, 6), (x, y, z) => { const k = 1 + .32 * NZ.n3(x * 1.7 + 5, y * 1.7, z * 1.7); return [x * k, y * k * .85, z * k]; });
    const rmat = Mat.hook(Mat.make('stone', { color: '#ffffff' }), { key: 'fxrock', vertPars: 'attribute float aHeat; varying float vHeat;', vert: 'vHeat = aHeat;', fragPars: 'varying float vHeat;',
      emissive: '{ vec4 rq = trTri(op * 0.35, on); float crk = 1.0 - smoothstep(0.02, 0.16, rq.b); totalEmissiveRadiance += vec3(2.6, 0.75, 0.12) * (crk * vHeat * 2.4 + vHeat * vHeat * 0.4 * rq.r); }' });
    rHeat = new Float32Array(NR); rHeatA = new THREE.InstancedBufferAttribute(rHeat, 1); rHeatA.setUsage(THREE.DynamicDrawUsage); rg.setAttribute('aHeat', rHeatA);
    ROCKS = Mat.inst(rg, rmat, NR, { cast: false }); ROCKS.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ROCKS.setColorAt(0, new THREE.Color(1, 1, 1)); ROCKS.count = 0;
    WISP = ribbon(90, pm(RIB_VS, WISP_FS), 21); BOLT = ribbon(26, new THREE.ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 25);
    for (const [who, c1, c2, c3, ink, w, pal, sd, gc] of [['ember', [.05, .22, 2.3], [.25, .8, 3], [1.8, 2.5, 3.2], [.02, .06, .5], 1.1, 1, 300, [1, 1.9, 3.2]], ['ash', [1.6, .3, .07], [2.6, 1.0, .18], [3, 2.5, 1.2], [.5, .06, .03], 1.2, 2, 400, [3, 1.8, .6]]]) {
      const mat = pm(RIB_VS, TRAIL_FS, { uniforms: { uTime: LU.uTime, uPrint: LU.uPrint, uFade: { value: 1 }, uC1: { value: V3(...c1) }, uC2: { value: V3(...c2) }, uC3: { value: V3(...c3) }, uInk: { value: V3(...ink) } } }); TRAILS.push({ who, R: ribbon(220, mat, 23), w, pal, sd, c: gc }); }
    PRO = mkPath(PRO_PTS); PRO.L = PRO.kn[13]; CLI = mkPath(CLI_PTS); CLI.qe = CLI.kn[1];
    { const tab = new Float32Array(1001); let d = 0; for (let i = 1; i <= 1000; i++) { const t = i * .02, v = lerp(1.1, 7, sm(C.COLOR, 11, t)); d += v * .02; tab[i] = d; } proDist = t => { const f = clamp(t / .02, 0, 1000), i = Math.min(999, Math.floor(f)); return lerp(tab[i], tab[i + 1], f - i) + Math.max(0, t - 20) * 7; }; }
    cliQ = keyedCR([[117.8, CLI.qe - 4], [119.1, CLI.qe + 17], [C.DAWN, CLI.qe + 120], [C.DAWN + 4.3, CLI.qe + 168]]);
    LOONG = new THREE.Mesh(buildLoong(), inkMat(false)); LOONG.frustumCulled = false; LOONG.renderOrder = 18; LOONG.visible = false; INKG = new THREE.Group(); INKG.add(LOONG); INKG.name = 'ink-loong';
    MEMO = new THREE.Mesh(buildMemory(), inkMat(true)); MEMO.frustumCulled = false; MEMO.renderOrder = 18; MEMO.visible = false; MEMO.position.copy(M.MEMORY || V3(22, 44, -80)); MEMO.scale.setScalar(8.2); MEMO.material.uniforms.uScale.value = 8.2;
    MEMO.lookAt(M.EMBER_CLIMAX.x, M.EMBER_CLIMAX.y + .4, M.EMBER_CLIMAX.z); MEMO.material.uniforms.uP.value = new Array(16).fill(0);
    pickBall = new THREE.Mesh(new THREE.SphereGeometry(110, 12, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide })); pickBall.material.visible = false; pickBall.frustumCulled = false; api.pick.push(pickBall);
    for (const o of [SMK_P.m, FLM.m, GL.m, ROCKS, INKG, MEMO, WISP.m, BOLT.m, ...TRAILS.map(x => x.R.m), pickBall]) roots.push(o);
    for (const o of [SMK_P.m, FLM.m, GL.m, INKG, LOONG, ...TRAILS.map(x => x.R.m)]) o.layers.enable(1);
    if (Q.has('fxtest')) standIns(roots);
    return roots; }
  function update(ctx) { const t = ctx.t; TT = t; camP.copy(ctx.cam.position); if (ctx.reset) resetState(); const ash = Stage.get('ash'); if (ash && !ash._fx && ash.smoke !== false) ash.smoke = false;   // Ash.smoke = false: his tip thread and exhaled puffs are drawn here const w = LU.uWind.value; WX = w.x * w.z; WZ = w.y * w.z;
    for (const [n, m] of SI) { fbAt(n, t, m.position); if (n === 'cinder') { fbDir(n, t, q1); m.lookAt(q1.add(m.position)); } else m.position.y += n === 'ash' ? 1.6 : .27; }
    for (const w2 in ST) { const s = ST[w2]; aMouth(w2, t, s.m); aDir(w2, t, s.d); s.f = aFire(w2, t); s.p = 0; }
    for (const e of Score.recent('puff', t, .6)) if (e.blue) ST.ember.p += pulse(t, e.t, .04, .16) * .9;
    for (const w2 in ST) { const s = ST[w2]; hpush(s.H, t, s.m.x, s.m.y, s.m.z, s.d.x, s.d.y, s.d.z, s.f, s.p); }
    if ((t > C.CAVE - 3 && t < C.TRAIN) || t > C.JOKE - 1.5) { aCig(t, CIG.p); CIG.lit = clamp(num('ash', 'cigLit', fbLit(t))); hpush(CIG.H, t, CIG.p.x, CIG.p.y, CIG.p.z, CIG.lit, 0, 0, 0, 0); }
    gN = sN = fN = rN = 0; gE = 0;
    if (t > C.WORLD - 2) { volcano(t); const F = ctx.st && ctx.st.pos ? ctx.st.pos : M.NEST; rainVol(F, t, 300, 0, win(t, C.ERUPT + 2.5, C.SILENCE - .05, 2, .05) + win(t, C.RETURN + 1, C.BLUE - .5, 2, 2), 7000); if (typeof Air === 'undefined') rainVol(t < C.DAWN0 + 8 ? M.NEST : F, t, 320, 1, win(t, C.SILENCE + 1, C.DAWN0 + 2, 1.5, 3), 8000); }
    const boltL = typeof Air === 'undefined' ? bolts(t) : 0; if (!boltL) BOLT.m.visible = false;      // the Air lane owns lightning when it is in the build
    cinderBits(t); inkDissolve(t); moments(t); loongSmoke(t);
    clash(t); for (const S of SRC) fireCards(S, t);
    if (CL.on) { const rate = 120, base = Math.floor(t * rate); perp(CL.ax, e1, e2); for (let k = 0; k < 60; k++) { const id = base - k, a = t - id / rate, s = id * 1.7, an = hh(s, 1) * TAU, sp = 6 + 8 * hh(s, 2), r = sp * a, c = PALS[2][id % 3];
      GLW(CL.F.x + (e1.x * Math.cos(an) + e2.x * Math.sin(an)) * r, CL.F.y + (e1.y * Math.cos(an) + e2.y * Math.sin(an)) * r + 2 * a - 4 * a * a, CL.F.z + (e1.z * Math.cos(an) + e2.z * Math.sin(an)) * r, .25, c[0], c[1], c[2], 1 - a * 2, 0, hh(s, 3), (e1.x * Math.cos(an) + e2.x * Math.sin(an)) * sp, 0, (e1.z * Math.cos(an) + e2.z * Math.sin(an)) * sp, .02); }
      GLW(CL.F.x, CL.F.y, CL.F.z, 7, 1.6, 1.9, 2.6, .5, 3, 0); }
    heartTrails(t); wisp(t); loongUpdate(t); memoryUpdate(t);
    // flush pools
    U.uCap.value = Math.min(1, .05 / Math.max(gE, 1e-9)); flush(GL, gN); flush(FLM, fN);
    sIdx.length = sN; for (let i = 0; i < sN; i++) sIdx[i] = i; sIdx.sort((a, b) => sD[b] - sD[a]); const A = SMK_P.A;
    for (let k = 0; k < sN; k++) { const i = sIdx[k] * 4, o = k * 4; for (let q = 0; q < 4; q++) { A.aP[o + q] = sP[i + q]; A.aC[o + q] = sC[i + q]; A.aS[o + q] = sS[i + q]; } } flush(SMK_P, sN);
    ROCKS.count = rN; ROCKS.visible = rN > 0; if (rN) { ROCKS.instanceMatrix.clearUpdateRanges(); ROCKS.instanceMatrix.addUpdateRange(0, rN * 16); ROCKS.instanceMatrix.needsUpdate = true; ROCKS.instanceColor.needsUpdate = true; rHeatA.needsUpdate = true; }
    pickBall.position.copy(camP); lights(t, boltL);
    G.info.fx = { glow: gN, smoke: sN, flame: fN, rocks: rN, cap: +U.uCap.value.toFixed(2) }; }
  const api = { fire: who => who === 'ember' ? Math.max(ST.ember.f, ST.ember.p) : ST[who] ? ST[who].f : 0, get ink() { return INKG; }, burst: p => { pokes.push({ t: TT, p: V3().copy(p), sd: (pokes.length * 7.3 + TT * 13) % 97 }); if (pokes.length > 6) pokes.shift(); }, pick: [] };
  Assets.add('fx', { order: 60, build, update, pick: api.pick, poke(hit, ctx) { const d = V3().subVectors(hit.point, ctx.cam.position).normalize(); api.burst(V3().copy(ctx.cam.position).addScaledVector(d, 16)); return 'spark'; } });
  return api;
})();
