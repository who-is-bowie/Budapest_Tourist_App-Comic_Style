import { CATS, NO_FOOTPRINT } from '../data/places.js';
import { has3D } from '../model3d/registry.js';
import { haversine } from '../util.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const HOME = { center: [19.06, 47.4885], zoom: 12.9, pitch: 55, bearing: -18 };
const BOUNDS = [[18.955, 47.42], [19.135, 47.535]];   // districts I, V, VI, VII, VIII, IX, XI and City Park
const FOCUS_COLOR = '#ff4fa3';
const TERRAIN = false;   // true = real 3D relief (hills, hillshade, terraces under the landmark models); off = the flat map
const DEM_MAXZOOM = 15;
const TERRAIN_EXAGGERATION = 1.5;   // Buda hills are ~140 m over the Danube; a little stretch makes them read

let map;
let handlers = {};
const footprints = new Map();  // place id -> { features, tries }
let selectedPlaces = [];       // [{ place, color }] currently selected, ordered
let focusFeature = null;
let suggestIds = [];
let routeToken = 0;
let pulseRaf = 0;
let landmarks = null;          // Three.js models drawn into the map (loaded after the map)
const baseFilters = {};
// pins of 3D landmarks fade away once the model has grown in
const POP_IN = ['interpolate', ['linear'], ['zoom'], 14.5, 1, 15, ['case', ['get', 'm3d'], 0, 1]];

/* ---------- comic base style: newsprint, flat CMY colour, black ink ---------- */

const INK = '#14121a';
// Two palettes share one style builder. Day is the printed newsprint comic; night is the same comic after dark:
// deep indigo paper, neon cyan and magenta contours, misregistered colour plates, glowing roads and pins.
const THEMES = {
  day: {
    ink: INK, halo: '#fff7d6', text: INK, waterText: '#0b6f94',
    paper: '#f5ecd2', park: '#a9e58c', parkEdge: INK, parkEdgeOp: 0.55, wood: '#8fd67f', grass: '#c3ee9b', residential: '#f8efd6', landuse: '#f2e5c0', cemetery: '#cdeeb0',
    water: '#63d2f2', coast: INK, road: '#fffbe8', main: '#ffdc3d', path: '#fffbe8', rail: '#8a7f6a', casing: INK,
    building2d: '#ffd860', buildingEdge: INK,
    // buildings run from yellow through orange and pink to violet as they get taller
    buildings: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#fff07a', 12, '#ffd24d', 24, '#ff9f5a', 40, '#ff5fa2', 70, '#b265ee'],
    // a hard sun from the upper left gives walls two clear tones
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.62, position: [1.4, 215, 38] },
    plate: { color: INK, opacity: 0.28, translate: [5, 6] },
    night: false,
    pinGlow: 0, routeGlow: 0, routeCasing: INK, walker: INK, labelText: INK, selEdge: INK, suggestEdge: INK, suggestFill: 'rgba(255,221,0,0.35)',
    caption: 'caption', captionSel: 'caption-sel',
  },
  night: {
    ink: '#07041a', halo: '#150a3b', text: '#fdf0ff', waterText: '#7ef0ff',
    paper: '#150a3b', park: '#0d5560', parkEdge: '#35e6ff', parkEdgeOp: 0.3, wood: '#0a4558', grass: '#116a6c', residential: '#1b0f4a', landuse: '#22135c', cemetery: '#0b4a55',
    water: '#0a2a8f', coast: '#35e6ff', road: '#5b36c9', main: '#ff4fb8', path: '#3c2a8e', rail: '#7a68c8', casing: '#07041a',
    building2d: '#3a22a8', buildingEdge: '#35e6ff',
    buildings: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#2f7bff', 12, '#5b3bff', 24, '#a42fe8', 40, '#ff2fb2', 70, '#ff7a45'],
    light: { anchor: 'viewport', color: '#c9b6ff', intensity: 0.78, position: [1.4, 215, 38] },
    plate: { color: '#ff2fb2', opacity: 0.6, translate: [-4, 4] },
    night: true,
    pinGlow: 0.65, routeGlow: 0.85, routeCasing: '#07041a', walker: '#35e6ff', labelText: '#ffffff', selEdge: '#ffffff', suggestEdge: '#35e6ff', suggestFill: 'rgba(53,230,255,0.28)',
    caption: 'caption-night', captionSel: 'caption-sel-night',
  },
};
let T = THEMES.day;
let rawStyle = null;      // the untouched OpenFreeMap style, so either theme can be rebuilt from it
let appliedStyle = null;  // what funStyle() last produced for the map, to diff the next theme against

