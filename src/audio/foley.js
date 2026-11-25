// ============================================================================
// foley.js - ASH & EMBER: every sound in the film that is not sung or played.
// Wings, brush and paper, the sea and its weather, the egg, the volcano, the
// fight, an old smoker's cigarette, a hatchling's feet, two fires.
// Pure typed-array DSP, no samples, deterministic (seeded RNG only).
//   FOLEY.jobs()             -> ids (independent, any order, any worker)
//   FOLEY.render(id[, opt])  -> { id, t0, L, R, bus:'amb'|'fx', send:0..1 }
//                               opt.only = one event kind (QA isolation), opt.log = return placements
//   FOLEY.oneshot(kind,seed) -> { L, R }  live: puff spark sneeze crack splash whoosh thud flame blue chirp stone
//   FOLEY.marks              -> {}
// Every time comes from Score (tracks, CUE, T). Each event's onset (first 30 % of
// its early peak in 5 ms RMS) is placed on its Score time to the sample. Hard silences
// at CUE.SILENCE and CUE.ALONE..BLUE are cut here, per stem.
// ============================================================================
const FOLEY = (() => {
'use strict';
const S = typeof Score !== 'undefined' ? Score : require('../06_score.js');
const SR = 44100, TAU = Math.PI * 2, PI = Math.PI;
const dB = x => Math.pow(10, x / 20);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const ss = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, k) => a + (b - a) * k;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const cents = c => Math.pow(2, c / 1200);
// bell curve bump: 0 outside, 1 at the centre
const bump = (c, w, x) => { const u = Math.abs(x - c) / w; return u >= 1 ? 0 : .5 + .5 * Math.cos(PI * u); };
// piecewise-linear table [[x, y], ...]
const lin = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x < tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return tab[tab.length - 1][1];
};
// ---------- seeded randomness ----------------------------------------------
const hash = x => { x = Math.imul((x | 0) ^ 0x9E3779B9, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; return x | 0 || 1; };
function RNG(seed) {
  let s = hash(seed);
  const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) * 2.3283064365386963e-10; };
  r(); r(); r();
  r.bi = () => r() * 2 - 1;
  r.in = (a, b) => a + (b - a) * r();
  r.exp = () => -Math.log(1 - r() * .99999);
  r.pick = a => a[Math.min(a.length - 1, r() * a.length | 0)];
  r.int = () => (r() * 4294967295) | 0 || 1;
  return r;
}
// C1 value noise on the unit lattice, -1..1
function smooth(seed) {
  const h = k => hash(Math.imul(k, 0x27D4EB2F) ^ seed) * 4.656612873077393e-10;
  return x => { const k = Math.floor(x), f = x - k, u = f * f * (3 - 2 * f); return h(k) * (1 - u) + h(k + 1) * u; };
}
// ---------- buffers ---------------------------------------------------------
function Out(t0, t1) { const n = Math.max(64, Math.ceil((t1 - t0) * SR)); return { t0, n, L: new Float32Array(n), R: new Float32Array(n) }; }
// mono grain at film time t, peak gain g, equal-power pan -1..1
function put(o, m, t, g, pan = 0) {
  const i = Math.round((t - o.t0) * SR), a = (clamp(pan, -1, 1) + 1) * .25 * PI, gl = g * Math.cos(a), gr = g * Math.sin(a);
  const k1 = Math.min(m.length, o.n - i), L = o.L, R = o.R;
  for (let k = i < 0 ? -i : 0; k < k1; k++) { const v = m[k]; L[i + k] += v * gl; R[i + k] += v * gr; }
}
function putSt(o, s, t, g) {
  const i = Math.round((t - o.t0) * SR), k1 = Math.min(s.L.length, o.n - i);
  for (let k = i < 0 ? -i : 0; k < k1; k++) { o.L[i + k] += s.L[k] * g; o.R[i + k] += s.R[k] * g; }
}
// grain whose gain and pan move: gf(u), pf(u) over the grain
function putPath(o, m, t, gf, pf) {
  const i = Math.round((t - o.t0) * SR), n = m.length, B = 64;
  for (let b = 0; b < n; b += B) {
    const u0 = b / n, u1 = Math.min(1, (b + B) / n), a0 = (clamp(pf(u0), -1, 1) + 1) * .25 * PI, a1 = (clamp(pf(u1), -1, 1) + 1) * .25 * PI, g0 = gf(u0), g1 = gf(u1);
    const l0 = g0 * Math.cos(a0), l1 = g1 * Math.cos(a1), r0 = g0 * Math.sin(a0), r1 = g1 * Math.sin(a1);
    for (let k = b; k < Math.min(n, b + B); k++) { const j = i + k; if (j < 0 || j >= o.n) continue; const x = (k - b) / B; o.L[j] += m[k] * (l0 + (l1 - l0) * x); o.R[j] += m[k] * (r0 + (r1 - r0) * x); }
  }
}
function norm(m, p = 1) { let k = 0; for (let i = 0; i < m.length; i++) { const a = m[i] < 0 ? -m[i] : m[i]; if (a > k) k = a; } if (k > 0) { k = p / k; for (let i = 0; i < m.length; i++) m[i] *= k; } return m; }
function add(a, b, at, g) { const i = Math.round(at * SR), e = Math.min(b.length, a.length - i); for (let k = Math.max(0, -i); k < e; k++) a[i + k] += b[k] * g; return a; }
const zeros = d => new Float32Array(Math.max(8, d * SR | 0));
// two one-pole low-passes = distance / muffling
function far(m, fc) { const k = 1 - Math.exp(-TAU * fc / SR); let a = 0, b = 0; for (let i = 0; i < m.length; i++) { a += (m[i] - a) * k; b += (a - b) * k; m[i] = b; } return m; }
function fadeEnds(m, a, b) { const n = m.length, i1 = Math.min(n, a * SR | 0), i2 = Math.min(n, b * SR | 0); for (let i = 0; i < i1; i++) m[i] *= .5 - .5 * Math.cos(PI * i / i1); for (let i = 0; i < i2; i++) m[n - 1 - i] *= .5 - .5 * Math.cos(PI * i / i2); return m; }
// time-varying 12 dB/oct low-pass over a whole stem, fc(t)
function sweepLP(o, t0, t1, fc) {
  const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = 64;
  for (const X of [o.L, o.R]) {
    let a = X[i0] || 0, b = a; const xf = 3000;
    for (let i = i0; i < i1; i += B) {
      const k = 1 - Math.exp(-TAU * Math.min(14000, fc(o.t0 + i / SR)) / SR), e = Math.min(i1, i + B);
      for (let j = i; j < e; j++) { a += (X[j] - a) * k; b += (a - b) * k; const w = j - i0; X[j] = w < xf ? X[j] + (b - X[j]) * w / xf : b; }
    }
  }
  return o;
}
function gain(o, t0, t1, g) { const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = 64; let g0 = g(t0); for (let i = i0; i < i1; i += B) { const e = Math.min(i1, i + B), g1 = g(o.t0 + e / SR); for (let j = i; j < e; j++) { const x = g0 + (g1 - g0) * (j - i) / B; o.L[j] *= x; o.R[j] *= x; } g0 = g1; } }
function peakTo(o, p) { let k = 0; for (const X of [o.L, o.R]) for (let i = 0; i < o.n; i++) { const a = X[i] < 0 ? -X[i] : X[i]; if (a > k) k = a; } if (k) { k = p / k; for (const X of [o.L, o.R]) for (let i = 0; i < o.n; i++) X[i] *= k; } return o; }
// look-ahead gain ride: keeps peaks under c by moving the level, never by bending the wave
function ride(o, c, K = 20) {
  const B = 64, nb = Math.ceil(o.n / B), g = new Float32Array(nb + 1), h = new Float32Array(nb + 1);
  for (let b = 0; b < nb; b++) { let k = 1e-9; for (let i = b * B; i < Math.min(o.n, (b + 1) * B); i++) { const a = Math.max(Math.abs(o.L[i]), Math.abs(o.R[i])); if (a > k) k = a; } g[b] = Math.min(1, c / k); } g[nb] = 1;
  for (let b = 0; b <= nb; b++) { let m = 1; for (let j = Math.max(0, b - K); j <= Math.min(nb, b + K + 1); j++) if (g[j] < m) m = g[j]; h[b] = m; }
  for (let b = 0; b <= nb; b++) { let a = 0, w = 0; for (let j = -K; j <= K; j++) { const i = b + j; if (i >= 0 && i <= nb) { const k = .5 + .5 * Math.cos(PI * j / (K + 1)); a += h[i] * k; w += k; } } g[b] = a / w; }
  for (let b = 0; b < nb; b++) for (let i = b * B; i < Math.min(o.n, (b + 1) * B); i++) { const x = g[b] + (g[b + 1] - g[b]) * (i - b * B) / B; o.L[i] *= x; o.R[i] *= x; }
  return o;
}
function finish(o, fi = .02, fo = .05) {
  const c = Math.exp(-TAU * 18 / SR);
  for (const X of [o.L, o.R]) { let x1 = 0, y1 = 0; for (let i = 0; i < o.n; i++) { const x = X[i]; y1 = x - x1 + c * y1; x1 = x; X[i] = y1; } fadeEnds(X, fi, fo); }
  return o;
}
// ---------- physics kit ------------------------------------------------------
// struck object: modes [f, T60, amp] driven by a Hertz contact pulse (longer = softer mallet)
function strike(modes, contact, dur) {
  const n = dur * SR | 0, y = new Float32Array(n), c = Math.max(3, contact * SR | 0), x = new Float64Array(c); let sum = 0;
  for (let i = 0; i < c; i++) { x[i] = Math.pow(Math.sin(PI * (i + .5) / c), 1.6); sum += x[i]; }
  for (let i = 0; i < c; i++) x[i] /= sum;
  for (const [f, t60, a] of modes) {
    const w = TAU * f / SR, q = Math.pow(10, -3 / (t60 * SR)), k = 2 * q * Math.cos(w), q2 = q * q, g = a * Math.sin(w), m = Math.min(n, Math.ceil(t60 * 1.7 * SR) + c);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < m; i++) { const v = k * y1 - q2 * y2 + (i < c ? x[i] * g : 0); y[i] += v; y2 = y1; y1 = v; }
  }
  return fadeEnds(y, 0, Math.min(.02, dur * .3));
}
// Minnaert bubble, radius in metres: f = 3/r, radiation + thermal damping, pitch rises as it nears the surface
function bubble(rad, xi = .1, atk = .6) {
  const f = 3 / rad, d = .13 / rad + .0072 * Math.pow(rad, -1.5), sg = xi * d, n = Math.min(.5, 6.5 / d) * SR | 0, y = new Float32Array(n), na = Math.max(8, atk / f * SR);
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.exp(-d * t) * (i < na ? .5 - .5 * Math.cos(PI * i / na) : 1); y[i] = e * Math.sin(TAU * f * (t + .5 * sg * t * t)); }
  return fadeEnds(y, 0, .002);
}
// turbulence through one moving resonance (2-pole band-pass, then 2-pole low-pass). f,q,g are functions of u = 0..1; g = rms
function shaped(r, dur, f, q, g, lp = 3000, mode = 0, tex = null) {
  const tn = tex ? smooth(r.int()) : null, tg = u => tex ? g(u) * (1 - tex[1] * (.5 + .5 * tn(u * dur * tex[0]))) : g(u);
  const n = dur * SR | 0, y = new Float32Array(n), B = 32; let s = r.int(), a1_ = 0, b1_ = 0, c1_ = 0, d1_ = 0, g0 = tg(0);
  const gl = Math.tan(PI * lp / SR), kl = 1.414, la1 = 1 / (1 + gl * (gl + kl)), la2 = gl * la1, la3 = gl * la2;
  for (let i = 0; i < n; i += B) {
    const u = i / n, e = Math.min(n, i + B), fc = clamp(f(u), 20, 9000), qq = typeof q === 'function' ? q(u) : q, gg = Math.tan(PI * fc / SR), k = 1 / qq, a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2;
    const nr = mode ? 1 / Math.sqrt(1.11 * fc / 22050 / 3) : k / Math.sqrt(PI / 2 * fc / qq / 22050 / 3), g1 = tg(e / n);
    for (let j = i; j < e; j++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const v3 = s * 4.656612873077393e-10 - b1_, v1 = a1 * a1_ + a2 * v3, v2 = b1_ + a2 * a1_ + a3 * v3; a1_ = 2 * v1 - a1_; b1_ = 2 * v2 - b1_;
      const w3 = (mode ? v2 : v1) - d1_, w1 = la1 * c1_ + la2 * w3, w2 = d1_ + la2 * c1_ + la3 * w3; c1_ = 2 * w1 - c1_; d1_ = 2 * w2 - d1_;
      y[j] = w2 * nr * (g0 + (g1 - g0) * (j - i) / B);
    }
    g0 = g1;
  }
  return y;
}
// the same turbulence, long and stereo, written into a stem. f(t), g(t) rms, pan(t) in film seconds
function layer(o, t0, t1, p) {
  const i0 = Math.max(0, Math.round((t0 - o.t0) * SR)), i1 = Math.min(o.n, Math.round((t1 - o.t0) * SR)), B = p.block || 128, bp = p.mode !== 'lp', q = p.q || .7, wd = p.width === undefined ? .8 : p.width, cc = Math.sqrt(1 - wd), cw = Math.sqrt(wd), L = o.L, R = o.R;
  const tn = p.tex ? smooth(p.seed * 977 + 3) : null, pg = t => p.tex ? p.g(t) * (1 - p.tex[1] * (.5 + .5 * tn(t * p.tex[0]))) : p.g(t);
  let s = hash(p.seed || 1), l1 = 0, l2 = 0, r1 = 0, r2 = 0, p1 = 0, p2 = 0, q1 = 0, q2 = 0, ga = 0, gb = 0, first = true;
  const lpf = p.lp || 2400, gl = Math.tan(PI * lpf / SR), kl = 1.414, m1 = 1 / (1 + gl * (gl + kl)), m2 = gl * m1, m3 = gl * m2;
  for (let i = i0; i < i1; i += B) {
    const e = Math.min(i1, i + B), t = o.t0 + i / SR, te = o.t0 + e / SR, fc = clamp(p.f(t), 18, 8000), gg = Math.tan(PI * fc / SR), k = 1 / q, a1 = 1 / (1 + gg * (gg + k)), a2 = gg * a1, a3 = gg * a2;
    const nr = bp ? k / Math.sqrt(PI / 2 * fc / q / 22050 / 3) : 1 / Math.sqrt(1.11 * fc / 22050 / 3), gt = pg(te) * nr * Math.min(1, (i1 - e) / 530), pa = p.pan ? (clamp(p.pan(te), -1, 1) + 1) * .25 * PI : .25 * PI, e1 = gt * Math.cos(pa) * 1.41421, e2 = gt * Math.sin(pa) * 1.41421;
    if (first) { ga = 0; gb = 0; first = false; }
    if (gt < 1e-7 && ga < 1e-7 && gb < 1e-7) continue;
    const da = (e1 - ga) / B, db = (e2 - gb) / B;
    for (let j = i; j < e; j++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const n0 = s * 4.656612873077393e-10 * cc;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const xl = n0 + s * 4.656612873077393e-10 * cw;
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const xr = n0 + s * 4.656612873077393e-10 * cw;
      let v3 = xl - l2, v1 = a1 * l1 + a2 * v3, v2 = l2 + a2 * l1 + a3 * v3; l1 = 2 * v1 - l1; l2 = 2 * v2 - l2;
      v3 = (bp ? v1 : v2) - p2; v1 = m1 * p1 + m2 * v3; v2 = p2 + m2 * p1 + m3 * v3; p1 = 2 * v1 - p1; p2 = 2 * v2 - p2; L[j] += v2 * ga;
      v3 = xr - r2; v1 = a1 * r1 + a2 * v3; v2 = r2 + a2 * r1 + a3 * v3; r1 = 2 * v1 - r1; r2 = 2 * v2 - r2;
      v3 = (bp ? v1 : v2) - q2; v1 = m1 * q1 + m2 * v3; v2 = q2 + m2 * q1 + m3 * v3; q1 = 2 * v1 - q1; q2 = 2 * v2 - q2; R[j] += v2 * gb;
      ga += da; gb += db;
    }
    ga = e1; gb = e2;
  }
}
// dry friction: a relaxation oscillator (stick, slip) knocking on resonances [f, Q, amp]
function friction(r, dur, rate, env, lp, jit, miss) {
  const n = dur * SR | 0, x = new Float32Array(n); let ph = r(), per = 1, rt = rate(0), ev = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) { const u = i / n; rt = rate(u) / SR; ev = env(u); }
    ph += rt * per; if (ph >= 1) { ph -= 1; per = 1 + jit * r.bi(); x[i] = ev * r.in(.7, 1.1) * (r() < miss ? .25 : 1); }
  }
  const kl = 1 - Math.exp(-TAU * lp / SR); let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (x[i] - a) * kl; b += (a - b) * kl; x[i] = b; }
  return x;
}
function resonate(x, res) {
  const n = x.length, y = new Float32Array(n);
  for (const [f, q, am] of res) { const w = TAU * f / SR, rr = Math.exp(-w / (2 * q)), k = 2 * rr * Math.cos(w), q2 = rr * rr, g = am * Math.sin(w); let y1 = 0, y2 = 0; for (let i = 0; i < n; i++) { const v = k * y1 - q2 * y2 + x[i] * g; y[i] += v; y2 = y1; y1 = v; } }
  return y;
}
const stickslip = (r, dur, rate, env, res, lp = 2600, jit = .04, miss = .06) => fadeEnds(resonate(friction(r, dur, rate, env, lp, jit, miss), res), .004, Math.min(.06, dur * .2));
// a cloud of Minnaert bubbles poured into y. tf(), rf(), gf(u) give each one's time (s), radius (m) and gain
let BB = null;
function cloud(y, r, n, tf, rf, g) {
  if (!BB) { const q = RNG(9001); BB = []; for (let i = 0; i < 72; i++) BB.push(norm(bubble(.0007 * Math.pow(26, i / 71), q.in(.01, .14), q.in(.6, 1)))); }
  for (let i = 0; i < n; i++) { const rad = clamp(rf(), .0007, .018); add(y, BB[Math.round(71 * Math.log(rad / .0007) / Math.log(26))], tf(), g * Math.pow(rad / .004, .8) * (.25 + .75 * r() * r())); }
  return y;
}
// decaying sine with an exponential pitch drop f0 -> f1, time constant tau (membranes, hearts, thumps)
function drop(f0, f1, tau, atk, dec, dur) {
  const n = dur * SR | 0, y = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (f1 + (f0 - f1) * Math.exp(-t / tau)) / SR; y[i] = Math.sin(ph) * Math.exp(-t / dec) * (t < atk ? .5 - .5 * Math.cos(PI * t / atk) : 1); }
  return fadeEnds(y, 0, dur * .25);
}
const hump = (a, p = 1) => u => u < a ? Math.pow(Math.sin(PI * .5 * u / a), 2) : Math.pow(Math.max(0, (1 - u) / (1 - a)), p) ;
const G = {};
// ---- voices kept from the last film's kit (physical models) ----
G.dropGrain = (r, a = .0007, b = .003) => norm(bubble(a * Math.pow(b / a, r()), r.in(.02, .2), r.in(.5, 1)), 1);
G.stoneTap = r => { const k = r.in(.8, 1.3); return norm(far(strike([[700 * k, .012, .34], [1350 * k, .011, .7], [2200 * k, .008, .6]], .00045, .03), 3800)); };
G.plink = (r, rad = .0042) => { const y = zeros(.5); add(y, strike([[1500, .006, .25], [760, .012, .3]], .0012, .04), 0, .35); add(y, bubble(rad, .16, 1), .016, 1); add(y, bubble(rad * .62, .2, 1), .052, .34); add(y, bubble(rad * 2.1, .08, 1), .020, .5); return norm(y); };
G.drip = r => { const rad = r.in(.0030, .0062), y = zeros(.4); add(y, bubble(rad, r.in(.10, .2), 1), .008, 1); if (r() < .5) add(y, bubble(rad * r.in(.5, .7), .2, 1), r.in(.04, .08), .35); return norm(far(y, 2600)); };
// one small wave on sand: rise, spill, bubbles in the backwash
G.lap = (r, size = 1) => {
  const d = r.in(1.5, 2.5) * (.7 + .3 * size), y = shaped(r, d, u => (240 + 420 * bump(.36, .4, u)) / (.6 + .4 * size), .7, u => .075 * Math.pow(bump(.34, .34, u), 1.4) + .03 * hump(.5, 1.6)(u) * ss(.2, .5, u), 1400, 0, [26, .8]);
  cloud(y, r, 90 + 110 * size | 0, () => d * (.18 + .74 * (r() < .5 ? (r() + r()) * .26 : Math.pow(r(), 1.1))), () => .0013 * Math.pow(6, Math.pow(r(), 1.2)), .085);
  return norm(fadeEnds(y, .05, .2));
};
// herring-gull cry: two syrinx halves a few cents apart, harmonics through a 2 kHz throat
G.gull = (r, o = {}) => {
  const n = o.n || 3, f = o.f || 790, y = zeros(n * .52 + .5); let at = .02;
  for (let c = 0; c < n; c++) {
    const d = r.in(.26, .38) * (c === 0 ? 1.35 : 1), N = d * SR | 0, pk = r.in(.30, .42) * (c === 0 ? 1.2 : 1), fl = f * r.in(.96, 1.04), off = Math.round(at * SR), rough = r.in(24, 38); let p1 = 0, p2 = 0;
    for (let i = 0; i < N; i++) {
      const u = i / N, f0 = fl * (1 + pk * Math.sin(PI * Math.pow(u, .62)) - .12 * u), env = Math.pow(Math.sin(PI * Math.pow(u, .55)), 1.2) * (1 - .22 * (.5 + .5 * Math.sin(TAU * rough * i / SR))); p1 += TAU * f0 / SR; p2 += TAU * f0 * 1.006 / SR; let v = 0;
      for (let h = 1; h <= 4; h++) { const fh = f0 * h, a = (h === 1 ? .55 : 1 / h) * (.35 + 1 / (1 + Math.pow((fh - 1750) / 620, 2))); v += a * (Math.sin(p1 * h) + .7 * Math.sin(p2 * h + h)); }
      if (off + i < y.length) y[off + i] += v * env;
    }
    at += d + r.in(.07, .14);
  }
  return norm(far(y, o.lp || 2300));
};
// tortuous lightning: many N-waves arriving over seconds, air eating the top
G.thunder = (r, o = {}) => {
  const d = o.dur || 6, n = d * SR | 0, x = new Float32Array(n), nc = o.claps || 4, near = o.near || .3, c = []; for (let i = 0; i < nc; i++) c.push([i === 0 ? .04 : Math.pow(r(), 1.2) * .62, r.in(.3, 1) * (i === 0 ? 1 : .8), r.in(.02, .07)]);
  for (let i = 0; i < 520; i++) {
    const k = r.pick(c), u = Math.abs(k[0] + (r() + r() + r() - 1.5) * k[2] * 1.6) + .004, j = u * n | 0, w = r.in(.005, .020) * SR | 0, a = k[1] * Math.pow(r(), 2.2) * Math.pow(Math.max(0, 1 - u), 1.1) * (r() < .5 ? -1 : 1); if (j + w < n) { x[j] += a * w; x[j + w] -= a * w; }
  }
  const roll = shaped(r, d, () => 78, .6, u => .30 * hump(.10, 1.5)(u) * (.5 + .5 * Math.abs(Math.sin(u * 17 + 5 * u * u))), 260); let a = 0, b = 0, e = 0;
  for (let i = 0; i < n; i++) { const u = i / n, k = 1 - Math.exp(-TAU * (70 + (90 + 560 * near) * Math.exp(-u * (4 + 3 * (1 - near)))) / SR); if ((i & 31) === 0) e = k; a += (x[i] - a) * e; b += (a - b) * e; x[i] = b; }
  norm(x); norm(roll); for (let i = 0; i < n; i++) x[i] = x[i] * (.6 + .4 * near) + roll[i] * .7;
  return norm(fadeEnds(x, .03, d * .35));
};
// eggshell: tick + splinter of micro-fractures + membrane stretching under it
G.crack = (r, size = .5) => {
  const d = .45 + .45 * size, y = zeros(d), tk = (g, at, c) => add(y, strike([[r.in(900, 1250), .015, .34], [r.in(1700, 2300), .010, .8], [r.in(2700, 3500), .007, .75], [r.in(4100, 4700), .005, .34]], c * .5, .04), at, g);
  tk(1, .012, .00045); tk(.55, .021 + r.in(0, .006), .0004); if (size > .4) tk(.7, .052 + r.in(0, .02), .0004);
  const n = 8 + 34 * size | 0; for (let i = 0; i < n; i++) tk(.04 + .34 * Math.pow(r(), 2.6), .03 + Math.pow(r(), 1.5) * (d - .12), .00035);
  add(y, norm(stickslip(r, d * .75, u => mix(34, 88, u), u => Math.sin(PI * Math.pow(u, .7)), [[420, 3, 1], [690, 3, .8], [1040, 3, .5]], 1500, .2, .2)), .04, .10 + .12 * size);
  return norm(far(y, 6000));
};
G.splash = (r, size = 1) => {
  const st = { L: zeros(1.6), R: zeros(1.6) }, body = norm(shaped(r, .46, u => mix(1500, 420, Math.pow(u, .45)) / (.7 + .3 * size), .6, u => hump(.035, 2.6)(u), 3400, 0, [60, .55])), p = r.bi() * .25;
  const one = (m, t, g, pan) => { const a = (clamp(pan, -1, 1) + 1) * .25 * PI; add(st.L, m, t, g * Math.cos(a)); add(st.R, m, t, g * Math.sin(a)); };
  one(body, 0, .78, p); one(drop(150 / size, 80 / size, .05, .010, .06, .3), .002, .34, p); one(bubble(.0085 * size, .16, 1), .048, .26, p); one(bubble(.0058 * size, .2, 1), .105, .18, p * .5);
  for (let k = 0; k < 2; k++) one(cloud(zeros(1.1), r, 150 * size | 0, () => .02 + .8 * Math.pow(r(), 1.8), () => .0011 * Math.pow(6, Math.pow(r(), 1.4)), .10), .01, 1, p + (k ? .5 : -.5));
  for (let i = 0; i < 110; i++) { const u = Math.pow(r(), 1.2); one(G.dropGrain(r, .0008, .0030), .10 + u * 1.15, r.in(.03, .20) * (1 - .75 * u), p + r.bi() * (.3 + .7 * u)); }
  return peakSt(st);
};
function peakSt(st, p = 1) { let k = 0; for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) { const a = X[i] < 0 ? -X[i] : X[i]; if (a > k) k = a; } if (k) for (const X of [st.L, st.R]) { for (let i = 0; i < X.length; i++) X[i] *= p / k; fadeEnds(X, .001, .06); } return st; }
// ---------- small parts -----------------------------------------------------
const bank = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
function sprinkle(o, t0, t1, r, rate, fn) { for (let t = t0; ;) { const k = rate(t); t += r.exp() / Math.max(.2, k); if (t >= t1) return; if (k > .2) fn(t); } }
const tick = (r, f, k = 1) => norm(strike([[f, .006 * k, .6], [f * r.in(1.6, 1.8), .004 * k, .5]], .00028, .03));                 // one tiny dry fracture
const twigTick = r => norm(strike([[r.in(800, 1300), .014, .6], [r.in(1700, 2500), .009, .7], [r.in(2900, 3400), .006, .25]], .0003, .045));
const grit = r => norm(strike([[r.in(1100, 1700), .006, .7], [r.in(2200, 3100), .004, .5]], .00024, .02));
const crinkle = r => norm(strike([[r.in(900, 1600), .008, .7], [r.in(1800, 2800), .006, .5], [r.in(3000, 3600), .004, .2]], r.in(.0003, .0007), .03));
const jaw = r => norm(strike([[r.in(640, 780), .022, .45], [r.in(1300, 1500), .016, .9], [r.in(2300, 2650), .010, .55]], .0003, .07));
const sines = (parts, d, atk, dec) => { const n = d * SR | 0, y = new Float32Array(n); for (const [f, a] of parts) { const w = TAU * f / SR; for (let i = 0; i < n; i++) y[i] += a * Math.sin(w * i); } for (let i = 0; i < n; i++) { const t = i / SR; y[i] *= Math.min(1, t / atk) * Math.exp(-t / dec); } return fadeEnds(y, 0, d * .3); };
// a sound in a stone room: early reflections off near walls, then a dark tail
function cavern(m, k = 1) {
  const taps = [[.021, .5, 2600], [.039, .44, 2200], [.063, .38, 1900], [.091, .31, 1600], [.127, .25, 1350], [.168, .19, 1150], [.221, .14, 1000], [.288, .1, 900], [.37, .066, 800], [.46, .04, 700]];
  const y = new Float32Array(m.length + (.55 * k * SR | 0)); add(y, m, 0, 1);
  for (const [d, g, f] of taps) add(y, far(m.slice(), f), d * k, g * (k < 1 ? .7 : 1));
  return fadeEnds(y, 0, .08);
}

