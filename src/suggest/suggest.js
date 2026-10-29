import { haversine } from '../util.js';

const RADIUS = 400;
// What tends to go well after what, as a nudge for variety
const FOLLOWS = { landmark: ['cafe', 'restaurant'], restaurant: ['bar', 'cafe', 'landmark'], bar: ['restaurant', 'landmark'], cafe: ['landmark', 'shop'], shop: ['cafe', 'landmark'] };

/** Up to `limit` places near `anchor` that aren't already in the tour. */
export function suggest(anchor, places, stopIds, { limit = 5, exclude = null } = {}) {
  const chosen = places.filter((p) => stopIds.includes(p.id));
  const have = new Set(chosen.map((p) => p.category));
  const next = FOLLOWS[anchor.category] || [];
  return places
    .filter((p) => p.id !== exclude && !stopIds.includes(p.id))
    .map((p) => {
      const d = haversine(anchor, p);
      if (d > RADIUS) return null;
      let score = 1 - d / RADIUS;
      if (p.famous) score += 0.9;
      else if (p.curated) score += 0.4;
      if (!have.has(p.category)) score += 0.5;
      const rank = next.indexOf(p.category);
      if (rank >= 0) score += 0.4 - rank * 0.1;
      if (p.hours || p.address) score += 0.1;
      return { place: p, distance: d, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