function funStyle(style, P) {
  const set = (l, k, v) => { l.paint = l.paint || {}; l.paint[k] = v; };
  for (const l of style.layers) {
    const id = l.id;
    if (id === 'background') set(l, 'background-color', P.paper);
    else if (id === 'natural_earth') l.layout = { ...l.layout, visibility: 'none' };
    else if (id === 'park') { set(l, 'fill-color', P.park); set(l, 'fill-outline-color', P.parkEdge); }
    else if (id === 'park_outline') { set(l, 'line-color', P.parkEdge); set(l, 'line-width', 1.2); set(l, 'line-opacity', P.parkEdgeOp); }
    else if (id === 'landcover_wood') set(l, 'fill-color', P.wood);
    else if (id === 'landcover_grass') set(l, 'fill-color', P.grass);
    else if (id === 'landuse_residential') set(l, 'fill-color', P.residential);
    else if (id.startsWith('landuse_')) set(l, 'fill-color', id === 'landuse_cemetery' ? P.cemetery : P.landuse);
    else if (id === 'water') set(l, 'fill-color', P.water);
    else if (id.startsWith('waterway') && l.type === 'line') set(l, 'line-color', P.water);
    else if (l.source === 'openmaptiles' && l['source-layer'] === 'transportation' && l.type === 'line') {
      const major = /motorway|trunk|primary|secondary|tertiary|_link/.test(id), rail = /rail|transit/.test(id);
      const casing = id.includes('casing');
      const color = rail ? P.rail : casing ? P.casing : major ? P.main : /pedestrian|path/.test(id) ? P.path : P.road;
      set(l, 'line-color', color);
      if (casing) set(l, 'line-opacity', 1);
      l.layout = { ...l.layout, 'line-cap': 'round', 'line-join': 'round' };
    }
    else if (id === 'building') { set(l, 'fill-color', P.building2d); set(l, 'fill-outline-color', P.buildingEdge); }
    else if (id === 'building-3d') {
      l.minzoom = 13; set(l, 'fill-extrusion-color', P.buildings); set(l, 'fill-extrusion-opacity', 1);
      set(l, 'fill-extrusion-vertical-gradient', false);   // flat faces, like cel shading
    }
    else if (/^poi_/.test(id)) l.layout = { ...l.layout, visibility: 'none' };          // our own pins replace these
    else if (l.type === 'symbol') {
      const water = /water|waterway/.test(id), road = /highway|road/.test(id);
      set(l, 'text-color', water ? P.waterText : P.text);
      set(l, 'text-halo-color', P.halo); set(l, 'text-halo-width', road ? 1.6 : 2.2);
    }
  }
  style.light = P.light;

  const layerAt = (id) => style.layers.findIndex((l) => l.id === id);
  const lineOf = (id, layer, minzoom, paint, extra = {}) => ({ id, type: 'line', source: 'openmaptiles', 'source-layer': layer, ...(minzoom ? { minzoom } : {}), ...extra, layout: { 'line-join': 'round', ...extra.layout }, paint });
  const nightOnly = P.night ? {} : { visibility: 'none' };
  // neon bloom under the main roads (night only)
  const firstRoad = style.layers.findIndex((l) => l.source === 'openmaptiles' && l['source-layer'] === 'transportation' && l.type === 'line');
  style.layers.splice(firstRoad, 0, lineOf('road-glow', 'transportation', 0,
    { 'line-color': P.main, 'line-opacity': 0.5, 'line-blur': 7, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 17, 26] },
    { filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false], layout: { 'line-cap': 'round', ...nightOnly } }));
  // thick ink line along the coast, with a cyan bloom at night
  style.layers.splice(layerAt('water') + 1, 0,
    lineOf('water-edge', 'water', 0, { 'line-color': P.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3.4] }),
    lineOf('water-glow', 'water', 0, { 'line-color': P.coast, 'line-opacity': 0.55, 'line-blur': 5, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 14] }, { layout: nightOnly }));
  // an offset "print shadow" plate under every building: black ink by day, a misregistered magenta plate at night
  style.layers.splice(layerAt('building'), 0, { id: 'building-shadow', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
    paint: { 'fill-color': P.plate.color, 'fill-opacity': P.plate.opacity, 'fill-translate': P.plate.translate, 'fill-translate-anchor': 'viewport', 'fill-antialias': false } });
  // ink outline around each foot; at night the same outline is printed twice, cyan and magenta, slightly off register
  style.layers.splice(layerAt('building-3d') + 1, 0,
    lineOf('building-ink-plate', 'building', 13.5, { 'line-color': '#ff2fb2', 'line-translate': [2.5, 2], 'line-translate-anchor': 'viewport', 'line-width': ['interpolate', ['linear'], ['zoom'], 13.5, 0.5, 17, 1.8] }, { layout: nightOnly }),
    lineOf('building-ink', 'building', 13.5, { 'line-color': P.buildingEdge, 'line-width': ['interpolate', ['linear'], ['zoom'], 13.5, 0.5, 17, 1.8] }));
  return style;
}

