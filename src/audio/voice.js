// ============================================================================
// voice.js - ASH & EMBER: every throat in the film. A physical model of a vocal tract, sample by sample: an LF glottis
// blowing into a travelling-wave tube (44 oral + 30 nasal sections, 43-220 kHz by throat size) with sinuses, piriform and
// lateral pockets, yielding walls, quasi-static aerodynamics and turbulence at the constrictions.
// Singers: NOCT (young warm baritone-tenor), LUNE (light bright soprano), ASH (old, gravel and smoke), the CHOIR (8 throats).
// Creatures: EMBER (a 7 cm tube and a tiny syrinx), ASH, the parents' dragon throats, CINDER (a 36 cm tube + sub + fire crackle).
// Pure JavaScript, deterministic, no libraries, no samples. CGS units inside (cm, g, s).
//   VOICE.jobs() -> ids    VOICE.render(id) -> { id, who, t0, pcm, vis }    VOICE.cost(id)    VOICE.reply(variant) -> Ember's chirp
// ============================================================================
const VOICE = (() => {
'use strict';
const SC = (typeof Score !== 'undefined') ? Score : require('../06_score.js');
const SR = 44100, TAU = Math.PI * 2, PI4 = Math.PI * .25;
const RHO = 0.00114, C0 = 35200, RC = RHO * C0, L0 = 16.3, LIP0 = 15.45;
const NSEC = 44, VSEC = 21, PIRI_SEC = 5, LAT_SEC = 34, PIRI_LEN = 5, LAT_LEN = 6, NN = 30;
const SUB = 4, BLK = 24, FRAME = SUB * BLK;
// the loudness scale: a line sung at dyn 0 sits here (dBFS RMS of its vowels, above 260 Hz)
const DB0 = -21.5, LREF = 106;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sstep = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10); };
const s3 = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- seeded noise
function rng(seed) {
  let a = (seed >>> 0) || 1, sp = 0, has = false;
  const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.g = () => { if (has) { has = false; return sp; } const r = Math.sqrt(-2 * Math.log(1 - u())), p = TAU * u(); sp = r * Math.sin(p); has = true; return r * Math.cos(p); };
  u.r = (lo, hi) => lo + (hi - lo) * u();
  return u;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// two-pole low-passed random walk with about unit variance, times amp
function smoothNoise(n, dt, fc, R, amp) {
  const a = 1 - Math.exp(-TAU * fc * dt), g = amp / Math.sqrt(a / 2) / .72, out = new Float64Array(n); let x = 0, y = 0;
  for (let i = -Math.min(4000, Math.round(1.5 / (fc * dt))); i < n; i++) { x += a * (R.g() - x); y += a * (x - y); if (i >= 0) out[i] = y * g; }
  return out;
}

// ---------------------------------------------------------------- the tract: articulators -> diameters
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; let u = (x - x0) / (x1 - x0); u = u * u * (3 - 2 * u) * .5 + u * .5; return y0 + (y1 - y0) * u;
  }
  return pts[pts.length - 1][1];
}
const _D0 = [[-2, .80], [0, .80], [.7, .76], [1.5, .80], [2.0, .98], [2.5, 1.34], [3.2, 1.58], [4.5, 1.64], [6.2, 1.60], [7.6, 1.56], [9, 1.58], [10.5, 1.66], [12, 1.70], [13.4, 1.66], [14.4, 1.54], [15.1, 1.34], [15.5, 1.24], [19, 1.24]];
const _W = [[-2, 0], [1.8, 0], [2.6, .55], [3.8, 1.0], [12.6, 1.0], [14.0, .78], [14.9, .45], [15.5, .12], [16, 0], [19, 0]];
const _JW = [[-2, 0], [7.5, 0], [9.5, .22], [12, .62], [14, .92], [15.4, 1.0], [19, 1.0]];
const _TRW = [[-2, 0], [2.0, 0], [3.2, .8], [4.4, 1.0], [6.0, .7], [7.8, .1], [8.5, 0], [19, 0]];
const _EPW = [[-2, 1], [1.2, 1], [2.0, .7], [2.8, 0], [19, 0]];
const GS = 40, S_MIN = -1.5, S_MAX = 18.5, TN = Math.floor((S_MAX - S_MIN) * GS) + 2, PX = 11.75, LAM = 13.7;
const tab = fn => Float64Array.from({ length: TN }, (_, i) => fn(S_MIN + i / GS));
const T_D0 = tab(s => interp(_D0, s)), T_JW = tab(s => interp(_JW, s)), T_TR = tab(s => interp(_TRW, s)), T_EP = tab(s => interp(_EPW, s));
const T_FX = tab(s => interp(_W, s) * Math.cos(TAU * (s - PX) / LAM)), T_FY = tab(s => interp(_W, s) * Math.cos(TAU * (s - (PX - LAM / 4)) / LAM));

// fitted vowel and sonorant postures: J X Y TR TT BP LA LP LH EP, then F1 (Hz, 16.3 cm tract)
const BODY = ['J', 'X', 'Y', 'TR', 'TT', 'BP', 'LA', 'LP', 'LH', 'EP'];
const RAW = {
  A: [1, -0.248, -0.0676, -0.397, 0, 13.6, 2.2213, -0.2, 0, 0, 796],
  AA: [1, -0.3191, -0.1742, -0.5476, 0, 13.6, 2.0408, -0.2346, 0, 0, 783],
  AE: [1, 0.4323, -0.0048, -0.55, 0, 13.6, 2.8, -0.45, 0, 0, 744],
  AH: [0.6332, -0.2681, 0.0472, -0.1955, 0, 13.6, 1.4306, -0.0053, 0, 0, 694],
  AO: [0.7987, -0.4293, 0.1033, -0.55, 0, 13.6, 1.1438, 0.5, 0.5, 0, 604],
  AX: [0.2619, 0.461, 0.328, -0.1237, 0, 13.6, 1.0022, 0.0653, 0, 0, 520],
  EH: [0.488, 0.4091, 0.0289, -0.0015, 0, 13.6, 2.3254, -0.45, 0, 0, 614],
  ER: [0.2683, 0.0984, 0.0316, -0.5489, 1.2964, 11.8, 0.9406, 0.5143, 0, 0, 500],
  EY: [0.1702, 0.6479, -0.1343, 0.1918, 0, 13.6, 1.6334, -0.4356, 0, 0, 480],
  IH: [0.18, 0.8253, 0.2477, 0.1869, 0, 13.6, 1.4657, -0.1385, 0, 0, 427],
  IY: [0.0971, 1.0008, 0.1757, 0.8, 0, 13.6, 1.2576, -0.4275, -0.1744, 0, 334],
  L: [0.2639, -0.2292, 0.1905, 0.4454, 0, 13.6, 0.4226, 0.3189, 0, 0, 380],
  LD: [0.6001, -0.2479, 0.3928, -0.5486, 0, 13.6, 0.6109, 0.6174, 0, 0, 460],
  O: [0.567, -0.3494, 0.1983, -0.55, 0, 13.6, 0.7789, 0.4682, 0.5, 0, 525],
  OR: [0.6279, -0.4687, 0.0301, -0.5319, 0, 13.6, 0.7335, 0.3567, 0.5, 0, 505],
  R: [0.2075, 0.0646, -0.1439, -0.5457, 1.3099, 11.9938, 0.4564, 0.7867, 0, 0, 400],
  UH: [0.3715, -0.0405, 0.2375, -0.4471, 0, 13.6, 0.5952, 0.69, 0, 0, 460],
  UW: [0.1804, 0.5289, 0.398, -0.4407, 0, 13.6, 0.4, 0.9949, 0.2043, 0, 373],
  W: [0.6922, 0.8194, 0.6662, -0.4008, 0, 13.6, 0.4, 0.9523, 0.5, 0, 340],
  Y: [0.02, 1.0534, -0.5736, 0.5933, 0, 13.6, 1.304, -0.1453, -0.0672, 0, 300],
};
const SHAPES = {}, F1OF = {};
for (const k in RAW) { SHAPES[k] = {}; BODY.forEach((b, i) => { SHAPES[k][b] = RAW[k][i]; }); F1OF[k] = RAW[k][10]; }

// ---------------------------------------------------------------- the singers
// sp/so: pharynx and mouth length against the 16.3 cm reference. sd: tube width. rd: source tilt.
// fem: a light high throat (less jitter up high). air: turbulence at the folds. age: default age. tk: which compiled tube it shares.
const SINGER = {
  noct:  { sp: 1.06, so: 1.02, sd: 1.02, rd: .03, rdMin: .70, lowRef: 125, fscale: .96, mid: 60, jit: .8, shim: 1.0, flut: 7, grain: .10, vibRate: 5.6, lhRef: 205, gload: .45, hp: 70, shelf: [240, 2.0], lp: 8000, wr: .028 },
  lune:  { sp: .84, so: .90, sd: .92, rd: .05, rdMin: .80, lowRef: 220, fscale: 1.15, mid: 70, jit: .8, shim: 1.0, flut: 8, grain: .03, vibRate: 5.9, lhRef: 380, gload: .42, hp: 130, shelf: [320, 1.2], lp: 8400, wr: .018, fem: 1 },
  ash:   { sp: 1.13, so: 1.06, sd: 1.06, rd: .16, rdMin: .76, lowRef: 105, fscale: .92, mid: 55, jit: 1.8, shim: 1.8, flut: 13, grain: .80, vibRate: 4.5, lhRef: 165, gload: .48, hp: 55, shelf: [210, 2.6], lp: 7000, wr: .034, air: 1.8, age: 1 },
  chF:   { sp: .87, so: .93, sd: .94, rd: .02, rdMin: .78, lowRef: 210, fscale: 1.12, mid: 69, jit: .9, shim: 1.0, flut: 8, grain: .03, vibRate: 5.7, lhRef: 360, gload: .42, hp: 140, shelf: [320, 1], lp: 7600, wr: .018, fem: 1 },
  chM:   { sp: 1.08, so: 1.03, sd: 1.03, rd: .02, rdMin: .70, lowRef: 120, fscale: .95, mid: 57, jit: .9, shim: 1.0, flut: 7, grain: .08, vibRate: 5.4, lhRef: 195, gload: .45, hp: 75, shelf: [240, 1.6], lp: 7600, wr: .026 },
  // creature throats
  ember: { sp: .40, so: .46, sd: .58, rd: .00, rdMin: .72, lowRef: 420, fscale: 2.2, mid: 82, jit: 1.3, shim: 1.3, flut: 16, grain: .10, vibRate: 7.5, lhRef: 800, gload: .40, hp: 260, shelf: [600, 1], lp: 5600, wr: .012, fem: 1 },
  blue:  { sp: .92, so: .96, sd: 1.05, rd: -.06, rdMin: .60, lowRef: 230, fscale: 1.08, mid: 66, jit: 1.2, shim: 1.2, flut: 10, grain: .2, vibRate: 6.2, lhRef: 360, gload: .42, hp: 90, shelf: [200, 3], lp: 5600, wr: .02, fem: 1 },
  noctR: { sp: 1.45, so: 1.35, sd: 1.30, rd: -.02, rdMin: .62, lowRef: 90, fscale: .70, mid: 50, jit: 1.6, shim: 1.6, flut: 14, grain: .5, vibRate: 4.6, lhRef: 140, gload: .48, hp: 45, shelf: [150, 3], lp: 5400, wr: .03 },
  luneR: { sp: 1.18, so: 1.12, sd: 1.12, rd: -.02, rdMin: .62, lowRef: 160, fscale: .86, mid: 60, jit: 1.4, shim: 1.4, flut: 12, grain: .3, vibRate: 5.0, lhRef: 260, gload: .45, hp: 70, shelf: [200, 2.5], lp: 5600, wr: .024, fem: 1 },
  cinS:  { sp: 1.55, so: 1.35, sd: 1.45, rd: -.04, rdMin: .60, lowRef: 120, fscale: .66, mid: 50, jit: 2.2, shim: 2.0, flut: 20, grain: 1, vibRate: 3.6, lhRef: 180, gload: .5, hp: 34, shelf: [130, 4], lp: 4600, wr: .04 },
  cinder:{ sp: 2.30, so: 2.10, sd: 1.90, rd: -.02, rdMin: .62, lowRef: 55, fscale: .45, mid: 36, jit: 2.4, shim: 2.2, flut: 24, grain: 1, vibRate: 3.2, lhRef: 70, gload: .5, hp: 26, shelf: [110, 5], lp: 4400, wr: .045 },
};
// eight choir throats on two compiled tubes: each a slightly different body
for (let k = 0; k < 4; k++) for (const b of ['chF', 'chM']) { const B = SINGER[b], d = (k - 1.5) / 1.5; SINGER[b + k] = Object.assign({}, B, { sp: B.sp * (1 + .035 * d), so: B.so * (1 - .025 * d), sd: B.sd * (1 + .03 * Math.sin(k * 2.1)), fscale: B.fscale * (1 - .03 * d), vibRate: B.vibRate * (1 + .05 * Math.sin(k * 1.7 + 1)), rd: B.rd + .04 * Math.cos(k * 2.3), tk: b }); }
for (const k in SINGER) { const V = SINGER[k]; V.len = V.sp * 8 + V.so * 8.3; V.Tn = V.len / (NSEC * C0); V.name = k; if (!V.tk) V.tk = k; }