// ---------- the voices of things (mono, peak 1) ------------------------------
// WINGS. one downstroke each; size and skin set the sound
G.wing = (r, who) => {
  if (who === 'ember') {             // stubby hatchling wings: three quick papery flutters
    const y = zeros(.24), k = r.in(.92, 1.1);
    for (let i = 0; i < 3; i++) add(y, norm(shaped(r, .06, u => mix(1250, 760, u) * k, 1.1, hump(.28, 1.6), 2700)), i * r.in(.042, .05), [1, .72, .5][i]);
    add(y, drop(260 * k, 170 * k, .01, .004, .02, .07), .002, .25);
    return norm(fadeEnds(y, 0, .03));
  }
  if (who === 'cinder') {            // twenty-six metres of burning membrane: a huge whump with the fire roaring in it
    const d = .85, y = norm(shaped(r, d, u => 70 + 150 * bump(.22, .3, u), .55, hump(.16, 2.2), 650, 0, [5, .3]));
    add(y, drop(52, 29, .07, .02, .2, d), .005, .9);
    add(y, G.roar(r, d, { f: 300, lp: 1500, flick: 13, crack: 18, env: hump(.22, 1.9) }), .04, .55);
    return norm(fadeEnds(y, 0, .15));
  }
  if (who === 'ash') {               // old leather: a slower push and the joints creak at both ends of the stroke
    const d = .55, k = r.in(.94, 1.06), y = norm(shaped(r, d, u => (150 + 230 * bump(.3, .34, u)) * k, .8, u => hump(.28, 1.8)(u) * (1 - .28 * (.5 + .5 * Math.sin(TAU * 39 * u * d))), 1300, 0, [21, .35]));
    add(y, drop(100 * k, 60 * k, .04, .02, .07, .3), .03, .45);
    add(y, norm(stickslip(r, .24, u => mix(34, 62, u), u => Math.sin(PI * u), [[410 * k, 6, 1], [720 * k, 7, .7], [1170 * k, 6, .35]], 2000, .14, .12)), 0, .3);
    add(y, norm(stickslip(r, .16, u => mix(55, 40, u), u => Math.sin(PI * u), [[380 * k, 6, 1], [650 * k, 7, .6]], 1800, .14, .12)), .3, .2);
    return norm(fadeEnds(y, 0, .06));
  }
  // the pair: soft leathery membranes, a little flutter at the bottom of the stroke; she is a touch higher and quicker
  const d = who === 'lune' ? .38 : .44, k = (who === 'lune' ? 1.12 : .9) * r.in(.95, 1.05);
  const y = norm(shaped(r, d, u => (190 + 270 * bump(.28, .32, u)) * k, .75, u => hump(.26, 1.9)(u) * (1 - .22 * (.5 + .5 * Math.sin(TAU * 33 * u * d))), 1500, 0, [17, .3]));
  add(y, drop(92 * k, 56 * k, .05, .02, .07, .28), .02, .4);
  add(y, norm(shaped(r, .05, () => 700 * k, 2, hump(.3, 1.5), 1800)), d * .34, .12);
  return norm(fadeEnds(y, 0, .05));
};
// FIRE. turbulent combustion: a roaring band that wanders, its low body, flicker, and crackle
G.roar = (r, d, o = {}) => {
  const f = o.f || 280, env = o.env || hump(.15, 1.2), n1 = smooth(r.int()), fl = o.flick || 12;
  const y = norm(shaped(r, d, u => f * (1 + .3 * n1(u * d * 2.3)), .55, u => env(u), o.lp || 1400, 0, [fl, .55]));
  add(y, norm(shaped(r, d, () => f * .45, .7, u => env(u), 500, 1, [fl * .6, .5])), 0, .8);
  const nc = (o.crack || 10) * d | 0;
  for (let i = 0; i < nc; i++) { const u = r(), g = env(u); if (g > .05) add(y, tick(r, r.in(1100, 2500)), u * d, r.in(.08, .28) * g); }
  return norm(far(y, Math.min(4000, (o.lp || 1400) * 2.4)));
};
G.flame = (r, size = 1) => {          // a small flame catching: soft whoomph, a short lick of fire
  const d = .8 + .5 * size, y = zeros(d + .1);
  add(y, drop(115 / size, 62 / size, .04, .018, .12 * size, .6), 0, 1);
  add(y, G.roar(r, d, { f: 360 / Math.sqrt(size), lp: 1500, flick: 15, crack: 14, env: hump(.12, 1.4) }), .01, .75);
  return norm(fadeEnds(y, 0, .1));
};
G.blueWhoosh = r => {                // her fire arriving: a bright rising jet and a glassy shing
  const y = norm(shaped(r, .75, u => 480 + 2000 * ss(0, .4, u) - 500 * ss(.5, 1, u), 1.6, hump(.06, 1.3), 3600, 0, [24, .35]));
  add(y, drop(120, 62, .04, .012, .14, .5), 0, .6);
  add(y, sines([[1318.5, 1], [1975.5, .55], [2637, .18]], .9, .008, .28), .01, .3);
  return norm(y);
};
G.bloom = r => {                     // two fires touching: a soft fwoom that rings
  const y = norm(shaped(r, .8, u => 520 + 200 * bump(.2, .3, u), .7, hump(.08, 1.5), 1600, 0, [11, .4]));
  add(y, drop(140, 80, .03, .02, .12, .5), 0, .7);
  add(y, sines([[1318.5, 1], [1661, .6], [1975.5, .5]], 1.1, .03, .35), .02, .22);
  return norm(y);
};
G.bluePuff = r => {                  // the joke: a blue fizz, and the cigarette crumbles to ash
  const y = zeros(1.0);
  add(y, norm(shaped(r, .38, u => mix(2100, 1500, u), 2.2, hump(.05, 1.4), 3600, 0, [40, .4])), 0, 1);
  add(y, sines([[1318.5, 1], [1975.5, .5]], .45, .005, .12), .005, .3);
  for (let i = 0; i < 26; i++) add(y, tick(r, r.in(700, 1700), 1.4), .09 + .42 * Math.pow(r(), 1.3), r.in(.06, .22));
  add(y, norm(shaped(r, .45, () => 420, .7, hump(.2, 1.5), 700, 1)), .12, .3);
  return norm(far(y, 4600));
};
// INK AND PAPER
G.brush = (r, d, m = 64) => {        // a loaded brush on rice paper: wet press, drag, lift; higher notes = quicker flicks
  const k = Math.pow(2, (m - 64) / 48) * r.in(.92, 1.08), dd = d * mix(1.1, .7, clamp((m - 50) / 31, 0, 1));
  const y = norm(shaped(r, dd, u => (620 + 380 * bump(.5, .6, u)) * k, .9, u => (u < .12 ? Math.pow(Math.sin(PI * .5 * u / .12), 2) : 1) * Math.pow(1 - u, .7) * (.75 + .25 * Math.sin(PI * u * 2.4)), 2300, 0, [90, .55]));
  add(y, norm(stickslip(r, dd * .85, u => mix(140, 90, u) * k, u => Math.sin(PI * Math.min(1, u * 1.3)), [[1100 * k, 3, 1], [1700 * k, 3, .7], [2500 * k, 3, .3]], 2600, .25, .3)), .02, .2);
  add(y, drop(210, 150, .02, .002, .05, .2), 0, .4);
  return norm(fadeEnds(y, 0, .05));
};
G.paper = (r, d = 1.4) => {          // a sheet of rice paper laid down and smoothed: soft crinkles over the hand's swish
  const y = norm(shaped(r, d, u => 900 + 500 * bump(.4, .5, u), .8, u => Math.pow(bump(.42, .45, u), 1.2), 2600, 0, [14, .6]));
  for (let i = 0; i < 46; i++) { const u = .05 + .85 * Math.pow(r(), 1.2); add(y, crinkle(r), u * d, r.in(.15, .5) * (.3 + bump(.42, .5, u))); }
  return norm(far(y, 4000));
};
G.seal = r => {                      // a carved wooden seal pressed into paper on a felt pad, and the little ring of its brass cap
  const y = zeros(1.4);
  add(y, norm(strike([[148, .09, 1], [356, .06, .7], [612, .04, .45], [1010, .025, .25], [1620, .015, .1]], .0022, .4)), .003, 1);
  add(y, drop(120, 70, .02, .004, .05, .25), 0, .55);
  add(y, norm(shaped(r, .09, u => mix(900, 400, u), .7, hump(.08, 2), 1500)), 0, .3);
  add(y, norm(strike([[1568, .9, .7], [2349, .7, .35], [3951, .4, .08]], .0004, 1.2)), .006, .07);
  return norm(y);
};
G.wash = (r, d, up = 1) => {         // ink flooding wet paper: a watery bloom with fine bubbling in it
  const y = norm(shaped(r, d, u => up > 0 ? 260 + 700 * Math.pow(u, 1.3) : 900 - 620 * Math.pow(u, .8), .7, u => Math.pow(bump(up > 0 ? .62 : .38, .62, u), 1.3), 2200, 0, [8, .4]));
  cloud(y, r, 140, () => d * (.1 + .8 * r()), () => .0016 * Math.pow(4, r()), .05);
  return norm(fadeEnds(y, .05, .2));
};
// SEA AND AIR
G.surf = (r, size = 1) => {          // a breaking wave: the rush up, the crash, the bubbling wash, the hiss back
  const d = 3.2 + 1.2 * size, at = .7, y = shaped(r, d, u => { const t = u * d; return t < at ? mix(160, 420, t / at) : mix(900, 230, ss(at, at + 1.4, t)); }, .55, u => { const t = u * d; return t < at ? .15 * Math.pow(t / at, 2) : .5 * Math.exp(-(t - at) / (.35 + .25 * size)) * (1 - Math.exp(-(t - at) / .03)) + .12 * Math.exp(-(t - at) / 1.4); }, 1900, 0, [22, .5]);
  add(y, drop(70, 38, .1, .03, .35, 1.2), at - .01, .35 * size);
  cloud(y, r, 260 + 300 * size | 0, () => at + .05 + Math.pow(r(), 1.5) * (d - at - .4), () => .0012 * Math.pow(10, Math.pow(r(), 1.3)), .06);
  return norm(fadeEnds(y, .2, .5));
};
G.chirp = r => {                     // a small shore bird: two or three falling whistles
  const n = 2 + (r() * 2 | 0), y = zeros(.5); let at = .01;
  for (let c = 0; c < n; c++) { const d = r.in(.045, .075), N = d * SR | 0, fa = r.in(2900, 3400), fb = r.in(2100, 2500), off = at * SR | 0; let p = 0; for (let i = 0; i < N; i++) { const u = i / N; p += TAU * mix(fa, fb, u) / SR; const e = Math.sin(PI * u); y[off + i] += e * e * (Math.sin(p) + .05 * Math.sin(2 * p)); } at += d + r.in(.03, .06); }
  return norm(far(y, 4200));
};
// THE EGG
G.hum = (f, d) => sines([[f, 1], [f * 2, .22], [f * 3.01, .07]], d, .08, d * .5);
G.wobble = r => {                    // the egg rocks on its twig bed and settles back
  const y = zeros(.5), k = r.in(.95, 1.05);
  add(y, norm(strike([[480 * k, .03, .4], [1150 * k, .02, .8], [1900 * k, .012, .3]], .0008, .1)), 0, .6);
  add(y, norm(strike([[470 * k, .03, .4], [1120 * k, .02, .8]], .0009, .1)), .19, .35);
  add(y, norm(stickslip(r, .3, u => mix(36, 22, u), u => Math.sin(PI * u), [[720, 4, 1], [1300, 5, .6]], 1900, .3, .3)), .02, .3);
  for (let i = 0; i < 4; i++) add(y, twigTick(r), .03 + r() * .3, r.in(.06, .16));
  return norm(far(y, 5000));
};
G.hatch = r => {                     // the shell gives: a hollow pop, a last splinter
  const y = zeros(.7);
  add(y, drop(330, 170, .015, .002, .05, .2), 0, 1);
  add(y, norm(strike([[620, .03, .4], [1300, .02, .9], [2150, .012, .7], [3100, .008, .3]], .0005, .08)), 0, .7);
  add(y, G.crack(r, .9), .004, .55);
  return norm(far(y, 5200));
};
G.shells = r => {                    // shell pieces falling on twigs and stone, bouncing smaller and quicker until they lie still
  const y = zeros(1.6);
  for (let p = 0; p < 4; p++) { let t = r.in(0, .12) + p * .04, g = r.in(.6, 1), dt = r.in(.12, .2); const k = r.in(.85, 1.35);
    for (let i = 0; i < 6; i++) { add(y, norm(strike([[1250 * k * r.in(.97, 1.03), .03, .5], [2050 * k, .02, .8], [2900 * k, .012, .5], [3700 * k, .008, .2]], .0003, .07)), t, g); t += dt; dt *= .68; g *= .6; } }
  return norm(far(y, 5200));
};
// VOLCANO
G.boom = (r, big = 1) => {           // a pressure wave you feel, the blast, the long rumble rolling round the island, the cliffs answering
  const d = 6 + 3 * big, y = zeros(d);
  add(y, drop(46, 21, .35, .08, .9 + .5 * big, d * .6), 0, .7);                                   // the pressure wave swells in behind the shock
  add(y, norm(shaped(r, 2.6, u => mix(190, 55, Math.pow(u, .5)), .5, hump(.012, 2.4), 700, 1)), 0, .9);
  const pn = zeros(.25), L = .06 * SR; for (let i = 0; i < 24; i++) { const j = (Math.pow(r(), 2) * L) | 0, w = r.in(.006, .018) * SR | 0, a = r.in(.3, 1) * (r() < .5 ? -1 : 1) * (1 - j / L); for (let k = 0; k < w; k++) { pn[j + k] += a; pn[j + w + k] -= a; } }
  add(y, norm(far(pn, 900)), 0, .7);
  add(y, norm(shaped(r, d, u => 48 + 30 * Math.exp(-u * 3), .7, hump(.05, 1.1), 220, 1, [2.5, .65])), .1, .6);
  add(y, norm(shaped(r, d, u => 150 + 90 * Math.exp(-u * 2), .8, hump(.06, 1.3), 700, 0, [3.5, .7])), .15, .45);   // the rumble rolling round the island
  add(y, norm(shaped(r, 2.2, u => mix(420, 140, Math.pow(u, .6)), .5, hump(.01, 2), 1600, 0, [9, .4])), 0, .8);   // the air torn open
  add(y, G.roar(r, 3.5, { f: 200, lp: 1100, flick: 6, crack: 20, env: hump(.08, 1.3) }), .05, .5);                 // the column roaring up
  const e = y.slice(0, 2 * SR); add(y, far(e.slice(), 380), .42, .35); add(y, far(e, 260), 1.05, .22);
  return norm(fadeEnds(y, 0, d * .3));
};
G.rock = (r, size = 1) => {          // a stone striking stone: a few stiff modes, lower and longer the bigger it is
  const k = r.in(.8, 1.25) / Math.sqrt(size), y = zeros(.25 + .3 * size);
  add(y, norm(strike([[480 * k, .06 * size, .7], [1130 * k, .045 * size, .9], [1890 * k, .03 * size, .6], [2900 * k, .018, .3]], .0005 * (.6 + .4 * size), .2 + .3 * size)), 0, 1);
  if (size > 1.2) add(y, drop(150 / size, 85 / size, .02, .003, .03 * size, .25 + .2 * size), 0, .2 * size);
  return norm(far(y, 4500));
};
G.lava = (r, v = 1) => {             // a thick bubble of molten rock heaves and bursts: blorp, splat, the gas hissing out
  const y = zeros(1.4), n = .2 * SR | 0, f0 = r.in(58, 78), b = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const u = i / n; ph += TAU * f0 * (1 + 1.1 * Math.sin(PI * .5 * Math.min(1, u * 1.3))) / SR; b[i] = Math.sin(ph + .5 * Math.sin(ph)) * Math.min(1, u * 14) * Math.pow(1 - u, .6); }
  add(y, b, 0, 1);
  add(y, norm(shaped(r, .07, u => mix(420, 200, u), .9, hump(.1, 2), 1200)), .13, .6);
  add(y, drop(170, 85, .02, .003, .04, .15), .13, .45);
  add(y, norm(shaped(r, 1.1, u => mix(2000, 1300, u), .8, hump(.03, 1.6), 3400, 0, [30, .5])), .14, .22 * v);
  for (let j = 0; j < 2; j++) { const s = norm(b.slice(0, n * .7 | 0)); add(y, far(s, 900), r.in(.28, .55), r.in(.2, .35)); }
  return norm(fadeEnds(y, 0, .2));
};
G.bolt = r => {                      // the leader tearing the air: a ragged rip of shock waves into one crack
  const y = zeros(.5);
  for (let i = 0; i < 70; i++) { const t = Math.pow(r(), 1.8) * .16, j = t * SR | 0, w = r.in(.0006, .0025) * SR | 0, a = r.in(.2, 1) * Math.exp(-t / .07) * (r() < .5 ? -1 : 1); for (let k = 0; k < w && j + w + k < y.length; k++) { y[j + k] += a; y[j + w + k] -= a; } }
  far(y, 3000); add(y, norm(shaped(r, .45, u => mix(1400, 500, u), .6, hump(.01, 3), 2800)), 0, .3);
  return norm(fadeEnds(y, .001, .1));
};
G.grind = (r, d) => norm(stickslip(r, d, u => mix(18, 45, ss(0, .4, u)), u => Math.pow(Math.sin(PI * Math.min(1, u * 1.1)), .7), [[110, 3, 1], [190, 4, .9], [340, 4, .8], [620, 5, .6], [1100, 5, .3]], 1600, .35, .25));
// FIGHT
G.hit = (r, n = 0) => {              // two bodies the size of houses: the smack of hide, the meat under it, then teeth or claws
  const y = zeros(1.0), k = r.in(.85, 1.15);
  add(y, drop(120 * k, 60 * k, .04, .003, .07, .5), 0, .9);
  add(y, norm(shaped(r, .2, u => mix(900, 220, Math.pow(u, .5)) * k, .7, hump(.02, 2.4), 2200)), 0, 1);
  add(y, norm(strike([[190 * k, .15, .8], [340 * k, .1, 1], [560 * k, .07, .6], [900 * k, .04, .3]], .004, .5)), 0, .7);
  if (n % 3 === 1) { add(y, jaw(r), .13, .55); add(y, jaw(r), .168, .4); }
  else add(y, norm(stickslip(r, .38, u => mix(150, 85, u), u => Math.pow(Math.sin(PI * u), .8), [[1350 * k, 9, 1], [2150 * k, 10, .7], [2900 * k, 9, .25]], 3400, .12, .15)), .07, n % 3 === 2 ? .35 : .25);
  return norm(far(y, 5000));
};
G.body = (r, big = 1) => {           // a heavy body into rock: the slam, the rock answering, grit
  const y = zeros(1.0), k = 1 / Math.sqrt(big);
  add(y, drop(110 * k, 58 * k, .05, .004, .1, .7), 0, .7);
  add(y, norm(strike([[170 * k, .2, .7], [310 * k, .15, 1], [560 * k, .1, .8], [980 * k, .06, .5], [1600, .03, .25]], .005, .8)), 0, .8);
  add(y, norm(shaped(r, .3, u => mix(700, 220, u), .7, hump(.02, 2), 1800)), 0, .8);
  for (let i = 0; i < 24; i++) add(y, grit(r), .005 + .2 * Math.pow(r(), 1.5), r.in(.05, .18));
  return norm(far(y, 4800));
};
G.smash = r => {                     // the nest hit from the sky: twigs crushed, rock thumped, splinters flying
  const y = G.body(r, 1.1).slice(); const z = new Float32Array(y.length); add(z, y, 0, .8);
  for (let i = 0; i < 40; i++) add(z, twigTick(r), .004 + .3 * Math.pow(r(), 1.8), r.in(.1, .4));
  return norm(z);
};
G.masonry = r => {                   // the old wall's first block breaking: stone modes and a split
  const y = zeros(1.2);
  add(y, norm(strike([[140, .12, .5], [260, .12, .7], [480, .12, .9], [820, .1, .8], [1400, .07, .6], [2300, .05, .3]], .004, 1)), 0, 1);
  add(y, drop(90, 48, .05, .004, .12, .8), 0, .3);
  add(y, G.bolt(r).slice(0, .25 * SR), 0, .4);
  for (let i = 0; i < 20; i++) add(y, grit(r), .005 + .25 * Math.pow(r(), 1.5), r.in(.08, .25));
  return norm(far(y, 4200));
};
G.swat = (r, d = .45) => norm(shaped(r, d, u => mix(160, 420, u), .7, hump(.75, 4), 1100, 0, [9, .3]));
G.stoneCrack = r => norm(far(strike([[r.in(700, 1400), .012, .6], [r.in(1600, 2500), .008, .7], [r.in(2800, 3500), .005, .3]], .00035, .04), 4200));
// SMOKE AND FIRE-LIGHTING (the old one's cigarette)
G.draw = (r, d) => {                 // drawing on a cigarette: paper and tobacco crackling brighter, a thin in-breath
  const y = norm(shaped(r, d, () => 900, .8, u => .3 * ss(0, .6, u) * (1 - ss(.9, 1, u)), 2200));
  const n = d * 70 | 0; for (let i = 0; i < n; i++) { const u = Math.pow(r(), .7); add(y, tick(r, r.in(1200, 2400), .8), u * d * .96, r.in(.15, .6) * ss(0, .8, u)); }
  return norm(fadeEnds(far(y, 4500), .03, .03));
};
G.exhale = (r, d, strong = 0) => {   // a long breath of smoke let out through the teeth
  const y = norm(shaped(r, d, u => mix(strong ? 760 : 900, strong ? 460 : 600, u), .6, u => hump(.045, 1.4)(u) * (1 - .12 * Math.sin(TAU * 4.5 * u * d)), 2500, 0, [11, .35]));
  add(y, norm(shaped(r, d, () => 280, .7, hump(.06, 1.6), 600, 1)), 0, .5);
  return norm(fadeEnds(y, 0, .1));
};
G.pof = r => { const y = zeros(.6); add(y, drop(210, 120, .02, .004, .04, .15), 0, 1); add(y, norm(shaped(r, .05, () => 500, 1, hump(.2, 2), 1200)), 0, .4); add(y, G.exhale(r, .5), .05, .35); return norm(y); };   // a smoke ring: lips pop
G.tinyPuff = r => { const y = zeros(.5); add(y, drop(300, 200, .015, .003, .03, .1), 0, .6); add(y, norm(shaped(r, .3, u => mix(1250, 800, u), 1, hump(.06, 1.8), 2600)), 0, 1); return norm(y); };   // her smoke instead of fire
G.flint = r => {                     // steel on flint: two hard clicks and a few sparks dying in the air
  const y = zeros(.5), c = () => norm(far(strike([[r.in(1250, 1400), .02, .4], [r.in(2100, 2500), .012, .6], [r.in(3300, 3800), .008, .5], [650, .02, .4]], .00025, .05), 5200));
  add(y, c(), 0, 1); add(y, c(), r.in(.1, .13), .75);
  for (let i = 0; i < 6; i++) add(y, tick(r, r.in(2400, 3400), .6), .12 + .1 * Math.pow(r(), 1.5), r.in(.08, .2));
  add(y, norm(shaped(r, .08, () => 2600, 3, hump(.1, 2), 3800)), .12, .08);
  return norm(far(y, 5200));
};
G.sparks = (r, d = .6, n = 70) => {  // a sneeze of sparks: a soft spray of air and a crackle that dies away
  const y = zeros(d + .1);
  add(y, norm(shaped(r, .12, u => mix(1400, 800, u), .8, hump(.1, 1.8), 2400)), 0, .5);
  for (let i = 0; i < n; i++) { const u = Math.pow(r(), 1.7); add(y, tick(r, r.in(1300, 3600), r.in(.6, 1.2)), .01 + u * d * .9, r.in(.25, 1) * (1 - .7 * u)); }
  add(y, norm(shaped(r, d, () => 2200, 1.5, hump(.04, 2.2), 3800, 0, [50, .6])), .01, .18);
  return norm(far(y, 4800));
};
G.ignite = r => {                    // the cigarette catching: fsst and a few grains of tobacco popping
  const y = norm(shaped(r, .35, u => mix(1500, 900, u), 1.4, hump(.05, 1.5), 3200));
  for (let i = 0; i < 10; i++) add(y, tick(r, r.in(900, 2200)), .02 + .3 * r(), r.in(.1, .3));
  add(y, G.roar(r, .5, { f: 420, lp: 1100, flick: 18, crack: 4, env: hump(.1, 1.6) }), .03, .25);
  return norm(far(y, 4600));
};
G.stub = r => {                      // the cigarette ground out on rock: the ember sizzles, paper crumples, grit grinds
  const y = zeros(.8);
  add(y, norm(shaped(r, .35, u => mix(2200, 1400, u), 2.5, hump(.02, 1.2), 3600, 0, [60, .6])), 0, .55);
  add(y, norm(stickslip(r, .55, u => mix(55, 30, u), u => Math.pow(Math.sin(PI * u), .7), [[520, 5, 1], [880, 6, .7], [1500, 6, .35]], 2400, .25, .2)), .06, .8);
  for (let i = 0; i < 12; i++) add(y, crinkle(r), .05 + .45 * r(), r.in(.05, .2));
  return norm(far(y, 4600));
};
G.twig = r => {                      // she picks up a twig: a dry snap and it scratches the floor
  const y = zeros(.6);
  add(y, norm(strike([[r.in(700, 900), .015, .5], [1600, .012, .8], [2500, .008, .5]], .0003, .06)), 0, 1);
  add(y, norm(stickslip(r, .26, u => mix(90, 60, u), u => Math.sin(PI * u), [[1200, 6, 1], [1950, 7, .6]], 2600, .2, .2)), .12, .35);
  for (let i = 0; i < 3; i++) add(y, twigTick(r), .02 + .1 * r(), .25);
  return norm(far(y, 4800));
};
// FEET AND BODIES
G.pad = (r, surf = 'rock') => {      // a hatchling's soft pad, and what is underfoot: twigs crackle, gravel scatters, stone takes a claw tap
  const k = r.in(.9, 1.12), y = zeros(.24);
  add(y, drop(380 * k, 250 * k, .01, .0015, .016, .07), 0, .8);
  add(y, norm(shaped(r, .05, u => mix(1100, 600, u) * k, .8, hump(.1, 2), 2400)), 0, .5);
  if (surf === 'twig') for (let i = 0; i < 4; i++) add(y, twigTick(r), .003 + r() * .05, r.in(.35, .6));
  else if (surf === 'gravel') { for (let i = 0; i < 8; i++) add(y, grit(r), .002 + .06 * Math.pow(r(), 1.3), r.in(.25, .5)); add(y, norm(shaped(r, .08, () => 2000, .9, hump(.05, 2), 3500)), .005, .25); }
  else add(y, norm(strike([[r.in(1000, 1300), .02, .6], [r.in(2100, 2500), .012, .4]], .0005, .05)), 0, .3);
  return norm(far(y, 4400));
};
G.ashStep = r => {                   // the old one's shuffle: the foot dragged over grit, then the weight comes down on a leathery pad, claws ticking
  const k = r.in(.9, 1.1), lead = .22, y = zeros(.8), th = drop(120 * k, 70 * k, .03, .004, .07, .4);
  add(y, norm(shaped(r, lead + .06, u => mix(260, 480, u) * k, .9, u => Math.pow(Math.sin(PI * u), 1.3), 1500, 0, [38, .6])), 0, .14);
  add(y, th, lead, .7);
  add(y, norm(strike([[110 * k, .2, .8], [220 * k, .12, 1], [420 * k, .07, .6], [800 * k, .04, .3]], .006, .45)), lead, .7);
  add(y, norm(shaped(r, .08, u => mix(480, 260, u) * k, .8, hump(.08, 2), 1400)), lead, .6);
  for (let i = 0; i < 3; i++) add(y, norm(far(strike([[r.in(1500, 1900), .012, .6], [r.in(2400, 2800), .008, .4]], .0003, .03), 4200)), lead + .01 + i * r.in(.012, .025), .25);
  norm(y); y.sync = lead + onsetOf(th); return y;
};
G.fall = (r, n = 0) => {             // a hatchling hits the gravel, rolls once, and bonks her head
  const y = zeros(1.0), b = 1 + .12 * n;
  add(y, drop(170, 100, .02, .003, .05, .25), 0, 1);
  add(y, norm(shaped(r, .12, u => mix(520, 300, u), .8, hump(.03, 2), 1500)), 0, .55);
  for (let i = 0; i < 16; i++) add(y, grit(r), .005 + .35 * Math.pow(r(), 1.4), r.in(.1, .35));
  add(y, drop(150, 95, .02, .004, .04, .2), .15, .45);
  add(y, norm(strike([[310 * b, .09, 1], [720 * b, .05, .5], [1250 * b, .03, .2]], .0012, .3)), .31, .5);
  add(y, drop(420 * b, 300 * b, .03, .002, .06, .2), .31, .3);
  return norm(far(y, 4800));
};
G.shift = r => {                     // a heavy old body shifting on rock as it wakes; a few stones trickle
  const y = zeros(1.4);
  add(y, norm(shaped(r, .7, u => mix(200, 260, u), .8, hump(.3, 1.4), 900, 0, [7, .5])), 0, .8);
  add(y, norm(stickslip(r, .6, u => mix(26, 40, u), u => Math.sin(PI * u), [[180, 4, 1], [330, 5, .6], [600, 5, .3]], 1200, .3, .3)), .05, .5);
  for (let i = 0; i < 7; i++) add(y, G.rock(r, r.in(.25, .5)), .35 + .9 * r(), r.in(.08, .2));
  return norm(y);
};
G.wingLift = r => {                  // an old leather wing lifted and spread: the leather snaps open, joints creak, the membrane unfolds and settles over her
  const y = zeros(1.6);
  add(y, norm(far(strike([[230, .05, 1], [410, .03, .6], [760, .02, .25]], .003, .15), 1200)), 0, 1);
  add(y, norm(shaped(r, .12, u => mix(700, 380, u), 1, hump(.08, 2), 1600)), .004, .6);
  add(y, norm(stickslip(r, .9, u => mix(22, 48, u), u => Math.sin(PI * u), [[300, 6, 1], [520, 7, .8], [900, 6, .4]], 1600, .2, .15)), 0, .5);
  add(y, norm(shaped(r, 1.1, u => 380 + 160 * bump(.5, .5, u), .9, u => Math.pow(bump(.45, .5, u), 1.2), 1300, 0, [25, .7])), .05, .7);
  add(y, drop(120, 70, .04, .02, .1, .4), 1.0, .5);
  add(y, norm(shaped(r, .3, () => 260, .7, hump(.1, 1.6), 400, 1)), 1.0, .4);
  return norm(fadeEnds(y, 0, .1));
};
G.heartbeat = (r, k = 1) => {        // lub-dub, felt more than heard
  const y = zeros(.42);
  add(y, drop(68 * k, 46 * k, .03, .012, .045, .2), 0, 1); add(y, drop(150 * k, 105 * k, .02, .008, .03, .12), 0, .55);
  add(y, drop(82 * k, 58 * k, .02, .01, .035, .16), .15, .6); add(y, drop(170 * k, 120 * k, .015, .006, .02, .08), .15, .35);
  return norm(far(y, 420));
};
G.breath = (r, inh) => norm(shaped(r, inh ? .26 : .34, u => inh ? mix(1000, 1400, u) : mix(950, 700, u), .7, inh ? hump(.6, 1.2) : hump(.12, 1.6), 2600, 0, [inh ? 0 : 23, inh ? 0 : .3]));
G.glide = (r, d) => { const y = norm(shaped(r, d, u => 560 + 340 * bump(.5, .6, u), 1.1, u => Math.min(1, u * 9) * (.55 + .45 * bump(.5, .5, u)) * (1 - ss(.85, 1, u)), 1500, 0, [7, .35])); add(y, norm(shaped(r, d, () => 1250, 10, u => bump(.5, .5, u), 2000)), 0, .2); return norm(y); };   // air over small wings, a faint whistle
G.swirl = (r, d) => { const y = norm(shaped(r, d, u => 200 + 260 * (.5 + .5 * Math.sin(TAU * 1.6 * u * d)), 1, u => Math.pow(bump(.5, .5, u), 1.2) * (.6 + .4 * Math.sin(TAU * 1.6 * u * d + 1)), 1100, 0, [4, .4])); cloud(y, r, 140, () => d * (.12 + .76 * r()), () => .0015 * Math.pow(4, r()), .05); return norm(y); };   // the loong: a serpentine undulation with ink bubbling in it
G.dive = (r, d) => norm(shaped(r, d, u => mix(130, 520, Math.pow(u, 1.6)), .7, u => Math.pow(u, 2.2) * (1 - ss(.96, 1, u)), 1200, 0, [7, .3]));
G.burst = r => {                     // molten rock thrown up out of a crater
  const y = zeros(2.6);
  for (let i = 0; i < 4; i++) add(y, G.lava(r, 1), i * r.in(.05, .09), [1, .8, .7, .5][i]);
  add(y, G.roar(r, 2.4, { f: 230, lp: 1100, flick: 8, crack: 12, env: hump(.12, 1.2) }), .02, .9);
  add(y, drop(70, 36, .08, .006, .3, 1.2), 0, .8);
  return norm(y);
};