/** Push the differences between two built styles onto the live map (colours fade over MapLibre's default transition). */
function restyle(prev, next) {
  const was = new Map(prev.layers.map((l) => [l.id, l]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const l of next.layers) {
    const old = was.get(l.id);
    if (!old || !map.getLayer(l.id)) continue;
    for (const [k, v] of Object.entries(l.paint || {})) if (!same(v, old.paint?.[k])) map.setPaintProperty(l.id, k, v);
    const vis = l.layout?.visibility ?? 'visible';
    if (vis !== (old.layout?.visibility ?? 'visible')) map.setLayoutProperty(l.id, 'visibility', vis);
  }
  map.setLight(next.light);
}

/** Stretchable caption box (map labels), drawn once per look and registered with the map. */
function addCaptionImages() {
  const make = (name, fill, stroke, shadow) => {
    const px = 2, S = 48 * px, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = 9 * px, m = 5 * px, sh = 3.5 * px;   // corner radius, margin, hard shadow offset
    const rr = (x) => { g.beginPath(); g.roundRect(m + x, m + x, S - 2 * m - sh, S - 2 * m - sh, r); };
    g.fillStyle = shadow; rr(sh); g.fill();
    g.fillStyle = fill; rr(0); g.fill();
    g.lineWidth = 3 * px; g.strokeStyle = stroke; g.lineJoin = 'round'; rr(0); g.stroke();
    const k = (v) => v * px;
    map.addImage(name, g.getImageData(0, 0, S, S), { pixelRatio: px, stretchX: [[k(19), k(29)]], stretchY: [[k(19), k(29)]], content: [k(12), k(10), k(34), k(31)] });
  };
  make('caption', '#ffe45e', INK, INK); make('caption-sel', '#ff4fa3', INK, INK);
  make('caption-night', '#21125a', '#35e6ff', '#ff2fb2'); make('caption-sel-night', '#ff2fb2', '#35e6ff', '#07041a');
}

/* ---------- geometry helpers ---------- */

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function centroid(poly) {
  const ring = poly[0];
  return { lng: ring.reduce((s, c) => s + c[0], 0) / ring.length, lat: ring.reduce((s, c) => s + c[1], 0) / ring.length };
}

// Push a polygon's walls outward by `m` metres so highlight walls don't z-fight the base building
function inflate(poly, m) {
  return poly.map((ring, idx) => {
    const lat0 = ring[0][1], kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 111320;
    const pts = ring.slice(0, -1).map(([x, y]) => [x * kx, y * ky]);
    const n = pts.length;
    if (n < 3) return ring;
    const area = pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * p[1]), 0);
    const dir = (idx === 0 ? 1 : -1) * (area > 0 ? 1 : -1);   // +1: normal points outward of the solid
    const out = pts.map((p, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
      const nx = (e1[1] / l1 + e2[1] / l2), ny = -(e1[0] / l1 + e2[0] / l2);   // right-hand normals summed
      const nl = Math.hypot(nx, ny) || 1;
      return [(p[0] + (dir * m * nx) / nl) / kx, (p[1] + (dir * m * ny) / nl) / ky];
    });
    out.push(out[0]);
    return out;
  });
}

