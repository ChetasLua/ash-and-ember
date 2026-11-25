#!/usr/bin/env node
// band_test.js - renders every band stem and the 140 s master into qa/band/, prints the numbers that stand in for ears:
// CPU per second of audio, stem peaks and >6 kHz share, onset error vs Score, loudness per section, band balance, hushes.
//   node tools/band_test.js [--stems] [--duck] [--only=love.harp,attack.drums]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'qa', 'band');
const Score = require('../src/06_score.js'), BAND = require('../src/audio/band.js'), MIX = require('../src/audio/mix.js');
const SR = 44100, A = process.argv.slice(2), has = k => A.includes(k), only = (A.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; }, dBs = x => 20 * Math.log10(x + 1e-12), r1 = x => Math.round(x * 10) / 10;
function wav(file, L, R) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } fs.writeFileSync(file, b); }
// radix-2 FFT power spectrum, Hann, 4096 frames
const NF = 4096, HW = new Float64Array(NF).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / NF));
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const p = i + j, q = p + len / 2, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function spectrum(L, R, i0 = 0, i1 = L.length) { const P = new Float64Array(NF / 2), re = new Float64Array(NF), im = new Float64Array(NF); for (let s = i0; s + NF <= i1; s += NF) { for (let i = 0; i < NF; i++) { re[i] = (L[s + i] + R[s + i]) * HW[i]; im[i] = 0; } fft(re, im); for (let k = 0; k < NF / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; } return P; }
const bandsOf = (P, edges) => { const out = new Array(edges.length - 1).fill(0); let tot = 0; for (let k = 1; k < P.length; k++) { const f = k * SR / NF; tot += P[k]; for (let b = 0; b < edges.length - 1; b++) if (f >= edges[b] && f < edges[b + 1]) out[b] += P[k]; } return out.map(x => x / (tot || 1)); };
// ---- 1. render the band
const ids = BAND.jobs().filter(id => !only.length || only.includes(id)), stems = [], per = {}; let cpuBand = 0;
for (const id of ids) { const c0 = cpu(), r = BAND.render(id), dt = cpu() - c0; cpuBand += dt; stems.push(r); let pk = 0; for (const X of [r.L, r.R]) for (let i = 0; i < X.length; i++) pk = Math.max(pk, Math.abs(X[i])); const hf = bandsOf(spectrum(r.L, r.R), [0, 6000, 22050])[1];
  per[id] = { cpu: +dt.toFixed(3), dur: r1(r.L.length / SR), peak: r1(dBs(pk)), hf6k: +(hf * 100).toFixed(1), mk: r1(dBs(r.mk)), keep: r.keep || undefined }; if (has('--stems')) wav(path.join(OUT, id + '.wav'), r.L, r.R); }
const BAL = {}; for (const r of stems) { if (r.keep) continue; const [sec, g] = r.id.split('.'); (BAL[sec] = BAL[sec] || {})[g] = MIX.activeLufs(r.L, r.R, r.mk / .6, SR); }
const balTxt = Object.entries(BAL).map(([s, o]) => { const mx = Math.max(...Object.values(o)); return s + ': ' + Object.entries(o).sort((a, b) => b[1] - a[1]).map(([g, v]) => g + ' ' + r1(v - mx)).join(' '); }).join('\n  ');
// every played note must be a written one: compare the band's own log with Score.tracks (pitch, time within 12 ms)
const KTR = { koto: 'koto', flute: 'flute', harp: 'harp', violin: 'strings|ostin', viola: 'strings|ostin', cello: 'strings', choir: 'choir', horn: 'horn', bsn: 'reed', bass: 'bass', pizzVn: 'pizz', pizzVa: 'pizz', pizzVc: 'pizz', celesta: 'celesta', musicbox: 'celesta' };
const notesCheck = (() => { const log = BAND.log(), want = []; let extra = 0, bad = []; for (const tr of ['koto', 'flute', 'harp', 'strings', 'ostin', 'pizz', 'bass', 'celesta', 'choir', 'horn', 'reed']) for (const e of Score.tracks[tr]) for (const m of [e.m].concat(e.notes || [])) want.push({ tr, t: e.t, m, hit: 0 });
  for (const [id, k, t, d, m] of log) { const g = id.split('.')[1], trs = [g === 'small' || g === 'metal' ? k : g], ok = q => trs.includes(q.tr) && q.m === m && Math.abs(q.t - t) < .012 + (k === 'koto' || k === 'flute' ? 0 : .09), w = want.find(q => !q.hit && ok(q)) || want.find(ok); if (w) w.hit++; else { extra++; if (bad.length < 4) bad.push(id + ' ' + k + ' ' + m + '@' + t.toFixed(3)); } }
  return { played: log.length, written: want.length, unplayed: want.filter(q => !q.hit).length, extra, bad }; })();
// ---- 2. onsets vs Score, measured in each stem: steepest rise of the log envelope within +-30 ms of the written time
const ONS = ['koto', 'harp', 'pizz', 'ostin', 'bass', 'celesta', 'taiko', 'timp', 'gong', 'cym', 'shaker', 'wood', 'clack', 'reed', 'horn'];
const GROUP = { koto: 'koto', harp: 'harp', pizz: 'pizz', ostin: 'ostin', bass: 'bass', celesta: 'celesta', taiko: 'drums', timp: 'drums', gong: 'metal', cym: 'metal', shaker: 'small', wood: 'small', clack: 'small', reed: 'reed', horn: 'horn' };
const envCache = {}; const H = Math.round(SR * .0005);
// band-limited energy at 0.5 ms: low things from 30 Hz, the rest from 400 Hz (so ringing low partials do not hide a new attack)
function env(st, low) { const key = st.id + low; if (envCache[key]) return envCache[key]; const n = st.L.length, fc = low ? 30 : 400, a = Math.exp(-2 * Math.PI * fc / SR), m = Math.ceil(n / H), E = new Float64Array(m); let p = 0, x1 = 0, p2 = 0, x2 = 0; for (let i = 0; i < n; i++) { const x = (st.L[i] + st.R[i]) * .5, y = a * (p + x - x1); x1 = x; p = y; const z = a * (p2 + y - x2); x2 = y; p2 = z; E[(i / H) | 0] += z * z; }
  const S = new Float64Array(m); let s = 0; for (let k = 0; k < m; k++) { s += .5 * (E[k] - s); S[k] = s; } s = 0; for (let k = m - 1; k >= 0; k--) { s += .5 * (S[k] - s); S[k] = s; } return envCache[key] = S; }
const byId = {}; stems.forEach(s => byId[s.id] = s); const onset = {};
let skipped = 0; for (const tr of ONS) { const errs = []; for (const e of Score.tracks[tr]) { if (tr === 'cym' && e.kind) continue; if (tr === 'horn' && !e.stab) continue; if (tr === 'bass' && !['cave', 'attack', 'climax', 'train'].includes(Score.sec(e.t + 1e-6))) continue;
    const st = byId[Score.sec(e.t + 1e-6) + '.' + GROUP[tr]]; if (!st) continue; const E = env(st, ['timp', 'gong', 'bass'].includes(tr)), k0 = Math.round((e.t - st.t0) * SR / H), w = Math.round(.03 * SR / H), w2 = Math.round(.06 * SR / H), fl0 = Math.max(0, k0 - w - 16); let pk = 0, fl = 0, bk = k0;
    for (let k = k0 - w; k <= k0 + w2 && k < E.length; k++) if (k >= 0) pk = Math.max(pk, E[k]); for (let k = fl0; k < k0 - w; k++) fl += E[k] / Math.max(1, k0 - w - fl0);
    if (pk < fl * 31.6) { skipped++; continue; }                 // under 15 dB of rise over what still rings: not a readable onset
    const thr = fl + (pk - fl) * .1; for (let k = Math.max(0, k0 - w); k <= k0 + w2; k++) if (E[k] >= thr) { bk = k; break; }
    errs.push((bk - k0) * H / SR * 1000); }
  if (!errs.length) continue; const a = errs.map(Math.abs).sort((x, y) => x - y); onset[tr] = { n: errs.length, medMs: r1(a[a.length >> 1]), p95Ms: r1(a[Math.floor(a.length * .95)]), maxMs: r1(a[a.length - 1]) }; }
// ---- 3. the master, with silent stand-ins for the voice and foley lanes (unless --duck: synthetic lines + hits to read the ducks)
const ph = [];
for (const l of Score.lines) { const n = Math.ceil((l.t1 - l.t0 + .4) * SR), pcm = new Float32Array(n); if (has('--duck')) for (const q of l.notes) { const f = 440 * Math.pow(2, (q.midi - 69) / 12), i0 = Math.round((q.t0 - l.t0 + .1) * SR), i1 = Math.round((q.t1 - l.t0 + .1) * SR); for (let i = i0; i < i1 && i < n; i++) { const t = (i - i0) / SR, e = Math.min(1, t / .04, (i1 - i) / SR / .05); let v = 0; for (let h = 1; h < 10; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; pcm[i] = .15 * e * v; } } ph.push({ id: l.id, who: l.who, t0: l.t0 - .1, pcm }); }
Score.sounds.forEach((s, j) => ph.push({ id: 'snd' + j, who: s.who, t0: s.t, pcm: new Float32Array(Math.ceil(s.dur * SR)) }));
if (has('--duck')) for (const e of Score.tracks.hit) { const n = Math.round(.5 * SR), L = new Float32Array(n); let s = 1, p = 0; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; p += .2 * ((s / 2147483647 - .5) - p); L[i] = p * 2 * Math.exp(-i / SR / .12); } ph.push({ id: 'probe.hit', t0: e.t, L, R: L, bus: 'fx' }); }
else ph.push({ id: 'placeholder', t0: 0, L: new Float32Array(SR), R: new Float32Array(SR), bus: 'amb' });
const c1 = cpu(), M = MIX.master(stems.concat(ph), SR, { free: false }), cpuMix = cpu() - c1, rep = M.report;
// ---- 4. read the master
const E = rep.E, LK = e => -.691 + 10 * Math.log10(e + 1e-12), secs = {}, T = Score.T, C = Score.CUE;
const W = MIX.WIN.concat([['loss(hush)', C.SILENCE, T('hatch')], ['alone(hush)', C.ALONE, C.BLUE]]);
for (const [w, a, b] of W) { const i0 = Math.round(a * 10), i1 = Math.round(b * 10), l = MIX.integrated(E.subarray(i0, i1)); let st = -99; for (let k = i0; k + 30 <= i1; k++) { let s = 0; for (let j = k; j < k + 30; j++) s += E[j]; st = Math.max(st, LK(s / 30)); } let pk = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) pk = Math.max(pk, Math.abs(M.L[i]), Math.abs(M.R[i]));
  const bal = bandsOf(spectrum(M.L, M.R, Math.round(a * SR), Math.round(b * SR)), [20, 120, 500, 2000, 6000, 22050]).map(x => Math.round(x * 100)); secs[w] = { lufs: r1(l), maxST: r1(st), peak: r1(dBs(pk)), bands: bal.join('/') }; }