// ---------- placing ----------------------------------------------------------
// onset = first moment the 5 ms RMS reaches 30 % of the grain's early peak (first 0.31 s). ev() puts that moment on the Score time.
const ONS = new WeakMap();
function onsetOf(m) {
  let v = ONS.get(m); if (v !== undefined) return v;
  const W = 220, n = m.length, e = new Float32Array(n), pw = Math.min(n, .31 * SR | 0); let s = 0, pk = 0;
  for (let i = 0; i < n; i++) { s += m[i] * m[i]; if (i >= W) s -= m[i - W] * m[i - W]; e[i] = s; if (s > pk && i < pw) pk = s; }
  let k = 0; while (k < n && e[k] < pk * .09) k++;
  v = Math.max(0, k - W / 2) / SR; ONS.set(m, v); return v;
}
let ONLY = null, LOG = null;
const on = kind => !ONLY || ONLY === kind, bedOK = () => !ONLY;
function ev(o, kind, t, m, g, pan = 0) { if (!on(kind)) return; if (LOG) LOG.push({ kind, t }); put(o, m, t - (m.sync !== undefined ? m.sync : onsetOf(m)), g, pan); }
// several grains sounding as one event (two wings): their summed onset lands on t
function evMany(o, kind, t, parts) {
  if (!on(kind)) return; if (LOG) LOG.push({ kind, t });
  let n = 0; for (const [m] of parts) n = Math.max(n, m.length);
  const sum = new Float32Array(n); for (const [m, g, pan] of parts) { const a = (clamp(pan, -1, 1) + 1) * .25 * PI, k = g * (Math.cos(a) + Math.sin(a)); for (let i = 0; i < m.length; i++) sum[i] += m[i] * k; }
  const o0 = onsetOf(sum); for (const [m, g, pan] of parts) put(o, m, t - o0, g, pan);
}
function at(o, kind, t, m, g, pan = 0) { if (on(kind)) put(o, m, t, g, pan); }
const vg = (db, v) => dB(db) * Math.pow(v || 1, .7);
const EV = (tr, a, b, f) => (S.tracks[tr] || []).filter(e => e.t >= a && e.t < b && (!f || f(e)));