// ---------------------------------------------------------------- the tube (flat generated source, one sample of delay per section)
const WALLS = [3, 8, 12, 16, 19, 24, 28, 32, 36, 39], HFL = [7, 15, 27, 36, 41], ASP = [2, 9];
const FRI = [26, 29, 31, 35, 37, 38, 39, 40, 41, 42, 43], WRAD = [8, 12, 36], NHF = [4, 9, 15, 21, 26], NVAR = 6, NSRC = 25;
const PJ = 33;                                        // junction where the throat pouch hangs (hum only)
const ORAL = []; for (let i = 1; i < NSEC; i++) if (i !== VSEC && i !== PIRI_SEC && i !== LAT_SEC) ORAL.push(i);
const COEF = ORAL.map(i => 'k' + i).concat(['v1', 'v2', 'v3', 'q1', 'q2', 'q3', 't1', 't2', 't3'], [1, 2, 3, 4, 5, 6].map(j => 'm' + j), ['ql', 'yl', 'z0']);
const GODD = []; for (let i = 1; i < NSEC; i += 2) GODD.push(i);
const CONST = GODD.map(i => 'g' + i).concat(WALLS.map(i => 'w' + i), ['hw', 'lq', 'rlq', 'dT'], FRI.map(i => 'n' + i), ASP.map(i => 'a' + i), ['wr', 'hf', 'an', 'pz', 'pw']);
const NC = COEF.length, NK = CONST.length;
const _NA = [[0, .9], [2, 1.7], [4, 2.8], [8, 4.0], [12, 4.8], [16, 5.0], [20, 4.2], [24, 2.4], [26, 1.3], [27, .95], [29, 1.0]];
const NAREA = Float64Array.from({ length: NN }, (_, j) => { for (let q = 1; q < _NA.length; q++) if (j <= _NA[q][0]) { const [x0, y0] = _NA[q - 1], [x1, y1] = _NA[q]; return y0 + (y1 - y0) * (j - x0) / (x1 - x0); } return 1; });
function radiation(A, T) { const Y = A / RC, G = Y * .694, q = T * 3 * Math.PI * Math.sqrt(Math.PI * A) / (8 * RHO), d = 1 / (Y + G + q); return [(Y - G - q) * d, d, q, Y]; }
function noseStatic(T) {
  const mk = new Float64Array(NN); for (let j = 1; j < NN; j++) mk[j] = (NAREA[j - 1] - NAREA[j]) / (NAREA[j - 1] + NAREA[j]);
  const sinus = (f, R, L, A) => { const C = 1 / ((TAU * f) ** 2 * L); return [T / L, R, T / C, RC / (2 * A)]; };
  return { mk, gn: .9925, rad: radiation(NAREA[NN - 1], T), s: [sinus(480, 3, .006, NAREA[12]), sinus(1150, 8, .009, NAREA[18])], hn: .15,
    hc: 1 - Math.exp(-TAU * 3600 * T), hb: 1 - Math.exp(-TAU * 700 * T), ha: 1 - Math.exp(-TAU * 5500 * T), hp: 1 - Math.exp(-TAU * 900 * T) };
}
// the pouch: a thin skin bag on the mouth, mass against spring, heard through its wall
function pouchStatic(T, f, Q, Lm) { const L = Lm, C = 1 / ((TAU * f) ** 2 * L); return [T / L, TAU * f * L / Q, T / C]; }
const SIN = [[12, 0], [18, 1]];
const num = x => '(' + (+x).toPrecision(15) + ')';
function tubeFn(T, pouch) {
  const NS = noseStatic(T), b = [], st = [], P = s => b.push(s);
  const S = n => st.push(n);
  for (let i = 0; i < NSEC; i++) { S('f' + i); S('b' + i); }
  for (let j = 0; j < NN; j++) { S('nf' + j); S('nb' + j); }
  WALLS.forEach(i => S('u' + i)); HFL.forEach(i => { S('lf' + i); S('lb' + i); });
  for (let i = 0; i < 2 * PIRI_LEN; i++) S('pq' + i);
  for (let i = 0; i < 2 * LAT_LEN; i++) S('lq' + i + '_');
  NHF.forEach(j => { S('nlf' + j); S('nlb' + j); });
  ['su0', 'su1', 'sp0', 'sp1', 'vg', 'uL', 'uN', 'Up', 'nl1', 'nl2'].forEach(S);
  if (pouch) ['pu', 'pp', 'pl1'].forEach(S);
  P('let ' + st.map((n, i) => n + '=st[' + i + ']').join(',') + ';');
  P('let ' + COEF.map((n, i) => n + '=K[ka+' + i + ']').join(',') + ';');
  P('const ' + COEF.map((n, i) => 'd_' + n + '=(K[kb+' + i + ']-' + n + ')*' + num(1 / BLK)).join(',') + ';');
  P('const ' + CONST.map((n, i) => n + '=C[co+' + i + ']').join(',') + ';');
  P('let x=0,y=0,p=0,r=0,e=0,w=0,nin=0,U=0,us=0,ag=0,na=0,nf=0;');
  P('for(let sb=0;sb<' + BLK + ';sb++){');
  P('const rl2=1/(1.694*yl+ql),rl1=(0.306*yl-ql)*rl2,rl3=rl2*ql;');
  P('for(let q=0;q<' + SUB + ';q++,pos++){');
  P('us=US[pos];ag=AG[pos];na=NA[pos];nf=NF[pos];');
  P('vg=(2*b0+us*z0+lq*vg)/(rlq+ag*z0);');
  P('x=f0;f0=b0+(us-ag*vg)*z0;');
  let cur = 'x', nxt = 'y';
  for (let i = 1; i < NSEC; i++) {
    const g = i % 2 === 1 ? 'g' + i : null;
    P(`${nxt}=f${i};`);
    if (i === VSEC) P(`p=v1*${cur}+v2*b${i}+v3*nb0;f${i}=p-b${i};b${i - 1}=p-${cur};nin=p-nb0;`);
    else if (i === PIRI_SEC) {
      P(`r=pq${2 * PIRI_LEN - 1}*.97;p=q1*${cur}+q2*b${i}+q3*r;f${i}=p-b${i};b${i - 1}=p-${cur};`);
      for (let q = 2 * PIRI_LEN - 1; q > 0; q--) P(`pq${q}=pq${q - 1};`); P('pq0=p-r;');
    } else if (i === LAT_SEC) {
      P(`r=lq${2 * LAT_LEN - 1}_*.95;p=t1*${cur}+t2*b${i}+t3*r;f${i}=p-b${i};b${i - 1}=p-${cur};`);
      for (let q = 2 * LAT_LEN - 1; q > 0; q--) P(`lq${q}_=lq${q - 1}_;`); P('lq0_=p-r;');
    } else {
      P(`w=k${i}*(${cur}-b${i});`);
      if (WALLS.includes(i)) P(`u${i}=hw*u${i}+${cur}+w+b${i};w-=u${i}*w${i};`);
      if (pouch && i === PJ) P(`pu+=${num(pouch[0])}*(${cur}+w+b${i}-pp-${num(pouch[1])}*pu);pp+=${num(pouch[2])}*pu;w-=pu*pz;`);
      let fo = `${cur}+w`, bo = `b${i}+w`;
      if (ASP.includes(i)) { P(`e=na*a${i};`); fo += '+e'; bo += '-e'; }
      if (FRI.includes(i)) { P(`e=nf*n${i};`); fo += '+e'; bo += '-e'; }
      if (HFL.includes(i)) {
        P(`p=${fo};lf${i}+=${num(NS.ha)}*(p-lf${i});f${i}=p-hf*(p-lf${i});`);
        P(`p=${bo};lb${i}+=${num(NS.ha)}*(p-lb${i});b${i - 1}=p-hf*(p-lb${i});`);
      } else if (g) P(`f${i}=(${fo})*${g};b${i - 1}=(${bo})*${g};`);
      else P(`f${i}=${fo};b${i - 1}=${bo};`);
    }
    [cur, nxt] = [nxt, cur];
  }
  P(`r=rl1*${cur}-rl3*uL;b${NSEC - 1}=r;uL+=${cur}+r;U=yl*(${cur}-r);`);
  P('x=nf0;nf0=nin;'); cur = 'x'; nxt = 'y';
  for (let j = 1; j < NN; j++) {
    P(`${nxt}=nf${j};`);
    P(`w=${j <= NVAR ? 'm' + j : num(NS.mk[j])}*(${cur}-nb${j});`);
    for (const [sj, id] of SIN) if (sj === j) { const s = NS.s[id]; P(`su${id}+=${num(s[0])}*(${cur}+w+nb${j}-sp${id}-${num(s[1])}*su${id});sp${id}+=${num(s[2])}*su${id};w-=su${id}*${num(s[3])};`); }
    let fo = `${cur}+w`, bo = `nb${j}+w`;
    if (j === NSRC) { P('e=na*an;'); fo += '+e'; bo += '-e'; }
    if (NHF.includes(j)) {
      P(`p=${fo};nlf${j}+=${num(NS.hb)}*(p-nlf${j});nf${j}=p-${num(NS.hn)}*(p-nlf${j});`);
      P(`p=${bo};nlb${j}+=${num(NS.hb)}*(p-nlb${j});nb${j - 1}=p-${num(NS.hn)}*(p-nlb${j});`);
    } else if (j % 2 === 0) P(`nf${j}=(${fo})*${num(NS.gn)};nb${j - 1}=(${bo})*${num(NS.gn)};`);
    else P(`nf${j}=${fo};nb${j - 1}=${bo};`);
    [cur, nxt] = [nxt, cur];
  }
  P(`r=${num(NS.rad[0])}*${cur}-${num(NS.rad[1])}*uN;nb${NN - 1}=r*.985;uN+=${num(NS.rad[2])}*(${cur}+r);nl1+=${num(NS.hc)}*(${num(NS.rad[3])}*(${cur}-r)-nl1);nl2+=${num(NS.hc)}*(nl1-nl2);U+=nl2;`);
  P('U+=wr*(' + WRAD.map(i => 'u' + i).join('+') + ');');
  if (pouch) P(`pl1+=${num(NS.hp)}*(pu-pl1);U+=pw*pl1;`);
  P('OUT[pos]=(U-Up)*dT;Up=U;}');
  P(COEF.map(c => c + '+=d_' + c).join(';') + ';}');
  P(st.map((n, i) => 'st[' + i + ']=' + n).join(';') + ';');
  const fn = new Function('st', 'K', 'ka', 'kb', 'C', 'co', 'US', 'AG', 'NA', 'NF', 'pos', 'OUT', '"use strict";' + b.join('\n'));
  return { fn, n: st.length };
}
// the same tube as plain loops, for pages whose security policy forbids new Function (slower, same numbers)
function tubeLoop(T, pouch) {
  const NS = noseStatic(T), cI = {}, kI = {}; COEF.forEach((n, i) => { cI[n] = i; }); CONST.forEach((n, i) => { kI[n] = i; });
  const oK = new Int32Array(NSEC).fill(-1), oG = new Int32Array(NSEC).fill(-1), oW = new Int32Array(NSEC).fill(-1), oA = new Int32Array(NSEC).fill(-1), oF = new Int32Array(NSEC).fill(-1), hl = new Uint8Array(NSEC), nh = new Uint8Array(NN), sn = new Int8Array(NN).fill(-1);
  ORAL.forEach(i => { oK[i] = cI['k' + i]; }); GODD.forEach(i => { oG[i] = kI['g' + i]; }); WALLS.forEach(i => { oW[i] = kI['w' + i]; }); ASP.forEach(i => { oA[i] = kI['a' + i]; }); FRI.forEach(i => { oF[i] = kI['n' + i]; }); HFL.forEach(i => { hl[i] = 1; }); NHF.forEach(j => { nh[j] = 1; }); SIN.forEach(([j, id]) => { sn[j] = id; });
  const F = 0, B = 44, NFo = 88, NBo = 118, Uo = 148, LF = 192, LB = 236, PQ = 280, LQ = 290, NLF = 302, NLB = 332, M = 362, n = 380, k = new Float64Array(NC), d = new Float64Array(NC);
  const fn = (st, K, ka, kb, C, co, US, AG, NA, NF, pos, OUT) => {
    for (let i = 0; i < NC; i++) { k[i] = K[ka + i]; d[i] = (K[kb + i] - k[i]) / BLK; }
    const hw = C[co + kI.hw], lq = C[co + kI.lq], rlq = C[co + kI.rlq], dT = C[co + kI.dT], wr = C[co + kI.wr], hf = C[co + kI.hf], an = C[co + kI.an], pz = C[co + kI.pz], pw = C[co + kI.pw], v = cI.v1, qo = cI.q1, to = cI.t1, mo = cI.m1, iz = cI.z0, iy = cI.yl, iq = cI.ql;
    for (let sb = 0; sb < BLK; sb++) {
      const ql = k[iq], yl = k[iy], z0 = k[iz], rl2 = 1 / (1.694 * yl + ql), rl1 = (.306 * yl - ql) * rl2, rl3 = rl2 * ql;
      for (let q = 0; q < SUB; q++, pos++) {
        const us = US[pos], ag = AG[pos], na = NA[pos], nf = NF[pos]; let nin = 0, w = 0, p = 0, r = 0;
        st[M] = (2 * st[B] + us * z0 + lq * st[M]) / (rlq + ag * z0); let x = st[F]; st[F] = st[B] + (us - ag * st[M]) * z0;
        for (let i = 1; i < NSEC; i++) {
          const y = st[F + i], bi = st[B + i];
          if (i === VSEC) { p = k[v] * x + k[v + 1] * bi + k[v + 2] * st[NBo]; st[F + i] = p - bi; st[B + i - 1] = p - x; nin = p - st[NBo]; }
          else if (i === PIRI_SEC) { r = st[PQ + 9] * .97; p = k[qo] * x + k[qo + 1] * bi + k[qo + 2] * r; st[F + i] = p - bi; st[B + i - 1] = p - x; for (let z = 9; z > 0; z--) st[PQ + z] = st[PQ + z - 1]; st[PQ] = p - r; }
          else if (i === LAT_SEC) { r = st[LQ + 11] * .95; p = k[to] * x + k[to + 1] * bi + k[to + 2] * r; st[F + i] = p - bi; st[B + i - 1] = p - x; for (let z = 11; z > 0; z--) st[LQ + z] = st[LQ + z - 1]; st[LQ] = p - r; }
          else {
            w = k[oK[i]] * (x - bi); if (oW[i] >= 0) { st[Uo + i] = hw * st[Uo + i] + x + w + bi; w -= st[Uo + i] * C[co + oW[i]]; }
            if (pouch && i === PJ) { st[M + 10] += pouch[0] * (x + w + bi - st[M + 11] - pouch[1] * st[M + 10]); st[M + 11] += pouch[2] * st[M + 10]; w -= st[M + 10] * pz; }
            let fo = x + w, bo = bi + w; if (oA[i] >= 0) { const e = na * C[co + oA[i]]; fo += e; bo -= e; } if (oF[i] >= 0) { const e = nf * C[co + oF[i]]; fo += e; bo -= e; }
            if (hl[i]) { st[LF + i] += NS.ha * (fo - st[LF + i]); st[F + i] = fo - hf * (fo - st[LF + i]); st[LB + i] += NS.ha * (bo - st[LB + i]); st[B + i - 1] = bo - hf * (bo - st[LB + i]); }
            else if (oG[i] >= 0) { const g = C[co + oG[i]]; st[F + i] = fo * g; st[B + i - 1] = bo * g; } else { st[F + i] = fo; st[B + i - 1] = bo; }
          }
          x = y;
        }
        r = rl1 * x - rl3 * st[M + 1]; st[B + NSEC - 1] = r; st[M + 1] += x + r; let U = yl * (x - r); x = st[NFo]; st[NFo] = nin;
        for (let j = 1; j < NN; j++) {
          const y = st[NFo + j], bj = st[NBo + j]; w = (j <= NVAR ? k[mo + j - 1] : NS.mk[j]) * (x - bj);
          const id = sn[j]; if (id >= 0) { const s = NS.s[id], o = M + 4 + id * 2; st[o] += s[0] * (x + w + bj - st[o + 1] - s[1] * st[o]); st[o + 1] += s[2] * st[o]; w -= st[o] * s[3]; }
          let fo = x + w, bo = bj + w; if (j === NSRC) { fo += na * an; bo -= na * an; }
          if (nh[j]) { st[NLF + j] += NS.hb * (fo - st[NLF + j]); st[NFo + j] = fo - NS.hn * (fo - st[NLF + j]); st[NLB + j] += NS.hb * (bo - st[NLB + j]); st[NBo + j - 1] = bo - NS.hn * (bo - st[NLB + j]); }
          else if (j % 2 === 0) { st[NFo + j] = fo * NS.gn; st[NBo + j - 1] = bo * NS.gn; } else { st[NFo + j] = fo; st[NBo + j - 1] = bo; }
          x = y;
        }
        r = NS.rad[0] * x - NS.rad[1] * st[M + 2]; st[NBo + NN - 1] = r * .985; st[M + 2] += NS.rad[2] * (x + r); st[M + 8] += NS.hc * (NS.rad[3] * (x - r) - st[M + 8]); st[M + 9] += NS.hc * (st[M + 8] - st[M + 9]); U += st[M + 9];
        U += wr * (st[Uo + WRAD[0]] + st[Uo + WRAD[1]] + st[Uo + WRAD[2]]); if (pouch) { st[M + 12] += NS.hp * (st[M + 10] - st[M + 12]); U += pw * st[M + 12]; }
        OUT[pos] = (U - st[M + 3]) * dT; st[M + 3] = U;
      }
      for (let i = 0; i < NC; i++) k[i] += d[i];
    }
  };
  return { fn, n };
}
const _tubes = {}; let plain = (() => { try { const u = typeof navigator !== 'undefined' ? navigator.userAgent : ''; return /AppleWebKit/.test(u) && !/Chrome|Chromium|Edg\//.test(u); } catch (e) { return false; } })();   // Safari's engine stalls for seconds compiling the flat function
function tube(V0, hum) {                               // one compiled tube per throat size (hum adds a chest pouch only where a throat has one)
  const V = SINGER[V0.tk] || V0, po = hum && V.pouch ? pouchStatic(V.Tn, V.pouch[0], V.pouch[1], V.pouch[2]) : null, k = V.tk + (po ? 'h' : '');
  if (!_tubes[k]) { if (!plain) try { _tubes[k] = tubeFn(V.Tn, po); } catch (e) { plain = true; } if (plain) _tubes[k] = tubeLoop(V.Tn, po); }
  return _tubes[k];
}
function frameCoefs(K, o, A, T, vel, lat, piri) {
  for (let q = 0; q < ORAL.length; q++) { const i = ORAL[q], a = A[i - 1], b = A[i]; K[o++] = (a - b) / (a + b); }
  let a = A[VSEC - 1], b = A[VSEC]; const n0 = vel > 1e-5 ? vel : 1e-5; let s = 2 / (a + b + n0);
  K[o++] = a * s; K[o++] = b * s; K[o++] = n0 * s;
  a = A[PIRI_SEC - 1]; b = A[PIRI_SEC]; s = 2 / (a + b + piri); K[o++] = a * s; K[o++] = b * s; K[o++] = piri * s;
  a = A[LAT_SEC - 1]; b = A[LAT_SEC]; const l0 = lat > 1e-6 ? lat : 1e-6; s = 2 / (a + b + l0); K[o++] = a * s; K[o++] = b * s; K[o++] = l0 * s;
  let pn = n0;
  for (let j = 1; j <= NVAR; j++) { const u = j / NVAR, an = Math.min(NAREA[j], n0 * (1 - u) + NAREA[j] * u + .05); K[o++] = (pn - an) / (pn + an); pn = an; }
  const r = radiation(A[NSEC - 1], T); K[o++] = r[2]; K[o++] = r[3]; K[o++] = RC / A[0];
}

// ---------------------------------------------------------------- the glottis: LF flow pulses in closed form
function lfRow(Rd) {
  const Ra = Math.max(.004, (-1 + 4.8 * Rd) / 100), Rk = (22.4 + 11.8 * Rd) / 100, Rg = 1 / (4 * ((.11 * Rd / (.5 + 1.2 * Rk)) - Ra) / Rk);
  let tp = 1 / (2 * Rg), te = tp * (1 + Rk); if (te > .96) { const s = .96 / te; tp *= s; te = .96; }
  const ta = Math.min(Ra, (1 - te) * .85), w = Math.PI / tp; let e = 1 / ta;
  for (let i = 0; i < 60; i++) { const q = Math.exp(-e * (1 - te)), g = 1 - q - e * ta, dg = (1 - te) * q - ta, e2 = e - g / dg; if (Math.abs(e2 - e) < 1e-9) { e = e2; break; } e = e2; }
  const q = Math.exp(-e * (1 - te)), ret = -(1 / (e * ta)) * ((1 - q) / e - (1 - te) * q), sw = Math.sin(w * te), cw = Math.cos(w * te);
  const opn = a => { const E0 = -1 / (Math.exp(a * te) * sw); return E0 / (a * a + w * w) * (Math.exp(a * te) * (a * sw - w * cw) + w); };
  let lo = -40, hi = 60; const flo = opn(lo) + ret;
  for (let i = 0; i < 70; i++) { const m = .5 * (lo + hi); if ((opn(m) + ret > 0) === (flo > 0)) lo = m; else hi = m; }
  const a = .5 * (lo + hi), E0 = -1 / (Math.exp(a * te) * sw), c = E0 / (a * a + w * w);
  return [a, w, c, te, opn(a), 1 / (e * ta), e, q, c * (Math.exp(a * tp) * (a * Math.sin(w * tp) - w * Math.cos(w * tp)) + w), tp];
}
const RD0 = .35, RDS = .01, RDN = Math.floor((3.2 - RD0) / RDS) + 1; let _lf = null;
function lfTable() { if (!_lf) { _lf = new Float64Array(RDN * 10); for (let i = 0; i < RDN; i++) _lf.set(lfRow(RD0 + i * RDS), i * 10); } return _lf; }

// ---------------------------------------------------------------- gestures: phones -> articulator trajectories
const VOW = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW', 'MM']);
const OPENTO = { IY: 'IH', Y: 'IH', IH: 'EH', EY: 'EH', UW: 'UH', UH: 'AH', O: 'AH', OR: 'AH', ER: 'AH', AX: 'AH' };
const LEAD = { J: .050, X: .055, Y: .055, TR: .050, TT: .045, BP: .04, LA: .060, LP: .110, LH: .06, EP: .06 };
const SETT = { J: .11, X: .130, Y: .130, TR: .130, TT: .09, BP: .08, LA: .09, LP: .09, LH: .15, EP: .14 };
const OPEN = 2.6;
const DIPH = { AY: ['A', 'IH', 1.0], OY: ['AO', 'IH', 1.0], AW: ['A', 'UH', 1.1], EY: ['EY', 'IY', .75], OW: ['O', 'UW', .62] };
const OFFG = { AE: ['AX', .22], EH: ['AX', .22], IH: ['AX', .18], AH: ['AX', .12], AO: ['AH', .16], AA: ['AH', .16], IY: ['Y', .30], UW: ['W', .16], ER: ['R', .18], UH: ['AX', .2] };
const mix = (a, b, u) => { const o = {}; for (const k of BODY) o[k] = a[k] + (b[k] - a[k]) * u; return o; };
// on high notes the mouth opens so that the first formant stays above the pitch
function opened(name, f0, fs) {
  let s = SHAPES[name]; const o = OPENTO[name];
  if (f0 && o) { const need = 1.20 * f0 - F1OF[name] * fs; if (need > 0) s = mix(s, SHAPES[o], Math.min(.75, need / Math.max(60, (F1OF[o] - F1OF[name]) * fs))); }
  return s;
}
class Track {
  constructor(v0) { this.v0 = v0; this.tr = []; }
  to(ts, te, v) { if (te < ts + .004) te = ts + .004; this.tr.push([ts, te, v, (te - ts) / 4.3]); }
  sample(times) {                                      // critically damped approach to each target; overlapping moves blend
    const tr = this.tr.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]), n = tr.length, out = new Float64Array(times.length); let i = 0, base = this.v0, act = [];
    for (let k = 0; k < times.length; k++) {
      const t = times[k];
      while (i < n && tr[i][0] <= t) act.push(tr[i++]);
      while (act.length && t - act[0][0] > 11 * act[0][3]) base = act.shift()[2];
      let v = base;
      for (let q = 0; q < act.length; q++) { const a = act[q], u = (t - a[0]) / a[3]; v += (a[2] - v) * (1 - (1 + u) * Math.exp(-u)); }
      out[k] = v;
    }
    return out;
  }
}
class Bumps {
  constructor(rest, mode) { this.rest = rest; this.b = []; this.mode = mode; }
  add(r0, r1, f0, f1, v) { if (r1 < r0 + .004) r1 = r0 + .004; if (f0 < r1) f0 = r1; if (f1 < f0 + .004) f1 = f0 + .004; this.b.push([r0, r1, f0, f1, v]); }
  sample(times) {
    const bs = this.b.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), R = this.rest, n = bs.length, out = new Float64Array(times.length), mode = this.mode; let i = 0, act = [];
    for (let k = 0; k < times.length; k++) {
      const t = times[k]; let v = R;
      while (i < n && bs[i][0] <= t) act.push(bs[i++]);
      if (act.length && act.some(b => b[3] <= t)) act = act.filter(b => b[3] > t);
      for (let q = 0; q < act.length; q++) {
        const [r0, r1, f0, f1, x] = act[q]; let u;
        if (t < r1) u = (t - r0) / (r1 - r0); else if (t < f0) u = 1; else { u = (f1 - t) / (f1 - f0); if (mode === 'min') { u = Math.pow(u, 2.2); v = Math.min(v, R + (x - R) * u); continue; } }
        u = u * u * u * (10 - u * (15 - 6 * u)); const y = R + (x - R) * u;
        if (mode === 'max') { if (y > v) v = y; } else if (mode === 'mul') v *= y; else if (y < v) v = y;
      }
      out[k] = v;
    }
    return out;
  }
}
const UV = new Set(['P', 'T', 'K', 'S', 'SH', 'F', 'HH', 'TH']);
class Gest {
  constructor(segs, o) {
    this.segs = segs; this.o = o; this.fs = o.fs || 1; const n = segs.length;
    // a final -ing is sung ON the ng: the tongue closes early and the note hums
    if (n > 1) { const a = segs[n - 2], b = segs[n - 1]; if (b.ph === 'NG' && a.ph === 'IH') { const tot = b.t1 - a.t0, m = a.t0 + Math.max(.24, (o.ng || .46) * tot); a.t1 = m; b.t0 = m; } }
    const first = segs.find(g => g.role === 'nuc'), s0 = first ? this.vt(first, null)[0] : SHAPES.AX;
    const rest = o.hum ? s0 : mix(SHAPES.AX, s0, .30); this.T = {}; for (const k of BODY) this.T[k] = new Track(rest[k]);
    const T = this.T; T.sTT = new Track(14.6); T.hTT = new Track(.25); T.sTD = new Track(9.4); T.hTD = new Track(.45);
    for (const k of ['cTT', 'cTD', 'cLI', 'cLD']) T[k] = new Bumps(OPEN, 'min');
    for (const k of ['GA', 'VEL', 'LAT', 'VST']) T[k] = new Bumps(0, 'max');
    T.AV = new Bumps(1, 'mul');
    this.build();
  }
  vt(g, nxt) {                                          // nucleus targets
    const p = g.ph, fz = g.f0 || 0, fs = this.fs;
    if (p === 'MM') { const u = clamp(((g.midi || 56) - 48) / 14, 0, 1); return [mix(mix(SHAPES.O, SHAPES.UH, u), SHAPES.AX, .35 + .25 * Math.sin((g.k || 0) * 2.1)), null]; }
    if (DIPH[p]) { const [a, b, u] = DIPH[p], A = opened(a, fz, fs); return [A, mix(A, opened(b, fz, fs), u)]; }
    let s;
    if (p === 'AH') s = opened(g.weak ? 'AX' : 'AH', fz, fs);
    else if (p === 'AO' && nxt && nxt.ph === 'R') s = opened('OR', fz, fs);
    else s = opened(SHAPES[p] ? p : 'AX', fz, fs);
    if (g.weak && p !== 'AH') s = mix(s, SHAPES.AX, .18);
    if (this.o.ah) s = mix(s, SHAPES.AA, this.o.ah);          // the choir's bright 'ah' colour
    return [s, null];
  }
  build() {
    const S = this.segs, T = this.T, n = S.length, nuc = []; S.forEach((g, i) => { if (g.role === 'nuc') nuc.push(i); });
    this.claim = {};
    S.forEach((g, i) => { if (g.role !== 'nuc') this.cons(i, g); });
    for (let a = 0; a < nuc.length; a++) {
      const i = nuc[a], g = S[i], nx = i + 1 < n ? S[i + 1] : null, [v1, v2] = this.vt(g, nx); let j = i;
      while (j - 1 >= 0 && S[j - 1].role === 'on' && S[j - 1].syl === g.syl) j--;
      const c0 = S[j].t0, hi = j === i, slow = g.ph === 'MM' ? 1.7 : 1;
      for (const k of BODY) {
        let ld = LEAD[k] * slow; const se = SETT[k] * slow; if (a === 0 && hi) ld += .25;
        let ts = c0 - ld - (hi ? .045 : 0); const te = g.t0 + se;
        for (let q = j - 2; q < i; q++) if (q >= 0) { const c = this.claim[q + k]; if (c !== undefined && c > ts) ts = c; }
        if (a > 0) { const pg = S[nuc[a - 1]]; ts = Math.max(ts, pg.t0 + .45 * (pg.t1 - pg.t0)); }
        T[k].to(ts, te, v1[k]);
      }
      if (!v2) {                                        // a held vowel is never parked: it has its own off-glide and leans toward the next vowel
        const d = g.t1 - g.t0, nv = a + 1 < nuc.length ? this.vt(S[nuc[a + 1]], null)[0] : null, og = OFFG[g.ph], o = og ? SHAPES[og[0]] : v1, ou = og ? og[1] : 0;
        if (d > .16) for (const k of ['X', 'Y', 'J', 'TR', 'LA']) { let z = v1[k] + ou * (o[k] - v1[k]); if (nv) z += .14 * (nv[k] - v1[k]); T[k].to(g.t0 + .28 * d, g.t1 + .05, z); }
      } else {
        const d = g.t1 - g.t0, w = Math.min(.30, Math.max(.12, d * .52)), last = i + 1 >= n, te = g.t1 + (last ? -.05 : .02);
        for (const k of BODY) T[k].to(te - w * (k === 'LP' ? 1.15 : 1), te, v2[k]);
      }
    }
    for (let a = 1; a < nuc.length; a++) {              // vowel-vowel joins: a tiny glottal dip so the words stay separate
      const i = nuc[a];
      if (S[i - 1].role === 'nuc') { const t = S[i].t0; if (S[i].ph === 'MM') T.AV.add(t - .13, t - .035, t - .02, t + .12, .50 + .12 * Math.sin(a * 1.9)); else T.AV.add(t - .075, t - .015, t - .012, t + .06, .62); }
    }
    if (this.o.hum) {
      S.forEach((g, i) => { if (i === 0 || g.t0 - S[i - 1].t1 > .15) T.GA.add(g.t0 - .05, g.t0 + .01, g.t0 + .02, g.t0 + .13, .06); });
      const a = S[0].t0 - 3, b = S[n - 1].t1 + 3;
      T.cLI.add(a, a + .01, b, b + .1, -.22); T.VEL.add(a, a + .01, b, b + .1, this.o.hum);
    }
  }
  cons(i, g) {
    const S = this.segs, T = this.T, n = S.length, p = g.ph, t0 = g.t0, t1 = g.t1, d = t1 - t0, prev = i > 0 ? S[i - 1] : null, nxt = i + 1 < n ? S[i + 1] : null, on = g.role === 'on';
    let vi = null; if (on) { for (let q = i + 1; q < n; q++) if (S[q].role === 'nuc') { vi = S[q]; break; } } else for (let q = i; q >= 0; q--) if (S[q].role === 'nuc') { vi = S[q]; break; }
    const vs = vi ? this.vt(vi, null) : null, vsh = vs ? (on ? vs[0] : (vs[1] || vs[0])) : SHAPES.AX, nextvoiced = nxt && nxt.role === 'nuc';
    const W = (tgt, w) => { const o = {}; for (const k in tgt) o[k] = vsh[k] + (tgt[k] - vsh[k]) * w; return o; };
    const body = (tgt, lead = .045, at = .35, keys) => { for (const k of (keys || Object.keys(tgt))) { T[k].to(t0 - lead, t0 + at * d, tgt[k]); this.claim[i + k] = t0 + Math.min(.8, at + .22) * d; } };
    // the tip does not leave one consonant for the next before that one is finished
    const ptip = prev && 'T D N S Z L DH TH'.split(' ').includes(prev.ph) && t0 - prev.t1 < .03, tip = (l0, l1, pl, hw) => { let a = t0 - l0, b = t0 - l1; if (ptip) { a = Math.max(a, prev.t1 - .028); b = Math.max(b, a + .04); } T.sTT.to(a, b, pl); T.hTT.to(a, b, hw); };
    let cl = d; const nuv = nxt && UV.has(nxt.ph), puv = prev && UV.has(prev.ph), soft = this.o.soft || 0;
    const AV = (v, l = .04, e = .03) => T.AV.add(t0 - l, t0 + .02, t1 - .02, t1 + e, v);
    if (p === 'P' || p === 'B' || p === 'M') {
      if (p === 'P') { cl = d * (on ? .50 : (nextvoiced ? .80 : .92)); if (on && puv) cl = d * .85; } else if (p === 'B') cl = d * .88; else cl = d * .96;
      T.cLI.add(t0 - .080, t0 + .012, t0 + cl - .003, t0 + cl + .080, -.20); body({ J: vsh.J * .55 }, .05, .2);
    }
    if (p === 'T' || p === 'D' || p === 'N') {
      if (p === 'T') { cl = d * (on ? .50 : (nextvoiced ? .75 : .9)); if (nuv) cl = d * .8; } else if (p === 'D') cl = d * .86; else cl = d * .95;
      const gem = nxt && nxt.t0 - t1 < .03 && (nxt.ph === 'T' || nxt.ph === 'D' || nxt.ph === 'N'); if (gem) cl = d + .03;
      tip(.11, .05, 14.75, .28); T.cTT.add(t0 - .080, t0 + .012, t0 + cl - .003, t0 + cl + .070, -.18);
      body({ J: Math.min(vsh.J, .22) * .8 + .02 }, .05, .25); body(W({ X: .74, Y: .02, TR: .05 }, .68), .08, .45);
    }
    if (p === 'K' || p === 'G' || p === 'NG') {
      const pl = 9.5 + Math.max(-.3, Math.min(1, vsh.X)) * 1.3; cl = p === 'K' ? d * (on ? .46 : .8) : (p === 'G' ? d * .84 : d);
      T.sTD.to(t0 - .12, t0 - .04, pl); T.hTD.to(t0 - .12, t0 - .04, .55);
      if (p === 'NG' && !nxt) T.cTD.add(t0 - .09, t0 + .014, t1 + .20, t1 + .30, -.14); else T.cTD.add(t0 - .095, t0 + .014, t0 + cl - .003, t0 + cl + .150, -.14);
      body({ J: vsh.J * .7, Y: vsh.Y * .6 + .22 }, .07, .3);
    }
    if (p === 'M' || p === 'N' || p === 'NG') {
      const fin = p === 'NG' && !nxt;
      T.VEL.add(t0 - (on ? .075 : .11), t0 + (on ? 0 : .008), t1 - .012 + (fin ? .4 : 0), t1 + .065 + (fin ? .4 : 0), p === 'NG' ? .95 : .75); AV(.92);
    }
    if (p === 'P' || p === 'T' || p === 'K') {          // glottis opens, peaks at the release, closes as the vowel starts
      const pk = on ? ((prev && prev.ph === 'S' && prev.role === 'on') ? .10 : .20) : .12, f1 = nuv ? t1 + .06 : t1 + (on ? .012 : .022);   // onset: the aspiration sits before the beat so the vowel lands on it
      const f0 = nuv ? t1 : (on ? Math.max(t0 + cl, t1 - .042) : Math.max(t0 + cl, t1 - .045)); T.GA.add(t0 - .012, t0 + Math.max(.03, cl * .9), f0, f1, pk);
    }
    if (p === 'B' || p === 'D' || p === 'G') { T.VST.add(t0 - .02, t0 + .01, t0 + cl, t0 + cl + .02, 1); T.AV.add(t0 - .01, t0 + .03, t0 + cl - .006, t0 + cl + .016, .55); }
    if (p === 'S' || p === 'Z') {
      tip(.12, .03, 14.92, .42); T.cTT.add(t0 - .080, t0 + .020, t1 - .012, t1 + .100, p === 'S' ? .30 : .33);
      body({ J: .10, LA: Math.min(1.35, Math.max(.95, vsh.LA)), X: vsh.X > 0 ? Math.max(vsh.X, .35) : vsh.X * .5 + .15 }, .06, .3);
      if (p === 'S') T.GA.add(t0 - .035, t0 + .35 * d, t1 - (nuv ? 0 : .06), t1 + (nuv ? .05 : on ? .004 : .018), .24); else T.GA.add(t0 - .03, t0 + .4 * d, t1 - .04, t1 + .02, .055);
    }
    if (p === 'F' || p === 'V') {
      T.cLD.add(t0 - .075, t0 + .016, t1 - .012, t1 + .10, p === 'F' ? .27 : .40); body({ J: .12 }, .05, .3);
      if (p === 'F') T.GA.add(t0 - .035, t0 + .35 * d, t1 - .055, t1 + (on ? .004 : .018), .22); else { T.GA.add(t0 - .03, t0 + .4 * d, t1 - .04, t1 + .02, .035); AV(.85); }
    }
    if (p === 'DH' || p === 'TH') {
      tip(.10, .03, 15.25, .2); T.cTT.add(t0 - .075, t0 + .012, t1 - .010, t1 + .10, .38);
      body({ J: .14, X: Math.max(vsh.X, .2) }, .05, .3); T.GA.add(t0 - .03, t0 + .4 * d, t1 - .035, t1 + .02, .03); AV(.60);
    }
    if (p === 'HH') T.GA.add(t0 - .05, t0 + .45 * d, t1 - .035, t1 + .015, .19 + .03 * soft);
    if (p === 'L') {
      if (!on) { const t = SHAPES.LD; body({ X: t.X, Y: t.Y, TR: t.TR, J: t.J }, .09, .45); }
      else body({ X: vsh.X * .35 - .05, Y: vsh.Y * .4 + .12, J: Math.min(.30, vsh.J) }, .05, .4);
      tip(.12, .03, 14.5, .35); T.cTT.add(t0 - .085, t0 + (on ? .015 : .045), t1 - .008, t1 + .11, on ? .45 : .55); T.LAT.add(t0 - .05, t0 + .02, t1 - .02, t1 + .04, .6);
    }
    if (p === 'R') body(SHAPES[on ? 'R' : 'ER'], on ? .07 : .12, on ? .4 : .6, on ? BODY : BODY.filter(k => k !== 'LA'));
    if (p === 'W') body(SHAPES.W, .07, .40);
    if (p === 'Y') body(SHAPES.Y, .06, .40);
  }
}

