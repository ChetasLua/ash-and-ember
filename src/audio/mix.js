// ============================================================================
// mix.js - the rooms, the balance, the hard silences, the master of ASH & EMBER.
//
//   MIX.master(stems, SR, {free}) -> { L, R, report }      the whole film (Score.DUR = 140 s, stereo)
//
// stems, any order, missing ones are fine (q = 16-bit scale from the worker, mk = band makeup):
//   voice { id, who, t0, pcm }                Score.lines ids are set to the level the score asks for; 'snd<j>' = Score.sounds[j]
//   band  { id, lane:'band', sec, t0, L, R, send, keep, mk }
//   foley { id, t0, L, R, bus:'amb'|'fx'|..., send, keep }
//
// The balance calibrates itself: the band is measured section by section and set to the loudness plan (TGT), so a lane can
// change its levels and the film still breathes the same way. Lines sit above the band of their section, foley effects about
// 3 LU under the music in the fights and on top in the comedy. Music ducks ~4 dB under sung lines (more in 450-3600 Hz)
// and ~3 dB under big effects, slowly enough not to pump.
// HARD SILENCES: at CUE.SILENCE everything stops dead (dry and every reverb tail) until the hatch, except what carries
// keep:'silence' (the ghost line g1, the ash-fall bed, the band's ghost pedal); from CUE.ALONE to CUE.BLUE only keep:'alone'
// (Ember's voice and breath, the heartbeat). Foley: set keep, or name the stem with 'heart' / 'ashfall' / 'ash_bed'.
// Rooms: a hall for the orchestra, a cave for the cave and the shelter, open air for the flights, a bigger hall + open air
// from BLUE, a far place for the ghost, a close dry room for the breath alone. Convolved at half rate.
// −14 LUFS integrated, ≤ −1 dBTP. Nothing saturates anywhere.
// ============================================================================
const MIX = (() => {
'use strict';
const SC = typeof Score !== 'undefined' ? Score : require('../06_score.js');
const TAU = Math.PI * 2, clamp = (x, a, b) => x < a ? a : x > b ? b : x, smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), dB = x => Math.pow(10, x / 20), lin = x => 20 * Math.log10(x + 1e-12);
function Rng(a) { a |= 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// ---------------------------------------------------------------- FFT (radix-4 DIF / DIT, bit-reversed middle) and stereo-in stereo-out convolution
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
// xL,xR[i0..i1) * window -> room -> added into L,R at half rate
function convolve(xL, xR, i0, i1, win, h, L, R, gain) {
  const m = h[0].length, n = i1 - i0; let N = 1 << 15; while (N < m * 2.6) N <<= 1; if (n > 3 * N && N < 262144) N <<= 1;
  const hop = N - m, re = new Float64Array(N), im = new Float64Array(N), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N), k = gain / N;
  for (let i = 0; i < m; i++) { ar[i] = h[0][i] * k; ai[i] = h[1][i] * k; br[i] = h[2][i] * k; bi[i] = h[3][i] * k; } fwd(ar, ai, N); fwd(br, bi, N);
  for (let p = 0; p < n; p += hop) {
    const e = Math.min(hop, n - p); let any = 0;
    for (let i = 0; i < e; i++) { const j = i0 + p + i, w = win ? win(p + i) : 1, a = xL[j] * w, b = xR[j] * w; re[i] = a; im[i] = b; any += a < 0 ? -a : a; any += b < 0 ? -b : b; }
    if (any < 1e-9) continue;
    for (let i = e; i < N; i++) { re[i] = 0; im[i] = 0; }
    fwd(re, im, N);
    const one = (P, Q) => {
      const zr = re[P], zi = im[P], wr = re[Q], wi = -im[Q], xr = (zr + wr) * .5, xi = (zi + wi) * .5, ur = (zi - wi) * .5, ui = (wr - zr) * .5;
      const a = ar[P], b = ai[P], c = br[P], d = bi[P], f = ar[Q], g = ai[Q], u = br[Q], v = bi[Q];
      re[P] = xr * a - xi * b + ur * c - ui * d; im[P] = xr * b + xi * a + ur * d + ui * c;
      if (Q !== P) { re[Q] = xr * f + xi * g + ur * u + ui * v; im[Q] = xr * g - xi * f + ur * v - ui * u; }
    };
    one(0, 0); for (let w = 1; w < N; w <<= 1) { const s = 3 * w - 1; for (let P = w; P <= s - P; P++) one(P, s - P); }
    inv(re, im, N);
    const o = i0 + p, lim = Math.min(N, L.length - o); for (let i = 0; i < lim; i++) { L[o + i] += re[i]; R[o + i] += im[i]; }
  }
}
// ---------------------------------------------------------------- rooms
// t60 at [<300, 300-1200, 1200-3600, >3600] Hz; col = colour of the tail in the same bands; pre, ramp = onset; er = [count, spread s, gain]; len s
const ROOMS = {
  hall:  { t60: [2.2, 2.5, 1.9, 1.0], col: [.75, 1, .80, .40], pre: .022, ramp: .030, er: [12, .075, 1.5], len: 2.8, wet: .48, seed: 11 },
  big:   { t60: [2.8, 3.2, 2.5, 1.3], col: [.80, 1, .85, .45], pre: .028, ramp: .040, er: [14, .090, 1.5], len: 3.5, wet: .52, seed: 12 },
  air:   { t60: [2.4, 3.2, 2.5, 1.2], col: [.45, 1, .85, .40], pre: .055, ramp: .12, er: [6, .30, .9], len: 3.6, wet: .42, seed: 13 },
  cave:  { t60: [1.5, 1.3, .85, .42], col: [1, 1, .62, .22], pre: .006, ramp: .008, er: [18, .045, 1.9], len: 1.7, wet: .40, seed: 14 },
  ghost: { t60: [3.4, 4.8, 4.0, 2.2], col: [.5, 1, .95, .55], pre: .070, ramp: .14, er: [0, 0, 0], len: 4.6, wet: .60, seed: 19 },
  close: { t60: [.45, .65, .5, .3], col: [.6, 1, .8, .4], pre: .004, ramp: .006, er: [8, .018, 1.2], len: .75, wet: .22, seed: 21 },
};
function makeIR(o, sr) {
  const n = Math.ceil(o.len * sr), a1 = 1 - Math.exp(-TAU * 300 / sr), a2 = 1 - Math.exp(-TAU * 1200 / sr), a3 = 1 - Math.exp(-TAU * 3600 / sr), out = [], np = Math.round(o.pre * sr);
  for (let c = 0; c < 4; c++) {
    const r = Rng(o.seed * 1000 + c * 77 + 5), x = new Float64Array(n), same = c === 0 || c === 3, d = o.t60.map(t => Math.exp(-6.9078 / (t * sr))); let g0 = 1, g1 = 1, g2 = 1, g3 = 1, p = 0, q = 0, s = 0, e = 0;
    const tap = new Float64Array(n); for (let k = 0; k < o.er[0]; k++) { const u = (k + r()) / o.er[0], j = np + Math.round(Math.pow(u, 1.3) * o.er[1] * sr); if (j < n) tap[j] += (r() < .5 ? -1 : 1) * o.er[2] * (1 - .75 * u) * (same ? 1 : .6) * 7; }
    for (let i = np; i < n; i++) {
      const t = (i - np) / sr, w = (Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r())) * smooth(t / o.ramp + .02) + tap[i];
      p += a1 * (w - p); q += a2 * (w - q); s += a3 * (w - s);
      const v = p * g0 * o.col[0] * 1.6 + (q - p) * g1 * o.col[1] * 1.3 + (s - q) * g2 * o.col[2] + (w - s) * g3 * o.col[3]; g0 *= d[0]; g1 *= d[1]; g2 *= d[2]; g3 *= d[3];
      const z = v * smooth((n - i) / (.3 * n)); x[i] = z; e += z * z;
    }
    const g = (same ? 1 : .72) / Math.sqrt(e * 1.5), y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = x[i] * g; out.push(y);
  }
  return out;      // [LL, LR, RL, RR]
}
// ---------------------------------------------------------------- small tools
function bq(kind, f, q, g, sr) {
  const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, (g || 0) / 40); let b, a;
  if (kind === 'lp') { b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]; } else if (kind === 'hp') { b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]; } else if (kind === 'pk') { b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]; }
  else { const sq = 2 * Math.sqrt(A) * al, k = kind === 'ls' ? 1 : -1; b = [A * (A + 1 - k * (A - 1) * c + sq), k * 2 * A * (A - 1 - k * (A + 1) * c), A * (A + 1 - k * (A - 1) * c - sq)]; a = [A + 1 + k * (A - 1) * c + sq, -k * 2 * (A - 1 + k * (A + 1) * c), A + 1 + k * (A - 1) * c - sq]; }
  return [b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]];
}
function filt(x, k, i0 = 0, i1 = x.length) { const [b0, b1, b2, a1, a2] = k; let z1 = 0, z2 = 0; for (let i = i0; i < i1; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y; } return x; }
function kCoefs(sr) { let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = .7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, .4996667741545416), a0 = 1 + K / Q + K * K; const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]; K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = .5003270373238773; a0 = 1 + K / Q + K * K; return [s1, [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]]; }
// K-weighted energy per 100 ms
function kEnergy(chs, sr) {
  const [s1, s2] = kCoefs(sr), hop = Math.round(sr / 10), n = Math.floor(chs[0].length / hop), E = new Float64Array(n);
  for (const x of chs) { let a = 0, b = 0, c = 0, d = 0; const [b0, b1, b2, a1, a2] = s1, p1 = s2[3], p2 = s2[4]; for (let k = 0, i = 0; k < n; k++) { let e = 0; for (let j = 0; j < hop; j++, i++) { const v = x[i], y = b0 * v + a; a = b1 * v - a1 * y + b; b = b2 * v - a2 * y; const z = y + c; c = -2 * y - p1 * z + d; d = y - p2 * z; e += z * z; } E[k] += e / hop; } }
  return E;
}
const LK = e => -.691 + 10 * Math.log10(e + 1e-12);
function integrated(E) { const g = []; for (let i = 0; i + 4 <= E.length; i++) { const z = (E[i] + E[i + 1] + E[i + 2] + E[i + 3]) / 4; if (LK(z) > -70) g.push(z); } if (!g.length) return -99; const th = LK(g.reduce((a, b) => a + b) / g.length) - 10, h = g.filter(z => LK(z) > th); return LK(h.reduce((a, b) => a + b) / h.length); }
// half-band FIR, both directions
const HB = (() => { const h = []; for (let k = 1; k <= 19; k += 2) h.push(Math.sin(Math.PI * k / 2) / (Math.PI * k) * (.5 + .5 * Math.cos(Math.PI * k / 20.5))); let s = 0; for (const v of h) s += 2 * v; return h.map(v => v * .5 / s); })();
function halve(x) { const n = x.length >> 1, y = new Float32Array(n), N = x.length, [h0, h1, h2, h3, h4, h5, h6, h7, h8, h9] = HB; for (let i = 10; i < n - 10; i++) { const j = 2 * i; y[i] = .5 * x[j] + h0 * (x[j - 1] + x[j + 1]) + h1 * (x[j - 3] + x[j + 3]) + h2 * (x[j - 5] + x[j + 5]) + h3 * (x[j - 7] + x[j + 7]) + h4 * (x[j - 9] + x[j + 9]) + h5 * (x[j - 11] + x[j + 11]) + h6 * (x[j - 13] + x[j + 13]) + h7 * (x[j - 15] + x[j + 15]) + h8 * (x[j - 17] + x[j + 17]) + h9 * (x[j - 19] + x[j + 19]); } return y; }
function doubleInto(x, out) { const n = x.length, [h0, h1, h2, h3, h4, h5, h6, h7, h8, h9] = HB.map(v => v * 2); for (let i = 10; i < n - 11; i++) { out[2 * i] += x[i]; out[2 * i + 1] += h0 * (x[i] + x[i + 1]) + h1 * (x[i - 1] + x[i + 2]) + h2 * (x[i - 2] + x[i + 3]) + h3 * (x[i - 3] + x[i + 4]) + h4 * (x[i - 4] + x[i + 5]) + h5 * (x[i - 5] + x[i + 6]) + h6 * (x[i - 6] + x[i + 7]) + h7 * (x[i - 7] + x[i + 8]) + h8 * (x[i - 8] + x[i + 9]) + h9 * (x[i - 9] + x[i + 10]); } }
const OS = []; for (let p = 1; p < 4; p++) { const t = p / 4, c = new Float64Array(24); for (let k = -11; k < 13; k++) { const u = t - k; c[k + 11] = Math.sin(Math.PI * u) / (Math.PI * u) * (.5 + .5 * Math.cos(Math.PI * u / 12.5)); } OS.push(c); }
function truePeak(x) { let pk = 0; const n = x.length; for (let i = 0; i < n; i++) { const a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; } const th = pk * .75; let best = pk; for (let i = 12; i < n - 13; i++) { const v = x[i]; if (v > th || v < -th) for (let p = 0; p < 3; p++) { const c = OS[p]; let s = 0; for (let k = 0; k < 24; k++) s += x[i - 11 + k] * c[k]; if (s < 0) s = -s; if (s > best) best = s; } } return best; }
// ---------------------------------------------------------------- the plan
const T = SC.T, C = SC.CUE, DUR = SC.DUR, HATCH0 = T('hatch');
const WIN = [['ink', 0, T('love')], ['love', T('love'), T('nest')], ['nest', T('nest'), T('attack')], ['attack', T('attack'), C.SILENCE], ['hatch', HATCH0, T('cave')], ['cave', T('cave'), T('shelter')],
  ['shelter', T('shelter'), T('train')], ['train', T('train'), T('climax')], ['climaxA', T('climax'), C.ALONE], ['climaxB', C.BLUE, T('dawn')], ['dawn', T('dawn'), DUR]];
