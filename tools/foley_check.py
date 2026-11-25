# /usr/local/bin/python3 tools/foley_check.py : per-sound table (centroid, duration, attack, bands) from qa/foley/catalogue.*, closest pairs, clicks per section
import json, numpy as np
from scipy.io import wavfile
from scipy import signal
D = 'qa/foley/'; SR = 44100
db = lambda x: 20*np.log10(np.maximum(x, 1e-9))
def rd(f): s, x = wavfile.read(D+f); return x.astype(np.float64)/32768
def feats(x):
    m = x.mean(1); n = max(8192, len(m)); P = np.abs(np.fft.rfft(m*np.hanning(len(m)), n))**2; f = np.fft.rfftfreq(n, 1/SR); E = P.sum()
    c = (f*P).sum()/E; lo, mid, hi = P[f < 350].sum()/E, P[(f >= 350) & (f < 1600)].sum()/E, P[f >= 1600].sum()/E
    b, a = signal.butter(2, 60/(SR/2)); e = np.sqrt(np.maximum(0, signal.filtfilt(b, a, m*m))); pk = e.max(); i = np.where(e > pk*10**(-30/20))[0]
    dur = (i[-1]-i[0])/SR; ip = e.argmax(); i10 = np.where(e[:ip+1] > pk*.1)[0][0]; i90 = np.where(e[:ip+1] > pk*.9)[0][0]
    q = P[(f > 40) & (f < 8000)]+1e-20; flat = 10*np.log10(np.exp(np.log(q).mean())/q.mean())
    return dict(cent=c, dur=dur, atk=(i90-i10)/SR, lo=lo, mid=mid, hi=hi, flat=flat)
cat = rd('catalogue.wav'); idx = json.load(open(D+'catalogue.json')); R = []
print('%-18s %6s %6s %6s %4s %4s %4s %6s' % ('sound', 'cent', 'dur', 'atk', 'lo%', 'mid%', 'hi%', 'flat'))
for k in idx:
    a = int(k['t']*SR); r = feats(cat[a:a+int(k['dur']*SR)+200]); R.append((k['name'], r))
    print('%-18s %6.0f %6.2f %6.3f %4.0f %4.0f %4.0f %6.1f' % (k['name'][:18], r['cent'], r['dur'], r['atk'], 100*r['lo'], 100*r['mid'], 100*r['hi'], r['flat']))
V = np.array([[np.log2(r['cent']), .8*np.log2(max(.004, r['dur'])), .35*np.log2(max(.001, r['atk'])), 2*r['lo'], 2*r['mid'], r['flat']/8] for _, r in R])
Dm = np.sqrt(((V[:, None]-V[None])**2).sum(2)); np.fill_diagonal(Dm, 9); p = sorted([(Dm[i, j], R[i][0], R[j][0]) for i in range(len(R)) for j in range(i)])
print('closest pairs (feature distance):', '; '.join('%s~%s %.2f' % (b, c, a) for a, b, c in p[:8]))
cs = np.array([r['cent'] for _, r in R]); print('centroid range %.0f-%.0f Hz, median %.0f; durations %.2f-%.2f s' % (cs.min(), cs.max(), np.median(cs), min(r['dur'] for _, r in R), max(r['dur'] for _, r in R)))
import glob
for f in sorted(glob.glob(D+'sec_*.wav')):
    x = rd(f.split('/')[-1]); hot = 0
    for c in (0, 1):
        d = np.abs(np.diff(x[:, c], 2)); n = 256; y = d[:len(d)//n*n].reshape(-1, n); mx = y.max(1); md = np.median(y, 1)+3e-5; hot += int(((mx/md > 80) & (mx > .02)).sum())
    print('clicks? %-16s %d' % (f.split('/')[-1], hot), end='   ')
print()