function findFootprints(place, buildings) {
  if (has3D(place.id)) return [];     // the 3D model stands in for the building
  if (place.curated && NO_FOOTPRINT.has(place.kind)) return [];
  const hits = new Map();
  for (const f of buildings) {
    for (const poly of polysOf(f.geometry)) {
      const hit = contains(poly[0], [place.lng, place.lat]) && !poly.slice(1).some((hole) => contains(hole, [place.lng, place.lat]));
      const near = place.radius > 0 && haversine(place, centroid(poly)) <= place.radius;
      if (hit || near) hits.set(JSON.stringify(poly[0][0]) + f.properties.render_height, { type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates: inflate(poly, 0.7) } });
    }
  }
  return [...hits.values()];
}

/* ---------- sources & layers ---------- */

const empty = () => ({ type: 'FeatureCollection', features: [] });

/** Real relief: AWS Terrarium elevation tiles drive 3D terrain, plus a hard-edged hillshade under the water and roads. */
function addTerrain() {
  const dem = { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: DEM_MAXZOOM,
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], attribution: 'Terrain: Mapzen, SRTM, EU-DEM' };
  map.addSource('dem', dem);
  map.addSource('dem-shade', dem);   // MapLibre renders better with separate sources for terrain and hillshade
  map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem-shade',
    paint: { 'hillshade-exaggeration': 0.7, 'hillshade-illumination-direction': 305, 'hillshade-illumination-anchor': 'viewport',
      'hillshade-shadow-color': '#6b4f8f', 'hillshade-highlight-color': '#fffbe8', 'hillshade-accent-color': '#b9965a' } }, 'waterway_tunnel');
  map.setTerrain({ source: 'dem', exaggeration: TERRAIN_EXAGGERATION });
}

