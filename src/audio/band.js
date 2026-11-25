// ============================================================================
// band.js - the orchestra of ASH & EMBER. Koto, shakuhachi, harp, strings (pads, tremolo, spiccato ostinato, pizzicato),
// contrabass (+ a felt sub in the fights), celesta and music box, a wordless choir, French horns, bassoon, taiko, timpani,
// gong, cymbals, shaker, woodblock, the wooden seal stamp and two risers (air, a breath).
// Plain typed-array DSP, deterministic, no libraries, no samples.
//
//   BAND.jobs()                 -> ids 'section.group' ('love.harp', 'climax.choir', ...): one instrument group in one section
//   BAND.render(id)             -> { id, lane:'band', sec, t0, L, R, send, keep, mk }   film seconds, SR 44100
//                                  send = reverb send 0..1; keep = 'silence'|'alone' when it must sound through a hard silence;
//                                  mk = makeup gain (the stem itself peaks <= -3 dBFS)
//   BAND.oneshot(kind, midi, vel) -> { L, R, lead }   live notes: koto harp celesta taiko wood (heard onset at `lead` = 10 ms)
//
// THE RULE: the band plays exactly the notes of Score.tracks and nothing else; every onset is the score's time (no humanizing
// beyond 1.5 ms). Ornaments live inside a note: the koto's bent attack and yuri, the shakuhachi's breath and meri scoop,
// tremolo, a horn's swell, the wood stinger's flam. Every time comes from Score.
// Sounding model (kept from Built for Two): sustained tones are banks of true harmonics moved by effort (nothing aliases),
// struck and plucked tones are decaying partials, the koto is a Karplus-Strong string; each instrument then speaks through
// its own synthesized stereo body (modal impulse response, convolved).
// ============================================================================
const BAND = (() => {
'use strict';
const SC = typeof Score !== 'undefined' ? Score : require('../06_score.js');
const SR = 44100, TAU = Math.PI * 2, B = 64, BR = SR / B;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), hz = m => 440 * Math.pow(2, (m - 69) / 12);
const lerp = (a, b, u) => a + (b - a) * u;
const tab = (t, x) => { if (x <= t[0][0]) return t[0][1]; for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return lerp(t[i - 1][1], t[i][1], (x - t[i - 1][0]) / (t[i][0] - t[i - 1][0])); return t[t.length - 1][1]; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
let LOG = null;                                      // tests switch this on to read what was played
const note = (S, k, t, d, m) => { if (LOG) LOG.push([S.id, k, t, d, m]); };
const voice = (notes, k) => notes.filter(e => e.ms.length > k).map(e => Object.assign({}, e, { m: e.ms[k] }));
function Rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed | 0;
  const u = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => clamp(Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(TAU * u()), -2.4, 2.4);
  return { u, g, r: (x, y) => x + (y - x) * u(), i: () => u() * 4294967296 | 0 };
}
// ---------------------------------------------------------------- FFT: radix-4 DIF forward (bit-reversed out), DIT inverse. Convolution never needs the order.
const PLANS = {};
function plan(n) { let p = PLANS[n]; if (p) return p; const m = (n * 3 / 4 | 0) + 1, c = new Float64Array(m), s = new Float64Array(m); for (let k = 0; k < m; k++) { c[k] = Math.cos(TAU * k / n); s[k] = Math.sin(TAU * k / n); } return PLANS[n] = { c, s }; }
function fwd(x, y, n) {
  const { c, s } = plan(n); let len = n;
  for (; len > 4; len >>= 2) {
    const q = len >> 2, st = n / len;
    for (let o = 0; o < n; o += len) for (let j = 0, k = 0; j < q; j++, k += st) {
      const c1 = c[k], s1 = s[k], c2 = c[2 * k], s2 = s[2 * k], c3 = c[3 * k], s3 = s[3 * k], a = o + j, b = a + q, d = b + q, e = d + q;
      const ar = x[a], ai = y[a], br = x[b], bi = y[b], dr = x[d], di = y[d], er = x[e], ei = y[e];
      const t0r = ar + dr, t0i = ai + di, t2r = ar - dr, t2i = ai - di, t1r = br + er, t1i = bi + ei, t3r = br - er, t3i = bi - ei;
      x[a] = t0r + t1r; y[a] = t0i + t1i;
      let r = t0r - t1r, i = t0i - t1i; x[b] = r * c2 + i * s2; y[b] = i * c2 - r * s2;
      r = t2r + t3i; i = t2i - t3r; x[d] = r * c1 + i * s1; y[d] = i * c1 - r * s1;
      r = t2r - t3i; i = t2i + t3r; x[e] = r * c3 + i * s3; y[e] = i * c3 - r * s3;
    }
  }
  if (len === 4) for (let a = 0; a < n; a += 4) {
    const ar = x[a], ai = y[a], br = x[a + 1], bi = y[a + 1], dr = x[a + 2], di = y[a + 2], er = x[a + 3], ei = y[a + 3];
    const t0r = ar + dr, t0i = ai + di, t2r = ar - dr, t2i = ai - di, t1r = br + er, t1i = bi + ei, t3r = br - er, t3i = bi - ei;
    x[a] = t0r + t1r; y[a] = t0i + t1i; x[a + 1] = t0r - t1r; y[a + 1] = t0i - t1i; x[a + 2] = t2r + t3i; y[a + 2] = t2i - t3r; x[a + 3] = t2r - t3i; y[a + 3] = t2i + t3r;
  }
  if (len === 2) for (let a = 0; a < n; a += 2) { const r = x[a + 1], i = y[a + 1]; x[a + 1] = x[a] - r; y[a + 1] = y[a] - i; x[a] += r; y[a] += i; }
}
function inv(x, y, n) {
  const { c, s } = plan(n); let len = 4;
  if (Math.round(Math.log2(n)) & 1) { for (let a = 0; a < n; a += 2) { const r = x[a + 1], i = y[a + 1]; x[a + 1] = x[a] - r; y[a + 1] = y[a] - i; x[a] += r; y[a] += i; } len = 8; }
  for (; len <= n; len <<= 2) {
    const q = len >> 2, st = n / len;
    for (let o = 0; o < n; o += len) for (let j = 0, k = 0; j < q; j++, k += st) {
      const c1 = c[k], s1 = s[k], c2 = c[2 * k], s2 = s[2 * k], c3 = c[3 * k], s3 = s[3 * k], a = o + j, b = a + q, d = b + q, e = d + q;
      const br = x[b], bi = y[b], dr0 = x[d], di0 = y[d], er = x[e], ei = y[e];
      const z1r = br * c2 - bi * s2, z1i = bi * c2 + br * s2, z2r = dr0 * c1 - di0 * s1, z2i = di0 * c1 + dr0 * s1, z3r = er * c3 - ei * s3, z3i = ei * c3 + er * s3;
      const t0r = x[a] + z1r, t0i = y[a] + z1i, t1r = x[a] - z1r, t1i = y[a] - z1i, t2r = z2r + z3r, t2i = z2i + z3i, dr = z3r - z2r, di = z3i - z2i;
      x[a] = t0r + t2r; y[a] = t0i + t2i; x[d] = t0r - t2r; y[d] = t0i - t2i; x[b] = t1r + di; y[b] = t1i - dr; x[e] = t1r - di; y[e] = t1i + dr;
    }
  }
}
// two mono inputs through two stereo responses, added into L,R. 1 forward + 1 inverse FFT per block.
function conv2(x1, x2, h1, h2, L, R, gain = 1, off = 0) {
  const nx = x1.length, m = Math.max(h1[0].length, h2 ? h2[0].length : 0); let N = 1 << 14; while (N < m * 3.2) N <<= 1;
  const hop = N - m, re = new Float64Array(N), im = new Float64Array(N), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N), k = gain / N;
  for (let i = 0; i < h1[0].length; i++) { ar[i] = h1[0][i] * k; ai[i] = h1[1][i] * k; } fwd(ar, ai, N);
  if (h2) { for (let i = 0; i < h2[0].length; i++) { br[i] = h2[0][i] * k; bi[i] = h2[1][i] * k; } fwd(br, bi, N); }
  for (let p = 0; p < nx; p += hop) {
    const e = Math.min(hop, nx - p); let any = 0;
    for (let i = 0; i < e; i++) { const v = x1[p + i]; re[i] = v; any += v < 0 ? -v : v; } for (let i = e; i < N; i++) re[i] = 0;
    if (x2) { for (let i = 0; i < e; i++) { const v = x2[p + i]; im[i] = v; any += v < 0 ? -v : v; } for (let i = e; i < N; i++) im[i] = 0; } else im.fill(0);
    if (any === 0) continue;
    fwd(re, im, N);
    if (x2) {
      const one = (P, Q) => {
        const zr = re[P], zi = im[P], wr = re[Q], wi = -im[Q], xr = (zr + wr) * .5, xi = (zi + wi) * .5, ur = (zi - wi) * .5, ui = (wr - zr) * .5;
        const yr = (wr + zr) * .5, yi = -xi, vr = ur, vi = -ui, g1r = ar[P], g1i = ai[P], g2r = br[P], g2i = bi[P], f1r = ar[Q], f1i = ai[Q], f2r = br[Q], f2i = bi[Q];
        re[P] = xr * g1r - xi * g1i + ur * g2r - ui * g2i; im[P] = xr * g1i + xi * g1r + ur * g2i + ui * g2r;
        if (Q !== P) { re[Q] = yr * f1r - yi * f1i + vr * f2r - vi * f2i; im[Q] = yr * f1i + yi * f1r + vr * f2i + vi * f2r; }
      };
      one(0, 0); for (let w = 1; w < N; w <<= 1) { const s = 3 * w - 1; for (let P = w; P <= s - P; P++) one(P, s - P); }
    } else for (let i = 0; i < N; i++) { const a = re[i], b = im[i]; re[i] = a * ar[i] - b * ai[i]; im[i] = a * ai[i] + b * ar[i]; }
    inv(re, im, N);
    const o = p + off, lim = Math.min(N, L.length - o); for (let i = 0; i < lim; i++) { L[o + i] += re[i]; R[o + i] += im[i]; }
  }
}
// ---------------------------------------------------------------- bodies: modal impulse responses, stereo, one per instrument
// sig: [f, Q, gain]; then a dense random field from lo..hi with spacing sp0..sp1 and gain curve env; dir = direct sound [gain, hp, lp]
const KIND = {
  violin: { sig: [[278, 14, .9], [408, 17, .8], [462, 19, 1.2], [548, 19, 1.2], [690, 18, .7]], lo: 760, hi: 6800, sp: [58, 165], env: [[560, .95], [900, .72], [1300, .62], [1900, .66], [2600, .72], [3400, .58], [4300, .38], [5400, .24], [6800, .12]], dir: [.17, 420, 5600], hp: 170, n: 9000, sym: [[55, 62, 69, 76], 1.0, 5.0e-5], ref: [300, 2400] },
  viola: { sig: [[222, 13, 1], [274, 16, .8], [338, 17, 1.2], [402, 18, 1.25], [456, 18, 1.1]], lo: 505, hi: 5000, sp: [48, 150], env: [[400, 1.1], [560, .98], [750, .86], [1050, .76], [1500, .70], [2000, .64], [2600, .54], [3300, .42], [4200, .28], [5200, .16]], dir: [.16, 320, 4800], hp: 115, n: 10000, sym: [[48, 55, 62, 69], 1.2, 5.0e-5], ref: [220, 2000] },
  cello: { sig: [[97, 12, .8], [148, 15, 1], [176, 17, 1.3], [203, 18, 1.25], [234, 18, 1.1]], lo: 262, hi: 4400, sp: [37, 120], env: [[200, 1.3], [330, 1.15], [480, .98], [700, .80], [950, .70], [1300, .66], [1800, .58], [2300, .50], [3000, .38], [3800, .25], [4600, .14]], dir: [.16, 220, 4000], hp: 55, n: 12000, sym: [[36, 43, 50, 57], 1.5, 5.0e-5], ref: [100, 1200] },
  bass: { sig: [[60, 9, .9], [98, 11, 1.1], [124, 13, 1.1], [170, 14, 1]], lo: 205, hi: 2600, sp: [30, 100], env: [[100, 1.2], [250, 1], [420, .7], [700, .46], [1100, .34], [1700, .22], [2600, .08]], dir: [.16, 130, 1900], hp: 32, n: 12000, ref: [60, 700] },
  guitar: { sig: [[102, 11, 1.1], [196, 15, 1.25], [236, 18, .8], [318, 18, .7], [392, 20, .8]], lo: 430, hi: 4800, sp: [42, 140], env: [[400, .9], [700, .75], [1100, .62], [1700, .60], [2500, .52], [3400, .38], [4800, .20]], dir: [.26, 160, 5600], hp: 62, n: 10000, ref: [140, 1600] },
  harp: { sig: [[112, 8, .5], [152, 11, .9], [193, 12, 1], [228, 13, .9]], lo: 250, hi: 6000, sp: [33, 125], env: [[250, 1], [500, 1], [900, .9], [1400, .78], [2100, .62], [3000, .42], [4200, .24], [6000, .10]], dir: [.2, 125, 5000], hp: 70, n: 11000, sym: [[38, 40, 42, 43, 45, 47, 49, 50, 52, 54, 55, 57, 59, 61, 62, 64, 66, 67, 69, 71, 73, 74], 1.7, 1.6e-5], ref: [150, 1800] },
  piano: { sig: [[62, 8, .8], [93, 9, 1], [131, 10, 1.1], [178, 11, 1], [223, 12, .9]], lo: 262, hi: 4600, sp: [34, 130], env: [[260, 1], [500, .92], [900, .8], [1500, .6], [2300, .42], [3200, .25], [4600, .1]], dir: [.34, 60, 3800], hp: 38, n: 12000, ref: [100, 1600] },
  box: { sig: [[430, 5, .5], [760, 5, .6], [1180, 5, .45], [1900, 5, .3], [2700, 5, .18]], lo: 3000, hi: 5600, sp: [260, 420], env: [[3000, .18], [5600, .06]], dir: [.75, 160, 5600], hp: 110, n: 3200, ref: [250, 2000] },
  pipe: { sig: [[310, 3, .3], [1150, 4, .25], [1700, 4, .18]], lo: 3000, hi: 3600, sp: [400, 500], env: [[3000, .05], [3600, .03]], dir: [.9, 90, 4200], hp: 80, n: 2200, ref: [200, 1600] },
  horn: { sig: [[210, 3, .35], [520, 3, .5], [840, 4, .35], [1300, 4, .2]], lo: 2000, hi: 2600, sp: [260, 400], env: [[2000, .06], [2600, .03]], dir: [.7, 50, 2600], hp: 42, n: 4200, ref: [90, 1000] },
  metal: { sig: [], lo: 900, hi: 5200, sp: [300, 520], env: [[900, .22], [2400, .2], [5200, .12]], dir: [1, 160, 9000], hp: 180, n: 3600, ref: [600, 4000] },
  skin: { sig: [[84, 5, .6], [140, 6, .5], [260, 6, .3]], lo: 400, hi: 2400, sp: [160, 300], env: [[400, .2], [2400, .06]], dir: [.8, 30, 3200], hp: 30, n: 5000, ref: [60, 800] },
};
// ---- this film's own bodies: the koto's long paulownia box, the taiko's barrel, the air in front of a choir, nothing at all
Object.assign(KIND, {
  koto: { sig: [[96, 7, .7], [148, 10, 1.1], [205, 12, 1.2], [271, 14, 1], [356, 15, .8], [455, 16, .7]], lo: 540, hi: 5600, sp: [40, 150], env: [[540, .95], [900, .8], [1500, .68], [2300, .6], [3200, .44], [4400, .26], [5600, .12]], dir: [.30, 110, 5600], hp: 60, n: 9000, ref: [140, 2200] },
  taiko: { sig: [[62, 4, .9], [104, 5, .8], [168, 6, .6], [236, 7, .4]], lo: 300, hi: 1800, sp: [120, 260], env: [[300, .3], [1800, .08]], dir: [.8, 22, 2600], hp: 24, n: 7000, ref: [40, 600] },
  choir: { sig: [], lo: 650, hi: 4200, sp: [190, 330], env: [[650, .16], [4200, .06]], dir: [.92, 80, 6500], hp: 70, n: 3000, ref: [150, 2500] },
});
delete KIND.violin.sym; delete KIND.viola.sym; delete KIND.cello.sym;            // short bodies: the room is the mix's business
const BODY = {};
function body(kind, v = 0) {
  const key = kind + v; if (BODY[key]) return BODY[key];
  const K = KIND[kind], rg = Rng('body' + key), nb = K.n, n = K.sym ? Math.round(K.sym[1] * 1.15 * SR) : nb, L = new Float64Array(n), R = new Float64Array(n), modes = [];
  for (const [f, q, g] of K.sig) { const s = rg.u() < .5 ? 1 : -1; modes.push([f * rg.r(.97, 1.03), q * rg.r(.85, 1.2), s * g * rg.r(.8, 1.2), .22]); }
  for (let f = K.lo; f < K.hi;) { const sp = lerp(K.sp[0], K.sp[1], clamp((f - K.lo) / 2600, 0, 1)); modes.push([f, f / (22 + f * .022) * rg.r(.8, 1.25), tab(K.env, f) * Math.pow(10, rg.g() * 2.6 / 20) * (rg.u() < .5 ? -1 : 1), .55]); f += sp * rg.r(.6, 1.4); }
  for (const [f, q, g, sd] of modes) {
    const bw = f / q, a = g * TAU * bw / SR, r = Math.exp(-Math.PI * bw / SR), w = TAU * f / SR, k1 = 2 * r * Math.cos(w), k2 = r * r, gl = a * (1 + sd * rg.g() * .8), gr = a * (1 + sd * rg.g() * .8), pl = rg.r(-.6, .6), pr = pl + sd * rg.g() * .9;
    let y1 = Math.sin(pl - w) / r, y2 = Math.sin(pl - 2 * w) / k2, z1 = Math.sin(pr - w) / r, z2 = Math.sin(pr - 2 * w) / k2; const e = Math.min(n, Math.ceil(9.2 / (Math.PI * bw) * SR));
    for (let i = 0; i < e; i++) { const y = k1 * y1 - k2 * y2, z = k1 * z1 - k2 * z2; y2 = y1; y1 = y; z2 = z1; z1 = z; L[i] += gl * y; R[i] += gr * z; }
  }
  const [dg, dh, dl] = K.dir, al = 1 - Math.exp(-TAU * dl / SR), ah = 1 - Math.exp(-TAU * dh / SR); let p = 0, q = 0, h = 0;
  for (let i = 0; i < 900; i++) { p += al * ((i === 1 ? 1 : 0) - p); q += al * (p - q); h += ah * (q - h); const d = dg * (q - h); L[i] += d; R[i] += d; }
  { const a = 1 - Math.exp(-TAU * K.hp / SR); for (const X of [L, R]) for (let pass = 0; pass < 2; pass++) { let s = 0; for (let i = 0; i < n; i++) { s += a * (X[i] - s); X[i] -= s; } } }      // what a body this size cannot move
  for (const X of [L, R]) { for (let i = nb - 1500; i < nb; i++) { const u = (nb - i) / 1500; X[i] *= u * u * (3 - 2 * u); } for (let i = nb; i < n; i++) X[i] = 0; }
  // unit rms response over the instrument's own range
  const re = new Float64Array(nb); for (let i = 0; i < nb; i++) re[i] = (L[i] + R[i]) * .5;
  let s = 0, c = 0; for (let f = K.ref[0]; f < K.ref[1]; f *= 1.03) { const w = TAU * f / SR; let a = 0, b = 0, cr = 1, ci = 0; const cw = Math.cos(w), sw = Math.sin(w); for (let i = 0; i < nb; i += 1) { a += re[i] * cr; b += re[i] * ci; const t = cr * cw - ci * sw; ci = cr * sw + ci * cw; cr = t; } s += a * a + b * b; c++; }
  const g = 1 / Math.sqrt(s / c), out = [new Float32Array(n), new Float32Array(n)]; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  if (K.sym) { const [ms, t60, a0] = K.sym; for (const m of ms) for (let k = 1; k <= 7; k++) { const f = hz(m) * k * (1 + rg.g() * .0006); if (f > 2600) break; const d = t60 * Math.pow(k, -.35), w = TAU * f / SR, r = Math.exp(-6.9078 / (d * SR)), k1 = 2 * r * Math.cos(w), k2 = r * r, gl = a0 * Math.pow(k, -.5) * rg.r(.6, 1.4), gr = a0 * Math.pow(k, -.5) * rg.r(.6, 1.4), pl = rg.r(-3, 3), pr = pl + rg.g() * .8; let y1 = Math.sin(pl - w) / r, y2 = Math.sin(pl - 2 * w) / k2, z1 = Math.sin(pr - w) / r, z2 = Math.sin(pr - 2 * w) / k2; for (let i = 0; i < n; i++) { const y = k1 * y1 - k2 * y2, z = k1 * z1 - k2 * z2; y2 = y1; y1 = y; z2 = z1; z1 = z; const u = i < 600 ? i / 600 : n - i < 4000 ? (n - i) / 4000 : 1; L[i] += gl * y * u; R[i] += gr * z * u; } } }
  for (let i = 0; i < n; i++) { out[0][i] = L[i]; out[1][i] = R[i]; }
  return BODY[key] = out;
}
// a player evens out the instrument: how loudly this body answers this note, and the correction a good hand makes (about 70 % of it)
const EVEN = {};
function even(kind, v, m, slope = 1, fc = 2200) {
  const key = kind + v + '|' + m + '|' + slope; if (EVEN[key] !== undefined) return EVEN[key];
  const [l, r] = body(kind, v), f0 = hz(m), n = KIND[kind].n; let s = 0, c = 0;
  for (let h = 1; h <= 14 && h * f0 < 5000; h++) { const w = TAU * h * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), q = h * f0 / fc, a = Math.pow(h, -slope) / (1 + q * q); let cr = 1, ci = 0, x = 0, y = 0, z = 0, u = 0; for (let i = 0; i < n; i++) { x += l[i] * cr; y += l[i] * ci; z += r[i] * cr; u += r[i] * ci; const t = cr * cw - ci * sw; ci = cr * sw + ci * cw; cr = t; } s += a * a * (x * x + y * y + z * z + u * u) * .5; c += a * a; }
  return EVEN[key] = clamp(Math.pow(c / (s + 1e-9), .36), .42, 2.4);
}
// ---------------------------------------------------------------- a stem: mono streams -> bodies -> stereo ('none' = straight in)
function Stem(id, sec, t0, t1, send, keep) {
  const n = Math.ceil((t1 - t0) * SR / B) * B, st = {};
  const S = { id, sec, t0, n, send, L: new Float32Array(n), R: new Float32Array(n), nb: n / B,
    x(kind, v = 0, pan = 0, g = 1) { const k = kind + '|' + v + '|' + pan + '|' + g; return (st[k] = st[k] || { kind, v, pan, g, x: new Float32Array(n) }).x; },
    done(o = {}) {
      const list = Object.values(st), cv = list.filter(s => s.kind !== 'none'), dry = list.filter(s => s.kind === 'none'), pg = s => { const a = (s.pan + 1) * Math.PI / 4; return [Math.cos(a) * Math.SQRT2 * s.g, Math.sin(a) * Math.SQRT2 * s.g, Math.round(Math.abs(s.pan) * 14)]; };
      const ir = s => { const [l, r] = body(s.kind, s.v), [gl, gr, d] = pg(s), L = new Float32Array(l.length + 16), R = new Float32Array(l.length + 16);
        for (let i = 0; i < l.length; i++) { L[i + (s.pan > 0 ? d : 0)] = l[i] * gl; R[i + (s.pan < 0 ? d : 0)] = r[i] * gr; } return [L, R]; };
      for (let i = 0; i < cv.length; i += 2) { const a = cv[i], b = cv[i + 1]; conv2(a.x, b ? b.x : null, ir(a), b ? ir(b) : null, S.L, S.R); }
      for (const s of dry) { const [gl, gr, d] = pg(s), dl = s.pan > 0 ? d : 0, dr = s.pan < 0 ? d : 0, X = s.x; for (let i = 0; i < n; i++) { const v = X[i]; if (v === 0) continue; if (i + dl < n) S.L[i + dl] += v * gl; if (i + dr < n) S.R[i + dr] += v * gr; } }
      const g = (o.gain === undefined ? 1 : o.gain) * .60;
      for (const X of [S.L, S.R]) { let dc = 0; const a = 1 - Math.exp(-TAU * 16 / SR); for (let i = 0; i < n; i++) { dc += a * (X[i] - dc); X[i] = (X[i] - dc) * g; } for (let i = 0; i < 300 && i < n; i++) X[i] *= i / 300; const fo = Math.min(n, 2200); for (let i = 0; i < fo; i++) X[n - 1 - i] *= smooth(i / fo); }
      let pk = 1e-9; for (const X of [S.L, S.R]) for (let i = 0; i < n; i++) { const v = X[i] < 0 ? -X[i] : X[i]; if (v > pk) pk = v; }
      const lim = .70, mk = pk > lim ? pk / lim : 1; if (mk > 1) for (const X of [S.L, S.R]) for (let i = 0; i < n; i++) X[i] /= mk;    // stems peak <= -3 dBFS; the mix puts mk back
      return { id, lane: 'band', sec, t0, L: S.L, R: S.R, send, keep: keep || null, mk };
    } };
  return S;
}
// ---------------------------------------------------------------- sustained engine
// c = { nb, f, a, b, z } at block rate: pitch, loudness, effort 0..1, noise. P.spec fills harmonic strengths.
const tmp = new Float64Array(B);
function sustain(out, c, P, seed) {
  const nb = c.nb, HM = P.H, X = new Float64Array(HM + 2), Y = new Float64Array(HM + 2), Ap = new Float64Array(HM + 2), An = new Float64Array(HM + 2), sh = new Float64Array(HM + 2), E = new Float64Array(HM + 2), rg = Rng(seed);
  for (let h = 0; h <= HM; h++) { const p = rg.g() * (P.disp || .22) * Math.sqrt(h) + (P.rand ? rg.u() * TAU : 0); X[h] = Math.cos(p); Y[h] = Math.sin(p); E[h] = Math.pow(10, rg.g() * (P.vary === undefined ? 1.4 : P.vary) / 20); sh[h] = 0; }
  let ns = rg.i(), Hp = 0, n1 = 0, n2 = 0, n3 = 0, jit = 0, jit2 = 0, zp = 0, live = false; const shim = P.shim === undefined ? .07 : P.shim, jd = P.jit === undefined ? 2.2 : P.jit, la = 1 - Math.exp(-TAU * (P.nhi || 2800) / SR), lb = 1 - Math.exp(-TAU * (P.nlo || 420) / SR), fmax = P.fmax || 7600;
  for (let k = 0; k < nb; k++) {
    const a1 = c.a[k + 1], z1 = c.z[k + 1];
    if (a1 < 1e-6 && z1 < 1e-7 && !live) continue;
    ns = Math.imul(ns, 1664525) + 1013904223 | 0; jit += .16 * (ns * 4.6566e-10 - jit); ns = Math.imul(ns, 1664525) + 1013904223 | 0; jit2 += .012 * (ns * 4.6566e-10 - jit2);
    const f = .5 * (c.f[k] + c.f[k + 1]) * Math.pow(2, (jit * jd * 2.6 + jit2 * jd * 7) / 1200), H = Math.min(HM, Math.floor(fmax / f));
    P.spec(An, H, f, c.b[k + 1]); let e = 0;
    for (let h = 1; h <= H; h++) {
      ns = Math.imul(ns, 1664525) + 1013904223 | 0; sh[h] += .035 * (ns * 4.6566e-10 - sh[h]);
      const top = (fmax - h * f) / (.18 * fmax); An[h] *= a1 * E[h] * (1 + shim * 9 * sh[h]) * (top < 1 ? smooth(top) : 1); e += An[h];
    }
    const HH = Math.max(H, Hp); for (let h = H + 1; h <= HH; h++) An[h] = 0;
    tmp.fill(0); const w = TAU * f / SR, c1 = Math.cos(w), s1 = Math.sin(w); let cc = 1, ss = 0;
    for (let h = 1; h <= HH; h++) {
      const t = cc * c1 - ss * s1; ss = cc * s1 + ss * c1; cc = t;
      let a = Ap[h]; const an = An[h]; if (a < 1e-7 && an < 1e-7) { Ap[h] = an; continue; }
      const da = (an - a) / B; let x = X[h], y = Y[h]; const C = cc, S = ss;
      for (let i = 0; i < B; i++) { tmp[i] += a * y; a += da; const q = x * C - y * S; y = x * S + y * C; x = q; }
      X[h] = x; Y[h] = y; Ap[h] = an;
    }
    Hp = H; const o = k * B;
    if (z1 > 1e-7 || zp > 1e-7) { const dz = (z1 - zp) / B; let z = zp; const pm = P.psync || 0; for (let i = 0; i < B; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; n1 += la * (ns * 4.6566e-10 - n1); n2 += lb * (n1 - n2); const q = n1 - n2; n3 += lb * (q - n3); z += dz; out[o + i] += tmp[i] + (q - n3) * z * (1 + pm * tmp[i] / (a1 + .02)); } }
    else for (let i = 0; i < B; i++) out[o + i] += tmp[i];
    zp = z1; live = e > 1e-7 || z1 > 1e-7;
  }
}
// ---- how each thing puts its strength into its harmonics
const SPEC = {
  bow: (lo, hi) => (A, H, f, b) => { const fc = lo * Math.pow(hi / lo, b), q = f / fc; for (let h = 1; h <= H; h++) { const r = h * q; A[h] = 1 / (h * (1 + r * r)); } },
  harm: (A, H) => { for (let h = 1; h <= H; h++) A[h] = h === 1 ? 1 : h === 2 ? .10 : h === 3 ? .035 : .010 / h; },
  reed: (A, H, f, b) => { const fc = 2200 + 2500 * b; for (let h = 1; h <= H; h++) { const r = h * f / fc; A[h] = Math.pow(h, -.60) / (1 + r * r * r) * .50; } },
  clar: (A, H, f, b) => { const fc = 1150 + 1500 * b + f; for (let h = 1; h <= H; h++) { const r = h * f / fc, ev = h & 1 ? 1 : h === 2 ? .035 : h === 4 ? .10 : h === 6 ? .25 : .45; A[h] = ev * Math.pow(h, -(1.25 - .45 * b)) / (1 + r * r * r * r); } },
  horn: (A, H, f, b) => { const fc = 190 + 1250 * Math.pow(b, 1.5) + .55 * f; for (let h = 1; h <= H; h++) { const r = h * f / fc; A[h] = .55 * Math.pow(h, -.25) / Math.sqrt(1 + r * r * r * r * r); } },
};
// ---------------------------------------------------------------- players: from notes to controls
// bowed. K: att, rel, vib (cents), vr, det, lag, tj, z (noise)
function bowCtl(S, notes, dyn, rg, K) {
  const nb = S.nb, f = new Float64Array(nb + 1), a = new Float64Array(nb + 1), b = new Float64Array(nb + 1), z = new Float64Array(nb + 1);
  const det = clamp(rg.g() * K.det, -2.4, 2.4), lag = rg.g() * K.lag, vr0 = K.vr + rg.g() * .22;
  const ns = notes.map(e => { const tt = e.t0 + lag + rg.g() * K.tj - (e.slur ? .022 : Math.min(e.att || K.att, e.spic ? .02 : .2) * .38); const mm = e.m === undefined ? e.ms[0] : e.m; return { m: mm, ev: even(K.bodyKind, K.bodyV, Math.round(mm), 1), t: tt, e: e.t1 + lag + rg.g() * K.tj, slur: e.slur, port: e.port || 0, spic: e.spic || 0, trem: e.trem || 0, acc: e.acc ? 1.25 : 1, vib: e.vib === undefined ? K.vib : e.vib, att: e.att || K.att, rel: e.rel || K.rel,
    d0: dyn(e.x), d1: dyn(e.x + e.d * .5), d2: dyn(e.x + e.d), c: clamp(det + rg.g() * .8, -2.6, 2.6), vd: rg.r(.16, .40), vx: rg.r(.8, 1.2), vr: vr0 * rg.r(.96, 1.04), sw: e.sw === undefined ? .10 : e.sw }; });
  for (let i = 1; i < ns.length; i++) if (ns[i].slur || ns[i].t < ns[i - 1].e || ns[i].t - ns[i - 1].e < .05) ns[i - 1].e = ns[i].t;
  let k = 0, ph = rg.u() * TAU, pw = 0, wob = 0, tp = rg.u(), tw = 0;
  for (let i = 0; i <= nb; i++) {
    const t = S.t0 + i * B / SR; while (k + 1 < ns.length && t >= ns[k + 1].t) k++;
    const e = ns[k], p = k ? ns[k - 1] : null, n = k + 1 < ns.length ? ns[k + 1] : null, x = t - e.t, d = Math.max(.02, e.e - e.t);
    pw += .02 * (rg.g() - pw); ph += TAU * e.vr * (1 + .25 * pw) / BR;
    if (x < -.02 || x > d + .4) { f[i] = hz((x < 0 ? e : n && t > n.t - .1 ? n : e).m); continue; }
    const joinP = p && e.t - p.e < .05, joinN = n && n.t - e.e < .05;
    let m = e.m; if (joinP && e.slur && p.m !== m) { const w = e.port || .045; m = p.m + (m - p.m) * smooth((x + w * .5) / w); }
    if (joinN && n.slur && n.m !== e.m) { const w = n.port || .045, y = (t - n.t + w * .5) / w; if (y > 0) m = e.m + (n.m - e.m) * smooth(y); }
    const va = e.vib * e.vx * smooth((x - e.vd) / .45) * (1 - .55 * smooth((x - d + .28) / .28)), u = clamp(x / d, 0, 1);
    let dy = (u < .5 ? lerp(e.d0, e.d1, u * 2) : lerp(e.d1, e.d2, u * 2 - 1)) * (1 - e.sw + 2 * e.sw * Math.sin(Math.PI * u)) * e.acc;
    wob += .018 * (rg.g() - wob); dy = Math.max(0, dy * (1 + .55 * wob));
    f[i] = hz(m) * Math.pow(2, (e.c + va * (.55 + .7 * Math.min(1, dy)) * Math.sin(ph) + 3 * pw) / 1200);
    let env = 1, bite = 0;
    if (e.spic) { env = smooth(x / .014) * Math.exp(-Math.max(0, x - .03) / e.spic); bite = Math.exp(-Math.max(0, x) / .022); }
    else {
      if (!joinP) { env *= smooth(x / e.att); bite = .55 * Math.exp(-Math.max(0, x) / .05); } else if (!e.slur) { env *= 1 - .66 * Math.exp(-x * x / .0011); bite = .40 * Math.exp(-Math.max(0, x) / .04); }
      if (!joinN) env *= smooth((d - x) / Math.min(e.rel, d * .75)); else if (!n.slur) { const y = t - n.t; env *= 1 - .66 * Math.exp(-y * y / .0011); }
    }
    if (e.trem) { tw += .05 * (rg.g() - tw); tp += e.trem * (1 + .35 * tw) / BR; const s = tp - Math.floor(tp); env *= .34 + .66 * Math.pow(Math.sin(Math.PI * s), .75); bite = Math.max(bite, .22 * Math.exp(-s * 9)); }
    let ev = e.ev; if (joinP && x < .06) ev = lerp(p.ev, e.ev, smooth(x / .06 * .5 + .5)); else if (joinN && d - x < .06) ev = lerp(e.ev, n.ev, smooth((1 - (d - x) / .06) * .5));
    a[i] = Math.pow(dy, 1.35) * env * ev; b[i] = clamp(dy * (.55 + .45 * env), 0, 1.15); z[i] = (K.z * (.35 + .65 * dy) * env + K.z * 3.2 * bite * Math.min(env, 1) * dy);
  }
  return { nb, f, a, b, z };
}
const BOWS = {
  violin: { H: 40, spec: SPEC.bow(1700, 5600), att: .12, rel: .16, vib: 15, vr: 5.6, z: .040, nhi: 3600, nlo: 800, fmax: 9500 },
  viola: { H: 44, spec: SPEC.bow(1300, 4300), att: .14, rel: .18, vib: 15, vr: 5.3, z: .036, nhi: 3000, nlo: 700, fmax: 8200 },
  cello: { H: 60, spec: SPEC.bow(760, 2900), att: .15, rel: .22, vib: 15, vr: 5.1, z: .042, nhi: 2400, nlo: 480, fmax: 7000 },
  bass: { H: 60, spec: SPEC.bow(380, 1250), att: .17, rel: .24, vib: 8, vr: 4.8, z: .040, nhi: 1500, nlo: 260, fmax: 3600 },
};
// one part, several players; each player is a different hand on a different instrument
function bow(S, kind, notes, dyn, o = {}) {
  if (LOG) for (const e of notes) note(S, kind, e.t0, e.t1 - e.t0, e.m === undefined ? e.ms[0] : e.m);
  const K = Object.assign({ det: 2.0, lag: .010, tj: .009 }, BOWS[kind], o), N = o.players || 1, g = (o.gain || 1) * .30 / Math.pow(N, .62);
  for (let i = 0; i < N; i++) {
    const rg = Rng(S.id + kind + (o.seed || '') + i), x = new Float32Array(S.n), bk = o.body || kind, bv = (o.v || 0) + (i & 1), c = bowCtl(S, notes, dyn, rg, Object.assign({}, K, { bodyKind: bk, bodyV: bv }, N > 1 && o.tj === undefined ? { lag: .014, tj: .013 } : {})); if (o.mod) o.mod(c, S);
    sustain(x, c, { H: K.H, spec: o.spec || K.spec, fmax: K.fmax, nhi: K.nhi, nlo: K.nlo, psync: .5, rand: N > 1, shim: .06, jit: 2.2 }, rg.i());
    const y = S.x(bk, bv, clamp((o.pan || 0) + (N > 1 ? (i / (N - 1) - .5) * (o.spread || .24) : 0), -1, 1)); for (let j = 0; j < S.n; j++) y[j] += x[j] * g;
  }
}
// blown: concertina (bellows shared by all its reeds), clarinet, horns
function blow(S, kind, notes, dyn, o) {
  if (LOG) for (const e of notes) for (const m of e.ms) note(S, kind, e.t0, e.t1 - e.t0, m);
  const rg = Rng(S.id + kind + (o.seed || '')), nb = S.nb, N = Math.max(...notes.map(e => e.ms.length)), bel = new Float64Array(nb + 1);
  // bellows: one slow breath, a lift on every bar, a short turn where the direction changes
  if (o.bellows) { const turns = o.bellows; let w = 0; for (let i = 0; i <= nb; i++) { const t = S.t0 + i * B / SR; w += .01 * (rg.g() - w); let p = 1 + .35 * w; for (const q of turns) { const y = t - q; if (y > -.2 && y < .2) p *= 1 - .55 * Math.exp(-y * y / .0012); } bel[i] = p; } } else bel.fill(1);
  for (let v = 0; v < N; v++) {
    const ns0 = voice(notes, v), f = new Float64Array(nb + 1), a = new Float64Array(nb + 1), b = new Float64Array(nb + 1), z = new Float64Array(nb + 1), r = Rng(S.id + kind + v + (o.seed || '')), det = clamp(r.g() * (o.det === undefined ? 1.2 : o.det), -2, 2);
    const ns = ns0.map(e => ({ m: e.m, ev: even(o.body, o.v || 0, e.m, kind === 'conc' ? .7 : 1), t: e.t0 + r.g() * .0012 - (e.slur ? .012 : o.att * .4), e: e.t1 + r.g() * .0012 - (o.gap || 0), slur: e.slur, d0: dyn(e.x), d1: dyn(e.x + e.d * .5), d2: dyn(e.x + e.d), acc: e.acc ? 1.2 : 1, c: det + r.g() * .7, at: o.att * r.r(.85, 1.2) * (e.m < 58 ? 1.35 : 1), x: e.x, gr: e.gr && v === 0 ? ([2, 2, 1, 2, 2, 2, 1][[2, 4, 6, 7, 9, 11, 1].indexOf(e.m % 12)] || 2) : 0 }));
    for (let i = 1; i < ns.length; i++) if (ns[i].slur || ns[i].t < ns[i - 1].e) ns[i - 1].e = ns[i].t;
    let k = 0, w = 0, w2 = 0, vp = r.u() * TAU;
    for (let i = 0; i <= nb; i++) {
      const t = S.t0 + i * B / SR; while (k + 1 < ns.length && t >= ns[k + 1].t) k++;
      const e = ns[k]; if (!e) break; const n = ns[k + 1], p = ns[k - 1], x = t - e.t, d = Math.max(.03, e.e - e.t);
      w += .02 * (r.g() - w); w2 += .004 * (r.g() - w2); vp += TAU * 5.1 / BR;
      if (x < 0 || x > d + .02) { f[i] = hz(e.m); continue; }
      const u = clamp(x / d, 0, 1), sl = e.slur && p && e.t - p.e < .03, sn = n && n.slur && n.t - e.e < .03;
      let env = sl ? 1 - .22 * Math.exp(-x / .03) : smooth(x / e.at); if (!sn) env *= smooth((d - x) / o.rel); else env *= 1 - .22 * Math.exp(-(d - x) / .02);
      let dy = (u < .5 ? lerp(e.d0, e.d1, u * 2) : lerp(e.d1, e.d2, u * 2 - 1)) * e.acc * (1 + .3 * w) * bel[i]; if (o.swell) dy *= 1 - o.swell * .5 + o.swell * Math.sin(Math.PI * Math.min(1, u * 1.15));
      let m = e.m; if (sl) m = p.m + (m - p.m) * smooth((x + .004) / .028); if (e.gr && x < .085) { m += e.gr * (1 - smooth((x - .060) / .014)); env *= 1 - .25 * Math.exp(-Math.pow((x - .066) / .012, 2)); }
      const scoop = sl ? 0 : -(o.scoop || 6) * Math.exp(-x / .035), press = o.bellows ? -5 * (dy - .45) : 0, vb = (o.vib || 0) * smooth((x - .3) / .5) * Math.sin(vp);
      f[i] = hz(m) * Math.pow(2, (e.c + scoop + press + vb + 3.2 * w2) / 1200);
      a[i] = Math.pow(dy, o.pow || 1.25) * env * (sl && x < .03 ? lerp(p.ev, e.ev, smooth(x / .03)) : e.ev); b[i] = clamp(dy * (o.late ? smooth(x / (e.at * 2.4)) * .75 + .25 : 1), 0, 1.2); z[i] = (o.z || .02) * (.4 + .6 * dy) * env + (o.chiff || 0) * Math.exp(-x / .018) * (sl ? 0 : 1) * dy;
    }
    const X = new Float32Array(S.n); sustain(X, { nb, f, a, b, z }, { H: o.H, spec: o.spec, fmax: o.fmax, nhi: o.nhi || 2600, nlo: o.nlo || 500, shim: o.shim, jit: o.jit, vary: o.vary, disp: .5 }, r.i());
    if (o.click) for (const e of ns) { const j = Math.round((e.t - .012 - S.t0) * SR); puff(X, j, 620, o.click * (.7 + .6 * r.u()), 1700, 420, r, .25); }
    const pan = clamp((o.pan || 0) + (N > 1 ? (o.spread || 0) * (v / (N - 1) - .5) : 0), -1, 1), y = S.x(o.body, o.v || 0, pan), g = o.gain; for (let j = 0; j < S.n; j++) y[j] += X[j] * g;
  }
}
const concertina = (S, notes, dyn, o = {}) => blow(S, 'conc', notes, dyn, Object.assign({ H: 28, spec: SPEC.reed, fmax: 8000, att: .042, rel: .060, gap: .015, z: .010, nhi: 2000, shim: .035, jit: 1.1, vary: 1.8, body: 'box', click: .22, gain: .115, pan: -.18, spread: .50, swell: .16, bellows: [] }, o));
const clarinet = (S, notes, dyn, o = {}) => blow(S, 'clar', notes, dyn, Object.assign({ H: 24, spec: SPEC.clar, fmax: 6000, att: .050, rel: .070, gap: .02, z: .016, nhi: 2400, nlo: 700, shim: .03, jit: 1.0, vary: .8, body: 'pipe', gain: .17, pan: .30, swell: .2, scoop: 8, pow: 1.4, late: 1 }, o));
const horns = (S, notes, dyn, o = {}) => blow(S, 'horn', notes, dyn, Object.assign({ H: 34, spec: SPEC.horn, fmax: 4200, att: .11, rel: .16, gap: 0, z: .010, nhi: 1400, shim: .04, jit: 1.4, vary: .8, body: 'horn', gain: .16, pan: .18, spread: .4, swell: .10, scoop: 14, pow: 1.5, late: 1 }, o));
// ---------------------------------------------------------------- struck and plucked engine
const SCR = new Float64Array(SR * 16 | 0);
function ring(n, f, t60, a, ph) { // one decaying partial into the scratch
  if (f > 15000 || t60 <= 0) return 0; const e = Math.min(n, Math.ceil(t60 * SR * 1.35)), w = TAU * f / SR, r = Math.exp(-6.9078 / (t60 * SR)), k1 = 2 * r * Math.cos(w), k2 = r * r; let y1 = a * Math.sin(ph - w) / r, y2 = a * Math.sin(ph - 2 * w) / k2;
  for (let i = 0; i < e; i++) { const y = k1 * y1 - k2 * y2; y2 = y1; y1 = y; SCR[i] += y; } return e;
}
// scratch -> stream, with a soft front of `att` s and the finger/damper coming back at `dur`
function lay(S, x, t, n, g, att, dur, rel) {
  const o = Math.round((t - S.t0) * SR), na = Math.max(2, att * SR | 0), nd = Math.min(n, dur * SR | 0), k = Math.exp(-1 / (rel * SR)), end = Math.min(n, nd + rel * 8 * SR | 0); let e = 1;
  for (let i = 0; i < end; i++) { let v = SCR[i]; if (i < na) v *= smooth(i / na); if (i >= nd) { e *= k; v *= e; } const j = o + i; if (j >= 0 && j < x.length) x[j] += v * g; }
  SCR.fill(0, 0, n);
}
function puff(x, i0, n, g, hi, lo, rg, att) { // soft filtered noise: skin, felt, hair. never a burst
  const a = 1 - Math.exp(-TAU * hi / SR), b = 1 - Math.exp(-TAU * lo / SR), na = att * n; let p = 0, q = 0, r = 0, ns = rg.i();
  for (let i = 0; i < n; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; p += a * (ns * 4.6566e-10 - p); q += a * (p - q); r += b * (q - r); const u = i < na ? smooth(i / na) : Math.pow(1 - (i - na) / (n - na), 2.2), j = i0 + i; if (j >= 0 && j < x.length) x[j] += (q - r) * u * g; }
}
// ---- plucked: nylon guitar, harp, double bass, pizzicato
const PLUCK = {
  guitar: { T0: [[40, 4.6], [52, 4.0], [64, 2.9], [76, 1.7]], hi: .42, beta: .22, wid: [1900, 3600], Bn: 6e-5, att: .0014, body: 'guitar', puff: .020, np: 34, g: .30 },
  harp: { T0: [[38, 7.6], [50, 6.0], [62, 4.4], [74, 2.7], [86, 1.5]], hi: .50, beta: .42, wid: [1800, 4200], Bn: 8e-5, att: .0030, body: 'harp', puff: .014, np: 34, g: .30 },
  bass: { T0: [[28, 2.6], [40, 2.1], [52, 1.5]], hi: .16, beta: .19, wid: [560, 980], Bn: 1.6e-4, att: .0048, body: 'bass', puff: .036, np: 28, g: .80 },
  pizzVn: { T0: [[55, 1.0], [69, .75], [81, .45], [93, .3]], hi: .11, beta: .24, wid: [1300, 2000], Bn: 1.5e-4, att: .0022, body: 'violin', puff: .016, np: 18, g: .34 },
  pizzVa: { T0: [[48, 1.2], [60, .95], [72, .6]], hi: .11, beta: .24, wid: [1100, 1800], Bn: 1.5e-4, att: .0026, body: 'viola', puff: .016, np: 20, g: .34 },
  pizzVc: { T0: [[36, 1.9], [48, 1.5], [60, 1.0]], hi: .13, beta: .23, wid: [750, 1250], Bn: 1.4e-4, att: .0034, body: 'cello', puff: .020, np: 24, g: .36 },
};
function pluck(S, kind, t, m, vel, rg, o = {}) {
  const P = PLUCK[kind], x = S.x(P.body, o.v || 0, o.pan || 0), f0 = hz(m) * Math.pow(2, rg.g() * .5 / 1200), T0 = tab(P.T0, m) * (o.long || 1), dur = o.dur || T0, _ = note(S, kind, t, Math.min(dur, T0 * .5), m), beta = P.beta * rg.r(.92, 1.08), fc = lerp(P.wid[0], P.wid[1], vel) * Math.pow(2, (m - 55) / 40);
  const n = Math.min(SCR.length, Math.ceil(Math.min(T0 * 1.3, dur + .5) * SR)), s0 = 6.9078 / T0, sx = 6.9078 / P.hi - s0, B1 = P.Bn;
  for (let k = 1; k <= P.np; k++) {
    const fk = k * f0 * Math.sqrt((1 + B1 * k * k) / (1 + B1)); if (fk > 6800) break;
    const a = vel * Math.abs(Math.sin(Math.PI * k * beta)) / k * Math.exp(-Math.pow(fk / fc, 1.25) * .62), t60 = 6.9078 / (s0 * (1 + .03 * k) + sx * Math.pow(fk / 3000, 1.5)), ph = Math.PI * .5 * rg.r(.55, 1);
    ring(n, fk, t60, a * .74, ph); if (k < 9) ring(n, fk * (1 + (.00022 + .0001 * rg.u())), t60 * 1.35, a * .26, ph + 1.1);
  }
  lay(S, x, t, n, P.g * even(P.body, o.v || 0, m, 1, fc), P.att * (1.25 - .5 * vel), dur, o.rel || .075);
  puff(x, Math.round((t - S.t0 - .006) * SR), 900, P.puff * vel * (o.puff === undefined ? 1 : o.puff), kind === 'bass' ? 800 : 2100, kind === 'bass' ? 120 : 380, rg, .35);
}
// ---- plates and tines
function celesta(S, t, m, vel, rg, o = {}) {
  note(S, 'celesta', t, .5, m);
  const x = S.x('metal', o.v || 0, o.pan === undefined ? .28 : o.pan), f0 = hz(m), T0 = tab([[60, 3.6], [72, 3.0], [84, 2.2], [96, 1.4]], m), n = Math.ceil(T0 * 1.35 * SR);
  ring(n, f0, T0, vel, 0); ring(n, f0 * 1.0007, T0 * .8, vel * .35, 1); ring(n, f0 * 2.003, T0 * .34, vel * .10, .4); ring(n, f0 * 2.76, T0 * .26, vel * .17 * (.5 + vel), .3); ring(n, f0 * 5.40, T0 * .10, vel * .085, .6);
  lay(S, x, t, n, .20, .0022, T0, .2); puff(x, Math.round((t - S.t0 - .003) * SR), 700, .010 * vel, 1500, 300, rg, .3);
}
function musicbox(S, t, m, vel, rg, o = {}) {
  note(S, 'musicbox', t, .5, m);
  const x = S.x('metal', 2, o.pan === undefined ? .05 : o.pan), f0 = hz(m) * Math.pow(2, rg.g() * .6 / 1200), T0 = tab([[72, 2.4], [84, 1.8], [96, 1.1]], m), n = Math.ceil(T0 * 1.35 * SR);
  ring(n, f0, T0, vel, 0); ring(n, f0 * 1.0011, T0 * .7, vel * .28, 2); ring(n, f0 * 6.267, T0 * .10, vel * .07, .5); ring(n, f0 * 2.01, T0 * .22, vel * .05, 1);
  lay(S, x, t, n, .20, .0016, T0, .2); puff(x, Math.round((t - S.t0 - .004) * SR), 420, .010 * vel, 2400, 700, rg, .4);
}
// ============================================================================
// THIS FILM'S INSTRUMENTS
// ============================================================================
// a decaying partial straight into x at sample o (soft front of na samples)
function part(x, o, f, t60, a, ph = 0, na = 24) {
  if (f > 15000 || f <= 0 || t60 <= 0 || a === 0) return; const n = Math.min(Math.ceil(t60 * SR * 1.2), x.length - o); if (n <= 0) return;
  const w = TAU * f / SR, r = Math.exp(-6.9078 / (t60 * SR)), k1 = 2 * r * Math.cos(w), k2 = r * r; let y1 = a * Math.sin(ph - w) / r, y2 = a * Math.sin(ph - 2 * w) / k2;
  for (let i = 0; i < n; i++) { const y = k1 * y1 - k2 * y2; y2 = y1; y1 = y; const j = o + i; if (j >= 0) x[j] += i < na ? y * i / na : y; }
}
// a decaying partial whose frequency glides fa -> fb with time constant tau (a struck skin settling, a gong sagging)
function glide(x, o, n, fa, fb, tau, t60, a, na = 24) {
  n = Math.min(n, x.length - o); if (n <= 0) return; const r = Math.exp(-6.9078 / (t60 * SR)), kb = Math.exp(-B / (tau * SR)); let c = 1, s = 0, e = a, fd = fa - fb;
  for (let i0 = 0; i0 < n; i0 += B) { const w = TAU * (fb + fd) / SR, cw = Math.cos(w), sw = Math.sin(w), i1 = Math.min(n, i0 + B); fd *= kb;
    for (let i = i0; i < i1; i++) { const q = c * cw - s * sw; s = c * sw + s * cw; c = q; e *= r; const j = o + i; if (j >= 0) x[j] += (i < na ? i / na : 1) * e * s; }
    const m = 1 / Math.sqrt(c * c + s * s); c *= m; s *= m; }
}
// noise between lo and hi Hz, shaped by env(seconds) read every block
function hiss(x, o, n, g, lo, hi, rg, env) {
  const a = 1 - Math.exp(-TAU * hi / SR), b = 1 - Math.exp(-TAU * lo / SR); let p = 0, q = 0, p2 = 0, q2 = 0, r = 0, ns = rg.i(), e0 = env(0);
  n = Math.min(n, x.length - o);
  for (let i0 = 0; i0 < n; i0 += B) { const e1 = env((i0 + B) / SR), de = (e1 - e0) / B, i1 = Math.min(n, i0 + B); let e = e0;
    if (e0 < 1e-6 && e1 < 1e-6) { e0 = e1; continue; }
    for (let i = i0; i < i1; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; p += a * (ns * 4.6566e-10 - p); q += a * (p - q); p2 += a * (q - p2); q2 += a * (p2 - q2); r += b * (q2 - r); e += de; const j = o + i; if (j >= 0) x[j] += (q2 - r) * e * g * 1.6; }
    e0 = e1; }
}
// noise through resonant band-passes whose centres glide (risers, a breath). F = [[f0, f1, q, gain], ...]; env(u 0..1)
function sweep(x, o, n, g, F, rg, env, curve = 1) {
  n = Math.min(n, x.length - o); let ns = rg.i(), o1 = 0, o2 = 0; const st = F.map(() => [0, 0]), al = 1 - Math.exp(-TAU * 4500 / SR);
  for (let i0 = 0; i0 < n; i0 += B) { const u = i0 / n, e = env(u) * g, i1 = Math.min(n, i0 + B), co = F.map(([a, b, q]) => [2 * Math.sin(Math.PI * Math.min(7000, a * Math.pow(b / a, Math.pow(u, curve))) / SR), 1 / q]);
    for (let i = i0; i < i1; i++) { ns = Math.imul(ns, 1664525) + 1013904223 | 0; const v = ns * 4.6566e-10; let y = 0;
      for (let k = 0; k < F.length; k++) { const s = st[k], [f, q] = co[k], hp = v - s[0] - q * s[1]; s[1] += f * hp; s[0] += f * s[1]; y += s[1] * F[k][3]; }
      o1 += al * (y - o1); o2 += al * (o1 - o2); const j = o + i; if (j >= 0) x[j] += o2 * e; } }
}
// a held sine with a felt front and back (the sub under the fights)
function tone(x, o, n, f, a, att, rel) {
  n = Math.min(n, x.length - o); const w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), na = att * SR, nr = rel * SR, h = n - nr; let c = 1, s = 0;
  for (let i = 0; i < n; i++) { const q = c * cw - s * sw; s = c * sw + s * cw; c = q; const e = i < na ? smooth(i / na) : i > h ? smooth((n - i) / nr) : 1, j = o + i; if (j >= 0) x[j] += a * e * s; }
}
const at = (S, t) => Math.round((t - S.t0) * SR);
// ---- koto / guzheng: a Karplus-Strong string with a fractional, moving delay. The pick bends it sharp for an instant (tension),
//      long notes get a late yuri (pressed vibrato); two polarizations beat slowly; the wood box does the rest.
const KS = new Float64Array(8192), EXC = new Float64Array(4096);
function koto(S, t, m, vel, rg, o = {}) {
  const dur = o.dur || 2.2; note(S, 'koto', t, dur, m);
  const x = S.x('koto', 0, o.pan === undefined ? -.08 : o.pan), f0 = hz(m), T60 = tab([[45, 6.0], [57, 4.6], [69, 3.4], [81, 2.3], [93, 1.4]], m) * (o.long || 1);
  const n = Math.min(x.length, Math.ceil(Math.min(T60 * 1.1, dur + 2.2) * SR)), i0 = at(S, t), P = Math.round(SR / f0);
  // the pick: a short shaped burst, low-passed by how hard, with the pluck point's comb (1/6 of the string)
  EXC.fill(0, 0, P + 80); { let p = 0, q = 0; const a = 1 - Math.exp(-TAU * (1400 + 4200 * vel) * Math.pow(2, (m - 69) / 36) / SR), cp = Math.max(1, Math.round(P / 6)); for (let i = 0; i < P + cp; i++) { const w = i < P ? Math.sin(Math.PI * i / P) : 0; p += a * (rg.g() * w - p); q += a * (p - q); EXC[i] = q; } for (let i = P + cp - 1; i >= cp; i--) EXC[i] -= EXC[i - cp]; }
  const bend0 = 14 + 26 * vel, yuri = dur >= 1.9 ? 11 : 0;
  for (const [amp, det, tl] of [[.80, 0, 1], [.30, 1.6, 1.35]]) {
    KS.fill(0); const f = f0 * Math.pow(2, det / 1200), c = clamp(.58 + .26 * vel - (m - 69) * .006, .42, .9), aa = 1 - c, w0 = TAU * f / SR, pd = Math.atan2(aa * Math.sin(w0), 1 - aa * Math.cos(w0)) / w0;
    const H = c / Math.sqrt(1 - 2 * aa * Math.cos(w0) + aa * aa), rho = Math.min(.99965, Math.pow(10, -3 / (T60 * tl * f)) / H);
    let w = 4096, lp = 0, D = SR / f - pd, vp = rg.u() * TAU; const kb = Math.exp(-1 / (.045 * SR)); let bend = bend0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) { const tt = i / SR, cents = bend + yuri * smooth((tt - .65) / .6) * Math.sin(vp + TAU * 5.1 * tt); D = SR / (f * Math.pow(2, cents / 1200)) - pd; }
      bend *= kb;
      const rp = w - D, k = Math.floor(rp), fr = rp - k, a0 = KS[k & 8191], d = a0 + (KS[(k + 1) & 8191] - a0) * fr;
      lp += c * (d - lp); const y = (i < P + 40 ? EXC[i] : 0) + rho * lp; KS[w & 8191] = y; w++;
      const j = i0 + i; if (j >= 0 && j < x.length) x[j] += y * amp * vel * (i < 12 ? i / 12 : 1) * (i > n - 2000 ? (n - i) / 2000 : 1);
    }
  }
  puff(x, i0 - 22, 420, .05 * vel, 4600, 1300, rg, .15);                                        // the pick on the string
}
// ---- shakuhachi / dizi: breath first (muraiki), the tone scoops up into the note (meri), a late head-shake vibrato (yuri)
SPEC.shaku = (A, H, f, b) => { for (let h = 1; h <= H; h++) A[h] = h === 1 ? 1 : h === 2 ? .12 + .30 * b : h === 3 ? .06 + .16 * b : .045 * Math.pow(h, -1.2) * (.3 + b); };
function flute(S, evs, rg, o = {}) {
  const nb = S.nb, f = new Float64Array(nb + 1), a = new Float64Array(nb + 1), b = new Float64Array(nb + 1), z = new Float64Array(nb + 1);
  const ns = evs.map(e => ({ m: e.m, t: e.t - .028, e: e.t + e.d, v: e.v, br: e.breathy ? 1 : 0 }));
  for (let i = 1; i < ns.length; i++) if (ns[i].t < ns[i - 1].e + .05) { if (Math.abs(SC.secAt(evs[i].t + 1e-6).beat) < .02) ns[i - 1].e = Math.min(ns[i - 1].e, ns[i].t - .06); else { ns[i].slur = 1; ns[i - 1].e = ns[i].t; } }   // a breath on each bar line, slurred inside the bar
  for (const e of evs) note(S, 'flute', e.t, e.d, e.m);
  let k = 0, vp = rg.u() * TAU, w = 0;
  for (let i = 0; i <= nb; i++) {
    const t = S.t0 + i * B / SR; while (k + 1 < ns.length && t >= ns[k + 1].t) k++;
    const e = ns[k], p = k ? ns[k - 1] : null, x = t - e.t, d = e.e - e.t; w += .03 * (rg.g() - w); vp += TAU * 4.6 / BR;
    if (x < 0 || x > d + .32) { f[i] = hz(e.m); continue; }
    let m = e.m; if (e.slur && p && x < .08) m = p.m + (e.m - p.m) * smooth(x / .08);
    const scoop = e.slur ? -22 * Math.exp(-x / .05) : -85 * Math.exp(-x / .07), vib = 15 * smooth((x - .5) / .7) * Math.sin(vp) * (d > 1 ? 1 : .35);
    f[i] = hz(m) * Math.pow(2, (scoop + vib + 4 * w) / 1200);
    const att = e.slur ? 1 - .3 * Math.exp(-x / .04) : smooth(x / .10), rel = (k + 1 < ns.length && ns[k + 1].slur) ? 1 : smooth((d + .26 - x) / .28), u = clamp(x / d, 0, 1), dy = e.v * (.85 + .25 * Math.sin(Math.PI * u)) * (1 + .1 * w);
    a[i] = Math.pow(dy, 1.3) * att * rel; b[i] = clamp(.2 + .62 * dy * smooth(x / .3), 0, 1);
    z[i] = (.028 * dy * att * rel + (e.slur ? .018 : .10) * dy * Math.exp(-x / .06) * smooth((x + .02) / .02)) * (1 + .5 * e.br);
  }
  const X = new Float32Array(S.n); sustain(X, { nb, f, a, b, z }, { H: 16, spec: SPEC.shaku, fmax: 5200, nhi: 5000, nlo: 800, psync: .7, shim: .05, jit: 2.4, vary: 1.2, disp: .4 }, rg.i());
  const y = S.x('pipe', 0, o.pan === undefined ? .16 : o.pan); for (let j = 0; j < S.n; j++) y[j] += X[j] * (o.gain || .5);
}
// ---- the choir: one throat per singer, the vowel's formants decide which harmonics carry. 'ah' / 'oo'
const VOW = { ah: [[760, 120, 1], [1180, 150, .55], [2750, 230, .17], [3500, 280, .07]], oo: [[340, 90, 1], [720, 120, .35], [2650, 220, .05]] };
SPEC.vox = v => { const F = VOW[v] || VOW.ah; return (A, H, f, b) => { for (let h = 1; h <= H; h++) { const fh = h * f; let g = .03; for (const [c, w, a] of F) { const q = (fh - c) / w; g += a / (1 + q * q); } A[h] = g * Math.pow(h, -(.55 - .3 * b)) * (h === 1 ? .7 : 1); } }; };
BOWS.choir = { H: 36, spec: SPEC.vox('ah'), att: .38, rel: .55, vib: 24, vr: 5.0, z: .010, nhi: 4200, nlo: 900, fmax: 5800 };
// ---- bassoon (the old smoker's reed): a nasal formant near 480 Hz and 1150 Hz, weak fundamental low down
SPEC.bsn = (A, H, f, b) => { for (let h = 1; h <= H; h++) { const fh = h * f, q1 = (fh - 480) / 260, q2 = (fh - 1150) / 320, r = fh / (1700 + 1500 * b); A[h] = (1 / (1 + q1 * q1) + .45 / (1 + q2 * q2) + .05) * (h === 1 ? .45 : 1) / (1 + r * r * r); } };
// ---- membranes, plates, wood
function taiko(S, t, vel, sz, rg, pan = 0) {
  const f0 = 66 / Math.pow(sz, 1.1) * rg.r(.99, 1.01), i0 = at(S, t), x = S.x('taiko', 0, pan), md = [[1, 1, 1.25], [1.53, .55, .7], [1.98, .38, .5], [2.44, .26, .36], [2.9, .18, .28], [3.36, .12, .22]], k = Math.pow(vel, 1.1) * sz;
  for (let j = 0; j < md.length; j++) { const [r, a, d] = md[j], g = k * a * Math.pow(.55 + .4 * vel, j); if (j < 2) glide(x, i0, Math.ceil(d * sz * 1.25 * SR), f0 * r * (1 + .10 * vel), f0 * r, .055, d * sz, g * .9, 30); else part(x, i0, f0 * r, d * sz, g * .8, rg.r(-.3, .3), 30); }
  hiss(x, i0 - 30, Math.round(.09 * SR), .55 * vel, 160, 1500, rg, s => smooth(s / .003) * Math.exp(-s / .018));      // the bachi on the skin
}
function timp(S, t, m, vel, rg, pan = .3) {
  const f0 = hz(m), i0 = at(S, t), x = S.x('taiko', 1, pan), md = [[1, 1, 2.6], [1.504, .55, 1.7], [1.742, .32, 1.3], [2.0, .26, 1.1], [2.245, .18, .9], [2.494, .13, .75], [2.8, .08, .55]];
  for (let j = 0; j < md.length; j++) { const [r, a, d] = md[j]; part(x, i0, f0 * r * rg.r(.998, 1.002), d, vel * a * Math.pow(.6 + .35 * vel, j) * .7, rg.r(-.2, .2), 40); }
  part(x, i0, f0 * .62, .14, vel * .6, 0, 40); hiss(x, i0 - 20, Math.round(.05 * SR), .35 * vel, 90, 900, rg, s => smooth(s / .003) * Math.exp(-s / .012));
}
function gong(S, t, m, vel, d, rg, pan = -.3) {
  const f0 = hz(m), i0 = at(S, t), x = S.x('metal', 0, pan), T = Math.max(2.5, d * 1.1), pr = [[1, 1, 1, 0], [1.52, .55, .8, .25], [2.03, .42, .7, .4], [2.48, .30, .55, .5], [2.97, .26, .5, .6], [3.53, .2, .4, .7], [4.1, .14, .35, .8], [4.75, .1, .3, .9], [5.6, .07, .25, 1]];
  glide(x, i0, Math.ceil(T * 1.2 * SR), f0 * 1.012, f0 * .995, .9, T, vel * .9, 60);
  for (let j = 1; j < pr.length; j++) { const [r, a, dd, bl] = pr[j], ff = f0 * r * rg.r(.995, 1.005), g = vel * a * (.6 + .5 * vel); part(x, i0, ff, T * dd, g, 0, 80); if (bl) part(x, i0, ff, .25 + .5 * bl, -g * bl * .9, 0, 80); part(x, i0, ff * 1.0035, T * dd * .9, g * .35, 1.3, 120); }
  hiss(x, i0 - 40, Math.round(.12 * SR), .45 * vel, 60, 700, rg, s => smooth(s / .006) * Math.exp(-s / .03));          // the felt beater
}
// cymbals: a cloud of inharmonic plate modes; 'swell' = soft mallets rolling up inside the note, 'shimmer' = a light touch, else a crash
const CYM = (() => { const r = Rng('cymbal'), a = []; for (let k = 0; k < 44; k++) { const f = 340 * Math.pow(8200 / 340, Math.pow(r.u(), .85)); a.push([f, r.r(.6, 1.4) * Math.pow(f / 1000, -.25) / (1 + Math.pow(f / 6500, 3)), r.u() * TAU]); } return a; })();
function cym(S, e, rg, pan) {
  const kind = e.kind || 'crash', i0 = at(S, e.t), v = e.v, x = S.x('metal', 1, pan), d = e.d;
  if (kind === 'crash') {
    for (const [f, a, ph] of CYM) part(x, i0, f * rg.r(.997, 1.003), Math.min(5, d * 1.6) * Math.pow(f / 1500, -.45), a * v * .11, ph, 30);
    hiss(x, i0, Math.ceil((d + 1) * SR), .9 * v, 900, 6200, rg, s => smooth(s / .004) * (.7 * Math.exp(-s / .09) + .3 * Math.exp(-s / (d * .45))));
    hiss(x, i0 - 20, Math.round(.06 * SR), .5 * v, 300, 2400, rg, s => smooth(s / .002) * Math.exp(-s / .015));
  } else {
    const sw = kind === 'swell', len = d + (sw ? 2.2 : 1.6), n = Math.ceil(len * SR), E = s => { const u = s / d; return sw ? (u < 1 ? smooth(.06 + u / .62 * .94) * (u > .62 ? Math.exp(-(u - .62) * 1.4) : 1) : .6 * Math.exp(-(u - 1) * d / .7)) : smooth(s / .004) * Math.exp(-s / (d * .55)); };
    const ns = new Float32Array(n), lo = sw ? 0 : 14;
    for (let k = lo; k < CYM.length; k += sw ? 1 : 1) { const [f, a, ph] = CYM[k], w = TAU * f * rg.r(.997, 1.003) / SR, cw = Math.cos(w), sw2 = Math.sin(w); let c = Math.cos(ph), s = Math.sin(ph); const lag = sw ? (f / 8200) * .25 : 0;
      for (let i0b = 0; i0b < n; i0b += B) { const g0 = E(Math.max(0, i0b / SR - lag)) * a * v * (sw ? .07 : .05) * (sw ? 1 : Math.exp(-i0b / SR * f / 9000)), i1 = Math.min(n, i0b + B); for (let i = i0b; i < i1; i++) { const q = c * cw - s * sw2; s = c * sw2 + s * cw; c = q; ns[i] += g0 * s; } } }
    for (let i = 0; i < n; i++) { const j = i0 + i; if (j >= 0 && j < x.length) x[j] += ns[i]; }
    hiss(x, i0, n, (sw ? .55 : .25) * v, sw ? 1400 : 2600, 6400, rg, s => E(s) * (sw ? 1 : .6));
  }
}
function shaker(S, t, vel, rg, pan = .42) {
  const x = S.x('none', 0, pan), i0 = at(S, t - .002), n = Math.round(.07 * SR), g = new Float32Array(Math.ceil(n / B) + 1); for (let k = 0; k < g.length; k++) g[k] = rg.u() < .45 ? rg.r(.5, 1) : rg.r(0, .25);
  hiss(x, i0, n, 1.1 * vel, 1500, 3900, rg, s => { const u = s / .07; return u >= 1 ? 0 : Math.sin(Math.PI * Math.pow(u, .39)) * (.55 + .45 * g[Math.min(g.length - 1, (s * SR / B) | 0)]); });
}
function wood(S, t, vel, hi, rg, pan = -.3) {
  const x = S.x('none', 1, pan), i0 = at(S, t), f0 = (hi ? 1240 : 830) * rg.r(.99, 1.01);
  part(x, i0, f0, .13, vel * .5, 0, 6); part(x, i0, f0 * 2.57, .06, vel * .22, .5, 6); part(x, i0, f0 * 4.1, .035, vel * .1, 1, 6);
  hiss(x, i0 - 10, Math.round(.012 * SR), .5 * vel, 900, 4200, rg, s => smooth(s / .0007) * Math.exp(-s / .003));
}
function clack(S, t, vel, rg) {                       // the seal: a wooden stamp pressed onto paper on a table
  const x = S.x('none', 2, 0), i0 = at(S, t);
  glide(x, i0, Math.ceil(.4 * SR), 168, 96, .03, .22, vel * .8, 20);
  for (const [f, d, a] of [[412, .10, .35], [1130, .055, .18], [1870, .035, .09], [2650, .02, .05]]) { part(x, i0, f, d, vel * a, 0, 10); part(x, i0 + Math.round(.011 * SR), f * 1.04, d * .6, vel * a * .35, .7, 10); }
  hiss(x, i0 - 15, Math.round(.05 * SR), .7 * vel, 200, 2400, rg, s => smooth(s / .0015) * Math.exp(-s / .010));
}
function riser(S, e, rg) {
  const n = Math.ceil(e.d * SR), i0 = at(S, e.t);
  if (e.breath) {                                     // a breath drawn in, rising, held to the instant of the fire
    const env = u => smooth(u / .25) * (.25 + .75 * Math.pow(u, 1.6)) * (u > .985 ? (1 - u) / .015 : 1);
    sweep(S.x('none', 3, -.12), i0, n, e.v * .55, [[420, 760, 3, 1], [1050, 1650, 4, .7], [2500, 2900, 5, .25]], rg, env, .8);
    sweep(S.x('none', 3, .12), i0, n, e.v * .55, [[430, 750, 3, 1], [1080, 1620, 4, .7], [2450, 2950, 5, .25]], Rng(S.id + 'b2'), env, .8);
  } else {                                            // air rising: two bands climbing, growing, cut on the arrival
    const env = u => smooth(u / .3) * Math.pow(u, 1.5) * (u > .98 ? (1 - u) / .02 : 1);
    for (const p of [-.5, .5]) sweep(S.x('none', 4, p), i0, n, e.v * .5, [[240, 1900, 2.2, 1], [620, 3600, 3, .45]], Rng(S.id + p), env, 1.4);
  }
}
// ============================================================================
// THE ORCHESTRA READS THE SCORE
// ============================================================================
const GROUP = { koto: 'koto', flute: 'flute', harp: 'harp', strings: 'strings', pizz: 'pizz', ostin: 'ostin', bass: 'bass', celesta: 'celesta', choir: 'choir', horn: 'horn', reed: 'reed', taiko: 'drums', timp: 'drums', gong: 'metal', cym: 'metal', shaker: 'small', wood: 'small', clack: 'small', riser: 'riser' };
// pre-roll, tail (s), reverb send, stem gain
const EXT = { koto: [.1, 4.5, .45, 1], flute: [.25, 1.2, .5, 1], harp: [.1, 4.5, .5, 1], strings: [.35, 1.3, .55, 1], pizz: [.1, 1.6, .4, 1], ostin: [.1, .8, .38, 1], bass: [.3, 1.6, .3, 1], celesta: [.1, 4, .55, 1], choir: [.4, 1.4, .6, 1], horn: [.2, 1.2, .5, 1], reed: [.15, .8, .32, 1], drums: [.1, 3.2, .36, 1], metal: [.1, 7.5, .45, 1], small: [.05, 1, .3, 1], riser: [.05, .3, .42, 1], breath: [.05, .3, .2, 1] };
const LEVEL = { koto: 1.6, flute: 1.1, harp: 2.5, strings: 1.0, pizz: 4.0, ostin: 2.3, bass: 1.0, celesta: 2.0, choir: .9, horn: 2.0, reed: 1.0, drums: 1.0, metal: 1.0, small: 1.0, riser: 1.0, breath: 1.0 };   // set by the balance pass
const TRIM = { 'ink.koto': 1.35, 'ink.metal': 3.5, 'love.harp': 1.3, 'love.bass': .83, 'love.celesta': 1.3, 'love.small': 2, 'nest.celesta': 2, 'nest.bass': .7,
  'attack.horn': .75, 'attack.strings': .8, 'attack.choir': .65, 'attack.bass': .83, 'hatch.strings': .4, 'hatch.celesta': 1.5, 'hatch.small': .5, 'hatch.metal': 1.25,
  'cave.bass': 1.7, 'cave.small': 2.2, 'cave.metal': 3.5, 'shelter.harp': 1.7, 'shelter.celesta': 2, 'train.ostin': 2.8, 'train.strings': .58, 'train.horn': 3, 'train.pizz': 1.45, 'train.drums': 1.25, 'train.metal': 1.25,
  'climax.choir': 1.5, 'climax.horn': 2.2, 'climax.celesta': 1.8, 'climax.metal': 1.5, 'dawn.harp': 1.6, 'dawn.choir': 2.2, 'dawn.koto': 1.6, 'dawn.flute': 1.25, 'dawn.celesta': 1.8, 'dawn.metal': 3 };                                      // per stem, after the balance pass
