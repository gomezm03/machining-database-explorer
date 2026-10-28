"""Build the Explorer's static index from the local copy of the Digital Machining Database.

Reads only metadata: the xlsx-derived CSV of simulation inputs, `omega` and `b` from every
time file, and each stability_boundaryN.mat. Writes:

  public/data/index.json      all 155 datasets: parameters, facet keys, card lobes, totals
  public/data/ds/N.json       one per dataset: grid of cuts and a finer boundary

Run with Anaconda's Python from the explorer folder:
  C:\\Users\\gomez\\anaconda3\\python.exe scripts\\build_index.py [--data ..\\data]
"""
import argparse
import collections
import json
import math
import os
import re
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd
import scipy.io as sio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_DATA = os.path.join(os.path.dirname(ROOT), 'data')
DEFAULT_CSV = os.path.join(os.path.dirname(ROOT), 'docs', 'extracted', 'Dataset descriptions.csv')
OUT = os.path.join(ROOT, 'public', 'data')

CARD_BINS = 60     # min/max per bin -> 120 points per card lobe
DETAIL_BINS = 500  # -> 1,000 points for the grid-of-cuts plot


def group_of(n):
    if n <= 60:
        return 'unique'
    if n <= 90:
        return 'noise1'
    if n <= 120:
        return 'noise5'
    if n <= 125:
        return 'varpitch'
    return 'sound'


def base_of(n):
    """Dataset whose inputs this one copies (None for unique sets)."""
    if 61 <= n <= 90:
        return n - 60
    if 91 <= n <= 120:
        return n - 90
    if 126 <= n <= 155:
        return n - 125
    return None


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def read_params(csv_path):
    """Parse the one-block-per-dataset layout: extra modes and per-tooth vectors run down the rows."""
    df = pd.read_csv(csv_path, dtype=str)
    blocks, cur = {}, None
    for _, r in df.iterrows():
        if r['Dataset'] == 'Dataset':  # repeated header row
            continue
        if num(r['Dataset']) is not None:
            cur = int(num(r['Dataset']))
            blocks[cur] = []
        if cur is not None:
            blocks[cur].append(r)
    params = {}
    for n, rows in blocks.items():
        r0 = rows[0]
        modes = []
        for r in rows:
            if num(r['Mode number']) is not None:
                modes.append({k: num(r[c]) for k, c in [
                    ('fntx', 'fntx (Hz)'), ('ktx', 'ktx (N/m)'), ('zetatx', 'zetatx'),
                    ('fnty', 'fnty (Hz)'), ('kty', 'kty (N/m)'), ('zetaty', 'zetaty'),
                    ('fnwx', 'fnwx (Hz)'), ('kwx', 'kwx (N/m)'), ('zetawx', 'zetawx'),
                    ('fnwy', 'fnwy (Hz)'), ('kwy', 'kwy (N/m)'), ('zetawy', 'zetawy')]})
        teeth = int(num(r0['m']))
        beta = [num(r['beta (deg)']) for r in rows[:teeth]]
        angles = [num(r['tooth_angle (deg)']) for r in rows[:teeth]]
        ro = [num(r['RO (m)']) or 0.0 for r in rows[:teeth]]
        d = num(r0['d (m)'])
        a = num(r0['a (m)'])
        a_fixed = False
        if a is not None and a > d:  # xlsx typo for 51-58: 3000.0 where 0.003 m is meant
            a, a_fixed = a / 1e6, True
        p = {
            'modes': modes,
            'ktc': num(r0['ktc (N/m2)']), 'knc': num(r0['knc (N/m2)']),
            'kte': num(r0['kte (N/m)']), 'kne': num(r0['kne (N/m)']), 'cn': num(r0['Cn (N/m)']),
            'd': d, 'teeth': teeth, 'beta': beta, 'angles': angles, 'ro': ro,
            'et': int(num(r0['et'])), 'ud': int(num(r0['ud'])), 'a': a, 'aFixed': a_fixed,
            'ft': num(r0['ft_mean (m)']),
            'omMin': num(r0['omega min (rpm)']), 'omMax': num(r0['omega max (rpm)']),
            'omStep': num(r0['omega increment (rpm)']),
            'bMin': num(r0['b min (m)']), 'bStep': num(r0['b increment (m)']),
            'noise': num(r0['Noise std (%)']),
        }
        params[n] = p
    return params