// ---------- the clock ---------------------------------------------------------
const T = S.T, C = S.CUE, BY = S.byName, END = S.DUR, SIL = C.SILENCE, D0 = C.DAWN0, ALONE = C.ALONE, BLUE = C.BLUE;
const gA = smooth(101), gB = smooth(102), gC = smooth(103);
const gust = (t, k = 1) => clamp(.55 + .45 * k * (.62 * gA(t * .23) + .42 * gB(t * .61) + .2 * gC(t * 1.7)), .05, 1.5);

// rain on sea and stone: a hiss of a million drops, the roar on the water, bubbles, taps on rock
function rain(o, t0, t1, amt, r, seed, muff = 1) {
  if (!bedOK()) return;
  const lp = 4200 * muff;
  layer(o, t0, t1, { seed, q: .5, lp, width: .95, tex: [9, .3], f: () => 2000 * muff, g: t => dB(-35) * amt(t) });
  layer(o, t0, t1, { seed: seed + 1, mode: 'lp', lp: 900, width: .9, tex: [4, .3], f: () => 380, g: t => dB(-32) * amt(t) });
  const dr = bank(20, () => muff < 1 ? far(G.dropGrain(r, .0009, .0032).slice(), 2600) : G.dropGrain(r, .0009, .0032)), tp = bank(10, () => G.stoneTap(r));
  sprinkle(o, t0, t1, r, t => 150 * amt(t), t => put(o, r.pick(dr), t, dB(r.in(-46, -34)), r.bi() * .95));
  sprinkle(o, t0, t1, r, t => 30 * amt(t), t => put(o, r.pick(tp), t, dB(r.in(-50, -40)) * muff, r.bi() * .9));
}
function wind(o, t0, t1, w, db, seed, f0 = 260, whistle = 0) {
  if (!bedOK()) return; const n = smooth(seed * 7 + 1);
  layer(o, t0, t1, { seed, q: .8, lp: 1500, width: .85, tex: [7, .5], f: t => f0 * (.75 + .5 * w(t)), g: t => dB(db) * Math.pow(w(t), 1.6), pan: t => .45 * n(t * .3) });
  layer(o, t0, t1, { seed: seed + 1, mode: 'lp', lp: 300, width: .9, tex: [3, .6], f: () => 110, g: t => dB(db + 1) * Math.pow(w(t), 2) });
  if (whistle) layer(o, t0, t1, { seed: seed + 2, q: 8, lp: 1800, width: .5, tex: [5, .7], f: t => whistle * (.9 + .25 * w(t)), g: t => dB(db - 9) * Math.pow(w(t), 2.2), pan: t => .5 * n(t * .5 + 9) });
}
function sea(o, t0, t1, amp, r, db, seed, calm = 1) {   // swell + laps (calm) or crashes (rough)
  if (!bedOK()) return; const n = smooth(seed);
  const sw = t => .6 + .4 * Math.sin(TAU * t / 7.3 + 1.3 * n(t * .05));
  layer(o, t0, t1, { seed, mode: 'lp', lp: calm ? 520 : 800, width: .9, tex: [1.3, .35], f: () => calm ? 170 : 120, g: t => dB(db) * amp(t) * sw(t) });
  if (calm) { const lp = bank(6, i => G.lap(r, .45 + .25 * (i % 3))); for (let t = t0 + .5; t < t1 - .8; t += r.in(1.2, 2.4)) put(o, r.pick(lp), t, dB(r.in(db + 3, db + 10)) * amp(t), r.bi() * .85); }
  else { const sf = bank(4, i => G.surf(r, .6 + .25 * i)); for (let t = t0 + .3; t < t1 - 1; t += r.in(2.6, 4.4)) put(o, r.pick(sf), t, dB(r.in(db + 4, db + 8)) * amp(t), r.bi() * .7); }
}
function gulls(o, ts, r, db) { if (!bedOK()) return; for (const t of ts) put(o, G.gull(r, { n: 2 + (r() * 3 | 0), f: r.in(720, 860) }), t, dB(db + r.in(-4, 0)), r.bi() * .8); }
function caveTone(o, t0, t1, amp, seed) {
  if (!bedOK()) return;
  layer(o, t0, t1, { seed, q: 2, lp: 400, width: .7, tex: [.7, .4], f: () => 78, g: t => dB(-44) * amp(t) });
  layer(o, t0, t1, { seed: seed + 1, q: 3, lp: 600, width: .8, tex: [1.1, .5], f: () => 190, g: t => dB(-50) * amp(t) });
}
function drips(o, t0, t1, r, rate, db) { if (!bedOK()) return; const b = bank(8, () => cavern(G.drip(r))); sprinkle(o, t0, t1, r, () => rate, t => put(o, r.pick(b), t, dB(r.in(db - 6, db)), r.bi() * .8)); }

