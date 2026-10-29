import { haversine } from '../util.js';

const ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const cache = new Map();

function estimate(a, b) {
  const distance = haversine(a, b) * 1.25;            // crow-flight to street detour factor
  return { distance, duration: distance / 1.35, coords: [[a.lng, a.lat], [b.lng, b.lat]], approx: true };
}

export function walkLeg(a, b) {
  const key = `${a.id}>${b.id}`;
  if (!cache.has(key)) cache.set(key, fetchLeg(a, b));
  return cache.get(key);
}

async function fetchLeg(a, b) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const url = `${ENDPOINT}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const route = (await res.json()).routes?.[0];
    if (!route) throw new Error('no route');
    return { distance: route.distance, duration: route.duration, coords: route.geometry.coordinates, approx: false };
  } catch {
    return estimate(a, b);
  }
}
