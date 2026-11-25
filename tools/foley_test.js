// node tools/foley_test.js [--fast]  -> qa/foley/: foley_full.wav, sec_*.wav, catalogue.wav/.json, oneshots.wav/.json, report.json
// Renders every FOLEY job, then measures what ears would: peaks, loudness per section (BS.1770, gated), energy above 6 kHz,
// DC, buffer edges, the hard silences, CPU per film second, and every event's onset against its Score time
// (each event kind re-rendered alone; onset = first moment the 5 ms RMS rises 30 % of the way from the level 45-90 ms before the event to the event's peak).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'qa', 'foley'); fs.mkdirSync(out, { recursive: true });
const Score = require('../src/06_score.js'); global.Score = Score;
const FOLEY = require('../src/audio/foley.js'), SR = 44100, FAST = process.argv.includes('--fast');
const db = x => x > 0 ? 20 * Math.log10(x) : -120, f1 = x => (+x).toFixed(1), C = Score.CUE;
function wav(file, L, R) {
  const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); }
  fs.writeFileSync(file, b);
}
// RBJ biquad
function bq(type, f, q, gdb = 0) { const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gdb / 40); let b0, b1, b2, a0, a1, a2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { const sa = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * c + sa); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sa); a0 = (A + 1) - (A - 1) * c + sa; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sa; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]; }
function filt(X, cs) { let y = Float64Array.from(X); for (const [b0, b1, b2, a1, a2] of cs) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const x = y[i], v = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = v; y[i] = v; } } return y; }
const HP6 = [bq('hp', 6000, .5412), bq('hp', 6000, 1.3066)];            // 4th-order Butterworth at 6 kHz
const hfShare = X => { let e = 0, h = 0; const y = filt(X, HP6); for (let i = 0; i < X.length; i++) { e += X[i] * X[i]; h += y[i] * y[i]; } return e > 0 ? h / e : 0; };
const KW = [bq('hs', 1500, Math.SQRT1_2, 4), bq('hp', 38, .5)];
function lufs(L, R) { const a = filt(L, KW), b = filt(R, KW), B = .4 * SR | 0, H = B / 4, bl = []; for (let i = 0; i + B <= a.length; i += H) { let s = 0; for (let k = i; k < i + B; k++) s += a[k] * a[k] + b[k] * b[k]; bl.push(s / B); }
  const L1 = z => -0.691 + 10 * Math.log10(z + 1e-20); let g = bl.filter(z => L1(z) > -70); if (!g.length) return -99; const m = g.reduce((p, q) => p + q, 0) / g.length; g = g.filter(z => L1(z) > L1(m) - 10); return L1(g.reduce((p, q) => p + q, 0) / g.length); }
// onset of one event inside a stem
function onsetAt(L, R, t0, t, t1) { const W = 220, a = Math.max(W, Math.round((t - .09 - t0) * SR)), b = Math.min(L.length, Math.round((Math.min(t + .25, t1) - t0) * SR)); if (b <= a + W) return null;
  const e = new Float64Array(b - a); let s = 0; for (let k = a - W; k < a; k++) { const v = L[k] + R[k]; s += v * v; } for (let i = a; i < b; i++) { const v = L[i] + R[i], u = L[i - W] + R[i - W]; s += v * v - u * u; e[i - a] = s; }
  const tb = Math.round((t - .09 - t0) * SR) - a, ti = Math.round((t - .045 - t0) * SR) - a; let base = 0, pk = 0; for (let i = 0; i < e.length; i++) { if (i >= tb && i <= ti && e[i] > base) base = e[i]; if (e[i] > pk) pk = e[i]; }   // floor = the loudest the stem was 45-90 ms before the event
  const th = base + .09 * (pk - base); let k = 0; while (k < e.length && e[k] < th) k++; return t0 + (a + k - W / 2) / SR; }