// ---------- jobs ----------------------------------------------------------------
const J = {};
const job = (id, bus, send, run) => { J[id] = { bus, send, run }; };

// ==== AMBIENCE ====
job('amb.ink', 'amb', .12, () => {             // the paper itself, barely there, until the colour floods
  const t1 = C.WORLD + 1, o = Out(0, t1), n1 = smooth(11);
  if (bedOK()) layer(o, 0, t1, { seed: 12, mode: 'lp', lp: 700, width: .9, tex: [3, .4], f: t => 380 + 60 * n1(t * .3), g: t => dB(-54) * (1 - ss(C.COLOR, C.WORLD + .8, t)) });
  return finish(o, .4, .3);
});
job('amb.sunset', 'amb', .12, () => {          // a calm sea at sunset, lapping; a soft breeze, stronger up on the crag
  const a = C.COLOR - .1, b = C.ERUPT + .25, o = Out(a, b), r = RNG(21), n2 = smooth(23);
  const fade = t => ss(C.COLOR, C.WORLD + .5, t), low = t => fade(t) * mix(1, .55, ss(C.LAND - 1.5, C.LAND + .5, t));
  sea(o, a, b, low, r, -33, 24, 1);
  if (bedOK()) layer(o, a, b, { seed: 25, q: .8, lp: 1300, width: .85, tex: [6, .5], f: t => 300 + 80 * n2(t * .2), g: t => dB(-41) * fade(t) * mix(1, 1.6, ss(C.LAND - 1, C.LAND + 1, t)) * Math.pow(clamp(.6 + .5 * n2(t * .17 + 3), .15, 1.3), 1.5), pan: t => .4 * n2(t * .21) });
  return finish(o, .5, .25);
});
job('amb.attack', 'amb', .1, () => {           // storm: heavy surf, gusts, the mountain growling under everything
  const a = C.ERUPT - .15, b = SIL + .05, o = Out(a, b), r = RNG(31), up = t => ss(a, a + .4, t);
  sea(o, a, b, up, r, -28, 32, 0);
  wind(o, a, b, t => gust(t, 1.2) * up(t), -30, 33, 210, 640);
  if (bedOK()) layer(o, a, b, { seed: 36, mode: 'lp', lp: 140, width: .6, tex: [1.5, .5], f: () => 45, g: t => dB(-29) * ss(C.ERUPT, C.ERUPT + 2, t) });
  return finish(o, .02, .02);
});
job('amb.loss', 'amb', .2, () => {             // after the blast: only ash falling, a hush with soft flakes landing
  const a = SIL, b = D0 + .8, o = Out(a, b), r = RNG(41), env = t => ss(SIL + .6, SIL + 2.2, t) * (1 - ss(D0 - .3, D0 + .8, t));
  if (bedOK()) {
    layer(o, a, b, { seed: 42, mode: 'lp', lp: 600, width: .95, tex: [2, .4], f: () => 300, g: t => dB(-50) * env(t) });
    const fl = bank(6, () => norm(far(strike([[r.in(500, 900), .01, .6]], .002, .03), 1200)));
    sprinkle(o, a, b, r, t => 4 * env(t) + .01, t => put(o, r.pick(fl), t, dB(r.in(-56, -49)) * env(t), r.bi() * .9));
  }
  return finish(o, .01, .3);
});
job('amb.hatch', 'amb', .12, () => {           // dawn on the crag: quiet sea below, gulls, a little air
  const a = D0 - .2, b = C.CAVE + 1.2, o = Out(a, b), r = RNG(51), n = smooth(52), env = t => ss(D0, D0 + 1.2, t) * (1 - ss(C.CAVE - .2, C.CAVE + 1.1, t));
  sea(o, a, b, env, r, -38, 53, 1);
  if (bedOK()) layer(o, a, b, { seed: 54, q: .8, lp: 1200, width: .85, tex: [6, .5], f: t => 320 + 60 * n(t * .2), g: t => dB(-44) * env(t) });
  gulls(o, [D0 + 1.4, D0 + 4.6, D0 + 8.1], r, -31);
  return finish(o, .05, .3);
});
job('amb.cave', 'amb', .35, () => {            // the old one's cave: stone room tone, slow echoing drips, the sea outside
  const a = C.CAVE - .6, b = C.RAIN + .8, o = Out(a, b), r = RNG(61), env = t => ss(C.CAVE - .5, C.CAVE + .8, t) * (1 - ss(C.RAIN - .3, C.RAIN + .8, t));
  caveTone(o, a, b, env, 62);
  if (bedOK()) layer(o, a, b, { seed: 64, mode: 'lp', lp: 380, width: .9, tex: [.2, .6], f: () => 140, g: t => dB(-42) * env(t) });
  drips(o, C.CAVE, C.RAIN, r, .9, -30);
  return finish(o, .2, .3);
});
job('amb.shelter', 'amb', .3, () => {          // night rain: heavy outside the cave mouth, on stone and on the sea; drips near
  const a = C.RAIN - .5, b = C.TRAIN + .6, o = Out(a, b), r = RNG(71), env = t => ss(C.RAIN - .5, C.RAIN + .4, t) * (1 - ss(C.TRAIN - .3, C.TRAIN + .6, t));
  rain(o, a, b, env, r, 72, .75);
  caveTone(o, a, b, t => .7 * env(t), 74);
  if (bedOK()) { const pl = bank(8, () => G.plink(r, r.in(.003, .006))); sprinkle(o, a, b, r, t => 3 * env(t), t => put(o, r.pick(pl), t, dB(r.in(-36, -28)) * env(t), r.bi() * .6)); }
  drips(o, C.RAIN, C.TRAIN, r, 1.2, -32);
  sea(o, a, b, t => .7 * env(t), r, -36, 76, 0);
  return finish(o, .1, .3);
});
job('amb.train', 'amb', .1, () => {            // morning on the ledge: wind with a whistle in the rock, surf below
  const a = C.TRAIN - .5, b = C.RETURN + .6, o = Out(a, b), r = RNG(81), env = t => ss(C.TRAIN - .4, C.TRAIN + .5, t) * (1 - ss(C.RETURN - .2, C.RETURN + .6, t));
  wind(o, a, b, t => gust(t, .9) * env(t), -33, 82, 260, 880);
  sea(o, a, b, env, r, -35, 85, 0);
  gulls(o, [C.TRAIN + 1.1, C.TRAIN + 6.3], r, -33);
  return finish(o, .1, .3);
});
job('amb.climax', 'amb', .12, () => {          // the plateau: the mountain awake, lava ticking, wind; after the stone falls, rain
  const a = C.RETURN - .3, b = C.DAWN + 2.6, o = Out(a, b), r = RNG(91), vol = t => ss(a, C.RETURN + .5, t) * (1 - .6 * ss(BLUE, BLUE + 3, t)) * (1 - ss(C.CRUMBLE + 1, C.DAWN, t));
  if (bedOK()) {
    layer(o, a, b, { seed: 92, mode: 'lp', lp: 140, width: .6, tex: [1.5, .5], f: () => 48, g: t => dB(-30) * vol(t) });
    const bl = bank(5, () => far(G.lava(r, .4).slice(), 700)); sprinkle(o, a, C.CRUMBLE, r, () => 1.3, t => put(o, r.pick(bl), t, dB(r.in(-40, -32)) * vol(t), r.bi() * .8));
  }
  wind(o, a, b, t => gust(t, 1.1) * vol(t), -32, 94, 220, 700);
  rain(o, C.CRUMBLE, b, t => ss(C.CRUMBLE + .3, C.CRUMBLE + 1.6, t) * (1 - ss(C.DAWN, C.DAWN + 2.4, t)), r, 96, 1);
  return finish(o, .1, .2);
});
job('amb.dawn', 'amb', .12, () => {            // sunrise: a calm sea, gulls; then the wind of flight; then the paper again
  const a = C.DAWN - .3, b = END, o = Out(a, b), r = RNG(101), n = smooth(102), env = t => ss(C.DAWN - .2, C.DAWN + 1.5, t) * (1 - ss(C.INK_BACK, S.T_END, t));
  const fly = t => ss(C.FLY - .4, C.FLY + .9, t) * (1 - ss(C.INK_BACK - .2, S.T_END - .2, t));
  sea(o, a, b, t => env(t) * (1 - .4 * fly(t)), r, -35, 103, 1);
  if (bedOK()) {
    layer(o, a, b, { seed: 104, q: .8, lp: 1200, width: .85, tex: [6, .5], f: t => 320 + 60 * n(t * .2), g: t => dB(-43) * env(t) });
    layer(o, a, b, { seed: 105, q: .9, lp: 1500, width: .9, tex: [5, .45], f: t => 300 + 180 * fly(t) + 50 * n(t * .7), g: t => dB(-30) * fly(t), pan: t => .3 * n(t * .4 + 5) });   // air rushing past in flight
    layer(o, a, b, { seed: 106, mode: 'lp', lp: 300, width: .9, tex: [3, .5], f: () => 120, g: t => dB(-31) * fly(t) });
    layer(o, a, b, { seed: 107, mode: 'lp', lp: 700, width: .9, tex: [3, .4], f: () => 400, g: t => dB(-54) * ss(C.INK_BACK, S.T_END, t) });   // the paper
  }
  gulls(o, [C.DAWN + .8, C.DAWN + 3.6, C.WAKE + 2.7, C.FLY + 1.5, C.FLY + 4.2], r, -30);
  return finish(o, .1, 1);
});

