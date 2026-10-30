import * as THREE from 'three';
import { C, mat, metal, lit, poly } from './kit.js';
import { line, river } from './buildings.js';

/* The Danube bridges. Each runs along x with the Buda end at -x; the map layer turns x to the bridge's real heading.
 * Chain Bridge is drawn at true length (units = metres / 4) with heights stretched about 1.3x; the others keep their
 * compact units with heights stretched about 1.8x so the structures read from the air. */

/** Quays either side of the river, from |x| = from to |x| = to (ground). */
function quays(k, from, to, depth = 9, thick = 1.0) {
  for (const s of [-1, 1]) {
    k.g.box(to - from, thick, depth, mat(0x8a8d78), s * (from + to) / 2, 0, 0);
    k.g.box(to - from, 0.2, depth, mat(C.stone), s * (from + to) / 2, thick, 0);
  }
}

function lampPost(k, x, y, z, h = 0.6, m = metal(C.iron)) {
  k.cyl(0.025, 0.03, h, m, x, y, z, 6, { ink: false });
  k.sphere(0.07, lit(), x, y + h + 0.06, z, { ink: false });
}

/** A crouching lion on its plinth, looking along +x of the given heading. */
function lion(k, x, y, z, ry, s, m) {
  const l = k.at(x, y, z, ry);
  l.box(1.4 * s, 0.5 * s, 0.9 * s, mat(0xd2c9b4), 0, 0, 0);
  l.box(1.1 * s, 0.42 * s, 0.5 * s, m, -0.05 * s, 0.5 * s, 0, { ink: 'fine' });
  for (const dz of [-0.16, 0.16]) l.box(0.5 * s, 0.14 * s, 0.14 * s, m, 0.55 * s, 0.5 * s, dz * s, { ink: false });
  l.put(new THREE.SphereGeometry(0.3 * s, 12, 10), m, 0.42 * s, 1.05 * s, 0, { s: [0.9, 1, 1.05], ink: 'fine' });   // mane
  l.box(0.26 * s, 0.22 * s, 0.24 * s, m, 0.68 * s, 0.92 * s, 0, { ink: false });   // muzzle
  l.box(0.5 * s, 0.08 * s, 0.08 * s, m, -0.8 * s, 0.6 * s, 0.15 * s, { rz: -0.4, ink: false });   // tail
}

