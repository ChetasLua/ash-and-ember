'use strict';
// ---- EMBER: the heroine, a 0.55 m hatchling dragon puppet, and her egg --------------------------------------------------------------------------
// Local space: origin on the ground under her hips, +X forward (snout), +Y up, +Z her right. Everything is a pure function of film time (seek-safe).
//   Ember.group | Ember.egg | at(t,out) root (world; on the ground unless airborne) | head(out) true head centre | mouth(out) fire/sneeze origin
//   dir(out) unit mouth-forward | eye(out) between the eyes | fire() 0..1 breathing fire now | puff() 0..1 smoke / blue puff now | MARKS (her spots)
// Reads if present (all optional): Stage.get('ash').head(out) / .cig (fn(out) | Vector3 | Object3D) / .wingUnder(out),
//   Stage.M.LEDGE_ROCK_LO / LEDGE_ROCK_HI (rock top centres; otherwise she brings her own two rocks), Stage.M.BOULDER_R, Stage.M.NEST_RIM_E.
const Ember = (() => {
  const C = Score.CUE, M = Stage.M, group = new THREE.Group(), eggG = new THREE.Group(); group.name = 'ember'; eggG.name = 'ember-egg'; const api = { group, egg: eggG };
  const col = h => new THREE.Color(h), _cc = new THREE.Color(), _cc2 = new THREE.Color();
  const win = (t, a, b, ra = .15, rb = ra) => sm(a - ra, a, t) * (1 - sm(b, b + rb, t));
  const kick = (t, t0, d = .25, a = .04) => t < t0 ? 0 : sm(t0, t0 + a, t) * Math.exp(-Math.max(0, t - t0 - a) / d);
  const blink = (t, seed, per = 3.1) => { const k = Math.floor(t / per + seed), u = (t / per + seed - k) * per, a = h1(k * 7.31 + seed * 31.7) * (per - .9); const one = v => v < 0 || v > .3 ? 0 : v < .07 ? sm(0, .07, v) : 1 - sm(.1, .3, v); let o = one(u - a); if (h1(k * 3.1 + seed) > .72) o = Math.max(o, one(u - a - .36)); return o; };
  const yawTo = (a, b) => Math.atan2(-(b.z - a.z), b.x - a.x);
  const angL = (a, b, k) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return a + d * k; };
  const L3 = (a, b, k, out) => out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  const get = (v, out) => typeof v === 'function' ? v(out) : out.copy(v);
  const ash = () => Stage.get('ash');
  const SN = s => s < 0 ? 'L' : 'R', SIDES = [-1, 1], YA = V3(0, 1, 0);
  const stepsIn = (a, b) => Score.tracks.step_ember.filter(e => e.t >= a - 1e-4 && e.t < b).map(e => e.t);

  // ================================================================ marks: where she goes (from Stage.M; nothing typed from the clock) =====================
  const NEST = M.NEST, EGG_H = .45, EGG_C = V3(NEST.x, NEST.y + .25, NEST.z), CUP = V3(NEST.x, EGG_C.y - EGG_H / 2 + .055, NEST.z);
  const RIM = M.NEST_RIM_E ? M.NEST_RIM_E.clone() : V3(NEST.x + 1.5, NEST.y + .4, NEST.z), P_OUT = V3(NEST.x + .36, NEST.y, NEST.z + .02), P_TROT = V3(NEST.x + .86, NEST.y, NEST.z + .02);
  const SEAT = M.ASH_SEAT, uC = V3(M.CAVE.x - SEAT.x, 0, M.CAVE.z - SEAT.z).normalize(), Pc1 = V3(SEAT.x + uC.x * 1.6, SEAT.y, SEAT.z + uC.z * 1.6), Pc0 = V3(SEAT.x + uC.x * 4.0, SEAT.y, SEAT.z + uC.z * 4.0);
  const Y_ASH = Math.atan2(uC.z, -uC.x), CD = M.CAVE_DIR, Y_OUT = Math.atan2(-CD.z, CD.x), pC = V3(-CD.z, 0, CD.x);
  const MOUTH_IN = V3(M.CAVE.x - CD.x * .9, M.CAVE.y, M.CAVE.z - CD.z * .9), WING_FB = V3(MOUTH_IN.x - CD.x * .95 + pC.x * .45, MOUTH_IN.y, MOUTH_IN.z - CD.z * .95 + pC.z * .45);
  const LD = M.LEDGE, OWN_ROCKS = !(M.LEDGE_ROCK_LO && M.LEDGE_ROCK_HI);
  const RL = OWN_ROCKS ? V3(LD.x - 2.2, LD.y + .6, LD.z + .9) : M.LEDGE_ROCK_LO.clone(), RH = OWN_ROCKS ? V3(LD.x - 3.6, LD.y + 1.1, LD.z - .9) : M.LEDGE_ROCK_HI.clone();
  const RL0 = V3(RL.x - .2, RL.y, RL.z), RL1 = V3(RL.x + .13, RL.y, RL.z), FALL = Score.tracks.fall.map(e => e.t);
  const F1 = V3(RL.x + .8, LD.y, RL.z), F2 = V3(RL.x + .72, LD.y, RL.z + .06), F2r = V3(F2.x + .34, LD.y, F2.z), F3 = V3(RL.x + .84, LD.y, RL.z - .04), RH0 = V3(RH.x + .05, RH.y, RH.z), GL = V3(RH.x + 3.1, LD.y, RH.z + .25);
  const EC = M.EMBER_CLIMAX, BO = M.BOULDER, BR = M.BOULDER_R || 1.4, CF = M.cinder(C.CINDER_FIRE, V3()), AT = M.ASH_THROWN;
  const away = V3(BO.x - CF.x, 0, BO.z - CF.z).normalize(), side = V3(-away.z, 0, away.x); if ((AT.x - BO.x) * side.x + (AT.z - BO.z) * side.z < 0) side.multiplyScalar(-1);
  const HIDE = V3(BO.x + away.x * (BR + .3) + side.x * BR * .75, BO.y, BO.z + away.z * (BR + .3) + side.z * BR * .75), PB = V3(HIDE.x + side.x * .75 - away.x * .45, BO.y, HIDE.z + side.z * .75 - away.z * .45);
  const Y_SIDE = Math.atan2(-side.z, side.x), MEM = M.MEMORY || V3(22, 44, -80);
  const cinAt = (t, out) => { M.cinder(t, out); out.y += 1.5; return out; };
  const ashHead = (out, fb) => { const a = ash(); if (a && a.head) { a.head(out); return out; } return out.copy(fb); };
  const AH_CAVE = V3(SEAT.x + uC.x * .55, SEAT.y + 2.3, SEAT.z + uC.z * .55), AH_CLX = V3(M.ASH_CLIMAX.x, M.ASH_CLIMAX.y + 2.4, M.ASH_CLIMAX.z);
  const dAT = V3(PB.x - AT.x, 0, PB.z - AT.z).normalize(), AH_DOWN = V3(AT.x + dAT.x * 2.1, AT.y + .45, AT.z + dAT.z * 2.1);
  const nuzAt = out => { ashHead(out, AH_DOWN); const dx = out.x - PB.x, dz = out.z - PB.z, l = Math.hypot(dx, dz) || 1; out.x -= dx / l * .47; out.z -= dz / l * .47; out.y = AT.y; return out; };
  const wingAt = out => { const a = ash(); if (a && a.wingUnder) { a.wingUnder(out); return out; } return out.copy(WING_FB); };
  const NOTCH = M.heart2('ash', C.HEART2 + 5, V3());
  const cigAt = (out, fb) => { const a = ash(), c = a && a.cig; if (c) { if (typeof c === 'function') { c(out); return out; } if (c.isVector3) return out.copy(c); if (c.isObject3D) return c.getWorldPosition(out); } return out.copy(fb); };
  const CIG_CAVE = V3(SEAT.x + uC.x * .9, SEAT.y + 2.45, SEAT.z + uC.z * .9), CIG_DAWN = V3(NOTCH.x, NOTCH.y - .05, NOTCH.z + .45);

  // ================================================================ the path of her root (pure) =========================================================
  const MV = [], mv = o => { MV.push(o); return o; }, HOME_X = .023, HOME_Z = .066;
  const HS = stepsIn(C.DAWN0, C.CAVE), CS = stepsIn(C.CAVE, C.RAIN), TS = stepsIn(C.TRAIN, C.RETURN), DS = stepsIn(C.DAWN, C.FLY);
  function walk(o) { const st = o.steps, n = st.length, per = st.map((x, i) => i + 1 < n ? st[i + 1] - x : x - st[i - 1]); o.type = 'walk'; o.ta = o.ta0 !== undefined ? o.ta0 : st[0] - per[0] * .6; o.tb = o.tb0 !== undefined ? o.tb0 : st[n - 1] + per[n - 1] * .9;
    o.P = t => { const u = sm(o.ta, o.tb, t); return [lerp(o.p0.x, o.p1.x, u), lerp(o.p0.y, o.p1.y, u), lerp(o.p0.z, o.p1.z, u), angL(o.y0, o.y1, u)]; };
    const plant = (q, k, t) => { const s = k ? 1 : -1, c = Math.cos(q[3]), sn = Math.sin(q[3]); return { t, x: q[0] + HOME_X * c + s * HOME_Z * sn, y: q[1], z: q[2] - HOME_X * sn + s * HOME_Z * c, yaw: q[3] }; };
    o.pl = [[plant(o.P(o.t0), 0, o.t0)], [plant(o.P(o.t0), 1, o.t0)]]; o.side = [];
    st.forEach((x, i) => { const k = (i + (o.k0 || 0)) % 2; o.side.push(k); o.pl[k].push(plant(o.P(x + per[i]), k, x)); });
    const kl = o.side[n - 1]; o.pl[1 - kl].push(plant(o.P(o.tb + 1), 1 - kl, st[n - 1] + per[n - 1])); return mv(o); }
  mv({ t0: -1e9, type: 'stand', p: CUP, yaw: -.35 });
  mv({ t0: C.HATCH + 1.6, type: 'hop', p0: CUP, p1: P_OUT, ts: [HS[0] - .02], h: .1, yEnd: 0 });
  walk({ t0: HS[0] - .01, p0: P_OUT, p1: P_TROT, steps: [HS[0], HS[1]], y0: 0, y1: 0, ta0: HS[0] - .05, tb0: HS[1] + .06 });
  mv({ t0: HS[1] + .07, type: 'hop', p0: P_TROT, p1: RIM, ts: [HS[2]], h: .14, yEnd: 0 });
  walk({ t0: HS[2] + .01, p0: RIM, p1: RIM, steps: HS.slice(3), y0: 0, y1: -PI / 2, k0: 1 });
  walk({ t0: C.CAVE - .001, p0: Pc0, p1: Pc1, steps: CS, y0: Y_ASH, y1: Y_ASH });
  mv({ t0: C.RAIN, type: 'stand', p: MOUTH_IN, yaw: Y_OUT });
  mv({ t0: C.WING + .38, type: 'hop', p0: MOUTH_IN, p1: wingAt, ts: [0, 1, 2, 3, 4, 5].map(i => C.WING + .58 + i * .2), h: .045, yEnd: Y_OUT });
  walk({ t0: C.TRAIN - .001, p0: RL0, p1: RL1, steps: TS.slice(0, 3), y0: 0, y1: 0 });
  mv({ t0: TS[3] - .03, type: 'leap', p0: RL1, p1: F1, t1: FALL[0], h: .2, yaw: 0 });
  mv({ t0: FALL[0], type: 'stand', p: F1, yaw: 0 });
  mv({ t0: (FALL[0] + 1.01), type: 'leap', p0: F1, p1: RL0, t1: (FALL[0] + 1.41), h: .22, yaw: PI });
  mv({ t0: (FALL[0] + 1.41), type: 'stand', p: RL0, yaw: t => angL(PI, 0, sm((FALL[0] + 1.41), (FALL[1] - .28), t)) });
  mv({ t0: (FALL[1] - .27), type: 'leap', p0: RL0, p1: F2, t1: FALL[1], h: .2, yaw: 0 });
  mv({ t0: FALL[1], type: 'stand', p: F2r, yaw: 0 });
  mv({ t0: (FALL[1] + .99), type: 'leap', p0: F2r, p1: RL0, t1: (FALL[1] + 1.39), h: .22, yaw: PI });
  mv({ t0: (FALL[1] + 1.39), type: 'stand', p: RL0, yaw: t => angL(PI, 0, sm((FALL[1] + 1.39), (FALL[2] - .32), t)) });
  mv({ t0: (FALL[2] - .31), type: 'leap', p0: RL0, p1: F3, t1: FALL[2], h: .18, yaw: 0 });
  mv({ t0: FALL[2], type: 'stand', p: F3, yaw: 0 });
  mv({ t0: (C.GLIDE - .5), type: 'leap', p0: F3, p1: RH0, t1: (C.GLIDE - .1), h: .32, yaw: yawTo(F3, RH0) });
  mv({ t0: (C.GLIDE - .1), type: 'stand', p: RH0, yaw: t => angL(yawTo(F3, RH0), yawTo(RH0, GL), sm((C.GLIDE - .1), (C.GLIDE - .02), t)) });
  mv({ t0: C.GLIDE, type: 'glide', p0: RH0, p1: GL, t1: C.GLIDE + 1.2, yaw: yawTo(RH0, GL) });
  mv({ t0: C.GLIDE + 1.2, type: 'stand', p: GL, yaw: yawTo(RH0, GL) });
  mv({ t0: C.RETURN, type: 'stand', p: EC, yaw: t => yawTo(EC, cinAt(t, _y)) });
  mv({ t0: C.ASH_DOWN + .04, type: 'hop', p0: EC, p1: HIDE, ts: [C.ASH_DOWN + .3, C.ASH_DOWN + .6, C.CINDER_FIRE], h: .2, yEnd: Y_SIDE, dive: 1 });
  walk({ t0: C.ALONE + .02, p0: HIDE, p1: PB, steps: [C.ALONE + .1, C.ALONE + .27, C.ALONE + .44], y0: Y_SIDE, y1: yawTo(PB, CF) });
  mv({ t0: C.ALONE + .9, type: 'stand', p: PB, yaw: t => angL(yawTo(PB, CF), yawTo(PB, cinAt(t, _y)), sm(C.ALONE + .9, C.ALONE + 1.4, t)) });
  mv({ t0: C.DAWN + .04, type: 'hop', p0: PB, p1: nuzAt, ts: [C.DAWN + .37].concat(DS.slice(0, 5)), h: .16, yEnd: t => yawTo(nuzAt(_y2), ashHead(_y, AH_DOWN)) });
  mv({ t0: C.FLY, type: 'fly' });
  const _y = V3(), _y2 = V3(), _ra = V3(), _rb = V3(), _rc = V3();
  // flight heading from the shared path; never differentiate across a cut (a jump > 3 m between samples)
  const _rd = V3(), cont = (a, b) => a.distanceTo(b) < 3;
  const flyYaw = (t, w = .05) => { M.heart2('ember', t, _rd); M.heart2('ember', t + w, _rb); M.heart2('ember', t - w, _rc); const f = cont(_rd, _rb), b = cont(_rd, _rc), A_ = b ? _rc : _rd, B_ = f ? _rb : _rd, dt = (f ? w : 0) + (b ? w : 0);
    if (!dt) return [-PI / 2, 0, 0, 0, 0]; const vx = (B_.x - A_.x) / dt, vz = (B_.z - A_.z) / dt, sp = Math.hypot(vx, vz); return [Math.atan2(-vz, vx), sp, (B_.y - A_.y) / dt, vx, vz]; };
  function rootAt(t, R) {
    let m = MV[0]; for (let i = 1; i < MV.length; i++) { if (t >= MV[i].t0) m = MV[i]; else break; }
    R.m = m; R.air = 0; R.u = 0; R.seg = -1; R.pitch = 0; R.bank = 0;
    if (m.type === 'stand') { get(m.p, _ra); R.x = _ra.x; R.y = _ra.y; R.z = _ra.z; R.yaw = typeof m.yaw === 'function' ? m.yaw(t) : m.yaw; }
    else if (m.type === 'walk') { const q = m.P(t); R.x = q[0]; R.y = q[1]; R.z = q[2]; R.yaw = q[3]; }
    else if (m.type === 'leap' || m.type === 'glide') { const u = clamp((t - m.t0) / (m.t1 - m.t0)), g = m.type === 'glide'; R.u = u; L3(m.p0, m.p1, g ? 1 - Math.pow(1 - u, 1.25) : u, _ra);
      R.x = _ra.x; R.z = _ra.z; R.y = lerp(m.p0.y, m.p1.y, g ? Math.pow(u, 1.7) : u); R.air = g ? .1 * Math.sin(PI * u) + .3 * (1 - sm(.85, 1, u)) : m.h * 4 * u * (1 - u); R.yaw = m.yaw; }
    else if (m.type === 'hop') { get(m.p0, _rb); get(m.p1, _rc); const n = m.ts.length; let k = 0; while (k < n && t >= m.ts[k]) k++; const ty = yawTo(_rb, _rc);
      if (k >= n) { R.x = _rc.x; R.y = _rc.y; R.z = _rc.z; const ye = typeof m.yEnd === 'function' ? m.yEnd(t) : m.yEnd; R.yaw = angL(ty, ye, sm(m.ts[n - 1], m.ts[n - 1] + .45, t)); }
      else { const ta = k ? m.ts[k - 1] : m.t0, tb = m.ts[k], dw = k ? .04 : 0, u = clamp((t - ta - dw) / Math.max(.01, tb - ta - dw)); L3(_rb, _rc, (k + u) / n, _ra); R.x = _ra.x; R.y = _ra.y; R.z = _ra.z; R.air = m.h * 4 * u * (1 - u); R.u = u; R.seg = k; R.yaw = ty; } }
    else { M.heart2('ember', t, _ra); const [yw, sp, vy] = flyYaw(t), ye = -PI / 2, kq = sm(.6, 2.5, sp) * (1 - sm(C.HEART2 - .5, C.HEART2, t));
      M.heart2('ember', t - .1, _rc); const back = cont(_ra, _rc), yd = back ? flyYaw(t - .1)[0] : flyYaw(t + .1)[0];
      R.yaw = angL(ye, yw, kq); const kn = sm(C.HEART2 - 1.2, C.HEART2, t), c = Math.cos(R.yaw), s = Math.sin(R.yaw); R.x = _ra.x - c * .26 * kn; R.z = _ra.z + s * .26 * kn; R.y = _ra.y - .135;
      R.pitch = Math.atan2(vy, Math.max(sp, .5)) * kq; let dy = back ? yw - yd : yd - yw; if (dy > PI) dy -= TAU; if (dy < -PI) dy += TAU; R.bank = clamp(dy * 10 * sm(1, 6, sp), -.7, .7) * kq;
      R.pk = .5; if (t > C.FLY + 2.5 + .001) { // the heart lies in a vertical plane: face along it, pitch with the curve, swing through west (to camera) at the outer turn
        const [, , vy2, vx2, vz2] = flyYaw(Math.max(t, C.FLY + 2.8), .08), s3 = Math.hypot(vx2, vy2, vz2), q = clamp(vz2 / Math.max(s3, .3), -1, 1), kh = 1 - sm(C.HEART2 - 1, C.HEART2, t);
        R.yaw = angL(ye, PI / 2 + PI / 2 * (1 + q), kh); R.pitch = Math.atan2(vy2, Math.max(Math.hypot(vx2, vz2), .5)) * kh; R.bank = .3 * (1 - Math.abs(q)) * kh; R.pk = .8;
        const c2 = Math.cos(R.yaw), s2 = Math.sin(R.yaw); R.x = _ra.x - c2 * .26 * kn; R.z = _ra.z + s2 * .26 * kn; }
      const k0 = sm(C.FLY, C.FLY + .45, t); if (k0 < 1) { nuzAt(_rb); const y0 = yawTo(_rb, ashHead(_rc, AH_DOWN)); R.x = lerp(_rb.x, R.x, k0); R.z = lerp(_rb.z, R.z, k0); R.air = lerp(0, R.y - _rb.y, k0) + .12 * Math.sin(PI * k0); R.y = _rb.y; R.yaw = angL(y0, R.yaw, k0); R.pitch *= k0; R.bank *= k0; } }
    return R; }
  function footW(m, k, t, out) { const L = m.pl[k]; let i = 0; while (i + 1 < L.length && L[i + 1].t <= t) i++; const a = L[i], b = L[i + 1]; out.lift = 0;
    if (!b) { out.x = a.x; out.y = a.y; out.z = a.z; out.yaw = a.yaw; return out; } const sw = Math.min(.2, (b.t - a.t) * .75), u = clamp((t - (b.t - sw)) / sw), e = u * u * (3 - 2 * u);
    out.x = lerp(a.x, b.x, e); out.y = lerp(a.y, b.y, e); out.z = lerp(a.z, b.z, e); out.yaw = angL(a.yaw, b.yaw, e); out.lift = .028 * Math.sin(PI * u); return out; }

  // ================================================================ rig =================================================================================
  const E_R = .034, EYE = s => [.142, .437, s * .059], GAZE = s => [.78, .05, s * .62];
  const TP = [[-.075, .11], [-.135, .078], [-.2, .058], [-.265, .056], [-.32, .072], [-.36, .105], [-.385, .15]], TRr = [.05, .042, .034, .026, .02, .015, .011];
  const WS = s => [-.015, .29, s * .065], WW = s => [-.06, .36, s * .14], WF = s => [[-.125, .43, s * .2], [-.168, .355, s * .212], [-.15, .285, s * .168]], WBP = s => [-.085, .265, s * .072];
  const DEF = { hips: { pos: [-.01, .135, 0] }, spine: { parent: 'hips', pos: [0, .19, 0] }, belly: { parent: 'spine', pos: [.03, .175, 0] }, chest: { parent: 'spine', pos: [.02, .25, 0] },
    neck: { parent: 'chest', pos: [.045, .305, 0] }, throat: { parent: 'neck', pos: [.085, .33, 0] }, head: { parent: 'neck', pos: [.075, .365, 0] }, jaw: { parent: 'head', pos: [.095, .372, 0] }, twig: { pos: [.3, .37, 0] } };
  TP.slice(0, 6).forEach((p, i) => DEF['t' + i] = { parent: i ? 't' + (i - 1) : 'hips', pos: [p[0], p[1], 0] });
  for (const s of SIDES) { const n = SN(s);
    Object.assign(DEF, { ['cheek' + n]: { parent: 'head', pos: [.125, .385, s * .058] }, ['eye' + n]: { parent: 'head', pos: EYE(s) }, ['lidU' + n]: { parent: 'head', pos: EYE(s) }, ['lidL' + n]: { parent: 'head', pos: EYE(s) },
      ['brow' + n]: { parent: 'head', pos: [.15, .484, s * .058] }, ['ear' + n]: { parent: 'head', pos: [.022, .468, s * .07] }, ['earT' + n]: { parent: 'ear' + n, pos: [-.045, .52, s * .112] },
      ['lg' + n + 'u']: { parent: 'hips', pos: [-.005, .112, s * .056] }, ['lg' + n + 'l']: { parent: 'lg' + n + 'u', pos: [.028, .066, s * .064] }, ['lg' + n + 'f']: { parent: 'lg' + n + 'l', pos: [-.003, .027, s * .066] },
      ['au' + n]: { parent: 'chest', pos: [.068, .238, s * .05] }, ['al' + n]: { parent: 'au' + n, pos: [.094, .205, s * .06] }, ['hand' + n]: { parent: 'al' + n, pos: [.112, .178, s * .059] },
      ['wA' + n]: { parent: 'chest', pos: WS(s) }, ['wB' + n]: { parent: 'wA' + n, pos: WW(s) }, ['wF0' + n]: { parent: 'wB' + n, pos: WW(s) }, ['wF1' + n]: { parent: 'wB' + n, pos: WW(s) }, ['wF2' + n]: { parent: 'wB' + n, pos: WW(s) } }); }
  const rest = n => V3(...DEF[n].pos);

  // ================================================================ sculpting kit (crease AO + material masks baked per vertex) ============================
  const DM = [0, 1, 1, 0];
  function carve(o) {
    const S = o.parts.filter(p => !p.cut && !p.paint), X = o.parts.filter(p => p.cut), A = o.parts.filter(p => p.paint), n0 = S.length, F = S.map(p => p.f), K = S.map(p => p.k === undefined ? .02 : p.k);
    const f0 = (x, y, z) => { let d = F[0](x, y, z); for (let i = 1; i < n0; i++) { const e = F[i](x, y, z), k = K[i], q = d - e; if (k > 0 && q < k && q > -k) { const h = (k - (q < 0 ? -q : q)) / k; d = (d < e ? d : e) - h * h * k * .25; } else if (e < d) d = e; } for (let i = 0; i < X.length; i++) { const e = -X[i].f(x, y, z), k = X[i].k || 0; d = k > 0 ? SD.smax(d, e, k) : (d > e ? d : e); } return d; };
    const cf = o.clip, f = !cf ? f0 : o.keep ? (x, y, z) => Math.max(f0(x, y, z), cf(x, y, z)) : (x, y, z) => Math.max(f0(x, y, z) + (o.off || 0), -cf(x, y, z));
    const bb = o.bb, m = SD.mesh(f, bb, Math.round(Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / o.h)), n = m.pos.length / 3, NM = o.rig.names, nb = NM.length;
    const cl = new Float32Array(n * 3), mk = new Float32Array(n * 4), uv = new Float32Array(n * 2), si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
    const CF = S.map(p => typeof p.color === 'function' ? p.color : (c => () => c)(col(p.color))), PF = A.map(p => typeof p.color === 'function' ? p.color : (c => () => c)(col(p.color))), MS = S.map(p => p.m || DM);
    const BI = S.map(p => { const i = NM.indexOf(p.bone); if (i < 0) throw new Error('Ember bone ' + p.bone); return i; }), WB = S.map(p => p.wb || .02), dd = new Float32Array(n0), acc = new Float32Array(nb), a1 = o.ao || .006, cb = o.cblend || .003;
    for (let i = 0; i < n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2], nx = m.nor[i * 3], ny = m.nor[i * 3 + 1], nz = m.nor[i * 3 + 2]; let dm = 1e9; for (let j = 0; j < n0; j++) { dd[j] = F[j](x, y, z); if (dd[j] < dm) dm = dd[j]; }
      let r = 0, g = 0, b = 0, ws = 0, m0 = 0, m1 = 0, m2 = 0, m3 = 0; for (let j = 0; j < n0; j++) { const w = Math.exp(-(dd[j] - dm) / cb); if (w < .003) continue; const c = CF[j](x, y, z, nx, ny, nz), q = MS[j]; r += c.r * w; g += c.g * w; b += c.b * w; m0 += q[0] * w; m1 += q[1] * w; m2 += q[2] * w; m3 += q[3] * w; ws += w; }
      r /= ws; g /= ws; b /= ws; m0 /= ws; m1 /= ws; m2 /= ws; m3 /= ws;
      for (let j = 0; j < A.length; j++) { const e = A[j].f(x, y, z), s = A[j].soft || .004, w = 1 - sm(-s, s, e); if (w > .001) { const c = PF[j](x, y, z, nx, ny, nz), a = w * (A[j].a === undefined ? 1 : A[j].a), q = A[j].m; r += (c.r - r) * a; g += (c.g - g) * a; b += (c.b - b) * a; if (q) { m0 += (q[0] - m0) * a; m1 += (q[1] - m1) * a; m2 += (q[2] - m2) * a; m3 += (q[3] - m3) * a; } } }
      const ao = clamp(.45 * f(x + nx * a1, y + ny * a1, z + nz * a1) / a1 + .55 * f(x + nx * a1 * 3, y + ny * a1 * 3, z + nz * a1 * 3) / (a1 * 3)), q = lerp(.5, 1, ao * ao * (3 - 2 * ao));
      cl[i * 3] = r * q; cl[i * 3 + 1] = g * lerp(q, 1, .12); cl[i * 3 + 2] = b * lerp(q, 1, .25); mk[i * 4] = m0; mk[i * 4 + 1] = m1; mk[i * 4 + 2] = m2; mk[i * 4 + 3] = m3; uv[i * 2] = x * 2; uv[i * 2 + 1] = y * 2;
      acc.fill(0); for (let j = 0; j < n0; j++) { const w = Math.exp(-(dd[j] - dm) / WB[j]); if (w > acc[BI[j]]) acc[BI[j]] = w; } if (o.rule) o.rule(x, y, z, acc);
      let t = 0; for (let q4 = 0; q4 < 4; q4++) { let bi = -1, bw = .012; for (let k = 0; k < nb; k++) if (acc[k] > bw) { bw = acc[k]; bi = k; } if (bi < 0) break; si[i * 4 + q4] = bi; sw[i * 4 + q4] = bw; t += bw; acc[bi] = 0; } for (let q4 = 0; q4 < 4; q4++) sw[i * 4 + q4] /= t || 1;
    }
    const g = new THREE.BufferGeometry(), at = (k, a, s) => g.setAttribute(k, new THREE.BufferAttribute(a, s)); at('position', m.pos, 3); at('normal', m.nor, 3); at('uv', uv, 2); at('color', cl, 3); at('aM', mk, 4); at('skinIndex', si, 4); at('skinWeight', sw, 4); g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.userData.f = f0; return g;
  }
  // every vertex to one bone, or weights from fn(x,y,z,i) -> [[bone, w], ...]; fills colour / aM if missing
  function bind(rg, g, bone, mask) { const n = g.attributes.position.count, P = g.attributes.position, si = new Float32Array(n * 4), sw = new Float32Array(n * 4), I = k => { const i = rg.names.indexOf(k); if (i < 0) throw new Error('Ember bone ' + k); return i; };
    if (typeof bone === 'string') { const b = I(bone); for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; } } else for (let i = 0; i < n; i++) bone(P.getX(i), P.getY(i), P.getZ(i), i).forEach((e, k) => { si[i * 4 + k] = I(e[0]); sw[i * 4 + k] = e[1]; });
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); if (!g.attributes.color) Geo.paint(g, '#ffffff'); if (mask) Geo.attr(g, 'aM', 4, mask); return g; }
  const basis = n => { const f = V3(...n).normalize(), s = V3().crossVectors(f, YA).normalize(), u = V3().crossVectors(s, f); return { f, u, s }; };
  const capG = (r, a, seg = 22, rg = 3) => Geo.surf((u, v) => { const th = v * a, ph = u * TAU; return [r * Math.cos(th), r * Math.sin(th) * Math.sin(ph), r * Math.sin(th) * Math.cos(ph)]; }, seg, rg, {});
  const chain = (names, u) => { const n = names.length, x = clamp(u) * (n - 1), i = Math.min(n - 2, Math.floor(x)), f = x - i; return n < 2 ? [[names[0], 1]] : [[names[i], 1 - f], [names[i + 1], f]]; };

  // ================================================================ materials ===========================================================================
  const NSP = 112, NSE = 40;
  const U = { uSp: { value: Array.from({ length: NSP }, () => new THREE.Vector4(0, -9, 0, -1)) }, uGlow: { value: new THREE.Vector3() }, uPup: { value: new THREE.Vector2(.16, .6) }, uEyeE: { value: .12 }, uBlz: { value: 0 },
    uCr: { value: 0 }, uEG: { value: 0 }, uCold: { value: 0 }, uSpE: { value: Array.from({ length: NSE }, () => new THREE.Vector4(0, -9, 0, -1)) } };
  const H31 = `float emH31(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    vec3 emH33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`;
  const hookBody = { key: 'emBody', uniforms: { uSp: U.uSp, uGlow: U.uGlow }, vertPars: 'attribute vec4 aM; varying vec4 vM;', vert: 'vM = aM;',
    fragPars: `varying vec4 vM; uniform vec4 uSp[${NSP}]; uniform vec3 uGlow; float emSp; ${H31}`,
    color: /* glsl */`{
      float bp = vM.x; if (bp > 0.01) { float bb = (op.y - 0.9 * op.x * op.x + 2.6 * op.z * op.z) / 0.0185, fb = fwidth(bb), gq = abs(fract(bb) - 0.5) * 2.0;
        float grv = smoothstep(1.0 - max(fb * 1.6, 0.16), 1.0, gq) * (1.0 - smoothstep(0.35, 0.9, fb)); col = mix(col, col * vec3(0.80, 0.70, 0.60), grv * bp); hgt += bp * (1.0 - gq * gq) * 0.9; }
      float sa = vM.z; if (sa > 0.01) { vec3 q = op / 0.0056; vec3 ip = floor(q), fp = fract(q); float d1 = 8.0, d2 = 8.0; vec3 cid = ip;
        for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 g3 = vec3(float(i), float(j), float(k)); vec3 r = g3 + emH33(ip + g3) * 0.8 + 0.1 - fp; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; cid = ip + g3; } else if (d < d2) d2 = d; }
        float ed = sqrt(d2) - sqrt(d1), fw = fwidth(q.x) + fwidth(q.y) + fwidth(q.z), fade = sa * (1.0 - smoothstep(0.35, 0.95, fw));
        col *= mix(1.0, 0.955 + 0.08 * emH31(cid), fade); col *= mix(1.0, 0.9, (1.0 - smoothstep(0.0, 0.07 + fw * 0.5, ed)) * fade); hgt = hgt * (1.0 - 0.6 * fade) + fade * smoothstep(0.0, 0.45, ed) * 0.55; }
      emSp = 0.0; if (vM.y > 0.01) { float aaS = max(fwidth(op.x) + fwidth(op.y) + fwidth(op.z), 1e-5) * 0.7;
        for (int i = 0; i < ${NSP}; i++) { vec4 s4 = uSp[i]; vec3 dd = op - s4.xyz; float e2 = dot(dd, dd), rr = s4.w + 0.003; if (e2 > rr * rr) continue; float dl = sqrt(e2) - s4.w * (0.86 + 0.28 * nz.g); emSp = max(emSp, 1.0 - smoothstep(-aaS, aaS, dl)); }
        emSp *= vM.y; col = mix(col, mix(vec3(0.84, 0.54, 0.04), vec3(0.95, 0.70, 0.07), nz.r), emSp); hgt += emSp * 0.5; rgh -= emSp * 0.12; } }`,
    emissive: 'totalEmissiveRadiance += (uGlow.x * vec3(1.0, 0.62, 0.16) + uGlow.y * vec3(0.55, 0.85, 1.5)) * emSp * 1.8 + uGlow.y * vec3(0.03, 0.06, 0.12);' };
  const hookEye = { key: 'emEye', uniforms: { uPup: U.uPup, uEyeE: U.uEyeE, uBlz: U.uBlz }, vertPars: 'attribute vec4 aE; varying vec4 vE;', vert: 'vE = aE;',
    fragPars: 'varying vec4 vE; uniform vec2 uPup; uniform float uEyeE, uBlz; float emE, emHL; vec3 emIC;',
    color: /* glsl */`emE = 0.0; emHL = 0.0; emIC = vec3(0.0);
      if (vE.w > 0.5 && vE.w < 1.5) { vec3 e = normalize(vE.xyz); float th = acos(clamp(e.x, -1.0, 1.0)), ri = th / 1.08, an = atan(e.y, e.z);
        vec3 ic = mix(vec3(0.78, 0.26, 0.01), vec3(1.0, 0.80, 0.10), smoothstep(0.04, 0.8, ri)); ic *= 1.0 + 0.16 * sin(an * 23.0 + ri * 5.0) * smoothstep(0.12, 0.5, ri) + 0.07 * sin(an * 53.0 + 1.3);
        ic = mix(ic, vec3(0.20, 0.09, 0.02), smoothstep(0.84, 1.0, ri)); vec2 a = vec2(atan(e.z, e.x), atan(e.y, e.x)); float pd = length(vec2(a.x / uPup.x, a.y / uPup.y)) - 1.0, fa = fwidth(pd) + 1e-4;
        float pu = 1.0 - smoothstep(-fa, fa, pd); ic = mix(ic, ic * 0.55, (1.0 - smoothstep(0.0, 0.9, pd)) * (1.0 - pu) * 0.5); ic = mix(ic, vec3(0.012, 0.01, 0.02), pu);
        col = ic; emE = (1.0 - pu) * (1.0 - smoothstep(0.8, 1.0, ri)); emIC = ic; rgh = 0.05; hgt = 0.0; }
      if (vE.w > 1.5) { col = vec3(1.0); emHL = 1.0; rgh = 0.05; }`,
    emissive: 'totalEmissiveRadiance += emIC * emE * (uEyeE + uBlz * 0.6) + vec3(0.1, 0.25, 0.6) * uBlz * emE + vec3(0.9) * emHL * 0.4;' };
  const hookEgg = { key: 'emEgg', uniforms: { uCr: U.uCr, uEG: U.uEG, uCold: U.uCold, uSpE: U.uSpE },
    vertPars: 'attribute vec4 aB; attribute vec3 aC; attribute vec3 aH; varying vec4 vB; varying vec3 vC; varying vec3 vH;', vert: 'vB = aB; vC = aC; vH = aH;',
    fragPars: `varying vec4 vB; varying vec3 vC; varying vec3 vH; uniform float uCr, uEG, uCold; uniform vec4 uSpE[${NSE}]; float emCr, emEs, emIn, emOut;`,
    color: `{ emOut = 1.0 - step(0.5, vB.w); emIn = step(0.5, vB.w) * (1.0 - step(1.5, vB.w)); float aa = max(fwidth(op.x) + fwidth(op.y) + fwidth(op.z), 1e-5) * 0.7, sp = 0.0;
      for (int i = 0; i < ${NSE}; i++) { vec3 dd = op - uSpE[i].xyz; float dl = length(dd) - uSpE[i].w * (0.85 + 0.3 * nz.g); sp = max(sp, 1.0 - smoothstep(-aa, aa, dl)); }
      sp *= emOut; col = mix(col, mix(vec3(0.86, 0.58, 0.04), vec3(0.96, 0.74, 0.08), nz.r), sp); emEs = sp; float cr = 0.0;
      ${['x', 'y', 'z'].map(k => `if (vC.${k} < uCr) { float b = vB.${k}, w = max(fwidth(b) * 0.9, 0.0009 / max(vH.${k}, 1e-4)); cr = max(cr, 1.0 - smoothstep(w * 0.45, w, b)); }`).join('\n')}
      cr *= emOut; emCr = cr; col = mix(col, vec3(0.03, 0.04, 0.08), cr * 0.85); hgt -= cr * 0.6;
      vec3 cg = vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.82, 0.88, 1.0); col = mix(col, cg, uCold * 0.7) * (1.0 - 0.3 * uCold); }`,
    emissive: 'totalEmissiveRadiance += uEG * (vec3(1.0, 0.72, 0.32) * (emCr * 1.3 + emEs * 0.5 + emIn * 0.9 + 0.06 * emOut) + diffuseColor.rgb * 0.22 * emOut);' };

  // ================================================================ build ===============================================================================
  let rg, body, felt, gloss, egg, rocks, rgE, proxy, PC = [], lanG, lanB, lanE; const pieces = [];
  function buildBody() {
    rg = Sculpt.rig(DEF);
    const BL = col('#7fb8e6'), BD = col('#6396d6'), BS = col('#4f86c4'), BLt = col('#a4d3f2'), CRM = col('#f7ecd2'), CLW = col('#fbf3e0'), PAD = col('#ee9cbd'), HRN = col('#e6eef8'), HRT = col('#fff4dc');
    const skin = (x, y, z, nx, ny) => { const c = _cc.copy(BL); c.lerp(BD, .38 * sm(.05, .7, -nx) * sm(-.2, .5, ny + .3)); c.lerp(BS, .3 * sm(.3, .9, -ny)); c.lerp(BLt, .55 * sm(.15, .23, x) * sm(.33, .42, y)); return c; };
    const horn = (x, y) => _cc.copy(HRN).lerp(HRT, sm(.52, .548, y));
    const P = [], pt = (f, color, bone, k, x) => P.push(Object.assign({ f, color, bone, k }, x)), cutp = (f, k) => P.push({ f, cut: true, k }), paintp = (f, color, soft, a, m) => P.push({ f, paint: true, color, soft, a, m });
    const NOS = [0, 0, 0, 0], B = (f, x, y, z, r) => SD.bound(f, x, y, z, r, .02);
    pt(SD.ell(-.025, .13, 0, .1, .088, .09), skin, 'hips', 0, { wb: .04 });
    pt(SD.ell(.008, .175, 0, .093, .098, .088), skin, 'belly', .05, { wb: .04 });
    pt(SD.ell(.025, .24, 0, .072, .078, .07), skin, 'chest', .05, { wb: .04 });
    pt(SD.cone(.032, .262, 0, .078, .345, 0, .057, .046), skin, 'neck', .05, { wb: .03 });
    pt(SD.ell(.088, .332, 0, .038, .036, .038), skin, 'throat', .03, { wb: .02 });
    pt(SD.ell(.072, .425, 0, .098, .088, .094), skin, 'head', .045);
    pt(SD.ell(.105, .458, 0, .07, .052, .068), skin, 'head', .04);
    pt(SD.ell(.165, .398, 0, .066, .036, .052), skin, 'head', .035);
    pt(SD.ell(.155, .352, 0, .062, .024, .046), skin, 'jaw', .02, { wb: .006 });
    pt(SD.ell(.112, .353, 0, .05, .026, .05), skin, 'jaw', .03, { wb: .008 });
    pt(SD.cone(-.03, .13, 0, TP[0][0], TP[0][1], 0, .06, .05), skin, 'hips', .04, { wb: .03 });
    for (let i = 0; i < 6; i++) pt(SD.cone(TP[i][0], TP[i][1], 0, TP[i + 1][0], TP[i + 1][1], 0, TRr[i], TRr[i + 1]), skin, 't' + i, .025, { wb: .025 });
    for (const s of SIDES) { const n = SN(s);
      pt(B(SD.ell(.125, .468, s * .058, .045, .032, .04), .125, .468, s * .058, .05), skin, 'head', .03);
      pt(B(SD.ell(.125, .388, s * .058, .045, .036, .034), .125, .388, s * .058, .05), skin, 'cheek' + n, .03, { wb: .02 });
      pt(B(SD.sph(.222, .41, s * .017, .009), .222, .41, s * .017, .01), skin, 'head', .012);
      pt(SD.lock([.122, .478, s * .032], [.152, .493, s * .058], [.176, .478, s * .082], .0078, .0055), skin, 'brow' + n, .012, { wb: .008, m: [0, 1, .5, 0] });
      pt(SD.lock([.04, .505, s * .04], [.012, .532, s * .048], [-.014, .55, s * .05], .0135, .0038), horn, 'head', .01, { m: [0, 0, .15, 0] });
      pt(B(SD.ell(0, .095, s * .064, .048, .052, .04), 0, .095, s * .064, .055), skin, 'lg' + n + 'u', .04, { wb: .02 });
      pt(B(SD.cone(.026, .068, s * .066, 0, .03, s * .067, .02, .016), .013, .049, s * .066, .045), skin, 'lg' + n + 'l', .02, { wb: .015 });
      pt(B(SD.ell(.026, .017, s * .068, .042, .0175, .031), .026, .017, s * .068, .045), skin, 'lg' + n + 'f', .02, { wb: .012 });
      for (const d of [-1, 0, 1]) pt(B(SD.sph(.064, .0135, s * .068 + d * .018, .0115), .064, .0135, s * .068 + d * .018, .013), skin, 'lg' + n + 'f', .008, { wb: .012 });
      pt(B(SD.cone(.068, .238, s * .05, .094, .205, s * .06, .0155, .012), .081, .222, s * .055, .03), skin, 'au' + n, .02, { wb: .015 });
      pt(B(SD.cone(.094, .205, s * .06, .11, .181, s * .059, .012, .011), .102, .193, s * .06, .025), skin, 'al' + n, .012, { wb: .012 });
      pt(B(SD.ell(.116, .173, s * .059, .0155, .0135, .0145), .116, .173, s * .059, .018), skin, 'hand' + n, .01, { wb: .01 });
      cutp(SD.sph(...EYE(s), E_R + .0035), .01); cutp(SD.sph(.229, .4135, s * .0175, .0042), .003);
      paintp(SD.sph(.155, .392, s * .062, .017), col('#f3a4c4'), .012, .4, [0, 1, 1, 1]); }
    const ym = x => .3685 + .016 * (1 - sm(.1, .168, x));
    cutp((x, y, z) => Math.max(Math.abs(y - ym(x)) - .0024, .099 - x, Math.abs(z) - .068), .002);
    paintp(SD.ell(.082, .2, 0, .066, .17, .06), CRM, .006, 1, [1, 0, 0, 0]); paintp(SD.ell(.14, .33, 0, .075, .022, .04), CRM, .006, 1, [1, 0, 0, 0]);
    paintp((x, y) => y - .0045, PAD, .002, .9, NOS);
    const JI = rg.names.indexOf('jaw'), HI = rg.names.indexOf('head');
    const rule = (x, y, z, acc) => { if (x > .1 && Math.abs(z) < .07 && y > .32 && y < .4) { const k = sm(.0015, -.0015, y - ym(x)); acc[JI] = Math.max(acc[JI], k); if (k > .5) acc[HI] *= 1 - k; } };
    const HR = SD.cone(.02, .445, 0, .17, .395, 0, .112, .09);   // the head is carved finer than the body; they overlap in a 12 mm band
    const geoH = carve({ parts: P, rig: rg, bb: [-.11, .265, -.13, .27, .572, .13], h: .0042, ao: .006, rule, clip: (x, y, z) => HR(x, y, z) - .012, keep: 1 });
    const geo = carve({ parts: P, rig: rg, bb: [-.43, -.012, -.13, .27, .572, .13], h: .0072, ao: .006, rule, clip: HR, off: .0006 });
    const f = geo.userData.f;
    // ---- spots: projected onto the clay, clustered round the eyes and along the back (ref 1)
    const R = rng(1977), SP = [], gr = (x, y, z) => { const e = .0008; return [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]; };
    const belly = SD.ell(.082, .2, 0, .07, .175, .065), eyes = SIDES.map(EYE);
    const tryS = (x, y, z, r) => { if (SP.length >= NSP) return; for (let i = 0; i < 8; i++) { const d = f(x, y, z), g = gr(x, y, z), l = Math.hypot(...g) || 1; x -= g[0] / l * d; y -= g[1] / l * d; z -= g[2] / l * d; }
      if (Math.abs(f(x, y, z)) > .0015 || belly(x, y, z) < .004 || y < .02) return; for (const e of eyes) if (Math.hypot(x - e[0], y - e[1], z - e[2]) < E_R + .006 + r) return;
      if (x > .1 && y < .38 && y > .33) return; for (const q of SP) if (Math.hypot(x - q[0], y - q[1], z - q[2]) < r + q[3] + .0016) return; SP.push([x, y, z, r]); };
    const cluster = (c, rad, n, r0, r1) => { for (let i = 0; i < n; i++) { const a = R() * TAU, b = Math.acos(2 * R() - 1), q = rad * Math.cbrt(R()); tryS(c[0] + q * Math.sin(b) * Math.cos(a), c[1] + q * Math.cos(b), c[2] + q * Math.sin(b) * Math.sin(a), lerp(r0, r1, R() * R())); } };
    for (const s of SIDES) { cluster([.1, .47, s * .085], .03, 34, .0022, .0058); cluster([.12, .43, s * .1], .02, 14, .002, .004); cluster([.19, .425, s * .03], .018, 8, .0018, .0035); cluster([.04, .5, s * .06], .03, 12, .003, .007);
      for (let i = 0; i < 9; i++) { const u = i / 8; cluster([lerp(.0, -.11, u), lerp(.4, .17, u), s * lerp(.04, .055, u)], .012, 3, lerp(.006, .011, u), lerp(.009, .015, u)); }
      for (let i = 0; i < 6; i++) { const p = TP[i]; cluster([p[0], p[1] + TRr[i] * .7, s * TRr[i] * .6], .01, 3, TRr[i] * .12, TRr[i] * .26); }
      cluster([0, .12, s * .1], .03, 7, .004, .008); cluster([.03, .27, s * .06], .02, 4, .003, .006); }
    SP.forEach((q, i) => U.uSp.value[i].set(q[0], q[1], q[2], q[3]));
    // ---- lids: shells round each eye that turn about the eye's side axis; brows are in the clay (bones brow L/R)
    const extra = [];
    for (const s of SIDES) { const n = SN(s), b = basis(GAZE(s)), c = EYE(s);
      const lidG = (up, a0, span, fat) => { const r = E_R * fat, P_ = th => ph => { const x = r * Math.sin(th) * Math.cos(ph), y = r * Math.sin(th) * Math.sin(ph), z = r * Math.cos(th); return [c[0] + b.f.x * x + b.u.x * y + b.s.x * z, c[1] + b.f.y * x + b.u.y * y + b.s.y * z, c[2] + b.f.z * x + b.u.z * y + b.s.z * z]; };
        const g = Geo.surf((u, v) => P_(.26 + u * (PI - .52))(up * (a0 + v * span)), 14, 6, { flip: up < 0 }); Geo.paint(g, (x, y, z, nx, ny, nz, u, v) => _cc.copy(BL).lerp(BD, .35 * v).multiplyScalar(lerp(.82, 1, sm(0, .25, v))));
        const rim = Geo.tube(Array.from({ length: 15 }, (_, i) => P_(.26 + i / 14 * (PI - .52))(up * a0)), E_R * .075, 6); Geo.paint(rim, '#5a8fcb');
        return [g, rim].map(q => bind(rg, q, (up > 0 ? 'lidU' : 'lidL') + n, [0, .6, .45, 0])); };
      extra.push(...lidG(1, 1.05, 1.65, 1.1), ...lidG(-1, .95, 1.25, 1.09));
      // wing arm and finger bones (clay), thumb claw
      const S_ = WS(s), W_ = WW(s), tubeB = (pts, r0, r1, bone) => { const g = Geo.tube(pts, u => lerp(r0, r1, u), 8, { smooth: 10 }); Geo.paint(g, (x, y, z, nx, ny) => _cc.copy(BL).lerp(BD, .5 * sm(0, .8, ny))); return bind(rg, g, bone, [0, 1, 1, 0]); };
      extra.push(bind(rg, Geo.tube([S_, [lerp(S_[0], W_[0], .5), lerp(S_[1], W_[1], .5) + .008, lerp(S_[2], W_[2], .5)], W_], u => lerp(.0115, .0085, u), 9, { smooth: 10 }), (x, y, z) => { const u = clamp(Math.hypot(x - S_[0], y - S_[1], z - S_[2]) / .1); return [['wA' + n, 1 - sm(.75, 1, u)], ['wB' + n, sm(.75, 1, u)]]; }, [0, 1, 1, 0]));
      Geo.paint(extra[extra.length - 1], (x, y, z, nx, ny) => _cc.copy(BL).lerp(BD, .5 * sm(0, .8, ny)));
      WF(s).forEach((F_, i) => extra.push(tubeB([W_, [lerp(W_[0], F_[0], .5), lerp(W_[1], F_[1], .5) + .006, lerp(W_[2], F_[2], .5)], F_], .006, .0018, 'wF' + i + n)));
      const th = Geo.cyl(.0035, .0005, .014, 8); th.applyMatrix4(new THREE.Matrix4().makeRotationZ(-.9)); th.translate(W_[0] + .006, W_[1] + .006, W_[2]); Geo.paint(th, '#fbf3e0'); extra.push(bind(rg, th, 'wB' + n, [0, 0, 0, 0])); }
    // the twig (a prop she carries in the cave), on its own root bone
    const tw = Geo.tube([[-.03, 0, 0], [0, .003, .001], [.035, -.002, -.002], [.07, .002, 0]], u => lerp(.0034, .0022, u), 6, { smooth: 8 }), tf = Geo.tube([[.022, 0, 0], [.035, .009, .006], [.042, .016, .01]], u => lerp(.0018, .001, u), 5, { smooth: 4 });
    const twg = Geo.merge([tw, tf]); twg.translate(.3, .37, 0); Geo.paint(twg, (x) => _cc.set(.32, .17, .08).multiplyScalar(.85 + .3 * h1(Math.floor(x * 300)))); extra.push(bind(rg, twg, 'twig', [0, 0, 0, 0]));
    const all = Geo.merge([geoH, geo, ...extra]);
    const mat = Mat.hook(Mat.make('clay', { vcol: true, rough: .62, scale: 9, bump: .0016 }), hookBody);
    body = Sculpt.skinned(all, mat, rg); body.name = 'ember-body'; group.add(body);
    return f;
  }
  // ---- felt: fin-ears, jaw frills, crest petals, tail fan, wing membranes ------------------------------------------------------------------------
  function fin(o) { const n = o.sp.length, D = o.sp.map(q => V3(...q.d).normalize()), B0 = V3(...o.base), cu = V3(...(o.curl || [0, 0, 0])), nu = (n - 1) * (o.nu || 5), nv = o.nv || 7, d = V3(), p = V3(), sc = o.scal === undefined ? .22 : o.scal;
    const ptF = (u, v, out) => { const x = u * (n - 1), i = Math.min(n - 2, Math.floor(x)), f = x - i; d.copy(D[i]).lerp(D[i + 1], f).normalize(); const L = lerp(o.sp[i].L, o.sp[i + 1].L, f) * (1 - sc * Math.sin(PI * f) * sm(.25, 1, v)); return out.copy(B0).addScaledVector(d, L * v).addScaledVector(cu, v * v * L); };
    const c0 = col(o.c0 || '#c8458a'), c1 = col(o.c1 || '#f7a8cc'), cs = col(o.cs || '#b0367a'), out = [];
    const mem = Geo.surf((u, v) => { ptF(u, v, p); return [p.x, p.y, p.z]; }, nu, nv); const uvA = mem.attributes.uv;
    Geo.paint(mem, (x, y, z, nx, ny, nz, u, v) => { const f = fract(u * (n - 1) + 1e-6), e = 1 - sm(0, .14, Math.min(f, 1 - f)); return _cc.copy(c0).lerp(c1, Math.pow(v, 1.3)).lerp(cs, e * .55 * (1 - v * .4)).multiplyScalar(lerp(.8, 1, sm(0, .3, v))); });
    out.push(bind(rg, mem, (x, y, z, i) => o.w(uvA.getX(i), uvA.getY(i))));
    for (let i = 0; i < n; i++) { const pts = []; for (let k = 0; k <= 7; k++) { ptF(i / (n - 1), k / 7 * .98, p); pts.push([p.x, p.y, p.z]); } const g = Geo.tube(pts, u => (o.spR || .0026) * (1 - .7 * u), 5); Geo.paint(g, cs); const uu = i / (n - 1); out.push(bind(rg, g, (x, y, z, j) => o.w(uu, clamp(Math.floor(j / 6) / 9)))); }
    return out; }
  function buildFelt() {
    const L = [];
    for (const s of SIDES) { const n = SN(s), ew = (u, v) => [['ear' + n, 1 - sm(.25, .6, v)], ['earT' + n, sm(.25, .6, v)]];
      L.push(...fin({ base: [.022, .468, s * .07], sp: [{ d: [-.42, .87, s * .3], L: .118 }, { d: [-.74, .52, s * .42], L: .148 }, { d: [-.93, .14, s * .4], L: .128 }, { d: [-.86, -.3, s * .38], L: .082 }], curl: [-.05, -.08, s * .05], w: ew, nu: 6, nv: 8, spR: .003 }));
      L.push(...fin({ base: [.062, .382, s * .082], sp: [{ d: [-.55, -.15, s * .8], L: .046 }, { d: [-.78, -.55, s * .35], L: .058 }, { d: [-.5, -.86, s * .1], L: .042 }], w: () => [['head', 1]], nu: 4, nv: 5, scal: .28, spR: .0018 }));
      // wing membrane: a fan from the wrist (rays: F0 F1 F2 body-point shoulder)
      const W_ = V3(...WW(s)), rays = [...WF(s), WBP(s), WS(s)].map(q => V3(...q)), bones = ['wF0' + n, 'wF1' + n, 'wF2' + n, 'chest', 'wA' + n], NU = 24, NV = 7, p = V3();
      const mem = Geo.surf((u, v) => { const x = u * 4, i = Math.min(3, Math.floor(x)), f = x - i, sc = i < 3 ? .26 * Math.sin(PI * f) : 0; p.copy(rays[i]).lerp(rays[i + 1], f).sub(W_).multiplyScalar(v * (1 - sc * sm(.3, 1, v))).add(W_); return [p.x, p.y, p.z]; }, NU, NV);
      const uvA = mem.attributes.uv, cw = col('#f08ab8'), ce = col('#fbc2dc'), cv = col('#c24a86');
      Geo.paint(mem, (x, y, z, nx, ny, nz, u, v) => { const f = fract(u * 4 + 1e-6), e = 1 - sm(0, .08, Math.min(f, 1 - f)); return _cc.copy(cw).lerp(ce, sm(.6, 1, v) * .7).lerp(cv, e * .5 * (u < .76 ? 1 : 0)); });
      L.push(bind(rg, mem, (x, y, z, i) => { const u = uvA.getX(i) * 4, v = uvA.getY(i), k = Math.min(3, Math.floor(u)), f = u - k; return [['wB' + n, 1 - v], [bones[k], v * (1 - f)], [bones[k + 1], v * f]].filter(e => e[1] > 1e-3).slice(0, 4); })); }
    // crest petals down the midline: head, neck, back, tail
    const crest = [[.09, .512, .03, .25, 'head'], [.055, .523, .036, .55, 'head'], [.02, .52, .033, .85, 'head'], [-.012, .49, .028, 1.25, 'neck'], [-.03, .44, .024, 1.45, 'neck'], [-.045, .385, .021, 1.6, 'chest'], [-.068, .33, .02, 1.75, 'chest'], [-.098, .26, .019, 1.9, 'spine'], [-.118, .19, .017, 2.05, 'hips'],
      [-.13, .14, .015, 2.2, 't0'], [-.16, .118, .013, 2.35, 't1'], [-.215, .098, .011, 2.45, 't2'], [-.27, .089, .01, 2.4, 't3']];
    for (const [x, y, h, a, bn] of crest) { const d = a => [Math.cos(a), Math.sin(a), 0]; L.push(...fin({ base: [x, y - .006, 0], sp: [{ d: d(a + .55), L: h * .7 }, { d: d(a), L: h }, { d: d(a - .55), L: h * .75 }], w: () => [[bn, 1]], nu: 3, nv: 4, scal: .1, spR: .0016, c0: '#c03f82', c1: '#f39ac4' })); }
    // tail fan (spade) on t5
    L.push(...fin({ base: [-.378, .135, 0], sp: [{ d: [-.35, .94, 0], L: .055 }, { d: [-.82, .57, 0], L: .074 }, { d: [-1, .02, 0], L: .066 }, { d: [-.62, -.6, 0], L: .046 }], w: () => [['t5', 1]], nu: 5, nv: 6, scal: .2, spR: .0024 }));
    const g = Geo.merge(L); Geo.normals(g, false);
    felt = new THREE.SkinnedMesh(g, Mat.make('felt', { vcol: true, double: true, trans: .6, transColor: '#ffb4d6', scale: 40, bump: .0012, sheen: .6 })); felt.bind(body.skeleton, body.bindMatrix); felt.castShadow = felt.receiveShadow = true; felt.frustumCulled = false; group.add(felt);
  }
  function buildGloss() {
    const L = [], aE = (g, w, fr) => { const P = g.attributes.position, n = P.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { if (fr) { a[i * 4] = P.getX(i) / E_R; a[i * 4 + 1] = P.getY(i) / E_R; a[i * 4 + 2] = P.getZ(i) / E_R; } a[i * 4 + 3] = w; } g.setAttribute('aE', new THREE.BufferAttribute(a, 4)); return g; };
    for (const s of SIDES) { const n = SN(s), b = basis(GAZE(s)), Mx = new THREE.Matrix4().makeBasis(b.f, b.u, b.s).setPosition(...EYE(s));
      const ball = aE(Geo.sphere(E_R, 32, 22), 1, true); ball.applyMatrix4(Mx); Geo.paint(ball, '#ffffff'); L.push(bind(rg, ball, 'eye' + n));
      const hl = (up, sd, a) => { const q = aE(capG(E_R * 1.025, a, 14, 3), 2); q.applyMatrix4(new THREE.Matrix4().makeRotationZ(up)); q.applyMatrix4(new THREE.Matrix4().makeRotationY(sd)); q.applyMatrix4(Mx); Geo.paint(q, '#ffffff'); L.push(bind(rg, q, 'head')); };
      hl(.46, -.34, .2); hl(-.32, .3, .085);
      const claw = (a, b, r, bone) => { const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L_ = d.length(), g = Geo.cyl(r, r * .15, L_, 7); g.translate(0, L_ / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(YA, d.normalize()))); g.translate(...a); Geo.paint(g, (x, y, z) => _cc.set(.98, .94, .86).lerp(_cc2.set(.86, .74, .62), sm(.6, 1, Math.hypot(x - a[0], y - a[1], z - a[2]) / L_))); L.push(bind(rg, aE(g, 0), bone)); };
      for (const d of [-1, 0, 1]) { claw([.07, .0155, s * .068 + d * .019], [.088, .006, s * .068 + d * .022], .0042, 'lg' + n + 'f'); claw([.124, .169, s * .059 + d * .008], [.135, .156, s * .059 + d * .0095], .0028, 'hand' + n); }
      const fang = Geo.cyl(.0004, .0033, .0085, 7); fang.translate(.2, .3665, s * .019); Geo.paint(fang, '#fbf6e6'); L.push(bind(rg, aE(fang, 0), 'head'));
      const lt = Geo.cyl(.0026, .0003, .0045, 6); lt.translate(.188, .3635, s * .028); Geo.paint(lt, '#fbf6e6'); L.push(bind(rg, aE(lt, 0), 'jaw')); }
    const ell3 = (c, r, color, bone) => { const g = Geo.sphere(1, 20, 12); g.scale(...r); g.translate(...c); Geo.paint(g, color); return bind(rg, aE(g, 0), bone); };
    L.push(ell3([.165, .379, 0], [.062, .0065, .043], '#4a1626', 'head'), ell3([.1, .372, 0], [.03, .018, .035], '#3e1020', 'head'), ell3([.158, .362, 0], [.052, .0075, .034], '#d66a88', 'jaw'));
    const g = Geo.merge(L); gloss = new THREE.SkinnedMesh(g, Mat.hook(Mat.make('ceramic', { vcol: true, rough: .12, coat: 1, coatRough: .03, scale: 60, bump: .0003 }), hookEye));
    gloss.bind(body.skeleton, body.bindMatrix); gloss.castShadow = false; gloss.receiveShadow = true; gloss.frustumCulled = false; group.add(gloss);
  }

  // ---- the egg: a shell of rigid pieces (one bone each), cracks drawn on the piece borders, an inner light ---------------------------------------------
  const pivot = new THREE.Group(); let eggMesh, CAPF = C.HATCH + 1.37;
  function buildEgg() {
    const H = EGG_H, RW = .152, NU = 72, NV = 52, TH = .0055, R = rng(4471), nrm = (x, y, z) => V3(x / (RW * RW), y / (H * H / 4), z / (RW * RW)).normalize();
    const surfP = (th, ph) => { const c = Math.cos(th), r = RW * Math.sin(th) * (1 + .085 * c); return [r * Math.cos(ph), -c * H / 2, r * Math.sin(ph)]; };
    const V = [[0, -H / 2, 0]]; for (let i = 1; i < NV; i++) for (let j = 0; j < NU; j++) V.push(surfP((i + (R() - .5) * .42) / NV * PI, (j + (R() - .5) * .5 + (i % 2) * .5) / NU * TAU)); V.push([0, H / 2, 0]);
    const top = V.length - 1, vid = (i, j) => 1 + (i - 1) * NU + ((j % NU) + NU) % NU, T = [];
    for (let j = 0; j < NU; j++) { T.push([0, vid(1, j), vid(1, j + 1)]); T.push([top, vid(NV - 1, j + 1), vid(NV - 1, j)]); }
    for (let i = 1; i < NV - 1; i++) for (let j = 0; j < NU; j++) { const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j), d = vid(i + 1, j + 1); if (i % 2) { T.push([a, b, d], [a, d, c]); } else { T.push([a, b, c], [b, d, c]); } }
    const VN = V.map(p => nrm(...p)), cen = q => [(V[q[0]][0] + V[q[1]][0] + V[q[2]][0]) / 3, (V[q[0]][1] + V[q[1]][1] + V[q[2]][1]) / 3, (V[q[0]][2] + V[q[1]][2] + V[q[2]][2]) / 3];
    T.forEach(q => { const a = V3(...V[q[0]]), b = V3(...V[q[1]]), c = V3(...V[q[2]]), n = V3().crossVectors(b.clone().sub(a), c.clone().sub(a)), m = cen(q); if (n.x * m[0] + n.y * m[1] + n.z * m[2] < 0) { const t = q[1]; q[1] = q[2]; q[2] = t; } });
    const seeds = [[0, 1, 0]]; for (let k = 0; k < 4; k++) { const a = deg(45 + 90 * k); seeds.push([Math.cos(a) * .835, .55, Math.sin(a) * .835]); } for (let k = 0; k < 5; k++) { const a = deg(10 + 72 * k); seeds.push([Math.cos(a), .08, Math.sin(a)]); }
    const cutY = ph => -.012 + .016 * Math.sin(3 * ph + .5) + .01 * Math.sin(7 * ph + 2) + .006 * Math.sin(13 * ph + 1);
    const piece = T.map(q => { const c = cen(q), ph = Math.atan2(c[2], c[0]); if (c[1] < cutY(ph)) return 0; const u = V3(c[0] / RW, c[1] / (H / 2), c[2] / RW).normalize(), w = .1 * NZ.n3(c[0] * 28, c[1] * 28, c[2] * 28); let best = 0, bd = 1e9;
      seeds.forEach((s, i) => { const d = (u.x - s[0]) ** 2 + (u.y - s[1]) ** 2 + (u.z - s[2]) ** 2 + w * (i % 2 ? 1 : -1); if (d < bd) { bd = d; best = i; } }); return best + 1; });
    const NP = seeds.length + 1, EM = new Map(), ek = (a, b) => a < b ? a * 1e5 + b : b * 1e5 + a; T.forEach((q, ti) => { for (let e = 0; e < 3; e++) { const k = ek(q[e], q[(e + 1) % 3]); (EM.get(k) || EM.set(k, []).get(k)).push(ti); } });
    const ia = .62 * PI, ip = Math.atan2(.5, -.75), IP = surfP(ia, ip), bnd = (a, b, ti) => { const L_ = EM.get(ek(a, b)); if (!L_ || L_.length < 2) return 9; const o = L_[0] === ti ? L_[1] : L_[0]; if (piece[o] === piece[ti]) return 9; return Math.hypot((V[a][0] + V[b][0]) / 2 - IP[0], (V[a][1] + V[b][1]) / 2 - IP[1], (V[a][2] + V[b][2]) / 2 - IP[2]); };
    const pos = [], nor = [], cl = [], aB = [], aC = [], aH = [], si = [], ix = []; let nv = 0;
    const push = (p, n, c, b, cc, hh, pc) => { pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); cl.push(c.r, c.g, c.b); aB.push(...b); aC.push(...cc); aH.push(...hh); si.push(pc, 0, 0, 0); return nv++; };
    const BLU = col('#68a8e3'), BLD = col('#4d8bd0'), INR = col('#f4e8cf'), WAL = col('#efe2c6'), cN = V3();
    T.forEach((q, ti) => { const pc = piece[ti], P3 = q.map(i => V[i]), c = cen(q), dE = [bnd(q[1], q[2], ti), bnd(q[2], q[0], ti), bnd(q[0], q[1], ti)];
      const A = V3(...P3[0]), Bv = V3(...P3[1]), Cv = V3(...P3[2]), area2 = V3().crossVectors(Bv.clone().sub(A), Cv.clone().sub(A)).length(), hh = [area2 / Bv.distanceTo(Cv), area2 / Cv.distanceTo(A), area2 / A.distanceTo(Bv)];
      const k = .5 + .5 * NZ.n3(c[0] * 9, c[1] * 9, c[2] * 9), oc = _cc.copy(BLU).lerp(BLD, .35 * sm(.05, -.2, c[1]) + .25 * k).clone();
      const o = q.map((vi, e) => push(V[vi], VN[vi], oc, [e === 0 ? 1 : 0, e === 1 ? 1 : 0, e === 2 ? 1 : 0, 0], dE, hh, pc)); ix.push(o[0], o[1], o[2]);
      const inr = q.map(vi => push([V[vi][0] - VN[vi].x * TH, V[vi][1] - VN[vi].y * TH, V[vi][2] - VN[vi].z * TH], cN.copy(VN[vi]).negate(), INR, [0, 0, 0, 1], [9, 9, 9], [1, 1, 1], pc)); ix.push(inr[0], inr[2], inr[1]);
      for (let e = 0; e < 3; e++) { if (dE[(e + 2) % 3] > 8) continue; const a = q[e], b = q[(e + 1) % 3], pa = V[a], pb = V[b], na = VN[a], nb = VN[b];
        const ia_ = [pa[0] - na.x * TH, pa[1] - na.y * TH, pa[2] - na.z * TH], ib_ = [pb[0] - nb.x * TH, pb[1] - nb.y * TH, pb[2] - nb.z * TH], ed = V3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), wn = V3().crossVectors(ed, na).normalize();
        if (wn.x * ((pa[0] + pb[0]) / 2 - c[0]) + wn.y * ((pa[1] + pb[1]) / 2 - c[1]) + wn.z * ((pa[2] + pb[2]) / 2 - c[2]) < 0) wn.negate(); const w0 = push(pa, wn, WAL, [0, 0, 0, 2], [9, 9, 9], [1, 1, 1], pc), w1 = push(pb, wn, WAL, [0, 0, 0, 2], [9, 9, 9], [1, 1, 1], pc), w2 = push(ib_, wn, WAL, [0, 0, 0, 2], [9, 9, 9], [1, 1, 1], pc), w3 = push(ia_, wn, WAL, [0, 0, 0, 2], [9, 9, 9], [1, 1, 1], pc);
        const tn = V3().crossVectors(V3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), V3(ib_[0] - pa[0], ib_[1] - pa[1], ib_[2] - pa[2])); if (tn.dot(wn) > 0) ix.push(w0, w1, w2, w0, w2, w3); else ix.push(w0, w2, w1, w0, w3, w2); } });
    const g = new THREE.BufferGeometry(), F32 = a => new Float32Array(a); g.setAttribute('position', new THREE.BufferAttribute(F32(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(F32(nor), 3)); g.setAttribute('color', new THREE.BufferAttribute(F32(cl), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setAttribute('aB', new THREE.BufferAttribute(F32(aB), 4)); g.setAttribute('aC', new THREE.BufferAttribute(F32(aC), 3)); g.setAttribute('aH', new THREE.BufferAttribute(F32(aH), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(F32(si), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(F32(si.map((_, i) => i % 4 ? 0 : 1)), 4)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
    const def = {}; for (let i = 0; i < NP; i++) def['e' + i] = { pos: [0, 0, 0] }; rgE = Sculpt.rig(def);
    eggMesh = Sculpt.skinned(g, Mat.hook(Mat.make('ceramic', { vcol: true, rough: .22, coat: .9, coatRough: .06, scale: 9, bump: .0007 }), hookEgg), rgE); eggMesh.name = 'egg';
    eggMesh.position.y = H / 2; pivot.add(eggMesh); eggG.add(pivot); eggG.position.set(EGG_C.x, EGG_C.y - H / 2, EGG_C.z);
    // spots on the shell
    const ES = []; for (let i = 0; i < 400 && ES.length < NSE; i++) { const th = Math.acos(1 - 2 * R()), ph = R() * TAU; if (th < .5 && R() < .6) continue; const p = surfP(th, ph), r = lerp(.006, .021, R() * R()); if (ES.some(q => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < r + q[3] + .006)) continue; ES.push([...p, r]); }
    ES.forEach((q, i) => U.uSpE.value[i].set(...q));
    // flights: every top piece flies on a ballistic arc and settles on the nest floor
    const floor = -H / 2, Rq = rng(99);
    for (let p = 0; p < NP; p++) { const vs = []; T.forEach((q, ti) => { if (piece[ti] === p) q.forEach(i => vs.push(V3(...V[i]))); }); const c = V3(); vs.forEach(v => c.add(v)); c.multiplyScalar(1 / Math.max(1, vs.length));
      const n = c.clone().sub(V3(0, -.03, 0)).normalize(), up = p === 1 || Rq() < .55, qr = new THREE.Quaternion().setFromUnitVectors(n, V3(0, up ? 1 : -1, 0)); qr.premultiply(new THREE.Quaternion().setFromAxisAngle(YA, Rq() * TAU));
      let mn = 1e9; vs.forEach(v => { const w = v.clone().sub(c).applyQuaternion(qr); mn = Math.min(mn, w.y - (up ? TH : 0)); });
      const a = Math.atan2(n.z, n.x) + (Rq() - .5) * .7, rr = p === 1 ? .34 : .19 + .24 * Rq(), land = V3(Math.cos(a) * rr, floor - mn + .001, Math.sin(a) * rr);
      const Tf = p === 1 ? .5 : .3 + .22 * Rq(), v0 = land.clone().sub(c).multiplyScalar(1 / Tf); v0.y += 4.9 * Tf; const ax = V3(Rq() - .5, Rq() - .5, Rq() - .5).normalize();
      pieces.push({ c, qr, land, Tf, v0, ax, spin: (2 + 3 * Rq()) * (Rq() < .5 ? -1 : 1) }); }
  }
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4(), _p = V3(), _s = V3(), _e = V3();
  const capLocal = new THREE.Matrix4().compose(V3(.058, .503, -.006), new THREE.Quaternion().setFromEuler(new THREE.Euler(.12, 0, .32)), V3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -(EGG_H / 2 - .028), 0));
  function setPiece(i, m) { const b = rgE.bones['e' + i]; m.decompose(b.position, b.quaternion, b.scale); }
  function flight(P, u, mOut, from) { // u = seconds since launch; from = start matrix (egg-local, maps piece bind coords) or null for in-place
    const k = clamp(u / P.Tf); if (!from) { _p.copy(P.c).addScaledVector(P.v0, Math.min(u, P.Tf)); _p.y -= 4.9 * Math.min(u, P.Tf) ** 2; }
    else { _p.copy(P.c).applyMatrix4(from).lerp(P.land, k); _p.y += 4 * .22 * k * (1 - k); }
    const hop = u > P.Tf && u < P.Tf + .16 ? .018 * Math.sin(PI * (u - P.Tf) / .16) : 0; _p.y += hop;
    _q.identity(); if (from) { from.decompose(_s, _q, _e); } _q.slerp(P.qr, sm(0, 1, k)); _q2.setFromAxisAngle(P.ax, P.spin * 4 * k * (1 - k)); _q.premultiply(_q2);
    if (u >= P.Tf) { _p.copy(P.land); _p.y += hop; _q.copy(P.qr); }
    mOut.compose(_p, _q, V3(1, 1, 1)); _m5.makeTranslation(-P.c.x, -P.c.y, -P.c.z); mOut.multiply(_m5); return mOut; }

  // ---- her own two practice rocks on the ledge (only if the set has none) -------------------------------------------------------------------------
  function buildRocks() { const mk = (hh, w, seed) => { const R = rng(seed), lumps = [0, 1, 2, 3].map(() => [(R() - .5) * w, hh * (.35 + .4 * R()), (R() - .5) * w, w * (.35 + .2 * R())]);
      const f0 = SD.SU(.12, SD.ell(0, hh * .45, 0, w * .62, hh * .55, w * .55), ...lumps.map(l => SD.sph(...l))), f = (x, y, z) => Math.max(f0(x, y, z) - .02 * NZ.fbm(x * 7 + seed, y * 7, z * 7, 3), y - hh, -y - .05);
      return Sculpt.build({ parts: [{ f, color: (x, y, z) => _cc.set(.21, .19, .18).lerp(col('#8f8a70'), .5 * sm(.3, .7, NZ.fbm(x * 5, y * 5 + seed, z * 5, 3) + .5)).multiplyScalar(lerp(.7, 1.05, sm(-.02, hh, y))) }], bb: [-w * 1.1, -.06, -w * 1.1, w * 1.1, hh + .02, w * 1.1], res: 64 }); };
    const a = mk(.6, .7, 3), b = mk(1.1, .95, 7); a.translate(RL.x, RL.y - .6, RL.z); b.translate(RH.x, RH.y - 1.1, RH.z);
    rocks = Mat.mesh(Geo.merge([a, b]), Mat.make('stone', { vcol: true, scale: 3, bump: .005 })); rocks.name = 'ember-rocks'; rocks.visible = false; return rocks; }

  // ================================================================ performance: the acting, as channels ===================================================
  const A = {}; const R_ = { x: 0, y: 0, z: 0, yaw: 0, air: 0, u: 0, seg: -1, m: null, pitch: 0, bank: 0 }; let FIRE = 0, PUFF = 0, pokeT = -99;
  const _l = V3(), _l2 = V3(), _hw = V3();
  function reset() { Object.assign(A, { dx: 0, lift: 0, crouch: 0, lean: 0, roll: 0, twist: 0, spP: 0, chP: 0, chY: 0, chR: 0, nkP: 0, nkY: 0, hdP: 0, hdY: 0, hdR: 0, jaw: 0, cheek: 0, throat: 0, breath: 0, bRate: 2.6, swell: 0, squash: 0,
    eyeY: 0, eyeP: 0, lid: 0, lidL: 0, squint: 0, browUp: .25, smile: .6, browIn: 0, pupil: .3, earUp: .55, earBack: 0, flick: 0, flutter: 0, wing: .12, flap: 0, wave: 0, waveA: 0, shield: 0, armP: 0, armIn: 0, elbow: 0,
    tailUp: .1, tailCurl: 0, tailSide: 0, tailWag: 0, tailWF: 6, legFK: 0, lgP: .25, lgK: -.55, lgF: .25, legKick: 0, stampL: 0, stampR: 0, shiver: 0, glow: 0, blaze: 0, look: null, lookW: 0, lookBody: 0, eyeAt: null, eyeW: 0, vis: 1 }); }
  const B8 = Score.byName.train.beatS / 2, FKC = (Score.sounds.find(s => s.who === 'ember' && s.fake) || { t: C.IMITATE + 1.5 }).t, HRM = (Score.sounds.find(s => s.who === 'ash' && s.kind === 'hrmph' && s.t > C.CAVE) || { t: C.CAVE + 3 }).t, SND = Score.sounds.filter(s => s.who === 'ember'), V_ = { jaw: 0, throat: 0, kind: '' };
  function voice(t) { V_.jaw = 0; V_.throat = 0; V_.kind = '';
    for (const s of SND) { if (t < s.t - .6 || t > s.t + s.dur + .4) continue; const u = (t - s.t) / s.dur; let j = 0, th = 0;
      switch (s.kind) {
        case 'chirp': j = .42 * win(t, s.t, s.t + s.dur * .8, .03, .08) * (.65 + .35 * Math.sin(u * 19)); th = j; break;
        case 'squeak': j = .3 * win(t, s.t, s.t + s.dur * .7, .03, .06); th = j; break;
        case 'sneeze': j = .32 * sm(s.t - .5, s.t - .06, t) * (1 - sm(s.t - .05, s.t, t)) + .75 * kick(t, s.t, .12, .012); th = j; break;
        case 'cough': { let c = 0; for (let i = 0; i < (s.fake ? 2 : 3); i++) c = Math.max(c, kick(t, s.t + i * s.dur / 3.2, .09, .02)); j = .55 * c; th = c; break; }
        case 'yawn': j = win(t, s.t + .1, s.t + s.dur * .75, .35, .3); th = .4 * j; break;
        case 'whimper': j = .16 * win(t, s.t, s.t + s.dur, .08, .2) * (.6 + .4 * Math.sin(t * 31)); th = j * 2; break;
        case 'giggle': j = .34 * win(t, s.t, s.t + s.dur, .03, .1) * (.5 + .5 * Math.sin(u * TAU * 5)); th = j; break;
        case 'gasp': j = .6 * win(t, s.t, s.t + .35, .06, .4); th = .6 * j; break;
        case 'growl': j = .22 * win(t, s.t, s.t + s.dur, .05, .1) * (.8 + .2 * Math.sin(t * 60)); th = j * 1.5; break;
        case 'roar': j = win(t, s.t, s.t + s.dur, .1, .3); th = .7 * j; break; }
      if (j > V_.jaw) { V_.jaw = j; V_.kind = s.kind; } V_.throat = Math.max(V_.throat, th); } return V_; }
  const stroke = f => { const g = fract(f + .15); return g < .3 ? lerp(-1, 1, sm(0, .3, g)) : lerp(1, -1, sm(.3, 1, g)); };
  const flapEv = (t, a = 1) => { const e = Score.last('flap_ember', t); if (!e) return 0; const u = t - e.t; return u > .9 ? 0 : a * e.v * (u < .12 ? lerp(.2, 1.1, sm(0, .12, u)) : lerp(1.1, -.3, sm(.12, .6, u)) * (1 - sm(.6, .9, u))); };
  const happy = k => { A.lid = Math.max(A.lid, .5 * k); A.lidL = Math.max(A.lidL, .7 * k); A.browUp += .4 * k; A.smile += .5 * k; };
  function perform(t) {
    reset(); const b = Score.beat(t), lv = Score.level(t), nod = b.f < .2 ? sm(0, .2, b.f) : 1 - sm(.2, 1, b.f);
    A.hdP -= .045 * nod * (.35 + .65 * lv); A.nkP += .02 * nod; A.lid = blink(t, 3.7, 3.0); A.eyeY = .16 * (h1(Math.floor(t * .7 + 3)) - .5); A.eyeP = .08 * (h1(Math.floor(t * .7 + 3) + .5) - .5);
    for (const s of SIDES) { const k = Math.floor(t / 1.7 + s * .37), u = (t / 1.7 + s * .37 - k) * 1.7; if (h1(k * 7.1 + s) > .55) A.flick += s * ring(u, .3 + h1(k) * .8, 6.5, 7) * .5; }
    A.tailSide = .12 * Math.sin(t * 1.1); const vo = voice(t); A.jaw = vo.jaw; A.throat = vo.throat; if (vo.kind === 'giggle') happy(1);
    const m = R_.m;
    if (m.type === 'walk' && t > m.ta && t < m.tb) { const st = m.steps; let i = 0; while (i + 1 < st.length && st[i + 1] <= t) i++; const per = (st[i + 1] || st[i] + .3) - st[i], u = clamp((t - st[i]) / per), bo = Math.sin(PI * u); A.lift += .006 * bo - .006 * kick(t, st[i], .07, .01); A.roll += .05 * (m.side[i] ? 1 : -1) * (1 - u) * (t >= st[0] ? 1 : 0); A.hdP += .02 * bo; A.tailWag = .35; A.tailWF = PI / per; A.earUp += .1; }
    if (m.type === 'hop' && R_.air > .001) { A.wing = Math.max(A.wing, .5); A.flap += .55 * Math.sin(TAU * R_.u); A.lean -= .15; A.lgP = .75; A.lgK = -1.3; A.lgF = .6; A.earBack += .3; }
    if (m.type === 'leap' || m.type === 'glide') { A.lgP = .7; A.lgK = -1.3; A.lgF = .6; }
    const T = t;
    // ---------------- HATCH: rises out of the shell, cap falls, trots up onto the east rim, profile to the sun, tries to roar, sneezes
    if (T < C.CAVE) { const H0 = C.HATCH, em = sm(H0 - .02, H0 + .34, T), SZ = C.SNEEZE1;
      A.vis = T >= H0 - .01 ? 1 : 0; const inCup = 1 - sm(H0 + 1.5, H0 + 1.75, T); A.tailUp += 1.5 * inCup; A.tailCurl += 1.1 * inCup; A.tailSide *= 1 - inCup; A.lift += -.25 * (1 - em) + .02 * ring(T, H0 + .34, 3.2, 7); A.crouch += .7 * (1 - em); A.lean += .35 * (1 - em); A.hdP -= .5 * (1 - em);
      A.lid = Math.max(A.lid, 1 - sm(H0 + .45, H0 + .6, T), .9 * Math.exp(-(((T - H0 - .82) / .05) ** 2)), .9 * Math.exp(-(((T - H0 - 1.0) / .05) ** 2)));
      const st = win(T, H0 + .12, H0 + .7, .12, .3); A.armP += 1.3 * st; A.elbow -= .6 * st; A.wing += .55 * win(T, H0 + .2, H0 + .95, .1, .4); A.earUp += .4 * win(T, H0 + .2, H0 + 2, .1, .5); A.swell += .3 * st;
      const la = win(T, H0 + .55, CAPF + .3, .2, .2); A.hdY += .55 * Math.sin((T - H0 - .55) * 2.7) * la; A.hdR += .14 * Math.sin((T - H0) * 3.3) * la; A.browUp += .7 * kick(T, H0 + 1.03, .45);
      A.hdR += .38 * Math.sin((T - CAPF + .2) * TAU * 5.5) * win(T, CAPF - .2, CAPF + .08, .03, .08); A.lid = Math.max(A.lid, .6 * win(T, CAPF - .2, CAPF + .05, .03, .05));
      if (T > CAPF + .2 && T < C.SUN_PROFILE + 1.3) { A.tailUp += .5; A.earUp += .25; A.tailWag = Math.max(A.tailWag, .5); }
      if (T >= HS[2] + .3) { const pk = sm(HS[2] + .3, HS[5] + .2, T); A.hdP += .3 * pk; A.nkP += .14 * pk; A.earUp = lerp(A.earUp, 1.05, pk); A.earBack -= .15 * pk; A.wing = Math.max(A.wing, .3 * pk); A.swell += .25 * pk; A.tailCurl += .9 * pk; A.tailUp += .3 * pk; }
      const lk = sm(SZ - .62, SZ - .38, T) * (1 - sm(SZ + .5, SZ + 1.1, T)); if (lk > 0) { A.look = _l.set(R_.x + M.SUNRISE_DIR.x * 12, R_.y + .45 + M.SUNRISE_DIR.y * 12 + 2.6, R_.z + M.SUNRISE_DIR.z * 12); A.lookW = lk; }
      const inh = win(T, SZ - .5, SZ - .04, .25, .03); A.swell += .7 * inh; A.hdP += .22 * inh; A.jaw = Math.max(A.jaw, .3 * sm(SZ - .45, SZ - .1, T) * (1 - sm(SZ - .05, SZ, T))); A.earUp += .3 * inh; A.lid = Math.max(A.lid, .5 * inh);
      const sk = kick(T, SZ, .16, .015); A.hdP -= .5 * sk; A.lean -= .1 * sk; A.lift += .015 * sk; A.lid = Math.max(A.lid, win(T, SZ - .02, SZ + .2, .02, .08)); A.flick += 1.2 * sk; A.wing += .4 * sk; A.browIn += .5 * sk; }
    // ---------------- CAVE: walks in, cough at the smoke, imitates him with a twig, sneezes his cigarette alight
    else if (T < C.RAIN) { const ahd = ashHead(_l2, AH_CAVE);
      if (T < CS[CS.length - 1] + .2) { A.hdP -= .12; A.earUp += .25; A.tailUp += .25; }
      if (T > C.CAVE + 1.4 && T < C.SMOKE_FACE + .1) { A.look = ahd; A.lookW = sm(C.CAVE + 1.4, C.CAVE + 2, T); A.hdR += .25 * win(T, (HRM - .28), (C.SMOKE_FACE - .68), .3, .3); const fl = kick(T, HRM, .25); A.lean += .12 * fl; A.earUp -= .5 * kick(T, HRM, .6); A.hdP += .05 * Math.sin(T * TAU * 5) * win(T, (C.SMOKE_FACE - 1.38), (C.SMOKE_FACE - .38), .1, .1); }
      const sm1 = win(T, C.SMOKE_FACE + .02, (C.IMITATE - .48), .12, .35); A.squint += .75 * sm1; A.smile -= .9 * sm1; A.hdY += .4 * sm1; A.earUp -= .5 * sm1; A.cheek += .25 * sm1; A.browIn += .5 * sm1; A.earBack += .4 * sm1;
      for (let i = 0; i < 3; i++) { const k = kick(T, C.COUGH + i * .31, .12, .02); A.lean += .14 * k; A.hdP -= .26 * k; A.lift -= .01 * k; } A.lid = Math.max(A.lid, .85 * win(T, C.COUGH - .03, C.COUGH + .95, .05, .2));
      A.wave = win(T, (C.COUGH - .48), (C.IMITATE - .43), .15, .25); A.waveA = Math.sin(TAU * 4.2 * (T - (C.COUGH - .48)));
      const pu = win(T, (C.IMITATE - .6), (C.IMITATE - .33), .14, .22); A.crouch += .6 * pu; A.lean -= .5 * pu; A.hdP -= .45 * pu;
      const im = win(T, C.IMITATE, (C.WHEEZE - .13), .1, .2); if (im > 0) { A.cheek = Math.max(A.cheek, im * (.85 - .6 * (kick(T, (C.IMITATE + .77), .12) + kick(T, (C.IMITATE + 2.17), .12)))); A.hdY -= .3 * im; A.hdP += .15 * im; A.lid = Math.max(A.lid * .3, .42 * im); A.lidL += .3 * im; A.armIn += .9 * im; A.armP += .5 * im; A.eyeAt = ahd; A.eyeW = im; A.tailWag = .25 * im; A.tailWF = 3; }
      const fc = kick(T, FKC, .15); A.lean += .2 * fc; A.hdP -= .35 * fc;
      A.jaw = Math.max(A.jaw, .3 * win(T, (C.WHEEZE - .13), (C.WHEEZE + .22), .05, .2));
      if (T > (C.WHEEZE - .13) && T < (C.FLINT + .37)) { A.look = ahd; A.lookW = sm((C.WHEEZE - .13), (C.WHEEZE + .22), T); A.hdR += .2; A.earUp -= .15; A.browUp += .4; A.browIn -= .4; }
      const fl2 = kick(T, C.FLINT + .02, .2); A.lean += .15 * fl2; A.lid = Math.max(A.lid, .8 * kick(T, C.FLINT + .02, .1));
      const SL = C.SNEEZE_LIGHT; if (T > SL - .95 && T < SL + .3) { A.look = cigAt(_l, CIG_CAVE); A.lookW = win(T, SL - .9, SL + .15, .25, .3); }
      const tk = sm(SL - .83, SL - .08, T) * (1 - sm(SL - .05, SL, T)); A.hdP += .35 * tk; A.lid = Math.max(A.lid, .55 * tk); A.swell += .5 * tk; A.earUp += .3 * tk;
      const sk = kick(T, SL + .015, .15, .015); A.hdP -= .3 * sk; A.lean += .12 * sk; A.lid = Math.max(A.lid, win(T, SL - .02, SL + .2, .02, .08)); A.flick += sk;
      const ac = sm(C.ACCEPT, C.ACCEPT + .3, T); if (ac > 0) { happy(ac); A.tailWag = Math.max(A.tailWag, .6 * ac); A.earUp += .35 * ac; A.lift += .008 * nod * ac; A.look = ahd; A.lookW = .7 * ac; } }
    // ---------------- SHELTER: shivers at the mouth, runs under his wing, curls up, the song, yawns, sleeps glowing
    else if (T < C.TRAIN) { const W1 = C.WING, sh = 1 - sm(W1 + .3, W1 + .7, T), cu = sm(W1 + 1.85, W1 + 2.6, T);
      A.shiver = sh; A.smile -= .7 * sh; A.crouch += .45 * sh; A.wing = lerp(.03, A.wing, 1 - sh); A.earUp -= .5 * sh; A.earBack += .8 * sh; A.hdP -= .3 * sh; A.lid = Math.max(A.lid, .35 * sh); A.browIn -= .6 * sh; A.tailCurl += .9 * sh; A.tailSide += 1.1 * sh; A.armIn += .8 * sh;
      if (T > W1 - .05 && T < W1 + 1.9) { A.look = wingAt(_l); A.look.y += .5; A.lookW = win(T, W1 + .02, W1 + .5, .12, .15); A.earUp += .7 * win(T, W1 + .05, W1 + 1.6, .08, .3); A.lid *= .4; }
      if (cu > 0) { A.lift -= .1 * cu; A.crouch = lerp(A.crouch, 1, cu); A.legFK = cu; A.lgP = lerp(A.lgP, .95, cu); A.lgK = lerp(A.lgK, -2.0, cu); A.lgF = lerp(A.lgF, 1.05, cu); A.tailCurl += 1.2 * cu; A.tailSide += 1.3 * cu; A.hdP -= .45 * cu; A.lean -= .35 * cu; A.wing = .04; A.armP += .5 * cu; A.lid = Math.max(A.lid, .45 * cu); A.earUp = lerp(A.earUp, .3, cu); }
      const sg = win(T, C.SING + .05, C.STUB - .2, .45, .6); if (sg > 0) { A.hdP += .55 * sg; A.look = ashHead(_l2, V3(R_.x - CD.x * .6, R_.y + 2.2, R_.z - CD.z * .6)); A.lookW = .6 * sg; A.lid *= 1 - sg; A.browUp += .55 * sg; A.earUp += .45 * sg; }
      const yw = win(T, C.ASLEEP + .05, C.ASLEEP + 1.0, .25, .4); A.hdP += .4 * yw; A.lid = Math.max(A.lid, .8 * yw); A.armP += .4 * yw;
      const sl = sm(C.ASLEEP + .9, C.ASLEEP + 1.5, T); if (sl > 0) { A.lid = Math.max(A.lid, sl); A.glow = sm(C.ASLEEP + .6, C.ASLEEP + 1.6, T); A.bRate = 3.4; A.hdP -= .1 * sl; A.earUp -= .15 * sl; A.tailWag = 0; } }
    // ---------------- TRAIN: three falls, a stamp and a growl, a puff of smoke, the glide, pride
    else if (T < C.RETURN) {
      if (T < TS[3]) { A.crouch += .2; A.browIn += .5; A.earBack += .3; A.wing = .3; A.tailUp += .3; A.lean -= .12; }
      const lp = [[TS[3] - .03, FALL[0]], [(FALL[1] - .27), FALL[1]], [(FALL[2] - .31), FALL[2]]];
      lp.forEach(([a, z]) => { const k = win(T, a, z, .03, .001); if (k <= 0) return; A.wing = Math.max(A.wing, k); A.flap += .9 * Math.sin(TAU * 9 * T) * k; A.legFK = Math.max(A.legFK, k); A.legKick = k; A.lid *= 1 - k; A.browUp += .6 * k; A.earBack += k; A.lean -= (.25 + .95 * sm(a + .2, z, T)) * k; A.hdP += .3 * k; A.armP += .8 * k; });
      [[(FALL[0] + 1.01), (FALL[0] + 1.41)], [(FALL[1] + .99), (FALL[1] + 1.39)], [(C.GLIDE - .5), (C.GLIDE - .1)]].forEach(([a, z]) => { const k = win(T, a, z, .03, .03); A.wing = Math.max(A.wing, .8 * k); A.flap += .8 * Math.sin(TAU * 8 * (T - a)) * k; A.legFK = Math.max(A.legFK, k); A.lean -= .2 * k; });
      const p1 = win(T, FALL[0] - .01, FALL[0] + .55, .02, .3); A.lean = Math.min(A.lean, -1.4 * p1); A.lift -= .05 * p1; A.legFK = Math.max(A.legFK, p1); A.legKick = Math.max(A.legKick, .4 * p1); A.tailUp += 1.2 * p1; A.tailWag = Math.max(A.tailWag, .8 * p1); A.wing = Math.max(A.wing, .85 * p1); A.flap -= .35 * p1; A.lid = Math.max(A.lid, .9 * p1); A.squash += kick(T, FALL[0], .12);
      A.hdR += .3 * Math.sin(TAU * 6 * (T - (FALL[0] + .61))) * win(T, (FALL[0] + .61), (FALL[0] + .91), .03, .08);
      const r2 = sm(FALL[1], FALL[1] + .36, T), rl = win(T, FALL[1], FALL[1] + .36, .01, .05); A.dx -= .34 * (1 - r2); if (T >= FALL[1] && T < FALL[1] + .36) A.lean -= 1.2 + (TAU - 1.2) * r2; A.lift += .1 * Math.sin(PI * r2) + .04 * rl; A.legFK = Math.max(A.legFK, rl); A.lgP = lerp(A.lgP, 1.1, rl); A.lgK = lerp(A.lgK, -2, rl); A.wing = lerp(A.wing, .02, rl); A.tailCurl += 1.2 * rl;
      const dz = win(T, FALL[1] + .42, (FALL[1] + .89), .06, .12); A.lean += .5 * dz; A.lift -= .06 * dz; A.legFK = Math.max(A.legFK, dz); A.lgP = lerp(A.lgP, 1.5, dz); A.lgK = lerp(A.lgK, -.35, dz); A.lgF = lerp(A.lgF, -.2, dz); A.hdR += .25 * Math.sin(TAU * 2.2 * T) * dz; A.hdY += .25 * Math.cos(TAU * 2.2 * T) * dz; A.lid = Math.max(A.lid, .5 * dz); A.lidL += .3 * dz; A.earUp -= .3 * dz;
      const p3 = win(T, FALL[2] - .01, FALL[2] + .1, .02, .15); A.lean = Math.min(A.lean, -1.42 * p3); A.lift -= .05 * p3; A.wing = Math.max(A.wing, p3); A.flap -= .25 * p3; A.legFK = Math.max(A.legFK, p3); A.lgP = lerp(A.lgP, -.8, p3); A.lgK = lerp(A.lgK, -.15, p3); A.squash += kick(T, FALL[2], .12);
      const st = [[(FALL[2] + B8), 1], [(FALL[2] + 2 * B8), 0]]; st.forEach(([ts, k]) => { const v = .05 * sm(ts - .16, ts - .05, T) * (1 - sm(ts - .02, ts, T)); if (k) A.stampR = v; else A.stampL = v; A.lift -= .012 * kick(T, ts, .08, .01); A.hdP -= .08 * kick(T, ts, .1, .01); });
      const PF = Score.tracks.puff.find(e => e.who === 'ember' && !e.blue), tp = PF ? PF.t : FALL[2] + .9, an = win(T, FALL[2] + .1, tp - .42, .05, .15); A.browIn += an; A.smile -= .8 * an; A.cheek += .7 * an; A.earUp -= .45 * an; A.earBack += .9 * an; A.tailWag = Math.max(A.tailWag, 1.1 * an); A.tailWF = Math.max(A.tailWF, 14 * an); A.lean -= .15 * an; A.crouch += .2 * an; A.armP -= .4 * an;
      const ih = sm(tp - .5, tp - .05, T) * (1 - sm(tp, tp + .15, T)); A.swell += .9 * ih; A.hdP += .35 * ih; A.wing = Math.max(A.wing, .35 * ih); A.earUp += .4 * ih; A.browIn += .6 * ih;
      const pk = kick(T, tp, .15, .02); A.hdP -= .35 * pk; A.jaw = Math.max(A.jaw, .6 * win(T, tp - .02, tp + .17, .02, .12)); PUFF = Math.max(PUFF, win(T, tp - .01, tp + .17, .01, .1));
      const sd = win(T, tp + .15, (C.GLIDE - .5), .1, .1); A.earUp -= .5 * sd; A.lean -= .12 * sd; A.hdP -= .25 * sd; A.wing = lerp(A.wing, .05, sd); A.lid = Math.max(A.lid, .4 * sd); A.browIn -= .5 * sd;
      A.crouch += .5 * win(T, (C.GLIDE - .08), C.GLIDE, .04, .03); A.wing = Math.max(A.wing, .9 * win(T, (C.GLIDE - .08), C.GLIDE, .04, .03));
      const gl = win(T, C.GLIDE, C.GLIDE + 1.2, .03, .12); if (gl > 0) { A.wing = Math.max(A.wing, gl); A.flap += flapEv(T, .2) * gl + .9 * Math.max(0, Math.sin(PI * clamp((T - C.GLIDE) / .3))) * gl + .05 * Math.sin(T * 7) * gl; A.lean -= .7 * gl; A.hdP += .55 * gl; A.legFK = Math.max(A.legFK, gl); A.tailUp -= .05 * gl; A.tailCurl -= .3 * gl; A.browUp += .5 * gl; A.earBack += .7 * gl; A.lid *= 1 - gl; }
      const pr = sm(C.GLIDE + 1.32, C.GLIDE + 1.5, T); A.crouch += .45 * kick(T, C.GLIDE + 1.2, .18); if (pr > 0) { A.swell += .45 * pr; A.hdP += .35 * pr; A.wing = Math.max(A.wing, lerp(1, .7, sm(C.RETURN - .4, C.RETURN, T)) * pr); A.tailUp += .6 * pr; happy(pr); A.earUp += .45 * pr; } }
    // ---------------- CLIMAX: fear behind Ash, the dash, hiding, the memory, INHALE, BLUE FIRE, panting
    else if (T < C.DAWN) { const ci = cinAt(T, _l2);
      const fe = 1 - sm(C.ALONE + .45, C.ALONE + 1.1, T); A.crouch += .45 * fe; A.shiver = .6 * fe; A.smile -= .7 * fe; A.earUp -= .5 * fe; A.earBack += .9 * fe; A.wing = lerp(.12, .02, fe); A.tailCurl += .9 * fe; A.tailSide += .8 * fe; A.pupil = lerp(A.pupil, 1, fe); A.lid *= 1 - .7 * fe; A.browIn -= .5 * fe; A.armIn += .8 * fe;
      if (T < C.ASH_DOWN + .04) { const aw = win(T, C.ASH_STANDS, C.ASH_STANDS + 1.3, .2, .4); A.look = aw > .5 ? ashHead(_l, AH_CLX) : ci; A.lookW = .85; }
      A.lean += .2 * kick(T, C.ASH_DOWN + .01, .15); const ds = win(T, C.ASH_DOWN + .04, C.CINDER_FIRE, .02, .02); A.wing = Math.max(A.wing, .7 * ds); A.flap += .7 * Math.sin(TAU * 9 * T) * ds; A.lean -= .3 * ds; A.earBack += ds;
      if (R_.m.dive && R_.seg === 2) A.lean -= 1.1 * R_.u; const pr = win(T, C.CINDER_FIRE, C.CINDER_FIRE + .25, .01, .2); A.lean -= 1.1 * pr; A.lift -= .04 * pr;
      const hd = win(T, C.CINDER_FIRE + .2, C.ALONE, .15, .12); A.crouch += .5 * hd; A.shield = hd; A.hdP -= .5 * hd; A.lid = Math.max(A.lid, .9 * hd); A.shiver = Math.max(A.shiver, hd);
      const pk = win(T, C.ALONE, C.ALONE + .45, .05, .2); A.roll -= .25 * pk; A.hdY += .4 * pk; if (pk > 0 && T < C.ALONE + .5) { A.look = AT; A.lookW = pk; }
      const me = sm(C.ALONE + .35, C.ALONE + .7, T) * (1 - sm(C.BLUE - .25, C.BLUE - .05, T)); if (me > 0) { A.look = MEM; A.lookW = me; A.browUp += .5 * me; A.lid *= 1 - me; A.earUp += .4 * me; A.shiver *= 1 - me; }
      const ih = sm(C.INHALE, C.BLUE - .06, T) * (1 - sm(C.BLUE, C.BLUE + .3, T)); A.swell += ih; A.earUp += .6 * ih; A.wing = Math.max(A.wing, lerp(.1, .8, ih)); A.blaze = .35 * ih; A.hdP += .12 * ih; A.browIn += .5 * ih;
      FIRE = sm(C.BLUE - .04, C.BLUE + .1, T) * (1 - sm(C.PETRIFY + .15, C.CRUMBLE, T)) * (.85 + .15 * clamp(Score.env('ostin', T, .12)));
      const fz = sm(C.BLUE - .1, C.BLUE + .05, T) * (1 - sm(C.CRUMBLE - .2, C.CRUMBLE + .2, T));
      if (fz > 0) { A.look = ci; A.lookW = Math.max(A.lookW * (1 - fz), fz); A.crouch += .3 * fz; A.lean -= .22 * fz; A.wing = Math.max(A.wing, fz); A.flap += (.7 * flapEv(T) + .06 * Math.sin(T * 19) - .2) * fz; A.jaw = Math.max(A.jaw, .95 * FIRE); A.lid = Math.max(A.lid * (1 - fz), .3 * fz); A.squint += .3 * fz; A.browIn += .8 * fz; A.tailUp += .4 * fz; A.tailCurl -= .3 * fz; A.swell += .35 * fz; A.earBack += .6 * fz; A.flutter += fz; A.lift += .003 * Math.sin(T * 55) * FIRE; A.blaze = Math.max(A.blaze, FIRE); A.lgP -= .1; }
      const pa = win(T, C.CRUMBLE, C.DAWN + .1, .25, .1); A.jaw = Math.max(A.jaw, pa * (.3 + .15 * Math.sin(TAU * 5.5 * T))); A.bRate = lerp(A.bRate, .4, pa); A.crouch += .3 * pa; A.hdP -= .2 * pa; A.wing = Math.max(A.wing, .3 * pa); A.blaze = Math.max(A.blaze, .5 * (1 - sm(C.CRUMBLE, C.DAWN, T)) * pa); }
    // ---------------- DAWN: runs to him, nuzzles, bounces at his fire, flies the heart, the joke
    else { const ahd = ashHead(_l2, AH_DOWN);
      if (T < C.WAKE) { A.earUp += .35; A.tailUp += .35; A.lean -= .2; happy(.3); }
      const nz = win(T, C.WAKE - .05, C.ASH_FIRE - .1, .25, .3); if (nz > 0) { A.look = ahd; A.lookW = nz; A.hdR += .35 * Math.sin(TAU * 1.4 * (T - (C.WAKE - .13))) * nz; A.hdY += .2 * Math.sin(TAU * 1.4 * (T - (C.WAKE - .13)) + 1) * nz; A.lean -= .2 * nz; A.lid = Math.max(A.lid, .85 * nz); A.tailWag = Math.max(A.tailWag, .5 * nz); A.tailWF = 4; }
      DS.slice(5).forEach((ts, i) => { const v = .02 * sm(ts - .12, ts - .04, T) * (1 - sm(ts - .02, ts, T)); if (i % 2) A.stampL = Math.max(A.stampL, v); else A.stampR = Math.max(A.stampR, v); });
      const bf = win(T, C.ASH_FIRE, C.FLY - .15, .05, .15); if (bf > 0) { let bo = 0; for (let k = 0; k < 6; k++) bo = Math.max(bo, Math.sin(PI * clamp((T - C.ASH_FIRE - .02 - k * .333) / .3))); A.lift += .09 * bo * bf; A.wing = Math.max(A.wing, .5 * bf); A.flap += .5 * Math.sin(TAU * 3 * (T - C.ASH_FIRE)) * bf; happy(bf); A.earUp += .4 * bf; A.tailWag = Math.max(A.tailWag, bf); A.tailWF = 9; A.look = ahd; A.lookW = .6 * bf; A.legFK = Math.max(A.legFK, bo * bf * .8); }
      if (T >= C.FLY) { const hv = sm(C.HEART2 - .6, C.HEART2 + .2, T), bb = Score.beat(T); const tk = sm(C.FLY, C.FLY + .35, T); A.legFK = tk; A.lgP = .85; A.lgK = -1.5; A.lgF = .9; A.lean += (lerp(-1.2, -.55, hv) + R_.pitch * (R_.pk || .5)) * tk; A.roll += R_.bank; A.nkP += lerp(.45, .3, hv); A.hdP += lerp(.55, .2, hv) - R_.pitch * .3;
        A.wing = 1; A.flap += 1.1 * flapEv(T) + .05 * Math.sin(T * 6.3) + hv * .3 * Math.sin(TAU * 5 * T); A.crouch += .5 * win(T, C.FLY - .15, C.FLY + .02, .08, .1); A.tailUp -= .1; A.tailWag = .35; A.tailWF = 2.4; A.earBack += .9; A.flutter += 1; A.armP += .6; happy(.35 + .4 * win(T, C.HEART2 - .3, C.JOKE - .05, .1, .05));
        if (T > C.JOKE - .4) { A.look = cigAt(_l, CIG_DAWN); A.lookW = win(T, C.JOKE - .3, C.JOKE + .45, .12, .3); A.lookBody = A.lookW; } const jp = win(T, C.JOKE - .01, C.JOKE + .22, .01, .1); A.jaw = Math.max(A.jaw, .55 * jp); PUFF = Math.max(PUFF, jp); } }
    // poke: a chirp and a happy hop
    const pk = t - pokeT; if (pk > 0 && pk < .7) { const k = Math.sin(PI * clamp(pk / .38)); A.lift += .07 * k; happy(win(pk, .02, .5, .02, .15)); A.earUp += .4 * k; A.wing = Math.max(A.wing, .45 * k); A.flap += .5 * Math.sin(TAU * 3 * pk) * k; A.jaw = Math.max(A.jaw, .4 * win(pk, .02, .3, .02, .1)); A.tailWag = Math.max(A.tailWag, .8); A.tailWF = 10; }
    A.breath = .5 + .5 * Math.sin(t * TAU / A.bRate);
  }

  // ================================================================ applying the channels to the rig; legs by IK ============================================
  const qb = (e1, e3) => { const a = V3().copy(e1).normalize(), c = V3().copy(e3).normalize(), b = V3().crossVectors(c, a); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, b, c)); };
  function mkLeg(id, home) { const B = rg.bones, hip = rest(id + 'u'), kn = rest(id + 'l'), an = rest(id + 'f'), d1 = kn.clone().sub(hip), d2 = an.clone().sub(kn), ax = an.clone().sub(hip).normalize(), pole = kn.clone().sub(hip); pole.addScaledVector(ax, -pole.dot(ax)).normalize(); const n0 = V3().crossVectors(d1, d2).normalize();
    return { u: B[id + 'u'], l: B[id + 'l'], f: B[id + 'f'], P: B.hips, L1: d1.length(), L2: d2.length(), pole, ax, q1: qb(d1, n0).invert(), q2: qb(d2, n0).invert(), off: an.clone().sub(V3(home[0], 0, home[1])), shift: .03, rest: B[id + 'u'].position.clone(), pq: new THREE.Quaternion(), fk: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()] }; }
  const _v = V3(), _w = V3(), _u = V3(), _m = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _h = V3(), _f1 = V3(), _f2 = V3(), _f3 = V3(), _e2 = V3(), _mb = new THREE.Matrix4(), _sc = V3(), ZA = V3(0, 0, 1);
  function solve(g, wx, wy, wz, yaw, pitch) {
    _qc.setFromAxisAngle(YA, yaw); _q3.setFromAxisAngle(ZA, pitch); _qc.multiply(_q3); _v.copy(g.off).applyQuaternion(_qc); _v.x += wx; _v.y += wy; _v.z += wz;
    _m.copy(g.P.matrixWorld).invert(); _v.applyMatrix4(_m); g.P.matrixWorld.decompose(_sc, g.pq, _w); g.pq.invert();
    _h.copy(g.rest); _v.sub(_h); let L = _v.length(); const R = (g.L1 + g.L2) * .995; if (L > R) { const k = Math.min(L - R, g.shift) / L; _h.addScaledVector(_v, k); _v.multiplyScalar(1 - k); L = _v.length(); } else { const Lm = .5 * (g.L1 + g.L2); if (L < Lm) { const k = Lm - L; _h.addScaledVector(g.ax, -k); _v.addScaledVector(g.ax, k); L = _v.length(); } } g.u.position.copy(_h);
    _v.multiplyScalar(1 / L); L = clamp(L, Math.abs(g.L1 - g.L2) + 1e-3, R); const a = (g.L1 * g.L1 - g.L2 * g.L2 + L * L) / (2 * L), h = Math.sqrt(Math.max(1e-8, g.L1 * g.L1 - a * a)); _u.copy(g.pole).applyQuaternion(_qd.setFromUnitVectors(g.ax, _v)); _u.addScaledVector(_v, -_u.dot(_v)); if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0); _u.normalize();
    _f1.copy(_v).multiplyScalar(a).addScaledVector(_u, h); _f2.copy(_v).multiplyScalar(L).sub(_f1); _f3.crossVectors(_f1, _f2).normalize(); _f1.normalize(); _f2.normalize();
    _e2.crossVectors(_f3, _f1); _mb.makeBasis(_f1, _e2, _f3); _qa.setFromRotationMatrix(_mb).multiply(g.q1); g.u.quaternion.copy(_qa);
    _e2.crossVectors(_f3, _f2); _mb.makeBasis(_f2, _e2, _f3); _qb.setFromRotationMatrix(_mb).multiply(g.q2); g.l.quaternion.copy(_qa).invert().multiply(_qb);
    _qd.copy(g.pq).multiply(_qc); g.f.quaternion.copy(_qb).invert().multiply(_qd); }
  let LEGS, LID_AX; const _ft = { x: 0, y: 0, z: 0, yaw: 0, lift: 0 }, _la = { yaw: 0, pitch: 0 };
  const _ho = V3(); function aim(P, out, hy) { _ho.setFromMatrixPosition(rg.bones.head.matrixWorld); if (!(_ho.lengthSq() > 0) || _ho.distanceTo(group.position) > 1) _ho.set(group.position.x, group.position.y + hy, group.position.z); const dx = P.x - _ho.x, dz = P.z - _ho.z, c = Math.cos(R_.yaw), s = Math.sin(R_.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, ly = P.y - _ho.y; out.yaw = Math.atan2(-lz, lx); out.pitch = Math.atan2(ly, Math.hypot(lx, lz)); return out; }
  function apply(t) {
    const B = rg.bones; const sv = A.shiver * (.012 * Math.sin(t * 113) + .008 * Math.sin(t * 71)), sw = 1 + A.shiver * .6;
    if (A.look && A.lookW > 0) { aim(A.look, _la, .37 + A.lift); const w = A.lookW, yw = clamp(_la.yaw, -2.2, 2.2), bw = (A.lookBody || 0) * w, by = clamp(yw * .6, -1.2, 1.2) * bw; A.twist += by; A.lean += clamp(_la.pitch - A.lean, -.9, .9) * .5 * bw; const yr = yw - by, pt = clamp(_la.pitch - A.lean - A.spP - A.chP - A.nkP - A.hdP, -1.1, 1.2) * w; A.chY += clamp(yr * .35, -.6, .6) * w; A.nkY += clamp(yr * .3, -.55, .55) * w; A.hdY += clamp(yr * .35, -.8, .8) * w; A.nkP += pt * .4; A.hdP += pt * .6; }
    if (A.eyeAt && A.eyeW > 0) { aim(A.eyeAt, _la, .43); A.eyeY = lerp(A.eyeY, clamp(_la.yaw - A.chY - A.nkY - A.hdY, -.5, .5), A.eyeW); }
    const hp = B.hips; hp.position.copy(rg.bones.hips.userData.rest).add(_hw.set(A.dx, A.lift - A.crouch * .042 + sv * .2, 0)); hp.rotation.set(A.roll + sv, A.twist, A.lean + .25 * A.crouch * 0 + sv * .5, 'YZX');
    B.spine.rotation.set(0, 0, A.spP - .12 * A.crouch); B.chest.rotation.set(A.chR, A.chY, A.chP - .08 * A.crouch + .05 * A.swell, 'YZX');
    const sx = 1 + .025 * A.breath * sw + .11 * A.swell + .12 * A.squash, sy = 1 + .015 * A.breath + .05 * A.swell - .18 * A.squash; B.belly.scale.set(sx, sy, sx);
    B.neck.rotation.set(0, A.nkY, A.nkP + .1 * A.crouch - .04 * A.swell, 'YZX'); B.head.rotation.set(A.hdR, A.hdY, A.hdP + .05 * A.crouch, 'YZX');
    B.throat.scale.set(1 + A.throat * .22, 1 + A.throat * .08, 1 + A.throat * .22); B.jaw.rotation.z = -A.jaw * .55;
    const closeU = clamp(A.lid), sq = clamp(A.squint), pu = clamp(A.pupil); U.uPup.value.set(lerp(.1, .5, pu), lerp(.55, .72, pu));
    for (const s of SIDES) { const n = SN(s), ax = LID_AX[s < 0 ? 0 : 1];
      B['cheek' + n].scale.setScalar(1 + clamp(A.cheek) * .45); B['cheek' + n].position.copy(B['cheek' + n].userData.rest).add(_hw.set(-.002 * A.smile, .0045 * A.smile, 0)); B['eye' + n].rotation.set(0, A.eyeY, A.eyeP, 'YZX');
      B['lidU' + n].quaternion.setFromAxisAngle(ax, -(closeU * 1.4 + sq * .45 - A.browUp * .06)); B['lidL' + n].quaternion.setFromAxisAngle(ax, closeU * .6 + clamp(A.lidL) * .7 + sq * .45);
      B['brow' + n].position.copy(B['brow' + n].userData.rest).add(_hw.set(0, A.browUp * .005 - Math.max(0, A.browIn) * .002 - sq * .002, 0)); B['brow' + n].rotation.set(-s * A.browIn * .38, 0, 0);
      const ef = A.flick * s > 0 ? Math.abs(A.flick) : 0, fl = A.flutter * .12 * Math.sin(t * 23 + s);
      B['ear' + n].rotation.set(s * ((.5 - clamp(A.earUp, -.2, 1.2)) * .9 + ef * .35 + sv * 3), -s * A.earBack * .6, -A.earBack * .2, 'YZX'); B['earT' + n].rotation.set(s * (ef * .3 + fl), 0, fl * .5);
      // arms
      B['au' + n].rotation.set(0, s * A.armIn * .65, A.armP - .15, 'YZX'); B['al' + n].rotation.set(0, s * A.armIn * .3, A.elbow - .25 - A.armIn * .4, 'YZX');
      // wings: fold (0) .. rest (.5) .. spread (1), + flap (down +), wave (the right one fans her face), shield (both over her head)
      const o = clamp(A.wing), k1 = sm(0, .5, o), k2 = sm(.5, 1, o), wv = s > 0 ? A.wave : 0, fp = A.flap;
      const aX = lerp(lerp(.6, 0, k1), -.32, k2) + fp * .75 - wv * .95 - A.shield * .5, aY = lerp(lerp(-.85, 0, k1), .35, k2) + wv * (1.4 + .45 * A.waveA) + A.shield * 1.15, aZ = lerp(lerp(-.3, 0, k1), .12, k2) + A.shield * .3;
      const bX = lerp(lerp(.3, 0, k1), -.08, k2) + fp * .35, bY = lerp(lerp(-1.15, 0, k1), .5, k2), fS = lerp(lerp(-.4, 0, k1), .32, k2);
      B['wA' + n].rotation.set(s * aX, s * aY, aZ, 'YZX'); B['wB' + n].rotation.set(s * bX, s * bY, 0, 'YZX'); B['wF0' + n].rotation.set(s * fS * .6, 0, fS * .5); B['wF1' + n].rotation.set(0, 0, 0); B['wF2' + n].rotation.set(-s * fS * .6, 0, -fS * .3);
      // legs FK pose
      const ph = t * TAU * 7 + (s > 0 ? PI : 0), kk = A.legKick; B['lg' + n + 'u'].position.copy(B['lg' + n + 'u'].userData.rest); B['lg' + n + 'u'].rotation.set(0, 0, A.lgP + kk * .6 * Math.sin(ph)); B['lg' + n + 'l'].rotation.set(0, 0, A.lgK + kk * .5 * Math.sin(ph + 1)); B['lg' + n + 'f'].rotation.set(0, 0, A.lgF); }
    const wg = A.tailWag, wf = A.tailWF; for (let i = 0; i < 6; i++) B['t' + i].rotation.set(0, A.tailSide * .22 + wg * Math.sin(wf * t - i * .7) * (.06 + .035 * i), -(A.tailUp * (i < 2 ? .3 : .06)) - A.tailCurl * (.04 + .09 * i), 'YZX');
    group.updateMatrixWorld(true);
    // legs: planted feet (IK) blended with the FK pose
    const wIK = (1 - clamp(A.legFK)) * (1 - sm(.012, .05, R_.air + Math.max(0, A.lift)));
    LEGS.forEach((g, k) => { g.fk[0].copy(g.u.quaternion); g.fk[1].copy(g.l.quaternion); g.fk[2].copy(g.f.quaternion); if (wIK <= .001) return;
      const s = k ? 1 : -1; if (R_.m.type === 'walk') footW(R_.m, k, t, _ft); else { const c = Math.cos(R_.yaw), sn = Math.sin(R_.yaw); _ft.x = R_.x + HOME_X * c + s * HOME_Z * sn; _ft.y = R_.y; _ft.z = R_.z - HOME_X * sn + s * HOME_Z * c; _ft.yaw = R_.yaw; _ft.lift = 0; }
      solve(g, _ft.x, _ft.y + _ft.lift + (k ? A.stampR : A.stampL), _ft.z, _ft.yaw, 0);
      if (wIK < .999) { g.u.quaternion.copy(g.fk[0]).slerp(_qa.copy(g.u.quaternion), wIK); g.l.quaternion.copy(g.fk[1]).slerp(_qb.copy(g.l.quaternion), wIK); g.f.quaternion.copy(g.fk[2]).slerp(_qc.copy(g.f.quaternion), wIK); g.u.position.lerpVectors(g.rest, g.u.position, wIK); } });
    group.updateMatrixWorld(true);
  }
  // the twig: on the cave floor, then in the corner of her mouth, then dropped
  const TW_F = V3(Pc1.x - uC.x * .19 - uC.z * .05, Pc1.y + .0035, Pc1.z - uC.z * .19 + uC.x * .05), TW_PU = C.IMITATE - .42, TW_DR = C.WHEEZE - .1, TW_D = V3(), twHold = new THREE.Matrix4().compose(V3(.205, .372, .032), new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, -.6, -.22, 'YXZ')), V3(1, 1, 1));
  const _tw = new THREE.Matrix4(), _tw2 = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _tp = V3(), _tp2 = V3(), _ts = V3();
  function twig(t) { const b = rg.bones.twig; if (t < C.CAVE || t >= C.RAIN) { b.scale.setScalar(1e-4); b.position.set(0, -9, 0); return; }
    const held = () => _tw.copy(rg.bones.head.matrixWorld).multiply(_tw2.makeTranslation(-DEF.head.pos[0], -DEF.head.pos[1], -DEF.head.pos[2])).multiply(twHold);
    const flr = (p) => _tw.compose(p, _tq.setFromEuler(new THREE.Euler(0, Y_ASH + .7, 0)), V3(1, 1, 1));
    if (t < TW_PU || t >= TW_DR + .3) flr(t < TW_PU ? TW_F : TW_D.set(Pc1.x - uC.x * .14 + uC.z * .08, Pc1.y + .0035, Pc1.z - uC.z * .14 - uC.x * .08));
    else if (t < TW_DR) held(); else { held(); _tw.decompose(_tp, _tq, _ts); const u = (t - TW_DR) / .3; _tp2.set(Pc1.x - uC.x * .14 + uC.z * .08, Pc1.y + .0035 + .3 * 0, Pc1.z - uC.z * .14 - uC.x * .08); _tp.lerp(_tp2, u * u); _tq2.setFromEuler(new THREE.Euler(0, Y_ASH + .7, 0)); _tq.slerp(_tq2, u); _tw.compose(_tp, _tq, V3(1, 1, 1)); }
    _tw2.copy(group.matrixWorld).invert().multiply(_tw); _tw2.decompose(b.position, b.quaternion, b.scale); }

  // ================================================================ egg performance =====================================================================
  let EGG_GLOW = 0; const CR = Score.tracks.crack.filter(e => e.t > C.DAWN0 - .1 && e.t < C.CAVE), CRR = [.055, .09, .13, 9], _em = new THREE.Matrix4(), _em2 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _cs = new THREE.Matrix4();
  function eggUpdate(t) { eggG.visible = t >= C.EGG - .02 && t < C.CAVE; if (!eggG.visible) return; const H0 = C.HATCH;
    // inner light: her mother's hum, the ghost in the silence, the music box at dawn; cold through the loss
    const lu = Score.sing(t, 'lune'); let gl = 0; if (t < C.ERUPT) gl = .3 + .9 * lu.a; else if (t < C.SILENCE) gl = .3 * (1 - sm(C.ERUPT, C.BLAST, t)) + .25 * Score.env('hit', t, .15); else if (t < C.DAWN0) gl = .35 * lu.a + .03; else gl = .12 + .55 * clamp(Score.env('celesta', t, .45)) + 1.5 * kick(t, H0, .5, .02) + .8 * Score.env('crack', t, .25);
    if (t >= H0) gl *= 1 - sm(H0 + .3, H0 + 1.5, t); EGG_GLOW = gl; U.uEG.value = gl; U.uCold.value = sm(C.SILENCE - .5, C.SILENCE + 1.5, t) * (1 - sm(C.DAWN0, C.HATCH - .5, t)) * .9 + .25 * sm(C.BLAST, C.SILENCE, t) * (1 - sm(C.DAWN0, C.DAWN0 + 1, t));
    let r = 0; CR.forEach((e, i) => { r = Math.max(r, CRR[Math.min(i, 3)] * sm(e.t, e.t + .12, t)); }); U.uCr.value = r;
    // rocking before each crack, a rumble in the attack
    let rx = 0, rz = 0; CR.forEach((e, i) => { if (i > 2) return; const a = win(t, e.t - .5, e.t + .06, .25, .3) * Math.sin(TAU * 3.1 * (t - e.t + .5)) * (.05 + .03 * i), d = i * 2.1 + .4; rx += a * Math.cos(d); rz += a * Math.sin(d); });
    if (t > C.ERUPT && t < C.SILENCE) { const k = .02 * clamp(Score.env('hit', t, .2) + .5 * Score.env('taiko', t, .15)); rx += k * Math.sin(t * 41); rz += k * Math.sin(t * 37 + 1); }
    pivot.rotation.set(rx, 0, rz); if (t >= H0) pivot.rotation.set(0, 0, 0); eggG.updateMatrixWorld(true);
    pieces.forEach((P, i) => { if (t < H0 || i === 0) { if (i === 0 && t >= H0) { _em.makeRotationX(.04 * ring(t, H0, 5, 7)); setPiece(0, _em); } else setPiece(i, _em.identity()); return; }
      if (i !== 1) { setPiece(i, flight(P, t - H0, _em, null)); return; }
      // the cap rides on her head, then falls off when she shakes it
      _inv.copy(eggMesh.matrixWorld).invert(); const onHead = () => _em2.copy(_inv).multiply(rg.bones.head.matrixWorld).multiply(_cs.makeTranslation(-DEF.head.pos[0], -DEF.head.pos[1], -DEF.head.pos[2])).multiply(capLocal);
      if (t < H0 + .12) { onHead(); _em.identity(); const k = sm(H0, H0 + .12, t); _em2.decompose(_p, _q, _s); _q.slerp(_q2.identity(), 1 - k); _p.multiplyScalar(k); _em.compose(_p, _q, V3(1, 1, 1)); setPiece(1, _em); }
      else if (t < CAPF) { setPiece(1, onHead()); }
      else { // start from her (pure) rest head pose at CAPF
        const R0 = rootAt(CAPF, {}), c = Math.cos(R0.yaw), s = Math.sin(R0.yaw); _cs.compose(V3(R0.x, R0.y, R0.z), _q.setFromAxisAngle(YA, R0.yaw), V3(1, 1, 1)).multiply(_em.makeTranslation(.03 * c, 0, -.03 * s)).multiply(capLocal); _em2.copy(_inv).multiply(_cs); setPiece(1, flight(P, t - CAPF, _em, _em2)); } }); }

  // ================================================================ asset ===============================================================================
  const asset = Assets.add('ember', { order: 22, pick: [],
    build() { const t0 = performance.now(); buildBody(); buildFelt(); buildGloss(); buildEgg(); const out = [group, eggG]; if (OWN_ROCKS) out.push(buildRocks());
      LEGS = [mkLeg('lgL', [HOME_X, -HOME_Z]), mkLeg('lgR', [HOME_X, HOME_Z])]; LID_AX = SIDES.map(s => basis(GAZE(s)).s);
      rg.list.forEach(b => b.userData.rest = b.position.clone());
      proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); proxy.scale.set(.2, .28, .16); proxy.position.set(.04, .28, 0); group.add(proxy); asset.pick = [proxy];
      lanG = Lan.add({ x: 0, y: -50, z: 0, r: 1.3, color: [1, .72, .3], gain: () => A.glow * .45 * (group.visible ? 1 : 0) });
      lanB = Lan.add({ x: 0, y: -50, z: 0, r: 3.5, color: [.45, .7, 1], gain: () => (A.blaze * 1.4 + PUFF * .4 * (R_.m && R_.m.type === 'fly' ? 1 : 0)) * (group.visible ? 1 : 0) });
      lanE = Lan.add({ x: EGG_C.x, y: EGG_C.y, z: EGG_C.z, r: 1.6, color: [1, .76, .4], gain: () => EGG_GLOW * .5 * (eggG.visible ? 1 : 0) });
      G.info.emberBuild = Math.round(performance.now() - t0); return out; },
    update(ctx) { const t = ctx.t; FIRE = 0; PUFF = 0; rootAt(t, R_); perform(t);
      group.visible = !!A.vis; const c = Math.cos(R_.yaw), s = Math.sin(R_.yaw); group.position.set(R_.x, R_.y + R_.air, R_.z); group.rotation.set(0, R_.yaw, 0); apply(t); twig(t);
      U.uGlow.value.set(A.glow, A.blaze, 0); U.uBlz.value = A.blaze; U.uEyeE.value = .12 + .2 * A.glow;
      if (rocks) rocks.visible = t >= C.TRAIN - .02 && t < C.RETURN;
      eggUpdate(t);
      api.head(_hw); Lan.pos(lanG, _hw.x, _hw.y - .15, _hw.z); api.mouth(_hw); Lan.pos(lanB, _hw.x + c * .25, _hw.y, _hw.z - s * .25); },
    poke(hit, ctx) { pokeT = ctx.t; return 'chirp'; } });

  // ================================================================ API =================================================================================
  const _ap = V3(), _ad = V3(), _hm = new THREE.Matrix4(), HC = V3(.075 - .075, .43 - .365, 0), MO = V3(.245 - .075, .366 - .365, 0), EM = V3(.142 - .075, .437 - .365, 0);
  const onHead = (p, out) => out.copy(p).applyMatrix4(rg.bones.head.matrixWorld);
  Object.assign(api, {
    at(t, out) { out = out || V3(); if (t < C.HATCH) return out.copy(EGG_C); const R = rootAt(t, {}); return out.set(R.x, R.y + R.air, R.z); },
    head(out) { return onHead(HC, out || V3()); }, eye(out) { return onHead(EM, out || V3()); },
    mouth(out) { out = out || V3(); onHead(MO, out); if (rg.bones.jaw) { const j = clamp(A.jaw); _ap.set(.155 - .095, .356 - .372, 0).applyMatrix4(rg.bones.jaw.matrixWorld); out.lerp(_ap, .35 * j); } return out; },
    dir(out) { out = out || V3(); const m = rg.bones.head.matrixWorld.elements; out.set(m[0], m[1], m[2]).normalize(); const j = clamp(A.jaw); if (j > .01) { const n = rg.bones.jaw.matrixWorld.elements; _ad.set(n[0], n[1], n[2]).normalize(); out.lerp(_ad, .3 * j).normalize(); } return out; },
    fire: () => FIRE, puff: () => PUFF, pose: () => A, root: () => R_,
    MARKS: { EGG_C, CUP, RIM, Pc0, Pc1, MOUTH_IN, RL, RH, GL, HIDE, PB, OWN_ROCKS } });
  return Stage.actor('ember', api);
})();
