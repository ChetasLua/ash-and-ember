'use strict';
// ---- THE SCORE of ASH & EMBER: the one clock. Every note, word and story beat in film seconds. Picture and sound read nothing else. ----------
// Runs in the page, in a Worker and in node.  Sections change tempo and metre; use Score.T(section, bar, beat) for any time.
//   Score.DUR 140   Score.SEC [{name,t0,bpm,meter,bars,t1,key}]   Score.secAt(t) -> {name, bar, beat, f(0..1 in section), sec}
//   Score.tracks.NAME   sorted events {t, d, m, v, ...}.  Instruments: koto flute harp strings pizz ostin bass celesta choir horn reed
//                       taiko timp gong cym shaker wood clack.   Story: flap_pair flap_cinder flap_ash flap_ember step_ember step_ash
//                       puff cough crack lava bolt hit fall sneeze stroke spark
//   Score.lines         sung lines in the voice format: {id, who:'noct'|'lune'|'ash'|'choir', sec, feel, notes:[{syl, ph:[ARPAbet], midi, t0, t1}], t0, t1}
//   Score.sounds        creature voices: {t, dur, kind, who}   (ember: chirp squeak sneeze cough yawn whimper giggle gasp  ash: hrmph cough wheeze grunt laugh roar groan
//                                                              pair: call coo roar cry   cinder: roar snarl screech)
//   Score.CUE           named story times (seconds)        Score.chordAt(t) {name, notes, root}
//   Score.env(track,t,decay) Score.recent(track,t,w) Score.last/next(track,t) Score.beat(t) Score.level(t) Score.sing(t,who) Score.live(track,ev)
const Score = (() => {
  const S = {};
  // ---------- tempo map ----------------------------------------------------------------------------------------------------------------
  const SEC = S.SEC = [
    { name: 'ink',     bpm: 72,  meter: 3, bars: 4,  key: 'D dorian' },  // the world is painted
    { name: 'love',    bpm: 90,  meter: 3, bars: 10, key: 'D' },         // two flying at sunset, the heart
    { name: 'nest',    bpm: 90,  meter: 3, bars: 4,  key: 'D' },         // the egg, the lullaby hummed
    { name: 'attack',  bpm: 132, meter: 4, bars: 10, key: 'D minor' },   // the volcano, Cinder, the fight
    { name: 'loss',    bpm: 60,  meter: 3, bars: 2,  key: 'D minor' },   // silence, ash, a ghost of the song
    { name: 'hatch',   bpm: 72,  meter: 3, bars: 4,  key: 'D' },         // dawn, three cracks, Ember
    { name: 'cave',    bpm: 100, meter: 4, bars: 6,  key: 'G' },         // the old smoker
    { name: 'shelter', bpm: 72,  meter: 3, bars: 5,  key: 'D' },         // rain, the wing, the song he knew
    { name: 'train',   bpm: 132, meter: 4, bars: 5,  key: 'E minor' },   // falling, trying, a glide
    { name: 'climax',  bpm: 132, meter: 4, bars: 9,  key: 'D minor > E' }, // Cinder again, Ash falls, BLUE FIRE
    { name: 'dawn',    bpm: 90,  meter: 3, bars: 7,  key: 'E' }];        // his fire returns, the second heart, ink, seal
  let t = 0; for (const s of SEC) { s.t0 = t; s.beatS = 60 / s.bpm; s.barS = s.beatS * s.meter; s.t1 = t + s.barS * s.bars; t = s.t1; }
  const DUR = S.DUR = 140.0; S.T_END = SEC[SEC.length - 1].t1;            // 138.536: the seal; then 1.46 s of the paper
  const byName = {}; SEC.forEach(s => byName[s.name] = s); S.byName = byName;
  const T = S.T = (name, bar = 0, beat = 0) => { const s = byName[name]; return s.t0 + (bar * s.meter + beat) * s.beatS; };
  S.secAt = t => { let s = SEC[0]; for (const q of SEC) if (t >= q.t0) s = q; const x = (t - s.t0) / s.beatS, bar = Math.floor(x / s.meter); return { name: s.name, sec: s, bar, beat: x - bar * s.meter, f: Math.max(0, Math.min(1, (t - s.t0) / (s.t1 - s.t0))) }; };
  S.sec = t => S.secAt(t).name;

  // ---------- harmony: one chord per bar (or two) ----------------------------------------------------------------------------------------------
  const CH = { Dm9: [38, 50, 57, 62, 64, 65, 69, 72], Am7: [45, 52, 57, 60, 64, 67, 69, 72], C: [36, 48, 55, 60, 64, 67, 72, 76], Dsus2: [38, 50, 57, 62, 64, 69, 74, 76],
    D: [38, 50, 57, 62, 66, 69, 74, 78], Bm: [35, 47, 54, 59, 62, 66, 71, 74], G: [43, 50, 55, 59, 62, 67, 71, 74], A: [45, 52, 57, 61, 64, 69, 73, 76], Asus: [45, 52, 57, 62, 64, 69, 74, 76], Fsm: [42, 49, 54, 57, 61, 66, 69, 73], DF: [42, 50, 57, 62, 66, 69, 74, 78],
    Dm: [38, 50, 57, 62, 65, 69, 74, 77], Bb: [34, 46, 53, 58, 62, 65, 70, 74], Gm: [43, 50, 55, 58, 62, 67, 70, 74], A7: [45, 52, 57, 61, 64, 67, 73, 76], Bb9: [34, 46, 53, 58, 60, 62, 65, 70],
    Em: [40, 52, 55, 59, 64, 67, 71, 76], D7: [38, 50, 54, 57, 60, 62, 66, 72], B7: [35, 47, 54, 57, 63, 66, 69, 75], E: [40, 52, 56, 59, 64, 68, 71, 76], Csm: [37, 49, 56, 61, 64, 68, 73, 76], Bmaj: [35, 47, 54, 59, 63, 66, 71, 75], Cs: [37, 49, 56, 61, 65, 68, 73, 77], NC: [] };
  const PROG = {
    ink: ['Dm9', 'Am7', 'C', 'Dsus2'], love: ['D', 'Bm', 'G', 'A', 'D', 'Fsm', 'G', 'A', 'G', 'D'], nest: ['D', 'G', 'DF', 'Asus'],
    attack: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A7', 'Dm', 'A'], loss: ['Dm9', 'Bb9'], hatch: ['D', 'G', 'D', 'Asus'],
    cave: ['G', 'C', 'D7', 'G', 'Em', 'D7'], shelter: ['D', 'Bm', 'G', 'A', 'D'], train: ['Em', 'C', 'D', 'B7', 'Em'],
    climax: ['Dm', 'Bb', 'C', 'A', 'NC', 'E', 'Csm', 'A', 'Bmaj'], dawn: ['E', 'Csm', 'A', 'Bmaj', 'E', 'A', 'E'] };
  const chords = []; for (const s of SEC) PROG[s.name].forEach((n, b) => chords.push({ t: T(s.name, b), d: s.barS, name: n, notes: CH[n], sec: s.name, bar: b }));
  S.chordAt = t => { let c = chords[0]; for (const q of chords) if (q.t <= t + 1e-6) c = q; return { name: c.name, notes: c.notes, root: c.notes[0], bar: c.bar, sec: c.sec }; };
  S.scaleAt = t => { const n = S.sec(t); return n === 'attack' || n === 'loss' || (n === 'climax' && t < T('climax', 5)) ? [50, 52, 53, 55, 57, 60] : n === 'train' ? [52, 54, 55, 57, 59, 62] : n === 'cave' ? [55, 57, 59, 62, 64] : n === 'dawn' || (n === 'climax') ? [52, 54, 56, 59, 61] : [50, 52, 54, 57, 59]; };
  S.quant = (m, t) => { const sc = S.scaleAt(t); let best = m, bd = 99; for (let o = -2; o <= 4; o++) for (const q of sc) { const k = q + o * 12, d = Math.abs(k - m); if (d < bd) { bd = d; best = k; } } return best; };

  // ---------- tracks ---------------------------------------------------------------------------------------------------------------------
  const names = ['chord', 'koto', 'flute', 'harp', 'strings', 'pizz', 'ostin', 'bass', 'celesta', 'choir', 'horn', 'reed', 'taiko', 'timp', 'gong', 'cym', 'shaker', 'wood', 'clack', 'riser',
    'flap_pair', 'flap_cinder', 'flap_ash', 'flap_ember', 'step_ember', 'step_ash', 'puff', 'cough', 'crack', 'lava', 'bolt', 'hit', 'fall', 'sneeze', 'stroke', 'spark'];
  const TR = S.tracks = {}; names.forEach(n => TR[n] = []); chords.forEach(c => TR.chord.push({ t: c.t, d: c.d, m: c.notes[0] || 0, v: 1, name: c.name, notes: c.notes, sec: c.sec, bar: c.bar }));
  const add = (tr, t, d, m, v, x) => { const e = Object.assign({ t, d, m, v }, x); TR[tr].push(e); return e; };
  const at = (sec, bar, beat) => T(sec, bar, beat), bs = sec => byName[sec].beatS;
  const chAt = (sec, bar) => CH[PROG[sec][bar]];

  // ---- INK: shakuhachi over guzheng; every pluck is a brush stroke (track 'stroke' carries the stroke index for the painted loong)
  { const s = 'ink', fl = [[0, 0, 2.6, 69], [0, 2.6, .4, 67], [1, 0, 1.5, 65], [1, 1.5, 1.5, 64], [2, 0, 2, 62], [2, 2, 1, 60], [3, 0, 3, 62]];
    fl.forEach(n => add('flute', at(s, n[0], n[1]), n[2] * bs(s), n[3], .7, { sec: s, breathy: 1 }));
    const pl = [[0, 0, 50], [0, 1, 57], [0, 2, 62], [1, 0, 57], [1, .5, 64], [1, 1.5, 69], [1, 2, 72], [2, 0, 60], [2, 1, 67], [2, 2, 72], [2, 2.5, 76], [3, 0, 62], [3, 1, 69], [3, 1.5, 74], [3, 2, 76], [3, 2.5, 81]];
    pl.forEach((n, i) => { add('koto', at(s, n[0], n[1]), 2.2, n[2], .55 + .3 * (n[1] === 0), { sec: s, r: i % 8 }); add('stroke', at(s, n[0], n[1]), .5, n[2], 1, { i }); });
    add('gong', at(s, 0), 6, 38, .5); add('gong', at(s, 3, 2), 4, 45, .35); add('riser', at(s, 3), byName.ink.barS, 0, .6); }
  // ---- LOVE: waltz. harp arpeggios (the sea glitters on them), strings, the duet; downstroke of both wings on beat 1
  { const s = 'love', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b);
      for (let i = 0; i < 6; i++) add('harp', at(s, b, i / 2), 1.6, c[[1, 3, 4, 5, 6, 5][i]], i === 0 ? .7 : .45, { sec: s, r: i });
      add('bass', at(s, b), S_.barS * .9, c[0], .8); add('strings', at(s, b), S_.barS, c[1], b < 2 ? .35 : b < 8 ? .55 : .8, { notes: c.slice(2, 6) });
      add('flap_pair', at(s, b), S_.beatS * 1.2, 0, b < 8 ? .8 : .5, { who: 'both' }); if (b % 2 === 1) add('flap_pair', at(s, b, 2), S_.beatS, 0, .45, { who: b % 4 === 1 ? 'noct' : 'lune' });
      if (b >= 2) add('shaker', at(s, b, 1), .1, 0, .25), add('shaker', at(s, b, 2), .1, 0, .25); }
    add('cym', at(s, 9), 4, 0, .5, { kind: 'swell' }); add('celesta', at(s, 9), 2, 86, .6); add('celesta', at(s, 9, .5), 2, 81, .5); add('celesta', at(s, 9, 1), 2, 78, .5); }
  // ---- NEST: the lullaby hummed (voice) over celesta and soft strings; the egg glows on each hummed note
  { const s = 'nest', S_ = byName[s]; for (let b = 0; b < 4; b++) { const c = chAt(s, b); add('strings', at(s, b), S_.barS, c[1], .35, { notes: c.slice(2, 5) }); add('bass', at(s, b), S_.barS, c[0], .45); for (let i = 0; i < 3; i++) add('celesta', at(s, b, i), 1.2, c[3 + i], .32 + .1 * (i === 0)); } }
  // ---- ATTACK: taiko + timpani, a running string ostinato, horn stabs; lava bursts on taiko accents, lightning on cymbals
  { const s = 'attack', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b), last = b === S_.bars - 1;
      for (let i = 0; i < 8; i++) add('ostin', at(s, b, i / 2), S_.beatS * .45, c[[1, 2, 3, 2, 1, 2, 4, 3][i]], i % 4 === 0 ? .9 : .6, { sec: s });
      add('bass', at(s, b), S_.barS * .5, c[0], 1); add('bass', at(s, b, 2.5), S_.beatS, c[0], .7);
      add('taiko', at(s, b), .6, 0, 1, { sz: 1.2 }); add('taiko', at(s, b, 1.5), .5, 0, .6, { sz: 1 }); add('taiko', at(s, b, 2), .5, 0, .8, { sz: 1.1 }); add('taiko', at(s, b, 3.5), .4, 0, .55, { sz: .9 });
      if (b % 2 === 0) add('lava', at(s, b), 1.5, 0, b < 3 ? .7 : 1); add('lava', at(s, b, 2), 1, 0, .5);
      if (b >= 2) add('strings', at(s, b), S_.barS, c[1], .8, { notes: c.slice(2, 6), trem: 1 });
      if (b === 1 || b === 3 || b === 5 || b === 7) { add('horn', at(s, b, 3), S_.beatS * .9, c[3], 1, { stab: 1 }); add('cym', at(s, b + 1), 2.5, 0, .8); add('bolt', at(s, b + 1) - .03, .4, 0, 1); }
      if (b >= 4) add('choir', at(s, b), S_.barS, c[2], .7 + .05 * b, { notes: c.slice(3, 6), vowel: 'ah' });
      add('flap_cinder', at(s, b), S_.beatS * 2, 0, 1); add('flap_cinder', at(s, b, 2), S_.beatS * 2, 0, .8);
      if (b >= 3 && b <= 8) { add('flap_pair', at(s, b), S_.beatS, 0, 1, { who: 'lune' }); add('flap_pair', at(s, b, 1), S_.beatS, 0, 1, { who: 'noct' }); add('flap_pair', at(s, b, 2), S_.beatS, 0, .8, { who: 'lune' }); add('flap_pair', at(s, b, 3), S_.beatS, 0, .8, { who: 'noct' }); }
      if (last) { add('timp', at(s, b), S_.barS, 38, 1, { roll: 1 }); } }
    add('gong', at(s, 0), 5, 36, 1); add('timp', at(s, 0), .8, 38, 1); add('horn', at(s, 0), S_.barS * 2, 50, .9);
    [[3, 0], [3, 2], [4, 1], [5, 0], [5, 3], [6, 2], [7, 0], [7, 2.5], [8, 0]].forEach(q => add('hit', at(s, q[0], q[1]), .3, 0, 1));
    add('cym', at(s, 9, 2), 3, 0, 1); add('riser', at(s, 8), S_.barS * 2, 0, 1); }
  // ---- LOSS: almost nothing. a low pedal, rain, the ghost of the hum broken off
  { const s = 'loss'; add('strings', at(s, 0), byName[s].barS * 2, 38, .22, { notes: [50, 57, 62], ghost: 1 }); add('celesta', at(s, 1, 1), 3, 62, .2); }
  // ---- HATCH: a music box plays the lullaby; the egg cracks on its notes; the hatch on 'ber'; the sneeze on a stinger
  { const s = 'hatch', S_ = byName[s], mb = [[0, 0, 2, 69], [0, 2, 1, 66], [1, 0, 1, 67], [1, 1, 1, 69], [1, 2, 1, 71], [2, 0, 2, 69], [2, 2, 1, 66], [3, 0, 2.5, 64]];
    mb.forEach(n => add('celesta', at(s, n[0], n[1]), n[2] * S_.beatS + .6, n[3] + 12, .62, { box: 1 }));
    for (let b = 0; b < 4; b++) { const c = chAt(s, b); add('harp', at(s, b), 2, c[1], .35); add('strings', at(s, b), S_.barS, c[1], b < 2 ? .25 : .45, { notes: c.slice(2, 5) }); }
    [[0, 2], [1, 0], [1, 1]].forEach((q, i) => add('crack', at(s, q[0], q[1]), .3, 0, .5 + .25 * i, { n: i }));
    add('crack', at(s, 1, 2), .5, 0, 1.2, { n: 3, hatch: 1 }); add('cym', at(s, 1, 2), 3, 0, .4, { kind: 'shimmer' });
    add('sneeze', at(s, 3, 2) + .1, .4, 0, 1); add('wood', at(s, 3, 2) + .1, .1, 0, .8, { hi: 1, stinger: 1 }); }
  // ---- CAVE: a comic walk. pizzicato, a reed (bassoon-like) for the old smoker, brushes. every puff is a reed note
  { const s = 'cave', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b);
      for (let i = 0; i < 4; i++) { add('pizz', at(s, b, i), .3, i % 2 ? c[2] : c[1], i === 0 ? .8 : .55); add('shaker', at(s, b, i + .5), .08, 0, .28); }
      add('bass', at(s, b), S_.beatS * .8, c[0], .8); add('bass', at(s, b, 2), S_.beatS * .8, c[1] - 12 > 30 ? c[1] - 12 : c[0], .7); add('wood', at(s, b, 1), .1, 0, .45); add('wood', at(s, b, 3), .1, 0, .45, { hi: 1 }); }
    const R = [[0, 2, 1, 50], [0, 3, .5, 47], [1, 2, 2, 48], [2, .5, .5, 45], [2, 1, .5, 47], [2, 1.5, 1, 50], [3, 2, .5, 55], [3, 2.5, .5, 50], [3, 3, 1, 43], [4, 1, .5, 47], [4, 1.5, .5, 45], [5, 0, 2, 50], [5, 3, 1, 43]];
    R.forEach(n => add('reed', at(s, n[0], n[1]), n[2] * S_.beatS, n[3], .75));
    [[1, 0], [2, 0], [3, 2], [5, 0]].forEach((q, i) => add('puff', at(s, q[0], q[1]), .8, 0, i === 1 ? 1.2 : .8, { ring: i === 3 }));
    add('cough', at(s, 2, 1.5), .9, 0, 1, { who: 'ember' }); add('cough', at(s, 3, 2.5), .5, 0, .5, { who: 'ember', fake: 1 });
    for (let i = 0; i < 8; i++) add('step_ember', at(s, 0, i * .5), .2, 0, .6);
    add('spark', at(s, 4, 3), .5, 0, .6, { kind: 'flint' }); add('sneeze', at(s, 5, 1), .4, 0, 1, { lights: 1 }); add('wood', at(s, 5, 1), .1, 0, .9, { hi: 1, stinger: 1 }); add('cym', at(s, 5, 1), 1.5, 0, .3, { kind: 'shimmer' }); }
  // ---- SHELTER: rain, harp drops, the old voice hums then sings; strings warm under the wing
  { const s = 'shelter', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b); add('strings', at(s, b), S_.barS, c[1], b < 1 ? .25 : .5, { notes: c.slice(2, 5) }); add('bass', at(s, b), S_.barS, c[0], .5);
      [0, 1.5, 2].forEach((i, k) => add('harp', at(s, b, i), 2, c[4 + k], .28)); }
    add('celesta', at(s, 4, 2), 3, 74, .3); }
  // ---- TRAIN: running eighths, taiko and pizz; each fall on a stinger, the glide on a rising horn
  { const s = 'train', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b);
      for (let i = 0; i < 8; i++) add('ostin', at(s, b, i / 2), S_.beatS * .4, c[[1, 3, 2, 3, 1, 3, 4, 3][i]], i % 2 ? .45 : .7, { sec: s, light: 1 });
      add('taiko', at(s, b), .5, 0, .7, { sz: 1 }); add('taiko', at(s, b, 2), .5, 0, .55, { sz: .9 }); add('bass', at(s, b), S_.barS * .5, c[0], .8);
      for (let i = 0; i < 4; i++) add('pizz', at(s, b, i + .5), .25, c[2] + 12, .4); }
    [[0, 3], [1, 3], [2, 3]].forEach((q, i) => { add('fall', at(s, q[0], q[1]), .5, 0, 1, { n: i }); add('wood', at(s, q[0], q[1]), .1, 0, .9, { stinger: 1 }); });
    add('puff', at(s, 3, 1), .6, 0, .7, { who: 'ember' }); add('horn', at(s, 4), S_.barS, 64, .9, { swell: 1 }); add('cym', at(s, 4), 3, 0, .5, { kind: 'swell' }); add('strings', at(s, 4), S_.barS, 52, .9, { notes: [59, 64, 67, 71] });
    for (let i = 0; i < 6; i++) add('step_ember', at(s, 0, i / 2 + .5), .2, 0, .7); }
  // ---- CLIMAX: attack again, then the hole (bar 4), then E major: choir, horns, every voice; blue fire from bar 5
  { const s = 'climax', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b); if (b === 4) continue; const blue = b >= 5;
      for (let i = 0; i < 8; i++) add('ostin', at(s, b, i / 2), S_.beatS * .45, c[[1, 2, 3, 2, 1, 2, 4, 3][i]], i % 4 === 0 ? .95 : .6, { sec: s, bright: blue ? 1 : 0 });
      add('bass', at(s, b), S_.barS * .5, c[0], 1); add('taiko', at(s, b), .6, 0, 1, { sz: 1.25 }); add('taiko', at(s, b, 2), .5, 0, .85, { sz: 1.1 }); add('taiko', at(s, b, 3.5), .4, 0, .6);
      add('strings', at(s, b), S_.barS, c[1], blue ? 1 : .8, { notes: c.slice(2, 6), trem: blue ? 0 : 1 });
      if (blue) { add('choir', at(s, b), S_.barS, c[2], 1, { notes: c.slice(3, 7), vowel: 'ah' }); add('horn', at(s, b), S_.barS, c[3], .95); add('flap_ember', at(s, b), S_.beatS, 0, .8); add('flap_ember', at(s, b, 2), S_.beatS, 0, .8); }
      else { add('lava', at(s, b), 1.4, 0, 1); add('flap_cinder', at(s, b), S_.beatS * 2, 0, 1); add('flap_cinder', at(s, b, 2), S_.beatS * 2, 0, .8); } }
    add('gong', at(s, 0), 4, 36, 1); add('cym', at(s, 1), 2, 0, .8); add('bolt', at(s, 1) - .03, .4, 0, 1); add('hit', at(s, 2, 2), .5, 0, 1.3, { who: 'ash' }); add('timp', at(s, 2, 2), 1, 38, 1);
    add('cym', at(s, 3), 2, 0, .7); add('riser', at(s, 4), S_.barS, 0, .7, { breath: 1 });
    add('gong', at(s, 5), 6, 40, 1); add('cym', at(s, 5), 4, 0, 1); add('timp', at(s, 5), .8, 40, 1); add('celesta', at(s, 5), 2, 88, .6);
    add('hit', at(s, 8), .6, 0, 1.2, { petrify: 1 }); add('cym', at(s, 8, 2), 4, 0, .8); add('timp', at(s, 8, 2), 2, 40, 1, { roll: 1 }); }
  // ---- DAWN: E major waltz; his fire on bar 2; flight; the second heart closes on 'side'; the joke; the seal
  { const s = 'dawn', S_ = byName[s];
    for (let b = 0; b < S_.bars; b++) { const c = chAt(s, b);
      for (let i = 0; i < 6; i++) add('harp', at(s, b, i / 2), 1.6, c[[1, 3, 4, 5, 6, 5][i]], i === 0 ? .7 : .45, { sec: s, r: i });
      add('bass', at(s, b), S_.barS * .9, c[0], .8); add('strings', at(s, b), S_.barS, c[1], b < 2 ? .45 : .8, { notes: c.slice(2, 6) });
      if (b >= 3 && b <= 5) { add('flap_ember', at(s, b), S_.beatS, 0, .9); add('flap_ash', at(s, b), S_.beatS * 1.3, 0, .9); add('choir', at(s, b), S_.barS, c[2], .6, { notes: c.slice(3, 6), vowel: 'oo' }); } }
    add('koto', at(s, 2), 2.4, 64, .9); add('cym', at(s, 2), 2, 0, .4, { kind: 'shimmer' }); add('celesta', at(s, 6), 2, 88, .5); add('celesta', at(s, 6, .5), 2, 83, .5);
    add('puff', at(s, 6, 1), .5, 0, .8, { who: 'ember', blue: 1 }); add('wood', at(s, 6, 1), .1, 0, .6, { hi: 1 });
    add('flute', at(s, 6, 1.5), 1.6, 76, .5, { breathy: 1 }); add('clack', S.T_END, .3, 0, 1, { seal: 1 }); add('gong', S.T_END, 4, 40, .4); }
  // ---- feet for the hatchling's first walk, the old one's shuffle
  for (let i = 0; i < 6; i++) add('step_ember', T('hatch', 2, 1.5) + i * .36, .15, 0, .45);
  for (let i = 0; i < 6; i++) add('step_ash', T('shelter', 1) + i * .62, .3, 0, .5);
  for (let i = 0; i < 8; i++) add('step_ember', T('dawn', 0, 1) + i * .3, .15, 0, .7);

  // ---------- the song (sung lines, voice format) ---------------------------------------------------------------------------------------------
  const lines = S.lines = []; const N = (syl, ph, midi, sec, bar, beat, beats) => ({ syl, ph: ph.split(' '), midi, t0: T(sec, bar, beat), t1: T(sec, bar, beat + beats) });
  const line = (id, who, sec, feel, notes) => lines.push({ id, who, sec, feel, notes, t0: notes[0].t0, t1: notes[notes.length - 1].t1 });
  // love: the duet. he (Noct) asks, she (Lune) answers, together on the heart; 'flame' lands on bar 9 = the heart closes
  line('d1', 'noct', 'love', { dyn: -4, breath: .25, smile: .7, vib: .45, note: 'young, warm, showing off a little while he flies' }, [
    N('fly', 'F L AY', 57, 'love', 2, 0, 1), N('with', 'W IH DH', 59, 'love', 2, 1, 1), N('me', 'M IY', 62, 'love', 2, 2, 1), N('where', 'W EH R', 62, 'love', 3, 0, 1), N('the', 'DH AH', 64, 'love', 3, 1, .5), N('sky', 'S K AY', 66, 'love', 3, 1.5, 1.5), N('is', 'IH Z', 64, 'love', 4, 0, 1), N('gold', 'G OW L D', 62, 'love', 4, 1, 2)]);
  line('d2', 'lune', 'love', { dyn: -4, breath: .3, smile: .9, vib: .5, note: 'light, teasing, she is faster than him' }, [
    N('hold', 'HH OW L D', 69, 'love', 5, 0, 1), N('me', 'M IY', 71, 'love', 5, 1, 1), N('close', 'K L OW S', 74, 'love', 5, 2, 1), N('when', 'W EH N', 73, 'love', 6, 0, 1), N('the', 'DH AH', 71, 'love', 6, 1, .5), N('wind', 'W IH N D', 69, 'love', 6, 1.5, 1.5), N('is', 'IH Z', 71, 'love', 7, 0, 1), N('cold', 'K OW L D', 66, 'love', 7, 1, 2)]);
  line('d3', 'noct', 'love', { dyn: -2, breath: .2, smile: .8, vib: .5, note: 'together, he a sixth under' }, [N('two', 'T UW', 57, 'love', 8, 0, 1), N('hearts', 'HH AA R T S', 59, 'love', 8, 1, 1), N('one', 'W AH N', 61, 'love', 8, 2, 1), N('flame', 'F L EY M', 62, 'love', 9, 0, 3)]);
  line('d3h', 'lune', 'love', { dyn: -2, breath: .25, smile: .9, vib: .55, note: 'on top; "flame" opens as the heart closes' }, [N('two', 'T UW', 66, 'love', 8, 0, 1), N('hearts', 'HH AA R T S', 67, 'love', 8, 1, 1), N('one', 'W AH N', 69, 'love', 8, 2, 1), N('flame', 'F L EY M', 74, 'love', 9, 0, 3)]);
  // nest: she hums the lullaby to the egg (MM = hummed nucleus). 'light' never comes: the volcano takes the downbeat
  line('h1', 'lune', 'nest', { dyn: -11, breath: .4, hum: true, vib: .3, note: 'hummed, close, to the egg' }, [
    N('mm', 'M MM', 69, 'nest', 0, 0, 2), N('mm', 'M MM', 66, 'nest', 0, 2, 1), N('mm', 'M MM', 67, 'nest', 1, 0, 1), N('mm', 'M MM', 69, 'nest', 1, 1, 1), N('mm', 'M MM', 71, 'nest', 1, 2, 1), N('mm', 'M MM', 69, 'nest', 2, 0, 2), N('mm', 'M MM', 67, 'nest', 2, 2, 1), N('mm', 'M MM', 66, 'nest', 3, 0, 2.6)]);
  // loss: a ghost of her voice, far away, breaking on 'em-'
  line('g1', 'lune', 'loss', { dyn: -16, breath: .7, ghost: true, vib: .2, tremor: .5, broken: true, note: 'far away, already gone; stops dead inside "em"' }, [
    N('sleep', 'S L IY P', 69, 'loss', 0, 0, 2), N('lit', 'L IH', 66, 'loss', 0, 2, 1), N('tle', 'T AH L', 67, 'loss', 1, 0, 1), N('em', 'EH M', 69, 'loss', 1, 1, .55)]);
  // shelter: the old one hums, then sings a line of HER song. he knew them.
  line('a1', 'ash', 'shelter', { dyn: -12, breath: .6, hum: true, age: 1, vib: .2, tremor: .5, note: 'gravel, smoke, hummed to the rain, not to her' }, [
    N('mm', 'M MM', 57, 'shelter', 1, 0, 2), N('mm', 'M MM', 54, 'shelter', 1, 2, 1), N('mm', 'M MM', 55, 'shelter', 2, 0, 1), N('mm', 'M MM', 57, 'shelter', 2, 1, .9)]);
  line('a2', 'ash', 'shelter', { dyn: -9, breath: .5, age: 1, vib: .25, tremor: .6, crack: true, note: 'sung for her now, an octave down; the voice cracks on "song"' }, [
    N('your', 'Y AO R', 52, 'shelter', 2, 2, 1), N('fire', 'F AY ER', 57, 'shelter', 3, 0, 1.5), N('is', 'IH Z', 55, 'shelter', 3, 1.5, .5), N('the', 'DH AH', 54, 'shelter', 3, 2, .5), N('heart', 'HH AA R T', 59, 'shelter', 3, 2.5, 1),
    N('of', 'AH V', 57, 'shelter', 4, 0, .5), N('a', 'AH', 55, 'shelter', 4, .5, .5), N('mo', 'M AH', 54, 'shelter', 4, 1, .5), N('ther\'s', 'DH ER Z', 52, 'shelter', 4, 1.5, .5), N('song', 'S AO NG', 50, 'shelter', 4, 2, 1)]);
  // climax: BLUE FIRE. choir + the two ghosts + every voice, broad half notes over the drums (E major)
  const BR = [['breathe', 'B R IY DH', 71], ['lit', 'L IH', 68], ['tle', 'T AH L', 69], ['em', 'EH M', 71], ['ber', 'B ER', 73], ['breathe', 'B R IY DH', 71], ['my', 'M AY', 69], ['light', 'L AY T', 66]];
  const brLine = (id, who, x, feel) => line(id, who, 'climax', feel, BR.map((q, i) => N(q[0], q[1], q[2] + x, 'climax', 5 + Math.floor(i / 2), (i % 2) * 2, 2)));
  brLine('c1', 'lune', 0, { dyn: 0, breath: .15, ghost: true, effort: .6, vib: .5, note: 'her voice from the sky, full now' });
  brLine('c2', 'noct', -12, { dyn: -1, breath: .15, ghost: true, effort: .6, vib: .45, note: 'his, under her' });
  brLine('c3', 'choir', 0, { dyn: -3, vowel: 'ah', note: 'the choir carries the words, octaves' });
  // dawn: the last line, the old one and both ghosts together; the second heart closes on 'side'
  const WE = [['we', 'W IY', 68, 3, 0, 1], ['are', 'AA R', 69, 3, 1, 1], ['the', 'DH AH', 71, 3, 2, 1], ['fire', 'F AY ER', 76, 4, 0, 2], ['we', 'W IY', 73, 4, 2, 1], ['are', 'AA R', 71, 5, 0, 1], ['by', 'B AY', 69, 5, 1, 1], ['your', 'Y AO R', 68, 5, 2, 1], ['side', 'S AY D', 64, 6, 0, 3]];
  const weLine = (id, who, x, feel) => line(id, who, 'dawn', feel, WE.map(q => N(q[0], q[1], q[2] + x, 'dawn', q[3], q[4], q[5])));
  weLine('w1', 'ash', -12, { dyn: -4, breath: .35, age: 1, vib: .3, smile: .6, note: 'the old voice, smiling, steady now' }); weLine('w2', 'lune', 0, { dyn: -6, breath: .3, ghost: true, vib: .5, smile: .8 }); weLine('w3', 'noct', -12, { dyn: -8, breath: .3, ghost: true, vib: .45, smile: .7 });
  lines.sort((a, b) => a.t0 - b.t0);

  // ---------- creature voices (not sung): every one is placed on the picture's beat ---------------------------------------------------
  const sounds = S.sounds = []; const V = (t, dur, who, kind, x) => sounds.push(Object.assign({ t, dur, who, kind }, x));
  V(T('love', 0, 1.5), .7, 'lune', 'call'); V(T('love', 1, 1), .6, 'noct', 'call'); V(T('love', 9, 2), .8, 'lune', 'coo'); V(T('nest', 3, 1), .8, 'noct', 'coo');
  V(T('attack', 1), 1.6, 'cinder', 'roar'); V(T('attack', 3, 1), .9, 'lune', 'roar'); V(T('attack', 4, 2), 1.0, 'cinder', 'snarl'); V(T('attack', 6), .8, 'noct', 'roar'); V(T('attack', 7, 2), 1.2, 'cinder', 'screech'); V(T('attack', 9, 1), 1.2, 'lune', 'cry');
  V(T('hatch', 2, 0) + .2, .5, 'ember', 'squeak'); V(T('hatch', 2, 2), .6, 'ember', 'chirp'); V(T('hatch', 3, 0), .5, 'ember', 'chirp'); V(T('hatch', 3, 2) + .1, .45, 'ember', 'sneeze'); V(T('hatch', 3, 2) + .7, .6, 'ember', 'giggle');
  V(T('cave', 0, 2), .4, 'ember', 'chirp'); V(T('cave', 1, 1), .8, 'ash', 'hrmph'); V(T('cave', 2, 1.5), 1.0, 'ember', 'cough'); V(T('cave', 2, 3), .6, 'ash', 'grunt'); V(T('cave', 3, 2.5), .5, 'ember', 'cough', { fake: 1 });
  V(T('cave', 4, 1), 1.0, 'ash', 'wheeze'); V(T('cave', 5, 1), .4, 'ember', 'sneeze'); V(T('cave', 5, 2), .9, 'ash', 'laugh', { tiny: 1 });
  V(T('shelter', 0, 1), 1.2, 'ember', 'whimper'); V(T('shelter', 4, 1), 1.2, 'ember', 'yawn');
  V(T('train', 0, 3) + .05, .35, 'ember', 'squeak'); V(T('train', 1, 3) + .05, .35, 'ember', 'squeak'); V(T('train', 2, 3) + .05, .7, 'ember', 'growl', { tiny: 1 }); V(T('train', 4, 1), .8, 'ember', 'giggle'); V(T('train', 4, 2.5), .6, 'ash', 'laugh', { tiny: 1 });
  V(T('climax', 0, 1), 1.8, 'cinder', 'roar'); V(T('climax', 1, 1), 1.0, 'ash', 'roar', { nofire: 1 }); V(T('climax', 1, 3), .7, 'ash', 'cough'); V(T('climax', 2, 2) + .05, .8, 'ash', 'groan');
  V(T('climax', 3, 1), 1.4, 'cinder', 'snarl'); V(T('climax', 3, 3), .6, 'ember', 'whimper'); V(T('climax', 4, 2.4), 1.0, 'ember', 'gasp', { inhale: 1 }); V(T('climax', 5), 2.2, 'ember', 'roar', { blue: 1 }); V(T('climax', 8, 2), 2.0, 'cinder', 'screech', { last: 1 });
  V(T('dawn', 0, 2), .5, 'ember', 'chirp'); V(T('dawn', 1, 1), .9, 'ash', 'groan', { soft: 1 }); V(T('dawn', 2, 0) + .1, .8, 'ash', 'laugh'); V(T('dawn', 6, 1) + .3, .7, 'ash', 'hrmph', { smile: 1 }); V(T('dawn', 6, 2), .8, 'ember', 'giggle');
  sounds.sort((a, b) => a.t - b.t);

  // ---------- story cues (seconds). Every lane stages from these; never type a time in ----------------------------------------------------
  S.CUE = {
    PAINT0: 0, INK_SEAL: T('ink', 0, 1), COLOR: T('ink', 3), WORLD: T('love'),                                     // ink loong, the world painted, colour floods in at WORLD
    HEART1: T('love', 9), LAND: T('nest'), EGG: T('nest', 1), CUDDLE: T('nest', 2),
    ERUPT: T('attack'), CINDER_UP: T('attack', 1), STRIKE_NEST: T('attack', 2, 2), FIGHT: T('attack', 3), WALL_CRASH: T('attack', 5), DRIVE_BACK: T('attack', 7), PLUNGE: T('attack', 8), BLAST: T('attack', 9, 2), SILENCE: T('loss'),
    DAWN0: T('hatch'), HATCH: T('hatch', 1, 2), SUN_PROFILE: T('hatch', 2, 2), SNEEZE1: T('hatch', 3, 2) + .1,
    CAVE: T('cave'), SMOKE_FACE: T('cave', 2), COUGH: T('cave', 2, 1.5), IMITATE: T('cave', 3), WHEEZE: T('cave', 4, 1), FLINT: T('cave', 4, 3), SNEEZE_LIGHT: T('cave', 5, 1), ACCEPT: T('cave', 5, 2),
    RAIN: T('shelter'), WING: T('shelter', 1), HUM: T('shelter', 1), SING: T('shelter', 2, 2), STUB: T('shelter', 4), ASLEEP: T('shelter', 4, 1),
    TRAIN: T('train'), GLIDE: T('train', 4),
    RETURN: T('climax'), ASH_STANDS: T('climax', 1), ASH_DOWN: T('climax', 2, 2), CINDER_FIRE: T('climax', 3), ALONE: T('climax', 4), INHALE: T('climax', 4, 2.4), BLUE: T('climax', 5), LOONG: T('climax', 6), PETRIFY: T('climax', 8), CRUMBLE: T('climax', 8, 2),
    DAWN: T('dawn'), WAKE: T('dawn', 1), ASH_FIRE: T('dawn', 2), FLY: T('dawn', 3), HEART2: T('dawn', 6), JOKE: T('dawn', 6, 1), INK_BACK: T('dawn', 6, 1.6), SEAL: S.T_END };

  // ---------- queries (same as the Tea Ride) ----------------------------------------------------------------------------------------------
  Object.keys(TR).forEach(n => TR[n].sort((a, b) => a.t - b.t).forEach((e, i) => e.i = i));
  const liveEv = {}; names.forEach(n => liveEv[n] = []);
  S.live = (tr, e, o) => { const L = liveEv[tr] || (liveEv[tr] = []), ev = Object.assign({ d: .6, m: 62, v: .8, live: 1 }, e); if (!(o && o.now)) { const s = S.secAt(ev.t).sec, g = s.beatS / 4; ev.t = s.t0 + Math.ceil((ev.t - s.t0 + .008) / g) * g; } L.push(ev); if (L.length > 64) L.shift(); if (S.onLive) S.onLive(tr, ev); return ev; };
  S.BEAT = 60 / 90; S.BAR = 2; S.beatsAt = t => { let n = 0; for (const c of S.SEC) { if (t <= c.t0) break; n += (Math.min(t, c.t1) - c.t0) / c.beatS; } return n; };   // nominal beat for UI; continuous beat count for shaders
  S.clearLive = () => { for (const k in liveEv) liveEv[k].length = 0; };
  const EMPTY = []; const idxAt = (A, t) => { if (!A) return -1; let lo = 0, hi = A.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m].t <= t) lo = m + 1; else hi = m; } return lo - 1; };
  S.last = (tr, t) => { const A = TR[tr] || EMPTY, i = idxAt(A, t); return i >= 0 ? A[i] : null; };
  S.next = (tr, t) => { const A = TR[tr] || EMPTY, i = idxAt(A, t); return i + 1 < A.length ? A[i + 1] : null; };
  S.recent = (tr, t, w) => { const A = TR[tr] || EMPTY, out = []; for (let i = idxAt(A, t); i >= 0 && A[i].t > t - w; i--) out.push(A[i]); const L = liveEv[tr]; if (L) for (const e of L) if (e.t <= t && e.t > t - w) out.push(e); return out; };
  S.env = (tr, t, decay = .35, filt) => { let s = 0; const w = decay * 5, A = TR[tr] || EMPTY; for (let i = idxAt(A, t); i >= 0 && A[i].t > t - w; i--) if (!filt || filt(A[i])) s += A[i].v * Math.exp(-(t - A[i].t) / decay); const L = liveEv[tr]; if (L) for (const e of L) if (e.t <= t && e.t > t - w && (!filt || filt(e))) s += e.v * Math.exp(-(t - e.t) / decay); return s; };
  S.beat = t => { const a = S.secAt(t), x = (t - a.sec.t0) / a.sec.beatS, i = Math.floor(x); return { i, f: x - i, bar: a.bar, inBar: a.beat, meter: a.sec.meter, sec: a.name }; };
  S.bar = t => { const a = S.secAt(t), x = (t - a.sec.t0) / a.sec.barS, i = Math.floor(x); return { i, f: x - i, sec: a.name }; };
  // loudness of the whole band, 0..1, for things that breathe with the music
  const lvl = [[0, .1], [8, .3], [10, .4], [26, .7], [28, 1], [30, .45], [38, .3], [38.2, .9], [52, 1], [56.1, .9], [56.2, .03], [62, .1], [67, .4], [72, .3], [86, .45], [87, .2], [99, .4], [99.2, .75], [108, .8], [113, .95], [115.4, .9], [115.5, .04], [117.2, .1], [117.3, 1], [124.5, .8], [132, .85], [136.5, 1], [138.5, .4], [140, .05]];
  S.level = t => { for (let i = 1; i < lvl.length; i++) if (t <= lvl[i][0]) return lvl[i - 1][1] + (lvl[i][1] - lvl[i - 1][1]) * (t - lvl[i - 1][0]) / (lvl[i][0] - lvl[i - 1][0]); return lvl[lvl.length - 1][1]; };
  // the sung line as a continuous pitch (midi) and breath (0..1): for throats, glows and anything that 'sings' on screen. who = 'noct'|'lune'|'ash'|undefined (any)
  S.sing = (t, who) => { let best = null; for (const L of lines) { if (who && L.who !== who) continue; if (t < L.t0 - .05 || t > L.t1 + .3) continue; for (const n of L.notes) if (t >= n.t0 - .02 && t < n.t1 + .25) best = n; } if (!best) return { m: 0, a: 0, syl: '' }; const u = t - best.t0, d = best.t1 - best.t0; return { m: best.midi, a: Math.min(1, u / .06) * (1 - Math.max(0, Math.min(1, (u - d + .02) / .24))), syl: best.syl, n: best }; };
  return S;
})();
if (typeof module !== 'undefined') module.exports = Score;
