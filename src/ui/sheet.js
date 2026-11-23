/**
 * Draggable bottom sheet, iOS style. The element is laid out once at full height and only ever moved with a
 * compositor-only transform, so dragging never triggers layout and the map underneath never resizes.
 *
 * Gesture rules (touch):
 *  - dragging the grab zone (handle, search bar) always moves the sheet;
 *  - below the top snap, any vertical drag moves the sheet, so scrolling the list expands it first;
 *  - at the top snap, the content scrolls, and a downward drag from scrollTop 0 hands over to the sheet;
 *  - on release the sheet settles on the snap point nearest to where its momentum would carry it.
 */
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const SPRING = 'transform .42s cubic-bezier(.2, .9, .25, 1)';

/**
 * @param {HTMLElement} el
 * @param {object} cfg
 * @param {() => Record<string, number>} cfg.snaps   translateY in px for each named snap (0 = fully open); read on every gesture, so it follows rotation and resizes
 * @param {string[]} cfg.stops                       snap names the user can drag between, from most open to most closed
 * @param {string} cfg.initial
 * @param {string} [cfg.grab]                        selector of the zone that always drags the sheet
 * @param {(name: string, snaps: Record<string, number>) => void} [cfg.onSettle]
 * @param {() => boolean} [cfg.active]               gestures are ignored while this is false (e.g. the desktop layout)
 */
export function createSheet(el, { snaps, stops, initial, grab = '', onSettle, active = () => true }) {
  let name = initial, ty = 0, gesture = null, touch = null, timer = 0;

  const move = (v) => { ty = v; el.style.transform = `translate3d(0, ${v}px, 0)`; };
  const settle = (to, { instant = false } = {}) => {
    clearTimeout(timer);
    const pts = snaps();
    name = to; el.dataset.sheet = to;
    el.style.transition = instant || calm.matches ? 'none' : SPRING;
    move(pts[to]);
    onSettle?.(to, pts);
  };

  function begin(y) { el.style.transition = 'none'; el.classList.add('dragging'); gesture = { y0: y, ty0: ty, y, t: performance.now(), v: 0 }; }
  function drag(y) {
    const pts = snaps(), lo = pts[stops[0]], hi = pts[stops[stops.length - 1]];
    const now = performance.now(), dt = now - gesture.t;
    if (dt > 0) gesture.v = 0.7 * ((y - gesture.y) / dt) + 0.3 * gesture.v;   // px per ms, smoothed
    gesture.y = y; gesture.t = now;
    let v = gesture.ty0 + (y - gesture.y0);
    if (v < lo) v = lo - (lo - v) * 0.2;        // rubber band past the top
    else if (v > hi) v = hi + (v - hi) * 0.2;   // and past the bottom
    move(v);
  }
  function release() {
    if (!gesture) return;
    const pts = snaps(), carry = ty + gesture.v * 220;
    el.classList.remove('dragging');
    let best = stops[0];
    for (const s of stops) if (Math.abs(pts[s] - carry) < Math.abs(pts[best] - carry)) best = s;
    gesture = null;
    settle(best);
  }

  /* touch drags on the whole sheet */
  const scrollerOf = (node) => {
    for (let n = node; n && n !== el.parentNode; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n;
      if (n === el) break;
    }
    return null;
  };
  el.addEventListener('touchstart', (e) => {
    if (!active() || e.touches.length !== 1) { touch = null; return; }
    const t = e.touches[0];
    clearTimeout(timer);
    touch = { x: t.clientX, y: t.clientY, mode: null, scroller: scrollerOf(e.target), grab: !!(grab && e.target.closest(grab)) };
    if (gesture) release();
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!touch || touch.mode === 'x' || touch.mode === 'scroll') return;
    const t = e.touches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (!touch.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { touch.mode = 'x'; return; }    // horizontal carousels and swipe-to-delete keep their gesture
      const open = name === stops[0], atTop = !touch.scroller || touch.scroller.scrollTop <= 0;
      if (touch.grab || !open || (dy > 0 && atTop)) { touch.mode = 'sheet'; begin(touch.y); } else { touch.mode = 'scroll'; return; }
    }
    e.preventDefault();
    drag(t.clientY);
  }, { passive: false });
  const end = () => { if (touch?.mode === 'sheet') release(); touch = null; };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);

  return {
    get name() { return name; },
    go: (to, opts) => settle(to, opts),
    /** re-apply the current snap, e.g. after a rotation */
    refit: () => settle(name, { instant: true }),
    /** jump without animating (first layout) */
    jump: (to) => settle(to, { instant: true }),
    /** animate to a snap, resolving once it has arrived */
    to(target) { settle(target); return new Promise((res) => { timer = setTimeout(res, calm.matches ? 0 : 440); }); },
  };
}
