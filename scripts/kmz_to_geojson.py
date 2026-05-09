"""
Convert Alberta Bahá'í Regional Map KMZ into per-layer GeoJSON files.

Each KML <Folder> becomes a separate GeoJSON FeatureCollection in data/,
so the app can toggle layers independently.

Run from the repo root:  python3 scripts/kmz_to_geojson.py
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

KMZ = Path("data/alberta-regional-map.kmz")
OUT_DIR = Path("data")
NS = {"k": "http://www.opengis.net/kml/2.2"}

FOLDER_FILENAMES = {
    "Alberta Bahá'í Clusters": "alberta-clusters.geojson",
    "Local Spiritual Assemblies": "alberta-local-spiritual-assemblies.geojson",
    "Cluster Data": "alberta-cluster-data.geojson",
    "Unit Electoral Boundaries": "alberta-unit-electoral-boundaries.geojson",
    "Cluster groupings": "alberta-cluster-groupings.geojson",
    "Locality Populations.xlsx": "alberta-locality-populations.geojson",
}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "untitled"


def parse_coord_string(text: str):
    out = []
    for tok in text.strip().split():
        parts = tok.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            out.append([lon, lat])
    return out


def extended_data(pm):
    props = {}
    ed = pm.find("k:ExtendedData", NS)
    if ed is None:
        return props
    for d in ed.findall("k:Data", NS):
        key = d.get("name")
        val = d.find("k:value", NS)
        if key and val is not None and val.text is not None:
            props[key] = val.text
    return props


def geometry_from_placemark(pm):
    poly = pm.find(".//k:Polygon", NS)
    if poly is not None:
        outer = poly.find(".//k:outerBoundaryIs/k:LinearRing/k:coordinates", NS)
        rings = []
        if outer is not None and outer.text:
            rings.append(parse_coord_string(outer.text))
        for inner in poly.findall(".//k:innerBoundaryIs/k:LinearRing/k:coordinates", NS):
            if inner.text:
                rings.append(parse_coord_string(inner.text))
        if rings:
            return {"type": "Polygon", "coordinates": rings}

    multi = pm.findall(".//k:MultiGeometry/k:Polygon", NS)
    if multi:
        polys = []
        for p in multi:
            outer = p.find(".//k:outerBoundaryIs/k:LinearRing/k:coordinates", NS)
            rings = []
            if outer is not None and outer.text:
                rings.append(parse_coord_string(outer.text))
            for inner in p.findall(".//k:innerBoundaryIs/k:LinearRing/k:coordinates", NS):
                if inner.text:
                    rings.append(parse_coord_string(inner.text))
            if rings:
                polys.append(rings)
        if polys:
            return {"type": "MultiPolygon", "coordinates": polys}

    pt = pm.find(".//k:Point/k:coordinates", NS)
    if pt is not None and pt.text:
        coords = parse_coord_string(pt.text)
        if coords:
            return {"type": "Point", "coordinates": coords[0]}

    line = pm.find(".//k:LineString/k:coordinates", NS)
    if line is not None and line.text:
        return {"type": "LineString", "coordinates": parse_coord_string(line.text)}

    return None


def folder_to_features(folder):
    features = []
    for pm in folder.findall("k:Placemark", NS):
        name_el = pm.find("k:name", NS)
        name = (name_el.text or "").strip() if name_el is not None else ""
        desc_el = pm.find("k:description", NS)
        desc = desc_el.text.strip() if (desc_el is not None and desc_el.text) else None

        props = {"name": name}
        if desc:
            props["description"] = desc
        props.update(extended_data(pm))

        geom = geometry_from_placemark(pm)
        features.append({"type": "Feature", "properties": props, "geometry": geom})
    return features


def main():
    if not KMZ.exists():
        sys.exit(f"KMZ not found at {KMZ}")

    with zipfile.ZipFile(KMZ) as z:
        kml_name = next(n for n in z.namelist() if n.endswith(".kml"))
        with z.open(kml_name) as f:
            tree = ET.parse(f)

    root = tree.getroot()
    written = []

    for folder in root.iter(f"{{{NS['k']}}}Folder"):
        name_el = folder.find("k:name", NS)
        if name_el is None or not name_el.text:
            continue
        folder_name = name_el.text.strip()
        features = folder_to_features(folder)
        if not features:
            continue

        filename = FOLDER_FILENAMES.get(folder_name, f"alberta-{slugify(folder_name)}.geojson")
        out_path = OUT_DIR / filename
        fc = {
            "type": "FeatureCollection",
            "name": folder_name,
            "features": features,
        }
        out_path.write_text(json.dumps(fc, ensure_ascii=False, indent=2))
        written.append((out_path, len(features)))

    print("Wrote:")
    for path, count in written:
        print(f"  {path}  ({count} features)")


if __name__ == "__main__":
    main()
