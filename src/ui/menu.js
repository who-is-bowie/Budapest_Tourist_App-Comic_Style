import { CATS } from '../data/places.js';
import { state } from '../state/store.js';
import { el, fmtDist, fmtMin } from '../util.js';
import { MODELS, MODEL_IDS, has3D } from '../model3d/registry.js';
import { sticker, rating, photoOf, photoAt, glyphEl } from './art.js';

const CAT_GLYPH = { landmark: 'landmark', restaurant: 'cloche', bar: 'cocktail', cafe: 'coffee', shop: 'bag' };
const $ = (id) => document.getElementById(id);

function directionsUrl(stops) {
  const pt = (p) => `${p.lat},${p.lng}`, use = stops.slice(0, 11);
  const q = new URLSearchParams({ api: '1', travelmode: 'walking', origin: pt(use[0]), destination: pt(use[use.length - 1]) });
  if (use.length > 2) q.set('waypoints', use.slice(1, -1).map(pt).join('|'));
  return `https://www.google.com/maps/dir/?${q}`;
}

export function createMenu(data, actions) {
  const { all, byId, presets } = data;

  // tabs
  document.querySelectorAll('i[data-g]').forEach((i) => i.replaceChildren(glyphEl(i.dataset.g)));
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => actions.setTab(b.dataset.tab)));
  $('search').addEventListener('input', (e) => actions.setQuery(e.target.value));
  $('search-clear').addEventListener('click', () => { $('search').value = ''; actions.setQuery(''); $('search').focus(); });

  // top sights: the landmarks that have a 3D model
  const sights = MODEL_IDS.filter((id) => byId[id]).map((id) => {
    const p = byId[id], m = MODELS[id], ph = photoOf(id);
    const pic = el('span', { class: 'pic' });
    if (ph) {
      const img = el('img', { src: photoAt(ph.src, 330), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      pic.append(img);
    }
    return el('button', { class: 'sight', style: `--c:${m.accent}`, 'aria-label': `${m.title}, open 3D model`, onclick: () => actions.open3D(id) },
      pic, el('span', { class: 'tag3d' }, '3D'), el('span', { class: 'cap' }, el('b', {}, m.title), el('small', {}, p.kind)));
  });
  $('sights').replaceChildren(...sights);
  if (!sights.length) $('sights-wrap').hidden = true;

  // category chips
  const chips = $('chips');
  for (const [key, cat] of Object.entries(CATS)) {
    const count = all.filter((p) => p.category === key).length;
    chips.append(el('button', { class: 'chip', 'data-cat': key, style: `--c:${cat.color}`, onclick: () => actions.toggleFilter(key) },
      glyphEl(CAT_GLYPH[key], 'glyph'), `${cat.label} `, el('small', {}, count)));
  }

  $('credit').hidden = !all.some((p) => p.rating);
  if (all.some((p) => p.demo)) $('credit').textContent = 'Sample ratings for previewing the layout: not real Google reviews';

  let dragFrom = null;

  function renderTabs() {
    document.querySelectorAll('#tabs button').forEach((b) => { const on = b.dataset.tab === state.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${state.tab}`));
    $('tour-count').textContent = state.stops.length; $('tour-count').dataset.n = state.stops.length;
    $('search-clear').hidden = !state.query;
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('on', state.filters[c.dataset.cat]));
  }

  function renderExplore() {
    const q = state.query.trim().toLowerCase();
    const list = all
      .filter((p) => state.filters[p.category] && (!q || p.name.toLowerCase().includes(q) || (p.kind || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.famous ? 2 : b.curated ? 1 : 0) - (a.famous ? 2 : a.curated ? 1 : 0) || a.name.localeCompare(b.name))
      .slice(0, 120);
    const ul = $('place-list');
    $('result-count').textContent = list.length ? (q ? `${list.length} result${list.length === 1 ? '' : 's'}` : 'Popular places first') : '';
    ul.replaceChildren(...(list.length ? list.map(row) : [el('li', { class: 'empty' }, glyphEl('binoculars', 'big'), 'Nothing matches.', el('br'), 'Try another word or turn a filter back on.')]));
  }

  function row(p) {
    const cat = CATS[p.category];
    const sel = state.stops.includes(p.id);
    return el('li', { class: `row${sel ? ' sel' : ''}`, style: `--c:${cat.color}`, onclick: () => actions.focus(p.id, { fly: true }) },
      sticker(p),
      el('span', { class: 'txt' },
        el('b', {}, p.name, has3D(p.id) ? el('span', { class: 'pill3d' }, '3D') : null),
        el('span', { class: 'meta' }, el('small', {}, [p.kind || cat.label, p.side].filter(Boolean).join(' · ')), rating(p))),
      el('button', { class: 'add', title: sel ? 'Remove from tour' : 'Add to tour', 'aria-label': sel ? 'Remove from tour' : 'Add to tour',
        onclick: (e) => { e.stopPropagation(); actions.toggleStop(p.id, { fly: true }); } }, sel ? '✓' : '+'));
  }

  function renderRoutes() {
    $('route-list').replaceChildren(...presets.map((r) => el('div', { class: `route-card${state.preset === r.id ? ' active' : ''}`, style: `--c:${r.color}` },
      el('h3', {}, `${r.emoji} ${r.name}`),
      el('p', {}, r.blurb),
      el('div', { class: 'stops' }, r.stops.map((id) => el('span', {}, byId[id]?.name || id))),
      el('div', { class: 'meta' }, el('span', {}, `${r.stops.length} stops · ${r.minutes}`),
        el('button', { class: 'btn', onclick: () => actions.loadPreset(r.id) }, state.preset === r.id ? 'Replay' : 'Start route')))));
  }

  function renderTour() {
    const root = $('tour');
    if (!state.stops.length) {
      root.replaceChildren(el('p', { class: 'empty' }, glyphEl('route', 'big'), 'Your tour is empty.', el('br'), 'Add places from Explore, tap buildings on the map, or start a ready-made route.'),
        el('div', { style: 'text-align:center' }, el('button', { class: 'btn', onclick: () => actions.setTab('routes') }, 'Browse routes')));
      return;
    }
    const stops = state.stops.map((id) => byId[id]).filter(Boolean);
    const legsOk = state.legs.length === stops.length - 1;
    const walkSec = legsOk ? state.legs.reduce((s, l) => s + l.duration, 0) : 0;
    const walkM = legsOk ? state.legs.reduce((s, l) => s + l.distance, 0) : 0;
    const visit = stops.reduce((s, p) => s + (p.duration || 30), 0);
    const approx = state.legs.some((l) => l.approx);

    const items = [];
    stops.forEach((p, i) => {
      const cat = CATS[p.category];
      items.push(el('div', {
        class: 'stop', draggable: 'true', style: `--c:${cat.color}`,
        ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
        ondragleave: (e) => e.currentTarget.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (dragFrom != null && dragFrom !== i) actions.move(dragFrom, i); dragFrom = null; },
      },
      sticker(p, { size: '40px', tag: i + 1 }),
      el('span', { class: 'txt', onclick: () => actions.focus(p.id, { fly: true }) }, el('b', {}, p.name), el('small', {}, `${p.kind || cat.label} · ~${fmtMin(p.duration || 30)} visit`)),
      el('span', { class: 'moves' },
        el('button', { class: 'mini', title: 'Move up', 'aria-label': `Move ${p.name} up`, disabled: i === 0, onclick: () => actions.move(i, i - 1) }, '▲'),
        el('button', { class: 'mini', title: 'Move down', 'aria-label': `Move ${p.name} down`, disabled: i === stops.length - 1, onclick: () => actions.move(i, i + 1) }, '▼')),
      el('button', { class: 'mini', title: 'Remove', 'aria-label': `Remove ${p.name}`, onclick: () => actions.toggleStop(p.id) }, '×')));
      const leg = state.legs[i];
      if (i < stops.length - 1) items.push(el('div', { class: 'leg' }, leg ? `🚶 ${fmtMin(leg.duration / 60)} · ${fmtDist(leg.distance)}${leg.approx ? ' (est.)' : ''}` : '🚶 calculating…'));
    });

    root.replaceChildren(...[
      el('div', { class: 'summary' },
        el('div', {}, el('b', {}, stops.length), el('span', {}, 'stops')),
        el('div', {}, el('b', {}, legsOk ? fmtMin(walkSec / 60) : '…'), el('span', {}, legsOk ? `walking · ${fmtDist(walkM)}` : 'walking')),
        el('div', {}, el('b', {}, fmtMin(visit + walkSec / 60)), el('span', {}, 'total'))),
      ...items,
      approx ? el('p', { class: 'empty' }, 'Some walking times are estimates (routing service unreachable).') : null,
      el('div', { class: 'tour-actions' },
        el('button', { class: 'btn', onclick: () => actions.fit() }, 'Show on map'),
        stops.length > 1 ? el('a', { class: 'btn ghost', href: directionsUrl(stops), target: '_blank', rel: 'noopener' }, 'Walking directions ↗') : null,
        el('button', { class: 'btn ghost', onclick: () => actions.clear() }, 'Clear tour')),
      stops.length > 9 ? el('p', { class: 'note' }, 'Google Maps takes up to 9 waypoints, so the link covers the first 10 stops.') : null,
    ].filter(Boolean));
  }

  return {
    render(what = 'all') {
      renderTabs();
      if (what === 'all' || what === 'list') renderExplore();
      if (what === 'all' || what === 'routes') renderRoutes();
      if (what === 'all' || what === 'tour') renderTour();
    },
  };
}