/* ---------- Széchenyi Chain Bridge: 375 m, 202 m river span between two stone triumphal-arch pylons ---------- */
export function chainBridge(k) {
  const stone = mat(0xdcd4c2), trim = mat(0xece5d4), iron = metal(0x3a4250), road = metal(C.road), gold = metal(C.gold), lionM = mat(0xc9bfa9);
  const P = 25.25, A = 46.6, deckY = 2.6, W = 3.8, top = 14.3, chainZ = 2.15;
  river(k, 82, 34, 0, 0, 0.0);
  for (const s of [-1, 1]) {
    k.g.box(12, 2.2, 34, mat(0x9b9a86), s * 46, 0, 0);
    k.g.box(12, 0.25, 34, mat(C.stone), s * 46, 2.2, 0);
  }
  // deck with its lattice stiffening girders, walkways and lamps
  k.box(2 * A, 0.45, W, road, 0, deckY - 0.45, 0);
  for (const s of [-1, 1]) {
    const z = s * (W / 2 + 0.05);
    k.box(2 * A, 0.12, 0.12, iron, 0, deckY - 0.45, z, { ink: 'fine' });
    k.box(2 * A, 0.12, 0.12, iron, 0, deckY + 0.55, z, { ink: 'fine' });
    const xs = line(141, -A + 1, A - 1);
    xs.slice(1).forEach((x, i) => k.strut([xs[i], deckY - 0.39, z], [x, deckY + 0.55, z], 0.05, iron, { ink: false }));
    for (const x of line(22, -A + 2, A - 2)) lampPost(k, x, deckY + 0.6, z, 1.1, iron);
  }
  // river piers with cutwaters, carrying the pylons: a round arch for the road between two massive piers
  for (const s of [-1, 1]) {
    const px = s * P;
    k.box(4.2, deckY - 0.45, 8.6, stone, px, 0, 0);
    for (const sz of [-1, 1]) k.cyl(2.1, 2.1, deckY - 0.45, stone, px, 0, sz * 4.3, 20);
    // the pylon's face with the road arch cut into its outline, extruded along the bridge
    const ar = 2.0, spring = 4.8, arch = line(17, Math.PI, 0).map((a) => [Math.cos(a) * ar, spring + Math.sin(a) * ar]);
    k.prism(poly([[-3.7, 0], [-ar, 0], ...arch, [ar, 0], [3.7, 0], [3.7, top - deckY + 0.4], [-3.7, top - deckY + 0.4]]), 3.0, stone, px, deckY, 0, { ry: Math.PI / 2 });
    for (const sx of [-1, 1]) {
      // pilasters, a cornice and the crowning attic on both faces
      for (const pz of [-3.35, 3.35, -2.3, 2.3]) k.box(0.18, top - deckY - 0.4, 0.42, trim, px + sx * 1.56, deckY, pz, { ink: 'fine' });
      k.box(0.25, 0.2, 7.6, trim, px + sx * 1.55, deckY + 6.9, 0, { ink: 'fine' });
      k.panes([[px + sx * 1.53, deckY + 7.6, 0, sx * Math.PI / 2]], { w: 1.2, h: 1.2, kind: 'round', m: gold, frame: trim, pad: 0.12 });
    }
    k.box(3.5, 0.35, 8.0, trim, px, top + 0.4, 0);
    k.box(3.2, 0.9, 7.6, stone, px, top + 0.75, 0);
    k.box(3.5, 0.25, 8.0, trim, px, top + 1.65, 0);
    // chain saddles on top
    for (const sz of [-1, 1]) k.box(1.0, 0.5, 0.7, iron, px, top + 1.9, sz * chainZ);
  }
  // abutments with the four lions
  for (const s of [-1, 1]) {
    k.box(4.2, deckY, 8.2, stone, s * (A - 1.4), 0, 0);
    k.box(4.4, 0.25, 8.4, trim, s * (A - 1.4), deckY - 0.1, 0);
    for (const sz of [-1, 1]) lion(k, s * (A - 2.2), deckY + 0.15, sz * 3.4, s > 0 ? Math.PI : 0, 1.6, lionM);
  }
  // the double chains: a deep sag over the river, flatter back-spans down to the anchorages, hangers to the girders
  const yTop = top + 2.1, low = deckY + 0.75;
  const main = (x) => low + (yTop - low) * (x / P) ** 2;
  const back = (x) => yTop - (yTop - (deckY + 0.3)) * ((x - P) / (A - 2.5 - P)) ** 1.3;
  for (const sz of [-1, 1]) for (const dy of [0, -0.32]) {
    const z = sz * chainZ;
    k.tube(line(44, -P, P).map((x) => [x, main(x) + dy, z]), 0.11, iron);
    for (const s of [-1, 1]) k.tube(line(18, P, A - 2.5).map((x) => [s * x, back(x) + dy, z]), 0.11, iron);
  }
  for (const sz of [-1, 1]) {
    const z = sz * chainZ;
    for (const x of line(31, -P + 1.4, P - 1.4)) k.box(0.06, main(x) - 0.4 - (deckY + 0.55), 0.06, iron, x, deckY + 0.55, z, { ink: false });
    for (const s of [-1, 1]) for (const x of line(10, P + 1.6, A - 4)) k.box(0.06, Math.max(0.1, back(x) - 0.4 - (deckY + 0.55)), 0.06, iron, s * x, deckY + 0.55, z, { ink: false });
  }
}

