#!/usr/bin/env node
// master_test.js - the page's sound pipeline in node: every voice, band and foley job -> MIX.master -> qa/master.wav + numbers per section
'use strict';
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
global.Score = require('../src/06_score.js'); const VOICE = require('../src/audio/voice.js'), BAND = require('../src/audio/band.js'), FOLEY = require('../src/audio/foley.js'), MIX = require('../src/audio/mix.js');
const SR = 44100, cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; }; const c0 = cpu(), stems = [], T = {};
for (const [lane, L] of [['voice', VOICE], ['band', BAND], ['foley', FOLEY]]) { const a = cpu(); for (const id of L.jobs()) { const r = L.render(id); r.lane = lane; r.id = r.id || id; delete r.vis; stems.push(r); } T[lane] = +(cpu() - a).toFixed(2); }
const a = cpu(), M = MIX.master(stems, SR, { free: true }); T.mix = +(cpu() - a).toFixed(2); T.total = +(cpu() - c0).toFixed(2);
const n = M.L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(M.L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(M.R[i] * 32767))), 46 + i * 4); }
fs.mkdirSync(path.join(ROOT, 'qa'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'qa', 'master.wav'), b);
const rms = (i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += M.L[i] * M.L[i] + M.R[i] * M.R[i]; return (10 * Math.log10(s / (2 * Math.max(1, i1 - i0)) + 1e-12)).toFixed(1); };
let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(M.L[i]), Math.abs(M.R[i]));
console.log(JSON.stringify({ stems: stems.length, dur: +(n / SR).toFixed(2), cpu: T, lufs: +MIX.integrated(M.L, M.R, SR).toFixed(2), peak_dB: +(20 * Math.log10(pk)).toFixed(2) }));
console.log(Score.SEC.map(s => s.name + ' ' + rms(Math.round(s.t0 * SR), Math.round(s.t1 * SR))).join(' | '));
const C = Score.CUE; console.log('silence ' + rms(Math.round((C.SILENCE + .1) * SR), Math.round((C.DAWN0 - .1) * SR)) + ' alone ' + rms(Math.round((C.ALONE + .05) * SR), Math.round((C.BLUE - .05) * SR)) + ' blue ' + rms(Math.round(C.BLUE * SR), Math.round((C.BLUE + 3) * SR)));