def facets_of(n, p):
    """Facet keys, matching the Explorer's filter ids."""
    m1 = p['modes'][0]
    f = {'group': [group_of(n)], 'dyn': [], 'force': [], 'tool': [], 'cut': [], 'sig': []}
    fn = m1['fntx']
    f['dyn'].append({500: 'fn500', 1000: 'fn1000', 1500: 'fn1500'}.get(fn, 'fnother'))
    if len(p['modes']) > 1:
        f['dyn'].append('multi')
    if any(m['fntx'] != m['fnty'] or m['ktx'] != m['kty'] or m['zetatx'] != m['zetaty'] for m in p['modes']):
        f['dyn'].append('xy')
    if p['ktc'] == 7e8:
        f['force'].append('ktc700')
    elif p['ktc'] == 2e9:
        f['force'].append('ktc2000')
    else:
        f['force'].append('ktcother')
    if (p['kte'] or 0) > 0 or (p['kne'] or 0) > 0:
        f['force'].append('edge')
    if (p['cn'] or 0) > 0:
        f['force'].append('cn')
    f['tool'].append('t%d' % p['teeth'])
    if any(b and b > 30 for b in p['beta']):
        f['tool'].append('h45')
    if variable_pitch(p):
        f['tool'].append('varp')
    if any(r != 0 for r in p['ro']):
        f['tool'].append('runout')
    if abs(p['d'] - 0.01905) < 1e-6:
        f['tool'].append('d19')
    imm = round(p['a'] / p['d'] * 100)
    f['cut'].append({10: 'i10', 25: 'i25', 50: 'i50'}.get(imm, 'iother'))
    if p['ud'] == 1:
        f['cut'].append('up')
    if p['ft'] and abs(p['ft'] - 2e-4) < 1e-9:
        f['cut'].append('f02')
    if n >= 126:
        f['sig'].append('wav')
    if (p['noise'] or 0) > 0:
        f['sig'].append('noisy')
    return f


def variable_pitch(p):
    m = p['teeth']
    want = [i * 360.0 / m for i in range(m)]
    return any(abs((a or 0) - w) > 1e-6 for a, w in zip(p['angles'], want))


def minmax_bins(x, y, nbins):
    """Keep the min and max of y in each of nbins equal-width x bins, in x order, so lobe peaks survive."""
    edges = np.linspace(x[0], x[-1], nbins + 1)
    idx = np.clip(np.searchsorted(edges, x, side='right') - 1, 0, nbins - 1)
    out_x, out_y = [], []
    for i in range(nbins):
        sel = np.nonzero(idx == i)[0]
        if sel.size == 0:
            continue
        a, b = sel[np.argmin(y[sel])], sel[np.argmax(y[sel])]
        for j in sorted({a, b}):
            out_x.append(float(x[j]))
            out_y.append(float(y[j]))
    return out_x, out_y


def scan_dataset(args):
    """Read omega/b of every time file plus the boundary. Runs in a worker process."""
    n, data_dir = args
    folder = os.path.join(data_dir, 'Dataset %d mat' % n)
    pat = re.compile(r'^time%d_(\d+)\.mat$' % n)  # skips the stray time113_* copies in Dataset 121
    cuts, sizes = [], {}
    for name in os.listdir(folder):
        mt = pat.match(name)
        if not mt:
            continue
        path = os.path.join(folder, name)
        m = sio.loadmat(path, variable_names=['omega', 'b'])
        k = int(mt.group(1))
        cuts.append((k, int(np.asarray(m['omega']).astype(np.int64).ravel()[0]), float(np.asarray(m['b'], dtype=float).ravel()[0])))
        sizes[k] = os.path.getsize(path)
    cuts.sort()
    sb = sio.loadmat(os.path.join(folder, 'stability_boundary%d.mat' % n))
    om = np.asarray(sb['omega_vector']).astype(np.float64).ravel()
    bl = np.asarray(sb['blim_vector'], dtype=np.float64).ravel() * 1000.0  # mm
    wav_dir = os.path.join(data_dir, 'Dataset %d wav' % n)
    n_wav = len([f for f in os.listdir(wav_dir) if f.endswith('.wav')]) if os.path.isdir(wav_dir) else 0
    return n, cuts, sizes, om, bl, n_wav


