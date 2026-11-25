#!/usr/bin/env python3
# python3 tools/voice_check.py  -> numbers for ears: pitch vs Score midi, vowel onsets vs Score, loudness, HF, clicks, creature distinctness
import json, os, subprocess, sys, wave
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); Q = os.path.join(ROOT, 'qa/voice'); SR = 44100
sc = json.loads(subprocess.check_output(['node', '-e', 'const S=require("%s/src/06_score.js");console.log(JSON.stringify({lines:S.lines,sounds:S.sounds}))' % ROOT]))
meta = json.load(open(Q + '/meta.json'))
def load(id):
    w = wave.open(Q + '/%s.wav' % id); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767; return x
def yin(x, fmin=70, fmax=1100, hop=220, W=1536, th=.15):
    n = (len(x) - W) // hop; out = np.zeros(max(n, 0)); lv = np.zeros(max(n, 0)); tmax = int(SR / fmin)
    for i in range(n):
        f = x[i * hop:i * hop + W]; lv[i] = 10 * np.log10(np.mean(f * f) + 1e-12)
        if lv[i] < -60: continue
        F = np.fft.rfft(f, 2 * W); r = np.fft.irfft(F * np.conj(F))[:tmax + 1]; e = np.cumsum(f * f)
        d = e[W - 1] + (e[W - 1] - np.concatenate([[0], e[:tmax]])[:tmax + 1] * 0) - 2 * r  # approx difference fn (stationary)
        d[0] = 0; c = np.cumsum(d[1:]); dn = np.ones(tmax + 1); dn[1:] = d[1:] * np.arange(1, tmax + 1) / np.maximum(c, 1e-12)
        lo = int(SR / fmax); cand = np.where(dn[lo:] < th)[0]
        if not len(cand): continue
        k = lo + cand[0]
        while k + 1 <= tmax and dn[k + 1] < dn[k]: k += 1
        if 1 <= k < tmax: a, b, c2 = dn[k - 1], dn[k], dn[k + 1]; k = k + .5 * (a - c2) / (a - 2 * b + c2 + 1e-12)
        out[i] = SR / k
    t = (np.arange(len(out)) * hop + W / 2) / SR; return t, out, lv