/* ---------- Elizabeth Bridge: one white suspension span, tower to tower ---------- */
export function elizabethBridge(k) {
  const white = metal(0xf4f2ea), road = metal(C.road), stone = mat(0xd9d2c1), gold = metal(C.gold);
  const L = 11, T = 8.45, H = 6.1, deckY = 1.0, zc = 1.4, top = H - 0.15;
  river(k, 2 * T, 9, 0, 0, 0.25); quays(k, T, L + 1.6);
  k.box(2 * L, 0.26, 2.5, road, 0, deckY);
  for (const s of [-1, 1]) { k.box(2 * L, 0.42, 0.14, white, 0, deckY - 0.08, s * 1.2); k.box(0.8, 1.2, 3.4, stone, s * (L - 0.4), 0); }
  // pylons: two slim legs on a stone base, joined by portal beams, with gilded caps
  for (const tx of [-T, T]) {
    k.box(1.2, 1.2, 3.5, stone, tx, 0);
    for (const s of [-1, 1]) {
      k.box(0.36, H - 1.2, 0.36, white, tx, 1.2, s * zc);
      k.box(0.5, 0.18, 0.5, white, tx, H - 0.1, s * zc, { ink: 'fine' });
      k.cyl(0.12, 0.2, 0.3, gold, tx, H + 0.08, s * zc, 8, { ink: 'fine' });
    }
    k.box(0.3, 0.3, 2 * zc + 0.36, white, tx, H - 0.45);
    k.box(0.26, 0.2, 2 * zc, white, tx, 3.6);
    for (const s of [-1, 1]) k.strut([tx, 3.8, s * zc], [tx, H - 0.5, -s * zc * 0.15], 0.07, white, { ink: 'fine' });
  }
  const sag = (x) => 1.9 + (top - 1.9) * (x / T) ** 2;
  for (const z of [-zc, zc]) {
    k.tube(line(36, -T, T).map((x) => [x, sag(x), z]), 0.07, white);
    for (const s of [-1, 1]) k.tube(line(14, T, L - 0.3).map((x) => [s * x, top - (top - 1.35) * ((x - T) / (L - 0.3 - T)) ** 1.15, z]), 0.07, white);
    for (const x of line(17, -T + 0.5, T - 0.5)) k.box(0.03, sag(x) - 1.3, 0.03, white, x, 1.3, z, { ink: false });
  }
  for (const x of line(9, -9.5, 9.5)) for (const z of [-1.1, 1.1]) lampPost(k, x, 1.26, z, 0.5);
}

/* ---------- Liberty Bridge: green cantilever truss, four pylons crowned with turul birds ---------- */
export function libertyBridge(k) {
  const green = metal(0x6fa35a), road = metal(C.road), stone = mat(0xd9d2c1), gold = metal(C.gold);
  const L = 10, P = 5.25, zt = 1.6, deckY = 1.0, chordY = deckY + 0.3;
  river(k, 2 * P + 2, 9, 0, 0, 0.25); quays(k, P + 1, L + 1.6);
  const yt = (x) => { const a = Math.abs(x); return a <= P ? 2.3 + 2.0 * (a / P) ** 2 : 4.3 - 2.4 * ((a - P) / (L - P)) ** 1.3; };
  k.box(2 * L, 0.28, 2.9, road, 0, deckY);
  for (const s of [-1, 1]) { k.box(2.2, 1.0, 3.8, stone, s * P, 0); k.box(0.9, 1.0, 3.4, stone, s * (L - 0.4), 0); }
  for (const z of [-zt, zt]) {
    k.box(2 * L, 0.22, 0.16, green, 0, deckY + 0.28, z);
    k.tube(line(41, -L, L).map((x) => [x, yt(x), z]), 0.1, green);
    const xs = line(33, -L, L);
    xs.forEach((x, i) => {
      k.strut([x, chordY + 0.1, z], [x, yt(x), z], 0.06, green, { ink: 'fine' });
      if (i === xs.length - 1) return;
      const n = xs[i + 1], flip = (x + n) / 2 > 0;
      k.strut([flip ? n : x, chordY + 0.1, z], [flip ? x : n, yt(flip ? x : n), z], 0.045, green, { ink: false });
    });
  }
  // pylons, each with a gilded turul bird spreading its wings on an orb
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * P, z = sz * zt;
    k.box(0.62, 4.4, 0.62, green, x, deckY, z);
    k.box(0.86, 0.2, 0.86, stone, x, deckY + 4.4, z);
    k.sphere(0.18, gold, x, deckY + 4.78, z, { ink: 'fine' });
    k.box(0.12, 0.2, 0.36, gold, x, deckY + 4.92, z, { ink: false });
    k.sphere(0.08, gold, x, deckY + 5.2, z + 0.14, { ink: false });
    for (const w of [-1, 1]) k.box(0.1, 0.03, 0.62, gold, x + w * 0.22, deckY + 5.1, z, { rz: w * 0.7, ry: Math.PI / 2, ink: false });
  }
  k.box(0.3, 0.3, 2 * zt, green, P, yt(P) - 0.2); k.box(0.3, 0.3, 2 * zt, green, -P, yt(P) - 0.2);
  for (const x of line(7, -8, 8)) for (const z of [-1.3, 1.3]) lampPost(k, x, deckY + 0.28, z, 0.45);
}

