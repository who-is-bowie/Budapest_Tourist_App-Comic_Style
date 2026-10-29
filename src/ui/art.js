import { CATS } from '../data/places.js';
import { el } from '../util.js';

/**
 * Comic "stickers" for places: a hand-inked glyph per kind of place (cocktail, espresso cup, loaf of bread, bridge...)
 * on a halftone tile in the category colour. Landmarks swap the glyph for their Wikipedia photo (src/data/photos.json),
 * printed through the same halftone. Everything is drawn in one 32x32 grid with the map's ink (#14121a) outline.
 */

const INK = '#14121a';
const svg = (body) => `<svg viewBox="0 0 32 32" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const GLYPHS = {
  cocktail: svg('<path d="M5 6h22L16 18z" fill="#fff"/><path d="M8.6 9h14.8L16 16.4z" fill="#ff4fa3" stroke="none"/><path d="M16 18v8M10.5 27h11"/><path d="M22 2.5 15 11"/><circle cx="14.2" cy="11.8" r="2" fill="#7ac943"/>'),
  beer: svg('<path d="M7 11h14v15a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#ffc533"/><path d="M21 14h2.5a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H21"/><path d="M7 11a3.5 3.5 0 0 1 2-6.2A3.5 3.5 0 0 1 14.5 4 3.5 3.5 0 0 1 20 5a3 3 0 0 1 1 6z" fill="#fff"/><path d="M12 16v7M16 16v7" stroke-width="1.6" opacity=".35"/>'),
  wine: svg('<path d="M9.5 3h13l-.6 9a5.9 5.9 0 0 1-11.8 0z" fill="#fff"/><path d="M10.2 11h11.6a5.8 5.8 0 0 1-11.6 0z" fill="#c2304f" stroke="none"/><path d="M16 18v8.5M11 28h10"/>'),
  coffee: svg('<path d="M10 3.5c-1.6 1.6 1.6 2.6 0 4.5M15.5 3.5c-1.6 1.6 1.6 2.6 0 4.5"/><path d="M5 12h17v6a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7z" fill="#fff"/><path d="M5.4 14.5h16.2" stroke="#8a5a34" stroke-width="3"/><path d="M22 14h1.5a3.5 3.5 0 0 1 0 7h-2"/><path d="M4 28h19"/>'),
  tea: svg('<path d="M8 15a5.5 5 0 0 1 11 0" fill="#ffe45e"/><circle cx="13.5" cy="8.8" r="1.5" fill="#14121a"/><path d="M6 15h15v6a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5z" fill="#fff"/><path d="M21 18c3 0 4-2 5-5"/><path d="M6 17H4.5a2.5 2.5 0 0 0 0 5H6.5"/>'),
  bread: svg('<path d="M4.5 15a7 7 0 0 1 7-7h9a7 7 0 0 1 7 7v1.5a1.5 1.5 0 0 1-1.5 1.5V25a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-7a1.5 1.5 0 0 1-1.5-1.5z" fill="#f2b04a"/><path d="M11 12.5l2 3.5M16 12.5l2 3.5M21 12.5l2 3.5"/>'),
  cloche: svg('<path d="M4 23a12 12 0 0 1 24 0z" fill="#fff"/><circle cx="16" cy="8" r="2" fill="#ffc533"/><path d="M2.5 26.5h27"/><path d="M9 18.5a8 8 0 0 1 4-4" stroke-width="1.8" opacity=".45"/>'),
  pizza: svg('<path d="M4.5 8.5q11.5-5 23 0L16 28.5z" fill="#ffc533"/><path d="M4.5 8.5q11.5-5 23 0l-1.4 3q-9.1-3.8-20.2 0z" fill="#e0963a"/><circle cx="13" cy="16" r="2.2" fill="#e63946"/><circle cx="19.5" cy="15" r="2.2" fill="#e63946"/><circle cx="16" cy="21.5" r="2" fill="#e63946"/>'),
  burger: svg('<path d="M5 14a11 8 0 0 1 22 0z" fill="#f2b04a"/><path d="M4.5 16.5q2.2 3 4.5 0t4.5 0 4.5 0 4.5 0 4.5 0v1.5h-22.5z" fill="#7ac943"/><rect x="5" y="19.5" width="22" height="4" rx="2" fill="#7a4a2b"/><path d="M5.5 25.5h21v.5a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3z" fill="#f2b04a"/>'),
  bowl: svg('<path d="M10 14c0-3 3-3 3-6.5M16 14c0-3 3-3 3-6.5"/><path d="M20.5 3 27 12M24 2l5 8"/><path d="M4 15h24a12 12 0 0 1-24 0z" fill="#fff"/><path d="M5 18.5h22" stroke="#e63946" stroke-width="2.5"/><path d="M10 28.5h12"/>'),
  book: svg('<rect x="7" y="4" width="18" height="24" rx="2" fill="#4aa8ff"/><path d="M11.5 4v24"/><rect x="15" y="9" width="7" height="5" fill="#fff"/>'),
  shirt: svg('<path d="M11 4 3 9l3.5 5 3.5-1.5V28h12V12.5l3.5 1.5L29 9l-8-5a5 5 0 0 1-10 0z" fill="#fff"/>'),
  gift: svg('<rect x="5" y="13" width="22" height="14" rx="2" fill="#ff4fa3"/><rect x="4" y="9" width="24" height="5" rx="2" fill="#ffe45e"/><path d="M16 9v18"/><path d="M16 9c-3-6-9-4-6 0zM16 9c3-6 9-4 6 0z" fill="#fff"/>'),
  palette: svg('<path d="M16 4C8.5 4 3.5 9 3.5 15.5S9 28 15 28c2.2 0 2.7-1.6 1.6-3-1-1.4-.2-3 1.6-3H22c3.7 0 6.5-2.6 6.5-6.2C28.5 9 23 4 16 4z" fill="#fff"/><circle cx="10" cy="13" r="2" fill="#ff4fa3" stroke-width="1.5"/><circle cx="16" cy="9.5" r="2" fill="#ffe45e" stroke-width="1.5"/><circle cx="22" cy="12.5" r="2" fill="#4aa8ff" stroke-width="1.5"/><circle cx="9.5" cy="19.5" r="2" fill="#7ac943" stroke-width="1.5"/>'),
  bag: svg('<path d="M11 12V9a5 5 0 0 1 10 0v3"/><path d="M5.5 10h21l-1.5 17H7z" fill="#ffe45e"/>'),
  landmark: svg('<path d="M3.5 12 16 4l12.5 8z" fill="#fff"/><rect x="5" y="14" width="4" height="10" fill="#fff"/><rect x="11" y="14" width="4" height="10" fill="#fff"/><rect x="17" y="14" width="4" height="10" fill="#fff"/><rect x="23" y="14" width="4" height="10" fill="#fff"/><rect x="3" y="24" width="26" height="4" fill="#ffe45e"/>'),
  bridge: svg('<path d="M3 27q3-2 6 0t6 0 6 0 6 0" stroke="#4aa8ff"/><path d="M2 22h28" stroke-width="3"/><path d="M9 7v15M23 7v15"/><path d="M2 20Q8 18 9 8Q16 24 23 8Q24 18 30 20" fill="none"/><path d="M13 16.5V22M16 18V22M19 16.5V22" stroke-width="1.4"/>'),
  church: svg('<path d="M16 2v5M13.5 4.2h5"/><path d="M16 8l6 7v13H10V15z" fill="#fff"/><path d="M2.5 28v-8l7.5-2v10zM29.5 28v-8L22 18v10z" fill="#fff"/><path d="M13 28v-6a3 3 0 0 1 6 0v6" fill="#ffe45e"/>'),
  dome: svg('<path d="M7 28V15h18v13z" fill="#fff"/><path d="M10 15a6 6 0 0 1 12 0z" fill="#ffe45e"/><path d="M16 9V3.5"/><path d="M12.5 22h2.5v6h-2.5zM17 22h2.5v6H17z" fill="#14121a"/>'),
  bath: svg('<path d="M10 3.5c-2 2 2 3 0 5.5M16 2.5c-2 2 2 3 0 5.5M22 3.5c-2 2 2 3 0 5.5"/><path d="M3 15h26v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="#7ad7f0"/><path d="M7 21q2-1.8 4 0t4 0 4 0 4 0" stroke-width="1.6"/>'),
  castle: svg('<path d="M5 28V8h4v3h3V8h8v3h3V8h4v20z" fill="#fff"/><path d="M13 28v-6a3 3 0 0 1 6 0v6" fill="#14121a"/><path d="M9 15h.01M23 15h.01" stroke-width="3"/>'),
  market: svg('<path d="M6 14v13M26 14v13"/><rect x="6" y="21" width="20" height="6" fill="#ffe45e"/><path d="M3.5 13 6 5h20l2.5 8z" fill="#e63946"/><path d="M9.5 5 8.5 13M16 5v8M22.5 5l1 8" stroke="#fff" stroke-width="2.4"/><path d="M3.5 13 6 5h20l2.5 8z"/>'),
  mask: svg('<path d="M6 5h20v10a10 10 0 0 1-20 0z" fill="#ffe45e"/><path d="M10.5 12.5q2-2.4 4 0M17.5 12.5q2-2.4 4 0"/><path d="M11 18q5 5 10 0z" fill="#14121a"/>'),
  binoculars: svg('<rect x="5.5" y="5" width="6" height="8" fill="#fff"/><rect x="20.5" y="5" width="6" height="8" fill="#fff"/><rect x="4" y="12" width="9" height="15" rx="3" fill="#4aa8ff"/><rect x="19" y="12" width="9" height="15" rx="3" fill="#4aa8ff"/><path d="M13 17h6v5h-6z" fill="#fff"/>'),
  obelisk: svg('<path d="M16 2l3 4 2 20H11L13 6z" fill="#fff"/><rect x="8" y="26" width="16" height="3" fill="#ffe45e"/>'),
  fountain: svg('<path d="M16 4v10M16 4c-4 2-6 5-6 9M16 4c4 2 6 5 6 9"/><path d="M5 18h22l-3 9H8z" fill="#7ad7f0"/>'),
  route: svg('<path d="M7 26c-3-7 12-4 12-11" stroke-dasharray="3 3.2"/><circle cx="7" cy="26" r="3" fill="#ffe45e"/><path d="M22 3a6 6 0 0 1 6 6c0 5-6 11-6 11s-6-6-6-11a6 6 0 0 1 6-6z" fill="#ff4fa3"/><circle cx="22" cy="9" r="2.2" fill="#fff"/>'),
  pin: svg('<path d="M16 2a8 8 0 0 1 8 8c0 6-8 17-8 17S8 16 8 10a8 8 0 0 1 8-8z" fill="#ff4fa3"/><circle cx="16" cy="10" r="3" fill="#fff"/>'),
  shoes: svg('<path d="M4 24v-7l4-2 5 2.5 1 4.5v2.5z" fill="#ff4fa3"/><path d="M18 24v-6l5-5 5 3v8z" fill="#7ac943"/><path d="M3 27h26"/>'),
};

const LANDMARK_GLYPH = {
  Bridge: 'bridge', Church: 'church', 'Thermal bath': 'bath', Castle: 'castle', Market: 'market', Theatre: 'mask', Viewpoint: 'binoculars',
  Monument: 'obelisk', Memorial: 'shoes', Square: 'fountain', Synagogue: 'dome', Government: 'dome', 'Shopping street': 'bag',
  'Historic café': 'coffee', 'Ruin bar': 'beer',
};
/** Inline SVG markup for a glyph key, for places that need an icon outside a sticker (tabs, chips, empty states). */
export const glyphEl = (key, cls = 'glyph') => { const n = el('span', { class: cls }); n.innerHTML = GLYPHS[key]; return n; };

const BAR_BEER = /pub|sör|beer|ruin|romkocsma|kert|garden|brew|tap/i;
const BAR_WINE = /wine|bor\b|borozó|vin/i;
const ASIAN = /vietnam|chinese|japan|thai|asian|ramen|noodle|oriental|indian|sushi|korean|arab/i;

/** Which glyph suits a place: by category, then by the OSM cuisine/shop detail and the name. */
export function glyphFor(p) {
  const text = `${p.kind || ''} ${p.detail || ''}`;
  switch (p.category) {
    case 'landmark': return LANDMARK_GLYPH[p.kind] || 'landmark';
    case 'bar':
      if (/pizza/i.test(text)) return 'pizza';
      if (/burger/i.test(text)) return 'burger';
      if (BAR_WINE.test(p.name)) return 'wine';
      return BAR_BEER.test(p.name) ? 'beer' : 'cocktail';
    case 'cafe':
      if (/tea/i.test(text)) return 'tea';
      return /pastry|bake|cake|bagel|brunch/i.test(text) ? 'bread' : 'coffee';
    case 'restaurant':
      if (/pizza/i.test(text)) return 'pizza';
      if (/burger|grill/i.test(text)) return 'burger';
      return ASIAN.test(text) ? 'bowl' : 'cloche';
    case 'shop':
      if (/book/i.test(text)) return 'book';
      if (/cloth|fashion/i.test(text)) return 'shirt';
      if (/bakery|confection|cake|pastry|sandwich/i.test(text)) return 'bread';
      if (/gift|craft/i.test(text)) return 'gift';
      if (/art|antique/i.test(text)) return 'palette';
      if (/wine/i.test(text)) return 'wine';
      return 'bag';
    default: return 'landmark';
  }
}

let photos = {};
export const setPhotos = (p) => { photos = p || {}; };
export const photoOf = (id) => photos[id];
/** A photo URL at another thumbnail width (Wikimedia only serves its standard widths: 120, 250, 330, 500, 960; anything else is a 400). */
export const photoAt = (src, w) => src.replace(/\/\d+px-/, `/${w}px-`);

const tilt = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h % 7) - 3) * 0.9; };   // stable -2.7..2.7deg, like hand-placed stickers

/** A comic sticker for a place. `size` is a CSS length; photo landmarks show their picture with the glyph as a corner stamp. */
export function sticker(p, { size = '46px', photo = true, tag = null } = {}) {
  const cat = CATS[p.category], ph = photo && photoOf(p.id);
  const node = el('span', { class: `sticker${ph ? ' has-photo' : ''}`, style: `--c:${cat.color};--s:${size};--tilt:${tilt(p.id)}deg`, 'aria-hidden': 'true' });
  const g = el('span', { class: 'glyph' });
  g.innerHTML = GLYPHS[glyphFor(p)];
  if (ph) {
    const img = el('img', { src: photoAt(ph.src, 120), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.remove(); node.classList.remove('has-photo'); });
    node.append(img);
  }
  node.append(g);
  if (tag != null) node.append(el('b', { class: 'tag' }, tag));
  return node;
}

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n));

/** The review badge: a gold star burst with the score, and the review count beside it. Null when the place has no rating. */
export function rating(p) {
  if (!p.rating) return null;
  const n = p.reviews ? ` (${compact(p.reviews)})` : '';
  return el('span', { class: 'rate', title: p.demo ? `${p.rating.toFixed(1)} out of 5: sample score for the preview, not a real review` : `${p.rating.toFixed(1)} out of 5${p.reviews ? ` from ${p.reviews.toLocaleString()} Google reviews` : ' on Google'}`, 'aria-label': `Rated ${p.rating.toFixed(1)} out of 5${n}` },
    el('b', {}, el('i', { 'aria-hidden': 'true' }, '★'), p.rating.toFixed(1)), p.reviews ? el('small', {}, n.trim()) : null);
}