function addLayers() {
  if (TERRAIN) addTerrain();
  addCaptionImages();
  const before = undefined;
  const src = (id) => map.addSource(id, { type: 'geojson', data: empty() });
  ['sel-buildings', 'route', 'walker', 'places', 'suggest'].forEach(src);

  map.addLayer({
    id: 'sel-buildings-3d', type: 'fill-extrusion', source: 'sel-buildings',
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-height': ['+', ['coalesce', ['get', 'render_height'], 18], 0.6],
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': false,
      'fill-extrusion-height-transition': { duration: 700 },
    },
  }, before);
  map.addLayer({ id: 'sel-buildings-ink', type: 'line', source: 'sel-buildings', layout: { 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 3] } }, before);

  map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-opacity': 0, 'line-blur': 9, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 16, 17, 34] } }, before);   // night only
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 8, 17, 16] } }, before);
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 9] } }, before);
  // dashed highlight down the middle, like a comic motion trail
  map.addLayer({ id: 'route-dash', type: 'line', source: 'route', layout: { 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 2.2], 'line-dasharray': [1.5, 2.5] } }, before);

  // every pin is a sticker: ink outline, white rim, flat colour
  const ink = (id, source, filter, radius, minzoom) => map.addLayer({ id, type: 'circle', source, ...(minzoom ? { minzoom } : {}), ...(filter ? { filter } : {}),
    paint: { 'circle-radius': radius, 'circle-color': INK, ...(minzoom ? { 'circle-pitch-alignment': 'map' } : {}) } });   // same alignment as the pin it sits under
  const poiFilter = ['all', ['!', ['get', 'curated']], ['!', ['get', 'selected']]];
  const radius = (a, b, c, d, e = 0) => ['interpolate', ['linear'], ['zoom'], a, b + e, c, d + e];   // outline = same ramp plus a margin
  ink('places-poi-ink', 'places', poiFilter, radius(14.4, 3.5, 17, 7, 2), 14.4);
  map.addLayer({ id: 'places-poi', type: 'circle', source: 'places', minzoom: 14.4, filter: poiFilter,
    paint: { 'circle-radius': radius(14.4, 3.5, 17, 7), 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'map' } });
  map.addLayer({ id: 'suggest-ring', type: 'circle', source: 'suggest',
    paint: { 'circle-radius': 16, 'circle-color': 'rgba(255,221,0,0.35)', 'circle-stroke-color': INK, 'circle-stroke-width': 3 } });
  const mainFilter = ['all', ['get', 'curated'], ['!', ['get', 'selected']]];
  ink('places-main-ink', 'places', mainFilter, radius(12, 5, 16, 9, 4.5));
  map.setPaintProperty('places-main-ink', 'circle-opacity', POP_IN);
  // soft neon halo under the big pins (night only), fading with the pins' 3D hand-over
  map.addLayer({ id: 'places-glow', type: 'circle', source: 'places', filter: ['any', ['get', 'curated'], ['get', 'selected']],
    paint: { 'circle-radius': radius(12, 13, 16, 24), 'circle-color': ['get', 'color'], 'circle-blur': 1, 'circle-opacity': 0 } }, 'places-main-ink');
  map.addLayer({ id: 'places-main', type: 'circle', source: 'places', filter: mainFilter,
    paint: {
      'circle-radius': radius(12, 5, 16, 9),
      'circle-opacity': POP_IN, 'circle-stroke-opacity': POP_IN,
      'circle-color': ['get', 'color'], 'circle-stroke-color': ['case', ['get', 'm3d'], '#ffd400', '#ffffff'], 'circle-stroke-width': ['case', ['get', 'm3d'], 3.5, 2.5],
    } });
  ink('places-selected-ink', 'places', ['get', 'selected'], radius(12, 11, 16, 15, 4.5));
  map.addLayer({ id: 'places-selected', type: 'circle', source: 'places', filter: ['get', 'selected'],
    paint: { 'circle-radius': radius(12, 11, 16, 15), 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
  map.addLayer({ id: 'stop-number', type: 'symbol', source: 'places', filter: ['get', 'selected'],
    layout: { 'text-field': ['to-string', ['get', 'order']], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': INK, 'text-halo-width': 1.2 } });
  map.addLayer({ id: 'places-label', type: 'symbol', source: 'places', minzoom: 13,
    filter: ['any', ['get', 'selected'], ['get', 'famous']],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5, 'text-anchor': 'top', 'text-offset': [0, 1.5], 'text-max-width': 8, 'text-optional': true,
      'icon-image': ['case', ['get', 'selected'], 'caption-sel', 'caption'], 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 5, 3, 5] },
    paint: { 'text-color': ['case', ['get', 'selected'], '#ffffff', INK] } });
  map.addLayer({ id: 'walker-dot', type: 'circle', source: 'walker',
    paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': INK, 'circle-stroke-width': 4 } });
  applyOwn();
}

/** Recolour our own layers (pins, route, labels) for the current theme. */
function applyOwn() {
  const P = T, paint = (id, k, v) => map.setPaintProperty(id, k, v);
  for (const id of ['places-poi-ink', 'places-main-ink', 'places-selected-ink']) paint(id, 'circle-color', P.ink);
  const glowOpacity = ['interpolate', ['linear'], ['zoom'], 14.5, P.pinGlow, 15, ['case', ['get', 'm3d'], 0, P.pinGlow]];
  paint('places-glow', 'circle-opacity', P.pinGlow ? glowOpacity : 0);
  paint('route-glow', 'line-opacity', P.routeGlow);
  paint('route-casing', 'line-color', P.routeCasing);
  paint('sel-buildings-ink', 'line-color', P.selEdge);
  paint('stop-number', 'text-halo-color', P.ink);
  paint('walker-dot', 'circle-stroke-color', P.walker);
  paint('suggest-ring', 'circle-stroke-color', P.suggestEdge); paint('suggest-ring', 'circle-color', P.suggestFill);
  paint('places-label', 'text-color', ['case', ['get', 'selected'], '#ffffff', P.labelText]);
  map.setLayoutProperty('places-label', 'icon-image', ['case', ['get', 'selected'], P.captionSel, P.caption]);
}

/* ---------- public API ---------- */

export function createMap(container, h, data) {
  handlers = h;
  return fetch(STYLE_URL).then((r) => r.json()).then((style) => new Promise((resolve) => {
    rawStyle = style;
    T = THEMES[document.documentElement.dataset.theme === 'night' ? 'night' : 'day'];
    appliedStyle = funStyle(structuredClone(rawStyle), T);
    map = new maplibregl.Map({
      container, style: funStyle(structuredClone(rawStyle), T), center: [19.05, 47.47], zoom: 11.6, pitch: 0, bearing: 0,
      maxBounds: BOUNDS, minZoom: 11.5, maxPitch: 75, attributionControl: { compact: true },
      // MapLibre 4.7 loses the camera's look-at elevation on flyTo/easeTo, so the target would sit under the hills it is meant to show.
      // Re-assert it from the DEM on every camera update.
      ...(TERRAIN ? { transformCameraUpdate: (tr) => ({ elevation: map?.terrain ? map.terrain.getElevationForLngLatZoom(tr.center, Math.min(tr.tileZoom, DEM_MAXZOOM)) : 0 }) } : {}),
    });
    window.budapestMap = map;   // handy for poking at the camera from the console
    map.on('error', (e) => console.error('map error:', e.error?.message || e.error));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      addLayers();
      wireEvents();
      loadLandmarks(data.all);
      map.flyTo({ ...HOME, duration: 3200, essential: true });   // intro swoop
      resolve();
    });
  }));
}

function wireEvents() {
  const hoverable = ['places-main', 'places-selected', 'places-poi', 'building-3d', 'sel-buildings-3d'];
  hoverable.forEach((id) => {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  });
  map.on('click', (e) => {
    const pad = 6;
    const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
    const hit = map.queryRenderedFeatures(box, { layers: ['places-selected', 'places-main', 'places-poi'] })[0];
    if (hit) return handlers.onPlace(hit.properties.id);
    const model = landmarks?.hit(e.point);
    if (model) return handlers.onPlace(model);
    const b = map.queryRenderedFeatures(e.point, { layers: ['sel-buildings-3d', 'building-3d'] })[0];
    if (b) return handlers.onBuilding({ lngLat: e.lngLat, feature: b });
    handlers.onEmpty();
  });
  map.on('mousemove', (e) => { if (landmarks?.hit(e.point)) map.getCanvas().style.cursor = 'pointer'; });
  map.on('idle', refreshHighlights);
}

async function loadLandmarks(all) {
  try {
    const { createLandmarkLayer } = await import('./models3d.js');
    landmarks = createLandmarkLayer(map, all.filter((p) => has3D(p.id)), T.night);
    window.budapestLandmarks = landmarks;   // handy for poking at from the console
    map.addLayer(landmarks.layer, 'suggest-ring');
    for (const id of ['building-3d', 'building']) baseFilters[id] = map.getFilter(id) || null;
    applyHoles();
  } catch (err) { console.error('3D landmarks unavailable:', err); }
}

// Remove the real buildings under each model so the two never fight
function applyHoles() {
  if (!landmarks) return;
  const on = landmarks.isEnabled();
  const holes = on ? landmarks.footprints().map((f) => ['>', ['distance', f.line ? { type: 'LineString', coordinates: f.line } : { type: 'Point', coordinates: [f.lng, f.lat] }], f.r]) : [];
  for (const id of ['building-3d', 'building']) {
    const conds = [baseFilters[id], ...holes].filter(Boolean);
    map.setFilter(id, conds.length > 1 ? ['all', ...conds] : conds[0] || null);
  }
  const pop = on ? POP_IN : 1;
  map.setPaintProperty('places-main', 'circle-opacity', pop); map.setPaintProperty('places-main', 'circle-stroke-opacity', pop);
  map.setPaintProperty('places-main-ink', 'circle-opacity', pop);
}

/** Switch between the newsprint day look and the neon night look. */
export function setNight(on) {
  const next = THEMES[on ? 'night' : 'day'];
  if (!map || next === T) return;
  T = next;
  const built = funStyle(structuredClone(rawStyle), T);
  restyle(appliedStyle, built);
  appliedStyle = built;
  applyOwn();
  landmarks?.setNight(on);
}

export function setLandmarks3D(on) { landmarks?.setEnabled(on); applyHoles(); return landmarks?.isEnabled() ?? false; }
export const landmarks3DOn = () => landmarks?.isEnabled() ?? true;

export function render({ places, stops, filters, byId }) {
  const order = new Map(stops.map((id, i) => [id, i + 1]));
  const suggested = new Set(suggestIds);
  const features = [];
  for (const p of places) {
    const selected = order.has(p.id);
    if (!selected && !suggested.has(p.id) && !filters[p.category]) continue;
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, category: p.category, color: CATS[p.category].color, curated: !!p.curated, famous: !!p.famous, m3d: has3D(p.id), selected, order: order.get(p.id) || 0 },
    });
  }
  map.getSource('places')?.setData({ type: 'FeatureCollection', features });
  selectedPlaces = stops.map((id) => byId[id]).filter(Boolean).map((place) => ({ place, color: CATS[place.category].color }));
  refreshHighlights();
}