const SECS = SC.SEC.map(s => s.name), PLAN = {};
for (const tr in GROUP) for (const e of SC.tracks[tr]) { const sec = SC.secAt(e.t + 1e-6).name, g = tr === 'riser' && e.breath ? 'breath' : GROUP[tr], id = sec + '.' + g; (PLAN[id] = PLAN[id] || { id, sec, g, ev: [] }).ev.push(Object.assign({ tr }, e)); }
const KEEP = id => id.startsWith('loss.') ? 'silence' : id === 'climax.breath' ? 'alone' : null;
const LEAD = { harp: .006, pizz: .006, bpizz: .013, arco: .009, reed: .006 };      // measured ring-up of each body (tools/band_test.js)
const vdyn = notes => { notes.forEach((e, i) => e.x = i * 10); return x => { const e = notes[Math.min(notes.length - 1, Math.floor(x / 10 + 1e-9))], u = clamp(x / 10 - Math.floor(x / 10 + 1e-9), 0, 1); return e.dy * (e.shape ? e.shape(u) : 1); }; };
const tag = (e, j, m, o) => Object.assign({ m, ms: [m], t0: e.t, t1: e.t + e.d, x: j * 10, d: 9.999, slur: false, dy: e.v, ev: e }, o);
// strings: one line per chord voice; the line's register picks the desk
function strings(S, evs, rg, sec) {
  const nv = Math.max(...evs.map(e => 1 + (e.notes ? e.notes.length : 0))), ghost = evs.some(e => e.ghost), pads = !evs.some(e => e.trem), blue = sec === 'climax';
  for (let k = 0; k < nv; k++) {
    const ns = []; evs.forEach((e, j) => { const ch = [e.m].concat(e.notes || []); if (k < ch.length) ns.push(tag(e, j, ch[k], { trem: e.trem ? 11.5 : 0, dy: (ghost ? .5 : 1) * Math.pow(e.v, .85) * .92, att: e.trem ? .06 : pads ? (blue ? .14 : .42) : .2, rel: pads ? .5 : .2 })); });
    if (!ns.length) continue; const med = ns.map(e => e.m).sort((a, b) => a - b)[ns.length >> 1], kind = med < 53 ? 'cello' : med < 60 ? 'viola' : 'violin', hiV = kind === 'violin' && k >= nv - 1 && nv > 3;
    const pan = kind === 'cello' ? .34 : kind === 'viola' ? .14 : hiV ? -.46 : -.22, mod = ghost ? (c => { for (let i = 0; i <= c.nb; i++) { c.b[i] *= .45; c.z[i] *= 1.4; } }) : null;
    bow(S, kind, ns, vdyn(ns), { players: kind === 'violin' ? 2 : 2, pan, spread: .22, lag: .0012, tj: .001, det: 1.6, v: hiV ? 1 : 0, gain: kind === 'violin' ? 1 : 1.1, mod, seed: 'k' + k, fmax: kind === 'violin' ? 7000 : kind === 'viola' ? 6200 : 5200 });
  }
}
function ostin(S, evs, rg, sec) {
  const lo = [], hi = []; evs.forEach((e, j) => (e.m < 60 ? lo : hi).push(tag(e, j, e.m, { spic: e.light ? .045 : e.bright ? .075 : .06, dy: Math.pow(e.v, .9) * (e.light ? .75 : 1) * (e.bright ? 1.1 : 1), acc: e.v > .8 })));
  const mod = c => { if (evs.some(e => e.bright)) for (let i = 0; i <= c.nb; i++) c.b[i] = Math.min(1.15, c.b[i] * 1.25); };
  if (lo.length) bow(S, 'viola', lo, vdyn(lo), { players: 2, pan: .12, spread: .3, lag: .001, tj: .001, det: 1.4, mod, seed: 'lo', gain: 1.1 });
  if (hi.length) bow(S, 'violin', hi, vdyn(hi), { players: 2, pan: -.28, spread: .3, lag: .001, tj: .001, det: 1.4, mod, seed: 'hi' });
}
function bass(S, evs, rg, sec) {
  if (sec === 'cave') { for (const e of evs) pluck(S, 'bass', e.t - LEAD.bpizz, e.m, clamp(e.v * .95, .1, 1), rg, { pan: .4, dur: e.d + .12, rel: .09 }); return; }
  const fight = sec === 'attack' || sec === 'climax', marc = fight || sec === 'train', ns = evs.map((e, j) => tag(e, j, e.m, { t0: e.t - (marc ? LEAD.arco : 0), dy: Math.pow(e.v, .9) * .95, att: marc ? .03 : .22, rel: marc ? .12 : .35, acc: marc && e.v > .9 }));
  bow(S, 'bass', ns, vdyn(ns), { players: 2, pan: .42, spread: .15, lag: .001, tj: .001, det: 1.2, seed: 'cb', gain: 1.2 });
  if (fight) { const x = S.x('none', 5, 0); for (const e of evs) tone(x, at(S, e.t - .006), Math.round((e.d + .12) * SR), hz(e.m), .22 * e.v, .012, .12); }
}
function horn(S, evs, rg) {
  const stabs = evs.filter(e => e.stab), longs = evs.filter(e => !e.stab);
  if (longs.length) { const ns = longs.map((e, j) => tag(e, j, e.m, { dy: e.v * .95, shape: e.swell ? (u => .28 + .82 * smooth(u * 1.1)) : (u => .8 + .25 * Math.sin(Math.PI * u)) })); horns(S, ns, vdyn(ns), { att: .09, rel: .22, gap: .03 }); }
  if (stabs.length) { const ns = stabs.map((e, j) => tag(e, j, e.m, { dy: e.v, acc: 1 })); horns(S, ns, vdyn(ns), { att: .025, rel: .09, gap: .02, late: 0, swell: 0, scoop: 22, seed: 'stab', gain: .19 }); }
}
function reed(S, evs, rg) {
  const ns = evs.map((e, j) => tag(e, j, e.m, { t0: e.t - LEAD.reed, dy: e.v * .95, acc: e.d < .45, shape: e.d > .9 ? (u => 1 - .35 * smooth((u - .6) / .4)) : null }));
  blow(S, 'bsn', ns, vdyn(ns), { H: 40, spec: SPEC.bsn, fmax: 5000, att: .02, rel: .07, gap: .035, z: .014, nhi: 2400, nlo: 450, shim: .03, jit: 1.6, vary: 1.0, body: 'pipe', v: 1, gain: .26, pan: -.18, swell: .18, scoop: 30, pow: 1.3, late: 1 });
}
const RENDER = {
  koto: (S, ev, rg) => { for (const e of ev) koto(S, e.t, e.m, clamp(e.v, .1, 1), rg, { dur: e.d }); },
  flute: (S, ev, rg) => flute(S, ev, rg),
  harp: (S, ev, rg) => { for (const e of ev) pluck(S, 'harp', e.t - LEAD.harp, e.m, clamp(e.v * 1.1, .1, 1), rg, { pan: -.52, dur: e.d + .6, rel: .35 }); },
  strings, ostin, bass, horn, reed,
  pizz: (S, ev, rg) => { for (const e of ev) pluck(S, e.m < 55 ? 'pizzVc' : e.m < 64 ? 'pizzVa' : 'pizzVn', e.t - LEAD.pizz, e.m, clamp(e.v, .1, 1), rg, { pan: e.m < 55 ? .3 : e.m < 64 ? .1 : -.25, dur: e.d + .2 }); },
  celesta: (S, ev, rg) => { for (const e of ev) (e.box ? musicbox : celesta)(S, e.t, e.m, clamp(e.v, .05, 1), rg, {}); },
  choir: (S, ev, rg, sec) => { const nv = Math.max(...ev.map(e => 1 + (e.notes ? e.notes.length : 0))); for (let k = 0; k < nv; k++) { const ns = []; ev.forEach((e, j) => { const ch = [e.m].concat(e.notes || []); if (k < ch.length) ns.push(tag(e, j, ch[k], { dy: Math.pow(e.v, .8) * .9 })); }); if (!ns.length) continue; bow(S, 'choir', ns, vdyn(ns), { players: 3, body: 'choir', v: k & 1, spec: SPEC.vox(ev[0].vowel), pan: (k / Math.max(1, nv - 1) - .5) * .9, spread: .3, lag: .0015, tj: .0015, det: 3.5, seed: 'ch' + k, att: sec === 'climax' ? .16 : .38 }); } },
  drums: (S, ev, rg) => { for (const e of ev) if (e.tr === 'taiko') taiko(S, e.t, clamp(e.v, .1, 1), e.sz || 1, rg, (e.sz || 1) >= 1.2 ? 0 : (e.sz || 1) >= 1 ? -.18 : .2); else if (e.roll) { const n = Math.floor(e.d * 15); for (let i = 0; i < n; i++) { const u = i / n, cr = e.t < SC.CUE.SILENCE; timp(S, e.t + i / 15, e.m, clamp(e.v * (cr ? .4 + .6 * u : 1 - .7 * u) * (i % 2 ? .9 : 1), .05, 1), rg, i % 2 ? .36 : .26); } } else timp(S, e.t, e.m, clamp(e.v, .1, 1), rg); },
  metal: (S, ev, rg) => { let side = 1; for (const e of ev) if (e.tr === 'gong') gong(S, e.t, e.m, clamp(e.v, .1, 1), e.d, rg); else { cym(S, e, rg, .34 * side); side = -side; } },
  small: (S, ev, rg) => { for (const e of ev) if (e.tr === 'shaker') shaker(S, e.t, e.v, rg); else if (e.tr === 'clack') clack(S, e.t, clamp(e.v, .1, 1), rg); else if (e.stinger) { wood(S, e.t, clamp(e.v * 1.2, .1, 1.2), e.hi, rg); wood(S, e.t + .055, e.v * .6, 1, rg, -.1); } else wood(S, e.t, e.v, e.hi, rg); },
  riser: (S, ev, rg) => { for (const e of ev) riser(S, e, rg); }, breath: (S, ev, rg) => { for (const e of ev) riser(S, e, rg); },
};
const COST = { strings: .5, choir: .35, ostin: .3, bass: .25, horn: .2, reed: .1, metal: .15, drums: .12, flute: .08 };
const cost = id => (COST[PLAN[id].g] || .06) * Math.max(1, PLAN[id].ev.length / 10), jobs = () => Object.keys(PLAN).sort((a, b) => cost(b) - cost(a));
function render(id) {
  const P = PLAN[id]; if (!P) throw new Error('BAND: no job ' + id); const [pre, tail, send, gain] = EXT[P.g];
  let t0 = Infinity, t1 = 0; for (const e of P.ev) { t0 = Math.min(t0, e.t); t1 = Math.max(t1, e.t + e.d); }
  const S = Stem(id, P.sec, t0 - pre, t1 + tail, send, KEEP(id)); RENDER[P.g](S, P.ev, Rng(id), P.sec);
  return S.done({ gain: gain * (LEVEL[P.g] || 1) * (TRIM[id] || 1) });
}
// one live note, dry but for its body. Onset at `lead` seconds.
function oneshot(kind, m = 62, vel = .8) {
  const lead = .010, len = { koto: 3.2, harp: 3.2, celesta: 2.6, taiko: 1.6, wood: .35 }[kind] || 1.5, S = Stem('one.' + kind, 'live', -lead, len, .4), rg = Rng('one' + kind + m), v = clamp(vel, .05, 1);
  if (kind === 'koto') koto(S, 0, m, v, rg, { dur: 2.2 }); else if (kind === 'harp') pluck(S, 'harp', -LEAD.harp, m, v, rg, { pan: -.3, dur: 2.2, rel: .35 }); else if (kind === 'celesta') celesta(S, 0, m, v, rg, { pan: 0 }); else if (kind === 'taiko') taiko(S, 0, v, 1, rg, 0); else if (kind === 'wood') wood(S, 0, v, m >= 72 ? 1 : 0, rg, 0); else throw new Error('BAND.oneshot: no kind ' + kind);
  const r = S.done({ gain: (LEVEL[kind === 'taiko' ? 'drums' : kind === 'wood' ? 'small' : kind] || 1) }); return { L: r.L, R: r.R, lead, mk: r.mk };
}
return { jobs, cost, render, oneshot, plan: PLAN, log: () => { LOG = []; for (const id of jobs()) render(id); const l = LOG; LOG = null; return l; }, dsp: { conv2, fwd, inv, body, Rng } };
})();
if (typeof module !== 'undefined') module.exports = BAND;