// ---------------------------------------------------------------- the actor: score + direction -> a performance
const ON = { P: .115, B: .085, T: .100, D: .070, K: .110, G: .085, S: .125, Z: .090, SH: .125, F: .105, V: .075, TH: .10, DH: .060, HH: .085, M: .085, N: .078, NG: .085, L: .080, R: .085, W: .085, Y: .075 };
const OFF = { P: .085, B: .07, T: .075, D: .065, K: .085, G: .07, S: .115, Z: .095, SH: .12, F: .095, V: .080, TH: .09, DH: .07, HH: .06, M: .100, N: .095, NG: .150, L: .105, R: .110, W: .07, Y: .07 };
const CODA = { ER: 'R', IY: 'Y', IH: 'Y', UW: 'W', UH: 'W' };
const VOBS = new Set(['B', 'D', 'G', 'V', 'Z', 'DH']), WEAK = new Set(['the', 'and', 'it', 'is', 'a', 'that', 'in', 'tle', 'ly', 'bon', 'ning']);
// what each section does to the same throats
const MOOD = {
  love:    { soft: .10, inhRel: 16, air: 1.0, open: 1.06, tune: .01, age: 0, port: .90, scoop: .40, att: .60, rub: .40, cons: 1.0, wob: 1.0, sw: 3.2, pos: .50, ten: .08, rough: 0, lh: -.04, fall: .25, relax: 2.2, inhD: .32 },
  nest:    { soft: .30, inhRel: 14, air: 1.5, open: .95, tune: -.01, age: 0, port: 1.25, scoop: .50, att: .0, rub: .35, cons: 1.0, wob: 1.3, sw: 3.4, pos: .42, ten: .02, rough: 0, lh: .10, fall: .35, relax: 2.6, inhD: .55 },
  loss:    { soft: .22, inhRel: 12, air: 2.0, open: .90, tune: -.02, age: 0, port: 1.30, scoop: .60, att: .10, rub: .35, cons: 1.05, wob: 1.6, sw: 2.6, pos: .32, ten: -.18, rough: 0, lh: .10, fall: .5, relax: 3.0, inhD: .50 },
  shelter: { soft: .18, inhRel: 10, air: 1.0, open: .92, tune: -.02, age: 0, port: 1.10, scoop: .60, att: .12, rub: .40, cons: .98, wob: 1.6, sw: 2.2, pos: .32, ten: -.06, rough: .2, lh: .06, fall: .35, relax: 2.8, inhD: .60 },
  climax:  { soft: .06, inhRel: 17, air: 1.2, open: 1.12, tune: .02, age: 0, port: .85, scoop: .80, att: 1.0, rub: .30, cons: 1.08, wob: .8, sw: 1.8, pos: .58, ten: .16, rough: .30, lh: -.10, fall: .5, relax: 1.6, inhD: .28 },
  dawn:    { soft: .12, inhRel: 15, air: 1.0, open: 1.04, tune: .01, age: 0, port: .95, scoop: .50, att: .50, rub: .40, cons: 1.0, wob: 1.1, sw: 3.0, pos: .50, ten: .06, rough: .08, lh: -.02, fall: .25, relax: 2.2, inhD: .38 },
  sound:   { soft: .05, inhRel: 0, air: 1.0, open: 1.05, tune: 0, age: 0, port: .8, scoop: .3, att: .8, rub: 0, cons: 1, wob: .8, sw: 0, pos: .5, ten: .1, rough: 0, lh: 0, fall: 0, relax: 1, inhD: .3 },
};
// line by line direction. arc = dB at start, peak, end, and where the peak sits. Everything is indexed by syllable.
const ACT = {
  // LOVE: he shows off on the wing, she teases (faster than him), together as the heart closes on 'flame'
  d1:  { arc: [-2.0, 1.0, -1.0, .60], scoop: .7, rise: .3, emph: { 2: .6, 5: 1.2, 7: 1.0 }, scoopN: { 5: .6 }, mess: { 5: 1.6, 7: 2.0 }, vibx: 1.1, inh: [.36, .6] },
  d2:  { arc: [-1.0, 1.2, -1.4, .40], scoop: .5, emph: { 2: 1.2, 5: .8 }, mord: [{ n: 2, at: .58, st: 1.0, dur: .09 }], scoopN: { 7: .7 }, mess: { 7: 1.8 }, vibx: 1.15, inh: [.30, .55] },
  d3:  { arc: [-1.6, 1.4, .6, .80], emph: { 1: .8, 3: 1.6 }, scoopN: { 3: .6 }, mess: { 3: 2.4 }, vibx: 1.15, inh: [.30, .7] },
  d3h: { arc: [-1.6, 1.6, .8, .80], emph: { 1: .8, 3: 1.8 }, scoopN: { 3: .5 }, mess: { 3: 2.6 }, vibx: 1.2, lagx: .005, inh: [.30, .65] },
  // NEST: the lullaby, hummed through closed lips to the egg
  h1:  { arc: [-2.4, .8, -2.6, .45], scoop: .5, scoopN: { 1: .3, 3: .3, 6: .3 }, puff: .6, thin: { deep: 8, from: .40, br: .2 }, inh: [.60, .6] },
  // LOSS: far away, already gone; she stops dead inside 'em'
  g1:  { arc: [-2.0, 0, -1.0, .35], scoop: .9, pianto: { 1: .4 }, port: 1.2, stop: { at: .46 }, noInh: true },      // a ghost does not breathe
  // SHELTER: the old one hums to the rain, then sings HER line; the voice cracks on 'song'
  a1:  { arc: [-2.0, .6, -3.0, .45], scoop: .9, scoopN: { 1: .4 }, puff: .5, fall: .6, thin: { deep: 9, from: .30, br: .25 }, endFry: .5, inh: [.60, .7] },
  a2:  { br: { 4: [.16, .5] }, arc: [-2.6, 1.2, -1.0, .55], scoop: .8, emph: { 1: 1.0, 4: 1.2, 7: .6, 9: .8 }, scoopN: { 1: .5, 4: .5 }, pianto: { 9: .6 }, catch_: [{ n: 9, at: -.075, dur: .05 }], crack: [{ n: 9, at: .17, st: 4.2, dur: .07, drop: .7 }], thin: { deep: 8, from: .55, br: .3 }, endFry: .45, inh: [.45, .8] },
  // CLIMAX: BLUE FIRE. her voice and his from the sky, the choir in octaves
  c1:  { arc: [-1.0, 2.0, .5, .70], emph: { 3: 1.0, 4: 1.4, 7: 1.4 }, scoopN: { 0: .8, 4: .6 }, mess: { 4: 1.4, 7: 2.0 }, vibx: 1.1, inh: [.30, .9] },
  c2:  { arc: [-1.2, 1.8, .3, .70], emph: { 3: .8, 4: 1.2, 7: 1.2 }, scoopN: { 0: .6, 4: .5 }, mess: { 4: 1.2, 7: 1.8 }, vibx: 1.05, lagx: .004, inh: [.30, .85] },
  c3:  { arc: [-1.0, 1.6, .6, .70], emph: { 4: 1.0, 7: 1.2 }, mess: { 7: 1.4 }, vibx: .85, inh: [.30, .8] },
  // DAWN: the old voice smiling and steady, the two ghosts with him
  w1:  { arc: [-2.0, 1.2, -1.2, .55], scoop: .7, emph: { 3: 1.4, 8: 1.0 }, mess: { 3: 1.8, 8: 1.2 }, thin: { deep: 8, from: .55, br: .2 }, endFry: .3, inh: [.40, .7] },
  w2:  { arc: [-2.4, 1.0, -1.8, .55], emph: { 3: 1.2 }, mess: { 3: 1.4, 8: 1.2 }, thin: { deep: 10, from: .50, br: .25 }, inh: [.35, .5] },
  w3:  { arc: [-2.4, .8, -2.0, .55], emph: { 3: 1.0 }, mess: { 3: 1.2, 8: 1.0 }, thin: { deep: 10, from: .50, br: .25 }, lagx: .006, inh: [.35, .5] },
};
// how far away each ghost is: 0 here, 1 the far sky
const FAR = { g1: .75, c1: .40, c2: .45, w2: .55, w3: .60 };
const CR = 400;
const lineById = id => SC.lines.find(l => l.id === id);
const f0of = m => 440 * Math.pow(2, (m - 69) / 12);
// how much a line's last note gives up so the same singer can breathe before the next one
function breathCut(L) {
  let nx = null; for (const q of SC.lines) if (q.who === L.who && q !== L && q.t0 > L.t0 + .5 && (!nx || q.t0 < nx.t0)) nx = q;
  if (!nx) return 0;
  const gap = nx.t0 + ((nx.feel && nx.feel.lag) || 0) - L.t1, ln = L.notes[L.notes.length - 1], storm = L.sec === 'climax';
  return clamp((storm ? .31 : .36) - gap, 0, .45 * (ln.t1 - ln.t0));
}
function perform(L) {
  const F = L.feel || {}, A = L.act || ACT[L.id] || {}, M = MOOD[L.sec] || MOOD.love, V = SINGER[L.sing || L.who], R = rng(hash('perf' + L.id)), n = L.notes.length;
  const dyn = F.dyn || 0, breath0 = F.breath === undefined ? .3 : F.breath, smile = (F.smile || 0) + (A.smile || 0) * (F.smile ? 0 : 1), vib = F.vib || 0, tremor = F.tremor || 0, eff = F.effort || 0, lag = (F.lag || 0) + (A.lagx || 0);
  const hum = !!F.hum, spoken = F.spoken || 0, ghost = !!F.ghost, age = F.age !== undefined ? F.age : (V.age || 0) + M.age, port = M.port * (A.port || 1);
  const cutT = A.cutAt ? SC.CUE[A.cutAt] : null;
  // ---- rubato
  const on = [], end = [];
  for (let i = 0; i < n; i++) { const N = L.notes[i], d = i === 0 ? ((A.late && A.late[0]) || 0) : clamp(R.g() * .013 * M.rub + .002, -.012, .012) + ((A.late && A.late[i]) || 0); on.push(N.t0 + lag + Math.min(d, .45 * (N.t1 - N.t0))); }
  if (A.hold) for (const k in A.hold) { const i = +k; if (i + 1 < n) on[i + 1] += A.hold[k]; }
  for (let i = 0; i < n - 1; i++) end.push(L.notes[i + 1].t0 - L.notes[i].t1 < .17 ? on[i + 1] : L.notes[i].t1 + lag);
  const lastN = L.notes[n - 1]; let eL = lastN.t1 + Math.min(lag, .05) + (A.ext || 0) - (L.act ? 0 : breathCut(L));
  if (cutT) eL = cutT + .5;
  if (A.stop) eL = on[n - 1] + (lastN.t1 - on[n - 1]) * A.stop.at;
  end.push(eL);
  const br = A.br || {}, gaps = []; for (const k in br) { const i = +k; if (i + 1 < n) end[i] = on[i + 1] - br[k][0] - .05; }
  // ---- phones. consonants sit before the beat so that the vowel lands on it
  const segs = [], cs = M.cons, info = L.notes.map(N => { const v = N.ph.findIndex(p => VOW.has(p)); return [N.ph.slice(0, v), N.ph[v], N.ph.slice(v + 1).map(p => CODA[p] || p).filter(p => OFF[p])]; });   // 'fire' = F AY ER: a coda vowel is sung as its glide
  const onD = info.map(([o]) => { const f = [1, 1, .80, .70][Math.min(3, o.length)]; return o.map(p => ON[p] * R.r(.94, 1.08) * f * cs); });
  for (let i = 0; i < n; i++) { const room = i ? on[i] - on[i - 1] : 1, s = onD[i].reduce((a, b) => a + b, 0); if (s > .42 * room) onD[i] = onD[i].map(d => d * .42 * room / s); }
  for (let i = 0; i < n; i++) {
    const [o, nuc, c] = info[i], t = on[i], N = L.notes[i], weak = WEAK.has(N.syl);
    const sumOn = i < n - 1 ? onD[i + 1].reduce((a, b) => a + b, 0) : 0, e = i === n - 1 || br[i] ? end[i] - (br[i] ? sumOn : 0) : (end[i] === on[i + 1] ? on[i + 1] - sumOn : Math.min(end[i], on[i + 1] - sumOn));
    let off = c.map((p, q) => OFF[p] * R.r(.94, 1.08) * cs * ((p === 'Z' || p === 'S') && q === c.length - 1 && q > 0 ? 1.28 : 1)); if (i === n - 1) off = off.map((d, q) => d * (c[q] === 'M' || c[q] === 'N' ? 2.6 : 1.25));   // a last 'm'/'n' is held, so the word is heard
    if (A.stop && i === n - 1) off = [];
    const f = [1, 1, .84, .66][Math.min(3, off.length)]; off = off.map(d => d * f);
    const avail = e - t, vmin = Math.max(.10, .42 * avail), so = off.reduce((a, b) => a + b, 0);
    if (avail - so < vmin && off.length) { const q = Math.max(.35, (avail - vmin) / so); off = off.map(d => d * q); }
    let x = t - onD[i].reduce((a, b) => a + b, 0);
    o.forEach((p, k) => { segs.push({ ph: p, t0: x, t1: x + onD[i][k], syl: i, role: 'on' }); x += onD[i][k]; });
    const vend = e - off.reduce((a, b) => a + b, 0);
    segs.push({ ph: nuc, t0: t, t1: vend, syl: i, role: 'nuc', weak, last: i === n - 1, midi: N.midi, k: i });
    x = vend; if (!(A.stop && i === n - 1)) c.forEach((p, k) => { segs.push({ ph: p, t0: x, t1: x + off[k], syl: i, role: 'off' }); x += off[k]; });
  }
  segs.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < segs.length; i++) if (segs[i].t1 > segs[i + 1].t0) segs[i].t1 = segs[i + 1].t0;
  const tOn = segs[0].t0, tOff = segs[segs.length - 1].t1;
  for (const k in br) { const a = Math.max(...segs.filter(g => g.syl === +k).map(g => g.t1)), b = Math.min(...segs.filter(g => g.syl === +k + 1).map(g => g.t0)); if (b - a > .08) gaps.push([a, b, br[k][1]]); }
  // ---- the breath before the line
  const prev = SC.lines.filter(q => q.who === L.who && q !== L && q.t1 < tOn + .1 && q.t0 < L.t0).sort((a, b) => b.t1 - a.t1)[0];
  const pend = prev && !L.act ? prev.t1 - breathCut(prev) + .06 : tOn - 2, inhA = A.inh || [M.inhD, .6], inhD = Math.min(inhA[0], Math.max(.17, tOn - .03 - pend));
  const bk = clamp(Math.pow(10, (dyn + 3) / 46), .5, 1.25), breaths = L.noBreath || A.noInh ? [] : [{ t0: tOn - .035 - inhD, t1: tOn - .035, depth: inhA[1] * bk, d0: inhA[1], nose: hum ? 1 : 0 }];
  for (const [a, b, dep] of gaps) breaths.push({ t0: a + .025, t1: b - .012, depth: dep * bk, d0: dep * .8, nose: hum ? 1 : 0 });
  const tail = cutT ? .02 : (A.stop ? .06 : .55 + (A.thin ? .25 : 0)), T0 = (breaths.length ? breaths[0].t0 : tOn) - .08, T1 = tOff + tail;
  // ---- control tracks
  const m = Math.ceil((T1 - T0) * CR) + 4, mk = () => new Float64Array(m), f0 = mk(), db = mk(), ten = mk(), bre = mk(), fry = mk(), rough = mk(), gaX = mk(), avX = mk().fill(1), fals = mk();
  const drift = smoothNoise(m, 1 / CR, .7, R, .055 + .05 * age), wob = smoothNoise(m, 1 / CR, 1.4, R, .55 * M.wob), w2 = smoothNoise(m, 1 / CR, 3.2, R, .35 * M.wob);
  const tr1 = smoothNoise(m, 1 / CR, .9, R, .55), tr2 = smoothNoise(m, 1 / CR, .8, R, .5); let trp = R.r(0, 6.28);
  const note = L.notes.map((N, i) => { const nxt = i + 1 < n ? on[i + 1] : end[i], dur = nxt - on[i], vonD = R.r(.16, .40);
    return { m: N.midi, t: on[i], dur, weak: WEAK.has(N.syl), rate: V.vibRate * R.r(.955, 1.06) - .30 * age, ph: R.r(0, 6.28), ext: dur > .5 && !(A.straight && A.straight[i] === 0) ? (.05 + .42 * vib) * R.r(.82, 1.18) * (A.vibx || 1) * clamp((dur - .3) / .7, .35, 1) : 0,
      von: A.von && A.von[i] !== undefined ? A.von[i] : vonD * (V.fem ? .9 : 1), rw: R.r(.15, .35), rp: R.r(0, 6.28) }; });
  const top = Math.max(...note.map(x => x.m)), cent = note.map(() => R.g() * .035 + M.tune + (L.detune || 0));
  const loud = clamp((dyn + 6) / 10, -1.1, 1.1), ten0 = .42 + .12 * loud + .26 * eff + .05 * smile + M.ten + (F.push || 0) * 2, bre0 = ghost && eff < .3 ? Math.max(breath0, .55) : breath0;
  const arc = A.arc || [-2, .6, -1.5, .5], fallE = A.rise !== undefined ? -A.rise : (A.fall !== undefined ? A.fall : M.fall), scoop0 = A.scoop !== undefined ? A.scoop : M.scoop;
  for (let i = 0; i < m; i++) {
    const t = T0 + i / CR; let k = 0; while (k + 1 < n && t >= note[k + 1].t - .10 * port) k++;
    const nt = note[k], x = t - nt.t, u = x / Math.max(.1, nt.dur); let p = nt.m;
    if (k > 0) {                                        // portamento, overshoot, settle
      const a = note[k - 1].m, iv = nt.m - a; let w = clamp(.066 + .012 * Math.abs(iv), .06, .17) * port; if (A.slide && A.slide[k]) w = A.slide[k];
      p = a + iv * sstep((t - (nt.t - .62 * w)) / w); const sg = Math.sign(iv), st = (t - nt.t - .38 * w - .03);
      if (Math.abs(iv) >= 2 && !hum) p += sg * (.10 + .035 * Math.min(7, Math.abs(iv))) * Math.exp(-(((st - .02) / .045) ** 2)) * (sg < 0 ? .7 : 1);
    } else p -= scoop0 * (1 - sstep((x + .10) / (.20 + .06 * (1 - M.att))));
    const sN = (A.scoopN && A.scoopN[k]) || 0; if (sN) p -= sN * (1 - sstep((x + .05) / .15)) * (x > -.09 ? 1 : 0) * (k > 0 ? sstep((x + .09) / .05) : 1);
    const pi = (A.pianto && A.pianto[k]) || 0; if (pi) { p -= pi * Math.exp(-(((x - .035) / .045) ** 2)); }
    if (A.sharp && A.sharp[k]) p += A.sharp[k] * sstep((u - .2) / .8);
    const fl = (A.falls && A.falls[k]) || 0; if (fl) p -= fl * sstep((x - nt.dur + .22) / .20);
    if (A.mord) for (const q of A.mord) if (q.n === k) { const z = (u - q.at) * nt.dur / q.dur; p += q.st * sstep(z / .28) * (1 - sstep((z - .72) / .28)); }
    if (nt.ext > 0) {                                   // vibrato arrives late, its rate drifts, it relaxes at the end
      let e = nt.ext * sstep((x - nt.von) / .45) * (1 - .7 * sstep((x - nt.dur + .28) / .26)); if (A.straight && A.straight[k]) e *= 1 - sstep((u - A.straight[k]) / .3);
      const r = nt.rate * (1 - .05 * sstep((u - .6) / .4)); p += e * Math.sin(nt.ph + TAU * r * x + nt.rw * 2.2 * Math.sin(nt.rp + TAU * .55 * x));
    }
    if (spoken) { const z = clamp(u, 0, 1); p += spoken * (2.2 * Math.sin(Math.PI * Math.pow(z, .8)) - 2.4 * z + .4) * (k === n - 1 ? .25 : 1) - spoken * 1.2 * clamp((t - tOn) / (tOff - tOn), 0, 1); }
    // tremor: an old hand on the pitch. It grows inside a held note and toward the end of a hard line
    const uL = clamp((t - tOn) / (tOff - tOn), 0, 1), grow = A.growTrem ? .12 + .88 * uL * uL : 1;
    trp += TAU * (5.35 + .55 * tr1[i]) / CR; const env = clamp(.60 + .45 * tr2[i], .12, 1.35), ta = (tremor * grow + .13 * age + ((A.shake && A.shake[k]) || 0) * sstep((u - .25) / .5)) * env * (.35 + .65 * sstep(x / .45));
    p += .58 * ta * Math.sin(trp) + drift[i] + cent[k];
    p -= fallE * sstep((t - (tOff - .20)) / .20) * (cutT || A.stop ? 0 : 1);
    let rg = 0; if (A.crack) for (const q of A.crack) if (q.n === k) { const z = (x - q.at) / q.dur; if (z > 0 && z < 1) { p += q.st * Math.pow(Math.sin(Math.PI * clamp(z, 0, 1)), .5); rg = 1; } const zz = (x - q.at - q.dur) / .06; if (zz > 0 && zz < 1) avX[i] *= 1 - q.drop * Math.sin(Math.PI * zz); if (zz > -.35 && zz <= .1) avX[i] *= 1 - .6 * q.drop; }
    fals[i] = rg;
    f0[i] = f0of(p);
    // ---- loudness: phrase arc, note swell, metre, breath
    const pk = arc[3]; let lev = uL < pk ? arc[0] + (arc[1] - arc[0]) * sstep(uL / pk) : arc[1] + (arc[2] - arc[1]) * sstep((uL - pk) / (1 - pk));
    lev += .17 * (nt.m - V.mid);
    if (nt.dur > .45) { const z = clamp(u, 0, 1), sw = z < M.pos ? Math.sin(Math.PI / 2 * z / M.pos) : Math.cos(Math.PI / 2 * (z - M.pos) / (1 - M.pos)), am = M.sw * clamp(nt.dur / .9, .4, 1) + ((A.mess && A.mess[k]) || 0); lev += am * (sw - .55); }
    else lev -= M.relax * .5 * sstep((u - .45) / .55);
    lev += 1.25 * ((A.emph && A.emph[k]) || 0); if (nt.weak) lev += nt.m === top ? .4 : -2.3;
    lev += wob[i] * .75 + w2[i] * .5 + ta * 2.7 * Math.sin(trp + .7);
    if (hum && A.puff) lev += A.puff * 1.6 * Math.sin(TAU * 2.1 * (t - tOn) + 1) * (1 - uL);
    let th = 0; if (A.thin && k === n - 1) { th = clamp((u - A.thin.from) / (1 - A.thin.from), 0, 1); th = .7 * s3(th) + .3 * th; lev -= A.thin.deep * th; }
    else if (k === n - 1 && nt.dur > 1.4 && !cutT && !A.stop) { th = .5 * s3((u - .45) / .55); lev -= 8 * th; }
    const soft = A.soft || M.soft;
    if (!A.stop && !cutT) lev -= 10 * sstep((t - (tOff - .24)) / .24);
    lev -= (13 - 5 * M.att) * (1 - sstep((t - tOn) / soft));
    db[i] = dyn + lev;
    const q = lev * .022;
    let b = bre0 - q * .9 + .22 * sstep((t - (tOff - .35)) / .35) + ((A.thin && A.thin.br) || .18) * th; ten[i] = clamp(ten0 + q + wob[i] * .015 - .15 * th, .05, .98);
    if (!M.att && x < .18) b += .10 * (1 - x / .18);
    // thinning into air: the folds open and only the vowel's breath is left
    if (A.thin && A.thin.air && k === n - 1) { const z = s3((u - A.thin.air) / (1 - A.thin.air)); gaX[i] = .085 * z; b += .3 * z; }
    if (A.laugh) for (const q of A.laugh) if (q.n === k) { const z = (x - q.at * nt.dur) * q.rate; if (z > 0 && z < q.k) { const w = .5 - .5 * Math.cos(TAU * z), d = q.amt * (1 - .18 * Math.floor(z)); avX[i] *= 1 - d * (1 - w) * sstep(z / .25); gaX[i] = Math.max(gaX[i], .075 * d * (1 - w) * sstep(z / .25)); f0[i] *= Math.pow(2, (.9 * d * (w - .4) - .25 * Math.floor(z)) / 12); } }
    for (const [ga, gb] of gaps) if (t > ga - .10 && t < gb + .02) { const z = t < gb - .05 ? 1 - s3((t - ga + .10) / .12) : s3((t - gb + .05) / .06); avX[i] *= z; b += .25 * (1 - z); if (t < gb - .05) { f0[i] *= Math.pow(2, -.35 * (1 - z) / 12); db[i] -= 5 * (1 - z); } }
    if (A.lift && A.lift[k]) { const z = sstep((u - A.lift[k]) / .16); avX[i] *= 1 - .85 * z * (u < 1.05 ? 1 : 0); }
    if (A.catch_) for (const q of A.catch_) if (q.n === k || (q.n === k + 1 && t > note[k + 1].t - .2)) { const z = t - note[q.n].t - q.at, e0 = q.soft || .010, e1 = (q.soft || .008) * 1.2; if (z > -e0 && z < q.dur + e1) avX[i] *= z < 0 ? s3(-z / e0) : z > q.dur ? s3((z - q.dur) / e1) : 0; }
    if (A.creak) for (const q of A.creak) if (q.n === k) { const z = (x - q.at) / q.dur; if (z > 0 && z < 1) { fry[i] = 1; f0[i] = q.hz * (1 + .12 * Math.sin(19 * z)); db[i] -= 4; } }
    if (A.croak) { const z = (t - tOn) / .34; if (z < 1) { fry[i] = Math.max(fry[i], .8 * (1 - z)); rough[i] = .6 * (1 - clamp(z, 0, 1)); } rough[i] = Math.max(rough[i], .22); }
    rough[i] = Math.max(rough[i], V.grain * age * .45 + M.rough * clamp((lev + .5) / 4, 0, 1) * (.3 + .7 * eff) + ((A.roughN && A.roughN[k]) || 0) * sstep((u - .15) / .4) * .5);
    bre[i] = clamp(b, .03, .97);
  }
  for (const g of segs) if (VOBS.has(g.ph)) {           // consonant microprosody
    const c = (g.t0 + g.t1) / 2, w = (g.t1 - g.t0) * .6 + .02; for (let i = Math.max(0, Math.floor((c - 3 * w - T0) * CR)); i < Math.min(m, (c + 3 * w - T0) * CR); i++) f0[i] *= Math.pow(2, -.28 * Math.exp(-(((T0 + i / CR - c) / w) ** 2)) / 12);
  }
  for (const g of segs) if (g.role === 'nuc') { const q = []; for (let i = Math.floor((g.t0 + .05 - T0) * CR); i < (g.t1 - T0) * CR; i += 4) if (i >= 0 && i < m) q.push(f0[i]); q.sort((a, b) => a - b); g.f0 = q.length ? q[Math.floor(q.length * .6)] : f0of(g.midi); }
  return { id: L.id, who: L.who, V, seed: hash('v' + L.id), T0, T1, tOn, tOff, segs, breaths, exh: L.exh || [], CR, f0, db, ten, bre, fry, rough, gaX, avX, fals, eff, smile, hum, ghost, age, att: M.att, lh: A.lh !== undefined ? A.lh : M.lh,
    open: M.open, noise: (V.air || 1) * M.air * (A.air || 1), softOn: Math.max(.04, (A.soft || M.soft) * .6), hardEnd: !!A.stop, longTail: !!A.thin, cutT, endFry: A.endFry !== undefined ? A.endFry : .10 + .30 * age * (dyn < -6 ? 1 : .3), spoken, sc: new Gest(segs, { fs: V.fscale, hum: hum ? .95 : 0, ng: A.ng, soft: clamp(-dyn / 12, 0, 1), ah: L.ah || 0 }), lev: .85, dyn, inhRel: M.inhRel };
}

