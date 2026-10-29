"""Union the kept districts and the City Park box into src/data/area.json (the area the app shows places for)."""
import json
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

d = json.load(open("src/data/districts.json"))
polys = [shape(f["geometry"]).buffer(0) for f in d["features"]]
city_park = box(19.064, 47.5095, 19.095, 47.5245)   # Heroes' Square, Vajdahunyad Castle, Széchenyi Baths
area = unary_union([p.buffer(0.00004) for p in polys] + [city_park]).buffer(-0.00004).simplify(0.00003)
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": mapping(area)}]}
json.dump(fc, open("src/data/area.json", "w"))
print("bounds", area.bounds, "parts", len(getattr(area, "geoms", [area])))
