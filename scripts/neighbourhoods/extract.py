# Rebuild the CREB map with only district fills + white boundary strokes,
# rasterize, split into regions along the white lines, vectorize each region.
import pymupdf, numpy as np, json, sys, re
from scipy import ndimage
import rasterio.features, shapely.geometry as sg
from shapely.ops import unary_union
SRC, OUT = sys.argv[1], sys.argv[2]
ZOOM = 6
MIN_PX = 400
LINE_SCALE = float(sys.argv[3]) if len(sys.argv) > 3 else 1.8
src = pymupdf.open(SRC); pg = src[0]
dst = pymupdf.open(); np_ = dst.new_page(width=pg.rect.width, height=pg.rect.height)

def draw_items(shape, items):
    for it in items:
        k = it[0]
        if k == 'l': shape.draw_line(it[1], it[2])
        elif k == 'c': shape.draw_bezier(it[1], it[2], it[3], it[4])
        elif k == 're': shape.draw_rect(it[1])
        elif k == 'qu': shape.draw_quad(it[1])

drawings = pg.get_drawings()
palette = {}  # each distinct fill colour gets its own grey value, so district edges split too
for d in drawings:  # fills first
    f = d.get('fill')
    if d['type'] in ('f', 'fs') and f and not (max(f) < 0.5) and f != (1.0, 1.0, 1.0):
        if d['rect'].y0 > 1040 and d['rect'].x1 < 400: continue   # legend swatches
        sh = np_.new_shape(); draw_items(sh, d['items'])
        key = tuple(round(x, 2) for x in f)
        g = palette.setdefault(key, (len(palette) + 1) * 8 / 255)
        sh.finish(fill=(g, g, g), color=None, even_odd=d.get('even_odd', False), closePath=True); sh.commit()
WITH_ROADS = len(sys.argv) > 4 and sys.argv[4] == 'roads'
for d in drawings:  # white boundary strokes (and optionally grey roads) on top
    c = d.get('color')
    is_white = c and min(c) > 0.99
    is_road = c and 0.78 < min(c) and max(c) < 0.85 and (d['width'] or 0) >= 2.5
    if d['type'] in ('s', 'fs') and (is_white or (WITH_ROADS and is_road)):
        sh = np_.new_shape(); draw_items(sh, d['items'])
        sh.finish(color=(1, 1, 1), width=(d['width'] or 2) * LINE_SCALE, fill=None, closePath=False); sh.commit()
pix = np_.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), colorspace=pymupdf.csGRAY, alpha=False)
img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
mask = img < 250
lab = np.zeros(img.shape, dtype=np.int32); n = 0
for v in np.unique(img[mask]):
    l, k = ndimage.label(img == v)
    lab[l > 0] = l[l > 0] + n; n += k
sizes = ndimage.sum(mask, lab, range(1, n + 1))
print('components', n, 'with >2000px:', int((sizes > 2000).sum()))
pix.save(OUT.replace('.json', '.png'))
feats = []
for geom, val in rasterio.features.shapes(lab.astype(np.int32), mask=lab > 0, connectivity=4):
    if sizes[int(val) - 1] < MIN_PX: continue
    poly = sg.shape(geom)
    poly = sg.Polygon([(x / ZOOM, y / ZOOM) for x, y in poly.exterior.coords])  # PDF points
    poly = poly.buffer(LINE_SCALE * 1.0, join_style=2)  # grow back over the boundary line
    feats.append({'id': int(val), 'poly': poly})
# labels: group words into lines
words = pg.get_text('words')
codes = [(w[4], ((w[0]+w[2])/2, (w[1]+w[3])/2)) for w in words if re.fullmatch(r'\d{3}', w[4])]
res = []
for f in feats:
    p = f['poly']
    inside_codes = [c for c, xy in codes if p.contains(sg.Point(xy))]
    inside_words = [w for w in words if p.contains(sg.Point((w[0]+w[2])/2, (w[1]+w[3])/2)) and not re.fullmatch(r'\d{3}', w[4])]
    res.append({'id': f['id'], 'area': p.area, 'codes': inside_codes,
                'words': [(w[4], w[5], w[6], w[7]) for w in inside_words],
                'coords': [list(map(lambda v: round(v, 2), xy)) for xy in p.simplify(0.3).exterior.coords]})
json.dump(res, open(OUT, 'w'))
print('regions', len(res), 'with exactly one code', sum(len(r['codes']) == 1 for r in res),
      'no code', sum(len(r['codes']) == 0 for r in res), 'multi', sum(len(r['codes']) > 1 for r in res))
print('total codes on page', len(codes))