// ---------------------------------------------------------------- the engine: gestures -> areas -> air -> folds -> tube -> 44.1 kHz
const CFG = { nv: .75, nu: .95, nm: .28, Kf: 1, Ka: 1, Ks: 1, hf: .16, pw: 2.2 };
const at = (a, x) => { if (x <= 0) return a[0]; const i = x | 0; if (i >= a.length - 1) return a[a.length - 1]; return a[i] + (a[i + 1] - a[i]) * (x - i); };
function engine(sp, dbg) {
  const V = sp.V, R = rng(sp.seed), { T0, T1, tOn, tOff, CR } = sp, tk = sp.sc.T, eff = sp.eff || 0, smile = sp.smile || 0;
  // ---- tract length through time gives the sample clock
  const gn = Math.ceil((T1 - T0) * 1000) + 6, gt = new Float64Array(gn); for (let i = 0; i < gn; i++) gt[i] = T0 + i * .001;
  const LPg = tk.LP.sample(gt), LHg = tk.LH.sample(gt), wobL = smoothNoise(gn, .001, 1.5, R, .02), Lg = new Float64Array(gn), LHo = new Float64Array(gn);
  { let z = 0; for (let i = 0; i < gn; i++) {
    const f = at(sp.f0, i * .001 * CR), ff = f > 60 ? f : (z || V.lhRef); z = z ? z + .02 * (ff - z) : ff;
    LHo[i] = clamp(-.36 * Math.log2(z / V.lhRef), -.24, .20) - .20 * smile - .24 * eff + (sp.lh || 0);      // the larynx rides with pitch, smile, shout
    LPg[i] -= .20 * smile * clamp(1 - LPg[i] * 1.2, 0, 1);
    Lg[i] = V.sp * (8 + LHg[i] + LHo[i]) + V.so * (8.3 + LPg[i]) + wobL[i];
  } }
  const tm = [], Tl = []; let t = T0; while (t < T1) { const L = at(Lg, (t - T0) * 1000), T = L / (NSEC * C0); tm.push(t); Tl.push(T); t += FRAME * T; } tm.push(t); Tl.push(Tl[Tl.length - 1]);
  const times = Float64Array.from(tm), Ts = Float64Array.from(Tl), nf = Ts.length - 1, S = {};
  for (const k in tk) S[k] = tk[k].sample(times);
  for (const [k, amp, fc] of [['J', .045, 1.6], ['X', .045, 2.0], ['Y', .045, 2.0], ['TR', .045, 1.4], ['LA', .055, 1.8], ['EP', .022, 2.2]]) { const w = smoothNoise(nf + 1, .001, fc, R, amp), a = S[k]; for (let i = 0; i <= nf; i++) a[i] += w[i]; }   // living drift
  const pt = a => { const o = new Float64Array(nf + 1); for (let i = 0; i <= nf; i++) o[i] = at(a, (times[i] - T0) * CR); return o; };
  const f0 = pt(sp.f0), db = pt(sp.db), ten = pt(sp.ten), bre = pt(sp.bre), fryT = pt(sp.fry), rouT = pt(sp.rough), gaX = pt(sp.gaX), avX = pt(sp.avX), fals = pt(sp.fals);
  { const w = smoothNoise(nf + 1, .001, 5, R, V.flut * (1 + .5 * sp.age)); for (let i = 0; i <= nf; i++) f0[i] *= Math.pow(2, w[i] / 1200); }
  for (let i = 0; i <= nf; i++) S.GA[i] = Math.max(S.GA[i], 0) + gaX[i];
  // ---- breath that is not voice: mouth / nose air in (+) and out (-)
  const air = new Float64Array(nf + 1), nose = new Float64Array(nf + 1), sign = new Float64Array(nf + 1), bright = new Float64Array(nf + 1);
  for (const b of sp.breaths) for (let i = 0; i <= nf; i++) { const u = (times[i] - b.t0) / (b.t1 - b.t0); if (u > 0 && u < 1) { const e = b.depth * (b.win ? b.win(u) : Math.pow(Math.sin(Math.PI * Math.pow(u, .75)), 1.2) * (b.env ? b.env(u, times[i]) : 1)); air[i] += e; nose[i] = b.nose; sign[i] = 1; bright[i] = 1; } }
  for (const b of sp.exh) for (let i = 0; i <= nf; i++) { const u = (times[i] - b.t0) / (b.t1 - b.t0); if (u > 0 && u < 1) { const e = b.depth * (b.env ? b.env(u, times[i]) : Math.pow(Math.sin(Math.PI * Math.pow(u, .45)), 1.1)); air[i] += e; nose[i] = b.nose; sign[i] = -1; } }
  // ---- areas, coefficients, aerodynamics, one frame (about 1 ms) at a time
  const K = new Float64Array((nf + 1) * NC), C = new Float64Array((nf + 1) * NK), Ps = new Float64Array(nf + 1), Pio_ = new Float64Array(nf + 1), fcs = new Float64Array(nf + 1), fhs = new Float64Array(nf + 1), frm = new Float64Array(nf + 1);
  const A = new Float64Array(NSEC), D = new Float64Array(NSEC), sN = new Float64Array(NSEC), gains = new Float64Array(FRI.length), jawV = new Float32Array(nf + 1), rndV = new Float32Array(nf + 1);
  let Pio = 0, trE = 0, pAc = 9; const cAd = [0, 0, 0], cPl = [0, 0, 0], ac = [0, 0, 0];
  for (let i = 0; i <= nf; i++) {
    const T = Ts[i], dx = T * C0, gi = (times[i] - T0) * 1000, LH = S.LH[i] + at(LHo, gi), xb = V.sp * (8 + LH), iso = 1 / V.so, isp = 1 / V.sp;
    let J = S.J[i], LA = S.LA[i]; const X = S.X[i], Y = S.Y[i], TRa = S.TR[i], TT = S.TT[i], BP = S.BP[i], EP = S.EP[i] - .05 * eff;
    const loud = Math.max(0, (db[i] + 12) / 12); J = (J * (1 + .10 * loud + .16 * eff) + .03 * loud + .07 * eff) * (sp.open || 1); LA *= 1 + .05 * loud + .10 * eff + .10 * smile;
    if (air[i] > 0 && !nose[i]) { J += .12 * air[i]; LA += .15 * air[i]; }
    const LIPs = LIP0 - .3;
    for (let n = 0; n < NSEC; n++) {
      const xp = (n + .5) * dx, s = xp < xb ? xp * isp - LH : 8 + (xp - xb) * iso, q = ((s - S_MIN) * GS + .5) | 0; sN[n] = s;
      let d = T_D0[q] + 1.15 * J * T_JW[q] - X * T_FX[q] - Y * T_FY[q] + TRa * T_TR[q] + EP * T_EP[q];
      if (s > 9) {
        if (TT > .01) { const u = (s - BP) / 1.15; d -= TT * Math.exp(-u * u); }
        if (s > LIPs) { let u = (s - LIPs) / .6; if (u > 1) u = 1; d += (LA - d) * u * u * (3 - 2 * u); }
      }
      if (d < .24) d = .12 + .12 * Math.exp((d - .24) / .12);
      D[n] = d;
    }
    for (let c = 0; c < 2; c++) {                        // tongue tip, tongue body
      const cn = c ? S.cTD[i] : S.cTT[i], pl = c ? S.sTD[i] : S.sTT[i], hw = c ? S.hTD[i] : S.hTT[i], sf = c ? .62 : 1.5, sb = c ? .62 : .55;
      cAd[c] = 9; cPl[c] = pl;
      if (cn < 2.4) {
        let am = 9; for (let n = 8; n < NSEC; n++) { const e = sN[n] - pl; if (e < -2.6 || e > 1.6) continue; const a = Math.abs(e) - hw, lim = cn + (a > 0 ? a * (e > 0 ? sf : sb) : 0); let d = D[n]; const df = d - lim; d = .5 * (d + lim - Math.sqrt(df * df + .012)); D[n] = d; if (d < am && a < .35) am = d; }
        cAd[c] = Math.max(0, am);
      }
    }
    const cl = Math.min(S.cLI[i], S.cLD[i]); cAd[2] = 9; cPl[2] = sN[NSEC - 1] + .5 * dx * iso - .3;
    if (cl < 2.4) { let am = 9; const Lt = sN[NSEC - 1] + .5 * dx * iso; for (let n = NSEC - 4; n < NSEC; n++) { const a = Math.abs(sN[n] - (Lt - .45)) - .32, lim = cl + (a > 0 ? a * 2.2 : 0); let d = D[n]; const df = d - lim; d = .5 * (d + lim - Math.sqrt(df * df + .012)); D[n] = d; if (d < am) am = d; } cAd[2] = Math.max(0, am); }
    for (let n = 0; n < NSEC; n++) { const d = D[n] * V.sd; A[n] = d > .012 ? PI4 * d * d : 1.1e-4; }
    let vel = Math.max(0, S.VEL[i]); if (air[i] > 0 && nose[i]) vel = Math.max(vel, .75 * nose[i] * Math.min(1, air[i] * 4));
    frameCoefs(K, i * NC, A, T, vel + .004, Math.max(0, S.LAT[i]), .85);
    const lipD = Math.sqrt(A[NSEC - 1] / PI4); jawV[i] = clamp(.46 * (lipD - .12) / 1.9 + .34 * clamp(J, 0, 1.3) * clamp((lipD - .05) / .35, 0, 1), 0, 1); rndV[i] = clamp(.75 * (S.LP[i] - .05) + .5 * clamp(1.0 - lipD, 0, 1) * (lipD > .06 ? 1 : 0), 0, 1);
    // ---- quasi-static air with compliance
    const ga = Math.max(0, S.GA[i]); let inv = 1 / (Math.min(A[NSEC - 1], 3) ** 2 + 1e-7);
    for (let c = 0; c < 3; c++) { ac[c] = cAd[c] < 8 ? PI4 * cAd[c] * cAd[c] : 9; inv += 1 / (ac[c] * ac[c] + 1e-7); }
    const Act = 1 / Math.sqrt(inv) + vel * .9, Ag = .030 + .03 * bre[i] + ga; Ps[i] = 4400 + 5400 * clamp((db[i] + 26) / 26, 0, 1) + 3000 * eff * clamp((db[i] + 10) / 12, 0, 1);
    const PS = Ps[i]; let Pq = PS * Ag * Ag / (Ag * Ag + Act * Act);
    const dUg = Ag * 1324.5 / (2 * Math.sqrt(Math.max(60, PS - Pio))), dUc = Act * 1324.5 / (2 * Math.sqrt(Math.max(60, Pio))), vst = S.VST[i];
    if (vst > 0 && Act < .02) Pq *= 1 - .42 * vst;
    let tau = clamp((ga < .03 ? 6e-3 : 3.5e-4) / (dUg + dUc + 1e-6), .0012, .16); if (vst > 0 && Act < .02) tau = Math.max(tau, .030 * vst);
    const dtf = FRAME * T; if (sp.hum) Pio = 0; else Pio += (Pq - Pio) * (1 - Math.exp(-dtf / tau));
    if (pAc < .006 && Act >= .006 && Pio > 600) trE = Math.sqrt(Pio / 8000); pAc = Act; trE *= Math.exp(-dtf / .0030);
    gains.fill(0); let fcut = 6000, gb = 0;
    for (let c = 0; c < 3 && !sp.hum; c++) if (ac[c] < 1.2) {
      const a = ac[c], dP = Pio * (1 / (a * a + 1e-7)) / inv; let amp = Math.pow(Math.max(0, dP / (1 + 8 * vel) - 350) / 8000, 1.5) * Math.sqrt(Math.min(a, .35) / .1); if (a < .0012) amp *= a / .0012;
      let ob, fc, trg, tgt; const pl = cPl[c];
      if (c === 0) { if (pl > 14.8 && pl < 15.12) { ob = 2.9; fc = 3500; trg = .6; } else if (pl < 14.2) { ob = 1.25; fc = 2700; trg = .6; } else if (pl < 14.8) { ob = .75; fc = 3900; trg = 1.1; } else { ob = .42; fc = 4200; trg = .3; } tgt = pl > 14.2 ? 15.50 : 15.1; }
      else if (c === 1) { ob = 1.3; fc = 2600; trg = 1.5; tgt = pl + .9; }
      else if (S.cLD[i] < S.cLI[i]) { ob = 14; fc = 4200; trg = .5; tgt = pl + .15; } else { ob = 1.2; fc = 2000; trg = 1.6; tgt = pl + .15; }
      const g = amp * ob * (ga < .08 ? (fc === 3500 ? 2.2 : .7) : 1) + trE * trg; if (g > gb) { gb = g; fcut = fc; }
      const x = (tgt < 8 ? (tgt + LH) * V.sp : xb + (tgt - 8) * V.so) / dx; let best = 0; for (let q = 1; q < FRI.length; q++) if (Math.abs(FRI[q] - x) < Math.abs(FRI[best] - x)) best = q;
      gains[best] += .65 * g; if (best > 0) gains[best - 1] += .22 * g; if (best < FRI.length - 1) gains[best + 1] += .22 * g;
    }
    frm[i] = ga > .08 ? 0 : 1; fcs[i] = fcut; fhs[i] = fcut === 3500 ? 3600 : (fcut < 2750 && fcut > 2650 ? 1500 : 500); Pio_[i] = Pio;
    // ---- per-frame constants
    let o = i * NK; const q15 = 1.5 / T, hw = q15 / (1500 + q15), Gw = 1 / (1500 + q15);
    for (let n = 1; n < NSEC; n += 2) { const d = D[n]; C[o++] = 1 - Math.min(.06, .0021 / (d > .05 ? d : .05)); }
    for (let q = 0; q < WALLS.length; q++) { const w = WALLS[q], a = Math.max(.25, A[w - 1]), b = Math.max(.25, A[w]); C[o++] = Gw * 2 * Math.sqrt(Math.PI * b) * 6 * dx * RC / (a + b); }
    const Lq = RHO * .30 / T, Rg = Math.sqrt(2 * RHO * Math.max(1500, PS - Pio)) * 1.15;
    C[o++] = hw; C[o++] = Lq; C[o++] = Rg + Lq; C[o++] = 1 / T;
    const KFr = 480 * CFG.Kf * Math.pow(10, clamp((sp.dyn || 0) + 2, -16, 3) * .40 / 20); for (let q = 0; q < FRI.length; q++) C[o++] = KFr * gains[q];
    const ns = nose[i] * Math.min(1, air[i] * 6); C[o++] = 1 - .88 * ns; C[o++] = .5 - .44 * ns; C[o++] = V.wr * Gw * 90; C[o++] = CFG.hf; C[o++] = 1.25 * ns;
    const pa = A[PJ - 1] + A[PJ]; C[o++] = RC / pa; C[o++] = CFG.pw;
    if (dbg && dbg.A) dbg.A.push([times[i], Float64Array.from(A)]);
  }
  // ---- source
  const N = nf * FRAME, US = new Float64Array(N), AG = new Float32Array(N), NA = new Float32Array(N), NF = new Float32Array(N), FS = new Float32Array(N), arcA = new Float64Array(nf + 1), vis0 = new Float32Array(nf + 1);
  const nucs = sp.segs.filter(g => g.role === 'nuc');
  if (nucs.length) { let nk = 0; for (let i = 0; i <= nf; i++) {         // syllable envelope: how softly each vowel is begun and left
    const tt = times[i]; while (nk + 1 < nucs.length && tt >= nucs[nk + 1].t0 - .02) nk++;
    const g = nucs[nk], d = Math.max(.12, g.t1 - g.t0), u = (tt - g.t0) / d; if (tt < g.t0 - .02) continue;
    const a0 = sp.hum ? .18 : .13 - .07 * sp.att, z = s3((tt - g.t0 + .02) / Math.min(a0, .35 * d)); let v = -(sp.hum ? 2.2 : 3.6 - 1.6 * sp.att) * (1 - z); if (u > .6) { const w = Math.min(1, (u - .6) / .4); v -= (sp.hum ? 1.2 : 2.2 - .8 * sp.att) * w * w; } arcA[i] = v;
  } }
  const LF = lfTable(), fl = FRAME; t = T0 + .01; let pn = 0, jl = 0, sl = 0, fi = 0;
  const onL = sp.softOn || (.085 - .045 * sp.att), offL = sp.hardEnd ? .012 : .16, offP = sp.hardEnd ? 0 : .05, rdMin = V.rdMin - .10 * eff, hasV = nucs.length > 0;
  while (hasV && t < T1 - .015) {
    while (fi < nf - 1 && times[fi + 1] <= t) fi++;
    const base = f0[fi]; jl += .22 * (R.g() - jl); sl += .25 * (R.g() - sl);
    const hi = clamp((base - 240) / 130, 0, 1), j = V.jit * (1 + .8 * sp.age + (V.fem ? 0 : .6) * hi) * (.0022 * R.g() + .0046 * jl), sh = V.shim * (1 + .6 * sp.age) * (.012 * R.g() + .030 * sl);
    let fry = fryT[fi]; const fr0 = tOff - (sp.endFry > .5 ? .30 : .12); if (t > fr0 && sp.endFry > .15) fry = Math.max(fry, sp.endFry * Math.min(1, (t - fr0) / .2));
    const alt = pn % 2 ? 1 : -1, ro = rouT[fi] * (.6 + .4 * Math.sin(pn * .37)), T_0 = 1 / base * (1 + j + fry * (.05 * alt + .10) + ro * .006 * alt);
    const ga = S.GA[fi], PS = Ps[fi], trans = Math.max(0, (PS - Pio_[fi]) / PS); let gate = 1; if (ga > .04) gate = s3(1 - (ga - .04) / .09);
    let ons = clamp((t - (tOn - .03)) / onL, 0, 1); const ofs = clamp((tOff + offP - t) / offL, 0, 1); if (t < tOn - .03 || t > tOff + offP) ons = 0;
    const lev = Math.pow(10, (db[fi] + arcA[fi]) / 20), AVv = S.AV[fi], ax = avX[fi];
    const amp = lev * gate * Math.pow(trans, 1.2) * AVv * ax * ons * ofs * (1 + sh) * (1 - .38 * fry * (alt > 0 ? 1 : 0)) * (1 + .20 * ro * alt) * (1 - .25 * fals[fi]);
    const loudn = (db[fi] + 1.6 * arcA[fi] + 12) / 12;
    let Rd = 1.12 + V.rd + .30 * clamp((V.lowRef - base) / 45, 0, 1) - .95 * (ten[fi] - .35) + 1.0 * (bre[fi] - .30) - .16 * loudn + 7 * Math.max(0, ga - .01) + .55 * (1 - ons) * (1 - .7 * sp.att) + .5 * (1 - ofs) + .05 * sl + .9 * (1 - trans) + .35 * (1 - AVv) + .3 * (1 - ax) - .35 * fry + .95 * fals[fi];
    Rd = clamp(Rd, rdMin, 2.9);
    const ri = clamp(Math.round((Rd - RD0) / RDS), 0, RDN - 1) * 10, a_ = LF[ri], w_ = LF[ri + 1], c_ = LF[ri + 2], te = LF[ri + 3], Fte = LF[ri + 4], rk = LF[ri + 5], e_ = LF[ri + 6], q_ = LF[ri + 7], Fm = LF[ri + 8];
    const scale = amp * 4e5 * CFG.Ks * Math.pow(base / 200, .15) * T_0, tend = t + T_0; let n = Math.ceil((t - times[fi]) / Ts[fi]) + fi * fl;
    const agm = (.045 + .05 * bre[fi] + .05 * Math.min(1, lev)) / Fm * Math.min(1, amp * 6), iT = 1 / T_0, iF = 1 / Fm;
    vis0[fi] = amp > .0008 ? base : 0;
    for (;;) {
      const kk = (n / fl) | 0; if (kk >= nf) break; const tn = times[kk] + (n - kk * fl) * Ts[kk]; if (tn >= tend) break;
      const u = (tn - t) * iT; let F; if (u < te) F = c_ * (Math.exp(a_ * u) * (a_ * Math.sin(w_ * u) - w_ * Math.cos(w_ * u)) + w_); else { const v = u - te; F = Fte - rk * ((1 - Math.exp(-e_ * v)) / e_ - v * q_); }
      if (F < 0 && F > -1e-3) F = 0; US[n] = scale * F; AG[n] = agm * F; FS[n] = F * iF; n++;
    }
    t = tend; pn++;
  }
  // ---- leak and turbulence
  let lp1 = 0, lp2 = 0, lp3 = 0, lp4 = 0, lp5 = 0, hp = 0, lkp = -1, sd = (sp.seed ^ 0x9E3779B9) | 0 || 1; const a4 = 1 - Math.exp(-TAU * ((sp.noise || 1) > 1.4 ? 3000 : 4200) * Ts[0]), Ka = 4200 * CFG.Ka, offW = sp.hardEnd ? .02 : sp.longTail ? .45 : .24;
  for (let k = 0; k < nf; k++) {
    const T = Ts[k], n0 = k * fl, ga = Math.max(0, S.GA[k]), i0 = air[k], dP = Math.max(0, Ps[k] - Pio_[k]) / 8000, lev = Math.pow(10, db[k] / 20), vo = hasV && times[k] > tOn - .05 && times[k] < tOff + offW ? 1 : 0;
    let fade = 1; if (times[k] > tOff - .05) fade = Math.pow(Math.max(0, 1 - (times[k] - tOff + .05) / (sp.hardEnd ? .05 : sp.longTail ? .42 : .26)), sp.longTail ? 2 : 1.4);
    const von = hasV ? clamp((times[k] - tOn + .05) / .04, 0, 1) : 0, ax = avX[k] * .85 + .15, nv = vo * von * (sp.noise || 1) * (.13 + .52 * bre[k]) * Math.pow(lev, .55) * .34 * CFG.nv * fade * (ax < .3 && ga < .02 ? ax : 1) * (sp.ghost ? .80 : 1);
    const nu = vo * von * fade * (ga > .004 ? Math.pow(dP, 1.5) * Math.sqrt(Math.min(ga, .35) / .2) * .14 * CFG.nu * (sp.nuK || 1) * (gaX[k] > .02 ? .45 * Math.pow(lev, .35) : 1) : 0), ni = .085 * i0 * i0 + .010 * i0 * (sign[k] < 0 ? 1 : 0), fm = frm[k];
    const fa = i0 > .01 ? (nose[k] ? (sp.noseHz || (bright[k] ? 2100 : 1200)) : bright[k] ? 3300 : 2200) : (sp.hum ? 2200 : 3400), a1 = 1 - Math.exp(-TAU * fa * T), a2 = 1 - Math.exp(-TAU * fcs[k] * T), cg = .42 / a2, a3 = 1 - Math.exp(-TAU * fhs[k] * T);
    const lk = (.006 + .022 * bre[k] + ga) * vo * (ax < .3 && ga < .02 ? ax : 1) + .22 * Math.min(1.2, i0); if (lkp < 0) lkp = lk; const dlk = (lk - lkp) / fl; let lkc = lkp; lkp = lk; const nm = CFG.nm;
    for (let n = n0, e = n0 + fl; n < e; n++) {
      const F = FS[n]; sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; let w = sd * 2.3283064365386963e-10;
      lp1 += a1 * (w - lp1); hp += a1 * (lp1 - hp); lp5 += a4 * (hp - lp5); NA[n] = Ka * lp5 * (nv * (nm + (1 - nm) * F) + nu + ni);
      lkc += dlk; AG[n] = (AG[n] + lkc) * V.gload;
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; w = sd * 2.3283064365386963e-10;
      lp2 += a2 * (w - lp2); lp3 += a2 * (lp2 - lp3); lp4 += a3 * (lp3 - lp4); NF[n] = cg * (lp3 - lp4) * (1 - fm * .65 * (1 - F));
    }
  }
  // ---- the tube
  const tb = tube(V, sp.hum), st = new Float64Array(tb.n), OUT = new Float64Array(N + 64), fn = tb.fn;
  for (let k = 0; k < nf; k++) fn(st, K, k * NC, (k + 1) * NC, C, k * NK, US, AG, NA, NF, k * fl, OUT);
  // ---- back to 44.1 kHz on the true clock
  const n0 = Math.ceil(times[0] * SR); let y = resample(OUT, times, Ts, nf, N);
  if (sp.lev > 0 && hasV) y = effort(y, n0, sp.segs.filter(g => g.role === 'nuc' || (g.role === 'off' && g.t1 - g.t0 > .05 && 'L R N M NG'.split(' ').includes(g.ph))), times, nf, db, arcA, sp.lev);
  if (hasV && sp.inhRel) for (const b of sp.breaths) if (b.d0) {    // how loud a breath is belongs to the acting, not to the plumbing
    const i0 = Math.max(0, Math.round(b.t0 * SR) - n0), i1 = Math.min(y.length, Math.round(b.t1 * SR) - n0), W = 1764; let mx = 1e-12; for (let i = i0; i + W <= i1; i += 441) { let e = 0; for (let q = i; q < i + W; q++) e += y[q] * y[q]; if (e / W > mx) mx = e / W; }
    const g = Math.pow(10, clamp(DB0 + sp.dyn - sp.inhRel + 20 * Math.log10(b.d0 / .6) - 10 * Math.log10(mx), -14, 20) / 20), ed = Math.min(1100, (i1 - i0) * .3); for (let i = i0; i < i1; i++) y[i] *= 1 + (g - 1) * s3((i - i0) / ed) * s3((i1 - i) / ed);
  }
  post(y, V);
  return { n0, y, times, nf, jawV, rndV, vis0, air, sign, bre, db, S, Pio_, dbgA: dbg && dbg.A };
}
const OPENV = { AA: 1.2, AE: 1.0, AO: .8, AW: 1.2, AY: 1.2, OY: .6, EH: .6, AH: .6, OW: .2, ER: -.3, EY: 0, IH: -.8, UH: -.8, IY: -1.6, UW: -1.6, MM: -1 };
// a singer aims at loudness, not at glottal amplitude: slowly correct the vowel-to-vowel level the tract produces
function effort(y, n0, nucs, times, nf, db, arcA, amount) {
  const n = y.length, e = new Float64Array(n + 1), a = Math.exp(-TAU * 260 / SR); let px = 0, py = 0, c = 0;
  for (let i = 0; i < n; i++) { py = a * (py + y[i] - px); px = y[i]; c += py * py; e[i + 1] = c; }
  const pts = [], T0 = times[0], fT = (times[nf] - T0) / nf;
  for (const g of nucs) {
    const d = Math.min(.05, .25 * (g.t1 - g.t0)), a0 = g.t0 + d, b0 = g.t1 - d, i = clamp(Math.floor(a0 * SR) - n0, 0, n - 1), j = clamp(Math.floor(b0 * SR) - n0, i + 1, n), Lm = 10 * Math.log10((e[j] - e[i]) / (j - i) + 1e-9);
    const k0 = clamp(Math.floor((a0 - T0) / fT), 0, nf - 1), k1 = clamp(Math.floor((b0 - T0) / fT), k0 + 1, nf); let Pm = 0; for (let k = k0; k < k1; k++) Pm += Math.pow(10, (db[k] + arcA[k]) / 10);
    const off = g.role === 'off', er = clamp(10 * Math.log10(Pm / (k1 - k0)) + (off ? (g.ph === 'L' || g.ph === 'R' ? -2.2 : -5) : OPENV[g.ph] || 0) + LREF - Lm, -14, 14) * amount;
    pts.push([a0, b0, off && pts.length ? Math.min(pts[pts.length - 1][2], er) : er]);
  }
  let q = 0, gp = -1; const np = pts.length, sc = Math.pow(10, (DB0 - LREF) / 20);
  for (let m = 0; m < n; m += 64) {
    const t = (n0 + m) / SR; while (q + 1 < np && t > pts[q + 1][0]) q++;
    const [a0, b0, gv] = pts[q]; let gd; if (t <= b0 || q === np - 1) gd = gv; else { const u = s3((t - b0) / Math.max(1e-3, pts[q + 1][0] - b0)); gd = gv + (pts[q + 1][2] - gv) * u; }
    const lin = Math.pow(10, gd / 20) * sc; if (gp < 0) gp = lin; const d = (lin - gp) / 64; let g = gp, e2 = Math.min(n, m + 64); for (let i = m; i < e2; i++) { g += d; y[i] *= g; } gp = lin;
  }
  return y;
}
const HALF = 26, PH = 256; let _ker = null;
function kernel() {
  if (!_ker) { _ker = new Float64Array((PH + 1) * 2 * HALF); const fc = 19500 / 95000 * 2;
    for (let p = 0; p <= PH; p++) { const fr = p / PH; let g = 0; for (let k = 0; k < 2 * HALF; k++) { const x = k - HALF + 1 - fr, s = Math.abs(x) < 1e-9 ? fc : Math.sin(Math.PI * fc * x) / (Math.PI * x), z = x / (HALF + .5), w = Math.abs(z) < 1 ? .42 + .5 * Math.cos(Math.PI * z) + .08 * Math.cos(TAU * z) : 0; g += (_ker[p * 2 * HALF + k] = s * w); } for (let k = 0; k < 2 * HALF; k++) _ker[p * 2 * HALF + k] /= g; } }
  return _ker;
}
function resample(x, times, Ts, nf, N) {
  const ker = kernel(), n0 = Math.ceil(times[0] * SR), n1 = Math.floor(times[nf] * SR) - 1, pad = new Float64Array(N + 2 * HALF + 8); pad.set(x.subarray(0, N), HALF);
  const out = new Float64Array(Math.max(0, n1 - n0 + 1)); let k = 0;
  for (let n = n0; n <= n1; n++) { const t = n / SR; while (k < nf - 1 && times[k + 1] <= t) k++; const pos = k * FRAME + (t - times[k]) / Ts[k], i = pos | 0, p = (((pos - i) * PH + .5) | 0) * 2 * HALF; if (i + 1 + 2 * HALF > pad.length) break; let s = 0; for (let q = 0, b = i + 1; q < 2 * HALF; q++) s += pad[b + q] * ker[p + q]; out[n - n0] = s; }
  return out;
}
function biq(x, b0, b1, b2, a1, a2) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], z = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = z; x[i] = z; } }
function hpf(x, f, q) { const w = TAU * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al; biq(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0); }
function lpf(x, f, q) { const w = TAU * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al; biq(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0); }
function lowShelf(x, f, g) { const A = Math.pow(10, g / 40), w = TAU * f / SR, c = Math.cos(w), r = 2 * Math.sqrt(A) * Math.sin(w) / 2 * Math.SQRT2, a0 = (A + 1) + (A - 1) * c + r; biq(x, A * ((A + 1) - (A - 1) * c + r) / a0, 2 * A * ((A - 1) - (A + 1) * c) / a0, A * ((A + 1) - (A - 1) * c - r) / a0, -2 * ((A - 1) + (A + 1) * c) / a0, ((A + 1) + (A - 1) * c - r) / a0); }
function post(y, V) { lpf(y, V.lp, .62); hpf(y, V.hp, .7); lowShelf(y, V.shelf[0], V.shelf[1]); }        // the microphone

