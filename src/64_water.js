'use strict';
// ---- SEA: the ocean all round the island to the horizon (y = 0) -------------------------------------------------------------------------
// Sea.level = 0
// Sea.splash(x, z, r, s, foam?)  drop an impulse: r radius m, s downward speed m/s (.3 a stone, 2 a dragon's foot, 6 a body); ripples + foam, drops thrown when s > .25
// Sea.ring(x, z, s, t?)          a clean expanding ring anywhere (closed form)        Sea.heightAt(x, z) surface height now, for anything that floats
// Sea.rebake()                   re-read the coast (where the set pierces the water), e.g. after the island moved
// Look: a camera-centred polar grid to 1.25 km, then the sky dome paints the far sea to the horizon with the same model (Sky uSeaK / uSeaB).
//   Gerstner swell scaled by the weather (glassy at sunset, heavy in storms, pumped by the taiko) + two animated wave maps with filtered slope variance
//   (no shimmer in the long lens) + rain rings + a wave-equation ripple window that follows Stage.focus. Planar reflection of layer 1 (mirrored camera,
//   oblique near plane, half size, blurred streak), sun glitter path that sparkles on the harp, whitecaps in storms, surf foam and green shallows at the
//   cliffs from a coast mask baked once from the set, lava/fire (Lan field) glinting on the water.
const Sea = (() => {
  const WL = 0, N = 256, SIZE = 64, DX = SIZE / N, STEP = 1 / 60, RMAX = 1250, CB = { x0: -110, x1: 250, z0: -270, z1: 110 }, C = Score.CUE;
  let R, now = 0, baked = false;
  // ---- full-screen pass helper ------------------------------------------------------------------------------------------------------
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fq = new THREE.Mesh(fg, null); fq.frustumCulled = false; const fs = new THREE.Scene(); fs.add(fq); const fc = new THREE.Camera();
  const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const pm = (f, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: f, uniforms: u, depthTest: false, depthWrite: false, fog: false, blending: THREE.NoBlending });
  const pass = (m, rt) => { fq.material = m; R.setRenderTarget(rt); R.render(fs, fc); };
  const RT = (w, h, o) => new THREE.WebGLRenderTarget(w, h, Object.assign({ type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, o));

  // ---- swell: Gerstner waves from the west-north-west, amplitude = weather (shared with the CPU) ----------------------------------------
  const LW = [[64, .55, .42, .3], [41, .38, .62, 2.1], [27, .26, .28, 4.4], [17, .16, .86, 1.2], [11, .09, .12, 3.3]].map(([l, a, d, p]) => { const k = TAU / l; return { k, a, x: Math.cos(d), z: Math.sin(d), p, w: Math.sqrt(9.8 * k) }; });
  const f5 = v => v.toFixed(5);
  const GL_LW = 'uniform float uTime, uSwell; vec3 longW(vec2 p){ vec3 o = vec3(0.0); float a, A;\n' + LW.map(w => `a = dot(p, vec2(${f5(w.x * w.k)}, ${f5(w.z * w.k)})) - uTime * ${f5(w.w)} + ${w.p.toFixed(3)}; A = ${f5(w.a)} * uSwell; o += vec3(A * sin(a), A * ${f5(w.k)} * cos(a) * vec2(${f5(w.x)}, ${f5(w.z)}));`).join('\n') + ' return o; }\n' +
    'vec3 gerst(vec2 p){ vec3 o = vec3(0.0); float a, A;\n' + LW.map(w => `a = dot(p, vec2(${f5(w.x * w.k)}, ${f5(w.z * w.k)})) - uTime * ${f5(w.w)} + ${w.p.toFixed(3)}; A = ${f5(w.a)} * uSwell; o += vec3(-0.85 * A * cos(a) * ${f5(w.x)}, A * sin(a), -0.85 * A * cos(a) * ${f5(w.z)});`).join('\n') + ' return o; }';
  let swellK = .1; const swellOf = w => (.06 + .94 * Math.pow(w.chop, 1.4));
  function swell(x, z) { let h = 0; for (const w of LW) h += w.a * swellK * Math.sin((x * w.x + z * w.z) * w.k - now * w.w + w.p); return h; }

  // ---- rings: closed form, anywhere ---------------------------------------------------------------------------------------------------
  const MAXR = 8, ringU = Array.from({ length: MAXR }, () => new THREE.Vector4(0, 0, -1, 0)), liveR = [];
  const GL_RING = /* glsl */`uniform vec4 uRing[${MAXR}];
    vec3 rings(vec2 p, float px){ vec3 o = vec3(0.0); for (int i = 0; i < ${MAXR}; i++) { vec4 g = uRing[i]; if (g.w < 1e-4) continue; vec2 q = p - g.xy; float r = length(q), R = 1.6 * g.z, f = r - R + 0.10 * g.z, w = 0.28 + 0.30 * g.z; if (abs(f) > 3.0 * w) continue; float la = 0.45 + 0.16 * g.z, k = 6.2831853 / la; float e = exp(-f * f / (2.0 * w * w)) * g.w * exp(-g.z * 0.38) / sqrt(1.0 + R * 0.6) * smoothstep(0.0, 0.15, g.z) * smoothstep(0.9, 0.3, px / la);
      float c = cos(k * f), s = sin(k * f); o.x += e * c; o.yz += q / max(r, 0.05) * e * (-k * s - f / (w * w) * c) * smoothstep(0.0, 0.3, r); } return o; }`;
  function ringH(x, z) { let h = 0; for (const g of ringU) { if (g.w < 1e-4) continue; const r = Math.hypot(x - g.x, z - g.y), Rr = 1.6 * g.z, f = r - Rr + .1 * g.z, w = .28 + .30 * g.z; if (Math.abs(f) > 3 * w) continue; h += Math.exp(-f * f / (2 * w * w)) * g.w * Math.exp(-g.z * .38) / Math.sqrt(1 + Rr * .6) * sm(0, .15, g.z) * Math.cos(TAU / (.45 + .16 * g.z) * f); } return h; }
  const heightAt = (x, z) => WL + swell(x, z) + ringH(x, z);

  // ---- animated wave maps: slope x, slope z, height, slope^2 (unit variance), mip filtered ----------------------------------------------------
  const NW = 40; let wA, wB, rtA, rtB, mWave;
  function waveSet(seed, L, n0, n1, spread) { const r = rng(seed), o = [], d0 = Math.atan2(.42, .91); let e = 0; for (let i = 0; i < NW; i++) { const f = (i + r() * .8) / NW, n = n0 * Math.pow(n1 / n0, f), a = d0 + (r() + r() + r() - 1.5) * spread; let nx = Math.round(Math.cos(a) * n), nz = Math.round(Math.sin(a) * n); if (!nx && !nz) nx = 1; const k = TAU * Math.hypot(nx, nz) / L, am = (1 - .55 * f) * (.6 + .8 * r()); e += am * am / 2; o.push({ nx, nz, p: r() * TAU, w: Math.sqrt(9.8 * k + 7.4e-5 * k * k * k) * .8, am }); } const s = 1 / Math.sqrt(e); o.forEach(w => w.am *= s); return { o, L, u: o.map(w => new THREE.Vector4(w.nx, w.nz, w.p, w.am)) }; }
  function waveStep(t) { for (const S of [wA, wB]) { S.o.forEach((w, i) => { S.u[i].z = mod(w.p - w.w * t, TAU); }); mWave.uniforms.uW.value = S.u; pass(mWave, S === wA ? rtA : rtB); } }

  // ---- the coast, read once from the set: where anything crosses the waterline -> near collar, surf band, shallows ------------------------------
  let rtCon;
  function bake(scene) {
    const W = CB.x1 - CB.x0, H = CB.z1 - CB.z0, cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, 1); cam.up.set(0, 0, -1); const hid = [];
    scene.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (o.visible && (!m || !m.userData || !m.userData.kit || o.userData.noBake || m.transparent)) { hid.push(o); o.visible = false; } });
    const vs = 'void main(){ vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\np = instanceMatrix * p;\n#endif\ngl_Position = projectionMatrix * viewMatrix * modelMatrix * p; }';
    const mC = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }', side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false });
    const rc = RT(1024, 1080, { type: THREE.UnsignedByteType });
    const go = (top, far, sx, sz) => { cam.position.set((CB.x0 + CB.x1) / 2, top, (CB.z0 + CB.z1) / 2); cam.lookAt((CB.x0 + CB.x1) / 2, top - 1, (CB.z0 + CB.z1) / 2); cam.far = far; cam.updateProjectionMatrix(); const e = cam.projectionMatrix.elements, h = far / 2; if (sx) { e[8] += 2 / W * sx; e[12] += 2 / W * sx * h; } if (sz) { e[9] += 2 / H * sz; e[13] += 2 / H * sz * h; } cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); cam.updateMatrixWorld(); R.render(scene, cam); };
    const au = R.shadowMap.autoUpdate, env = scene.environment, bg = scene.background; R.shadowMap.autoUpdate = false; scene.overrideMaterial = mC; R.setRenderTarget(rc); R.setClearColor(0, 0); R.clear(); const ac = R.autoClear; R.autoClear = false;
    for (const [a, b] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) go(WL + .6, .95, a, b);
    R.autoClear = ac; scene.overrideMaterial = null; hid.forEach(o => o.visible = true);
    const bl = pm(`uniform sampler2D tC; uniform vec2 uM; varying vec2 vUv; void main(){ vec2 u = vec2(vUv.x, 1.0 - vUv.y); float n = 0.0, w = 0.0, z = 0.0; for (int i = 0; i < 48; i++) { float f = (float(i) + 0.5) / 48.0, a = float(i) * 2.39996; vec2 o = vec2(cos(a), sin(a)) * sqrt(f); n += texture2D(tC, u + o * 1.6 / uM).r; w += texture2D(tC, u + o * 8.0 / uM).r; z += texture2D(tC, u + o * 24.0 / uM).r; } gl_FragColor = vec4(min(n / 48.0 * 2.5, 1.0), min(w / 48.0 * 3.0, 1.0), min(z / 48.0 * 3.0, 1.0), 1.0); }`, { tC: { value: rc.texture }, uM: { value: new THREE.Vector2(W, H) } });
    pass(bl, rtCon); R.shadowMap.autoUpdate = au; scene.environment = env; scene.background = bg; rc.dispose(); mC.dispose(); bl.dispose(); }

  // ---- ripples: wave equation in a window that follows the story (Stage.focus) ---------------------------------------------------------------
  const MI = 14, impA = Array.from({ length: MI }, () => new THREE.Vector4()), impB = Array.from({ length: MI }, () => new THREE.Vector4()); let simA, simB, mSim, simClear = true; const steps = [], pend = []; const win = { x: 0, z: 0 };
  let acc = 0, quiet = 999; const uWin = { value: new THREE.Vector4(0, 0, SIZE, 0) };
  const impulse = (x, z, r, s, foam = 0) => { if (pend.length < 40) pend.push([x, z, Math.max(r, .2), s, foam]); quiet = 0; };
  function simUpdate(ctx) { const st = ctx.st.pos, tx = Math.round(st.x / DX) * DX, tz = Math.round(st.z / DX) * DX; if (ctx.reset) { steps.length = 0; simClear = true; acc = 0; pend.length = 0; quiet = 999; win.x = tx; win.z = tz; }
    acc = Math.min(acc + ctx.dt, .1); while (acc > STEP - 1e-5) { acc -= STEP; quiet += STEP; const sx = tx - win.x, sz = tz - win.z; win.x = tx; win.z = tz; if (quiet < 12) steps.push({ sx, sz, x: tx, z: tz, imp: pend.splice(0, MI) }); if (steps.length > 8) steps.shift(); } }
  function simRun() { if (simClear) { for (const s of [simA, simB]) { R.setRenderTarget(s); R.setClearColor(0, 0); R.clear(); } simClear = false; }
    const u = mSim.uniforms; for (const s of steps) { u.uShift.value.set(s.sx / SIZE, s.sz / SIZE); u.uC.value.set(s.x, s.z); u.uN.value = s.imp.length; s.imp.forEach((q, i) => { impA[i].set(q[0], q[1], q[2], q[3]); impB[i].set(q[4], 0, 0, 0); }); u.tP.value = simA.texture; pass(mSim, simB); const t = simA; simA = simB; simB = t; } steps.length = 0; uWin.value.set(win.x, win.z, SIZE, quiet < 12 ? 1 : 0); }

  // ---- reflection: mirrored camera, oblique near plane at the water ----------------------------------------------------------------------------
  let rR, rB1, rB2, mBlur; const mc = new THREE.PerspectiveCamera(); mc.layers.set(1); const uRVP = { value: new THREE.Matrix4() }, uRPI = { value: new THREE.Matrix4() }, uRefl = { value: 0 }, tR = { value: null }, tRB = { value: null }, tRD = { value: null };
  const v0 = V3(), v1 = V3(), v2 = V3(), q4 = new THREE.Vector4(), pl = new THREE.Plane(), cp = new THREE.Vector4(), rotM = new THREE.Matrix4(), dbs = new THREE.Vector2();
  function want(cam) { if (Q.has('norefl') || LU.uPrint.value > .995) return 0; const p = cam.position; if (p.y < WL + .05) return 0; v1.set(0, 0, -1).applyQuaternion(cam.quaternion); const low = Math.asin(clamp(v1.y, -1, 1)) - deg(cam.fov) * .62; return low < 0 ? 1 : 0; }
  function reflect(scene, cam) {
    v0.setFromMatrixPosition(cam.matrixWorld); const k = want(cam); uRefl.value = k; if (k < .004) return;
    rotM.extractRotation(cam.matrixWorld); v1.set(0, 0, -1).applyMatrix4(rotM).add(v0); v2.set(0, 1, 0).applyMatrix4(rotM); v2.y *= -1; mc.position.set(v0.x, 2 * WL - v0.y, v0.z); v1.y = 2 * WL - v1.y; v2.multiplyScalar(-1); mc.up.copy(v2); mc.lookAt(v1); mc.near = cam.near; mc.far = cam.far; mc.updateMatrixWorld(); mc.projectionMatrix.copy(cam.projectionMatrix);
    uRVP.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    pl.setFromNormalAndCoplanarPoint(v2.set(0, 1, 0), v1.set(0, WL - .05, 0)); pl.applyMatrix4(mc.matrixWorldInverse); cp.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant); const P = mc.projectionMatrix.elements; q4.set((Math.sign(cp.x) + P[8]) / P[0], (Math.sign(cp.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]); cp.multiplyScalar(2 / cp.dot(q4)); P[2] = cp.x; P[6] = cp.y; P[10] = cp.z + 1 - .0005; P[14] = cp.w; mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert(); uRPI.value.copy(mc.projectionMatrixInverse);
    R.getDrawingBufferSize(dbs); const w = Math.max(64, dbs.x >> 1), h = Math.max(64, dbs.y >> 1); if (!rR || rR.width !== w || rR.height !== h) { [rR, rB1, rB2].forEach(x => x && x.dispose()); rR = RT(w, h, { depthBuffer: true, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) }); rB1 = RT(w >> 1, h >> 1); rB2 = RT(w >> 1, h >> 1); tR.value = rR.texture; tRD.value = rR.depthTexture; tRB.value = rB2.texture; }
    const au = R.shadowMap.autoUpdate, ac = R.autoClear; R.shadowMap.autoUpdate = false; R.autoClear = false; R.setRenderTarget(rR); R.setClearColor(0, 1); R.clear(); R.render(scene, mc); R.shadowMap.autoUpdate = au; R.autoClear = ac;
    mBlur.uniforms.tC.value = rR.texture; mBlur.uniforms.uD.value.set(0, 1 / rB1.height); pass(mBlur, rB1); mBlur.uniforms.tC.value = rB1.texture; mBlur.uniforms.uD.value.set(0, 3.1 / rB1.height); pass(mBlur, rB2);
  }

  // ---- the surface ------------------------------------------------------------------------------------------------------------------------------
  const PR = /* glsl */`float trPr(){ if (uPrint <= 0.0) return 0.0; if (uPrint >= 1.0) return 1.0; vec2 q = gl_FragCoord.xy / uRes - uPrintC.xy; q.x *= uPrintC.z; float a = atan(q.y, q.x), w = (0.045 * sin(a * 3.0 + 1.0) + 0.020 * sin(a * 7.0 + 4.0) + 0.006 * sin(a * 17.0)) * smoothstep(0.0, 0.5, length(q)); float e = 1.75 * pow(1.0 - uPrint, 1.25); return smoothstep(e - 0.05, e + 0.05, length(q) + w); }`;
  const GL_FOG = /* glsl */`uniform vec4 uFogA, uFogB; vec4 trFogW(vec3 wp, vec3 sd_){ vec3 fv = wp - cameraPosition; float fd = length(fv); vec3 fr = fv / max(fd, 1e-4); float hf = uFogB.w, fy = fr.y * hf * fd; float fi = uFogA.w * exp(-max(cameraPosition.y, -2.0) * hf) * fd * (abs(fy) > 1e-3 ? (1.0 - exp(-fy)) / fy : 1.0); float sd = max(dot(fr, sd_), 0.0); return vec4(mix(uFogA.rgb, uFogB.rgb, pow(sd, 5.0) * 0.8), 1.0 - exp(-fi)); }`;
  const U = { tWA: { value: null }, tWB: { value: null }, tSim: { value: null }, tCon: { value: null }, tR, tRB, tRD, uRVP, uRPI, uRefl, uWin, uConR: { value: new THREE.Vector4(CB.x0, CB.z0, 1 / (CB.x1 - CB.x0), 1 / (CB.z1 - CB.z0)) }, uC: { value: new THREE.Vector2() }, uRing: { value: ringU },
    uSwell: { value: .1 }, uChop: { value: .1 }, uStorm: { value: 0 }, uRain: { value: 0 }, uGlit: { value: 1 }, uWindD: { value: new THREE.Vector2(.91, .42) } };
  const surfMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: true, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: Object.assign({}, U, Sky.U, { uTime: LU.uTime, tNz: LU.tNz, uFogA: LU.uFogA, uFogB: LU.uFogB, tLan: LU.tLan, tLanP: LU.tLanP, uLan: LU.uLan }),
    vertexShader: GL_LW + /* glsl */`uniform vec2 uC; uniform vec4 uWin; uniform sampler2D tSim; varying vec3 vW; varying float vH;
      void main(){ vec2 w = uC + position.xz * position.y; float d = position.y; vec3 gq = gerst(w) * smoothstep(420.0, 90.0, d); w += gq.xz; float h = gq.y; vec2 su = (w - uWin.xy) / uWin.z + 0.5; if (uWin.w > 0.5 && su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0) h += texture2D(tSim, su).r * smoothstep(60.0, 20.0, d); vH = h; vW = vec3(w.x, ${WL.toFixed(3)} + h, w.y); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: GLSL_NZ + GL_LW + GL_RING + Sky.GLSL + GL_FOG + /* glsl */`
      uniform sampler2D tWA, tWB, tNz, tSim, tCon, tR, tRB, tRD, tLan, tLanP; uniform mat4 uRVP, uRPI; uniform float uRefl, uChop, uStorm, uRain, uGlit; uniform vec4 uWin, uConR, uLan; uniform vec2 uC, uWindD, uRes; uniform vec3 uPrintC; varying vec3 vW; varying float vH;
      ${PR}
      vec2 proj(vec3 q){ vec4 c = uRVP * vec4(q, 1.0); return c.xy / max(c.w, 1e-3); }
      // rain: every drop a small ring, two layers of cells
      vec3 rainR(vec2 p, float px){ vec3 o = vec3(0.0); for (int L = 0; L < 3; L++) { float fl = float(L), sc = 1.7 + fl * 0.6; vec2 q = p * sc + fl * 7.31, id = floor(q), f = fract(q); vec3 h = hash33(vec3(id, fl)); float ph = fract(uTime * (0.85 + 0.6 * h.z) + h.x * 7.0); vec2 r = f - (0.25 + 0.5 * h.xy); float d = length(r), Rr = ph * 0.42, w = 0.045; float e = exp(-pow((d - Rr) / w, 2.0)) * (1.0 - ph) * (1.0 - ph) * step(h.z, uRain * 0.9 + 0.1); float k = 6.2831853 / 0.09; o.x += e * cos((d - Rr) * k); o.yz += r / max(d, 1e-3) * e * (-k * sin((d - Rr) * k)) * 0.012 * sc; } return o * smoothstep(0.08, 0.02, px); }
      void main(){ vec2 p = vW.xz; vec3 Vv = cameraPosition - vW; float dist = length(Vv); vec3 V = Vv / dist; V.y = max(V.y, 0.004); float px = dist * 0.0007 / sqrt(V.y); float hd = length(p - uC);
        // ---- slopes: swell + wind sea in patches (cat's-paws) + ripples + rain
        vec2 wd = uWindD; float gust = texture2D(tNz, vec2(dot(p, wd) * 0.0045, dot(p, vec2(-wd.y, wd.x)) * 0.0115) - vec2(uTime * 0.011, uTime * 0.002)).r, gu2 = texture2D(tNz, vec2(dot(p, wd) * 0.017, dot(p, vec2(-wd.y, wd.x)) * 0.047) - vec2(uTime * 0.027, 0.0)).r;
        float cat = smoothstep(0.40, 0.62, gust * 0.60 + gu2 * 0.40 + uChop * 0.25);
        vec4 a = texture2D(tWA, p / 9.0), b = texture2D(tWA, vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) / 3.1 + 0.37), c = texture2D(tWB, vec2(0.94 * p.x + 0.342 * p.y, -0.342 * p.x + 0.94 * p.y) / 31.0);
        float kA = mix(0.006, 0.050, cat) * (0.4 + 2.0 * uChop), kB = mix(0.004, 0.040, cat) * (0.4 + 2.0 * uChop), kC = mix(0.010, 0.11, uChop);
        vec3 lw = longW(p);
        vec2 bs = vec2(0.8 * b.x + 0.6 * b.y, -0.6 * b.x + 0.8 * b.y), cs = vec2(0.94 * c.x - 0.342 * c.y, 0.342 * c.x + 0.94 * c.y);
        vec2 s = a.xy * kA + bs * kB + cs * kC + lw.yz; float var = kA * kA * max(a.w - dot(a.xy, a.xy), 0.0) + kB * kB * max(b.w - dot(b.xy, b.xy), 0.0) + kC * kC * max(c.w - dot(c.xy, c.xy), 0.0) + 0.00008 + 0.0009 * uRain;
        vec3 rg = rings(p, px); s += rg.yz; if (uRain > 0.01) { vec3 rr = rainR(p, px); s += rr.yz * uRain; }
        float foamS = 0.0, rough = 0.0; vec2 su = (p - uWin.xy) / uWin.z + 0.5; vec2 e2 = min(su, 1.0 - su);
        if (uWin.w > 0.5 && min(e2.x, e2.y) > 0.004) { float d = 1.0 / ${N}.0; vec4 m = texture2D(tSim, su); vec2 g = vec2(texture2D(tSim, su + vec2(d, 0.0)).r - texture2D(tSim, su - vec2(d, 0.0)).r, texture2D(tSim, su + vec2(0.0, d)).r - texture2D(tSim, su - vec2(0.0, d)).r) / ${(2 * DX).toFixed(5)}; g *= smoothstep(0.004, 0.05, min(e2.x, e2.y)); g = g / (1.0 + length(g) * 0.55); s += g; foamS = m.b; rough = min(dot(g, g), 0.25) * 0.10; }
        vec3 n = normalize(vec3(-s.x, 1.0, -s.y)); float ndv = max(dot(n, V), 0.015), sg = sqrt(var + rough);
        // ---- the coast
        vec2 cu = (p - uConR.xy) * uConR.zw; vec4 con = cu.x > 0.0 && cu.x < 1.0 && cu.y > 0.0 && cu.y < 1.0 ? texture2D(tCon, cu) : vec4(0.0);
        // ---- reflection
        vec3 Rv = reflect(-V, n); Rv.y = max(Rv.y, 0.012); Rv = normalize(Rv); vec3 sky = skyCol(Rv, 0.25), refl = sky;
        if (uRefl > 0.003) {
          vec2 u0 = proj(vW); float z0 = texture2D(tRD, clamp(u0, 0.002, 0.998)).x; vec4 ev = uRPI * vec4(u0 * 2.0 - 1.0, z0 * 2.0 - 1.0, 1.0); float D = clamp(length(ev.xyz / ev.w) - dist, 0.05, 400.0); if (z0 > 0.99999) D = 400.0;
          vec3 f3 = normalize(vec3(-V.x, 0.0, -V.z)); vec2 u1 = proj(vW + Rv * D); vec3 sharp = min(texture2D(tR, clamp(u1, 0.002, 0.998)).rgb, vec3(14.0)); refl = sharp;
          float sl = sqrt(var * 0.5 + 0.00004); float span = sl * D / (D + dist); float kb = max(smoothstep(0.003, 0.016, span), z0 > 0.99999 ? 0.35 + 0.6 * uNight : 0.0);
          if (kb > 0.0) { vec3 ac = vec3(0.0); float w = 0.0; for (int i = -4; i <= 4; i++) { float o = float(i) * 0.5; vec3 nn = normalize(n - f3 * (o * sl)); vec3 r2 = reflect(-V, nn); r2.y = max(r2.y, 0.010); vec2 u = proj(vW + normalize(r2) * D); float ww = exp(-o * o * 0.5); ac += texture2D(tRB, clamp(u, 0.003, 0.997)).rgb * ww; w += ww; } refl = mix(refl, ac / w, kb); }
          refl = mix(sky, refl, uRefl); }
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0 * exp(-2.69 * sg)) / (1.0 + 22.7 * pow(sg, 1.5)); F = clamp(F, 0.02, 1.0);
        // ---- body: deep blue, green shallows at the cliffs, crests lit through from behind by a low sun
        vec3 Es = uSunI * max(uSunD.y, 0.0), Ea = uZen * 1.3 + uMid * 1.2 + uHor * 0.5; vec3 alb = mix(uSeaB, vec3(0.035, 0.15, 0.15), con.b * 0.7) * (0.85 + 0.30 * gu2); vec3 body = alb * (Es + Ea) * 0.318;
        float back = pow(max(dot(normalize(vec3(-V.x, 0.0, -V.z) + 1e-4), normalize(vec3(uSunD.x, 0.0, uSunD.z) + 1e-4)), 0.0), 3.0); body += vec3(0.05, 0.22, 0.17) * uSunI * 0.16 * back * clamp(0.15 + vH * 1.6 + length(s) * 2.5, 0.0, 1.6) * smoothstep(-0.02, 0.05, uSunD.y);
        // ---- sun or moon glitter: slopes that happen to face the light; it sparkles harder on the harp
        vec3 H = normalize(uSunD + V); float spec = 0.0; if (H.y > 0.02) { vec2 ds = -H.xz / H.y - s; float v2 = max(var, 0.0006) + 0.0012 * uMoon + rough; float pd = exp(-dot(ds, ds) / v2) / (3.14159 * v2); float lh = max(dot(H, V), 0.0); float Fs = 0.02 + 0.98 * pow(1.0 - lh, 5.0); float h4 = H.y * H.y; h4 *= h4; spec = pd * Fs / (4.0 * h4 * max(V.y, 0.08)); }
        float tw = 0.25 + 1.1 * uGlit * smoothstep(0.35, 0.75, texture2D(tNz, p * 0.83 + s * 3.0 + vec2(uTime * 0.05, uTime * 0.031)).g); vec3 gl = uSunI * spec * tw * (uMoon < 0.5 ? 1.0 : 0.8) * (1.0 - 0.85 * uDeck.x * uDeck.y); gl = gl / (1.0 + dot(gl, vec3(0.333)) * mix(0.05, 1.2, uMoon)) * smoothstep(-0.01, 0.03, uSunD.y);
        // ---- fire on the water: the lantern field (lava, Cinder, fire breath) glints in the waves
        vec3 lanC = vec3(0.0); if (uLan.w > 0.001) { vec2 lu = (p - uLan.xy) / uLan.z + 0.5; if (lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0) { vec4 la = texture2D(tLan, lu); if (la.a > 1e-3) { vec3 lp = texture2D(tLanP, lu).xyz / la.a + vec3(uLan.x, 0.0, uLan.y); vec3 Lw = lp - vW; float d2 = dot(Lw, Lw); vec3 E = la.rgb * uLan.w / (0.6 + 0.16 * d2) * smoothstep(0.5, 0.42, max(abs(lu.x - 0.5), abs(lu.y - 0.5))); float lobe = exp(-(1.0 - dot(Rv, Lw * inversesqrt(d2))) / (var * 3.0 + 0.004)); lanC = E * (lobe * 6.0 * (0.2 + F) + alb * 0.6); } } }
        // ---- foam: collars and surf at the cliffs, whitecaps in a storm, the ripples' own foam
        vec4 nz = texture2D(tNz, p * 0.21 + s * 0.4 + vec2(uTime * 0.008, 0.0)), nz2 = texture2D(tNz, p * 0.63 - s * 0.5 - vec2(0.0, uTime * 0.006)); float lace = 1.0 - smoothstep(0.05, 0.55, nz.b * (0.6 + 0.4 * nz2.b));
        float surge = 0.6 + 0.4 * sin(uTime * 1.25 + nz.r * 5.0 + p.x * 0.05);
        float band = smoothstep(0.45, 1.0, sin(con.g * 16.0 - uTime * 1.35 + nz.r * 6.0 + texture2D(tNz, p * 0.02).r * 8.0)) * smoothstep(0.02, 0.3, con.g) * (1.0 - smoothstep(0.85, 1.0, con.g) * 0.4);
        float crest = clamp(vH / max(0.25 + 1.3 * uChop, 0.1), -1.0, 1.5) * 0.6 + (a.z * 0.5 + c.z * 0.5) * 0.25 + gust * 0.3;
        float wc = smoothstep(0.62, 0.95, crest + (nz2.r - 0.5) * 0.4) * smoothstep(0.3, 0.8, uChop);
        float fo = con.r * 1.1 * surge + band * (0.55 + 0.7 * uChop) + wc * 1.2 + foamS * 1.15 + con.g * 0.18 * uChop; float foam = smoothstep(0.22, 0.95, fo * (0.30 + 1.0 * lace) + 0.12 * fo) * clamp(fo * 1.4, 0.0, 1.0) * (0.62 + 0.38 * nz2.g); foam = mix(foam, fo * 0.35, smoothstep(0.25, 1.2, px * 3.0));
        vec3 foamC = vec3(0.86, 0.89, 0.90) * ((Es * (0.6 + 0.4 * n.y) + Ea) * 0.318) + lanC * 0.2;
        float A = 1.0 - smoothstep(${(RMAX * .72).toFixed(1)}, ${(RMAX * .98).toFixed(1)}, hd); vec3 cl = refl * F + body * (1.0 - F) + lanC; cl = mix(cl, foamC, foam); cl += gl * (1.0 - foam * 0.8);
        vec4 fgw = trFogW(vW, uSunD); cl = mix(cl, fgw.rgb, fgw.a);
        float pr_ = trPr(); if (pr_ > 0.001) { // ink: the sea as tones of blue wash on paper; the glitter path stays bare paper
          float st = texture2D(tNz, vec2(p.x * 0.0042 + uTime * 0.0016, p.y * 0.035)).a * 0.65 + texture2D(tNz, vec2(p.x * 0.011 - uTime * 0.003, p.y * 0.09) + 0.4).a * 0.35; float aa = fwidth(st) + 0.004;
          vec3 P = mix(vec3(0.36, 0.46, 0.60), vec3(0.22, 0.32, 0.48), smoothstep(-aa, aa, 0.42 - st)); P = mix(P, vec3(0.55, 0.64, 0.74), smoothstep(-aa, aa, st - 0.60));
          float g = clamp(dot(gl, vec3(0.333)) * 0.9 + foam, 0.0, 1.0); P = mix(P, vec3(0.94, 0.91, 0.84), max(g, smoothstep(0.55, 0.9, dot(refl, vec3(0.333)) / max(dot(uSunI, vec3(0.333)) * 0.4, 0.1)) * 0.5)); cl = mix(cl, P, pr_); }
        gl_FragColor = vec4(cl * A, A); }` });
  function surfGeo() { const nr = 120, na = 160, pos = [], ix = [], k = Math.log(RMAX / .6 + 1) / nr; for (let i = 0; i <= nr; i++) { const r = .6 * (Math.exp(k * i) - 1); for (let j = 0; j < na; j++) { const a = j / na * TAU; pos.push(Math.cos(a), r, Math.sin(a)); } } for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) { const a = i * na + j, b = i * na + (j + 1) % na; if (i) ix.push(a, b, a + na); ix.push(b, b + na, a + na); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(ix); return g; }

  // ---- spray: drops thrown by a strong splash, ballistic from the water --------------------------------------------------------------------------
  const LIVE = 240; let drops, dA, dV, dS, liveI = 0;
  function buildDrops() { const P = new Float32Array(LIVE * 4).fill(-99), Vv = new Float32Array(LIVE * 4), Ss = new Float32Array(LIVE * 2); for (let i = 0; i < LIVE; i++) P[i * 4 + 3] = -99;
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); dA = new THREE.InstancedBufferAttribute(P, 4); dV = new THREE.InstancedBufferAttribute(Vv, 4); dS = new THREE.InstancedBufferAttribute(Ss, 2); g.setAttribute('aP', dA); g.setAttribute('aV', dV); g.setAttribute('aS', dS); g.instanceCount = LIVE;
    drops = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, uniforms: Object.assign({}, Sky.U, { uTime: LU.uTime }),
      vertexShader: /* glsl */`uniform float uTime; attribute vec4 aP, aV; attribute vec2 aS; varying vec2 vQ; varying float vA; const float G = 9.8; vec3 fly(vec3 p0, vec3 v, float k, float a){ float e = (1.0 - exp(-k * a)) / k; return p0 + v * e + vec3(0.0, -G, 0.0) * (a - e) / k; }
        void main(){ float a = uTime - aP.w; vQ = position.xy; vec3 c = fly(aP.xyz, aV.xyz, aV.w, max(a, 0.0)), c2 = fly(aP.xyz, aV.xyz, aV.w, max(a, 0.0) + 0.016); vA = step(0.0, a) * step(a, 3.0) * smoothstep(${(WL - .03).toFixed(3)}, ${(WL + .03).toFixed(3)}, c.y); vec4 m = viewMatrix * vec4(c, 1.0); vec2 d = (viewMatrix * vec4(c2 - c, 0.0)).xy; float l = length(d); vec2 ax = l > 1e-5 ? d / l : vec2(0.0, 1.0); float s = max(aS.x, -m.z * 0.0011); m.xy += ax * position.y * (s + l * 0.5) + vec2(-ax.y, ax.x) * position.x * s; gl_Position = vA > 0.001 ? projectionMatrix * m : vec4(2.0, 2.0, 2.0, 1.0); }`,
      fragmentShader: Sky.GLSL + /* glsl */`varying vec2 vQ; varying float vA; void main(){ float r = dot(vQ, vQ); if (r > 1.0) discard; vec3 c = (uZen * 1.0 + uMid * 1.5 + uHor * 0.8) * 0.5 + uSunI * 0.25 + vec3(0.55, 0.62, 0.85) * uFlash.w * 0.4; float a = (0.55 + 0.45 * smoothstep(0.35, 1.0, r)) * vA * 0.8 * (1.0 - uPrint); gl_FragColor = vec4(c * a, a); }` }));
    drops.frustumCulled = false; drops.renderOrder = 6; drops.layers.enable(1); }
  function throwDrops(x, z, rad, s, t) { const n = Math.min(LIVE >> 1, Math.round(8 + 26 * s)), r = rng(Math.round((x * 13 + z * 7 + t * 60) * 100)); for (let k = 0; k < n; k++) { const i = liveI++ % LIVE, a = r() * TAU, e = r(); dA.setXYZW(i, x + Math.cos(a) * rad * .6, WL, z + Math.sin(a) * rad * .6, t + r() * .05); dV.setXYZW(i, Math.cos(a) * (.4 + e) * (.5 + s * .6), (1.4 + 2.6 * r()) * (.5 + .6 * s), Math.sin(a) * (.4 + e) * (.5 + s * .6), .4); dS.setXY(i, .02 + .03 * r(), r()); } dA.needsUpdate = dV.needsUpdate = dS.needsUpdate = true; }

  // ---- public impulses -----------------------------------------------------------------------------------------------------------------------------
  function ring(x, z, s = .05, t = now) { liveR.push({ x, z, t, s }); if (liveR.length > MAXR) liveR.shift(); }
  function splash(x, z, r = .4, s = .5, foam = s * .5) { if (Math.abs(x - win.x) < SIZE * .48 && Math.abs(z - win.z) < SIZE * .48) impulse(x, z, r, -s, foam); else ring(x, z, .03 + .06 * s); if (s > .25 && dA) throwDrops(x, z, r, s, now); }
  function ringsUpdate(t) { let k = 0; for (let i = liveR.length - 1; i >= 0; i--) { const g = liveR[i]; if (g.t > t + .01 || t - g.t > 7) liveR.splice(i, 1); else if (k < MAXR) ringU[k++].set(g.x, g.z, t - g.t, g.s); } for (; k < MAXR; k++) ringU[k].set(0, 0, -1, 0); }

  // ---- module --------------------------------------------------------------------------------------------------------------------------------------
  let surf; const M = { level: WL };
  function build(ctx) { R = ctx.R; wA = waveSet(31, 9, 3, 27, .85); wB = waveSet(77, 31, 2, 15, .7); const mo = { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 8 }; rtA = RT(256, 256, mo); rtB = RT(256, 256, mo);
    mWave = pm(`uniform vec4 uW[${NW}]; varying vec2 vUv; void main(){ vec2 s = vec2(0.0); float h = 0.0; for (int i = 0; i < ${NW}; i++) { vec4 w = uW[i]; float a = 6.2831853 * dot(w.xy, vUv) + w.z; float il = inversesqrt(dot(w.xy, w.xy)); s += w.xy * il * w.w * cos(a); h += w.w * il * sin(a); } gl_FragColor = vec4(s, h, dot(s, s)); }`, { uW: { value: wA.u } });
    mBlur = pm(`uniform sampler2D tC; uniform vec2 uD; varying vec2 vUv; void main(){ vec3 s = vec3(0.0); float w = 0.0; for (int i = -5; i <= 5; i++) { float k = exp(-float(i * i) * 0.085); s += min(texture2D(tC, clamp(vUv + uD * float(i), 0.001, 0.999)).rgb, vec3(14.0)) * k; w += k; } gl_FragColor = vec4(s / w, 1.0); }`, { tC: { value: null }, uD: { value: new THREE.Vector2() } });
    simA = RT(N, N); simB = RT(N, N); mSim = pm(/* glsl */`uniform sampler2D tP; uniform vec2 uShift, uC; uniform vec4 uA[${MI}], uB[${MI}]; uniform int uN; varying vec2 vUv;
      vec4 S(vec2 u){ return u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 ? vec4(0.0) : texture2D(tP, u); }
      void main(){ vec2 q = vUv + uShift, d = vec2(1.0 / ${N}.0, 0.0); vec4 c = S(q), l = S(q - d.xy), r = S(q + d.xy), u = S(q + d.yx), o = S(q - d.yx), d1 = S(q + d.xx), d2 = S(q - d.xx), d3 = S(q + vec2(d.x, -d.x)), d4 = S(q + vec2(-d.x, d.x));
        vec4 lap = (4.0 * (l + r + u + o) + d1 + d2 + d3 + d4 - 20.0 * c) / 6.0; float h = c.r, v = c.g; v += lap.r * ${(1.95 * 1.95 / (DX * DX) * STEP).toFixed(5)} + lap.g * 0.035; v *= 0.9915; v -= h * 0.010; float f = c.b * 0.9935 + max(lap.b, 0.0) * 0.06 + min(lap.b, 0.0) * 0.06; f = max(f - 0.0004, 0.0);
        vec2 p = uC + (vUv - 0.5) * ${SIZE}.0; for (int i = 0; i < ${MI}; i++) { if (i >= uN) break; float x = length(p - uA[i].xy) / uA[i].z; float e = exp(-x * x) * (1.0 - x * x); f += uB[i].x * exp(-x * x * 0.45); v += e * uA[i].w; }
        h += v * ${STEP.toFixed(6)}; h = clamp(h, -0.6, 0.6); vec2 ed = min(vUv, 1.0 - vUv); float m = smoothstep(0.0, 0.035, min(ed.x, ed.y)); gl_FragColor = vec4(h * mix(0.9, 1.0, m), v * mix(0.8, 1.0, m), min(f, 1.6), 1.0); }`, { tP: { value: null }, uShift: { value: new THREE.Vector2() }, uC: { value: new THREE.Vector2() }, uA: { value: impA }, uB: { value: impB }, uN: { value: 0 } });
    rtCon = RT(512, 540, { type: THREE.UnsignedByteType }); U.tWA.value = rtA.texture; U.tWB.value = rtB.texture; U.tCon.value = rtCon.texture;
    surf = new THREE.Mesh(surfGeo(), surfMat()); surf.frustumCulled = false; surf.renderOrder = -20; surf.name = 'sea'; buildDrops();
    const g = [surf, drops]; if (Q.has('stest')) g.push(stest()); return g; }
  function update(ctx) { now = ctx.t; if (ctx.reset) liveR.length = 0; simUpdate(ctx); }
  function prepass(rd, scene, cam, ctx) { R = rd; now = ctx.t; const old = R.getRenderTarget(), ac = R.autoClear; R.autoClear = false; if (!baked) { baked = true; bake(scene); }
    const w = Sky.S.wx, tod = Sky.S.t, sec = Score.sec(tod), drum = sec === 'attack' || sec === 'climax' ? Score.env('taiko', tod, .45) : 0;
    swellK = swellOf(w) * (1 + .18 * Math.min(drum, 1.5)); U.uSwell.value = swellK; U.uChop.value = w.chop; U.uStorm.value = w.storm; U.uRain.value = w.rain; U.uGlit.value = 1 + (sec === 'love' || sec === 'dawn' || sec === 'hatch' ? 1.3 * Math.min(1.2, Score.env('harp', tod, .3) + .6 * Score.env('celesta', tod, .4)) : 0);
    U.uC.value.set(cam.position.x, cam.position.z); ringsUpdate(ctx.t); waveStep(ctx.t); simRun(); U.tSim.value = simA.texture; reflect(scene, cam); R.setRenderTarget(old); R.autoClear = ac; }
  Assets.add('sea', { order: 70, build, update, prepass });

  // ---- studio only (&stest): a stand-in island with cliffs into the sea, a lava cone, the pair and the egg, so sky, sea and air can be judged ------
  function stest() { const g = new THREE.Group(), put = (geo, m, x, y, z) => { const o = Mat.mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; }; const rock = Mat.make('stone', { color: '#6f6a66', scale: .3 }), dark = Mat.make('stone', { color: '#3a3533', scale: .2 }), grass = Mat.make('earth', { color: PAL.sage, scale: .2 });
    const crag = Geo.cyl(13, 7, 26, 28, { hs: 8 }); Geo.warp(crag, (x, y, z) => { const n = NZ.fbm(x * .15, y * .15, z * .15); return [x * (1 + .25 * n), y, z * (1 + .25 * n)]; }); put(crag, rock, 0, 7, 0); put(Geo.cyl(7.4, 7, 1.2, 24), grass, 0, 20.4, 0);
    const ridge = Geo.cyl(30, 12, 22, 24, { hs: 6 }); put(ridge, rock, 45, 5, -40); put(Geo.cyl(26, 20, 6, 24), dark, 45, 16, -40); const cave = Geo.cyl(14, 9, 18, 20); put(cave, rock, 40, 2, 18); put(Geo.cyl(10, 6, 14, 20), rock, 54, 1, 32);
    const vol = Geo.cyl(120, 16, 78, 40, { hs: 8 }); Geo.warp(vol, (x, y, z) => { const n = NZ.fbm(x * .03, y * .03, z * .03); return [x * (1 + .2 * n), y, z * (1 + .2 * n)]; }); put(vol, dark, 90, 31, -150);
    const lava = new THREE.Mesh(Geo.cyl(14, 14, .5, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.6, .25) })); lava.position.set(90, 69.5, -150); g.add(lava);
    Lan.add({ x: 90, y: 74, z: -150, r: 60, color: [1, .35, .08], gain: () => Sky.S.wx.volc * (1.2 + .8 * Score.env('lava', Sky.S.t, .5)) * 6 });
    for (let i = 0; i < 5; i++) put(Geo.sphere(2.2 + i * .6, 16, 12), rock, -6 - i * 3.5, -1.2 + (i % 2) * .8, 10 + i * 2.5);
    const noct = put(Geo.sphere(1, 20, 14), Mat.make('lacquer', { color: '#16151f' }), 0, 0, 0), lune = put(Geo.sphere(1, 20, 14), Mat.make('clay', { color: '#f2eef8' }), 0, 0, 0); noct.scale.set(1.2, 1.2, 3.5); lune.scale.set(1.2, 1.2, 3.5); noct.position.set(-70, 26, 6.5); lune.position.set(-70, 26, 1.5); noct.rotation.x = .5; lune.rotation.x = -.5;
    const egg = put(Geo.sphere(.6, 20, 14), Mat.make('ceramic', { color: '#7fb8e6' }), 1.5, 21.1, 0); egg.scale.set(.8, 1, .8);
    for (let i = 0; i < 6; i++) put(Geo.box(3, 5 + i * 2, 3, .2), Mat.make('plaster', { color: i % 2 ? PAL.verm : PAL.cream }), -30 - i * 6, 2 + i, -20 + i * 7);
    g.traverse(o => o.layers.enable(1)); return g; }
  return Object.assign(M, { splash, ring, heightAt, rebake() { baked = false; }, get sim() { return simA; }, get reflection() { return rR; }, U });
})();
