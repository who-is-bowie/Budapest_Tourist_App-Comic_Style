import { loadData, inArea } from './data/places.js';
import { state, set, subscribe } from './state/store.js';
import { has3D } from './model3d/registry.js';
import { createMap, render as renderMap, flyToPlace, fitStops, showRoute, setSuggestions, setFocusBuilding, goHome, setLandmarks3D, setNight } from './map/mapView.js';
import { walkLeg } from './routing/walk.js';
import { suggest } from './suggest/suggest.js';
import { createMenu } from './ui/menu.js';
import { renderCard } from './ui/card.js';
import { setPhotos } from './ui/art.js';
import { haversine } from './util.js';

const DEFAULT_ROUTE_COLOR = '#1f6feb';

async function start() {
  const data = await loadData();
  const { all, byId, presets } = data;
  setPhotos(data.photos);
  // Drop saved stops that are no longer inside the visible districts
  if (state.stops.some((id) => !byId[id])) set({ stops: state.stops.filter((id) => byId[id]), preset: null });
  const cardEl = document.getElementById('card');
  const toastEl = document.getElementById('toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  };

  /* ---------- actions ---------- */
  const actions = {
    setTab: (tab) => set({ tab }),
    setQuery: (query) => set({ query }),
    toggleFilter: (cat) => set({ filters: { ...state.filters, [cat]: !state.filters[cat] } }),

    toggleStop(id, { fly = false, keepFocus = false } = {}) {
      const has = state.stops.includes(id);
      set({ stops: has ? state.stops.filter((s) => s !== id) : [...state.stops, id], preset: null,
        focus: keepFocus || !has ? state.focus || id : state.focus });
      if (!has && fly) { set({ focus: id, anchor: null }); flyToPlace(byId[id]); }
      if (!has) toast(`Added ${byId[id].name}`);
    },

    focus(id, { fly = false } = {}) {
      set({ focus: id, anchor: null });
      setFocusBuilding(null);
      if (fly) flyToPlace(byId[id]);
    },

    closeCard: () => { set({ focus: null, anchor: null }); setFocusBuilding(null); },

    // Three.js is only fetched the first time a 3D model is opened
    async open3D(id) {
      if (!has3D(id) || !byId[id]) return;
      try {
        viewer ||= (await import('./model3d/viewer.js')).createViewer({ byId, state, subscribe, actions });
        viewer.open(id);
      } catch (err) {
        console.error(err);
        toast('Could not load the 3D view. Check your connection and try again.');
      }
    },

    move(from, to) {
      const stops = [...state.stops];
      stops.splice(to, 0, stops.splice(from, 1)[0]);
      set({ stops, preset: null });
    },

    clear: () => { set({ stops: [], preset: null, focus: null, anchor: null }); setFocusBuilding(null); },

    fit: () => fitStops(state.stops.map((id) => byId[id])),

    loadPreset(id) {
      const preset = presets.find((r) => r.id === id);
      set({ stops: [...preset.stops], preset: id, focus: null, anchor: null });
      setFocusBuilding(null);
      fitStops(preset.stops.map((s) => byId[s]));
      toast(`${preset.name}: ${preset.stops.length} stops`);
    },
  };

  let viewer = null;
  const menu = createMenu(data, actions);

  /* ---------- map ---------- */
  await createMap('map', {
    onPlace: (id) => { set({ focus: id, anchor: null }); setFocusBuilding(null); flyToPlace(byId[id]); },
    onBuilding({ lngLat, feature }) {
      if (!inArea(data.area, { lng: lngLat.lng, lat: lngLat.lat })) return actions.closeCard();
      // A tapped building near a known place is that place; otherwise offer nearby stops
      const here = { lat: lngLat.lat, lng: lngLat.lng };
      const near = all.filter((p) => haversine(p, here) < 45).sort((a, b) => haversine(a, here) - haversine(b, here))[0];
      if (near) { set({ focus: near.id, anchor: null }); setFocusBuilding(null); return; }
      setFocusBuilding(feature);
      set({ focus: null, anchor: { ...here, category: 'landmark', name: feature.properties.name || 'Not a listed place yet' } });
    },
    onEmpty: () => actions.closeCard(),
  }, data);

  /* ---------- derived: map + card + route ---------- */
  let routeToken = 0;
  async function updateRoute(animate) {
    const token = ++routeToken;
    const stops = state.stops.map((id) => byId[id]).filter(Boolean);
    if (stops.length < 2) { set({ legs: [] }); showRoute([], DEFAULT_ROUTE_COLOR, false); return; }
    const legs = await Promise.all(stops.slice(1).map((p, i) => walkLeg(stops[i], p)));
    if (token !== routeToken) return;
    const color = presets.find((r) => r.id === state.preset)?.color || DEFAULT_ROUTE_COLOR;
    set({ legs });
    showRoute(legs.flatMap((l, i) => (i ? l.coords.slice(1) : l.coords)), color, animate);
    if (legs.some((l) => l.approx)) toast('Walking router unreachable: using estimates');
  }

  function refreshMap() { renderMap({ places: all, stops: state.stops, filters: state.filters, byId }); }

  function refreshCard() {
    const place = state.focus ? byId[state.focus] : null;
    const anchor = place || state.anchor;
    const suggestions = anchor ? suggest(anchor, all, state.stops, { exclude: place?.id }) : [];
    setSuggestions(suggestions.map((s) => s.place));
    refreshMap();
    renderCard(cardEl, { place, anchor: state.anchor, suggestions, inTour: place ? state.stops.includes(place.id) : false },
      { ...actions, closeCard: actions.closeCard });
  }

  subscribe((patch) => {
    const keys = Object.keys(patch);
    const stopsChanged = keys.includes('stops');
    menu.render(keys.every((k) => k === 'legs') ? 'tour' : keys.every((k) => k === 'tab') ? 'none' : 'all');
    if (keys.every((k) => k === 'legs')) return;
    if (keys.some((k) => ['stops', 'filters', 'focus', 'anchor'].includes(k))) refreshCard();
    if (stopsChanged) updateRoute(true);
  });

  menu.render();
  refreshCard();
  updateRoute(false);
  setupChrome(actions);

  // deep link: ?view=parliament opens that landmark's 3D model
  const deep = new URLSearchParams(location.search).get('view');
  if (deep) actions.open3D(deep);
}

/* ---------- small UX helpers ---------- */

function setupChrome(actions) {
  const menu = document.getElementById('menu'), handle = document.getElementById('sheet-handle');
  const phone = window.matchMedia('(max-width: 760px)');
  const order = ['peek', 'half', 'full'];
  const setSheet = (name) => {
    menu.dataset.sheet = name;
    handle.setAttribute('aria-expanded', name !== 'peek');
    const settle = () => window.budapestMap?.resize();
    menu.addEventListener('transitionend', settle, { once: true }); setTimeout(settle, 450);
  };
  setSheet('half');
  handle.addEventListener('click', () => setSheet(order[(order.indexOf(menu.dataset.sheet) + 1) % order.length]));
  // choosing a tab or opening a place on a phone brings the sheet to a sensible height
  document.getElementById('tabs').addEventListener('click', () => { if (phone.matches && menu.dataset.sheet === 'peek') setSheet('half'); });
  subscribe((patch) => { if (phone.matches && ('focus' in patch) && state.focus && menu.dataset.sheet === 'full') setSheet('half'); });

  document.getElementById('recenter').addEventListener('click', goHome);
  const t3d = document.getElementById('toggle3d');
  t3d.addEventListener('click', () => {
    const on = setLandmarks3D(t3d.getAttribute('aria-pressed') !== 'true');
    t3d.setAttribute('aria-pressed', on); t3d.classList.toggle('off', !on);
  });

  setupNight();

  const hint = document.getElementById('hint'), KEY = 'budapest-tour-hint';
  let seen = false; try { seen = !!localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (!seen) {
    hint.hidden = false;
    const hide = () => { hint.hidden = true; try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
    document.getElementById('hint-close').addEventListener('click', hide);
    setTimeout(hide, 14000);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('viewer').hidden && !document.getElementById('card').hidden) actions.closeCard();
  });
}

/** Night mode: a neon after-dark take on the comic look. The saved choice is applied before first paint by a script in index.html. */
function setupNight() {
  const btn = document.getElementById('night'), zap = document.getElementById('zap'), KEY = 'budapest-tour-night';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let zapTimer;
  const sync = (on) => {
    btn.setAttribute('aria-pressed', on); btn.textContent = on ? '☀️' : '🌙';
    const label = on ? 'Switch to day mode' : 'Switch to night mode';
    btn.setAttribute('aria-label', label); btn.title = on ? 'Day mode' : 'Night mode';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#150a3b' : '#ffe45e');
  };
  sync(document.documentElement.dataset.theme === 'night');
  btn.addEventListener('click', () => {
    const on = document.documentElement.dataset.theme !== 'night';
    document.documentElement.dataset.theme = on ? 'night' : 'day';
    sync(on); setNight(on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    if (calm.matches) return;
    // a lettered sound effect and a halftone wipe, stepped like a comic panel change
    zap.firstElementChild.textContent = on ? 'ZAP!' : 'BAM!';
    zap.hidden = false; zap.classList.remove('go'); void zap.offsetWidth; zap.classList.add('go');
    clearTimeout(zapTimer); zapTimer = setTimeout(() => { zap.hidden = true; }, 900);
  });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('toast').hidden = false;
  document.getElementById('toast').textContent = 'Could not start the app. See the console.';
});