// band loudness by window, LUFS before the master (the master then lifts the whole film to -14): the story's dynamics
const TGT = { ink: -23, love: -18.5, nest: -24.5, attack: -15, hatch: -23.5, cave: -20, shelter: -22.5, train: -17, climaxA: -15.5, climaxB: -12, dawn: -16.5 };
const winAt = t => { let w = null; for (const q of WIN) if (t >= q[1] - 1e-6 && t < q[2]) w = q[0]; return w; };
const winNear = t => winAt(t) || (t < HATCH0 ? 'attack' : 'climaxA');
// sung lines: LU above their window's band target (g1 is absolute: far away, alone)
const LREL = { d1: .9, d2: -.2, d3: 2.6, d3h: 1.8, h1: -.2, a1: .5, a2: .7, c1: -1.1, c2: -1.8, c3: -1.8, w1: .4, w2: -.7, w3: -1.2 }, ABS = { g1: -29 };   // set so each line sits ~4 LU over its ducked band (harmony/ghost lines 2-3)
// foley: beds (bus amb) under the band, effects relative to it: under in the fights, on top in the comedy
const FXREL = { attack: -3, climaxA: -3, climaxB: -5, cave: 1.5, hatch: 1, train: .5 }, FXSOFT = -6, AMB = -12, FXCLAMP = 8;
const KEEPDB = { silence: -42, alone: -32 };          // band stems that sound through a hush (ghost pedal / the breath), absolute
const HUSH = [{ k: 'silence', a: C.SILENCE, b: HATCH0, open: .06 }, { k: 'alone', a: C.ALONE, b: C.BLUE, open: .008 }];
const SEND = { ink: .5, love: .5, nest: .45, attack: .38, hatch: .45, cave: .4, shelter: .42, train: .4, climaxA: .4, climaxB: .5, dawn: .5 };
// rooms by stretch of film: [room, from, to, fade in, fade out]
const PLACE = [['hall', 0, T('love'), 0, .4], ['air', T('love'), T('nest'), .4, .4], ['hall', T('nest'), C.SILENCE, .4, .004], ['hall', HATCH0, T('cave'), .02, .4], ['cave', T('cave'), T('train'), .4, .4],
  ['air', T('train'), T('climax'), .4, .3], ['hall', T('climax'), C.ALONE, .3, .004], ['big', C.BLUE, T('dawn'), .008, .5], ['air', C.BLUE, DUR, .008, .02]];
