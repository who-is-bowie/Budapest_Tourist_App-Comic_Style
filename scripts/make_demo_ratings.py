#!/usr/bin/env python3
"""Sample review scores for trying out the rating badges: NOT real data -> src/data/ratings.demo.json.

The app only reads this file when opened with ?demo=ratings, and labels every score as a sample. Scores come from a hash of
the place id, so they stay the same between runs. Real Google scores go in ratings.json via fetch_ratings.py."""
import hashlib, json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'src/data'
CATS = {'landmark', 'bar', 'cafe', 'restaurant'}


def unit(pid, salt):
    return int(hashlib.md5(f'{salt}:{pid}'.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


places = json.loads((DATA / 'landmarks.json').read_text()) + json.loads((DATA / 'pois.json').read_text())
out = {}
for p in places:
    if p['category'] not in CATS:
        continue
    u = unit(p['id'], 'r')
    rating = round(3.5 + 1.3 * (1 - (1 - u) ** 1.7), 1)          # mostly 4.0 to 4.7, a few lower
    big = p['category'] == 'landmark'
    reviews = int(round(10 ** (3.2 + 1.6 * unit(p['id'], 'n') if big else 1.7 + 2.4 * unit(p['id'], 'n'))))
    out[p['id']] = {'rating': min(rating, 4.9), 'reviews': reviews}
(DATA / 'ratings.demo.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
print(len(out), 'sample scores written')
