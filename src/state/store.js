const KEY = 'budapest-tour-v1';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved?.stops) ? saved : {};
  } catch { return {}; }
}

const saved = load();

export const state = {
  stops: saved.stops || [],          // ordered place ids
  preset: saved.preset || null,      // active preset id
  filters: { landmark: true, restaurant: true, bar: true, cafe: true, shop: true },
  query: '',
  tab: 'explore',
  focus: null,                       // place id shown in the card
  anchor: null,                      // {lat, lng, label} when a bare building was tapped
  legs: [],                          // walking legs between stops: {distance, duration, coords}
};

const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function set(patch) {
  Object.assign(state, patch);
  if ('stops' in patch || 'preset' in patch) {
    try { localStorage.setItem(KEY, JSON.stringify({ stops: state.stops, preset: state.preset })); } catch { /* storage unavailable */ }
  }
  listeners.forEach((fn) => fn(patch));
}
