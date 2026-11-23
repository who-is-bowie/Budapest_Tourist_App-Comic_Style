import { loadData, inArea } from './data/places.js';
import { state, set, subscribe } from './state/store.js';
import { has3D } from './model3d/registry.js';
import { createMap, render as renderMap, flyToPlace, fitStops, showRoute, setSuggestions, setFocusBuilding, goHome, setLandmarks3D, setNight } from './map/mapView.js';
import { walkLeg } from './routing/walk.js';
import { suggest } from './suggest/suggest.js';
import { createMenu } from './ui/menu.js';
import { renderCard } from './ui/card.js';
import { setPhotos } from './ui/art.js';
import { haversine, haptic } from './util.js';
import { createSheet } from './ui/sheet.js';

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
  const toast = (msg, { undo } = {}) => {
    toastEl.replaceChildren(msg);
    toastEl.classList.toggle('has-action', !!undo);
    if (undo) {
      const b = document.createElement('button');
      b.textContent = 'Undo';
      b.addEventListener('click', () => { undo(); toastEl.hidden = true; haptic(); });
      toastEl.append(b);
    }
    toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, undo ? 5000 : 3200);
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

    /** remove from the tour with a way back */
    removeStop(id) {
      const at = state.stops.indexOf(id);
      if (at < 0) return;
      set({ stops: state.stops.filter((s) => s !== id), preset: null });
      haptic();
      toast(`Removed ${byId[id].name}`, { undo: () => { if (!state.stops.includes(id)) { const next = [...state.stops]; next.splice(Math.min(at, next.length), 0, id); set({ stops: next, preset: null }); } } });
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
    const open = !!anchor;
    if (!open && chrome.cardVisible()) { chrome.closeCard().then(() => { if (!state.focus && !state.anchor) renderCard(cardEl, {}, actions); }); return; }
    renderCard(cardEl, { place, anchor: state.anchor, suggestions, inTour: place ? state.stops.includes(place.id) : false },
      { ...actions, closeCard: actions.closeCard });
    if (open) chrome.openCard();
  }

  /** which menu panes a state change touches (the list is the expensive one: ~120 rows) */
  function menuParts(keys) {
    const parts = new Set();
    for (const k of keys) {
      if (k === 'query' || k === 'filters') parts.add('list');
      else if (k === 'stops') { parts.add('list'); parts.add('tour'); parts.add('routes'); }
      else if (k === 'preset') parts.add('routes');
      else if (k === 'legs') parts.add('tour');
      else if (!['tab', 'focus', 'anchor'].includes(k)) return 'all';
    }
    return parts;
  }

  subscribe((patch) => {
    const keys = Object.keys(patch);
    const stopsChanged = keys.includes('stops');
    menu.render(menuParts(keys));
    if (keys.every((k) => k === 'legs')) return;
    if (keys.some((k) => ['stops', 'filters', 'focus', 'anchor'].includes(k))) refreshCard();
    if (stopsChanged) updateRoute(true);
  });

  const chrome = setupChrome(actions);
  menu.render();
  refreshCard();
  updateRoute(false);

  // deep link: ?view=parliament opens that landmark's 3D model
  const deep = new URLSearchParams(location.search).get('view');
  if (deep) actions.open3D(deep);
}

/* ---------- small UX helpers ---------- */