// ---------------------------------------------------------------- what the picture needs to know, 100 Hz
function visOf(r, pcm, n0, span) {
  const t0 = n0 / SR, n = Math.max(1, Math.ceil(pcm.length / SR * 100)), mk = () => new Float32Array(n), v = { t0, dt: .01, jaw: mk(), round: mk(), level: mk(), f0: mk(), breath: mk() }; let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * .01; while (k < r.nf - 1 && r.times[k + 1] <= t) k++;
    const c = i * 441, a = Math.max(0, c - 551), b = Math.min(pcm.length, c + 551); let s = 0; for (let q = a; q < b; q++) s += pcm[q] * pcm[q]; const L = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
    v.level[i] = clamp((L + 54) / 42, 0, 1); v.jaw[i] = r.jawV[k]; v.round[i] = r.rndV[k];
    let f = 0; for (let q = Math.max(0, k - 9); q <= Math.min(r.nf, k + 9); q++) if (r.vis0[q] > 0) { f = r.vis0[q]; if (q >= k) break; } v.f0[i] = v.level[i] > .02 ? f : 0;
    v.breath[i] = clamp(r.air[k] > .01 ? r.sign[k] * Math.min(1, r.air[k] * 1.2) : (f > 0 ? -(.10 + .40 * r.bre[k] * v.level[i]) : 0), -1, 1);
  }
  if (span) for (let i = 0; i < n; i++) { const t = t0 + i * .01, e = Math.min(s3((t - span[0] + .10) / .22), s3((span[1] + .55 - t) / .40)); v.jaw[i] *= e; v.round[i] *= e; }
  return v;
}
function finish(sp, r, gain = 1) {
  let y = r.y, n0 = r.n0; if (gain !== 1) for (let i = 0; i < y.length; i++) y[i] *= gain;
  let end = y.length; if (sp.cutT) end = Math.min(end, Math.round(sp.cutT * SR) - n0);
  const pcm = new Float32Array(end); for (let i = 0; i < end; i++) pcm[i] = y[i];
  const fi = Math.min(end, 441), fo = sp.cutT ? 441 : 882; for (let i = 0; i < fi; i++) pcm[i] *= i / fi; for (let i = 0; i < Math.min(fo, end); i++) pcm[end - 1 - i] *= (i / fo);
  let pk = 0; for (let i = 0; i < end; i++) { const a = Math.abs(pcm[i]); if (a > pk) pk = a; } if (pk > .70) for (let i = 0; i < end; i++) pcm[i] *= .70 / pk;
  return { id: sp.id, who: sp.who, t0: n0 / SR, pcm, vis: visOf(r, pcm, n0, [Math.min(sp.tOn, ...sp.breaths.concat(sp.exh).map(b => b.t0)), Math.max(sp.segs.length ? sp.tOff : -1, ...sp.breaths.concat(sp.exh).map(b => b.t1))]) };
}
// ---------------------------------------------------------------- the sky: a ghost is far away, above, in a big space
// distance = less chest and less top, then a diffuse four-line feedback delay network. A line that breaks off is cut with its tail.
function sky(r, far, cutT) {
  const tail = cutT ? 0 : Math.round((1.2 + .8 * far) * SR), n = r.y.length, N = n + tail, x = new Float64Array(N); x.set(r.y);
  hpf(x, 110 + 170 * far, .7); lpf(x, 5600 - 1900 * far, .7);
  const L0 = Math.round(1931 * 1.17), L1 = Math.round(2473 * 1.17), L2 = Math.round(2851 * 1.17), L3 = Math.round(3433 * 1.17), RT = 1.8 + 1.2 * far;
  const b0 = new Float64Array(L0), b1 = new Float64Array(L1), b2 = new Float64Array(L2), b3 = new Float64Array(L3), g = [L0, L1, L2, L3].map(d => Math.pow(10, -3 * d / (RT * SR)));
  const pre = Math.round((.03 + .05 * far) * SR), pb = new Float64Array(pre), da = 1 - Math.exp(-TAU * 3000 / SR), wet = .10 * (.35 + .9 * far), dry = 1 - .5 * far;
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0, pi = 0, l0 = 0, l1 = 0, l2 = 0, l3 = 0; const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const xin = pb[pi]; pb[pi] = x[i]; if (++pi === pre) pi = 0;
    const a = b0[i0], b = b1[i1], c = b2[i2], d = b3[i3];
    l0 += da * (.5 * (a + b + c + d) - l0); l1 += da * (.5 * (a - b + c - d) - l1); l2 += da * (.5 * (a + b - c - d) - l2); l3 += da * (.5 * (a - b - c + d) - l3);
    b0[i0] = xin + g[0] * l0; b1[i1] = xin - g[1] * l1; b2[i2] = xin + g[2] * l2; b3[i3] = xin - g[3] * l3;
    if (++i0 === L0) i0 = 0; if (++i1 === L1) i1 = 0; if (++i2 === L2) i2 = 0; if (++i3 === L3) i3 = 0;
    out[i] = dry * x[i] + wet * (a + b + c + d);
  }
  r.y = out;
}
function renderLine(id, dbg) {
  const L = typeof id === 'string' ? lineById(id) : id;
  if (L.who === 'choir') return renderChoir(L);
  const sp = perform(L); if (sp.hardEnd) sp.cutT = sp.tOff + .03;      // broken off: no ring, no tail
  const r = engine(sp, dbg); if (dbg) { dbg.sp = sp; dbg.r = r; }
  if (FAR[L.id] !== undefined) sky(r, FAR[L.id], sp.cutT);
  return finish(sp, r);
}
// ---------------------------------------------------------------- the choir: eight throats singing the words in octaves, 'ah'-bright
const CHOIR = [['chF0', 0, 0, 0, 1], ['chF1', 0, .007, .06, .85], ['chF2', 0, -.006, -.07, .8], ['chF3', 0, .004, .10, .75],
  ['chM0', -12, .003, -.05, .95], ['chM1', -12, -.007, .06, .85], ['chM2', -12, .008, -.09, .8], ['chM3', -12, -.003, .04, .75]];
