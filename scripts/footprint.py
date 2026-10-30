#!/usr/bin/env python3
"""Measure a landmark's real footprint for PLACEMENT in src/model3d/registry.js.

    python3 scripts/footprint.py way 24000390          # Opera
    python3 scripts/footprint.py relation 3199085      # Parliament

Fetches the element from the OSM API and prints the centre, length, width and long-axis bearing of its minimum-area
bounding rectangle. The centre is the landmark's pin in landmarks.json, the length its `span`, and `facing` is the
bearing of the front: long axis ± 90° when the model's long side is its x, the axis itself when it runs front to back.
"""
import json, math, subprocess, sys

def element(kind, i):
    out = subprocess.run(['curl', '-sS', '--max-time', '60', '-A', 'budapest-tour-app/0.1 (personal project)',
                          f'https://api.openstreetmap.org/api/0.6/{kind}/{i}/full.json'], capture_output=True, text=True, check=True).stdout
    els = json.loads(out)['elements']
    nodes = {e['id']: (e['lon'], e['lat']) for e in els if e['type'] == 'node'}
    ways = {e['id']: e for e in els if e['type'] == 'way'}
    if kind == 'way':
        return [nodes[n] for n in ways[i]['nodes']]
    rel = next(e for e in els if e['type'] == 'relation' and e['id'] == i)
    return [nodes[n] for m in rel['members'] if m['type'] == 'way' and m['ref'] in ways and m.get('role') in ('outer', 'outline', 'part', '')
            for n in ways[m['ref']]['nodes'] if n in nodes]

def oriented_box(pts):
    lat0 = sum(p[1] for p in pts) / len(pts)
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    xy = [(x * kx, y * ky) for x, y in pts]
    best = None
    for a10 in range(0, 1800, 5):
        t = math.radians(a10 / 10); c, s = math.cos(t), math.sin(t)
        us = [x * c + y * s for x, y in xy]; vs = [-x * s + y * c for x, y in xy]
        w, h = max(us) - min(us), max(vs) - min(vs)
        if best is None or w * h < best[0]:
            best = (w * h, a10 / 10, w, h, (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2)
    _, a, w, h, cu, cv = best
    t = math.radians(a); c, s = math.cos(t), math.sin(t)
    ang, length, width = (a + 90, h, w) if h > w else (a, w, h)
    bearing = math.degrees(math.atan2(math.cos(math.radians(ang)), math.sin(math.radians(ang)))) % 180
    return {'lat': round((cu * s + cv * c) / ky, 6), 'lng': round((cu * c - cv * s) / kx, 6), 'length': round(length), 'width': round(width), 'axis': round(bearing, 1)}

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('way', 'relation'):
        raise SystemExit(__doc__)
    print(oriented_box(element(sys.argv[1], int(sys.argv[2]))))