/* ---------- Petőfi Bridge: three steel deck-truss spans, deepest over the river piers ---------- */
export function petofiBridge(k) {
  const steel = metal(0x7f9a8c), road = metal(C.road), stone = mat(0xd9d2c1);
  const L = 12, P = 3.6, zt = 1.75, deckY = 1.8;
  const depth = (x) => 0.42 + 0.7 * Math.exp(-(((Math.abs(x) - P) / 1.1) ** 2));
  river(k, 2 * (P + 3.4), 9, 0, 0, 0.25); quays(k, P + 3.4, L + 1.6);
  k.box(2 * L, 0.22, 3.9, road, 0, deckY);
  for (const s of [-1, 1]) {
    k.box(1.1, deckY - 1.12, 3.9, stone, s * P, 0);
    for (const sz of [-1, 1]) k.cyl(0.55, 0.55, deckY - 1.12, stone, s * P, 0, sz * 1.95, 14);
    k.box(1.0, deckY - 0.4, 3.9, stone, s * (L - 0.5), 0);
    k.box(2 * L, 0.1, 0.1, steel, 0, deckY + 0.22, s * 1.95, { ink: 'fine' });
  }
  for (const z of [-zt, zt]) {
    k.box(2 * L, 0.2, 0.2, steel, 0, deckY - 0.2, z);
    k.tube(line(61, -L, L).map((x) => [x, deckY - depth(x), z]), 0.08, steel);
    const xs = line(49, -L, L);
    xs.forEach((x, i) => {
      k.strut([x, deckY - depth(x), z], [x, deckY - 0.1, z], 0.05, steel, { ink: 'fine' });
      if (i < xs.length - 1) { const n = xs[i + 1]; i % 2 ? k.strut([x, deckY - depth(x), z], [n, deckY - 0.1, z], 0.04, steel, { ink: false }) : k.strut([x, deckY - 0.1, z], [n, deckY - depth(n), z], 0.04, steel, { ink: false }); }
    });
  }
  for (const x of line(17, -L + 1, L - 1)) k.box(0.14, 0.1, 2 * zt, steel, x, deckY - depth(x) - 0.04, 0, { ink: false });
  for (const x of line(9, -10, 10)) for (const z of [-1.95, 1.95]) lampPost(k, x, deckY + 0.22, z, 0.9);
}

/* ---------- Rákóczi Bridge: a slim modern box girder, haunched over slender river piers ---------- */
export function rakocziBridge(k) {
  const girder = metal(0xaab6bf), road = metal(C.road), conc = metal(0xc9c9c4), steel = metal(C.iron);
  const L = 12, piers = [-7.5, -2.5, 2.5, 7.5], deckY = 1.7, W = 4.0;
  const depth = (x) => 0.3 + 0.62 * piers.reduce((s, px) => s + Math.exp(-(((x - px) / 1.35) ** 2)), 0);
  river(k, 20, 9, 0, 0, 0.25); quays(k, 10, L + 1.6);
  const prof = new THREE.Shape(); prof.moveTo(-L, deckY); prof.lineTo(L, deckY);
  for (const x of line(97, L, -L)) prof.lineTo(x, deckY - depth(x));
  prof.closePath();
  k.prism(prof, W, girder);
  k.box(2 * L, 0.1, W + 0.4, road, 0, deckY);
  for (const z of [-(W / 2 + 0.15), W / 2 + 0.15, 0]) k.box(2 * L, 0.18, z ? 0.1 : 0.14, conc, 0, deckY + 0.1, z, { ink: 'fine' });
  for (const px of piers) for (const z of [-1.0, 1.0]) k.cyl(0.28, 0.34, deckY - depth(px), conc, px, 0, z, 14);
  for (const s of [-1, 1]) k.box(1.0, deckY - 0.28, W + 0.4, mat(C.stone), s * (L - 0.5), 0);
  // tall twin-arm lamps down the median
  for (const x of line(11, -10.5, 10.5)) {
    k.cyl(0.035, 0.05, 1.5, steel, x, deckY + 0.18, 0, 8, { ink: 'fine' });
    k.box(0.05, 0.05, 1.5, steel, x, deckY + 1.66, 0, { ink: false });
    for (const z of [-0.7, 0.7]) k.sphere(0.08, lit(), x, deckY + 1.6, z, { ink: false });
  }
}