function renderChoir(L) {
  let main = null; const parts = CHOIR.map(([sing, x, lag, det, g], k) => {
    const Lk = { id: L.id + '_' + k, who: 'choir', sing, sec: L.sec, feel: Object.assign({}, L.feel, { vib: .30 + .12 * Math.sin(k * 2.7), breath: .22 + .06 * Math.cos(k * 1.9) }), act: Object.assign({}, ACT[L.id] || {}, { lagx: lag }), detune: det * 1.6, ah: .15,
      notes: L.notes.map(N => Object.assign({}, N, { midi: N.midi + x })), t0: L.t0, t1: L.t1 };
    const sp = perform(Lk), r = engine(sp); if (!k) main = { sp, r }; return [r, g];
  });
  let n0 = Infinity, n1 = -Infinity; for (const [r] of parts) { n0 = Math.min(n0, r.n0); n1 = Math.max(n1, r.n0 + r.y.length); }
  const y = new Float64Array(n1 - n0); for (const [r, g] of parts) { const o = r.n0 - n0; for (let i = 0; i < r.y.length; i++) y[o + i] += r.y[i] * g * .40; }
  main.r.y = y; main.r.n0 = n0; const out = finish(main.sp, main.r); out.id = L.id; out.who = 'choir'; return out;
}