const N = Math.round(Score.DUR * SR), ML = new Float32Array(N), MR = new Float32Array(N), rows = [], stems = {}; let cpu = 0, aud = 0;
for (const id of FOLEY.jobs()) {
  const c0 = process.cpuUsage(), s = FOLEY.render(id, { log: true }), c1 = process.cpuUsage(c0), ms = (c1.user + c1.system) / 1000; cpu += ms; aud += s.L.length / SR; stems[id] = s;
  let pk = 0, e = 0, dc = 0, nan = 0; for (let i = 0; i < s.L.length; i++) { const a = s.L[i], b = s.R[i]; if (!(a === a && b === b)) nan++; const m = Math.max(Math.abs(a), Math.abs(b)); if (m > pk) pk = m; e += a * a + b * b; dc += a + b; }
  const n = s.L.length, edge = Math.max(Math.abs(s.L[0]), Math.abs(s.R[0]), Math.abs(s.L[n - 1]), Math.abs(s.R[n - 1]));
  rows.push({ id, bus: s.bus, send: s.send, t0: +s.t0.toFixed(2), t1: +(s.t0 + n / SR).toFixed(2), ms: Math.round(ms), peak: +f1(db(pk)), rms: +f1(db(Math.sqrt(e / 2 / n))), hf: +(100 * Math.max(hfShare(s.L), hfShare(s.R))).toFixed(2), dc: +(dc / 2 / n).toExponential(1), edge: +edge.toExponential(1), nan, events: s.log.length });
  const o = Math.round(s.t0 * SR); for (let i = Math.max(0, -o); i < n && o + i < N; i++) { ML[o + i] += s.L[i]; MR[o + i] += s.R[i]; }
}
console.log('job               bus  send   t0      t1    cpu ms  peak   rms   >6k%   dc       edge    ev');
for (const r of rows) console.log(r.id.padEnd(17), r.bus.padEnd(4), String(r.send).padEnd(5), String(r.t0).padStart(6), String(r.t1).padStart(7), String(r.ms).padStart(6), String(r.peak).padStart(6), String(r.rms).padStart(6), String(r.hf).padStart(6), String(r.dc).padStart(8), String(r.edge).padStart(8), String(r.events).padStart(4));
console.log('CPU total s', (cpu / 1000).toFixed(2), '| stem-seconds', aud.toFixed(0), '| CPU-s per film second', (cpu / 1000 / Score.DUR).toFixed(4), '| slowest job ms', Math.max(...rows.map(r => r.ms)));

// sections: peak, gated loudness, energy > 6 kHz of the foley sum
const secs = Score.SEC.map(s => ({ name: s.name, a: s.t0, b: Math.min(Score.DUR, s.name === 'dawn' ? Score.DUR : s.t1) })), secRows = [];
for (const s of secs) { const a = Math.round(s.a * SR), b = Math.round(s.b * SR), L = ML.subarray(a, b), R = MR.subarray(a, b); let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  secRows.push({ sec: s.name, peak: +f1(db(pk)), lufs: +f1(lufs(L, R)), hf: +(100 * Math.max(hfShare(L), hfShare(R))).toFixed(2) }); if (!FAST) wav(path.join(out, 'sec_' + s.name + '.wav'), L, R); }
console.log('section   peak dBFS  LUFS(gated)  >6k%'); for (const r of secRows) console.log(r.sec.padEnd(9), String(r.peak).padStart(8), String(r.lufs).padStart(11), String(r.hf).padStart(7));
if (!FAST) wav(path.join(out, 'foley_full.wav'), ML, MR);
// hard silences
const quiet = (a, b) => { let m = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) m = Math.max(m, Math.abs(ML[i]), Math.abs(MR[i])); return +f1(db(m)); };
const keepPeak = (id, a, b) => { const s = stems[id]; let m = 0; for (let i = Math.max(0, Math.round((a - s.t0) * SR)); i < Math.min(s.L.length, Math.round((b - s.t0) * SR)); i++) m = Math.max(m, Math.abs(s.L[i]), Math.abs(s.R[i])); return +f1(db(m)); };
const sil = { 'SILENCE..+1s all': quiet(C.SILENCE + .001, C.SILENCE + 1), 'loss: ash bed only (amb.loss peak)': keepPeak('amb.loss', C.SILENCE, C.DAWN0), 'ALONE..BLUE all': quiet(C.ALONE + .001, C.BLUE - .001), 'ALONE..BLUE fx.alone (breath+heart)': keepPeak('fx.alone', C.ALONE, C.BLUE) };
let other = -120; for (const id in stems) if (id !== 'fx.alone') other = Math.max(other, keepPeak(id, C.ALONE + .001, C.BLUE - .001)); sil['ALONE..BLUE every other stem'] = other;
other = -120; for (const id in stems) if (id !== 'amb.loss') other = Math.max(other, keepPeak(id, C.SILENCE + .001, C.DAWN0 - .001)); sil['SILENCE..DAWN0 every other stem'] = other;
console.log('hard silences (dBFS peak):', JSON.stringify(sil));