export function setSuggestions(list) {
  suggestIds = list.map((p) => p.id);
  map.getSource('suggest')?.setData({ type: 'FeatureCollection', features: list.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} })) });
  cancelAnimationFrame(pulseRaf);
  if (!list.length) return;
  const loop = (t) => {
    const k = (Math.sin(t / 320) + 1) / 2;
    map.setPaintProperty('suggest-ring', 'circle-radius', 15 + k * 5);
    map.setPaintProperty('suggest-ring', 'circle-stroke-opacity', 0.45 + k * 0.55);
    pulseRaf = requestAnimationFrame(loop);
  };
  pulseRaf = requestAnimationFrame(loop);
}

export function setFocusBuilding(feature) {
  focusFeature = feature;
  refreshHighlights();
}

function refreshHighlights() {
  if (!map?.getSource('sel-buildings')) return;
  const pending = selectedPlaces.filter(({ place }) => (footprints.get(place.id)?.features.length ?? 0) === 0 && (footprints.get(place.id)?.tries ?? 0) < 4);
  if (pending.length && map.getZoom() >= 14.3) {
    const buildings = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
    for (const { place } of pending) {
      const entry = footprints.get(place.id) || { features: [], tries: 0 };
      const near = map.getBounds().contains([place.lng, place.lat]);
      if (near) { entry.features = findFootprints(place, buildings); entry.tries += 1; }
      footprints.set(place.id, entry);
    }
  }
  const features = [];
  for (const { place, color } of selectedPlaces) {
    for (const f of footprints.get(place.id)?.features || []) features.push({ ...f, properties: { ...f.properties, color } });
  }
  if (focusFeature) features.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: polysOf(focusFeature.geometry).map((p) => inflate(p, 0.7)) }, properties: { ...focusFeature.properties, color: FOCUS_COLOR } });
  map.getSource('sel-buildings').setData({ type: 'FeatureCollection', features });
}

