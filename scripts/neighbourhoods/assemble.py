# Assemble community polygons (lng/lat) from the two extraction passes.
import json, re, sys, math, numpy as np, collections
import shapely.geometry as sg
from shapely.ops import unary_union
D, OUT = sys.argv[1], sys.argv[2]
LAT0 = 51.04
M = np.load(f'{D}/affine.npy')
def to_ll(x, y):
    ex, ny = np.array([x, y, 1]) @ M
    return (ex / (111320 * math.cos(math.radians(LAT0))) - 114.07, ny / 110574 + LAT0)
def poly_ll(p): return sg.Polygon([to_ll(x, y) for x, y in p.exterior.coords]).buffer(0)
def norm(s): return re.sub(r'[^A-Z0-9]', '', s.upper())
official = {f['properties']['name']: f for f in json.load(open(f'{D}/official_points.geojson'))['features']
            if f['properties']['class'] != 'Residual Sub Area'}
onames = sorted(official, key=lambda n: -len(norm(n)))
# CREB label spellings that differ from the City's names.
ALIASES = {'DOWNTOWNCORE': 'DOWNTOWN COMMERCIAL CORE', 'CFBCURRIE': 'CURRIE BARRACKS',
           'SCARBOROSUNALTAWEST': 'SCARBORO/ SUNALTA WEST', 'GREATEAST': 'GREAT PLAINS EAST'}
def label_text(words): return norm(' '.join(w[0] for w in sorted(words, key=lambda w: (w[1], w[2], w[3]))))
def names_in(words):
    text = label_text(words)
    found = []
    for k, n in ALIASES.items():
        if k in text: found.append(n); text = text.replace(k, '|', 1)
    for n in onames:
        k = norm(n)
        if len(k) >= 4 and k in text: found.append(n); text = text.replace(k, '|', 1)
    return found
def load(fn):
    rs = json.load(open(fn))
    for r in rs:
        r['ll'] = poly_ll(sg.Polygon(r['coords'])); r['names'] = names_in(r['words'])
        r['pts'] = [n for n, f in official.items() if r['ll'].contains(sg.Point(f['geometry']['coordinates']))]
    return rs
A, B = load(f'{D}/A.json'), load(f'{D}/B.json')
code_to_name = {}
for r in A + B:
    if len(r['codes']) == 1 and len(r['names']) == 1: code_to_name.setdefault(r['codes'][0], r['names'][0])
pieces = collections.defaultdict(list); log = []; creb_only = {}; unlabeled = []
def label_of(r):
    """Best single name for a region, or None."""
    if len(r['names']) == 1: return r['names'][0]
    if not r['names']:
        cn = {code_to_name[c] for c in r['codes'] if c in code_to_name}
        if len(cn) == 1: return cn.pop()
        if len(r['pts']) == 1: return r['pts'][0]
    return None
own_area = {label_of(r) for r in A} - {None}
for r in A:
    n = label_of(r)
    if n: pieces[n].append(r['ll']); continue
    if len(r['names']) > 1 or len(set(r['codes'])) > 1 or len(r['pts']) > 1:
        # merged: split with the road-separated pass
        want = set(r['names']) | {code_to_name.get(c) for c in r['codes']} | set(r['pts'])
        want.discard(None)
        # labels spilling over from a neighbour that has its own area elsewhere
        want = {n for n in want if n not in own_area} or want
        def voronoi_assign(geom, names):
            seeds = [(n, sg.Point(official[n]['geometry']['coordinates'])) for n in names if n in official]
            if not seeds: return False
            from shapely.ops import voronoi_diagram
            cells = voronoi_diagram(sg.MultiPoint([p for _, p in seeds]), envelope=geom.envelope.buffer(0.05))
            for cell in cells.geoms:
                n = next(n for n, p in seeds if cell.contains(p))
                part = cell.intersection(geom)
                if not part.is_empty: pieces[n].append(part)
            return True
        frags = [b for b in B if b['ll'].intersects(r['ll']) and b['ll'].intersection(r['ll']).area > 0.6 * b['ll'].area]
        left = []
        for b in frags:
            here = (set(b['names']) | {code_to_name.get(c) for c in b['codes']} | set(b['pts'])) & want
            g = b['ll'].intersection(r['ll'])
            if len(here) == 1: pieces[here.pop()].append(g)
            elif len(here) > 1: voronoi_assign(g, here)
            else: left.append(b)
        for b in left:   # unlabeled fragments: join the wanted community they border most
            if not any(pieces.get(n) for n in want): voronoi_assign(b['ll'].intersection(r['ll']), want); continue
            best = max(want, key=lambda n: sum(b['ll'].buffer(1e-4).intersection(p).area for p in pieces.get(n, [])) if pieces.get(n) else -1)
            pieces[best].append(b['ll'].intersection(r['ll']))
        log.append(('split', sorted(want)))
    elif r['codes'] and r['words'] and not any(w[0].isupper() and len(w[0]) > 3 for w in r['words']):
        # a CREB community the City's list doesn't have yet (e.g. Ambleridge)
        name = ' '.join(w[0] for w in sorted(r['words'], key=lambda w: (w[1], w[2], w[3])))
        creb_only[name] = r['codes'][0]; pieces[name].append(r['ll']); log.append(('creb-only', name))
    else:
        unlabeled.append(r)
