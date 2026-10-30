import { haversine } from '../util.js';

export const CATS = {
  landmark:   { label: 'Landmarks',   color: '#d6483f', icon: '🏛️', duration: 45 },
  restaurant: { label: 'Restaurants', color: '#e07a1f', icon: '🍽️', duration: 60 },
  bar:        { label: 'Bars',        color: '#8a4fd1', icon: '🍸', duration: 60 },
  cafe:       { label: 'Cafés',       color: '#a0693b', icon: '☕', duration: 30 },
  shop:       { label: 'Shops',       color: '#2a9d8f', icon: '🛍️', duration: 30 },
};

// Landmark kinds that are not a single building, so no footprint is highlighted
export const NO_FOOTPRINT = new Set(['Bridge', 'Square', 'Memorial', 'Viewpoint', 'Monument', 'Shopping street', 'Funicular', 'Courtyard', 'Cave museum', 'Fountain', 'Statue']);
// Larger complexes: highlight surrounding building parts too (metres)
const COMPLEX_RADIUS = { 'buda-castle': 120, parliament: 70, 'szechenyi-baths': 90, 'gellert-baths': 45, 'fishermans-bastion': 0 };

// A POI duplicates a curated stop when they share a distinctive name word ("Gerbeaud", "Szimpla"), or sit on the same spot in the same category
const GENERIC = new Set(['cafe', 'kavehaz', 'cukraszda', 'restaurant', 'etterem', 'bistro', 'budapest', 'grand', 'house', 'hotel']);
const words = (s) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w)));
const sameName = (a, b) => { const A = words(a); return [...words(b)].some((w) => A.has(w)); };

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point lies in the visible area: districts I, V, VI, VII, VIII, IX, XI plus City Park. */
export function inArea(area, p) {
  const g = area.features[0].geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(outer, p.lng, p.lat) && !holes.some((h) => inRing(h, p.lng, p.lat)));
}

export async function loadData() {
  const [landmarks, pois, presets, area] = await Promise.all(
    ['landmarks', 'pois', 'presets', 'area'].map((n) => fetch(`src/data/${n}.json`).then((r) => r.json())),
  );
  // optional extras: Wikipedia photos per landmark, and review scores ({ id: { rating, reviews } }); the app works without either
  const optional = (n) => fetch(`src/data/${n}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  // ?demo=ratings swaps in invented sample scores (scripts/make_demo_ratings.py) so the badges can be tried before real ones exist
  const demo = new URLSearchParams(location.search).get('demo') === 'ratings';
  const [photos, ratings] = await Promise.all([optional('photos'), optional(demo ? 'ratings.demo' : 'ratings')]);
  const withRating = (p) => (ratings[p.id] ? { ...p, rating: ratings[p.id].rating, reviews: ratings[p.id].reviews, ...(demo ? { demo: true } : {}) } : p);
  const curated = landmarks.filter((p) => inArea(area, p)).map((p) => withRating({ ...p, curated: true, radius: COMPLEX_RADIUS[p.id] ?? 25 }));
  const kept = new Set(curated.map((p) => p.id));
  const extra = pois.filter((p) => inArea(area, p) && !curated.some((c) => {
    const d = haversine(c, p);
    return (d < 80 && sameName(c.name, p.name)) || (d < 20 && c.category === p.category);
  }));
  const all = [...curated, ...extra.map((p) => withRating({ ...p, radius: 0, kind: p.detail || CATS[p.category].label.replace(/s$/, ''), blurb: '', duration: CATS[p.category].duration }))];
  const byId = Object.fromEntries(all.map((p) => [p.id, p]));
  const visiblePresets = presets
    .map((r) => ({ ...r, stops: r.stops.filter((id) => kept.has(id)) }))
    .filter((r) => r.stops.length >= 2);
  return { all, byId, presets: visiblePresets, area, photos };
}