function setupChrome(actions) {
  const $ = (id) => document.getElementById(id);
  const menu = $('menu'), handle = $('sheet-handle'), tabs = $('tabs'), card = $('card'), search = $('search');
  const phone = window.matchMedia('(max-width: 760px)');
  const PEEK = 100;                       // px of sheet showing above the tab bar when peeking
  const order = ['peek', 'half', 'full'];
  const root = document.documentElement;
  let lastMenu = 'half', cardIsOpen = false, quiet = false;

  // on a phone the tab bar is the app's bottom bar, outside the sheet (which is transformed); on desktop it sits in the sidebar
  const placeTabs = () => { if (phone.matches) document.body.append(tabs); else menu.insertBefore(tabs, menu.querySelector('.search-wrap')); };

  /** tell the map how much of its bottom edge is covered, so flights frame places in the visible part */
  const setInset = (visible) => {
    const inset = phone.matches ? Math.round(Math.min(visible, innerHeight * 0.5) + tabs.offsetHeight) : 0;
    window.sheetInset = inset; root.style.setProperty('--inset', `${inset}px`);
  };

  const menuSnaps = () => {
    const H = menu.offsetHeight, room = H - tabs.offsetHeight;
    return { full: 0, half: Math.max(0, room - Math.round(innerHeight * 0.46)), peek: Math.max(0, room - PEEK), hidden: H + 8 };
  };
  const menuSheet = createSheet(menu, {
    snaps: menuSnaps, stops: order.slice().reverse(), initial: 'half', grab: '#sheet-handle, .search-wrap, header', active: () => phone.matches,
    onSettle(name, pts) {
      menu.setAttribute('aria-expanded', name !== 'peek'); handle.setAttribute('aria-expanded', name !== 'peek');
      if (name === 'hidden') return;
      lastMenu = name; if (!cardIsOpen) setInset(menu.offsetHeight - tabs.offsetHeight - pts[name]);
      if (name === 'peek') search.blur();
    },
  });

  const cardSnaps = () => { const H = card.offsetHeight; return { full: 0, mid: Math.max(0, H - Math.round(innerHeight * 0.44)), closed: H + 8 }; };
  const cardSheet = createSheet(card, {
    snaps: cardSnaps, stops: ['full', 'mid', 'closed'], initial: 'closed', grab: '.grab', active: () => phone.matches,
    onSettle(name, pts) {
      if (quiet) return;
      if (name === 'closed') { if (cardIsOpen) { cardIsOpen = false; menuSheet.go(lastMenu); actions.closeCard(); } return; }
      setInset(card.offsetHeight - pts[name]); haptic(5);
    },
  });

  const api = {
    cardVisible: () => phone.matches && !card.hidden,
    openCard() {
      if (!phone.matches) return;
      if (!cardIsOpen) {
        cardIsOpen = true; quiet = true; cardSheet.jump('closed'); quiet = false;
        void card.offsetHeight; menuSheet.go('hidden'); cardSheet.go('mid');
      }
      card.scrollTop = 0;
    },
    closeCard() {
      // already sliding away (dragged down): just wait for it to finish before the card is emptied
      if (!cardIsOpen) return new Promise((res) => setTimeout(res, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 440));
      cardIsOpen = false; menuSheet.go(lastMenu);
      return cardSheet.to('closed');
    },
  };

  const layout = () => {
    placeTabs();
    if (phone.matches) {
      quiet = true;
      menuSheet.refit();
      if (cardIsOpen) cardSheet.refit(); else cardSheet.jump('closed');
      quiet = false;
      if (cardIsOpen) menuSheet.jump('hidden');
      else if ((state.focus || state.anchor) && !card.hidden) api.openCard();   // came back to a phone width with a place still selected
    } else {
      menu.style.transform = ''; menu.style.transition = ''; card.style.transform = ''; card.style.transition = '';
      cardIsOpen = false; menuSheet.jump(lastMenu); setInset(0);
    }
  };
  placeTabs();
  if (phone.matches) { menuSheet.jump('half'); }
  phone.addEventListener('change', () => { layout(); window.budapestMap?.resize(); });
  window.addEventListener('resize', () => { if (phone.matches) layout(); });

  handle.addEventListener('click', () => menuSheet.go(order[(order.indexOf(menuSheet.name) + 1) % order.length]));
  // choosing a tab brings the sheet up to a useful height, and leaves any open place card behind
  tabs.addEventListener('click', () => {
    if (!phone.matches) return;
    haptic(6);
    if (state.focus || state.anchor) actions.closeCard();
    if (menuSheet.name === 'peek' || menuSheet.name === 'hidden') menuSheet.go('half');
  });
  search.addEventListener('focus', () => { if (phone.matches && menuSheet.name !== 'full') menuSheet.go('full'); });

  $('recenter').addEventListener('click', goHome);
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

  return api;
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