// ==== EFFECTS ====
job('fx.ink', 'fx', .25, () => {               // the painting: paper laid, a brush stroke for every koto pluck, the seal, the flood of colour
  const o = Out(0, C.WORLD + .6), r = RNG(111);
  at(o, 'PAINT0', C.PAINT0 + .02, G.paper(r, 1.5), dB(-24), -.1);
  const st = EV('stroke', 0, C.WORLD); for (const [i, e] of st.entries()) ev(o, 'stroke', e.t, G.brush(r, Math.min(e.d, ((st[i + 1] || { t: e.t + 1 }).t - e.t) * .85), e.m), vg(-15, .7 + .3 * (e.i % 3 === 0)), clamp((e.m - 64) / 24, -.6, .6));
  ev(o, 'INK_SEAL', C.INK_SEAL, G.seal(r), dB(-9), .25);
  at(o, 'COLOR', C.COLOR, G.wash(r, C.WORLD - C.COLOR + .4, 1), dB(-17), 0);
  return finish(o, .01, .3);
});
job('fx.love', 'fx', .2, () => {              // two flying at sunset: every downstroke on the waltz
  const a = C.WORLD - .6, b = C.LAND - .2, o = Out(a, b), r = RNG(121), pn = { noct: -.35, lune: .35 };
  for (const e of EV('flap_pair', a, b)) { const g = vg(-16, e.v); if (e.who === 'both') evMany(o, 'flap_pair', e.t, [[G.wing(r, 'noct'), g * .85, -.4], [G.wing(r, 'lune'), g * .85, .4]]); else ev(o, 'flap_pair', e.t, G.wing(r, e.who), g, pn[e.who]); }
  return finish(o, .1, .1);
});
job('fx.nest', 'fx', .2, () => {              // landing on the crag, the egg glowing on each hummed note, the cuddle
  const a = C.LAND - 1, b = C.ERUPT + .02, o = Out(a, b), r = RNG(131);
  at(o, 'LAND', C.LAND - .45, G.dive(r, .45), dB(-24), -.2);
  const land = zeros(1.4); add(land, G.body(r, .55), 0, .7); add(land, norm(shaped(r, .5, u => mix(320, 200, u), .8, hump(.1, 1.6), 1200)), .01, .5); for (let i = 0; i < 14; i++) add(land, twigTick(r), .01 + .3 * Math.pow(r(), 1.5), r.in(.15, .4)); add(land, G.body(r, .5), .34, .4);
  ev(o, 'LAND', C.LAND, norm(far(land, 4500)), dB(-12), 0);
  const h1 = S.lines.find(l => l.id === 'h1');
  if (h1 && on('EGG')) for (const nt of h1.notes) { const d = nt.t1 - nt.t0 + .5; put(o, G.hum(mtof(nt.midi + 12), d), nt.t0, dB(-31), .1); }
  at(o, 'CUDDLE', C.CUDDLE - .1, norm(shaped(r, 1.8, () => 560, .8, u => Math.pow(bump(.4, .45, u), 1.2), 1400, 0, [28, .7])), dB(-28), 0);
  at(o, 'CUDDLE', C.CUDDLE + .9, G.wingLift(r), dB(-27), .2);
  return finish(o, .1, .02);
});
job('fx.attack.big', 'fx', .25, () => {       // the mountain: the eruption, Cinder bursting up, the plunge, the last blast
  const a = C.ERUPT - .1, b = SIL + .05, o = Out(a, b), r = RNG(141), rk = bank(16, i => G.rock(r, .4 + .1 * i));
  const rocks = (t0, dur, n, db) => { if (!on('rocks')) return; for (let i = 0; i < n; i++) { const u = Math.pow(r(), 1.3); put(o, far(r.pick(rk).slice(), r.in(1400, 3800)), t0 + u * dur, dB(r.in(db - 10, db)) * (1 - .6 * u), r.bi() * .9); } };
  ev(o, 'ERUPT', C.ERUPT, G.boom(r, 1), dB(-3), 0); rocks(C.ERUPT + 1.1, 5, 70, -16);
  ev(o, 'CINDER_UP', C.CINDER_UP, norm(far(G.burst(r), 1800)), dB(-8), .35); rocks(C.CINDER_UP + .6, 2.5, 20, -20);
  ev(o, 'PLUNGE', C.PLUNGE, G.burst(r), dB(-6), .3);
  ev(o, 'BLAST', C.BLAST, G.boom(r, 1.4), dB(-2), 0); rocks(C.BLAST + .3, 1.5, 40, -12);
  return finish(o, .02, .02);
});
job('fx.attack.fight', 'fx', .2, () => {      // the fight: his huge fiery wingbeats, theirs, every blow, the nest struck, the wall
  const a = C.ERUPT - .4, b = SIL + .05, o = Out(a, b), r = RNG(151);
  for (const e of EV('flap_cinder', a, b)) ev(o, 'flap_cinder', e.t, G.wing(r, 'cinder'), vg(-10, e.v), .3);
  for (const e of EV('flap_pair', a, b)) ev(o, 'flap_pair', e.t, G.wing(r, e.who), vg(-19, e.v), e.who === 'noct' ? -.45 : .1);
  let k = 0; for (const e of EV('hit', a, b)) ev(o, 'hit', e.t, G.hit(r, k++), vg(-7, e.v), r.bi() * .3);
  at(o, 'STRIKE_NEST', C.STRIKE_NEST - 1.25, G.dive(r, 1.25), dB(-12), .2);
  ev(o, 'STRIKE_NEST', C.STRIKE_NEST, G.smash(r), dB(-7), 0);
  ev(o, 'WALL_CRASH', C.WALL_CRASH, G.masonry(r), dB(-6), -.2);
  if (on('WALL_CRASH')) { const rk = bank(12, i => G.rock(r, .5 + .15 * i)); for (let i = 0; i < 60; i++) { const u = Math.pow(r(), 1.5); put(o, r.pick(rk), C.WALL_CRASH + .04 + u * 2.4, dB(r.in(-22, -12)) * (1 - .65 * u), -.2 + r.bi() * (.2 + .6 * u)); }
    put(o, norm(shaped(r, 2.6, () => 1000, .6, hump(.15, 1.2), 2400, 0, [12, .5])), C.WALL_CRASH + .05, dB(-27), -.2); }
  return finish(o, .1, .02);
});
job('fx.attack.sky', 'fx', .25, () => {       // lava bursting on the drums, lightning on the cymbals with its thunder behind
  const a = C.ERUPT - .1, b = SIL + .05, o = Out(a, b), r = RNG(161), dly = [.35, .8, .25, .55];
  for (const e of EV('lava', a, b)) ev(o, 'lava', e.t, G.lava(r, e.v), vg(-13, e.v), r.in(.1, .6));
  EV('bolt', a, b).forEach((e, i) => { const d = dly[i % 4]; ev(o, 'bolt', e.t, G.bolt(r), dB(-11), r.bi() * .5); at(o, 'bolt', e.t + d, G.thunder(r, { near: 1 - d, dur: 4.5, claps: 4 }), dB(-9 - 6 * d), r.bi() * .4); });
  return finish(o, .02, .02);
});
job('fx.hatch', 'fx', .25, () => {            // the egg hums, rocks, cracks three times and pops; shell bits settle; first steps; a sneeze of sparks
  const a = D0, b = C.CAVE + .4, o = Out(a, b), r = RNG(171);
  if (on('EGG')) { const h = G.hum(mtof(74), C.HATCH - D0 - .6); put(o, h, D0 + .6, dB(-36), 0); for (const e of EV('celesta', D0, C.HATCH)) put(o, G.hum(mtof(e.m), 1), e.t, dB(-38), 0); }
  for (const e of EV('crack', a, b)) {
    if (e.hatch) { ev(o, 'crack', e.t, G.hatch(r), dB(-8), 0); at(o, 'crack', e.t + .1, G.shells(r), dB(-14), .15); }
    else { ev(o, 'crack', e.t, G.crack(r, .3 + .25 * e.n), vg(-12, e.v), 0); at(o, 'crack', e.t + .07, G.wobble(r), dB(-20), 0); }
  }
  for (const e of EV('step_ember', a, b)) ev(o, 'step_ember', e.t, G.pad(r, 'twig'), vg(-19, e.v), .1);
  for (const e of EV('sneeze', a, b, e => !e.lights)) ev(o, 'sneeze', e.t, G.sparks(r, .55, 60), dB(-12), .1);
  return finish(o, .01, .3);
});
job('fx.cave', 'fx', .35, () => {             // the old smoker: feet, draws and puffs, smoke in her face, the twig, the flint, the sneeze that lights it
  const a = C.CAVE - .9, b = C.RAIN + .3, o = Out(a, b), r = RNG(181), steps = bank(5, () => cavern(G.pad(r, 'rock'), .6));
  for (const e of EV('step_ember', a, b)) ev(o, 'step_ember', e.t, r.pick(steps), vg(-19, e.v), .25);
  for (const e of EV('puff', a, b)) {
    const face = Math.abs(e.t - C.SMOKE_FACE) < .01, dd = .5;
    at(o, 'puff', e.t - dd - .16, G.draw(r, dd), dB(-25), -.3);      // the draw, a beat of holding it, then the smoke
    if (e.ring) ev(o, 'puff', e.t, G.pof(r), dB(-15), -.3);
    else if (face) { const m = G.exhale(r, 1.4, 1); if (on('puff')) { LOG && LOG.push({ kind: 'puff', t: e.t }); putPath(o, m, e.t - onsetOf(m), u => dB(-12), u => mix(-.35, .4, ss(0, .7, u))); } }
    else ev(o, 'puff', e.t, G.exhale(r, .9), vg(-16, e.v), -.3);
  }
  ev(o, 'IMITATE', C.IMITATE, G.twig(r), dB(-17), .3);
  for (const e of EV('spark', a, b)) ev(o, 'spark', e.t, G.flint(r), dB(-13), -.25);
  for (const e of EV('sneeze', a, b, e => e.lights)) { ev(o, 'sneeze', e.t, G.sparks(r, .5, 55), dB(-12), .15); at(o, 'sneeze', e.t + .16, G.ignite(r), dB(-17), -.25); }
  return finish(o, .05, .25);
});
job('fx.shelter', 'fx', .35, () => {          // the wing lifted over her, his shuffle, the last cigarette ground out, her heart asleep
  const a = C.RAIN, b = C.TRAIN + .2, o = Out(a, b), r = RNG(191);
  ev(o, 'WING', C.WING, G.wingLift(r), dB(-15), -.15);
  for (const e of EV('step_ash', a, b)) ev(o, 'step_ash', e.t, G.ashStep(r), vg(-12, e.v), -.2);
  ev(o, 'STUB', C.STUB, G.stub(r), dB(-15), -.2);
  if (on('ASLEEP')) { const bs = BY.shelter.beatS; for (let t = C.ASLEEP + .1, i = 0; t < C.TRAIN - .3; t += bs, i++) put(o, G.heartbeat(r, 1.15), t, dB(-24) * ss(C.ASLEEP, C.ASLEEP + 1, t), .1); }
  return finish(o, .01, .2);
});
job('fx.train', 'fx', .15, () => {            // the ledge: little running steps, three falls, a puff of smoke, the glide
  const a = C.TRAIN - .3, b = C.RETURN + .1, o = Out(a, b), r = RNG(201);
  for (const e of EV('step_ember', a, b)) ev(o, 'step_ember', e.t, G.pad(r, 'gravel'), vg(-18, e.v), .1);
  for (const e of EV('fall', a, b)) ev(o, 'fall', e.t, G.fall(r, e.n), dB(-10), .1 + .1 * e.n);
  for (const e of EV('puff', a, b)) ev(o, 'puff', e.t, G.tinyPuff(r), dB(-17), .1);
  at(o, 'GLIDE', C.GLIDE, G.glide(r, BY.train.barS), dB(-14), 0);
  return finish(o, .05, .1);
});
job('fx.climax.a', 'fx', .2, () => {          // Cinder again: the fissure, his wings and lava, lightning, Ash standing and swatted down, the fire at her
  const a = C.RETURN - .3, b = ALONE + .02, o = Out(a, b), r = RNG(211);
  ev(o, 'RETURN', C.RETURN, norm(G.grind(r, 2.6)), dB(-11), .2);
  if (on('RETURN')) { put(o, G.roar(r, 3.2, { f: 260, lp: 1100, flick: 9, crack: 6, env: hump(.25, 1.1) }), C.RETURN + .5, dB(-10), .25); for (let i = 0; i < 6; i++) put(o, G.lava(r, 1), C.RETURN + .5 + i * r.in(.2, .45), dB(-16), .2 + r.bi() * .3); for (let i = 0; i < 24; i++) put(o, G.rock(r, r.in(.5, 1.5)), C.RETURN + .05 + 2.4 * Math.pow(r(), 1.3), dB(r.in(-24, -14)), .2 + r.bi() * .5); }
  for (const e of EV('flap_cinder', a, b)) ev(o, 'flap_cinder', e.t, G.wing(r, 'cinder'), vg(-10, e.v), .2);
  for (const e of EV('lava', a, b)) ev(o, 'lava', e.t, G.lava(r, e.v), vg(-14, e.v), r.in(.1, .5));
  for (const e of EV('bolt', a, b)) { ev(o, 'bolt', e.t, G.bolt(r), dB(-11), -.3); at(o, 'bolt', e.t + .45, G.thunder(r, { near: .55, dur: 4, claps: 4 }), dB(-12), -.2); }
  ev(o, 'ASH_STANDS', C.ASH_STANDS, G.ashStep(r), dB(-10), -.1);
  for (const e of EV('hit', a, b, e => e.who === 'ash')) { at(o, 'hit', e.t - .42, G.swat(r), dB(-14), .2); ev(o, 'hit', e.t, G.body(r, 1.4), dB(-5), -.3);
    if (on('hit')) for (let i = 0; i < 25; i++) put(o, G.rock(r, r.in(.25, .6)), e.t + .15 + 1.5 * Math.pow(r(), 1.4), dB(r.in(-30, -20)), -.3 + r.bi() * .3); }
  if (on('CINDER_FIRE')) { const d = ALONE - C.CINDER_FIRE + .3; evMany(o, 'CINDER_FIRE', C.CINDER_FIRE, [[G.roar(r, d, { f: 250, lp: 1700, flick: 14, crack: 30, env: u => Math.min(1, u * d / .04) * (1 - .2 * u) }), dB(-7), .25], [G.roar(r, d, { f: 300, lp: 1500, flick: 11, crack: 20, env: u => Math.min(1, u * d / .06) }), dB(-10), -.3], [drop(90, 45, .05, .006, .2, .8), dB(-9), 0]]); }
  return finish(o, .05, .01);
});
job('fx.alone', 'fx', .1, () => {             // the hole in the music: only her breath and her heart, quickening
  const a = ALONE - .02, b = BLUE + .25, o = Out(a, b), r = RNG(221);
  if (on('ALONE')) {
    put(o, G.breath(r, 0), ALONE + .12, dB(-27), .1); put(o, G.breath(r, 1), ALONE + .55, dB(-31), .1); put(o, G.breath(r, 0), ALONE + .82, dB(-30), .1);
    for (let t = ALONE + .05; t < BLUE - .05;) { put(o, G.heartbeat(r, 1.25), t, dB(-17), .05); t += 60 / mix(115, 170, ss(ALONE, BLUE, t)); }
  }
  return finish(o, .01, .2);
});
job('fx.climax.b', 'fx', .3, () => {          // BLUE: her fire grows for five seconds and sings; the loong; Cinder turns to stone and falls
  const a = BLUE - .05, b = C.DAWN + .6, o = Out(a, b), r = RNG(231);
  ev(o, 'BLUE', BLUE, G.blueWhoosh(r), dB(-8), 0);
  if (on('BLUE')) {
    const t1 = BLUE + 5.6, n = smooth(232), env = t => { const x = t - BLUE; return x < 0 ? 0 : Math.min(1, x / .05) * (.4 + .6 * ss(0, 4.6, x)) * (1 - ss(4.9, 5.6, x)); };
    layer(o, BLUE, t1, { seed: 233, q: 1.3, lp: 3300, width: .7, tex: [17, .45], f: t => 820 + 700 * ss(BLUE, BLUE + 4.6, t) + 90 * n(t * 2), g: t => dB(-19) * env(t), pan: t => .2 * n(t * .7) });
    layer(o, BLUE, t1, { seed: 234, q: .6, lp: 900, width: .8, tex: [9, .5], f: t => 240 + 60 * ss(BLUE, BLUE + 4.6, t), g: t => dB(-19) * env(t) });
    const bs = BY.climax.barS, sh = [smooth(235), smooth(236), smooth(237)];
    for (let bar = 5; bar < 9; bar++) { const s0 = T('climax', bar), s1 = s0 + bs; if (s0 > t1) break;
      const pcs = [...new Set(S.chordAt(s0 + .01).notes.slice(3).map(m => { while (m < 75) m += 12; while (m >= 87) m -= 12; return m; }))].slice(0, 3);
      pcs.forEach((m, k) => { const f = mtof(m), i0 = Math.max(0, Math.round((Math.max(BLUE, s0 - .06) - o.t0) * SR)), i1 = Math.min(o.n, Math.round((Math.min(t1, s1 + .06) - o.t0) * SR)), pan = (k - 1) * .45, gl = Math.cos((pan + 1) * PI / 4), gr = Math.sin((pan + 1) * PI / 4);
        let p1 = 0, p2 = 0; for (let i = i0; i < i1; i++) { const t = o.t0 + i / SR, xf = Math.min(1, (t - Math.max(BLUE, s0 - .06)) / .06, (Math.min(t1, s1 + .06) - t) / .06), vib = 1 + .004 * Math.sin(TAU * 5.3 * t + k), a = dB(-27) * env(t) * xf * (.6 + .4 * sh[k](t * 5));
          p1 += TAU * f * vib / SR; p2 += TAU * f * 1.0015 * vib / SR; const v = Math.sin(p1) + .25 * Math.sin(2 * p1 + 1), w = Math.sin(p2) + .25 * Math.sin(2 * p2 + 1); o.L[i] += a * v * gl; o.R[i] += a * w * gr; } }); }
    const gl = bank(10, () => { const f = r.in(1500, 2100); return norm(strike([[f, r.in(.12, .3), .7], [f * 2.76, .06, .25]], .0003, .5)); });
    sprinkle(o, BLUE + .1, t1 - .3, r, t => 8 + 30 * ss(BLUE, BLUE + 4.5, t), t => put(o, r.pick(gl), t, dB(r.in(-36, -27)) * env(t), r.bi() * .8));
  }
  for (const e of EV('flap_ember', a, b)) ev(o, 'flap_ember', e.t, G.wing(r, 'ember'), vg(-20, e.v), -.15);
  if (on('LOONG')) { const d = 2.6, m = G.swirl(r, d); putPath(o, m, C.LOONG, u => dB(-20), u => mix(-.7, .7, u)); }
  for (const e of EV('hit', a, b, e => e.petrify)) { ev(o, 'hit', e.t, G.stoneCrack(r), dB(-11), 0);
    if (on('hit')) { const d = C.CRUMBLE - e.t + .2, ck = bank(12, () => G.stoneCrack(r)); for (let i = 0; i < 240; i++) { const u = Math.pow(r(), .8); put(o, r.pick(ck), e.t + .03 + u * d, dB(r.in(-30, -20)) * (.5 + .5 * u), r.bi() * (.15 + .75 * u)); } put(o, norm(stickslip(r, d, u => mix(22, 40, u), u => Math.pow(Math.sin(PI * Math.min(1, u * 1.1)), .7), [[140, 4, 1], [260, 5, .7], [480, 5, .4]], 900, .3, .25)), e.t, dB(-20), 0); } }
  ev(o, 'CRUMBLE', C.CRUMBLE, G.masonry(r), dB(-5), 0);
  if (on('CRUMBLE')) { const rk = bank(20, i => G.rock(r, .3 + .09 * i)); for (let i = 0; i < 160; i++) { const u = Math.pow(r(), 1.6); put(o, r.pick(rk), C.CRUMBLE + .05 + 3.2 * u, dB(r.in(-22, -11)) * (1 - .6 * u), r.bi() * .9); }
    put(o, norm(shaped(r, 3.5, () => 90, .7, hump(.1, 1.2), 300, 1)), C.CRUMBLE, dB(-12), 0); put(o, norm(shaped(r, 3.5, () => 1100, .6, hump(.2, 1.2), 2600, 0, [12, .5])), C.CRUMBLE + .1, dB(-27), 0); }
  return finish(o, .01, .3);
});
job('fx.dawn', 'fx', .2, () => {              // she runs to him; he wakes; his fire comes back; they fly; the second heart; the joke; ink; the seal
  const a = C.DAWN - .3, b = END, o = Out(a, b), r = RNG(241);
  for (const e of EV('step_ember', a, b)) ev(o, 'step_ember', e.t, G.pad(r, 'rock'), vg(-18, e.v), .1);
  ev(o, 'WAKE', C.WAKE, G.shift(r), dB(-15), -.15);
  ev(o, 'ASH_FIRE', C.ASH_FIRE, G.flame(r, .8), dB(-12), -.15);
  for (const e of EV('flap_ember', a, b)) ev(o, 'flap_ember', e.t, G.wing(r, 'ember'), vg(-20, e.v), .3);
  for (const e of EV('flap_ash', a, b)) ev(o, 'flap_ash', e.t, G.wing(r, 'ash'), vg(-15, e.v), -.3);
  if (on('HEART2')) { const d = 1.25, s0 = C.HEART2 - 1.3, bl = norm(shaped(r, d, u => 900 + 500 * u, 1.4, u => Math.pow(bump(.55, .45, u), 1.6), 3200, 0, [15, .4])), or = G.roar(r, d, { f: 330, lp: 1300, flick: 12, crack: 8, env: u => Math.pow(bump(.55, .45, u), 1.6) });   // the trails swell and close just before the heart
    putPath(o, bl, s0, () => dB(-19), u => mix(-.8, -.05, ss(0, .9, u))); putPath(o, or, s0, () => dB(-19), u => mix(.8, .05, ss(0, .9, u))); }
  ev(o, 'HEART2', C.HEART2, G.bloom(r), dB(-13), 0);
  for (const e of EV('puff', a, b, e => e.blue)) ev(o, 'puff', e.t, G.bluePuff(r), dB(-12), .1);
  at(o, 'INK_BACK', C.INK_BACK, G.wash(r, 1.2, -1), dB(-19), 0); at(o, 'INK_BACK', C.INK_BACK + .25, G.brush(r, .6, 60), dB(-20), -.2);
  for (const e of EV('clack', a, b)) ev(o, 'clack', e.t, G.seal(r), dB(-8), .2);
  return finish(o, .05, .5);
});

