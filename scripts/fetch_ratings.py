#!/usr/bin/env python3
"""One-off builder: Google review scores for the places in the visible area -> src/data/ratings.json.

  export GOOGLE_PLACES_API_KEY=...        # Places API (New) must be enabled on the key's project
  python3 scripts/fetch_ratings.py --dry-run          # list what would be queried, no API calls
  python3 scripts/fetch_ratings.py --limit 5          # try a handful first
  python3 scripts/fetch_ratings.py                    # everything not already in ratings.json
  python3 scripts/fetch_ratings.py --refresh          # re-query places that already have a score

One Text Search request per place, restricted to a small circle around its OSM coordinates, and a result is only
accepted when its name resembles ours and it sits within MAX_M metres. The rating fields are billed at the Enterprise
tier of Text Search, so check the price and your monthly credit before running everything; the file is rewritten after
every request, so an interrupted run loses nothing and can be resumed.

Terms: Google's Places terms limit how long Places content may be stored and require attribution wherever it is shown.
The app labels the scores as Google's; re-run with --refresh on a schedule that suits those terms.
"""
import argparse, json, os, re, subprocess, sys, time, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src/data'
URL = 'https://places.googleapis.com/v1/places:searchText'
FIELDS = 'places.id,places.displayName,places.rating,places.userRatingCount,places.location'
BIAS_M = 150          # search circle around the OSM point
MAX_M = 120           # farthest accepted match for a pub/cafe/restaurant
MAX_M_LANDMARK = 400  # landmarks are big and their OSM point is a centroid


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn'))


def tokens(s):
    return {t for t in norm(s).split() if len(t) > 2 and t not in {'the', 'and', 'cafe', 'bar', 'restaurant', 'budapest', 'etterem', 'kavezo'}}


def similar(a, b):
    na, nb = norm(a), norm(b)
    if na and nb and (na in nb or nb in na):
        return True
    ta, tb = tokens(a), tokens(b)
    return bool(ta and tb) and len(ta & tb) / min(len(ta), len(tb)) >= 0.5


def metres(a, b):
    import math
    k = 111320
    return math.hypot((a['lat'] - b['lat']) * k, (a['lng'] - b['lng']) * k * math.cos(math.radians(a['lat'])))


def in_ring(ring, x, y):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_area(area, p):
    g = area['features'][0]['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    return any(in_ring(outer, p['lng'], p['lat']) and not any(in_ring(h, p['lng'], p['lat']) for h in holes) for outer, *holes in polys)


def search(key, p):
    body = {'textQuery': f"{p['name']} Budapest", 'maxResultCount': 3, 'languageCode': 'en',
            'locationBias': {'circle': {'center': {'latitude': p['lat'], 'longitude': p['lng']}, 'radius': float(BIAS_M)}}}
    # the key goes in through a curl config on stdin so it never shows up in the process list
    cfg = f'header = "X-Goog-Api-Key: {key}"\nheader = "X-Goog-FieldMask: {FIELDS}"\nheader = "Content-Type: application/json"\n'
    out = subprocess.run(['curl', '-s', '-m', '20', '-K', '-', '-d', json.dumps(body), URL], input=cfg, capture_output=True, text=True).stdout
    data = json.loads(out)
    if 'error' in data:
        raise RuntimeError(data['error'].get('message', out))
    return data.get('places', [])


def pick(p, results):
    limit = MAX_M_LANDMARK if p['category'] == 'landmark' else MAX_M
    for r in results:
        loc = r.get('location')
        if not loc or 'rating' not in r:
            continue
        near = metres(p, {'lat': loc['latitude'], 'lng': loc['longitude']}) <= limit
        if near and similar(p['name'], r.get('displayName', {}).get('text', '')):
            return r
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cats', default='landmark,bar,cafe,restaurant', help='comma-separated categories (shop is off by default)')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    area = json.loads((DATA / 'area.json').read_text())
    places = json.loads((DATA / 'landmarks.json').read_text()) + json.loads((DATA / 'pois.json').read_text())
    cats = set(a.cats.split(','))
    path = DATA / 'ratings.json'
    ratings = json.loads(path.read_text()) if path.exists() else {}
    todo = [p for p in places if p['category'] in cats and in_area(area, p) and (a.refresh or p['id'] not in ratings)]
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(todo)} places to query ({len(ratings)} already scored)")
    if a.dry_run:
        for p in todo[:15]:
            print(f"  {p['category']:10} {p['name']}")
        return

    key = os.environ.get('GOOGLE_PLACES_API_KEY')
    if not key:
        sys.exit('Set GOOGLE_PLACES_API_KEY first.')
    hits = 0
    for n, p in enumerate(todo, 1):
        try:
            r = pick(p, search(key, p))
        except (RuntimeError, json.JSONDecodeError) as e:
            sys.exit(f"stopped at {p['name']}: {e}")
        if r:
            ratings[p['id']] = {'rating': r['rating'], 'reviews': r.get('userRatingCount', 0)}
            hits += 1
            print(f"  {n:3}/{len(todo)} {p['name']:36} {r['rating']} ({r.get('userRatingCount', 0)})")
        else:
            print(f"  {n:3}/{len(todo)} {p['name']:36} no confident match")
        path.write_text(json.dumps(ratings, ensure_ascii=False, indent=1) + '\n')
        time.sleep(0.15)
    print(f"{hits} new scores; {len(ratings)} in ratings.json")


if __name__ == '__main__':
    main()
