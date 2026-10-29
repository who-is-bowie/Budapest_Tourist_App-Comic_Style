"""One-off: build src/data/districts.json (districts I, V, VI, VII, VIII, IX, XI as GeoJSON polygons)."""
import json, subprocess

KEEP = {"I", "V", "VI", "VII", "VIII", "IX", "XI"}
QUERY = '[out:json][timeout:90];rel["boundary"="administrative"]["admin_level"="9"](47.3,18.9,47.7,19.4);out geom;'
raw = subprocess.run(["curl", "-sS", "--max-time", "120", "-A", "budapest-tour-app/0.1",
    "--data-urlencode", "data=" + QUERY, "https://overpass-api.de/api/interpreter"],
    capture_output=True, text=True, check=True).stdout
rels = json.loads(raw)["elements"]

def rings(members):
    segs = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in members if m["type"] == "way" and m["role"] in ("outer", "") and m.get("geometry")]
    out = []
    while segs:
        ring = segs.pop(0)
        while ring[0] != ring[-1]:
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]
                elif s[-1] == ring[-1]: ring += s[::-1][1:]
                elif s[-1] == ring[0]: ring = s[:-1] + ring
                elif s[0] == ring[0]: ring = s[::-1][:-1] + ring
                else: continue
                segs.pop(i); break
            else: break
        out.append([list(p) for p in ring])
    return out

feats = []
for r in rels:
    t = r.get("tags", {})
    name = t.get("name", "")
    num = (t.get("ref") or name.split(".")[0]).strip()
    print(num, "|", name, "|", t.get("ref"))
    if num in KEEP or name.split(".")[0].strip() in KEEP:
        feats.append({"type": "Feature", "properties": {"district": num, "name": name},
                      "geometry": {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings(r["members"])]}})
json.dump({"type": "FeatureCollection", "features": feats}, open("src/data/districts.json", "w"))
print("kept", [f["properties"]["district"] for f in feats])