// ---------- hard silences: everything stops dead at SILENCE and for the ALONE bar, except what the story keeps ----
const HOLES = [[SIL, D0, 'amb.loss'], [ALONE, BLUE, 'fx.alone']];
function hole(o, a, b) {
  const F = .008 * SR | 0, U = .003 * SR | 0, ia = Math.round((a - o.t0) * SR), ib = Math.round((b - o.t0) * SR);   // 8 ms out, ending on the cue; 3 ms back in, starting on the cue
  for (const X of [o.L, o.R]) for (let i = Math.max(0, ia - F); i < Math.min(o.n, ib + U); i++) X[i] *= i < ia ? .5 + .5 * Math.cos(PI * (i - ia + F) / F) : i < ib ? 0 : .5 - .5 * Math.cos(PI * (i - ib) / U);
}

// ---------- live one-shots -----------------------------------------------------
const mono = (m, g = 1, pan = 0) => { const a = (pan + 1) * .25 * PI, L = new Float32Array(m.length), R = new Float32Array(m.length); for (let i = 0; i < m.length; i++) { L[i] = m[i] * g * Math.cos(a) * 1.414; R[i] = m[i] * g * Math.sin(a) * 1.414; } fadeEnds(L, .0006, .02); fadeEnds(R, .0006, .02); return { L, R }; };
const sc = (st, g) => { for (const X of [st.L, st.R]) for (let i = 0; i < X.length; i++) X[i] *= g; return st; };
const KINDS = {
  puff: r => mono(G.exhale(r, r.in(.6, 1)), dB(-14)), spark: r => mono(G.flint(r), dB(-14)), sneeze: r => mono(G.sparks(r, .5, 50), dB(-13)),
  crack: r => mono(G.crack(r, r.in(.4, .8)), dB(-13)), splash: r => sc(G.splash(r, r.in(.8, 1.4)), dB(-11)), whoosh: r => mono(G.wing(r, r() < .5 ? 'noct' : 'lune'), dB(-12), r.bi() * .3),
  thud: r => mono(G.body(r, r.in(.6, 1)), dB(-10)), flame: r => mono(G.flame(r, r.in(.6, 1)), dB(-11)), blue: r => mono(G.bluePuff(r), dB(-11)),
  chirp: r => mono(G.chirp(r), dB(-18), r.bi() * .5), stone: r => mono(G.rock(r, r.in(.4, 1.2)), dB(-14), r.bi() * .3),
};
// ---------- catalogue of every named sound, alone (tests, sound table) ----------
const CAT = {
  'wing pair noct': r => G.wing(r, 'noct'), 'wing pair lune': r => G.wing(r, 'lune'), 'wing cinder': r => G.wing(r, 'cinder'), 'wing ash': r => G.wing(r, 'ash'), 'wing ember': r => G.wing(r, 'ember'),
  'brush stroke': r => G.brush(r, .5, 62), 'paper rustle': r => G.paper(r), 'seal stamp': r => G.seal(r), 'ink wash': r => G.wash(r, 2.5, 1),
  'lap (calm sea)': r => G.lap(r, .7), 'surf (storm)': r => G.surf(r, 1), 'gull': r => G.gull(r), 'cave drip': r => cavern(G.drip(r)), 'rain drop': r => G.dropGrain(r, .0009, .0032),
  'egg hum': () => G.hum(mtof(81), 1), 'egg wobble': r => G.wobble(r), 'egg crack': r => G.crack(r, .5), 'hatch pop': r => G.hatch(r), 'shells settle': r => G.shells(r),
  'eruption boom': r => G.boom(r, 1), 'rock': r => G.rock(r, 1), 'lava blorp': r => G.lava(r, 1), 'lightning crack': r => G.bolt(r), 'thunder roll': r => G.thunder(r, { near: .5, dur: 4.5 }), 'fissure grind': r => G.grind(r, 2.6), 'crater burst': r => G.burst(r),
  'hit body': r => G.hit(r, 0), 'hit + jaws': r => G.hit(r, 1), 'hit + claws': r => G.hit(r, 2), 'masonry': r => G.masonry(r), 'body into rock': r => G.body(r, 1.4), 'nest smash': r => G.smash(r), 'dive': r => G.dive(r, 1.2),
  'cig draw': r => G.draw(r, .55), 'exhale': r => G.exhale(r, .9), 'smoke stream': r => G.exhale(r, 1.4, 1), 'smoke ring': r => G.pof(r), 'flint': r => G.flint(r), 'sneeze sparks': r => G.sparks(r, .55, 60), 'cig ignite': r => G.ignite(r), 'stub out': r => G.stub(r), 'twig': r => G.twig(r),
  'step ember twig': r => G.pad(r, 'twig'), 'step ember rock': r => G.pad(r, 'rock'), 'step ember gravel': r => G.pad(r, 'gravel'), 'step ash': r => G.ashStep(r), 'fall + bonk': r => G.fall(r, 0), 'ash wakes': r => G.shift(r),
  'wing lift': r => G.wingLift(r), 'heartbeat': r => G.heartbeat(r, 1.2), 'breath out': r => G.breath(r, 0), 'tiny puff': r => G.tinyPuff(r), 'glide': r => G.glide(r, 1.8), 'loong swirl': r => G.swirl(r, 2.6),
  'cinder fire': r => G.roar(r, 2, { f: 250, lp: 1700, flick: 14, crack: 30, env: u => Math.min(1, u * 30) * (1 - .2 * u) }), 'blue whoosh': r => G.blueWhoosh(r), 'ash flame': r => G.flame(r, .8), 'fires meet': r => G.bloom(r), 'blue puff + ash': r => G.bluePuff(r), 'stone crackle': r => G.stoneCrack(r),
};
return {
  SR, marks: {}, gen: G, RNG,
  jobs: () => Object.keys(J),
  render(id, opt = {}) {
    const j = J[id]; if (!j) throw new Error('FOLEY: no job ' + id);
    ONLY = opt.only || null; LOG = opt.log ? [] : null; let o;
    try { o = j.run(); } finally { ONLY = null; }
    for (const [a, b, keep] of HOLES) if (keep !== id && o.t0 < b && o.t0 + o.n / SR > a - .01) hole(o, a, b);
    if (!opt.only) ride(o, dB(-3.2));
    const log = LOG; LOG = null;
    return { id, t0: o.t0, L: o.L, R: o.R, bus: j.bus, send: j.send, keep: id === 'amb.loss' ? 'silence' : id === 'fx.alone' ? 'alone' : undefined, log };
  },
  kinds: () => Object.keys(KINDS),
  oneshot(kind, seed = 1) { const k = KINDS[kind]; if (!k) throw new Error('FOLEY: no one-shot ' + kind); let h = 7; for (let i = 0; i < kind.length; i++) h = Math.imul(h, 31) + kind.charCodeAt(i) | 0; return k(RNG(h ^ Math.imul(seed | 0, 7919))); },
  catalogue: () => Object.keys(CAT),
  sound(name, seed = 1) { const x = CAT[name](RNG(seed * 131 + 17)); return x.L ? x : { L: x, R: x }; },
};
})();
if (typeof module !== 'undefined') module.exports = FOLEY;
