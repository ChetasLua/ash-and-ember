'use strict';
// ---- SKY + LIGHT + WEATHER of ASH & EMBER: film time is the time of day ----------------------------------------------------------------------
// Sky.apply(t, focus, box) sets sun/moon key, sky colours, the cloud deck, fog, exposure, environment and the lightning fill. Sky.S = current state (read-only):
//   S.sunDir S.sun(rgb*I) S.zen S.mid S.hor S.hs S.gnd S.fog S.env S.ex S.moon S.night S.el S.az S.t   S.flash (lightning now, 0..2)   S.wx (weather now, below)
// Sky.wxAt(t, out?) -> { cover: cloud deck 0..1, storm 0..1, rain 0..1, ash 0..1, mist 0..1, wind 0..1.2, chop: sea 0..1, volc: volcano glow on clouds 0..1 }
// Sky.flash(t) lightning 0..2, a pure function of the 'bolt' track (+ live bolts): first stroke peaks on the event, three return strokes after
// Sky.sunSize(t) sun disc angular DIAMETER in degrees (0.6; 6 from SUN_PROFILE to the cave for the telephoto profile, with its thin ring)
// Sky.GLSL: skyCol(dir, disc) = sky + cloud deck for any shader (merge Sky.U into its uniforms); skyBase(dir, disc) without the deck; deck(dir) -> rgb, coverage
// Sky.hemi = the lightning fill light (do not touch); Sky.U.uFlash = (dir from camera to the bolt, intensity), set by Air when a bolt is placed
const Sky = (() => {
  const C = Score.CUE, c = (r, g, b) => [r, g, b];
  // t, el, az (deg: 0 = WEST -x, 90 = +z, 180 = EAST +x), sun rgb*I, zenith, mid, horizon, horizon on the sun side, ground bounce, fog density, env gain, exposure, mo = moon key, ni = night
  const K = [
    { t: 0, el: 9.5, az: 9, sun: c(4.9, 3.4, 1.8), zen: c(.15, .22, .43), mid: c(.56, .48, .60), hor: c(1.22, .84, .58), hs: c(2.4, 1.55, .64), gnd: c(.30, .23, .19), fog: .0019, env: .56, ex: 1.20, mo: 0, ni: 0 },
    { t: C.HEART1 - 8, el: 6.2, az: 5, sun: c(4.7, 3.0, 1.5), zen: c(.15, .20, .41), mid: c(.60, .46, .56), hor: c(1.30, .78, .50), hs: c(2.65, 1.45, .52), gnd: c(.29, .21, .17), fog: .0021, env: .55, ex: 1.22, mo: 0, ni: 0 },
    { t: C.HEART1, el: 4.8, az: 4, sun: c(4.4, 2.6, 1.15), zen: c(.14, .17, .37), mid: c(.64, .42, .52), hor: c(1.38, .70, .42), hs: c(2.8, 1.30, .42), gnd: c(.27, .19, .16), fog: .0022, env: .55, ex: 1.25, mo: 0, ni: 0 },
    { t: C.LAND + 2, el: 3.0, az: 4, sun: c(3.0, 1.5, .62), zen: c(.11, .13, .31), mid: c(.50, .32, .44), hor: c(1.22, .52, .33), hs: c(2.1, .82, .30), gnd: c(.20, .15, .14), fog: .0021, env: .60, ex: 1.32, mo: 0, ni: 0 },
    { t: C.CUDDLE, el: .25, az: 4, sun: c(.9, .38, .18), zen: c(.07, .09, .24), mid: c(.30, .22, .38), hor: c(.95, .40, .34), hs: c(1.35, .52, .32), gnd: c(.12, .10, .12), fog: .0019, env: .70, ex: 1.40, mo: 0, ni: .1 },
    { t: C.CUDDLE + .5, el: -.4, az: 5, sun: c(0, 0, 0), zen: c(.06, .08, .22), mid: c(.26, .20, .36), hor: c(.85, .36, .32), hs: c(1.2, .46, .30), gnd: c(.10, .09, .11), fog: .0018, env: .74, ex: 1.43, mo: 0, ni: .2 },
    // the light changes hands from the sun to the moon while both are dark; the moon stands in the east-south-east so the west keeps its afterglow
    { t: C.CUDDLE + .55, el: 34, az: 160, sun: c(0, 0, 0), zen: c(.06, .08, .22), mid: c(.26, .20, .36), hs: c(.20, .22, .36), hor: c(.85, .36, .32), gnd: c(.10, .09, .11), fog: .0018, env: .74, ex: 1.43, mo: 1, ni: .2 },
    { t: C.ERUPT - .3, el: 34, az: 160, sun: c(.28, .36, .62), zen: c(.03, .05, .15), mid: c(.08, .11, .26), hor: c(.40, .25, .33), hs: c(.12, .15, .28), gnd: c(.04, .045, .07), fog: .0016, env: .80, ex: 1.50, mo: 1, ni: .8 },
    { t: C.ERUPT, el: 38, az: 160, sun: c(.45, .58, .95), zen: c(.030, .042, .095), mid: c(.05, .065, .13), hor: c(.11, .10, .15), hs: c(.10, .11, .17), gnd: c(.04, .04, .06), fog: .0022, env: .90, ex: 1.70, mo: 1, ni: 1 },
    { t: C.SILENCE - .02, el: 38, az: 160, sun: c(.45, .58, .95), zen: c(.030, .042, .095), mid: c(.05, .065, .13), hor: c(.11, .10, .15), hs: c(.10, .11, .17), gnd: c(.04, .04, .06), fog: .0022, env: .90, ex: 1.70, mo: 1, ni: 1 },
    // LOSS: grey pre-dawn under the ash, flat and colourless
    { t: C.SILENCE + .02, el: 28, az: 160, sun: c(.42, .43, .46), zen: c(.13, .14, .16), mid: c(.20, .21, .22), hor: c(.29, .29, .29), hs: c(.34, .33, .32), gnd: c(.10, .10, .10), fog: .0042, env: .95, ex: 1.50, mo: 0, ni: .3 },
    { t: C.DAWN0 - .05, el: 28, az: 160, sun: c(.50, .50, .52), zen: c(.15, .16, .19), mid: c(.23, .23, .25), hor: c(.33, .32, .31), hs: c(.40, .37, .34), gnd: c(.11, .11, .11), fog: .0038, env: .95, ex: 1.48, mo: 0, ni: .2 },
    // HATCH: sunrise in the east; the sun stands low for the telephoto profile at SUN_PROFILE
    { t: C.DAWN0 + .05, el: .6, az: 168, sun: c(1.6, .95, .42), zen: c(.09, .15, .30), mid: c(.36, .36, .46), hor: c(1.0, .66, .48), hs: c(2.0, 1.05, .46), gnd: c(.14, .12, .12), fog: .0020, env: .70, ex: 1.38, mo: 0, ni: 0 },
    { t: C.HATCH, el: 1.8, az: 168, sun: c(3.3, 2.3, 1.05), zen: c(.12, .24, .48), mid: c(.48, .50, .58), hor: c(1.20, .92, .62), hs: c(2.4, 1.6, .70), gnd: c(.22, .19, .16), fog: .0018, env: .62, ex: 1.28, mo: 0, ni: 0 },
    { t: C.SUN_PROFILE, el: 3.1, az: 170, sun: c(4.0, 3.0, 1.45), zen: c(.13, .27, .53), mid: c(.52, .56, .62), hor: c(1.18, 1.0, .74), hs: c(1.9, 1.55, .86), gnd: c(.26, .23, .19), fog: .0016, env: .60, ex: 1.22, mo: 0, ni: 0 },
    { t: C.CAVE - .05, el: 3.4, az: 170, sun: c(4.5, 3.5, 1.9), zen: c(.13, .28, .55), mid: c(.52, .57, .64), hor: c(1.20, 1.02, .76), hs: c(2.1, 1.7, .92), gnd: c(.28, .25, .21), fog: .0016, env: .60, ex: 1.22, mo: 0, ni: 0 },
    // CAVE: overcast grey day
    { t: C.CAVE + .05, el: 48, az: 140, sun: c(1.25, 1.30, 1.36), zen: c(.30, .33, .38), mid: c(.42, .45, .50), hor: c(.58, .60, .62), hs: c(.68, .68, .66), gnd: c(.20, .20, .19), fog: .0026, env: 1.0, ex: 1.32, mo: 0, ni: 0 },
    { t: C.RAIN - .05, el: 40, az: 140, sun: c(1.0, 1.04, 1.12), zen: c(.25, .28, .33), mid: c(.36, .39, .44), hor: c(.50, .52, .55), hs: c(.58, .58, .58), gnd: c(.17, .17, .17), fog: .0028, env: 1.0, ex: 1.36, mo: 0, ni: 0 },
    // SHELTER: night rain, dark blue and wet
    { t: C.RAIN + .05, el: 50, az: 150, sun: c(.30, .40, .72), zen: c(.024, .036, .080), mid: c(.040, .058, .110), hor: c(.075, .090, .135), hs: c(.085, .10, .15), gnd: c(.03, .035, .05), fog: .0034, env: .90, ex: 1.70, mo: 1, ni: 1 },
    { t: C.TRAIN - .05, el: 50, az: 150, sun: c(.30, .40, .72), zen: c(.024, .036, .080), mid: c(.040, .058, .110), hor: c(.075, .090, .135), hs: c(.085, .10, .15), gnd: c(.03, .035, .05), fog: .0034, env: .90, ex: 1.70, mo: 1, ni: 1 },
    // TRAIN: bright windy morning
    { t: C.TRAIN + .05, el: 24, az: 150, sun: c(5.3, 4.7, 3.7), zen: c(.085, .31, .69), mid: c(.25, .56, .85), hor: c(.64, .82, .92), hs: c(1.15, 1.05, .86), gnd: c(.40, .36, .30), fog: .0011, env: .60, ex: 1.14, mo: 0, ni: 0 },
    { t: C.RETURN - .05, el: 29, az: 152, sun: c(5.4, 4.9, 4.0), zen: c(.085, .32, .70), mid: c(.25, .57, .86), hor: c(.62, .82, .92), hs: c(1.1, 1.04, .88), gnd: c(.41, .37, .31), fog: .0011, env: .60, ex: 1.14, mo: 0, ni: 0 },
    // CLIMAX: dark storm afternoon, the volcano glowing; at PETRIFY the deck breaks and the sun comes up through it
    { t: C.RETURN + .05, el: 30, az: 165, sun: c(1.0, .98, 1.02), zen: c(.065, .072, .09), mid: c(.11, .11, .13), hor: c(.20, .17, .17), hs: c(.24, .20, .19), gnd: c(.07, .065, .065), fog: .0030, env: .90, ex: 1.45, mo: 0, ni: 0 },
    { t: C.PETRIFY, el: 30, az: 165, sun: c(1.0, .98, 1.02), zen: c(.065, .072, .09), mid: c(.11, .11, .13), hor: c(.20, .17, .17), hs: c(.24, .20, .19), gnd: c(.07, .065, .065), fog: .0030, env: .90, ex: 1.45, mo: 0, ni: 0 },
    // DAWN: the warmest, most hopeful light of the film
    { t: C.DAWN, el: 2.5, az: 168, sun: c(3.4, 2.2, 1.0), zen: c(.11, .20, .42), mid: c(.50, .44, .55), hor: c(1.25, .78, .54), hs: c(2.4, 1.35, .55), gnd: c(.22, .18, .16), fog: .0022, env: .65, ex: 1.30, mo: 0, ni: 0 },
    { t: C.WAKE, el: 3.5, az: 168, sun: c(4.3, 2.9, 1.45), zen: c(.12, .23, .48), mid: c(.56, .48, .60), hor: c(1.32, .84, .58), hs: c(2.7, 1.55, .62), gnd: c(.26, .21, .18), fog: .0020, env: .60, ex: 1.24, mo: 0, ni: 0 },
    { t: C.HEART2, el: 7.5, az: 168, sun: c(4.8, 3.5, 1.9), zen: c(.13, .27, .54), mid: c(.58, .52, .62), hor: c(1.34, .92, .64), hs: c(2.7, 1.75, .74), gnd: c(.30, .25, .21), fog: .0018, env: .60, ex: 1.20, mo: 0, ni: 0 },
    { t: Score.DUR, el: 8.0, az: 168, sun: c(4.9, 3.6, 2.0), zen: c(.13, .28, .55), mid: c(.58, .53, .63), hor: c(1.34, .94, .66), hs: c(2.7, 1.8, .78), gnd: c(.30, .25, .21), fog: .0018, env: .60, ex: 1.20, mo: 0, ni: 0 }];
  // ---- weather, keyed to the story (linear between keys; pairs of keys .1 s apart are cuts) ----
  const WX = {
    cover: [[0, .32], [C.LAND, .3], [C.CUDDLE, .35], [C.ERUPT - .4, .7], [C.ERUPT, .92], [C.SILENCE - .02, .95], [C.SILENCE + .02, .88], [C.DAWN0 - .05, .8], [C.DAWN0 + .05, .12], [C.CAVE - .05, .15], [C.CAVE + .05, 1], [C.TRAIN - .05, 1], [C.TRAIN + .05, .3], [C.RETURN - .05, .35], [C.RETURN + .05, 1], [C.PETRIFY, 1], [C.DAWN, .45], [C.WAKE, .2], [Score.DUR, .18]],
    storm: [[0, 0], [C.CUDDLE, 0], [C.ERUPT - .4, .35], [C.ERUPT, 1], [C.SILENCE - .02, 1], [C.SILENCE + .02, .2], [C.DAWN0 - .05, .15], [C.DAWN0 + .05, 0], [C.CAVE - .05, 0], [C.CAVE + .05, .15], [C.RAIN - .05, .15], [C.RAIN + .05, .55], [C.TRAIN - .05, .5], [C.TRAIN + .05, 0], [C.RETURN - .05, 0], [C.RETURN + .05, 1], [C.PETRIFY, 1], [C.DAWN, .1], [C.WAKE, 0]],
    rain: [[0, 0], [C.RAIN - .05, 0], [C.RAIN + .05, 1], [C.STUB, .85], [C.TRAIN - .05, .8], [C.TRAIN + .05, 0], [C.PETRIFY, 0], [C.PETRIFY + .6, 1], [C.DAWN, .55], [C.WAKE, 0]],
    ash: [[0, 0], [C.BLAST + .4, 0], [C.SILENCE, .7], [C.SILENCE + .6, 1], [C.DAWN0, .85], [C.HATCH, .25], [C.SUN_PROFILE, 0]],
    mist: [[0, .25], [C.LAND, .25], [C.ERUPT, 0], [C.SILENCE, .25], [C.DAWN0, .6], [C.SUN_PROFILE, .5], [C.CAVE, .2], [C.RAIN, .1], [C.TRAIN, .1], [C.RETURN, 0], [C.PETRIFY, .1], [C.DAWN, .55], [C.FLY, .7], [Score.DUR, .6]],
    wind: [[0, .28], [C.LAND, .3], [C.ERUPT - .4, .6], [C.ERUPT, 1], [C.SILENCE - .02, 1], [C.SILENCE + .02, .15], [C.DAWN0, .15], [C.CAVE, .35], [C.RAIN - .05, .35], [C.RAIN + .05, .7], [C.TRAIN - .05, .6], [C.TRAIN + .05, .9], [C.RETURN - .05, .9], [C.RETURN + .05, 1.1], [C.PETRIFY, 1.1], [C.DAWN, .4], [C.WAKE, .25], [Score.DUR, .25]],
    chop: [[0, .12], [C.HEART1, .1], [C.LAND, .14], [C.ERUPT - .4, .4], [C.ERUPT + 1, 1], [C.SILENCE - .02, 1], [C.SILENCE + .02, .4], [C.DAWN0, .3], [C.HATCH, .14], [C.CAVE, .3], [C.RAIN - .05, .3], [C.RAIN + .05, .55], [C.TRAIN - .05, .55], [C.TRAIN + .05, .5], [C.RETURN - .05, .5], [C.RETURN + .05, .9], [C.PETRIFY, .9], [C.DAWN, .35], [C.WAKE, .14], [Score.DUR, .12]],
    volc: [[0, 0], [C.ERUPT, 0], [C.ERUPT + .3, 1], [C.SILENCE - .02, 1], [C.SILENCE + .02, .25], [C.DAWN0, .15], [C.DAWN0 + .05, 0], [C.RETURN - .05, 0], [C.RETURN + .05, .9], [C.PETRIFY, .9], [C.DAWN, 0]] };
  const WXF = {}; for (const k in WX) WXF[k] = keyedLin(WX[k]);
  const wxAt = (t, o) => { o = o || {}; for (const k in WXF) o[k] = WXF[k](t); return o; };
  const sunSize = t => t > C.SUN_PROFILE - .35 && t < C.CAVE ? lerp(.6, 6.0, sm(C.SUN_PROFILE - .35, C.SUN_PROFILE - .05, t)) : .6;
  // lightning: the first stroke on the event, return strokes after it (offset s, amplitude)
  const STR = [[0, 1], [.055, .45], [.13, .85], [.30, .35]];
  function flash(t) { let s = 0; for (const e of Score.recent('bolt', t, .8)) { const u = t - e.t; for (const q of STR) if (u >= q[0]) s += q[1] * (e.v || 1) * Math.exp(-(u - q[0]) / .045); } return Math.min(s, 2); }

  const S = { sunDir: V3(), sun: V3(), zen: V3(), mid: V3(), hor: V3(), hs: V3(), gnd: V3(), fog: 0, env: 1, ex: 1.32, moon: 0, night: 0, t: -1, el: 0, az: 0, flash: 0, wx: wxAt(0) };
  const mixv = (o, a, b, k) => o.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
  const U = { uZen: { value: V3() }, uMid: { value: V3() }, uHor: { value: V3() }, uHs: { value: V3() }, uGnd: { value: V3() }, uSunD: { value: V3() }, uSunI: { value: V3() }, uNight: { value: 0 }, uMoon: { value: 0 }, uT: LU.uTime, uPrint: LU.uPrint, uPrintC: LU.uPrintC, uRes: LU.uRes, uLite: { value: 0 }, uPulse: { value: 0 },
    uDeck: { value: new THREE.Vector4(0, 0, 0, 0) }, uFlash: { value: new THREE.Vector4(0, .5, -.866, 0) }, uVolc: { value: new THREE.Vector4(90, -150, 320, 0) }, uSunR: { value: .005 }, uSeaK: { value: new THREE.Vector4(.05, 0, 0, 0) }, uSeaB: { value: V3(.012, .045, .07) }, tSkyNz: LU.tNz };
  const GLSL = /* glsl */`
    uniform vec3 uZen, uMid, uHor, uHs, uGnd, uSunD, uSunI; uniform float uNight, uMoon, uT, uPrint, uLite, uPulse;
    uniform vec4 uDeck, uFlash, uVolc, uSeaK; uniform vec3 uSeaB; uniform float uSunR; uniform sampler2D tSkyNz;
    vec3 skyBase(vec3 d, float disc){ float h = max(d.y, 0.0), az = dot(normalize(d.xz + 1e-5), normalize(uSunD.xz + 1e-5)) * 0.5 + 0.5, sd = max(dot(d, uSunD), 0.0);
      vec3 ho = mix(uHor, uHs, az * az * az); float k = 1.0 - h; vec3 c = mix(uZen, uMid, pow(k, 2.4)); c = mix(c, ho, pow(k, 7.5));
      c += uSunI * (0.020 * pow(sd, 8.0) + 0.05 * pow(sd, 64.0) * (1.0 - uMoon * 0.7) + 0.25 * pow(sd, 900.0)) * disc * (1.0 - 0.8 * uDeck.x * uDeck.y);
      c += vec3(1.0, 0.30, 0.07) * uDeck.z * 0.16 * pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uVolc.x, 0.0, uVolc.y) - vec3(cameraPosition.x, 0.0, cameraPosition.z) + 1e-4)), 0.0), 4.0) * exp(-h * 9.0) * (1.0 + 0.5 * uVolc.w);
      if (d.y < 0.0) c = mix(ho * 0.85, uGnd, smoothstep(0.0, -0.18, d.y));
      return c; }
    // the cloud deck: one painted layer of cotton over the whole sky (overcast, storm decks, sunset wisps); billows from the shared noise, lit by sun, volcano and lightning
    vec4 deck(vec3 d){ if (uDeck.x < 0.005 || d.y < 0.002) return vec4(0.0);
      float H = mix(1100.0, 330.0, uDeck.y), k = (H - cameraPosition.y) / d.y; vec2 P = cameraPosition.xz + d.xz * k;
      vec2 q = P * 0.00042 + uDeck.w * vec2(0.0042, 0.0016), q2 = mat2(0.8, -0.6, 0.6, 0.8) * P * 0.0013 + uDeck.w * vec2(0.0090, 0.0040);
      float n = texture2D(tSkyNz, q).r * 0.62 + texture2D(tSkyNz, q2).r * 0.38, m = texture2D(tSkyNz, q2 * 3.1 + 0.37).r;
      float th = mix(0.74, 0.20, uDeck.x), dens = smoothstep(th, th + 0.20 + 0.10 * uDeck.y, n + (m - 0.5) * 0.08), thick = clamp(dens * (0.55 + 0.8 * m), 0.0, 1.0);
      float sdn = max(dot(d, uSunD), 0.0); vec3 amb = uZen * 0.55 + uMid * 0.65 + uHor * 0.25;
      vec3 col = amb * mix(1.05, 0.50, thick) * mix(1.0, 0.62, uDeck.y);
      col += vec3(0.035, 0.042, 0.062) * uDeck.y * (0.4 + 1.1 * m) * (1.0 - 0.5 * thick); col += uSunI * (0.030 + 0.30 * pow(sdn, 6.0) + 0.9 * pow(sdn, 40.0)) * (1.0 - 0.75 * thick) * mix(1.0, 0.28, uDeck.y) * (uMoon > 0.5 ? 0.25 : 1.0);
      float vd = length(P - uVolc.xy); col += vec3(1.0, 0.30, 0.06) * uDeck.z * exp(-vd / uVolc.z) * (0.16 + 0.16 * uVolc.w) * (0.3 + 0.7 * thick) * (0.6 + 0.8 * m);
    #ifndef SKY_BAKE
      float fd = max(dot(d, uFlash.xyz), 0.0); col += vec3(0.70, 0.78, 1.0) * uFlash.w * (0.025 + 1.3 * pow(fd, 18.0) + 0.12 * pow(fd, 3.0)) * (0.35 + 0.9 * m) * (0.4 + thick);
    #endif
      float hz = 1.0 - exp(-k * 0.00006); col = mix(col, mix(uHor, uHs, pow(sdn, 3.0)), hz * 0.7);
      return vec4(col, dens * smoothstep(0.004, 0.09, d.y) * min(uDeck.x * 3.0, 1.0)); }
    vec3 skyCol(vec3 d, float disc){ vec3 c = skyBase(d, disc); vec4 k = deck(d); return mix(c, k.rgb, k.a); }`;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: Object.assign({ uFogA: LU.uFogA, uFogB: LU.uFogB }, U),
    vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: GLSL_NZ + GLSL + /* glsl */`varying vec3 vD; uniform vec3 uPrintC; uniform vec2 uRes; uniform vec4 uFogA, uFogB;
    float trPr(){ if (uPrint <= 0.0) return 0.0; if (uPrint >= 1.0) return 1.0; vec2 q = gl_FragCoord.xy / uRes - uPrintC.xy; q.x *= uPrintC.z; float a = atan(q.y, q.x), w = (0.045 * sin(a * 3.0 + 1.0) + 0.020 * sin(a * 7.0 + 4.0) + 0.006 * sin(a * 17.0)) * smoothstep(0.0, 0.5, length(q)); float e = 1.75 * pow(1.0 - uPrint, 1.25); return smoothstep(e - 0.05, e + 0.05, length(q) + w); }
    vec4 fogW(vec3 wp){ vec3 fv = wp - cameraPosition; float fd = length(fv); vec3 fr = fv / max(fd, 1e-4); float hf = uFogB.w, fy = fr.y * hf * fd; float fi = uFogA.w * exp(-max(cameraPosition.y, -2.0) * hf) * fd * (abs(fy) > 1e-3 ? (1.0 - exp(-fy)) / fy : 1.0); float sd = max(dot(fr, uSunD), 0.0); return vec4(mix(uFogA.rgb, uFogB.rgb, pow(sd, 5.0) * 0.8), 1.0 - exp(-fi)); }
    void main(){ vec3 d = normalize(vD); vec3 c; float sd = dot(d, uSunD);
      if (d.y >= 0.0) { c = skyBase(d, 1.0); vec4 dk = deck(d); float open = 1.0 - dk.a;
        if (uMoon < 0.5) { // the sun: a white-hot bead, or (telephoto) the enormous warm-yellow disc with its thin bright ring
          float ch = length(d - uSunD), r0 = uSunR, aa = max(fwidth(ch), 1e-5), big = smoothstep(0.007, 0.02, r0), u = ch / r0;
          float disc = 1.0 - smoothstep(r0 - aa, r0 + aa, ch); vec3 hot = uSunI * 9.0, yel = vec3(1.0, 0.68, 0.15) * (1.15 + 0.20 * (1.0 - u * u)) * (0.75 + 0.25 * min(dot(uSunI, vec3(0.12)), 1.0));
          c = mix(c, mix(hot, yel, big), disc * open); float ring = exp(-pow((ch - r0 * 1.085) / (r0 * 0.0085 + aa), 2.0)) * big; c = mix(c * (1.0 - 0.10 * big * smoothstep(1.16, 1.09, u) * smoothstep(1.0, 1.04, u)), vec3(1.25, 1.12, 0.86) * 1.6, ring * open);
          c += vec3(1.0, 0.85, 0.5) * big * 0.10 * exp(-max(u - 1.0, 0.0) * 3.0) * (1.0 - disc) * open; }
        else { float r = length(d - uSunD) / 0.022; vec3 up = vec3(0.0, 1.0, 0.0), mx = normalize(cross(up, uSunD)), my = cross(uSunD, mx); vec2 q = vec2(dot(d, mx), dot(d, my)) / 0.022; float seas = smoothstep(0.42, 0.62, fbm3(vec3(q * 1.6 + 3.0, 1.0))); float m = smoothstep(1.0, 0.94, r);
          c = mix(c, vec3(1.9, 1.82, 1.6) * (1.0 - 0.30 * seas) * (1.0 - 0.12 * r * r), m * uMoon * open); c += vec3(0.20, 0.26, 0.38) * exp(-r * 0.55) * uMoon * 0.5 * open; }
        if (uNight > 0.01 && d.y > 0.0) { vec3 p = d * 170.0; vec3 ip = floor(p); float s = 0.0; for (int k = 0; k < 8; k++) { vec3 o = vec3(k & 1, (k >> 1) & 1, (k >> 2) & 1); vec3 h = hash33(ip + o); vec3 sp = normalize(ip + o + (h - 0.5) * 0.7); float dd = length(d - sp) * 170.0; float big = step(0.90, h.x); s += smoothstep(0.10 + 0.13 * big * h.y, 0.0, dd) * step(0.86, h.z) * (0.18 + 1.5 * big) * (0.65 + 0.35 * sin(uT * (1.0 + 4.0 * h.y) + h.x * 40.0)) * (1.0 + uPulse * 1.2 * big); } float band = fbm3(d * 3.0 + vec3(2.0, 0.0, 5.0)); c += (vec3(0.85, 0.92, 1.1) * s * smoothstep(0.02, 0.25, d.y) + vec3(0.03, 0.035, 0.06) * smoothstep(0.45, 0.8, band) * smoothstep(0.1, 0.5, d.y)) * uNight * open; }
        c = mix(c, dk.rgb, dk.a); c += vec3(0.55, 0.62, 0.85) * uFlash.w * 0.05 * (1.0 - dk.a); }
      else { // the far sea to the horizon: mirror of the sky, the glitter path, fogged by its distance (the Sea surface hands over to this past 1 km)
        vec3 V = -d; float ndv = max(-d.y, 1e-4), sg = uSeaK.x; float F = clamp(0.02 + 0.98 * pow(1.0 - ndv, 5.0 * exp(-2.69 * sg)) / (1.0 + 22.7 * pow(sg, 1.5)), 0.02, 1.0);
        vec3 refl = skyCol(normalize(vec3(d.x, ndv + sg * 0.6, d.z)), 0.0); vec3 body = uSeaB * (uSunI * max(uSunD.y, 0.0) + uZen * 1.3 + uMid * 1.2) * 0.318;
        vec3 Hh = normalize(uSunD + V); float spec = 0.0; if (Hh.y > 0.01) { vec2 ds = -Hh.xz / Hh.y; float v2 = sg * sg + 0.0005; float pd = exp(-dot(ds, ds) / v2) / (3.14159 * v2); float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(Hh, V), 0.0), 5.0); float h4 = Hh.y * Hh.y; h4 *= h4; spec = pd * Fs / (4.0 * h4 * max(V.y, 0.05)); }
        vec3 gl = uSunI * spec * smoothstep(-0.01, 0.03, uSunD.y) * (1.0 - 0.8 * uDeck.x * uDeck.y) * (uMoon > 0.5 ? 0.6 : 1.0); gl = gl / (1.0 + dot(gl, vec3(0.333)) * 0.06);
        c = refl * F + body * (1.0 - F) + gl; float dist = max(cameraPosition.y, 0.5) / ndv; vec4 fg = fogW(cameraPosition + d * min(dist, 60000.0)); c = mix(c, fg.rgb, fg.a); }
      // ink mode: blank rice paper with one pale wash along the horizon
      float tpr_ = trPr(); if (tpr_ > 0.001) { vec3 P = vec3(0.93, 0.90, 0.83); float w = 0.012 * sin(d.x * 9.0) + 0.008 * sin(d.x * 23.0 + 1.0);
        if (d.y >= 0.0) P = mix(P, vec3(0.70, 0.76, 0.82), 0.30 * exp(-abs(d.y + w) * 14.0));
        else { float gp = clamp(dot(c, vec3(0.333)) / max(dot(uSunI, vec3(0.333)) * 0.35, 0.05) - 0.25, 0.0, 1.0); float st = texture2D(tSkyNz, vec2(d.x / max(-d.y, 0.01) * 0.02, d.z / max(-d.y, 0.01) * 0.11)).a; P = mix(vec3(0.33, 0.43, 0.57), vec3(0.50, 0.60, 0.70), smoothstep(0.35, 0.7, st) * 0.6); P = mix(P, vec3(0.94, 0.91, 0.84), max(gp, smoothstep(-0.004, 0.0, d.y) * 0.6)); }
        c = mix(c, P, tpr_); }
      gl_FragColor = vec4(c, 1.0); }` }));
  dome.frustumCulled = false; dome.layers.enable(1); dome.renderOrder = -100; dome.name = 'sky';
  const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035; const sc = sun.shadow.camera; sc.near = 1; sc.far = 190; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
  const hemi = new THREE.HemisphereLight(0x8ca6ff, 0x1a1f2e, 0.0); sun.layers.enable(1); hemi.layers.enable(1);      // hemi = the lightning fill. layer 1 = what the sea reflects
  let R, scene, pm, eqRT, eqMat, eqScene, eqCam, envRT = null, lastEnv = -99;
  function init(renderer, scn) { R = renderer; scene = scn; scene.add(dome, sun, sun.target, hemi); scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    pm = new THREE.PMREMGenerator(R); eqRT = new THREE.WebGLRenderTarget(256, 128, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); eqRT.texture.mapping = THREE.EquirectangularReflectionMapping; eqRT.texture.wrapS = THREE.RepeatWrapping;
    eqMat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: '#define SKY_BAKE\n' + GLSL_NZ + GLSL + `varying vec2 vUv; void main(){ float th = (vUv.x - 0.5) * 6.28318530718, ph = (vUv.y - 0.5) * 3.14159265; vec3 d = vec3(cos(ph) * cos(th), sin(ph), cos(ph) * sin(th)); vec3 c = skyCol(d, 0.35); float l = dot(c, vec3(0.30, 0.55, 0.15)); c = mix(vec3(l) * vec3(1.06, 1.0, 0.95), c, 0.42); c += uSunI * vec3(0.95, 0.86, 0.72) * 0.016 * smoothstep(0.25, -0.5, d.y) * clamp(uSunD.y * 2.5, 0.0, 1.0); gl_FragColor = vec4(c, 1.0); }` });
    eqScene = new THREE.Scene(); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eqMat); q.frustumCulled = false; eqScene.add(q); eqCam = new THREE.Camera(); }
  function bakeEnv() { const old = R.getRenderTarget(); R.setRenderTarget(eqRT); R.render(eqScene, eqCam); R.setRenderTarget(old); const rt = pm.fromEquirectangular(eqRT.texture, envRT); envRT = rt; scene.environment = rt.texture; }
  function state(t, o) { o = o || S; let i = 1; while (i < K.length - 1 && t > K[i].t) i++; const a = K[i - 1], b = K[i], k = clamp((t - a.t) / Math.max(1e-6, b.t - a.t)); o.el = lerp(a.el, b.el, k); o.az = lerp(a.az, b.az, k);
    const e = deg(o.el), z = deg(o.az); (o.sunDir || (o.sunDir = V3())).set(-Math.cos(z) * Math.cos(e), Math.sin(e), Math.sin(z) * Math.cos(e)).normalize(); for (const n of ['sun', 'zen', 'mid', 'hor', 'hs', 'gnd']) mixv(o[n] || (o[n] = V3()), a[n], b[n], k);
    o.fog = lerp(a.fog, b.fog, k); o.env = lerp(a.env, b.env, k); o.ex = lerp(a.ex, b.ex, k); o.moon = lerp(a.mo, b.mo, k) > .5 ? 1 : 0; o.night = lerp(a.ni, b.ni, k); o.t = t; o.wx = wxAt(t, o.wx); o.flash = flash(t); return o; }
  // focus = world point the shadow box is centred on; box = half size in metres
  function apply(t, focus, box = 34) {
    state(t); const w = S.wx, fl = S.flash; U.uZen.value.copy(S.zen); U.uMid.value.copy(S.mid); U.uHor.value.copy(S.hor); U.uHs.value.copy(S.hs); U.uGnd.value.copy(S.gnd); U.uSunD.value.copy(S.sunDir); U.uSunI.value.copy(S.sun); U.uNight.value = S.night; U.uMoon.value = S.moon; U.uPulse.value = Score.env('celesta', t, 0.5);
    U.uDeck.value.set(w.cover, w.storm, w.volc, LU.uTime.value * (.35 + .9 * w.wind)); U.uVolc.value.w = Math.min(1.5, Score.env('lava', t, .6)); U.uFlash.value.w = fl; U.uSunR.value = deg(sunSize(t)) / 2;
    U.uSeaK.value.x = lerp(.035, .16, w.chop); U.uSeaB.value.set(lerp(.010, .012, w.storm), lerp(.048, .034, w.storm), lerp(.075, .040, w.storm));
    hemi.intensity = fl * 4.0;
    LU.uSunDir.value.copy(S.sunDir); LU.uSunCol.value.copy(S.sun); sun.color.setRGB(S.sun.x, S.sun.y, S.sun.z); sun.intensity = 1;
    const sz = box * 2 / sun.shadow.mapSize.x, f = focus || V3(); sc.left = -box; sc.right = box; sc.top = box; sc.bottom = -box; sc.updateProjectionMatrix();
    // snap to shadow texels so edges do not crawl as the camera moves
    const d = S.sunDir, up = Math.abs(d.y) > .99 ? V3(1, 0, 0) : V3(0, 1, 0), x = V3().crossVectors(up, d).normalize(), y = V3().crossVectors(d, x); const a = Math.round(f.dot(x) / sz) * sz, b = Math.round(f.dot(y) / sz) * sz, g = f.dot(d); const fp = V3().addScaledVector(x, a).addScaledVector(y, b).addScaledVector(d, g);
    sun.target.position.copy(fp); sun.position.copy(fp).addScaledVector(d, 95); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    const tan = S.moon > .5 ? .03 : lerp(.055, .030, sm(5, 35, S.el)) * (1 + 1.5 * w.cover * (1 - S.moon)); LU.uShadowK.value.set(Math.min(.014, .48 / (2 * box)), 189 * tan / (2 * box), .7 / sun.shadow.mapSize.x, .40 / (2 * box));
    LU.uFogA.value.set(lerp(S.hor.x, S.mid.x, .25), lerp(S.hor.y, S.mid.y, .25), lerp(S.hor.z, S.mid.z, .25), S.fog); LU.uFogB.value.set(S.hs.x, S.hs.y, S.hs.z, .028);
    scene.environmentIntensity = S.env; if (Math.abs(t - lastEnv) > (CAPTURE ? 0.02 : 0.35) || !envRT) { bakeEnv(); lastEnv = t; }
  }
  return { init, apply, S, U, GLSL, sun, hemi, dome, state, K, WX, wxAt, flash, sunSize, get env() { return envRT; } };
})();

