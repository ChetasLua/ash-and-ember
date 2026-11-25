// node tools/voice_test.js [ids...]   renders VOICE jobs to qa/voice/*.wav (+ .vis.json, .segs.json, meta.json); no ids = everything + all.wav
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'qa/voice');
const Score = require('../src/06_score.js'), VOICE = require('../src/audio/voice.js'), SR = 44100;
function wav(file, x) { const n = x.length, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); fs.writeFileSync(file, b); }
if (!isMainThread) {
  parentPort.on('message', id => { const t0 = performance.now(), r = VOICE.render(id), ms = performance.now() - t0; parentPort.postMessage({ id, r, ms }, [r.pcm.buffer]); });
} else {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2).filter(a => !a.startsWith('-')), todo = ids.length ? ids : VOICE.jobs(), res = {}, queue = todo.slice(), W = Math.min(2, todo.length); let left = todo.length; const wall = performance.now();
  for (let w = 0; w < W; w++) { const k = new Worker(__filename); const next = () => { const id = queue.shift(); if (id) k.postMessage(id); else k.terminate(); }; k.on('message', m => { res[m.id] = m; next(); if (--left === 0) done(); }); k.on('error', e => { console.error(e); process.exit(1); }); next(); }
  function done() {
    let cpu = 0, sec = 0; const rows = [], meta = fs.existsSync(path.join(OUT, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'))) : {};
    for (const id of todo) {
      const { r, ms } = res[id]; wav(path.join(OUT, id + '.wav'), r.pcm);
      const q = a => [...a].map(v => +v.toFixed(3)); fs.writeFileSync(path.join(OUT, id + '.vis.json'), JSON.stringify({ t0: r.vis.t0, dt: .01, jaw: q(r.vis.jaw), round: q(r.vis.round), level: q(r.vis.level), f0: [...r.vis.f0].map(v => +v.toFixed(1)), breath: q(r.vis.breath) }));
      const L = Score.lines.find(l => l.id === id); if (L && L.who !== 'choir') fs.writeFileSync(path.join(OUT, id + '.segs.json'), JSON.stringify(VOICE._.perform(L).segs.map(g => ({ ph: g.ph, t0: +g.t0.toFixed(4), t1: +g.t1.toFixed(4), role: g.role, syl: g.syl }))));
      let pk = 0, bad = 0; for (const v of r.pcm) { if (!(v === v)) bad++; pk = Math.max(pk, Math.abs(v)); } const s = r.pcm.length / SR; cpu += ms / 1000; sec += s;
      const snd = id.startsWith('snd') ? Score.sounds[+id.slice(3)] : null; meta[id] = { id, who: r.who, kind: snd ? snd.kind + (snd.tiny ? '.tiny' : snd.soft ? '.soft' : snd.fake ? '.fake' : snd.last ? '.last' : snd.smile ? '.smile' : '') : 'line', t: snd ? snd.t : L.t0, t0: r.t0, dur: s, cpu: ms / 1000 };
      rows.push(`${id.padEnd(6)} ${(r.who + ' ' + (snd ? snd.kind : '')).padEnd(15)} t0 ${r.t0.toFixed(2).padStart(7)} ${s.toFixed(2).padStart(5)} s pk ${(20 * Math.log10(pk + 1e-9)).toFixed(1).padStart(6)}  ${(ms / 1000).toFixed(2)} cpu ${(ms / 1000 / s).toFixed(3)}/s${bad ? ' NaN ' + bad : ''}`);
    }
    fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
    console.log(rows.join('\n')); console.log(`total ${sec.toFixed(1)} s audio, ${cpu.toFixed(2)} s cpu = ${(cpu / sec).toFixed(3)} per s audio, ${(cpu / Score.DUR).toFixed(3)} per film s; wall ${((performance.now() - wall) / 1000).toFixed(1)} s on 2 threads`);
    if (!ids.length) { const all = new Float32Array(Math.ceil((Score.DUR + 3) * SR)); for (const id of todo) { const { r } = res[id], n0 = Math.round(r.t0 * SR); for (let i = 0; i < r.pcm.length; i++) if (n0 + i >= 0 && n0 + i < all.length) all[n0 + i] += r.pcm[i]; } let pk = 0; for (const v of all) pk = Math.max(pk, Math.abs(v)); if (pk > .98) for (let i = 0; i < all.length; i++) all[i] *= .98 / pk; wav(path.join(OUT, 'all.wav'), all); }
  }
}