/* ---------- camera ---------- */

const mobile = () => window.matchMedia('(max-width: 760px)').matches;
const padding = () => ({ top: 60, left: 50, right: 50, bottom: mobile() ? 190 : 110 });

export function flyToPlace(p) {
  map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16.2), pitch: 62, bearing: map.getBearing() + 12, duration: 1900, essential: true, padding: padding() });
}

export function fitStops(list) {
  if (!list.length) return;
  if (list.length === 1) return flyToPlace(list[0]);
  const b = new maplibregl.LngLatBounds();
  list.forEach((p) => b.extend([p.lng, p.lat]));
  map.fitBounds(b, { padding: padding(), pitch: 52, bearing: -18, maxZoom: 16, duration: 2200, essential: true });
}

export function goHome() { map.flyTo({ ...HOME, duration: 2200, essential: true }); }

/* ---------- animated route ---------- */

export function showRoute(coords, color, animate = true) {
  const token = ++routeToken;
  const line = (cs) => map.getSource('route').setData({ type: 'FeatureCollection', features: cs.length > 1 ? [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: cs } }] : [] });
  const walker = (c) => map.getSource('walker').setData({ type: 'FeatureCollection', features: c ? [{ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: c } }] : [] });
  if (coords.length < 2) { line([]); walker(null); return; }
  if (!animate) { line(coords); walker(null); return; }

  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] }));
  const total = cum[cum.length - 1] || 1;
  const duration = Math.min(4200, Math.max(1400, total * 1.1));
  const t0 = performance.now();
  const frame = (now) => {
    if (token !== routeToken) return;
    const f = Math.min(1, (now - t0) / duration);
    const eased = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    const d = eased * total;
    let i = cum.findIndex((c) => c >= d);
    if (i < 1) i = 1;
    const seg = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    const tip = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * seg, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * seg];
    line([...coords.slice(0, i), tip]);
    walker(f < 1 ? tip : null);
    if (f < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
