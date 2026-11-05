import json, re, sys, math, numpy as np
import shapely.geometry as sg
D = sys.argv[1]
A = json.load(open(f'{D}/A.json'))
pts = json.load(open(f'{D}/official_points.geojson'))['features']
LAT0 = 51.04
def to_m(lng, lat): return ((lng + 114.07) * 111320 * math.cos(math.radians(LAT0)), (lat - LAT0) * 110574)
def norm(s): return re.sub(r'[^A-Z0-9]', '', s.upper())
official = {}
for f in pts:
    n = f['properties']['name']
    official[n] = f
onames = sorted(official, key=lambda n: -len(norm(n)))
def names_in(region):
    text = norm(' '.join(w[0] for w in sorted(region['words'], key=lambda w: (w[1], w[2], w[3]))))
    found = []
    for n in onames:
        k = norm(n)
        if len(k) >= 4 and k in text:
            found.append(n); text = text.replace(k, '|', 1)
    return found
for r in A: r['names'] = names_in(r); r['poly'] = sg.Polygon(r['coords'])
ctrl = [(r['poly'].representative_point() if not r['poly'].centroid.within(r['poly']) else r['poly'].centroid, official[r['names'][0]])
        for r in A if len(r['names']) == 1]
X = np.array([[c.x, c.y, 1] for c, _ in ctrl]); Y = np.array([to_m(*f['geometry']['coordinates']) for _, f in ctrl])
keep = np.ones(len(X), bool)
for it in range(6):
    M, *_ = np.linalg.lstsq(X[keep], Y[keep], rcond=None)
    res = np.linalg.norm(X @ M - Y, axis=1)
    thr = max(3 * np.median(res[keep]), 400)
    keep = res < thr
print(f'controls {len(X)}, kept {keep.sum()}, median residual {np.median(res[keep]):.0f} m, p90 {np.percentile(res[keep],90):.0f} m')
bad = [(ctrl[i][1]['properties']['name'], round(res[i])) for i in np.where(~keep)[0]]
print('outliers:', bad)
np.save(f'{D}/affine.npy', M)
json.dump({'names_per_region': [[r['names'], r['codes']] for r in A]}, open(f'{D}/A_names.json', 'w'))
print('regions with 0 names', sum(len(r['names']) == 0 for r in A), ' >1 names', sum(len(r['names']) > 1 for r in A))
matched = {n for r in A for n in r['names']}
unmatched = sorted(n for n, f in official.items() if n not in matched and f['properties']['class'] in ('Residential', 'Industrial'))
print('official residential/industrial not found by name:', len(unmatched), unmatched)