def hf(x): P = np.abs(np.fft.rfft(x)) ** 2; f = np.fft.rfftfreq(len(x), 1 / SR); return P[f > 6000].sum() / (P.sum() + 1e-20)
def clicks(x):
    d = np.diff(x, 2); e = np.convolve(d * d, np.ones(44) / 44, 'same'); m = np.convolve(e, np.ones(2205) / 2205, 'same')
    k = np.where((e > 40 * (m + 1e-10)) & (e > 1e-7))[0]; return len(np.unique(k // 441)), abs(x[0]), abs(x[-1]), abs(np.mean(x))
def arms(x, W=1024):
    p = np.array([np.mean(x[i:i + W] ** 2) for i in range(0, len(x) - W, W)]); return 10 * np.log10(np.mean(p[p >= p.max() * .01]) + 1e-12)
rows = []; allerr = []; allon = []; bad = []
print('LINE  who    pitch|cents| med/max  onset design max ms | acoustic max ms (n)  rms dBFS  peak   >6k%  clicks  edge')
for L in sc['lines']:
    id = L['id']; x = load(id); t0 = meta[id]['t0']; fm = 70 if L['who'] in ('ash', 'noct', 'choir') else 140; t, f, lv = yin(x, fm); t = t + t0
    tq, fq, lq = yin(x, fm, hop=110, th=.25); tq = tq + t0           # finer, more sensitive voicing for onsets
    segs = json.load(open(Q + '/%s.segs.json' % id)) if os.path.exists(Q + '/%s.segs.json' % id) else None
    errs = []; ons = []; aons = []
    for k, N in enumerate(L['notes']):
        d = N['t1'] - N['t0']; a, b = N['t0'] + .3 * d, N['t1'] - .2 * d
        if segs:
            nu = [g for g in segs if g['syl'] == k and g['role'] == 'nuc']
            if nu: a = max(a, nu[0]['t0'] + .06); b = min(b, nu[0]['t1'] - .03); ons.append(1000 * (nu[0]['t0'] - N['t0']))
            onc = [g for g in segs if g['syl'] == k and g['role'] == 'on']
            pre = [g for g in segs if g['t1'] <= nu[0]['t0'] + 1e-4] if nu else []
            free = nu and (not pre or pre[-1]['ph'] in ('P', 'T', 'K', 'S', 'F', 'HH', 'TH', 'SH') or nu[0]['t0'] - pre[-1]['t1'] > .06)
            if free:   # the vowel's voicing starts after silence or an unvoiced consonant: measurable
                ref = np.median(lq[(tq > a) & (tq < b)]) if np.any((tq > a) & (tq < b)) else -30; v = (fq > 0) & (lq > ref - 15)
                w = np.where((tq >= nu[0]['t0'] - .09) & (tq <= nu[0]['t0'] + .15))[0]
                if len(w) and not v[w[0]]:                # needs an unvoiced stretch before the vowel, then the first voiced frame is its onset
                    h = w[np.where(v[w])[0]]
                    if len(h): aons.append(1000 * (tq[h[0]] - N['t0'])); (os.environ.get('VDBG') and abs(aons[-1]) > 15 and print('   ', id, k, N['syl'], '%+.0f ms' % aons[-1]))
        sel = (t > a) & (t < b) & (f > 0)
        if sel.sum() < 3: continue
        c = 1200 * np.log2(np.median(f[sel]) / (440 * 2 ** ((N['midi'] - 69) / 12)))
        if L['who'] == 'choir': c = (c + 600) % 1200 - 600
        errs.append(abs(c))
    nc, e0, e1, dc = clicks(x); h = hf(x); r = arms(x); pk = 20 * np.log10(np.abs(x).max() + 1e-12)
    allerr += errs; allon += ons
    s = '%-5s %-6s %5.1f %5.1f   %6.1f            | %6s (%d)   %6.1f  %5.1f  %5.2f  %3d   %.4f' % (id, L['who'], np.median(errs) if errs else -1, max(errs) if errs else -1, max(map(abs, ons)) if ons else -1, '%+.0f..%+.0f' % (min(aons), max(aons)) if aons else '-', len(aons), r, pk, 100 * h, nc, max(e0, e1))
    print(s)
    if errs and np.median(errs) > 30: bad.append(id + ' pitch')
    if ons and max(map(abs, ons)) > 15: bad.append(id + ' onset')
    if h > .03: bad.append(id + ' hf')
print('lines: median |cents| %.1f (all notes), onset design max %.1f ms' % (np.median(allerr), max(map(abs, allon))))
print('\nSOUND  who.kind            t0      dur  rms   peak  >6k%  clicks  centroid  attack ms  active s   env(10)')
feat = {}
for j, s in enumerate(sc['sounds']):
    id = 'snd%d' % j; x = load(id); k = s['who'] + '.' + meta[id]['kind']
    n = 1024; fr = np.array([x[i:i + n] for i in range(0, len(x) - n, 256)]); P = np.abs(np.fft.rfft(fr * np.hanning(n), axis=1)) ** 2; fq = np.fft.rfftfreq(n, 1 / SR)
    e = P.sum(1); act = e > e.max() * .01; cen = (P[act] * fq).sum() / P[act].sum()
    env = np.sqrt(e / e.max()); i90 = np.argmax(env > .9); i10 = np.argmax(env > .1); att = (i90 - i10) * 256 / SR * 1000
    idx = np.where(act)[0]; span = (idx[-1] - idx[0]) * 256 / SR; sh = np.interp(np.linspace(idx[0], idx[-1], 10), np.arange(len(env)), env)
    nc, e0, e1, dc = clicks(x); h = hf(x); _, ff, _ = yin(x, 40, 1600); f0m = np.median(ff[ff > 0]) if np.any(ff > 0) else 0
    feat.setdefault(k, []).append((cen, att, span, sh, f0m))
    print('%-6s %-18s %7.2f %5.2f %5.1f %5.1f %5.2f  %3d   %7.0f  %8.0f  %7.2f   %s' % (id, k, s['t'], s['dur'], arms(x), 20 * np.log10(np.abs(x).max()), 100 * h, nc, cen, att, span, ' '.join('%d' % (9.9 * v) for v in sh)))
    if h > .03: bad.append(id + ' hf')
    if nc: bad.append(id + ' clicks %d' % nc)
# distinctness: every pair of different kinds must differ in centroid (>15%) or envelope (attack x1.5, active length x1.3, or shape corr < .9)
K = sorted(feat); same = []
for i in range(len(K)):
    for j in range(i + 1, len(K)):
        a = feat[K[i]][0]; b = feat[K[j]][0]
        dc = abs(np.log(a[0] / b[0])); da = abs(np.log((a[1] + 5) / (b[1] + 5))); ds = abs(np.log(a[2] / b[2])); co = np.corrcoef(a[3], b[3])[0, 1]
        df = abs(np.log((a[4] + 1) / (b[4] + 1)))
        if dc < np.log(1.15) and da < np.log(1.5) and ds < np.log(1.3) and co > .9: same.append((K[i], K[j], 'pitch %.0f/%.0f Hz' % (a[4], b[4])))
print('\nkinds %d, pairs too alike: %s' % (len(K), same or 'none'))
print('FLAGS:', bad or 'none')