/* ---------- Margaret Bridge: two iron-arch arms meeting at a bend over the river, with a spur to the island ---------- */
export function margaretBridge(k) {
  const iron = metal(0x6c7a86), road = metal(C.road), stone = mat(0xd9d2c1), gold = metal(C.gold);
  const deckY = 1.2, W = 2.5;
  const B = [-12, 0], A = [-1.8, -3.24], P = [12, 0], S = [-2.08, -6.44];   // Buda end, the bend, Pest end, island end
  river(k, 24.6, 12, 0, -3.2, 0.25); quays(k, 12.3, 14.4, 6);
  k.g.box(4.2, 0.9, 3.4, mat(C.grass), S[0], 0, S[1] - 2.5);
  /** One straight arm from `a` to `b`: stone piers with round cutwaters, shallow iron arches under the deck, rails and lamp steles. */
  function arm(a, b, spans, w) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), g = k.at(a[0], 0, a[1], -Math.atan2(b[1] - a[1], b[0] - a[0]));
    g.box(len, 0.26, w, road, len / 2, deckY);
    for (const s of [-1, 1]) g.box(len, 0.16, 0.08, iron, len / 2, deckY + 0.26, s * w / 2, { ink: 'fine' });
    const xs = line(spans + 1, 0, len);
    xs.forEach((x, i) => {
      if (i > 0 && i < spans) {
        g.box(0.9, deckY, w + 0.4, stone, x, 0, 0);
        for (const s of [-1, 1]) g.cyl(0.45, 0.45, deckY, stone, x, 0, s * (w + 0.4) / 2, 14);
      }
      for (const s of [-1, 1]) {   // lamp stele on each pier and end
        g.box(0.3, 0.8, 0.3, stone, x, deckY + 0.26, s * (w / 2 + 0.05)); g.box(0.4, 0.1, 0.4, stone, x, deckY + 1.06, s * (w / 2 + 0.05));
        g.sphere(0.13, lit(), x, deckY + 1.32, s * (w / 2 + 0.05), { ink: false });
      }
    });
    for (let j = 0; j < spans; j++) {
      const x0 = xs[j] + 0.45, x1 = xs[j + 1] - 0.45, y = (x) => 0.55 + 0.5 * 4 * ((x - x0) / (x1 - x0)) * (1 - (x - x0) / (x1 - x0));
      for (const s of [-1, 1]) {
        const z = s * (w / 2 - 0.1);
        g.tube(line(15, x0, x1).map((x) => [x, y(x), z]), 0.07, iron);
        for (const x of line(Math.max(4, Math.round((x1 - x0) / 0.45)), x0 + 0.2, x1 - 0.2)) g.box(0.04, deckY - y(x), 0.04, iron, x, y(x), z, { ink: false });
      }
    }
  }
  arm(B, A, 3, W); arm(A, P, 3, W); arm(A, S, 1, 1.6);
  // the drum pier at the bend, with a tall column and gold finial
  k.cyl(1.1, 1.2, deckY, stone, A[0], 0, A[1], 28);
  k.cyl(0.22, 0.28, 2.2, stone, A[0], deckY + 0.26, A[1], 12); k.cone(0.24, 0.5, gold, A[0], deckY + 2.46, A[1], 10);
  for (const s of [-1, 1]) k.box(1.1, deckY, W + 0.6, stone, s * 11.7, 0);
}