// ---------------------------------------------------------------- creature voices: the same tubes, other throats, other acting
function shiver(seed, r0, r1, deep) { const n = 2400, R = rng(seed), w = smoothNoise(n, .002, 2.2, R, 1), am = smoothNoise(n, .002, 1.3, R, .35); let ph = R.r(0, 6); const tb = new Float64Array(n); for (let i = 0; i < n; i++) { const x = i / n; ph += TAU * (r0 + (r1 - r0) * Math.min(1, x * 2.4) + 1.1 * w[i]) * .002; tb[i] = 1 - deep * (.5 + .5 * Math.sin(ph)) * clamp(.85 + am[i], .2, 1); } return t => at(tb, t / .002); }
function airSpec(id, sing, t0, t1, shape, o) {
  const V = SINGER[sing], T0 = t0 - .06, T1 = t1 + .14, m = Math.ceil((T1 - T0) * CR) + 4, mk = v => new Float64Array(m).fill(v || 0), sc = new Gest([], { fs: V.fscale });
  for (const k of BODY) sc.T[k].v0 = shape[k];
  if (o.to) for (const k of BODY) sc.T[k].to(t0 - .02, t0 + (o.by || .3), o.to[k]);
  if (o.closed) sc.T.cLI.add(T0 - 9, T0 - 8, T1 + 8, T1 + 9, -.22);
  return { id, who: sing, V, seed: hash('air' + id), T0, T1, tOn: T1 + 9, tOff: T1 + 9, segs: [], breaths: [], exh: [], CR, f0: mk(120), db: mk(-20), ten: mk(.3), bre: mk(.8), fry: mk(), rough: mk(), gaX: mk(), avX: mk(1), fals: mk(), eff: 0, smile: o.smile || 0, hum: !!o.closed, age: V.age || 0, att: .1, lh: o.lh || 0, sc, lev: 0, endFry: 0 };
}
// pad a performance's control tracks so it can start earlier / end later than its notes (breaths, tails)
function fitTracks(sp, T0, T1) {
  const sh = T0 !== undefined && T0 < sp.T0 ? Math.round((sp.T0 - T0) * CR) : 0; sp.T0 -= sh / CR; if (T1 !== undefined && T1 > sp.T1) sp.T1 = T1;
  const m = Math.ceil((sp.T1 - sp.T0) * CR) + 4;
  for (const k of ['f0', 'db', 'ten', 'bre', 'fry', 'rough', 'gaX', 'avX', 'fals']) { const a = sp[k]; if (a.length < m || sh) { const b = new Float64Array(Math.max(m, a.length + sh)); b.fill(a[0], 0, sh); b.set(a, sh); b.fill(a[a.length - 1], sh + a.length); sp[k] = b; } }
}
const NT = (ph, midi, t0, t1) => ({ syl: 'ah', ph: ph.split(' '), midi, t0, t1 });
// a creature performance: notes + feel + acting, then o.mod(sp, i, t) shapes pitch, roughness, air and gates sample by control sample
function vox(id, sing, notes, feel, act, o = {}) {
  const sp = perform({ id, who: o.who || sing, sing, sec: 'sound', feel, act: Object.assign({ arc: [0, 0, -2, .3], endFry: 0 }, act), notes, t0: notes[0].t0, t1: notes[notes.length - 1].t1, noBreath: true });
  sp.lev = 0; sp.inhRel = 0; if (o.noise) sp.noise = o.noise; if (o.nuK) sp.nuK = o.nuK; if (o.breaths) sp.breaths = o.breaths; if (o.exh) sp.exh = o.exh;
  const air = sp.breaths.concat(sp.exh); fitTracks(sp, Math.min(sp.T0, ...air.map(b => b.t0 - .07)), Math.max(sp.T1, ...air.map(b => b.t1 + .14), o.T1 || 0));
  if (o.mod) for (let i = 0; i < sp.f0.length; i++) o.mod(sp, i, sp.T0 + i / CR);
  return sp;
}
const take = sp => ({ sp, r: engine(sp) });
function actRms(y) { const W = 1024, p = []; let mx = 0; for (let i = 0; i + W <= y.length; i += W) { let e = 0; for (let q = i; q < i + W; q++) e += y[q] * y[q]; e /= W; p.push(e); if (e > mx) mx = e; } let s = 0, k = 0; for (const e of p) if (e >= mx * .01) { s += e; k++; } return Math.sqrt(k ? s / k : 1e-12) + 1e-12; }
function follow(y, ms) { const a = 1 - Math.exp(-1 / (ms * .001 * SR)), a4 = Math.min(1, 4 * a), e = new Float64Array(y.length); let v = 0; for (let i = 0; i < y.length; i++) { const x = y[i] < 0 ? -y[i] : y[i]; v += (x > v ? a4 : a) * (x - v); e[i] = v; } return e; }
function addLayer(y, w, rel) { const k = rel * actRms(y) / actRms(w); for (let i = 0; i < y.length && i < w.length; i++) y[i] += k * w[i]; }
// sub-bass under a giant: a sine on the fundamental (folded into 28-62 Hz) riding the voice's own envelope
function subBuf(r, sp, lo = 28, hi = 62) {
  const y = r.y, e = follow(y, 30), w = new Float64Array(y.length); let ph = 0;
  for (let i = 0; i < y.length; i++) { const t = (r.n0 + i) / SR; let f = at(sp.f0, (t - sp.T0) * CR); while (f > hi) f *= .5; if (f < lo) f = lo; ph += TAU * f / SR; if (ph > TAU) ph -= TAU; w[i] = e[i] * (Math.sin(ph) + .22 * Math.sin(2 * ph + .5)); }
  lpf(w, 140, .6); return w;
}
// crackle: sparse decaying ringing bursts (fire in a throat, wet bubbles, stone grit); density and size follow env(t)
function crackBuf(n, n0, R, rate, env, fLo, fHi, tau, sweep = 0, lp = 4500) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i += 32) { const t = (n0 + i) / SR, e = env(t); if (e <= 0 || R() > rate * e * 32 / SR) continue;
    const k0 = i + ((R() * 32) | 0), fc = fLo * Math.pow(fHi / fLo, R()), tc = tau * (.5 + R()) * SR, A = e * (.25 + .75 * Math.pow(R(), 3)) * (R() < .5 ? -1 : 1), L = Math.min(n - k0, Math.ceil(tc * 5)); let ph = R() * TAU;
    for (let k = 0; k < L; k++) { ph += TAU * fc * (1 + sweep * k / SR) / SR; w[k0 + k] += A * Math.exp(-k / tc) * (1 - Math.exp(-k / 6)) * Math.sin(ph); } }
  lpf(w, lp, .6); hpf(w, 90, .7); return w;
}
// band noise: a resonance excited by turbulence (a wheeze whistle, breath through bared teeth)
function bandBuf(n, n0, seed, fAt, Q, env) {
  const w = new Float64Array(n); let sd = seed | 1, x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, a1 = 0, a2 = 0, g = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) { const t = (n0 + i) / SR, ww = TAU * fAt(t) / SR, al = Math.sin(ww) / (2 * Q), a0 = 1 + al; b0 = al / a0; a1 = -2 * Math.cos(ww) / a0; a2 = (1 - al) / a0; g = env(t); }
    sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; const x = sd * 2.3283064365386963e-10, v = b0 * x - b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = v; w[i] = v * g;
  }
  lpf(w, 5000, .6); return w;
}
// several takes into one, each brought to the same loudness first, then shaped by its gain curve g(t)
function mixTakes(parts) {
  let n0 = Infinity, n1 = -Infinity; for (const p of parts) { n0 = Math.min(n0, p.r.n0); n1 = Math.max(n1, p.r.n0 + p.r.y.length); }
  const y = new Float64Array(n1 - n0); for (const p of parts) { const o = p.r.n0 - n0, k = 1 / actRms(p.r.y); for (let i = 0; i < p.r.y.length; i++) y[o + i] += p.r.y[i] * k * p.g((p.r.n0 + i) / SR); }
  return { y, n0 };
}
const midHz = m => 440 * Math.pow(2, (m - 69) / 12), P2 = st => Math.pow(2, st / 12);
// ---- the voices, by who.kind. Each returns { sp, r } (a tube take, maybe with layers) or { peep } (Ember's syrinx)
const SOUND = {
  // EMBER: a 7 cm throat. Chirps, squeaks and giggles come from her syrinx; everything with breath in it from the tube
  'ember.chirp': (s, id, R) => ({ peep: peepTake('chirp', s.t, s.dur, hash(id), R) }),
  'ember.squeak': (s, id, R) => ({ peep: peepTake('squeak', s.t, s.dur, hash(id), R) }),
  'ember.giggle': (s, id, R) => ({ peep: peepTake('giggle', s.t, s.dur, hash(id), R) }),
  'ember.sneeze': (s, id, R) => {                       // "ah... ah... TCHU": the burst lands ON the sound's time (the sparks)
    const t = s.t, k = R.r(.94, 1.06);
    return take(vox(id, 'ember', [NT('HH IH', 84, t - .42 * k, t - .32 * k), NT('HH IH', 87, t - .20 * k, t - .09), NT('T UW', 81, t + .004, t + .11)], { dyn: -7, breath: .55, effort: .5 }, { arc: [-7, -3, 0, .95], scoop: -1, soft: .03 },
      { who: 'ember', noise: 2.4, breaths: [{ t0: t - .56 * k, t1: t - .44 * k, depth: .7, nose: 0 }, { t0: t - .31 * k, t1: t - .22 * k, depth: .8, nose: 0 }], mod: (sp, i, tt) => { const x = tt - t; if (x > -.01) { const u = Math.max(0, x); sp.gaX[i] = Math.max(sp.gaX[i], .22 * Math.exp(-u / .05)); sp.f0[i] *= P2(-6 * s3(x / .12)); sp.db[i] += 5 * Math.exp(-u / .07); } } }));
  },
  'ember.cough': (s, id, R) => {                        // three little dry barks (or, faked at the old one, an 'ahem' that is all voice)
    const t = s.t, fake = !!s.fake, A = fake ? [.02, .21] : [.03, .31, .57], ns = A.map((a, k) => NT(fake && !k ? 'HH AH' : 'K AH', 80 - 2 * k, t + a, t + a + (fake ? .13 : .12)));
    return take(vox(id, 'ember', ns, { dyn: -6, breath: .5, effort: .35 }, { arc: [0, 0, -3, .3], soft: .02 }, { who: 'ember', noise: 2.0,
      breaths: fake ? [] : A.slice(1).map(a => ({ t0: t + a - .10, t1: t + a - .03, depth: .55, nose: 0 })),
      mod: (sp, i, tt) => { for (const a of A) { const u = tt - t - a; if (u > 0 && u < .3) { sp.gaX[i] = Math.max(sp.gaX[i], (fake ? .07 : .2) * Math.exp(-u / (fake ? .09 : .045))); sp.f0[i] *= P2(-4 * s3(u / .12)); if (!fake) sp.avX[i] *= s3(1 - (u - .055) / .05); } } } }));
  },
  'ember.yawn': (s, id, R) => {                         // a huge breath in, a squeak at the top, a long fall, the mouth shuts on 'mm'
    const t = s.t, d = s.dur, f = x => 960 * P2(5 * s3((x - .10) / .18) - 15 * s3((x - .32) / (d * .55))) * (1 + .010 * Math.sin(TAU * 6 * x));
    return take(vox(id, 'ember', [NT('AA', 84, t + .12, t + d * .70), NT('AH M', 74, t + d * .70, t + d * .93)], { dyn: -10, breath: .6 }, { arc: [-4, .5, -6, .3], soft: .08, thin: { deep: 6, from: .5, br: .3 } },
      { who: 'ember', breaths: [{ t0: t - .30, t1: t + .09, depth: .85, nose: 0 }], mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] = f(clamp(x, 0, d)); } }));
  },
  'ember.whimper': (s, id, R) => {                      // a nasal whine in two or three shaking pulses, each catching and falling
    const t = s.t, d = s.dur, n = d > 1 ? 3 : 2, P = (d - .08) / n, A = [], sh = shiver(hash(id), 6.5, 8, .5);
    for (let k = 0; k < n; k++) A.push(NT(k ? 'IY' : 'N IY', 84 - 2 * k, t + .04 + k * P, t + .04 + k * P + .64 * P));
    return take(vox(id, 'ember', A, { dyn: -12, breath: .6, tremor: 1.2 }, { arc: [-1, 0, -4, .2], soft: .05, falls: { 0: 2, 1: 2, 2: 3 }, pianto: { 0: .8, 1: .8, 2: .8 } },
      { who: 'ember', breaths: A.slice(1).map(a => ({ t0: a.t0 - .36 * P + .01, t1: a.t0 - .03, depth: .45, nose: 0, env: u => .3 + .7 * sh(u * .3) })),
        mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] *= P2(.4 * Math.sin(TAU * 7.5 * x)); sp.avX[i] *= .82 + .18 * Math.sin(TAU * 7.5 * x + 1); } }));
  },
  'ember.gasp': (s, id, R) => {                         // the big breath in before the blue fire: rising, the mouth opening wider
    const t = s.t, d = s.dur, sp = airSpec(id, 'ember', t, t + d * .8, mix(SHAPES.AX, SHAPES.IH, .3), { to: SHAPES.AA, by: .40 });
    sp.breaths = [{ t0: t, t1: t + d * .72, depth: 1.25, nose: 0, env: u => .3 + .7 * s3(u * 1.25) }]; return take(sp);
  },
  'ember.growl': (s, id, R) => {                        // a tiny furious growl: high for a growl, rattling, all effort
    const t = s.t, d = s.dur;
    return take(vox(id, 'ember', [NT('ER', 66, t + .03, t + d * .85)], { dyn: -7, breath: .3, effort: .8 }, { arc: [-2, 1.5, -2, .45], soft: .05, scoop: -1 },
      { who: 'ember', noise: 1.6, mod: (sp, i, tt) => { const x = tt - t, sg = .45 * Math.exp(-(((x - .10) / .06) ** 2)) + .6 * Math.exp(-(((x - .27) / .06) ** 2)) + Math.exp(-(((x - .47) / .08) ** 2)); sp.rough[i] = 2.0; sp.fry[i] = .25 + .25 * Math.sin(TAU * 3 * x); sp.avX[i] *= (.62 + .38 * Math.abs(Math.sin(Math.PI * 22 * x))) * (.15 + .85 * Math.min(1, sg)); sp.f0[i] *= P2(-2 * s3(x / d) + 1.5 * sg); } }));   // grr-rr-RRR: three surges, the last the biggest
  },
  'ember.roar': (s, id, R) => {                         // BLUE: her own small roar, then a huge bright voice grows out of it (with a dragon's chest under it)
    const t = s.t, d = s.dur;
    const a = take(vox(id, 'ember', [NT('R AA', 80, t + .02, t + 1.35)], { dyn: -2, breath: .35, effort: 1 }, { arc: [0, 2, -2, .4], soft: .04, scoop: 2 }, { who: 'ember', noise: 1.8, mod: (sp, i, tt) => { const x = tt - t; sp.rough[i] = 1.1; sp.f0[i] = midHz(79) * P2(3 * s3(x / .5)) * (1 + .012 * Math.sin(TAU * 7 * x)); } }));
    const b = take(vox(id + 'b', 'blue', [NT('AA', 66, t + .22, t + d - .12)], { dyn: 0, breath: .3, effort: 1, vib: .8 }, { arc: [0, 3, 0, .6], soft: .25, scoop: 3, vibx: 1.4 }, { who: 'ember', noise: 2.2, mod: (sp, i, tt) => { const x = tt - t; sp.rough[i] = .7 * s3((x - .3) / .4); sp.f0[i] *= P2(3 * s3((x - .4) / .6)); } }));
    const c = take(vox(id + 'c', 'noctR', [NT('AA', 54, t + .32, t + d - .12)], { dyn: 0, breath: .4, effort: 1 }, { arc: [0, 3, 0, .6], soft: .3, scoop: 2 }, { who: 'ember', noise: 2.4, mod: (sp, i, tt) => { const x = tt - t; sp.rough[i] = 1.2; sp.f0[i] *= P2(3 * s3((x - .45) / .6)); } }));
    const G = q => Math.pow(10, (-17 + 17 * s3((q - t) / .9)) / 20), m = mixTakes([{ r: a.r, g: q => G(q) * (1 - .45 * s3((q - t - .6) / .8)) }, { r: b.r, g: q => G(q) * s3((q - t - .2) / .55) }, { r: c.r, g: q => G(q) * .6 * s3((q - t - .3) / .7) }]);
    const r = Object.assign({}, a.r, { y: m.y, n0: m.n0 }); addLayer(r.y, subBuf(Object.assign({}, b.r, { y: m.y, n0: m.n0 }), b.sp, 40, 80), .35);
    return { sp: a.sp, r, also: [b] };
  },
  // ASH: an old throat, gravel and smoke
  'ash.hrmph': (s, id, R) => {                          // a grumpy nasal 'hm' (or, smiling, an amused 'hm-HM')
    const t = s.t, sm = !!s.smile, ns = sm ? [NT('M MM', 52, t + .05, t + .46)] : [NT('M MM', 50, t + .07, t + .44)];
    return take(vox(id, 'ash', ns, { dyn: -6, breath: .5, hum: true, effort: .4 }, { arc: [1, 1, -6, .2], soft: .03, endFry: .6 },
      { who: 'ash', exh: sm ? [{ t0: t + .44, t1: t + .62, depth: 1.0, nose: 1 }] : ns.map(n => ({ t0: n.t0 - .07, t1: n.t0 + .10, depth: .9, nose: 1 })), mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] *= sm ? P2(-2 + 6 * s3((x - .05) / .16) - 8 * s3((x - .26) / .18)) : P2(1.5 - 7 * s3((x - .07) / .35)); sp.rough[i] = .5; } }));
  },
  'ash.cough': (s, id, R) => {                          // a smoker's cough: wet, rattling, each bark heavier, a wheezy pull of air between
    const t = s.t, k = s.dur / .7, A = [0, .2 * k, .4 * k], ns = A.map((a, q) => NT('K AH', 47 - q, t + a, t + a + .14));
    const o = take(vox(id, 'ash', ns, { dyn: -3, breath: .6, effort: .6 }, { arc: [0, 0, -3, .3], soft: .02, endFry: .6 }, { who: 'ash', noise: 2.2,
      breaths: A.slice(1).map(a => ({ t0: t + a - .06, t1: t + a - .015, depth: .45, nose: 0 })).concat([{ t0: t + A[2] + .2, t1: t + A[2] + .45, depth: .6, nose: 0 }]),
      mod: (sp, i, tt) => { const x = tt - t; sp.rough[i] = 1.6 + .6 * Math.sin(TAU * 2.3 * x); sp.fry[i] = .5; for (const a of A) { const u = x - a - .05; if (u > 0 && u < .25) { sp.gaX[i] = Math.max(sp.gaX[i], .22 * Math.exp(-u / .07)); sp.f0[i] *= P2(-4 * s3(u / .15)); sp.avX[i] *= 1 - .55 * (.5 + .5 * Math.sin(TAU * 33 * tt + 3 * Math.sin(TAU * 7 * tt))); } } } }));
    const e = follow(o.r.y, 20); let mx = 1e-9; for (const v of e) mx = Math.max(mx, v); addLayer(o.r.y, crackBuf(o.r.y.length, o.r.n0, R, 160, q => { const i = Math.round(q * SR) - o.r.n0; return i >= 0 && i < e.length ? e[i] / mx : 0; }, 160, 520, .005, 25, 2200), .30);
    return o;
  },
  'ash.wheeze': (s, id, R) => {                         // he breathes in and blows for fire: nothing but a sputter and a thin whistle in his chest
    const t = s.t, d = s.dur, sp = airSpec(id, 'ash', t, t + d, mix(SHAPES.UW, SHAPES.AX, .35), {});
    sp.breaths = [{ t0: t, t1: t + .26 * d, depth: .7, nose: 0 }];
    sp.exh = [{ t0: t + .32 * d, t1: t + .97 * d, depth: 1.15, nose: 0, env: u => Math.pow(Math.min(1, u / .08), 1.2) * Math.pow(1 - u, .6) * (1 - .45 * Math.abs(Math.sin(TAU * 13 * u * d))) }];
    const o = take(sp), wA = q => { const x = (q - t) / d; return x < .26 ? .35 * Math.sin(Math.PI * x / .26) : x > .32 && x < .97 ? Math.sin(Math.PI * (x - .32) / .65) * (.6 + .4 * Math.sin(TAU * 4.5 * (q - t))) : 0; };
    addLayer(o.r.y, bandBuf(o.r.y.length, o.r.n0, hash(id), q => { const x = (q - t) / d; return x < .3 ? 1150 : 860 - 240 * s3((x - .32) / .6); }, 32, wA), .45);
    return o;
  },
  'ash.grunt': (s, id, R) => {                          // effort: a creaky attack, a short low 'uh', shut off in the throat, air out the nose
    const t = s.t;
    return take(vox(id, 'ash', [NT('AH', 45, t + .03, t + .30)], { dyn: -4, breath: .35, effort: .8 }, { arc: [1, 0, -6, .15], soft: .02, endFry: .8 },
      { who: 'ash', exh: [{ t0: t + .30, t1: t + .52, depth: .5, nose: 1 }], mod: (sp, i, tt) => { const x = tt - t; sp.fry[i] = x < .07 ? .8 : .2; sp.rough[i] = 1.0; sp.f0[i] *= P2(1 - 4 * s3(x / .3)); sp.avX[i] *= s3((.34 - x) / .05); } }));
  },
  'ash.laugh': (s, id, R) => {
    const t = s.t;
    if (s.tiny) {                                       // a closed-mouth chuckle through the nose: hm-hm-hm
      const n = s.dur > .7 ? 3 : 2, ns = []; for (let k = 0; k < n; k++) ns.push(NT('M MM', 52 - 1.5 * k, t + .05 + .17 * k, t + .14 + .17 * k));
      return take(vox(id, 'ash', ns, { dyn: -8, breath: .55, hum: true, smile: .8 }, { arc: [0, 0, -3, .3], soft: .02 }, { who: 'ash', exh: ns.map(q => ({ t0: q.t0 - .03, t1: q.t0 + .13, depth: .55, nose: 1 })),
        mod: (sp, i, tt) => { for (const q of ns) { const u = (tt - q.t0) / (q.t1 - q.t0); if (u > 0 && u < 1.4) sp.f0[i] *= P2(-2 * s3(u)); } } }));
    }
    const ns = [], P = [53, 56, 54, 52, 48]; let x = t + .10; for (let k = 0; k < 5; k++) { const q = .150 + .012 * k + R.r(-.01, .01); ns.push(Object.assign(NT('HH ' + (k % 3 === 1 ? 'AH' : 'AA'), P[k] + R.r(-.3, .3), x, x + q * .55), { syl: 'ha' })); x += q; }
    return take(vox(id, 'ash', ns, { dyn: -5, breath: .45, smile: .9 }, { arc: [-1, 1.5, -9, .2], scoop: 1.5, fall: 1, soft: .04 }, { who: 'ash', nuK: 4, breaths: [{ t0: x + .04, t1: x + .30, depth: .55, nose: 0 }],
      mod: (sp, i, tt) => { sp.rough[i] = .6; for (const g of ns) { const z = (tt - g.t0) / (g.t1 - g.t0); if (z > 0 && z < 1.3) { sp.f0[i] *= P2(.9 * (1 - z) - .9 * z); sp.avX[i] *= 1 - .92 * s3((z - .55) / .4); sp.gaX[i] = Math.max(sp.gaX[i], .12 * s3((z - .55) / .4)); } } } }));
  },
  'ash.roar': (s, id, R) => {                           // he stands and roars: no fire. The roar breaks, sputters into air and a cough
    const t = s.t;
    return take(vox(id, 'ash', [NT('R AA', 50, t + .05, t + .62), NT('AH', 45, t + .62, t + .74), NT('K AH', 45, t + .80, t + .92)], { dyn: -1, breath: .4, effort: 1 }, { arc: [0, 2, -3, .3], scoop: 3, soft: .04, endFry: .5 },
      { who: 'ash', noise: 2.6, mod: (sp, i, tt) => { const x = tt - t, z = s3((x - .45) / .25); sp.rough[i] = 1.5 + .6 * z; sp.f0[i] = midHz(50) * P2(-4 * (1 - s3(x / .12)) + s3((x - .12) / .3) - 8 * z); sp.fry[i] = z;
        sp.avX[i] *= 1 - .7 * z * Math.abs(Math.sin(TAU * 11 * x)); sp.gaX[i] += .12 * z * (x < .78 ? 1 : 0); const u = x - .85; if (u > 0) sp.gaX[i] = Math.max(sp.gaX[i], .22 * Math.exp(-u / .06)); } }));
  },
  'ash.groan': (s, id, R) => {
    const t = s.t;
    if (s.soft) return take(vox(id, 'ash', [NT('HH AO', 47, t + .12, t + .72)], { dyn: -10, breath: .65, tremor: .5 }, { arc: [-2, 1, -5, .4], soft: .1, endFry: .7 },   // waking: a sniff, a sleepy 'hhoh'
      { who: 'ash', breaths: [{ t0: t - .06, t1: t + .09, depth: .5, nose: 1 }], mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] *= P2(2 * s3((x - .1) / .2) - 5 * s3((x - .35) / .35)); sp.fry[i] = x < .2 ? .6 : .15; } }));
    return take(vox(id, 'ash', [NT('OW', 45, t + .06, t + .62)], { dyn: -5, breath: .5, effort: .6, tremor: 1.3 }, { arc: [0, 1.5, -6, .35], soft: .05, endFry: .8 },   // hurt: thrown into the rock
      { who: 'ash', exh: [{ t0: t + .58, t1: t + .86, depth: .5, nose: 0 }], mod: (sp, i, tt) => { const x = tt - t; sp.fry[i] = x < .09 ? .7 : .2; sp.rough[i] = .8; sp.f0[i] *= P2(-2 * (1 - s3(x / .1)) + 1.5 * s3(x / .2) - 6 * s3((x - .25) / .4)); } }));
  },
  // THE PARENTS: two-note calls across the sky, coos, battle roars from a bigger chest, and her cry
  'lune.call': (s, id, R) => callOf(s, id, 'lune', 69, 74),
  'noct.call': (s, id, R) => callOf(s, id, 'noct', 59, 66),
  'lune.coo': (s, id, R) => cooOf(s, id, 'lune', 69),
  'noct.coo': (s, id, R) => cooOf(s, id, 'noct', 57),
  'lune.roar': (s, id, R) => roarOf(s, id, 'luneR', 'lune', 62),
  'noct.roar': (s, id, R) => roarOf(s, id, 'noctR', 'noct', 50),
  'lune.cry': (s, id, R) => {                           // the saddest sound in the film: a keening fall, the voice breaking, two sobs, then only air
    const t = s.t, sh = shiver(hash(id), 5, 7, .7);
    return take(vox(id, 'lune', [NT('AA', 79, t + .03, t + .42), NT('AH', 76, t + .48, t + .76), NT('OW', 72, t + .82, t + 1.14)], { dyn: -2, breath: .5, effort: .5, tremor: 1.0, vib: .8 },
      { arc: [0, 1, -6, .25], scoop: 1.5, pianto: { 1: 1.2, 2: 1.4 }, catch_: [{ n: 1, at: -.035, dur: .05 }, { n: 2, at: -.035, dur: .06 }], crack: [{ n: 0, at: .20, st: 3.5, dur: .06, drop: .6 }], falls: { 0: 1, 2: 3 }, thin: { deep: 12, from: .3, br: .45, air: .7 }, vibx: 1.6, soft: .05 },
      { who: 'lune', noise: 1.4, breaths: [{ t0: t - .24, t1: t - .01, depth: .8, nose: 0, env: u => .3 + .7 * sh(u * .23) }] }));
  },
  // CINDER: a 36 cm throat, a 45 Hz voice, sub under it and fire crackling in it; lowpassed so it is never harsh
  'cinder.roar': (s, id, R) => {
    const t = s.t, d = s.dur;
    const o = take(vox(id, 'cinder', [NT('R AA', 31, t + .05, t + d * .8)], { dyn: 0, breath: .5, effort: 1 }, { arc: [0, 3, -4, .3], soft: .05, endFry: .9 }, { who: 'cinder', noise: 3.5,
      mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] = 49 * P2(-6 * (1 - s3(x / .25)) + 1.5 * s3((x - .1) / .3) - 3 * s3((x - .5) / (d * .5)) - 4 * s3((x - d * .75) / (d * .25))); sp.rough[i] = 2.4 + .8 * Math.sin(TAU * 3.1 * x); sp.fry[i] = .3 + .5 * s3((x - d * .6) / (d * .3)); sp.gaX[i] = Math.max(sp.gaX[i], .02); } }));
    return fireOf(o, R, 1.0, 70);
  },
  'cinder.snarl': (s, id, R) => {                       // teeth bared: rattling surges of a low growl, air hissing through the teeth
    const t = s.t, d = s.dur, S = x => Math.exp(-(((x - .08) / .09) ** 2)) + Math.exp(-(((x - .42 * d) / .12) ** 2)) + .8 * Math.exp(-(((x - .74 * d) / .12) ** 2));
    const o = take(vox(id, 'cinder', [NT('EH', 36, t + .03, t + d * .9)], { dyn: -2, breath: .5, effort: .9 }, { arc: [0, 1, -3, .5], soft: .04, endFry: .6 }, { who: 'cinder', noise: 3,
      mod: (sp, i, tt) => { const x = tt - t, v = S(x); sp.avX[i] *= .35 + .65 * Math.pow(Math.abs(Math.sin(Math.PI * 14 * x)), .7); sp.rough[i] = 2.2; sp.f0[i] *= 1 + .15 * v; sp.db[i] += 5 * v - 2; } }));
    const e = follow(o.r.y, 25); let mx = 1e-9; for (const v of e) mx = Math.max(mx, v);
    addLayer(o.r.y, bandBuf(o.r.y.length, o.r.n0, hash(id), () => 2300, 1.3, q => { const i = Math.round(q * SR) - o.r.n0; return i >= 0 && i < e.length ? e[i] / mx : 0; }), .22);
    return fireOf(o, R, .7, 40);
  },
  'cinder.screech': (s, id, R) => {                     // a giant's screech from a tighter throat; the last one petrifies: freezes, grinds, crumbles
    const t = s.t, d = s.dur, last = !!s.last, D = last ? 1.0 : d;
    const o = take(vox(id, 'cinS', [NT('AE', 55, t + .03, t + D * .55), NT('AA', 52, t + D * .55, t + (last ? 1.55 : D * .85))], { dyn: 0, breath: .45, effort: 1 }, { arc: [1, 3, -4, .18], soft: .04, endFry: last ? .2 : .6 }, { who: 'cinder', noise: 3,
      mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] = 196 * P2(-5 * (1 - s3(x / .09)) + 4 * s3((x - .03) / .14) - 4 * s3((x - D * .6) / (D * .4))); sp.rough[i] = 1.6; sp.fry[i] = .2;
        if (last && x > .9) { const z = s3((x - .9) / .3), st = Math.floor((x - .9) / .16); sp.f0[i] = 196 * P2(1 - 1.6 * st * z); sp.fry[i] = z; sp.rough[i] = 1.6 + 1.4 * z; sp.avX[i] *= (1 - z) + z * (.25 + .75 * (Math.sin(TAU * 23 * x) > -.2 ? 1 : 0)) * s3((1.62 - x) / .12); } } }));
    if (last) { const e = q => { const x = q - t; return x < .85 ? 0 : s3((x - .85) / .15) * Math.pow(Math.max(0, 1 - (x - 1.0) / (d - 1.0)), 1.3); }; addLayer(o.r.y, crackBuf(o.r.y.length, o.r.n0, R, 260, e, 150, 900, .006, 0, 2600), .55); }
    return fireOf(o, R, .5, 60, last ? t + .9 : 0);
  },
};
function callOf(s, id, who, m1, m2) {                   // "hoo-WAH": a dragon's two-note call, the second note trilled in the throat
  const t = s.t, k = s.dur / .7;
  return take(vox(id, who, [NT('UW', m1, t + .02, t + .27 * k), NT('W AA', m2, t + .33 * k, t + .68 * k)], { dyn: -3, breath: .3, smile: .5, vib: .7 }, { arc: [-1, 1, -2, .6], scoop: .8, slide: { 1: .12 }, vibx: 1.6, soft: .05 },
    { who, mod: (sp, i, tt) => { const x = tt - t; if (x > .33 * k) { const w = s3((x - .4 * k) / .1); sp.avX[i] *= 1 - .22 * w * (.5 + .5 * Math.sin(TAU * 21 * x)); sp.f0[i] *= P2(.3 * w * Math.sin(TAU * 21 * x)); } } }));
}
function cooOf(s, id, who, m) {                         // a closed-mouth coo with a purr in it
  const t = s.t, d = s.dur;
  return take(vox(id, who, [NT('M MM', m, t + .06, t + d - .1)], { dyn: -9, breath: .45, hum: true, smile: .8 }, { arc: [-2, 1, -4, .4], soft: .08 },
    { who, mod: (sp, i, tt) => { const x = tt - t; sp.f0[i] *= P2(-1 + 3 * s3(x / .25) - 4 * s3((x - .35) / .35)); sp.avX[i] *= .78 + .22 * Math.sin(TAU * 24 * x); sp.rough[i] = .3; } }));
}
function roarOf(s, id, sing, who, m) {                  // a parent's battle roar: a bigger chest than the singing voice, brave, rough, no sub
  const t = s.t, d = s.dur;
  return take(vox(id, sing, [NT('R AA', m, t + .03, t + d * .85)], { dyn: -1, breath: .4, effort: 1 }, { arc: [0, 2, -3, .35], scoop: 4, fall: 3, soft: .04, endFry: .5 },
    { who, noise: 2.5, mod: (sp, i, tt) => { const x = tt - t; sp.rough[i] = 1.3 + .4 * Math.sin(TAU * 4.3 * x); sp.fry[i] = x < .06 ? .6 : .1; } }));
}
function fireOf(o, R, subRel, rate, stopAt = 0) {        // Cinder's sub-bass and the crackle of fire in his throat
  const y = o.r.y, e = follow(y, 30); let mx = 1e-9; for (const v of e) mx = Math.max(mx, v);
  const env = q => { if (stopAt && q > stopAt) return 0; const i = Math.round(q * SR) - o.r.n0; return i >= 0 && i < e.length ? e[i] / mx : 0; };
  const cr = crackBuf(y.length, o.r.n0, R, rate, env, 700, 3200, .0025), sb = subBuf(o.r, o.sp);
  addLayer(y, sb, subRel); addLayer(y, cr, .22); lpf(y, 5200, .6); return o;
}
// ---------------------------------------------------------------- Ember's syrinx: two tight lips, a tiny throat, a tiny mouth (additive, band-limited)
function peep(T0, T1, seed, fn) {
  const R = rng(seed), n = Math.ceil((T1 - T0) * SR), y = new Float64Array(n), Cn = 32, m = Math.ceil(n / Cn) + 1, nv = Math.ceil((T1 - T0) * 100) + 1;
  const mk = () => new Float32Array(nv), vis = { t0: T0, dt: .01, jaw: mk(), round: mk(), level: mk(), f0: mk(), breath: mk() }, c = {};
  const fl = smoothNoise(m, Cn / SR, 9, R, 1), dr = smoothNoise(m, Cn / SR, 2, R, 1), res = (f, F, Q) => { const r = f / F, a = 1 - r * r, b = r / Q; return 1 / Math.sqrt(a * a + b * b); };
  let ph = R() * TAU, sd = (seed ^ 0x5bd1e995) | 1, n1 = 0, n2 = 0, n3 = 0; const pa = new Float64Array(6), G = new Float64Array(6);
  for (let q = 0; q < m; q++) {
    const t = T0 + q * Cn / SR; c.f = 1000; c.amp = 0; c.asp = 0; c.R1 = 2000; c.R2 = 3800; c.br = 1; c.jaw = 0; c.rnd = 0; c.sub = 0; fn(t, c);
    const f = c.f * Math.pow(2, (.12 * fl[q] + .05 * dr[q]) / 12), br = c.br;
    for (let h = 0; h < 4; h++) { const fh = f * (h + 1), rl = h === 0 ? 1 : h === 1 ? .38 * br : h === 2 ? .15 * br * br : .06 * br * br; G[h] = fh < 5600 ? c.amp * rl * (.55 * res(fh, c.R1, 2.6) + .55 * res(fh, c.R2, 3.4)) : 0; }
    G[4] = c.amp * c.sub * res(f * .5, 900, 2); G[5] = c.asp;
    const k0 = q * Cn, dph = TAU * f / SR;
    for (let i = 0; i < Cn && k0 + i < n; i++) {
      const a = i / Cn; ph += dph; if (ph > TAU * 64) ph -= TAU * 64;
      const v = (pa[0] + (G[0] - pa[0]) * a) * Math.sin(ph) + (pa[1] + (G[1] - pa[1]) * a) * Math.sin(2 * ph + .6) + (pa[2] + (G[2] - pa[2]) * a) * Math.sin(3 * ph + 1.1) + (pa[3] + (G[3] - pa[3]) * a) * Math.sin(4 * ph) + (pa[4] + (G[4] - pa[4]) * a) * Math.sin(.5 * ph);
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; const w = sd * 2.3283064365386963e-10; n1 += .42 * (w - n1); n2 += .42 * (n1 - n2); n3 += .16 * (n2 - n3);
      y[k0 + i] = v + (n2 - n3) * (pa[5] + (G[5] - pa[5]) * a) * .5;
    }
    pa.set(G);
    const vi = Math.min(nv - 1, Math.round((t - T0) * 100)); vis.jaw[vi] = c.jaw; vis.round[vi] = c.rnd; vis.f0[vi] = c.amp > .03 ? f : 0; vis.breath[vi] = c.amp > .03 ? -.4 * c.amp : 0;
  }
  lpf(y, 6000, .6); hpf(y, 320, .7);
  return { t0: T0, y, vis };
}
function peepTake(kind, t, d, seed, R, v = {}) {
  const k = R.r(.93, 1.08), F = R.r(.94, 1.07) * (v.pitch || 1);
  if (kind === 'chirp') {                               // "chirr-rup": a rolled blip, a breath of a gap, a bright rising-falling second blip
    const b1 = .10 * k, gap = .022 * k, b2 = b1 + gap + .17 * k * (v.long || 1), F1 = 1150 * F, F2 = 1480 * F, up = v.up || 0;
    return peep(t - .02, t + b2 + .06, seed, (tt, c) => { const x = tt - t; if (x < 0) return;
      if (x < b1) { const z = x / b1; c.f = F1 * P2(7 * sstep(z * 1.3)); c.amp = s3(x / .008) * s3((b1 - x) / .014) * (.62 + .38 * Math.sin(TAU * 44 * x)); c.R1 = 1700 + 700 * z; c.R2 = 3400; c.jaw = .2 + .45 * z; c.asp = x < .012 ? .4 : 0; }
      else if (x >= b1 + gap && x < b2) { const u = x - b1 - gap, z = u / (b2 - b1 - gap); c.f = F2 * P2(4.5 * sstep(z / .35) - (2.5 - up) * s3((z - .5) / .5)); c.amp = s3(u / .010) * s3((b2 - x) / .045); c.R1 = 2100; c.R2 = 3700 - 500 * z; c.jaw = .55 * s3(u / .03) * s3((b2 - x) / .05); c.rnd = .3 * z; c.sub = .12; } });
  }
  if (kind === 'squeak') {                              // "eep!": a pinched leap up, a quiver, a fall
    const L = (.21 + .06 * R()) * k, F0 = 1650 * F;
    return peep(t - .02, t + L + .05, seed, (tt, c) => { const x = tt - t; if (x < 0 || x > L) return; const z = x / L;
      c.f = F0 * P2(7 * sstep(x / .035) + .8 * Math.exp(-(((x - .045) / .02) ** 2)) - 4 * s3((z - .6) / .4)) * (1 + .012 * Math.sin(TAU * 15 * x));
      c.amp = s3(x / .006) * s3((L - x) / .035) * (1 - .25 * z); c.R1 = 2500; c.R2 = 4100; c.br = .85; c.jaw = .35 + .25 * s3(x / .04); c.rnd = .1; c.asp = x < .01 ? .3 : .03; });
  }
  const P = .118 * k, N = Math.max(3, Math.round((d - .1) / P)), F0 = 1600 * F;  // giggle: "hee-hee-hee-hee", each with a breathy 'h', falling
  return peep(t - .02, t + N * P + .12, seed, (tt, c) => { const x = tt - t; if (x < 0) return; const q = Math.floor(x / P); if (q >= N) return; const u = (x - q * P) / (P * .72); if (u > 1) { c.jaw = .15; return; }
    c.f = F0 * P2(-1.1 * q + 2 * s3(u / .35) - 3 * s3((u - .45) / .55)); c.amp = s3(u / .14) * s3((1 - u) / .35) * (1 - .1 * q); c.asp = u < .18 ? .55 * (1 - u / .18) : .04; c.R1 = 2300; c.R2 = 3900; c.jaw = .3 + .4 * Math.sin(Math.PI * u); c.sub = .08; });
}
function finishPeep(o, gain, id, who) {
  const n = o.y.length, pcm = new Float32Array(n); for (let i = 0; i < n; i++) pcm[i] = o.y[i] * gain;
  for (let i = 0; i < Math.min(300, n); i++) { pcm[i] *= i / 300; pcm[n - 1 - i] *= i / 300; }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(pcm[i])); if (pk > .70) for (let i = 0; i < n; i++) pcm[i] *= .70 / pk;
  const v = o.vis, nv = v.level.length; for (let i = 0; i < nv; i++) { const cc = i * 441, a = Math.max(0, cc - 441), b = Math.min(n, cc + 441); let e = 0; for (let q = a; q < b; q++) e += pcm[q] * pcm[q]; v.level[i] = clamp((10 * Math.log10(e / Math.max(1, b - a) + 1e-12) + 54) / 42, 0, 1); }
  return { id, who, t0: o.t0, pcm, vis: v };
}
// loudness of each creature voice: dBFS RMS of its active part (the mix lane balances from here)
const LOUD = { 'ember.chirp': -23, 'ember.squeak': -22, 'ember.giggle': -23, 'ember.sneeze': -19, 'ember.cough': -21, 'ember.cough.fake': -22, 'ember.yawn': -24, 'ember.whimper': -25, 'ember.gasp': -27, 'ember.growl': -22, 'ember.roar': -12,
  'ash.hrmph': -21, 'ash.cough': -18, 'ash.wheeze': -23, 'ash.grunt': -20, 'ash.laugh': -19, 'ash.laugh.tiny': -22, 'ash.roar': -14, 'ash.groan': -19, 'ash.groan.soft': -23,
  'noct.call': -18, 'lune.call': -18, 'noct.coo': -24, 'lune.coo': -24, 'noct.roar': -14, 'lune.roar': -14, 'lune.cry': -16, 'cinder.roar': -10, 'cinder.snarl': -12, 'cinder.screech': -11 };
