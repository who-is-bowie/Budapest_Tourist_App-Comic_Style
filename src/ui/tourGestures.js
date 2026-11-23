import { haptic } from '../util.js';

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Swipe a stop to the left to remove it. `row` slides over a "Remove" backing inside `wrap`. */
export function swipeToRemove(wrap, row, onRemove) {
  const reach = () => Math.min(110, wrap.offsetWidth * 0.3);
  let s = null, swiped = 0;
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('.grip, button, a')) return;
    s = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, live: false };
  });
  row.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.live) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      s.live = true; row.setPointerCapture(e.pointerId); row.style.transition = 'none';
    }
    s.dx = Math.min(0, dx);
    row.style.transform = `translate3d(${s.dx}px, 0, 0)`;
    const armed = s.dx < -reach();
    if (armed !== wrap.classList.contains('armed')) { wrap.classList.toggle('armed', armed); if (armed) haptic(10); }
  });
  const finish = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const { live, dx } = s; s = null;
    if (!live) return;
    swiped = performance.now();
    row.style.transition = calm.matches ? 'none' : 'transform .26s cubic-bezier(.2, .9, .25, 1)';
    if (!cancelled && dx < -reach()) {
      row.style.transform = `translate3d(-${wrap.offsetWidth}px, 0, 0)`;
      wrap.classList.add('gone');
      setTimeout(onRemove, calm.matches ? 0 : 230);
    } else { row.style.transform = ''; wrap.classList.remove('armed'); }
  };
  row.addEventListener('pointerup', (e) => finish(e, false));
  row.addEventListener('pointercancel', (e) => finish(e, true));
  row.addEventListener('click', (e) => { if (performance.now() - swiped < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
}

/** Press the grip and drag a stop up or down; it drops where the finger is. `pane` is the scrolling container. */
export function reorderGrip(grip, row, pane, rows, index, onMove) {
  let s = null, raf = 0;
  const others = () => rows().filter((r) => r !== row);
  const targetAt = (y) => {
    const all = rows(); let t = index;
    all.forEach((r, i) => { if (r === row) return; const b = r.getBoundingClientRect(); if (y >= b.top && y <= b.bottom) t = i; });
    if (y < all[0].getBoundingClientRect().top) t = 0;
    if (y > all[all.length - 1].getBoundingClientRect().bottom) t = all.length - 1;
    return t;
  };
  const place = () => {
    row.style.transform = `translate3d(0, ${s.y - s.y0 + pane.scrollTop - s.scroll0}px, 0) scale(1.02)`;
    const t = targetAt(s.y);
    if (t !== s.target) {
      others().forEach((r) => r.classList.remove('over')); s.target = t;
      if (t !== index) { rows()[t].classList.add('over'); haptic(6); }
    }
  };
  const auto = () => {
    if (!s) return;
    const b = pane.getBoundingClientRect(), edge = 56;
    const dy = s.y < b.top + edge ? -10 : s.y > b.bottom - edge ? 10 : 0;
    if (dy) { pane.scrollTop += dy; place(); }
    raf = requestAnimationFrame(auto);
  };
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    s = { y: e.clientY, y0: e.clientY, scroll0: pane.scrollTop, target: index };
    row.classList.add('lifting'); haptic(12); raf = requestAnimationFrame(auto);
  });
  grip.addEventListener('pointermove', (e) => { if (s) { s.y = e.clientY; place(); } });
  const drop = (cancel) => {
    if (!s) return;
    const to = cancel ? index : s.target; s = null; cancelAnimationFrame(raf);
    row.classList.remove('lifting'); row.style.transform = '';
    rows().forEach((r) => r.classList.remove('over'));
    if (to !== index) onMove(index, to);
  };
  grip.addEventListener('pointerup', () => drop(false));
  grip.addEventListener('pointercancel', () => drop(true));
}