// onsets: each kind alone
const onsets = {};
for (const id of FOLEY.jobs()) { const lg = stems[id].log; if (!lg || !lg.length) continue; const kinds = [...new Set(lg.map(x => x.kind))];
  for (const k of kinds) { const s = FOLEY.render(id, { only: k, log: true }), ts = [...new Set(s.log.map(x => x.t))].sort((a, b) => a - b);
    ts.forEach((t, i) => { const t1 = i + 1 < ts.length ? ts[i + 1] - .01 : t + .25, m = onsetAt(s.L, s.R, s.t0, t, t1); if (m === null) return; const d = (m - t) * 1000, K = onsets[k] || (onsets[k] = { n: 0, sum: 0, max: 0, worst: 0 }); K.n++; K.sum += Math.abs(d); if (Math.abs(d) > Math.abs(K.max)) { K.max = d; K.worst = +t.toFixed(3); } }); } }
console.log('onset vs Score (ms)  kind             n   mean|err|  max err  at');
let all = 0, nAll = 0, over = 0; for (const k in onsets) { const K = onsets[k]; all += K.sum; nAll += K.n; if (Math.abs(K.max) > 5) over++; console.log('                    ', k.padEnd(14), String(K.n).padStart(3), (K.sum / K.n).toFixed(2).padStart(9), K.max.toFixed(2).padStart(8), K.worst); }
console.log('events', nAll, 'mean |err| ms', (all / nAll).toFixed(2), 'kinds over 5 ms:', over);

// catalogue and one-shots
const parts = [], idx = []; let t = .3;
for (const nm of FOLEY.catalogue()) { const s = FOLEY.sound(nm); let k = 0; for (const X of [s.L, s.R]) for (const v of X) k = Math.max(k, Math.abs(v)); parts.push([t, s, .5 / k]); idx.push({ name: nm, t, dur: s.L.length / SR, hf: +(100 * hfShare(s.L)).toFixed(2) }); t += s.L.length / SR + .5; }
const CL = new Float32Array(Math.ceil(t * SR)), CR = new Float32Array(CL.length); for (const [at, s, g] of parts) { const o = Math.round(at * SR); for (let i = 0; i < s.L.length; i++) { CL[o + i] += s.L[i] * g; CR[o + i] += s.R[i] * g; } }
wav(path.join(out, 'catalogue.wav'), CL, CR); fs.writeFileSync(path.join(out, 'catalogue.json'), JSON.stringify(idx));
const shots = []; let ts = .2, sp = []; for (const kd of FOLEY.kinds()) for (let sd = 0; sd < 2; sd++) { const c0 = process.cpuUsage(), s = FOLEY.oneshot(kd, 11 + sd * 7), c1 = process.cpuUsage(c0); let k = 0; for (const X of [s.L, s.R]) for (const v of X) k = Math.max(k, Math.abs(v)); shots.push({ kind: kd, seed: sd, t: ts, dur: +(s.L.length / SR).toFixed(2), peak: +f1(db(k)), hf: +(100 * Math.max(hfShare(s.L), hfShare(s.R))).toFixed(2), ms: Math.round((c1.user + c1.system) / 1000) }); sp.push([ts, s]); ts += s.L.length / SR + .4; }
const OL = new Float32Array(Math.ceil(ts * SR)), OR = new Float32Array(OL.length); for (const [at, s] of sp) { const o = Math.round(at * SR); for (let i = 0; i < s.L.length; i++) { OL[o + i] += s.L[i]; OR[o + i] += s.R[i]; } }
wav(path.join(out, 'oneshots.wav'), OL, OR); fs.writeFileSync(path.join(out, 'oneshots.json'), JSON.stringify(shots));
console.log('one-shots kind:peak dBFS/dur s/>6k%/ms', shots.filter(s => s.seed === 0).map(s => `${s.kind}:${s.peak}/${s.dur}/${s.hf}/${s.ms}`).join('  '));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ rows, cpu_s: cpu / 1000, cpu_per_s: cpu / 1000 / Score.DUR, sections: secRows, silences: sil, onsets, shots }, null, 1));