const lineOf = id => SC.lines.find(l => l.id === id), sndOf = id => /^snd\d+$/.test(String(id)) ? SC.sounds[+String(id).slice(3)] : null;
const lufsOf = (E, a, b) => integrated(E.subarray(Math.max(0, a), Math.max(0, Math.min(E.length, b))));
const over = (t0, t1, h) => t0 < h.b && t1 > h.a;
function keepOf(st, kind, t0, t1) {
  let k = null;
  if (kind === 'band') k = st.keep || null;
  else if (kind === 'voice') { const l = lineOf(st.id), s = sndOf(st.id); if (l && l.sec === 'loss') k = 'silence'; else if ((st.who || (s && s.who) || (l && l.who)) === 'ember') k = 'alone'; }
  else k = st.keep === true ? 'any' : st.keep || (/heart/i.test(st.id) ? 'alone' : /ash.?(fall|bed)|ashfall/i.test(st.id) ? 'silence' : null);
  for (const h of HUSH) if ((k === h.k || k === 'any') && over(t0, t1, h) && (kind !== 'voice' || (t0 > h.a - 1 && t0 < h.b - .3))) return h.k;
  return null;
}
// ---------------------------------------------------------------- one sung line: EQ by singer, slow 2:1, de-ess, to its loudness
function singer(st, line, sr, target) {
  const x = Float32Array.from(st.pcm), n = x.length, who = st.who || line.who;
  filt(x, bq('hp', who === 'noct' || who === 'ash' ? 70 : who === 'choir' ? 90 : 130, .7, 0, sr));
  if (who === 'noct') { filt(x, bq('pk', 260, .8, -1, sr)); filt(x, bq('pk', 2700, .8, 1.6, sr)); } else if (who === 'lune') { filt(x, bq('pk', 420, .8, -1.2, sr)); filt(x, bq('pk', 3000, .8, 1.2, sr)); }
  else if (who === 'ash') { filt(x, bq('pk', 220, .8, 1.2, sr)); filt(x, bq('pk', 2400, .8, 1.8, sr)); } else filt(x, bq('pk', 3400, .8, -1.5, sr));
  filt(x, bq('hs', 4200, .7, who === 'choir' ? 0 : 2, sr)); filt(x, bq('hs', 9500, .7, -2, sr));
  const k = Float32Array.from(x), [s1, s2] = kCoefs(sr); filt(k, s1); filt(k, s2); const hop = Math.round(sr * .02), E = []; for (let i = 0; i + hop <= n; i += hop) { let e = 0; for (let j = i; j < i + hop; j++) e += k[j] * k[j]; E.push(e / hop); }
  const mx = Math.max(...E, 1e-12), act = E.filter(e => e > mx * .003), mean = act.reduce((a, b) => a + b, 0) / Math.max(1, act.length), l = LK(mean);
  if (mx < 1e-12) return x;                                  // a silent placeholder stays silent
  const g0 = dB(target - l);
  const B = 32, nb = Math.ceil(n / B), aL = 1 - Math.exp(-TAU * 4800 / sr); let env = 0, lp = 0, lp2 = 0, es = 0, g = 0, eg = 1, gp = g0; const out = new Float32Array(n), ref = 10 * Math.log10(mean + 1e-12);
  for (let b = 0; b < nb; b++) {
    const i0 = b * B, i1 = Math.min(n, i0 + B); let e = 0, h = 0; for (let i = i0; i < i1; i++) { const v = x[i]; e += v * v; lp += aL * (v - lp); lp2 += aL * (lp - lp2); const q = v - lp2; h += q * q; } e /= B; h /= B;
    env += (e > env ? .05 : .004) * (e - env); es += (h > es ? .30 : .02) * (h - es);
    const ov = 10 * Math.log10(env + 1e-12) - (ref + 1.5), red = ov > 0 ? -ov * .5 : 0; g += (red < g ? .05 : .008) * (red - g);
    const sib = 10 * Math.log10((es + 1e-12) / (env + 1e-9)), dg = dB(-clamp((sib + 11) * .6, 0, 8)); eg += (dg < eg ? .4 : .05) * (dg - eg);
    const gn = g0 * dB(g + 1.0); for (let i = i0; i < i1; i++) { const u = (i - i0) / B; out[i] = x[i] * (gp + (gn - gp) * u); } gp = gn;
    if (eg < .995) { let a = lp, c = lp2; for (let i = i0; i < i1; i++) { a += aL * (out[i] - a); c += aL * (a - c); out[i] = c + (out[i] - c) * eg; } }
  }
  for (let i = 0; i < 200 && i < n; i++) { out[i] *= i / 200; out[n - 1 - i] *= i / 200; }
  return out;
}
// active loudness of a (stereo) stem: the mean of its loud 20 ms frames
function activeLufs(L, R, q, sr) {
  const [s1, s2] = kCoefs(sr), hop = Math.round(sr * .02), n = L.length, E = []; const a = Float32Array.from(L), b = R ? Float32Array.from(R) : null; filt(a, s1); filt(a, s2); if (b) { filt(b, s1); filt(b, s2); }
  for (let i = 0; i + hop <= n; i += hop) { let e = 0; for (let j = i; j < i + hop; j++) e += a[j] * a[j] + (b ? b[j] * b[j] : 0); E.push(e / hop * q * q); }
  const mx = Math.max(...E, 0); if (mx < 1e-14) return -99; const act = E.filter(e => e > mx * .01); return LK(act.reduce((x, y) => x + y, 0) / act.length);
}
// ---------------------------------------------------------------- the film
function master(stems, SR = 44100, opt = {}) {
  const N = Math.round(DUR * SR), ms = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t00 = ms(), rep = { t: {}, gains: {}, foley: {}, lines: {} }, mark = k => { rep.t[k] = Math.round(ms() - t00); };
  const L = new Float32Array(N), R = new Float32Array(N), sL = new Float32Array(N), sR = new Float32Array(N), bL = new Float32Array(N), bR = new Float32Array(N), bsL = new Float32Array(N), bsR = new Float32Array(N);
  const kL = new Float32Array(N), kR = new Float32Array(N), ksS = new Float32Array(N), ksA = new Float32Array(N), V = new Float32Array(N), F = new Float32Array(N);
  const kindOf = s => s.pcm ? 'voice' : s.lane === 'band' ? 'band' : 'foley', tEnd = s => s.t0 + (s.pcm ? s.pcm.length : s.L.length) / SR;
  const add = (st, G, D1, D2, S1, S2, send, o) => { const n = st.L.length, A = st.L, Bq = st.R || st.L; for (let i = Math.max(0, -o), e = Math.min(n, N - o); i < e; i++) { const a = A[i] * G, b = Bq[i] * G, j = o + i; D1[j] += a; D2[j] += b; if (S1) { S1[j] += a * send; S2[j] += b * send; } } };
  // ---- 1. the band, dry + send, then measured window by window and set to the plan
  const kept = [];
  for (const st of stems) { if (kindOf(st) !== 'band') continue; const o = Math.round(st.t0 * SR), G = (st.q || 1) * (st.mk || 1) / .6, k = keepOf(st, 'band', st.t0, tEnd(st)); if (k) { kept.push({ st, k, kind: 'band', G }); continue; } add(st, G, bL, bR, bsL, bsR, typeof st.send === 'number' ? st.send : .4, o); if (opt.free) st.L = st.R = null; }
  const Eb = kEnergy([bL, bR], SR), fr = t => Math.round(t * 10), gw = {};
  for (const [w, a, b] of WIN) { const l = lufsOf(Eb, fr(a), fr(b)); gw[w] = l < -70 ? 1 : dB(clamp(TGT[w] - l, -24, 24)); rep.gains[w] = { band: +l.toFixed(1), set: +lin(gw[w]).toFixed(1) }; }
  // gain envelope at 10 ms: crossfade .25 s across window edges, but never across a hush edge
  const CB = Math.round(SR / 100), NC = Math.ceil(N / CB) + 2, Gb = new Float32Array(NC);
  for (let c = 0; c < NC; c++) { const t = c / 100; let w = winAt(t); if (!w) w = t < HATCH0 ? 'attack' : 'climaxA'; let g = gw[w]; for (const q of WIN) { const d = t - q[1]; if (Math.abs(d) < .125 && q[1] !== HATCH0 && q[1] !== C.BLUE) { const p = winAt(q[1] - .01); if (p) g = gw[p] + (gw[q[0]] - gw[p]) * smooth((d + .125) / .25); } } Gb[c] = g; }
  mark('band');
  // ---- 2. voices: lines to their level, creature voices to theirs; everyone else listens to the lines
  const vdry = [];
  for (const st of stems) {
    if (kindOf(st) !== 'voice') continue; const line = lineOf(st.id), snd = sndOf(st.id), o = Math.round(st.t0 * SR), t1 = tEnd(st), w = line ? (line.sec === 'climax' ? 'climaxB' : line.sec === 'loss' ? null : line.sec) : winNear(st.t0 + .05), k = keepOf(st, 'voice', st.t0, t1);
    let y;
    if (line) { const target = ABS[line.id] !== undefined ? ABS[line.id] : (TGT[w] || -18) + (LREL[line.id] || 0); y = singer(st, line, SR, target); rep.lines[st.id] = +target.toFixed(1); }
    else { y = Float32Array.from(st.pcm); const l = activeLufs(y, null, 1, SR), who = st.who || (snd && snd.who), sec = SC.sec(st.t0 + .05), comic = sec === 'cave' || sec === 'hatch' || sec === 'train' || sec === 'dawn';
      const target = k === 'alone' ? -28 : (TGT[w] || -18) + (who === 'cinder' ? 1 : comic ? 1 : who === 'ember' ? -1 : -1.5); if (l > -90) { const g = dB(clamp(target - l, -18, 12)); for (let i = 0; i < y.length; i++) y[i] *= g; }
      for (let i = 0; i < 100 && i < y.length; i++) { y[i] *= i / 100; y[y.length - 1 - i] *= i / 100; } }
    const far = line && line.sec === 'loss', ghost = line && line.feel && line.feel.ghost, sec = w || 'ink';
    const v = { y, o, k, line, dry: far ? .16 : ghost ? .8 : 1, wet: far ? .9 : (SEND[sec] || .4) * (ghost ? 1.3 : .8) }; vdry.push(v);
    if (line && !far) for (let i = Math.max(0, -o), e = Math.min(y.length, N - o); i < e; i++) V[o + i] += y[i];
    else if (snd && (snd.kind === 'roar' || snd.kind === 'screech' || snd.kind === 'snarl')) for (let i = Math.max(0, -o), e = Math.min(y.length, N - o); i < e; i++) F[o + i] += y[i];
  }
  mark('voice');
  // ---- 3. foley: two buses (beds, effects) measured window by window, set against the band's plan (frames add as energies)
  const fx = [], NF = Math.ceil(N / 4410) + 2, Ea = new Float64Array(NF), Ex = new Float64Array(NF), [k1, k2] = kCoefs(SR);
  for (const st of stems) { if (kindOf(st) !== 'foley' || !st.L) continue; const k = keepOf(st, 'foley', st.t0, tEnd(st)); if (k) { kept.push({ st, k, kind: 'foley', G: st.q || 1 }); continue; } fx.push(st);
    const E = st.bus === 'amb' ? Ea : Ex, q = st.q || 1, o = Math.round(st.t0 * SR); for (const X of [st.L, st.R || st.L]) { const y = Float32Array.from(X); filt(y, k1); filt(y, k2); for (let i = 0; i < y.length; i++) { const j = o + i; if (j >= 0 && j < N) E[(j / 4410) | 0] += y[i] * y[i] * q * q / 4410; } } }
  const gf = { amb: {}, fx: {} };
  for (const [w, a, b] of WIN) for (const [bus, E] of [['amb', Ea], ['fx', Ex]]) { const l = lufsOf(E, fr(a), fr(b)), tg = TGT[w] + (bus === 'amb' ? AMB : FXREL[w] !== undefined ? FXREL[w] : FXSOFT); gf[bus][w] = l < -70 ? 1 : dB(clamp(tg - l, -FXCLAMP, bus === 'fx' ? 14 : FXCLAMP)); rep.foley[bus + '.' + w] = { lufs: +l.toFixed(1), set: +lin(gf[bus][w]).toFixed(1), vsMusic: l < -70 ? null : +(l + lin(gf[bus][w]) - TGT[w]).toFixed(1) }; }
  const envOf = g2 => { const G = new Float32Array(NC); for (let c = 0; c < NC; c++) { const t = c / 100; let g = g2[winNear(t)]; for (const q of WIN) { const d = t - q[1]; if (Math.abs(d) < .125 && q[1] !== HATCH0 && q[1] !== C.BLUE) { const p = winAt(q[1] - .01); if (p) g = g2[p] + (g2[q[0]] - g2[p]) * smooth((d + .125) / .25); } } G[c] = g; } return G; };
  const GfA = envOf(gf.amb), GfX = envOf(gf.fx);
  for (const s of fx) { const o = Math.round(s.t0 * SR), q = s.q || 1, G = s.bus === 'amb' ? GfA : GfX, send = typeof s.send === 'number' ? s.send : .2, A = s.L, Bq = s.R || s.L, isfx = s.bus !== 'amb';
    for (let i = Math.max(0, -o), e = Math.min(A.length, N - o); i < e; i++) { const j = o + i, c = j / CB, c0 = c | 0, g = q * (G[c0] + (G[c0 + 1] - G[c0]) * (c - c0)), a = A[i] * g, b = Bq[i] * g; L[j] += a; R[j] += b; sL[j] += a * send; sR[j] += b * send; if (isfx) F[j] += (a + b) * .5; }
    if (opt.free) s.L = s.R = null; }
  mark('foley');
  // ---- 4. ducks at 10 ms, 60 ms look-ahead: lines take ~4 dB (mid band more), big effects ~3 dB
  const duckV = new Float32Array(NC), duckF = new Float32Array(NC);
  { let e = 0, f = 0; for (let c = 0; c < NC - 2; c++) { let s = 0, u = 0; const i1 = Math.min(N, (c + 1) * CB); for (let i = c * CB; i < i1; i++) { s += V[i] * V[i]; u += F[i] * F[i]; } const lv = 10 * Math.log10(s / CB + 1e-12), lf = 10 * Math.log10(u / CB + 1e-12), w = winNear(c / 100), tg = TGT[w] || -20;
      const a = smooth((lv - (tg - 6)) / 10); e += (a > e ? .12 : .02) * (a - e); duckV[c] = e; const b = smooth((lf - (tg - 12)) / 9); f += (b > f ? .2 : .018) * (b - f); duckF[c] = f; }
    for (let c = 0; c < NC - 8; c++) { duckV[c] = duckV[c + 6]; duckF[c] = duckF[c + 6]; } }
  { const a3 = 1 - Math.exp(-TAU * 3600 / SR), a4 = 1 - Math.exp(-TAU * 450 / SR); let p = 0, q = 0, u = 0, w = 0, mx = 0;
    for (let c = 0; c < NC - 2; c++) { const i0 = c * CB, i1 = Math.min(N, i0 + CB), g0 = Gb[c] * dB(-3.8 * duckV[c] - 3 * duckF[c] * (1 - .5 * duckV[c])), g1 = Gb[c + 1] * dB(-3.8 * duckV[c + 1] - 3 * duckF[c + 1] * (1 - .5 * duckV[c + 1])), m0 = 1 - dB(-2 * duckV[c]), m1 = 1 - dB(-2 * duckV[c + 1]);
      mx = Math.max(mx, 3.8 * duckV[c] + 3 * duckF[c] * (1 - .5 * duckV[c]));
      for (let i = i0; i < i1; i++) { const u2 = (i - i0) / CB, g = g0 + (g1 - g0) * u2, m = m0 + (m1 - m0) * u2; let a = bL[i], b = bR[i]; p += a3 * (a - p); q += a4 * (a - q); u += a3 * (b - u); w += a4 * (b - w); a = (a - m * (p - q)) * g; b = (b - m * (u - w)) * g; bL[i] = a; bR[i] = b; sL[i] += bsL[i] * g; sR[i] += bsR[i] * g; } }
    rep.duckMaxDb = +mx.toFixed(2); rep.duckV = duckV; rep.duckF = duckF; }
  const Ebd = kEnergy([bL, bR], SR); for (let i = 0; i < N; i++) { L[i] += bL[i]; R[i] += bR[i]; }
  // each line against the (ducked) band under it, LU
  rep.lineOver = {}; for (const v of vdry) if (v.line && v.line.sec !== 'loss') { const y = Float32Array.from(v.y); filt(y, k1); filt(y, k2); const Ev = new Float64Array(NF); for (let i = 0; i < y.length; i++) { const j = v.o + i; if (j >= 0 && j < N) Ev[(j / 4410) | 0] += y[i] * y[i] / 4410; } let sv = 0, sm = 0; for (const q of v.line.notes) for (let k = fr(q.t0); k < fr(q.t1); k++) { sv += Ev[k]; sm += Ebd[k]; } rep.lineOver[v.line.id] = +(LK(sv) - LK(sm)).toFixed(1); }
  for (const v of vdry) { if (v.k) continue; for (let i = Math.max(0, -v.o), e = Math.min(v.y.length, N - v.o); i < e; i++) { const a = v.y[i] * .7071, j = v.o + i; L[j] += a * v.dry; R[j] += a * v.dry; sL[j] += a * v.wet; sR[j] += a * v.wet; } }
  // ---- 5. what sounds through the hushes, on its own buses
  for (const q of kept) { const st = q.st, o = Math.round(st.t0 * SR); let G = q.G; if (q.kind === 'band') { const l = activeLufs(st.L, st.R, G, SR); if (l > -90) G *= dB(clamp(KEEPDB[q.k] - l, -30, 12)); } add(st, G, kL, kR, q.k === 'silence' ? ksS : ksA, q.k === 'silence' ? ksS : ksA, typeof st.send === 'number' ? st.send * .5 : .2, o); }
  for (const v of vdry) { if (!v.k) continue; const S = v.k === 'silence' ? ksS : ksA; for (let i = Math.max(0, -v.o), e = Math.min(v.y.length, N - v.o); i < e; i++) { const a = v.y[i] * .7071, j = v.o + i; kL[j] += a * v.dry; kR[j] += a * v.dry; S[j] += a * v.wet; } }
  mark('sum');
  // ---- 6. the hard silences: a gate on everything that is not kept, before and after the rooms
  const GB = 32, gate = new Float32Array(Math.ceil(N / GB) + 2).fill(1);
  for (const h of HUSH) for (let b = 0; b < gate.length; b++) { const t = b * GB / SR; let g = 1; if (t >= h.a - .004 && t < h.b - h.open - .004) g = t < h.a ? smooth((h.a - t) / .004) : 0; else if (t >= h.b - h.open - .004 && t < h.b - .004) g = smooth((t - (h.b - h.open - .004)) / h.open); gate[b] = Math.min(gate[b], g); }
  const applyGate = (X, k = 1) => { const n = X.length, gb = GB / k; for (let b = 0; b * gb < n; b++) { const g0 = gate[b], g1 = gate[b + 1]; if (g0 === 1 && g1 === 1) continue; const i1 = Math.min(n, (b + 1) * gb); for (let i = b * gb; i < i1; i++) X[i] *= g0 + (g1 - g0) * (i - b * gb) / gb; } };
  for (const X of [L, R, sL, sR]) applyGate(X);
  // ---- 7. rooms, at half rate
  for (const x of [sL, sR, ksS, ksA]) { let q = 0, p = 0; const a = 1 - Math.exp(-TAU * 150 / SR); for (let i = 0; i < N; i++) { q += a * (x[i] - q); const y = x[i] - q; p += a * (y - p); x[i] = y - p; } }
  const hL = halve(sL), hR = halve(sR), n2 = hL.length, sr = SR / 2, wL = new Float32Array(n2 + 16), wR = new Float32Array(n2 + 16), ix = t => clamp(Math.round(t * sr), 0, n2);
  for (const [k, a, b, fi, fo] of PLACE) { const i0 = ix(a - fi / 2), i1 = ix(b + fo / 2), n = i1 - i0, fin = Math.max(1, fi * sr), fon = Math.max(1, fo * sr), o = ROOMS[k]; if (n < 8) continue; convolve(hL, hR, i0, i1, i => (i < fin ? smooth(i / fin) : 1) * (n - i < fon ? smooth((n - i) / fon) : 1), makeIR(o, sr), wL, wR, o.wet * (k === 'air' && a === C.BLUE ? .7 : 1)); }
  applyGate(wL, 2); applyGate(wR, 2);
  const kwL = new Float32Array(n2 + 16), kwR = new Float32Array(n2 + 16);
  for (const [S, room] of [[ksS, 'ghost'], [ksA, 'close']]) { const x = halve(S); let any = 0; for (let i = 0; i < x.length; i++) if (x[i] !== 0) { any = 1; break; } if (!any) continue; const o = ROOMS[room]; convolve(x, x, 0, x.length, null, makeIR(o, sr), kwL, kwR, o.wet); }
  doubleInto(wL, L); doubleInto(wR, R); doubleInto(kwL, kL); doubleInto(kwR, kR);
  mark('rooms');
  // ---- 8. master: infrasonic off and a little air on each bus, the gate once more (filters ring on after a cut), then the kept bus joins
  for (const x of [L, R, kL, kR]) { filt(x, bq('hp', 24, .65, 0, SR)); filt(x, bq('hs', 3600, .6, 2.4, SR)); }
  applyGate(L); applyGate(R); for (let i = 0; i < N; i++) { L[i] += kL[i]; R[i] += kR[i]; }
  // a gentle slow glue, -14 LUFS, a look-ahead true-peak limiter, the paper's last breath
  const tail = Math.round(1.2 * SR); for (let i = 0; i < tail; i++) { const g = smooth(i / tail); L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
  const target = opt.lufs || -14, hop = Math.round(SR / 10); let E0 = kEnergy([L, R], SR), l0 = integrated(E0); const pre = l0 < -60 ? 1 : dB(target - l0); rep.pre = +lin(pre).toFixed(2);
  { const g = new Float64Array(E0.length + 2); let y = 0, e = 0; for (let k = 0; k < E0.length; k++) { const v = E0[k] * pre * pre; e += (v > e ? .3 : .08) * (v - e); const ov = LK(e) - (target + 5), red = ov > 0 ? -Math.min(2.5, ov * .4) : 0; y += (red < y ? .25 : .05) * (red - y); g[k] = dB(y); } g[E0.length] = g[E0.length + 1] = g[E0.length - 1] || 1; rep.glueDb = +lin(Math.min(...g)).toFixed(2);
    for (const x of [L, R]) for (let i = 0; i < N; i++) { const p = i / hop, k = p | 0, f = p - k, a = g[Math.min(k, g.length - 1)], b = g[Math.min(k + 1, g.length - 1)]; x[i] *= pre * (a + (b - a) * f); } }
  mark('glue');
  const limit = ceil => { const B2 = 16, nb = Math.ceil(N / B2), W = 14, need = new Float32Array(nb + W + 2).fill(1); let worst = 1, n = 0;
    for (let b = 0; b < nb; b++) { let p = 0; const i1 = Math.min(N, b * B2 + B2); for (let i = b * B2; i < i1; i++) { const a = L[i] < 0 ? -L[i] : L[i], c = R[i] < 0 ? -R[i] : R[i]; if (a > p) p = a; if (c > p) p = c; } p *= 1.06; if (p > ceil) { need[b] = ceil / p; n++; if (need[b] < worst) worst = need[b]; } }
    const m = new Float32Array(nb + W + 2); let y = 1; for (let b = 0; b < nb; b++) { let q = 1; for (let k = 0; k <= W; k++) if (need[b + k] < q) q = need[b + k]; y = q < y ? q : y + .0025 * (q - y); m[b] = y; } for (let b = nb; b < m.length; b++) m[b] = 1;
    const ring = new Float32Array(W).fill(1); let s = W, gp = 1; for (let b = 0; b < nb; b++) { s += m[b] - ring[b % W]; ring[b % W] = m[b]; const gn = Math.min(1, s / W), i0 = b * B2, i1 = Math.min(N, i0 + B2), d = (gn - gp) / B2; if (gn < .99999 || gp < .99999) { let k = gp; for (let i = i0; i < i1; i++) { k += d; L[i] *= k; R[i] *= k; } } gp = gn; }
    return { db: lin(worst), blocks: n }; };
  const ceil = dB(-1.3); let lr = limit(ceil);
  for (let it = 0; it < 3; it++) { const l = integrated(kEnergy([L, R], SR)); if (Math.abs(l - target) < .04 || l < -60) break; const k = dB(target - l); for (const x of [L, R]) for (let i = 0; i < N; i++) x[i] *= k; lr = limit(ceil); }
  rep.limiterDb = +lr.db.toFixed(2); rep.limitedMs = Math.round(lr.blocks * 16 / SR * 1000);
  mark('limit');
  if (opt.report !== false) { const E = kEnergy([L, R], SR); rep.lufs = +integrated(E).toFixed(2); rep.E = E; rep.tp = +lin(Math.max(truePeak(L), truePeak(R))).toFixed(2); if (rep.tp > -1.05) { const k = dB(-1.1 - rep.tp); for (const x of [L, R]) for (let i = 0; i < N; i++) x[i] *= k; rep.lufs = +(rep.lufs + lin(k)).toFixed(2); rep.tp = -1.1; } }
  mark('end');
  return { L, R, report: rep };
}
// integrated(E) on 100 ms K-energies, or integrated(L, R, SR) straight on a stereo master
const integratedAny = (a, b, sr) => b && b.length && typeof sr === 'number' ? integrated(kEnergy([a, b], sr)) : integrated(a);
return { master, ROOMS, makeIR, kEnergy, integrated: integratedAny, truePeak, TGT, WIN, HUSH, activeLufs };
})();
if (typeof module !== 'undefined') module.exports = MIX;