const loudOf = s => { const k = s.who + '.' + s.kind, v = s.tiny ? '.tiny' : s.soft ? '.soft' : s.fake ? '.fake' : ''; return LOUD[k + v] !== undefined ? LOUD[k + v] : LOUD[k] !== undefined ? LOUD[k] : -20; };
function disperse(y) { for (const f of [95, 170, 300, 520, 900, 1500]) { const w = TAU * f / SR, al = Math.sin(w) / 1.4, a0 = 1 + al, c = Math.cos(w); biq(y, (1 - al) / a0, -2 * c / a0, 1, -2 * c / a0, (1 - al) / a0); } }
function limit(y, ceil, maxDb) {                         // look-ahead peak limiter: 5 ms attack, 90 ms release, at most maxDb of reduction
  const B = 64, nb = Math.ceil(y.length / B), bm = new Float64Array(nb); for (let i = 0; i < y.length; i++) { const a = y[i] < 0 ? -y[i] : y[i], k = (i / B) | 0; if (a > bm[k]) bm[k] = a; }
  const gb = new Float64Array(nb), lo = Math.pow(10, -maxDb / 20), ar = Math.exp(-B / (.09 * SR)); let g = 1;
  for (let k = nb - 1; k >= 0; k--) { let m = 0; for (let q = k; q < Math.min(nb, k + 5); q++) if (bm[q] > m) m = bm[q]; gb[k] = Math.max(lo, Math.min(1, ceil / (m + 1e-12))); }
  for (let k = 0; k < nb; k++) { const tg = gb[k]; g = tg < g ? tg : tg + (g - tg) * ar; gb[k] = g; }
  for (let i = 0; i < y.length; i++) { const u = i / B - .5, k = Math.max(0, Math.min(nb - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - k)); y[i] *= gb[k] + (gb[k + 1] - gb[k]) * f; }
}
function renderSound(j) {
  const s = SC.sounds[j], id = 'snd' + j, R = rng(hash(id + s.kind + s.who)), D = SOUND[s.who + '.' + s.kind];
  if (!D) throw new Error('VOICE: no voice for ' + s.who + '.' + s.kind);
  const o = D(s, id, R), tg = Math.pow(10, loudOf(s) / 20);
  if (o.peep) { const out = finishPeep(o.peep, tg / actRms(o.peep.y), id, s.who); out.kind = s.kind; return out; }
  const big = /roar|snarl|screech/.test(s.kind); if (big) disperse(o.r.y);
  const g0 = tg / actRms(o.r.y); if (big) { for (let i = 0; i < o.r.y.length; i++) o.r.y[i] *= g0; limit(o.r.y, .66, 6); }
  const out = finish(o.sp, o.r, big ? 1 : g0);
  if (o.also) for (const b of o.also) { const v = visOf(b.r, out.pcm, Math.round(out.t0 * SR)); for (let i = 0; i < out.vis.jaw.length && i < v.jaw.length; i++) { out.vis.jaw[i] = Math.max(out.vis.jaw[i], v.jaw[i]); out.vis.round[i] = Math.max(out.vis.round[i], v.round[i]); if (!out.vis.f0[i]) out.vis.f0[i] = v.f0[i]; } }
  out.id = id; out.who = s.who; out.kind = s.kind; return out;
}
// Ember's chirp on demand (live play): 0-7, each a different mood (plain, question, double, squeak), two pitches
function reply(variant = 0) {
  const v = ((variant % 8) + 8) % 8, R = rng(hash('reply' + v)), kind = v % 4 === 3 ? 'squeak' : 'chirp', o = peepTake(kind, .2, .5, hash('rp' + v), R, { pitch: v < 4 ? 1 : 1.12, up: v % 4 === 1 ? 5 : 0, long: v % 4 === 2 ? 1.5 : 1 });
  const out = finishPeep(o, Math.pow(10, -21 / 20) / actRms(o.y), 'reply' + v, 'ember'); out.vis.t0 = 0; out.t0 = 0; out.dur = out.pcm.length / SR; out.lead = .2 - o.t0; return out;
}

// ---------------------------------------------------------------- the API
const cost = id => {
  if (id.slice(0, 3) === 'snd') { const s = SC.sounds[+id.slice(3)]; return s ? s.dur * (s.who === 'ember' ? (s.kind === 'roar' ? 3.5 : 1.8) : 1.2) + .3 : 1; }
  const L = lineById(id); return L ? (L.t1 - L.t0 + 1) * (L.who === 'choir' ? CHOIR.length : 1) : 1;
};
const jobs = () => SC.lines.map(l => l.id).concat(SC.sounds.map((_, i) => 'snd' + i)).sort((a, b) => cost(b) - cost(a));
// the film's hard silences (docs/AUDIO.md): at SILENCE everything stops dead but the ghost g1; the bar ALONE -> BLUE keeps only Ember's breath
const HUSH = [[SC.CUE.SILENCE, SC.CUE.DAWN0, (id, s) => id === 'g1'], [SC.CUE.ALONE, SC.CUE.BLUE - .12, (id, s) => !!s && s.who === 'ember' && s.kind === 'gasp']];
function hush(out, id, s) {
  const p = out.pcm, n0 = Math.round(out.t0 * SR), v = out.vis, fo = Math.round(.008 * SR), fi = Math.round(.025 * SR);
  for (const [a, b, ok] of HUSH) { if (ok(id, s)) continue; const ia = Math.round(a * SR) - n0, ib = Math.round(b * SR) - n0; if (ib <= 0 || ia >= p.length) continue;
    for (let i = Math.max(0, ia - fo); i < Math.min(p.length, ib + fi); i++) p[i] *= i < ia ? s3((ia - i) / fo) : i >= ib ? s3((i - ib) / fi) : 0;
    for (let i = 0; i < v.level.length; i++) { const t = v.t0 + i * v.dt; if (t >= a - .01 && t < b) { v.jaw[i] = 0; v.round[i] = 0; v.level[i] = 0; v.f0[i] = 0; v.breath[i] = 0; } } }
  return out;
}
function render(id) {
  if (id.slice(0, 3) === 'snd') return hush(renderSound(+id.slice(3)), id, SC.sounds[+id.slice(3)]);
  const L = lineById(id); if (!L) throw new Error('VOICE: no line ' + id);
  return hush(renderLine(L), id, null);
}
return { SR, jobs, render, reply, cost, _: { set plain(v) { plain = v; for (const k in _tubes) delete _tubes[k]; }, CFG, perform, engine, renderLine, SINGER, SHAPES, tube, F1OF, MOOD, ACT, LOUD, SOUND } };
})();
if (typeof module !== 'undefined') module.exports = VOICE;