// ---- LANTERN LIGHT FIELD: any number of small warm lights, summed into a map every material reads -------------------------------------
// const id = Lan.add({x,y,z, r: reach in metres, color:[r,g,b], gain:()=>0..n | number}); Lan.pos(id,x,y,z); Lan.level(id,v)
const Lan = (() => {
  const MAX = 420, P = new Float32Array(MAX * 4), C = new Float32Array(MAX * 3); let n = 0, rt, mesh, scene, cam, R; const L = [], size = 84;
  function add(o) { const id = n++; if (id >= MAX) return -1; L.push(Object.assign({ r: 6, color: [1, .62, .28], gain: 1, level: 1 }, o)); return id; }
  function init(renderer) { R = renderer; rt = new THREE.WebGLRenderTarget(256, 256, { count: 2, type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 3));
    const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { uC: { value: new THREE.Vector2() }, uS: { value: size } }, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      vertexShader: `in vec4 aP; in vec3 aC; uniform vec2 uC; uniform float uS; out vec2 vQ; out vec3 vC; out vec3 vP; void main(){ vQ = position.xy; vC = aC; vP = vec3(aP.x - uC.x, aP.y, aP.z - uC.y); vec2 w = aP.xz - uC + position.xy * aP.w; gl_Position = vec4(w / uS * 2.0, 0.0, 1.0); }`,
      fragmentShader: `precision highp float; in vec2 vQ; in vec3 vC; in vec3 vP; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1; void main(){ float r = dot(vQ, vQ); float w = max(1.0 - r, 0.0); w *= w; if (w <= 0.0) discard; float l = dot(vC, vec3(0.333)) * w + w * 1e-3; o0 = vec4(vC * w, l); o1 = vec4(vP * l, 1.0); }` });
    mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene = new THREE.Scene(); scene.add(mesh); cam = new THREE.Camera(); LU.tLan.value = rt.textures[0]; LU.tLanP.value = rt.textures[1]; }
  function update(cx, cz, gain) { LU.uLan.value.set(cx, cz, size, gain); let k = 0; if (gain > .001) for (let i = 0; i < n && k < MAX; i++) { const o = L[i], g = (typeof o.gain === 'function' ? o.gain() : o.gain) * o.level; if (g < .004 || Math.abs(o.x - cx) > size * .5 + o.r || Math.abs(o.z - cz) > size * .5 + o.r) continue; P[k * 4] = o.x; P[k * 4 + 1] = o.y; P[k * 4 + 2] = o.z; P[k * 4 + 3] = o.r; C[k * 3] = o.color[0] * g; C[k * 3 + 1] = o.color[1] * g; C[k * 3 + 2] = o.color[2] * g; k++; }
    const g = mesh.geometry; g.instanceCount = k; g.attributes.aP.needsUpdate = g.attributes.aC.needsUpdate = true; mesh.material.uniforms.uC.value.set(cx, cz); const old = R.getRenderTarget(), ca = R.autoClear; R.setRenderTarget(rt); R.setClearColor(0, 0); R.clear(); R.autoClear = false; if (k) R.render(scene, cam); R.autoClear = ca; R.setRenderTarget(old); Lan.count = k; }
  return { add, init, update, pos(i, x, y, z) { const o = L[i]; o.x = x; o.y = y; o.z = z; }, level(i, v) { L[i].level = v; }, list: L, count: 0, size };
})();
