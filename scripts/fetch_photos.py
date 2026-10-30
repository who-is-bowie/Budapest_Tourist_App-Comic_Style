#!/usr/bin/env python3
"""One-off builder: a Wikipedia thumbnail for every curated landmark -> src/data/photos.json.

Wikipedia rate-limits bulk calls and some landmark names land on disambiguation pages, so
titles are mapped explicitly (TITLES; a list is tried in order) and the result is committed. Re-run when
landmarks.json changes: landmarks that already have a photo are kept, `--refresh` fetches them all again.
Output: { id: { src, page, title } }; the app credits Wikipedia/Wikimedia Commons.
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
    'national-museum': 'Hungarian National Museum',
    'academy-of-sciences': 'Hungarian Academy of Sciences',
    'vigado': ['Vigadó of Pest', 'Pesti Vigadó'],
    'trinity-column': ['Holy Trinity Column (Budapest)', 'Holy Trinity Column, Budapest', 'Trinity Square (Budapest)'],
    'funicular': ['Budapest Castle Hill Funicular', 'Budavári Sikló'],
    'zero-km': ['Zero Kilometre Stone (Budapest)', 'Zero Kilometre Stone'],
    'fine-arts-museum': 'Museum of Fine Arts (Budapest)',
    'liszt-academy': 'Franz Liszt Academy of Music',
    'gozsdu-udvar': ['Gozsdu udvar', 'Gozsdu Courtyard'],
    'applied-arts-museum': 'Museum of Applied Arts (Budapest)',
    'national-theatre': 'National Theatre (Budapest)',
    'gellert-monument': ['Saint Gellért Monument', 'St. Gellért Monument', 'Statue of Saint Gerard (Budapest)'],
    'keleti-station': 'Budapest Keleti station',
    'nyugati-station': 'Budapest Nyugati station',
    'ethnography-museum': ['Museum of Ethnography (Budapest)', 'Museum of Ethnography, Budapest'],
    'anonymus-statue': ['Statue of Anonymus', 'Anonymus statue'],
    'vienna-gate': ['Vienna Gate (Budapest)', 'Vienna Gate'],
    'st-anne-church': ["St. Anne's Church, Budapest", "Saint Anne's Church, Budapest", "St. Anne's Church (Budapest)"],
    'central-cafe': ['Central Café (Budapest)', 'Centrál Kávéház'],
    'instant-fogas': ['Instant-Fogas'],
    'mazel-tov': [],
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
    path = ROOT / 'src/data/photos.json'
    out = {} if '--refresh' in sys.argv or not path.exists() else json.loads(path.read_text())
    for p in landmarks:
        if p['id'] in out:
            continue
        titles = TITLES.get(p['id'], p['name'])
        for title in [titles] if isinstance(titles, str) else titles:
            d = summary(title)
            time.sleep(1.2)
            thumb = (d or {}).get('thumbnail')
            if d and d.get('type') == 'standard' and thumb:
                break
        else:
            print(f"  --  {p['id']:20} no usable article", file=sys.stderr)
            continue
        src = thumb['source']
        # thumbnails are served at several widths; ask for a crisp one that suits a 2x card
        parts = src.rsplit('/', 1)
        if parts[1].split('px-')[0].isdigit():
            src = f"{parts[0]}/{WIDTH}px-{parts[1].split('px-', 1)[1]}"
        out[p['id']] = {'src': src, 'page': d['content_urls']['desktop']['page'], 'title': d['title']}
        print(f"  ok  {p['id']:20} {d['title']}")
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f"{len(out)}/{len(landmarks)} landmarks have a photo")


if __name__ == '__main__':
    main()