// the hushes: loudest 50 ms inside, from 30 ms after the cut
const hush = {}; for (const h of MIX.HUSH) { let mx = 0; const i0 = Math.round((h.a + .03) * SR), i1 = Math.round((h.b - .07) * SR); for (let i = i0; i < i1; i += 2205) { let s = 0; for (let j = i; j < i + 2205; j++) s += M.L[j] * M.L[j] + M.R[j] * M.R[j]; mx = Math.max(mx, s / 4410); } hush[h.k] = r1(10 * Math.log10(mx + 1e-14)); }
const duck = {}; if (has('--duck')) { const dv = rep.duckV, df = rep.duckF; let s = 0, n = 0, m = 0; for (const l of Score.lines) if (l.sec !== 'loss') for (const q of l.notes) for (let t = q.t0 + .1; t < q.t1; t += .01) { const c = Math.round(t * 100); s += 3.8 * dv[c]; m += 3.8 * dv[c] + 2 * dv[c]; n++; } duck.linesBroadDb = r1(s / n); duck.linesMidDb = r1(m / n); s = 0; n = 0; for (const e of Score.tracks.hit) for (let t = e.t; t < e.t + .2; t += .01) { s += 3 * df[Math.round(t * 100)]; n++; } duck.hitsDb = r1(s / n); }
wav(path.join(OUT, has('--duck') ? 'master_duck.wav' : 'master.wav'), M.L, M.R);
const out = { notesCheck, cpuBand: +cpuBand.toFixed(2), cpuPerSec: +(cpuBand / Score.DUR).toFixed(4), cpuMix: +cpuMix.toFixed(2), lufs: rep.lufs, tp: rep.tp, limiterDb: rep.limiterDb, limitedMs: rep.limitedMs, glueDb: rep.glueDb, pre: rep.pre, hushDbfs: hush, duck, onset, sections: secs, gains: rep.gains, stems: per, t: rep.t };
fs.writeFileSync(path.join(OUT, has('--duck') ? 'report_duck.json' : 'report.json'), JSON.stringify(out, null, 1));
const worst = Object.entries(per).sort((a, b) => b[1].cpu - a[1].cpu).slice(0, 5).map(([k, v]) => k + ' ' + v.cpu).join(', '), hot = Object.entries(per).filter(([k, v]) => v.peak > -2.9 || v.hf6k > 3).map(([k, v]) => k + ' pk' + v.peak + ' hf' + v.hf6k).join(', ');
console.log(`band cpu ${out.cpuBand}s = ${out.cpuPerSec} s/s (top: ${worst}); mix cpu ${out.cpuMix}s\nmaster ${rep.lufs} LUFS, ${rep.tp} dBTP, limiter ${rep.limiterDb} dB over ${rep.limitedMs} ms, glue ${rep.glueDb} dB; hush dBFS ${JSON.stringify(hush)} ${has('--duck') ? 'duck ' + JSON.stringify(duck) : ''}`);
console.log('onset ms (med/p95/max n), ' + skipped + ' masked notes skipped: ' + Object.entries(onset).map(([k, v]) => `${k} ${v.medMs}/${v.p95Ms}/${v.maxMs} ${v.n}`).join(', '));
console.log('section LUFS maxST peak | bands % 20-120/120-500/500-2k/2-6k/>6k:'); for (const [k, v] of Object.entries(secs)) console.log(`  ${k.padEnd(12)} ${String(v.lufs).padStart(6)} ${String(v.maxST).padStart(6)} ${String(v.peak).padStart(6)} | ${v.bands}`);
console.log('notes: ' + JSON.stringify(notesCheck));
console.log('group LU vs loudest group in section:\n  ' + balTxt);
console.log('stems over -3 dBFS or >3% above 6 kHz: ' + (hot || 'none'));