def r(v, nd):
    return float(round(v, nd))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default=DEFAULT_DATA)
    ap.add_argument('--csv', default=DEFAULT_CSV)
    ap.add_argument('--only', type=int, nargs='*', help='scan just these datasets (for testing)')
    ap.add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 4) - 1))
    args = ap.parse_args()

    t0 = time.time()
    params = read_params(args.csv)
    ns = args.only or sorted(params)
    os.makedirs(os.path.join(OUT, 'ds'), exist_ok=True)

    datasets = []
    total_cuts = total_wav = 0
    with ProcessPoolExecutor(args.workers) as ex:
        for n, cuts, sizes, om, bl, n_wav in ex.map(scan_dataset, [(n, args.data) for n in ns]):
            p = params[n]
            cx, cy = minmax_bins(om, bl, CARD_BINS)
            dx, dy = minmax_bins(om, bl, DETAIL_BINS)
            # The files carry no stability label. The dataset documentation says the depth grid at each speed
            # stops after "approximately two unstable results", so the two deepest cuts at each speed are
            # labelled unstable (0) and the rest stable (1). The analytical boundary is kept only as a reference.
            deepest = collections.defaultdict(list)
            for k, o, b in cuts:
                deepest[o].append((b, k))
            unstable = {k for v in deepest.values() for _, k in sorted(v)[-2:]}
            grid = [[k, o, r(b * 1000, 4), 0 if k in unstable else 1] for k, o, b in cuts]
            speeds = sorted(deepest)
            with open(os.path.join(OUT, 'ds', '%d.json' % n), 'w') as fh:
                json.dump({'n': n, 'grid': grid, 'size': [sizes[c[0]] for c in cuts],
                           'boundary': {'om': [int(v) for v in dx], 'b': [r(v, 3) for v in dy]}},
                          fh, separators=(',', ':'))
            datasets.append({
                'n': n, 'group': group_of(n), 'base': base_of(n), 'facets': facets_of(n, p), 'p': p,
                'files': len(cuts), 'speeds': len(speeds), 'wav': n_wav,
                'om': [int(om[0]), int(om[-1])],
                'blim': [r(float(bl.min()), 3), r(float(bl.max()), 3)],
                'lobe': [r(v, 2) for v in cy], 'lobeOm': [int(v) for v in cx],
            })
            total_cuts += len(cuts)
            total_wav += n_wav
            print('Dataset %3d: %5d cuts, %2d speeds, %4d wav' % (n, len(cuts), len(speeds), n_wav), flush=True)

    datasets.sort(key=lambda d: d['n'])
    index = {
        'built': time.strftime('%Y-%m-%d'),
        'source': 'Kaggle tonylschmitz/digital-machining-database v17',
        'mirror': 'https://huggingface.co/datasets/gomezmfg/digital-machining-database/resolve/main/',
        'totals': {'datasets': len(datasets), 'cuts': total_cuts, 'wav': total_wav},
        'datasets': datasets,
    }
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(index, fh, separators=(',', ':'))
    kb = os.path.getsize(os.path.join(OUT, 'index.json')) / 1024
    print('Wrote index.json (%.0f KB): %d datasets, %d cuts, %d wav in %.0f s'
          % (kb, len(datasets), total_cuts, total_wav, time.time() - t0))


if __name__ == '__main__':
    main()
