# Calgary neighbourhood shapes

`public/data/calgary-communities.geojson` (the map's neighbourhood overlay)
was built with these scripts from two inputs:

- **CREB 2025 Community Map** (PDF, Adobe Illustrator export). This gives the
  community outlines and labels. It isn't checked in.
- **City of Calgary community points** (Open Calgary dataset `j9ps-fyst`,
  GeoJSON). This gives each community's official name, code, sector and
  centre point, which are used to place the traced shapes on the real map.

The PDF has no coordinates. The scripts rebuild its district fills and white
boundary lines, rasterize them, and split them into regions. They name each
region from the labels inside it, and fit a least-squares affine transform
from region centres to the City's centre points. With ~200 matched
communities, the median error is ~100 m. Overlap with the few official
outlines available for checking was 0.93–0.96 IoU.

```sh
python -m venv .venv && .venv/bin/pip install pymupdf shapely numpy scipy rasterio
D=work; mkdir -p $D && cp CREB_MAP.pdf $D/creb.pdf && cp j9ps-fyst.geojson $D/official_points.geojson
.venv/bin/python extract.py  $D/creb.pdf $D/A.json 2.6          # boundary lines only
.venv/bin/python extract.py  $D/creb.pdf $D/B.json 2.6 roads    # + roads, used to split merged areas
.venv/bin/python georef.py   $D                                  # writes $D/affine.npy
.venv/bin/python assemble.py $D ../../public/data/calgary-communities.geojson
```

Each feature's `id` is the City community code, which is what milestones are
stored against (`neighbourhood_milestones.neighbourhood_code`). CREB-only
areas the City list doesn't have yet use `CREB<code>`. If the City's
official community polygons (`surr-xmvs`) are used instead later, keep the
same `id`s so existing milestones carry over.