for r in unlabeled:
    used = set(pieces)
    near = sorted((sg.Point(f['geometry']['coordinates']).distance(r['ll']) * 111000, n) for n, f in official.items()
                  if n not in used and f['properties']['class'] in ('Residential', 'Industrial'))
    if near and near[0][0] < 400 and r["area"] < 3000:
        pieces[near[0][1]].append(r['ll']); log.append(('nearest-point', near[0][1], f'{near[0][0]:.0f} m'))
    else:
        log.append(('dropped', round(r['area']), ' '.join(w[0] for w in r['words'])[:40]))
# Swap names when two communities' official centre points each land in the
# other's shape (labels straddling a shared boundary on the PDF).
merged = {n: unary_union([p.buffer(2e-5) for p in ps]).buffer(-2e-5) for n, ps in pieces.items()}
for a in list(merged):
    for b in list(merged):
        if a < b and a in official and b in official:
            pa, pb = sg.Point(official[a]['geometry']['coordinates']), sg.Point(official[b]['geometry']['coordinates'])
            if merged[a].contains(pb) and merged[b].contains(pa) and not merged[a].contains(pa) and not merged[b].contains(pb):
                merged[a], merged[b] = merged[b], merged[a]; log.append(('swapped', a, b))
# Make the set a clean partition: smaller communities keep disputed strips.
placed = []
for n in sorted(merged, key=lambda n: merged[n].area):
    g = merged[n]
    for q in placed: g = g.difference(q)
    merged[n] = g; placed.append(merged[n])
pieces = {n: [g] for n, g in merged.items()}
feats = []
for n, ps in pieces.items():
    g = unary_union([p.buffer(2e-5) for p in ps]).buffer(-2e-5).simplify(6e-5, preserve_topology=True)
    polys = [q for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon' and not q.is_empty and q.area > 0]
    if not polys: log.append(('empty after cleanup', n)); continue
    g = polys[0] if len(polys) == 1 else sg.MultiPolygon(polys)
    if g.geom_type == 'MultiPolygon':  # drop crumbs
        g = sg.MultiPolygon([p for p in g.geoms if p.area > 0.02 * max(q.area for q in g.geoms)])
        if len(g.geoms) == 1: g = g.geoms[0]
    o = official[n]['properties'] if n in official else {'comm_code': 'CREB' + creb_only[n], 'sector': None, 'class': 'Residential'}
    title = '/'.join(' '.join(w.capitalize() if not re.match(r'^[IVX]+$|^\d', w) else w for w in part.strip().split()) for part in n.split('/'))
    title = re.sub(r"\bMc(\w)", lambda m: 'Mc' + m.group(1).upper(), title)
    feats.append({'type': 'Feature', 'properties': {'id': o['comm_code'], 'name': title, 'sector': o['sector'], 'class': o['class']},
                  'geometry': json.loads(json.dumps(sg.mapping(g), default=list))})
def rnd(c): return [rnd(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 5), round(c[1], 5)]
for f in feats: f['geometry']['coordinates'] = rnd(f['geometry']['coordinates'])
feats.sort(key=lambda f: f['properties']['name'])
json.dump({'type': 'FeatureCollection', 'features': feats}, open(OUT, 'w'), separators=(',', ':'))
print('communities', len(feats))
for l in log: print(*l)
missing = sorted(n for n, f in official.items() if n not in pieces and f['properties']['class'] in ('Residential', 'Industrial'))
print('official communities with no polygon:', missing)
