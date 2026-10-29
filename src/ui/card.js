import { CATS } from '../data/places.js';
import { el, fmtDist, fmtMin } from '../util.js';
import { has3D } from '../model3d/registry.js';
import { sticker, rating, photoOf, photoAt } from './art.js';

/** Landmark photo as a printed comic panel, credited to Wikipedia. */
function hero(place) {
  const ph = photoOf(place.id);
  if (!ph) return null;
  const img = el('img', { src: photoAt(ph.src, 500), alt: `${place.name}`, decoding: 'async', referrerpolicy: 'no-referrer' });
  const fig = el('figure', { class: 'hero', style: `--c:${CATS[place.category].color}` }, img,
    el('figcaption', {}, el('a', { href: ph.page, target: '_blank', rel: 'noopener' }, 'Photo: Wikipedia ↗')));
  img.addEventListener('error', () => fig.remove());
  return fig;
}

/**
 * Floating info card. `place` is set when a known place is focused; otherwise `anchor`
 * describes a bare building the user tapped. `suggestions` is [{ place, distance }].
 */
export function renderCard(root, { place, anchor, suggestions, inTour }, actions) {
  if (!place && !anchor) { root.hidden = true; root.replaceChildren(); return; }
  root.hidden = false;

  const head = place
    ? [hero(place),
      el('div', { class: 'card-head', style: `--c:${CATS[place.category].color}` },
        sticker(place, { size: '54px', photo: false }),
        el('div', {}, el('h2', {}, place.name),
          el('div', { class: 'kind' }, [place.kind || CATS[place.category].label, place.side].filter(Boolean).join(' · ')),
          rating(place))),
      place.address ? el('div', { class: 'addr' }, place.address) : null,
      place.blurb ? el('p', {}, place.blurb) : place.hours ? el('p', {}, `Hours: ${place.hours}`) : null,
      el('div', { class: 'actions' },
        el('button', { class: `btn${inTour ? ' ghost' : ''}`, onclick: () => actions.toggleStop(place.id) }, inTour ? 'Remove from tour' : 'Add to tour'),
        has3D(place.id) ? el('button', { class: 'btn btn3d', onclick: () => actions.open3D(place.id) }, el('i', {}, '3D'), 'View model') : null,
        el('small', {}, `~${fmtMin(place.duration || 30)} visit`))]
    : [el('h2', {}, 'This building'), el('div', { class: 'kind' }, anchor.name || 'Not a listed place yet'),
      el('p', {}, 'Here are good stops nearby.')];

  const sugg = suggestions.length
    ? [el('h4', {}, place ? 'Nearby stops' : 'Around here'),
      ...suggestions.map(({ place: s, distance }) => el('div', { class: 'sugg', style: `--c:${CATS[s.category].color}` },
        sticker(s, { size: '38px' }),
        el('div', { class: 't', onclick: () => actions.focus(s.id, { fly: true }) }, el('b', {}, s.name),
          el('span', { class: 'meta' }, el('small', {}, `${s.kind || CATS[s.category].label} · ${fmtDist(distance)} away`), rating(s))),
        el('button', { class: 'go', 'aria-label': `Add ${s.name} to tour`, onclick: () => actions.toggleStop(s.id, { keepFocus: true }) }, 'Add')))]
    : [];

  root.replaceChildren(el('button', { class: 'close', 'aria-label': 'Close', onclick: actions.closeCard }, '×'), ...head.filter(Boolean), ...sugg);
}
