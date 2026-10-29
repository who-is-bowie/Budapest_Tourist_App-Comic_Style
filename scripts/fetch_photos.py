#!/usr/bin/env python3
"""One-off builder: a Wikipedia thumbnail for every curated landmark -> src/data/photos.json.

Wikipedia rate-limits bulk calls and some landmark names land on disambiguation pages, so
titles are mapped explicitly (TITLES) and the result is committed. Re-run only when
landmarks.json changes. Output: { id: { src, page, title } }; the app credits Wikipedia/Wikimedia Commons.
"""
import json, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = 'budapest-tour-app/1.0 (personal tour planner)'
WIDTH = 500

# id -> Wikipedia article, where the landmark name alone is wrong or ambiguous
TITLES = {
    'elizabeth-bridge': 'Elisabeth Bridge',
    'liberty-bridge': 'Liberty Bridge (Budapest)',
    'citadella': 'Citadella',
    'cave-church': 'Gellért Hill Cave',
    'gul-baba': 'Gül Baba',
    'liberty-square': 'Liberty Square (Budapest)',
    'parliament': 'Hungarian Parliament Building',
    'basilica': "St. Stephen's Basilica",
    'opera': 'Hungarian State Opera House',
    'market-hall': 'Great Market Hall',
    'vaci-utca': 'Váci utca',
    'vorosmarty': 'Vörösmarty Square',
    'gerbeaud': 'Café Gerbeaud',
    'new-york-cafe': 'New York Café',
    'house-of-terror': 'House of Terror',
    'shoes-danube': 'Shoes on the Danube Bank',
    'heroes-square': 'Heroes\' Square (Budapest)',
}


def get(url):
    for wait in (1, 4, 10, 30):
        out = subprocess.run(['curl', '-sL', '-m', '15', '-A', UA, url], capture_output=True, text=True).stdout
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            time.sleep(wait)   # 429 "too many requests" comes back as text
    return None


def summary(title):
    return get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_'), safe=''))


def main():
    landmarks = json.loads((ROOT / 'src/data/landmarks.json').read_text())
    out = {}
    for p in landmarks:
        d = summary(TITLES.get(p['id'], p['name']))
        time.sleep(1.2)
        thumb = (d or {}).get('thumbnail')
        if not d or d.get('type') != 'standard' or not thumb:
            print(f"  --  {p['id']:20} no usable article ({(d or {}).get('title')}, {(d or {}).get('type')})", file=sys.stderr)
            continue
        src = thumb['source']
        # thumbnails are served at several widths; ask for a crisp one that suits a 2x card
        parts = src.rsplit('/', 1)
        if parts[1].split('px-')[0].isdigit():
            src = f"{parts[0]}/{WIDTH}px-{parts[1].split('px-', 1)[1]}"
        out[p['id']] = {'src': src, 'page': d['content_urls']['desktop']['page'], 'title': d['title']}
        print(f"  ok  {p['id']:20} {d['title']}")
    (ROOT / 'src/data/photos.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f"{len(out)}/{len(landmarks)} landmarks have a photo")


if __name__ == '__main__':
    main()
