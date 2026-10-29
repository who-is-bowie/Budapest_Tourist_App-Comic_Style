"""One-off: pull bars, restaurants, cafes and shops from Overpass into src/data/pois.json."""
import json, subprocess

BBOX = "47.425,18.96,47.52,19.13"  # south,west,north,east
QUERY = f"""[out:json][timeout:150];
(
  nwr["amenity"~"^(bar|pub|restaurant|cafe)$"]["name"]({BBOX});
  nwr["shop"~"^(gift|souvenir|books|wine|antiques|art|chocolate|confectionery|bakery|craft|clothes|mall|department_store)$"]["name"]({BBOX});
);
out center 4000;"""
CAP = {"restaurant": 90, "bar": 90, "cafe": 50, "shop": 70}

def category(t):
    a = t.get("amenity")
    if a in ("bar", "pub"): return "bar"
    if a == "restaurant": return "restaurant"
    if a == "cafe": return "cafe"
    if t.get("shop"): return "shop"

raw = subprocess.run(["curl", "-sS", "--max-time", "170", "-A", "budapest-tour-app/0.1",
    "--data-urlencode", "data=" + QUERY, "https://overpass-api.de/api/interpreter"],
    capture_output=True, text=True, check=True).stdout
try:
    els = json.loads(raw)["elements"]
except ValueError:
    raise SystemExit("Overpass did not return JSON: " + raw[:300])

buckets = {}
for e in els:
    t = e.get("tags", {})
    c = category(t)
    lat = e.get("lat") or e.get("center", {}).get("lat")
    lon = e.get("lon") or e.get("center", {}).get("lon")
    if not c or lat is None: continue
    score = sum(k in t for k in ("website", "opening_hours", "wikidata", "phone", "cuisine", "addr:street"))
    buckets.setdefault(c, []).append((score, {
        "id": f"osm-{e['type'][0]}{e['id']}", "name": t["name"], "category": c,
        "lat": round(lat, 6), "lng": round(lon, 6),
        "detail": t.get("cuisine", t.get("shop", "")).replace("_", " ").replace(";", ", "),
        "address": " ".join(filter(None, [t.get("addr:street"), t.get("addr:housenumber")])),
        "hours": t.get("opening_hours", ""),
        "source": "osm"}))
out = []
for c, items in buckets.items():
    items.sort(key=lambda x: -x[0])
    out += [i for _, i in items[:CAP[c]]]
json.dump(out, open("src/data/pois.json", "w"), ensure_ascii=False, indent=0)
print(len(els), "raw ->", len(out), {c: min(len(v), CAP[c]) for c, v in buckets.items()})
