import * as THREE from 'three';
import { C, mat, metal, faceted, lit, zsolnay, banded, toon, onionProfile, domeProfile, poly, openingShape } from './kit.js';

/* Landmark buildings, drawn with the kit (kit.js). Units are metres / 4 and follow the real buildings' published
 * dimensions; front faces +z, the model stands on y = 0, ground pieces (plazas, water, hills) go through `k.g` and
 * sit below y = 0. Each builder takes a kit `k`. */

const TAU = Math.PI * 2;
export const line = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));

/** A dome on a lathe with `n` raised ribs following its curve. */
function ribbedDome(k, r, h, m, ribM, x, y, z, { n = 16, point = 0, seg = 32, rib = 0.028 } = {}) {
  k.dome(r, h, m, x, y, z, seg, { point });
  const prof = domeProfile(r * 1.012, h * 1.012, { point, n: 12 }).slice(0, -2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, sx = Math.sin(a), sz = Math.cos(a);
    k.tube(prof.map(([pr, py]) => [x + sx * pr, y + py, z + sz * pr]), r * rib, ribM, { ink: 'fine' });
  }
}

/** Height of a dome profile at radius `rr` (for seating a lantern where the dome narrows to it). */
function domeAt(r, h, rr, point = 0) {
  const prof = domeProfile(r, h, { point, n: 60 });
  return prof.find(([pr]) => pr <= rr)?.[1] ?? h;
}

/**
 * A building wing, `len` along its local x, `dep` deep, `h` to the eaves, with a cornice, a roof and a grid of framed
 * windows on all four faces. roof: hip | mansard | gable | flat | none. buttress: pinnacle height for Gothic piers.
 */
function wing(k, { x = 0, y = 0, z = 0, ry = 0, len, dep, h, wall, trim, roofM, roof = 'hip', roofH = 2, rows = 3, bay = 1.3,
  kind = 'arch', ww = 0.38, wh = null, ends = true, buttress = 0, plinth = null, sill = 0.45 }) {
  const f = k.at(x, y, z, ry);
  if (plinth) f.box(len + 0.1, Math.min(1.1, h * 0.26), dep + 0.1, plinth);
  f.box(len, h, dep, wall);
  f.cornice(len, dep, h - 0.08, trim);
  const top = h + 0.14;
  if (roof === 'hip') f.hip(len + 0.25, dep + 0.25, roofH, roofM, 0, top, 0);
  else if (roof === 'mansard') f.mansard(len + 0.25, dep + 0.25, roofH * 0.72, roofH * 0.28, Math.min(len, dep) * 0.2, roofM, 0, top, 0);
  else if (roof === 'gable') f.gable(dep + 0.25, roofH, len + 0.25, roofM, 0, top, 0, Math.PI / 2);
  else if (roof === 'flat') f.box(len - 0.3, 0.25, dep - 0.3, roofM, 0, top);
  const dy = (h - sill - 0.35) / rows, winH = wh ?? dy * 0.62;
  const faces = [[len, dep / 2, 0], [len, -dep / 2, Math.PI]];
  if (ends) faces.push([dep, len / 2, Math.PI / 2], [dep, -len / 2, -Math.PI / 2]);
  for (const [run, off, face] of faces) {
    const n = Math.max(1, Math.round(run / bay)), step = run / n, along = Math.abs(face) === Math.PI / 2;
    const at = (t) => (along ? [off, t] : [t, off]);
    if (run > step * 0.9) f.windows({ from: at(-run / 2 + step / 2), to: at(run / 2 - step / 2), cols: n, rows, dy, y: sill + (dy - winH) * 0.35, face, w: ww, h: winH, kind, frame: trim });
    if (buttress) for (let i = 0; i <= n; i++) {
      const t = -run / 2 + i * step, out = Math.sign(off) * 0.11, [bx, bz] = along ? [off + out, t] : [t, off + out];
      f.box(along ? 0.22 : 0.24, h + 0.25, along ? 0.24 : 0.22, wall, bx, 0, bz);
      f.pinnacle(bx, h + 0.2, bz, buttress, 0.1, trim);
    }
  }
  return f;
}

/** A row of statues on a balustrade from a to b ([x, z]) at height y. */
function statueRow(k, a, b, y, n, m, h = 0.7) {
  for (const t of line(n, 0, 1)) k.statue(a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t, h, m);
}

/** Steps rising toward -z: `n` treads `w` wide, from z0 (bottom) up to height `rise`. */
function stairs(k, w, n, rise, m, x, z0, run = 0.32) {
  for (let i = 0; i < n; i++) k.box(w, rise * (i + 1) / n, run, m, x, 0, z0 - i * run - run / 2, { ink: i === 0 ? undefined : false });
}

/** Danube stretch: water plane with a gentle swell, as ground. */
export function river(k, w, d, x = 0, z = 0, y = -0.45) {
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 48, 24), toon({ color: C.water }, true));
  water.rotation.x = -Math.PI / 2; water.position.set(x, y, z); water.receiveShadow = true;
  k.g.add(water);
  k.root.userData.tickIsGround = true;
  const pos = water.geometry.attributes.position, base = pos.array.slice();
  k.root.userData.tick = (t) => {
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(base[i * 3] * 0.9 + t * 1.3) * 0.05 + Math.cos(base[i * 3 + 1] * 1.1 + t) * 0.05);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
  };
}

/* =====================================================================
 *  Hungarian Parliament  (268 × 123 m, dome 96 m)
 *  Long axis on x; +z is the Kossuth tér front, -z the Danube front.
 * ===================================================================== */
export function parliament(k) {
  const wall = mat(0xf2ede0), trim = mat(0xe0d6bd), white = mat(0xfaf7ef), roof = faceted(0xb0452f), domeM = faceted(0xa8402c),
    gold = metal(C.gold), stoneG = mat(0xc4bca9);
  // Kossuth tér, the embankment and the river
  k.g.box(72, 0.4, 37, stoneG, 0, -0.4, 1.5);
  k.g.box(72, 0.9, 1.0, mat(C.rock), 0, -0.9, -17.5);
  river(k, 72, 8, 0, -21.5);

  const H = 5.6, pin = 1.4;
  const gothic = { wall, trim, roofM: roof, kind: 'pointed', rows: 3, bay: 1.2, ww: 0.34, buttress: pin, plinth: trim };
  // Danube range, east range, the end ranges and the courtyard wings
  wing(k, { ...gothic, z: -12.6, len: 56, dep: 4.2, h: H, roofH: 3.0 });
  wing(k, { ...gothic, z: 7.4, len: 54, dep: 4.0, h: H, roofH: 2.8 });
  for (const s of [-1, 1]) {
    wing(k, { ...gothic, x: s * 30.4, z: 0.4, ry: Math.PI / 2, len: 14, dep: 3.8, h: H, roofH: 2.6, ends: false });
    wing(k, { ...gothic, x: s * 23.2, z: -2.6, ry: Math.PI / 2, len: 15.4, dep: 3.0, h: H - 0.3, roofH: 2.2, ends: false });
  }
  // the two chamber halls run front to back, taller, with steep roofs and gabled east fronts
  for (const s of [-1, 1]) {
    const cx = s * 15.4;
    wing(k, { ...gothic, x: cx, z: 0.65, ry: Math.PI / 2, len: 22.3, dep: 7.2, h: 7.0, roofH: 4.6, roof: 'gable', rows: 2, ww: 0.5, bay: 1.6, ends: false });
    const fz = 11.8;
    k.gable(7.6, 4.6, 0.5, wall, cx, 7.14, fz + 0.05);
    k.panes([[cx, 1.2, fz + 0.3, 0]], { w: 2.6, h: 4.6, kind: 'pointed', frame: trim, pad: 0.22 });
    k.panes([[cx, 7.8, fz + 0.3, 0]], { w: 1.9, h: 1.9, kind: 'round', frame: trim, pad: 0.16 });
    for (const sx of [-1, 1]) {
      k.box(1.1, 9.6, 1.1, wall, cx + sx * 3.8, 0, fz - 0.1);
      k.cone(0.8, 3.0, roof, cx + sx * 3.8, 9.6, fz - 0.1, 8);
      k.pinnacle(cx + sx * 3.8, 12.5, fz - 0.1, 0.9, 0.07, gold);
    }
    k.pinnacle(cx, 11.6, fz + 0.05, 1.4, 0.12, white);
  }
  // the end pavilions on the river, with steep pyramid roofs and corner turrets
  for (const s of [-1, 1]) {
    const cx = s * 31.2, cz = -11.6;
    k.box(5.6, 7.2, 7.6, wall, cx, 0, cz);
    k.cornice(5.6, 7.6, 7.1, trim, cx, cz);
    k.roof(6.0, 8.0, 0.6, 2.6, 5.2, roof, cx, 7.3, cz);
    k.pinnacle(cx, 12.4, cz, 1.6, 0.12, gold);
    for (const [ox, oz] of [[-2.8, -3.8], [2.8, -3.8], [-2.8, 3.8], [2.8, 3.8]]) {
      k.cyl(0.42, 0.42, 8.0, wall, cx + ox, 0, cz + oz, 8);
      k.cone(0.55, 2.4, roof, cx + ox, 8.0, cz + oz, 8);
    }
    k.windows({ from: [cx - 1.8, cz - 3.8], to: [cx + 1.8, cz - 3.8], cols: 3, rows: 3, dy: 2.0, y: 0.8, face: Math.PI, w: 0.5, h: 1.3, kind: 'pointed', frame: trim });
  }
  // river-front pavilions
  for (const px of [-20.5, -9.8, 9.8, 20.5]) {
    k.box(3.4, 6.8, 5.2, wall, px, 0, -12.8);
    k.cornice(3.4, 5.2, 6.7, trim, px, -12.8);
    k.pyramid(3.7, 5.4, 3.4, roof, px, 6.9, -12.8);
    k.pinnacle(px, 10.2, -12.8, 1.1, 0.09, gold);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.pinnacle(px + sx * 1.7, 6.8, -12.8 + sz * 2.6, 1.8, 0.14, white);
    k.panes([[px, 1.0, -15.4, Math.PI], [px, 3.2, -15.4, Math.PI]], { w: 1.2, h: 1.8, kind: 'pointed', frame: trim });
  }
  // central block: entrance hall to the east, the domed hall in the middle, a gabled riverside centre
  wing(k, { ...gothic, z: -1.85, len: 13, dep: 25.7, h: 6.4, roofH: 2.6, buttress: 1.6 });
  k.box(9, 7.6, 2.4, wall, 0, 0, -15.6);
  k.gable(9.4, 4.0, 2.6, roof, 0, 7.6, -15.6);
  k.gable(9.0, 3.8, 0.3, wall, 0, 7.6, -16.75);
  k.panes([[0, 1.0, -16.85, Math.PI]], { w: 3.0, h: 5.4, kind: 'pointed', frame: trim, pad: 0.2 });
  for (const sx of [-1, 1]) { k.cyl(0.5, 0.5, 10.6, wall, sx * 4.6, 0, -16.5, 8); k.cone(0.62, 3.0, roof, sx * 4.6, 10.6, -16.5, 8); }
  // main entrance on Kossuth tér: gabled porch, the lion stairs and two slim towers
  k.box(7.6, 6.2, 3.2, wall, 0, 0, 12.4);
  k.gable(8.0, 3.6, 3.4, roof, 0, 6.2, 12.4);
  k.gable(7.6, 3.4, 0.3, wall, 0, 6.2, 14.05);
  k.panes([[0, 0.9, 14.2, 0]], { w: 2.6, h: 4.2, kind: 'pointed', frame: trim, pad: 0.24 });
  for (const sx of [-1, 1]) {
    k.box(1.3, 12.2, 1.3, wall, sx * 4.6, 0, 12.6);
    k.cornice(1.3, 1.3, 12.1, trim, sx * 4.6, 12.6, 0.12);
    k.cone(0.95, 4.2, roof, sx * 4.6, 12.3, 12.6, 8);
    k.pinnacle(sx * 4.6, 16.4, 12.6, 0.8, 0.06, gold);
    k.panes([[sx * 4.6, 7.2, 13.27, 0], [sx * 4.6, 9.6, 13.27, 0]], { w: 0.4, h: 1.4, kind: 'pointed', frame: trim });
    k.box(0.9, 0.9, 1.7, trim, sx * 2.8, 0, 15.4);
    k.box(0.5, 0.45, 1.1, metal(0x8d7f5e), sx * 2.8, 0.9, 15.4);   // the lions
  }
  stairs(k, 5.2, 6, 1.0, trim, 0, 17.2, 0.32);

  // the dome: sixteen-sided drum ringed with buttress pinnacles, a pointed ribbed dome, lantern and spire
  const dz = -1.2, dy = 6.4, R = 5.0;
  k.cyl(R + 0.5, R + 0.6, 0.8, trim, 0, dy - 0.4, dz, 16);
  k.cyl(R, R, 4.4, wall, 0, dy + 0.4, dz, 16);
  k.ring(16, R, dy + 1.0, 0, dz, { w: 0.62, h: 2.7, kind: 'pointed', frame: trim, pad: 0.12 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, x = Math.sin(a) * (R + 0.12), z = dz + Math.cos(a) * (R + 0.12);
    k.box(0.36, 4.4, 0.36, wall, x, dy + 0.4, z, { ry: a });
    k.pinnacle(x, dy + 4.7, z, 2.4, 0.15, white);
  }
  k.cyl(R + 0.25, R + 0.25, 0.36, trim, 0, dy + 4.8, dz, 16);
  const domeH = 6.6, domeY = dy + 5.16, point = 0.7;
  ribbedDome(k, R - 0.1, domeH, domeM, white, 0, domeY, dz, { n: 16, point, seg: 16, rib: 0.03 });
  const lr = 1.25, ly = domeY + domeAt(R - 0.1, domeH, lr + 0.1, point);
  k.cyl(lr, lr, 2.2, wall, 0, ly, dz, 16);
  k.ring(8, lr, ly + 0.4, 0, dz, { w: 0.34, h: 1.3, kind: 'pointed', frame: trim, pad: 0.06 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.pinnacle(Math.sin(a) * (lr + 0.08), ly + 2.0, dz + Math.cos(a) * (lr + 0.08), 1.0, 0.07, white); }
  k.cone(lr * 0.98, 4.6, domeM, 0, ly + 2.2, dz, 16);
  k.lathe([[0.13, 0], [0.22, 0.3], [0.08, 0.6], [0.16, 0.8], [0, 1.4]], gold, 0, ly + 6.7, dz, 10, { ink: 'fine' });
}

/* =====================================================================
 *  Buda Castle — the Royal Palace on Castle Hill (≈ 300 m long, dome ≈ 60 m)
 *  Long axis on x; +z is the Danube front with the dome portico and Prince Eugene's statue.
 * ===================================================================== */
export function budaCastle(k) {
  const wall = mat(0xece2c8), trim = mat(0xddd0ae), base = mat(0xcabd9c), roofM = faceted(0x5f8278), copper = faceted(C.copper),
    rock = mat(0xb3aa96), gold = metal(C.gold), bronze = metal(0x4f7f6c);
  // Castle Hill: a green slope as ground, then the palace terrace with its retaining walls
  k.g.roof(90, 44, 80, 34, 3.2, mat(C.grass), 0, -3.2, 0);
  const T = 1.6;   // terrace height
  k.box(78, T, 30, rock, 0, 0, -1);
  k.box(78.4, 0.18, 30.4, trim, 0, T - 0.1, -1);
  for (const x of line(16, -37.5, 37.5)) k.box(0.9, T, 0.5, rock, x, 0, 14.2);   // buttresses on the river wall
  k.balustrade([-38.5, 14.1], [38.5, 14.1], T + 0.08, 0.5, trim);
  // round Habsburg-era bastion at the south tip
  k.cyl(4.2, 4.6, T, rock, 37, 0, 7, 28); k.cyl(4.3, 4.3, 0.18, trim, 37, T - 0.1, 7, 28);

  const classical = { wall, trim, roofM, roof: 'mansard', kind: 'arch', rows: 3, bay: 1.45, ww: 0.46, plinth: base, sill: 0.5 };
  // the Danube wing, north and south blocks, the Lion Court wings and the far western wing
  wing(k, { ...classical, y: T, z: 7.2, len: 52, dep: 4.6, h: 5.0, roofH: 2.0 });
  for (const s of [-1, 1]) wing(k, { ...classical, y: T, x: s * 31, z: 0.8, len: 11, dep: 17, h: 5.0, roofH: 2.2 });
  wing(k, { ...classical, y: T, z: -12.2, len: 30, dep: 4.2, h: 4.8, roofH: 1.9 });
  for (const s of [-1, 1]) wing(k, { ...classical, y: T, x: s * 13.3, z: -3.2, ry: Math.PI / 2, len: 13.6, dep: 4.0, h: 4.8, roofH: 1.9, ends: false });
  wing(k, { ...classical, y: T, x: 30, z: -11.6, len: 11, dep: 4.0, h: 4.4, roofH: 1.8 });
  // pilasters and a statue-topped balustrade along the river front
  for (const x of line(27, -25.6, 25.6)) k.box(0.22, 4.6, 0.14, trim, x, T + 0.4, 9.56, { ink: 'fine' });
  statueRow(k, [-25, 9.5], [-7.5, 9.5], T + 5.25, 9, mat(0xf0e8d4), 0.65);
  statueRow(k, [7.5, 9.5], [25, 9.5], T + 5.25, 9, mat(0xf0e8d4), 0.65);
  // corner pavilions on the river front
  for (const s of [-1, 1]) {
    k.box(4.6, 5.8, 1.4, wall, s * 23.4, T, 9.9);
    k.cornice(4.6, 1.4, T + 5.7, trim, s * 23.4, 9.9);
    k.gable(4.8, 1.0, 1.5, trim, s * 23.4, T + 5.92, 9.9);
  }

  // central domed block with its columned portico
  k.box(13, 6.2, 10, wall, 0, T, 4.6);
  k.cornice(13, 10, T + 6.1, trim, 0, 4.6);
  k.box(13.2, 0.9, 10.2, trim, 0, T + 6.3, 4.6);   // attic
  k.box(10.4, 1.0, 1.6, base, 0, T, 10.6);
  for (const x of line(8, -4.6, 4.6)) k.column(x, T + 1.0, 10.8, 4.6, 0.26, trim);
  k.box(10.6, 0.7, 1.9, trim, 0, T + 5.6, 10.7);
  k.gable(10.6, 1.6, 1.9, trim, 0, T + 6.3, 10.7);
  k.panes([[0, T + 6.5, 11.66, 0]], { w: 7.6, h: 1.0, kind: 'rect', m: mat(0xc9b98f) });
  k.windows({ from: [-3.4, 9.62], to: [3.4, 9.62], cols: 3, rows: 2, dy: 2.2, y: T + 1.3, face: 0, w: 0.9, h: 1.7, frame: trim });
    // drum with paired columns, attic, ribbed copper dome, lantern and the crown
  const dz = 3.2, dy = T + 7.2, R = 3.5;
  k.cyl(R, R, 3.2, wall, 0, dy, dz, 32);
  k.ring(16, R, dy + 0.55, 0, dz, { w: 0.5, h: 1.6, frame: trim });
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * TAU;
    for (const d of [-0.11, 0.11]) k.column(Math.sin(a + d) * (R + 0.3), dy, dz + Math.cos(a + d) * (R + 0.3), 3.0, 0.11, trim, 8);
  }
  k.cyl(R + 0.55, R + 0.55, 0.35, trim, 0, dy + 3.0, dz, 32);
  k.cyl(R - 0.1, R, 0.8, wall, 0, dy + 3.35, dz, 32);
  const domeY = dy + 4.15;
  ribbedDome(k, R - 0.1, 4.4, copper, faceted(0x8cc0ae), 0, domeY, dz, { n: 16, point: 0.25, seg: 32 });
  const lr = 0.8, ly = domeY + domeAt(R - 0.1, 4.4, lr + 0.1, 0.25);
  k.cyl(lr, lr, 1.5, wall, 0, ly, dz, 16);
  k.ring(8, lr, ly + 0.3, 0, dz, { w: 0.24, h: 0.8, frame: trim, pad: 0.05 });
  k.dome(lr + 0.1, 0.9, copper, 0, ly + 1.5, dz, 16);
  k.lathe([[0.32, 0], [0.4, 0.25], [0.3, 0.45], [0.12, 0.55], [0.06, 0.9], [0, 1.1]], gold, 0, ly + 2.3, dz, 12);
  k.sphere(0.12, gold, 0, ly + 3.5, dz, { ink: 'fine' });
  // Prince Eugene of Savoy on horseback in front of the dome, the Turul bird at the north gate
  k.box(2.0, 1.6, 3.0, mat(0xd9cdb0), 0, T, 15.9 - 2.4);
  k.rider(0, T + 1.6, 13.5, 0, 2.2, bronze);
  k.box(1.4, 3.0, 1.4, mat(0xd9cdb0), -36.4, T, 11.6);
  const turul = k.at(-36.4, T + 3.0, 11.6, 0);
  turul.box(0.3, 0.5, 0.9, bronze, 0, 0, 0);
  turul.sphere(0.18, bronze, 0, 0.6, 0.45);
  for (const s of [-1, 1]) turul.box(2.0, 0.08, 0.6, bronze, s * 1.0, 0.55, 0, { rz: s * 0.55, ink: 'fine' });
}

/* =====================================================================
 *  Fisherman's Bastion (≈ 140 m of terraces, seven conical towers)
 *  Runs along x following the east edge of Castle Hill; +z looks out over the Danube.
 * ===================================================================== */
export function bastion(k) {
  const white = mat(0xf3efe5), stone = mat(0xe4ddcc), cap = faceted(0xb4bcc2), gold = metal(C.gold), bronze = metal(0x51806d), floor = mat(0xd8d0bf);
  // hillside below the walls
  k.g.box(42, 1.2, 14, mat(C.grass), 0, -1.2, 1);
  const P = [[-17.5, -3.2], [-12, -1.6], [-6.5, 0.9], [-1.5, 2.4], [3.5, 2.4], [8.5, 0.6], [13, -1.2], [17.5, -3.4]];
  const lowH = 2.0, upY = lowH + 0.2;
  P.slice(1).forEach(([bx, bz], i) => {
    const [ax, az] = P[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const f = k.at((ax + bx) / 2, 0, (az + bz) / 2, ry);
    // lower bastion wall with a deep arcade, the terrace, and the upper cloister with its crenellated parapet
    f.box(L + 0.6, lowH, 2.2, stone, 0, 0, -1.1);
    f.arcade(L, lowH - 0.2, 0.3, Math.max(2, Math.round(L / 1.25)), 0.72, 1.4, white, 0, 0, 0.35);
    f.box(L + 0.6, 0.2, 3.4, floor, 0, lowH, -0.9);
    f.arcade(L, 1.7, 0.26, Math.max(3, Math.round(L / 0.72)), 0.44, 1.18, white, 0, upY, 0.55);
    f.box(L + 0.1, 0.18, 0.4, white, 0, upY + 1.7, 0.55);
    for (const t of line(Math.max(3, Math.round(L / 0.5)), -L / 2 + 0.15, L / 2 - 0.15)) f.box(0.22, 0.26, 0.36, white, t, upY + 1.88, 0.55, { ink: 'fine' });
    // inner arcade on the church side
    f.arcade(L, 1.7, 0.2, Math.max(3, Math.round(L / 0.9)), 0.5, 1.2, white, 0, upY, -2.4);
    f.box(L + 0.1, 0.3, 3.2, cap, 0, upY + 1.7, -0.92, { ink: 'fine' });
  });
  // the seven towers: octagonal shafts, an arcaded belvedere and a steep conical cap; the main tower is the largest
  const towers = [[-17.5, -3.2, 0.95, 2.6], [-12, -1.6, 0.9, 2.5], [-6.5, 0.9, 1.0, 2.8], [-1.5, 2.4, 1.5, 4.4], [3.5, 2.4, 1.0, 2.8], [8.5, 0.6, 0.9, 2.5], [13, -1.2, 0.9, 2.5]];
  for (const [x, z, r, hh] of towers) {
    const big = r > 1.2, top = upY + hh;
    k.cyl(r, r * 1.08, top, white, x, 0, z, 8);
    k.ring(8, r, upY + 0.4, x, z, { w: r * 0.28, h: r * 0.9, frame: stone, pad: 0.05 });
    k.cyl(r * 1.18, r * 1.18, 0.18, stone, x, top, z, 8);
    k.cyl(r * 1.02, r * 1.02, r * 1.1, white, x, top + 0.18, z, 8);
    k.ring(8, r * 1.02, top + 0.32, x, z, { w: r * 0.4, h: r * 0.7, frame: stone, pad: 0.04 });
    k.cyl(r * 1.22, r * 1.22, 0.14, stone, x, top + 0.18 + r * 1.1, z, 8);
    const cy = top + 0.32 + r * 1.1, ch = big ? 5.2 : r * 3.2;
    k.cone(r * 1.3, ch, cap, x, cy, z, 8);
    k.lathe([[0.07, 0], [0.12, 0.15], [0.03, 0.35], [0, 0.6]], gold, x, cy + ch - 0.05, z, 8, { ink: 'fine' });
    if (big) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, tx = x + Math.sin(a) * r * 1.15, tz = z + Math.cos(a) * r * 1.15;
      k.cyl(0.32, 0.32, 1.6, white, tx, top - 0.3, tz, 8);
      k.cone(0.42, 1.8, cap, tx, top + 1.3, tz, 8);
    }
  }
  // Schulek stairs down at the south end and King St Stephen on horseback behind the bastion
  for (let i = 0; i < 8; i++) k.box(1.8, lowH * (8 - i) / 8, 0.5, white, -19.8 - i * 0.48 * 0.6, 0, -4.2 + i * 0.5, { ink: i ? false : undefined });
  k.box(2.0, 1.4, 3.2, stone, -9, 0, -5.4);
  k.box(2.3, 0.25, 3.5, white, -9, 1.4, -5.4);
  k.rider(-9, 1.65, -5.4, Math.PI / 2, 2.2, bronze);
}

/* =====================================================================
 *  Matthias Church (≈ 60 m long, main tower 80 m)
 *  Nave along z, west front at +z on Holy Trinity Square; the great tower stands at the front right (+x).
 * ===================================================================== */
export function matthias(k) {
  const stone = mat(0xeee7d6), trim = mat(0xdcd2b8), tile = zsolnay(['#e8dcc0', '#b5482c', '#d6a33a', '#2f6f63', '#2e3d55'], 1.4), gold = metal(C.gold), slate = faceted(0x6d7680);
  k.g.box(26, 0.35, 32, mat(0xc9c1ae), 0, -0.35, 0.5);
  const W = 7.0, z0 = -5.0, z1 = 6.5, L = z1 - z0, H = 5.4, mid = (z0 + z1) / 2;
  // hall church: nave and aisles under one steep Zsolnay roof
  k.box(W, H, L, stone, 0, 0, mid);
  k.cornice(W, L, H - 0.1, trim, 0, mid, 0.14);
  k.gable(W + 0.4, 5.6, L + 0.1, tile, 0, H + 0.1, mid);
  for (const z of line(6, z0 + 1, z1 - 1.4)) k.pinnacle(0, H + 5.6, z, 0.5, 0.05, gold);
  // polygonal apse with its own tiled roof
  k.cyl(3.2, 3.2, H * 0.94, stone, 0, 0, z0, 8, { ry: Math.PI / 8 });
  k.cone(3.5, 4.6, tile, 0, H * 0.94, z0, 8, { ry: Math.PI / 8 });
  k.ring(8, 3.2, 1.0, 0, z0, { w: 0.62, h: 3.0, kind: 'pointed', frame: trim });
  // buttresses with pinnacles, tall pointed windows between them
  const bays = line(6, z0 + 0.4, z1 - 2.6);
  for (const s of [-1, 1]) {
    for (const z of bays) { k.box(0.55, H + 0.2, 0.5, stone, s * (W / 2 + 0.24), 0, z); k.pinnacle(s * (W / 2 + 0.24), H + 0.15, z, 1.5, 0.15, trim); }
    k.windows({ from: [s * W / 2, z0 + 1.35], to: [s * W / 2, z1 - 3.55], cols: 5, y: 1.1, face: s * Math.PI / 2, w: 0.78, h: 3.2, kind: 'pointed', frame: trim });
  }
  // chapels on the south side, each under a small tiled gable
  for (const z of [-2.6, 0, 2.6]) {
    k.box(1.8, 3.6, 2.2, stone, W / 2 + 0.9, 0, z);
    k.gable(2.4, 1.8, 2.0, tile, W / 2 + 1.0, 3.6, z, Math.PI / 2);
    k.panes([[W / 2 + 1.82, 1.0, z, Math.PI / 2]], { w: 0.7, h: 2.0, kind: 'pointed', frame: trim });
  }
  // west front: stone gable, rose window, deep pointed portal
  k.gable(W + 0.3, 5.6, 0.5, stone, 0, H + 0.1, z1 + 0.25);
  k.panes([[0, H - 0.8, z1 + 0.52, 0]], { w: 2.6, h: 2.6, kind: 'round', frame: trim, pad: 0.24 });
  k.panes([[0, 0.05, z1 + 0.52, 0]], { w: 1.7, h: 3.3, kind: 'pointed', frame: trim, pad: 0.34 });
  k.box(2.9, 0.18, 0.6, trim, 0, 3.65, z1 + 0.3);
  for (const s of [-1, 1]) k.pinnacle(s * (W / 2 + 0.1), H + 0.1, z1 + 0.2, 1.8, 0.16, trim);
  k.pinnacle(0, H + 5.6, z1 + 0.25, 1.4, 0.12, trim);
  // the great tower: square shaft with corner buttresses, an open octagon and a crocketed stone spire
  const tx = W / 2 + 0.9, tz = z1 - 1.3, ts = 3.4;
  k.box(ts, 11.4, ts, stone, tx, 0, tz);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.box(0.55, 10.4, 0.55, stone, tx + cx * ts / 2, 0, tz + cz * ts / 2); k.pinnacle(tx + cx * ts / 2, 10.4, tz + cz * ts / 2, 1.6, 0.16, trim); }
  for (const [face, ox, oz] of [[0, 0, ts / 2], [Math.PI / 2, ts / 2, 0], [Math.PI, 0, -ts / 2]]) {
    k.panes([[tx + ox, 3.0, tz + oz, face], [tx + ox, 6.0, tz + oz, face]], { w: 0.55, h: 1.5, kind: 'pointed', frame: trim });
    k.panes([[tx + ox, 8.8, tz + oz, face]], { w: 1.4, h: 2.0, kind: 'round', frame: trim });
  }
  k.box(ts + 0.5, 0.3, ts + 0.5, trim, tx, 11.4, tz);
  k.balustrade([tx - 1.9, tz + 1.9], [tx + 1.9, tz + 1.9], 11.7, 0.5, trim);
  k.balustrade([tx + 1.9, tz - 1.9], [tx + 1.9, tz + 1.9], 11.7, 0.5, trim);
  k.cyl(1.75, 1.75, 3.6, stone, tx, 11.7, tz, 8, { ry: Math.PI / 8 });
  k.ring(8, 1.75, 12.1, tx, tz, { w: 0.6, h: 2.6, kind: 'pointed', frame: trim, pad: 0.06 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.pinnacle(tx + Math.sin(a) * 1.8, 15.2, tz + Math.cos(a) * 1.8, 1.4, 0.1, trim); }
  k.cyl(1.9, 1.9, 0.22, trim, tx, 15.3, tz, 8, { ry: Math.PI / 8 });
  k.cone(1.7, 5.6, stone, tx, 15.5, tz, 8, { ry: Math.PI / 8 });
  for (let i = 0; i < 8; i++) for (const t of [0.25, 0.5, 0.75]) {   // crockets up the spire's ridges
    const a = (i / 8) * TAU, r = 1.7 * (1 - t) + 0.08;
    k.box(0.16, 0.16, 0.16, trim, tx + Math.sin(a) * r, 15.5 + 5.6 * t, tz + Math.cos(a) * r, { ink: false });
  }
  k.lathe([[0.14, 0], [0.22, 0.25], [0.06, 0.55], [0.12, 0.7], [0, 1.2]], gold, tx, 21.0, tz, 10, { ink: 'fine' });
  // Béla tower at the front left: Romanesque, with a tiled octagonal spire
  const bx = -(W / 2 + 0.5), bz = z1 - 0.9;
  k.box(2.2, 5.8, 2.2, stone, bx, 0, bz);
  k.cyl(1.15, 1.15, 2.0, stone, bx, 5.8, bz, 8, { ry: Math.PI / 8 });
  k.ring(8, 1.15, 6.2, bx, bz, { w: 0.3, h: 1.0, frame: trim, pad: 0.05 });
  k.cone(1.35, 3.6, tile, bx, 7.8, bz, 8, { ry: Math.PI / 8 });
  k.sphere(0.12, gold, bx, 11.45, bz, { ink: 'fine' });
}

/** Any lathe profile with `n` ribs running up it (onion domes, cupolas). */
function ribbedLathe(k, prof, m, ribM, x, y, z, { n = 12, seg = 24, rib = 0.04 } = {}) {
  k.lathe(prof, m, x, y, z, seg);
  const outer = prof.slice(0, -1).map(([r, py]) => [r * 1.02, py]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    k.tube(outer.map(([r, py]) => [x + Math.sin(a) * r, y + py, z + Math.cos(a) * r]), rib, ribM, { ink: 'fine' });
  }
}

/** A cross on top of a dome or tower. */
function cross(k, x, y, z, s, m) {
  k.box(0.08 * s, 1.0 * s, 0.08 * s, m, x, y, z, { ink: 'fine' });
  k.box(0.5 * s, 0.08 * s, 0.08 * s, m, x, y + 0.62 * s, z, { ink: 'fine' });
}

/** Classical portico: `n` columns across `w`, standing at z on height y, with entablature and pediment. */
function portico(k, { x = 0, y = 0, z, w, n, h, r = 0.26, depth = 1.8, m, pedM = m, tympanum = null }) {
  for (const cx of line(n, x - w / 2 + r * 1.6, x + w / 2 - r * 1.6)) k.column(cx, y, z + depth / 2 - r * 1.6, h, r, m);
  k.box(w + 0.3, h * 0.13, depth + 0.3, m, x, y + h, z);
  k.gable(w + 0.4, h * 0.3, depth + 0.4, pedM, x, y + h * 1.13, z);
  if (tympanum) k.panes([[x, y + h * 1.17, z + depth / 2 + 0.22, 0]], { w: w * 0.62, h: h * 0.16, kind: 'rect', m: tympanum });
}

/* =====================================================================
 *  St Stephen's Basilica (97 × 61 m, dome 96 m)
 *  Greek cross with a longer front-to-back arm; the west front with its two bell towers is at +z.
 * ===================================================================== */
export function basilica(k) {
  const stone = mat(0xece3cd), trim = mat(0xdcd0b2), roofM = faceted(0x6c7c78), green = faceted(0x5c9a85), ribM = faceted(0x9ccdb9), gold = metal(C.gold);
  k.g.box(30, 0.35, 36, mat(0xd2c9b4), 0, -0.35, 1.5);
  const H = 7.2, cz = -1.6;
  // nave arm and transept, each with a low pitched roof and pedimented ends
  k.box(9.4, H, 19.6, stone, 0, 0, -1.4);
  k.box(15.2, H, 9.2, stone, 0, 0, cz);
  k.cornice(9.4, 19.6, H - 0.1, trim, 0, -1.4);
  k.cornice(15.2, 9.2, H - 0.1, trim, 0, cz);
  k.gable(9.9, 2.0, 19.8, roofM, 0, H + 0.15, -1.4);
  k.gable(9.6, 2.0, 15.6, roofM, 0, H + 0.15, cz, Math.PI / 2);
  for (const s of [-1, 1]) {
    k.gable(9.6, 2.0, 0.4, stone, s * 7.75, H + 0.15, cz, Math.PI / 2);
    for (const z of line(5, cz - 3.8, cz + 3.8)) k.box(0.16, H - 0.6, 0.45, trim, s * 7.65, 0.6, z, { ink: 'fine' });
    k.windows({ from: [s * 7.6, cz - 2.8], to: [s * 7.6, cz + 2.8], cols: 3, rows: 2, dy: 3.0, y: 1.1, face: s * Math.PI / 2, w: 0.9, h: 2.0, frame: trim });
    k.windows({ from: [s * 4.7, -9.6], to: [s * 4.7, -6.8], cols: 2, rows: 2, dy: 3.0, y: 1.1, face: s * Math.PI / 2, w: 0.8, h: 1.9, frame: trim });
  }
  // apse at the east end with a half dome
  k.cyl(3.7, 3.7, H * 0.82, stone, 0, 0, -11.2, 32);
  k.dome(3.85, 2.2, roofM, 0, H * 0.82 + 0.1, -11.2, 32);
  k.cyl(3.95, 3.95, 0.2, trim, 0, H * 0.82 - 0.1, -11.2, 32);
  k.ring(12, 3.7, 1.3, 0, -11.2, { w: 0.6, h: 2.0, frame: trim });
  // west front: portico between the bell towers, then the steps down to Szent István tér
  portico(k, { z: 8.9, w: 6.2, n: 6, h: 5.4, y: 0.9, r: 0.3, depth: 2.0, m: trim });
  k.box(7, 0.9, 3.2, stone, 0, 0, 8.6);
  k.statue(0, 0.9 + 5.4 * 1.43, 9.6, 1.0, mat(0xf2ebda));
  k.panes([[0, 0.9, 8.32, 0]], { w: 1.6, h: 3.4, frame: trim, pad: 0.22 });
  stairs(k, 8.4, 4, 0.9, trim, 0, 11.6, 0.4);
  for (const s of [-1, 1]) {
    const tx = s * 5.6, tz = 7.6;
    k.box(3.8, 12.0, 3.8, stone, tx, 0, tz);
    for (const ox of [-1.75, 1.75]) k.box(0.3, 11.4, 0.2, trim, tx + ox, 0.4, tz + 1.95, { ink: 'fine' });
    k.panes([[tx, 3.4, tz + 1.92, 0], [tx, 7.4, tz + 1.92, 0]], { w: 0.9, h: 2.2, frame: trim });
    k.panes([[tx + s * 1.92, 3.4, tz, s * Math.PI / 2], [tx + s * 1.92, 7.4, tz, s * Math.PI / 2]], { w: 0.9, h: 2.2, frame: trim });
    k.cornice(3.8, 3.8, 12.0, trim, tx, tz);
    // belfry with corner columns and arched openings, a clock, then the cupola
    k.box(3.2, 3.2, 3.2, stone, tx, 12.3, tz);
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) k.column(tx + ox, 12.3, tz + oz, 3.1, 0.18, trim, 10);
    for (const f of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) k.panes([[tx + Math.sin(f) * 1.62, 12.8, tz + Math.cos(f) * 1.62, f]], { w: 1.3, h: 2.2, frame: trim });
    k.cornice(3.2, 3.2, 15.5, trim, tx, tz);
    k.panes([[tx, 15.9, tz + 1.4, 0]], { w: 1.0, h: 1.0, kind: 'round', m: mat(0xf4ecd8), frame: metal(C.gold), pad: 0.08 });
    k.cyl(1.3, 1.4, 1.2, stone, tx, 15.8, tz, 8);
    k.dome(1.5, 1.9, green, tx, 17.0, tz, 16);
    k.cyl(0.42, 0.42, 0.8, stone, tx, 18.7, tz, 8);
    k.dome(0.5, 0.6, green, tx, 19.5, tz, 12);
    cross(k, tx, 20.05, tz, 1.0, gold);
  }
  // the dome: attic, drum ringed by paired columns, ribbed copper dome, lantern, cross
  const dy = H + 0.2, R = 4.5;
  k.cyl(R + 0.8, R + 0.9, 1.2, stone, 0, dy, cz, 32);
  k.cyl(R, R, 4.4, stone, 0, dy + 1.2, cz, 32);
  k.ring(16, R, dy + 1.8, 0, cz, { w: 0.6, h: 2.3, frame: trim });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    for (const d of [-0.07, 0.07]) k.column(Math.sin(a + d) * (R + 0.35), dy + 1.2, cz + Math.cos(a + d) * (R + 0.35), 4.1, 0.14, trim, 8);
  }
  k.cyl(R + 0.65, R + 0.65, 0.4, trim, 0, dy + 5.3, cz, 32);
  k.cyl(R + 0.1, R + 0.2, 0.7, stone, 0, dy + 5.7, cz, 32);
  const domeY = dy + 6.4, domeH = 5.6;
  ribbedDome(k, R, domeH, green, ribM, 0, domeY, cz, { n: 16, point: 0.15, seg: 32 });
  const lr = 1.0, ly = domeY + domeAt(R, domeH, lr + 0.15, 0.15);
  k.cyl(lr, lr, 1.9, stone, 0, ly, cz, 16);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; k.column(Math.sin(a) * (lr + 0.1), ly, cz + Math.cos(a) * (lr + 0.1), 1.8, 0.07, trim, 6); }
  k.cyl(lr + 0.18, lr + 0.18, 0.18, trim, 0, ly + 1.85, cz, 16);
  k.dome(lr + 0.05, 1.0, green, 0, ly + 2.0, cz, 16);
  k.sphere(0.2, gold, 0, ly + 3.15, cz, { ink: 'fine' });
  cross(k, 0, ly + 3.3, cz, 1.3, gold);
}

/* =====================================================================
 *  Hungarian State Opera (≈ 108 × 53 m, stage tower 51 m)
 *  Front on Andrássy út at +z: arcaded carriage porch, loggia with muses, then auditorium dome and stage tower.
 * ===================================================================== */
export function opera(k) {
  const stone = mat(0xebdfc0), rust = mat(0xd6c59d), trim = mat(0xf2e9d2), roofM = faceted(0x56786f), copper = faceted(C.copper), gold = metal(C.gold), bronze = metal(0x55705f);
  k.g.box(22, 0.35, 34, mat(0xcfc6b2), 0, -0.35, 1.5);
  const classic = { wall: stone, trim, roofM, roof: 'mansard', rows: 3, bay: 1.35, ww: 0.5, plinth: rust, sill: 0.5 };
  // front block, side wings along the streets, back wing
  wing(k, { ...classic, z: 9.0, len: 13.2, dep: 6.8, h: 5.8, roofH: 1.8 });
  for (const s of [-1, 1]) wing(k, { ...classic, x: s * 5.1, z: -1.6, ry: Math.PI / 2, len: 14.6, dep: 3.0, h: 5.2, roofH: 1.5, ends: false });
  wing(k, { ...classic, z: -10.8, len: 13.2, dep: 4.2, h: 5.4, roofH: 1.6 });
  // corner pavilions of the front, a little taller, with steep domed roofs
  for (const s of [-1, 1]) {
    k.box(2.8, 6.6, 2.8, stone, s * 5.4, 0, 11.3);
    k.cornice(2.8, 2.8, 6.5, trim, s * 5.4, 11.3);
    k.roof(3.1, 3.1, 1.2, 1.2, 1.8, roofM, s * 5.4, 6.75, 11.3);
    k.sphere(0.25, gold, s * 5.4, 8.75, 11.3, { ink: 'fine' });
    k.panes([[s * 5.4, 1.0, 12.72, 0], [s * 5.4, 3.6, 12.72, 0]], { w: 0.8, h: 1.6, frame: trim });
  }
  // the carriage porch: three arches below, a five-bay loggia above, a balustrade with statues of the muses
  k.box(6.6, 2.7, 1.8, rust, 0, 0, 13.2);
  k.arcade(6.6, 2.7, 0.3, 3, 1.4, 2.2, rust, 0, 0, 14.2);
  k.box(6.6, 3.0, 1.2, stone, 0, 2.7, 12.9);
  k.arcade(6.6, 2.8, 0.25, 5, 0.85, 2.1, stone, 0, 2.7, 13.6);
  for (const x of line(6, -3.1, 3.1)) k.column(x, 2.75, 13.75, 2.6, 0.12, trim, 10);
  k.box(6.9, 0.35, 2.2, trim, 0, 5.5, 13.2);
  k.balustrade([-3.3, 14.15], [3.3, 14.15], 5.85, 0.45, trim);
  statueRow(k, [-3.1, 14.15], [3.1, 14.15], 6.3, 8, mat(0xf3ecdb), 0.8);
  k.panes([[0, 0.3, 13.0, 0]], { w: 4.6, h: 2.0, kind: 'rect' });
  // Liszt and Erkel in their niches beside the porch
  for (const s of [-1, 1]) {
    k.panes([[s * 3.9, 0.6, 12.42, 0]], { w: 0.9, h: 2.0, m: mat(0x9a8a6c), frame: trim });
    k.statue(s * 3.9, 0.7, 12.55, 1.6, bronze);
  }
  // auditorium under its low copper dome, the fly tower behind it
  k.cyl(5.0, 5.0, 7.0, stone, 0, 0, 1.6, 24);
  k.cyl(5.25, 5.25, 0.3, trim, 0, 6.9, 1.6, 24);
  k.dome(5.0, 1.9, copper, 0, 7.2, 1.6, 24, { point: 0.1 });
  k.cyl(0.6, 0.65, 0.8, stone, 0, 9.0, 1.6, 12);
  k.dome(0.7, 0.7, copper, 0, 9.8, 1.6, 12);
  k.lathe([[0.15, 0], [0.22, 0.2], [0, 0.6]], gold, 0, 10.45, 1.6, 8);
  k.box(12, 10.8, 6.6, rust, 0, 0, -5.4);
  k.cornice(12, 6.6, 10.7, trim, 0, -5.4);
  k.hip(12.4, 7.0, 1.8, roofM, 0, 10.9, -5.4);
  k.windows({ from: [-4.6, -2.08], to: [4.6, -2.08], cols: 6, rows: 2, dy: 1.6, y: 7.3, face: 0, w: 0.5, h: 1.0, frame: trim });
  for (const s of [-1, 1]) k.statue(s * 5.6, 11.0, -2.1, 1.0, gold);   // the gilded figures on the stage tower
  stairs(k, 6.4, 3, 0.45, trim, 0, 15.6, 0.45);
}

/* =====================================================================
 *  Dohány Street Synagogue (≈ 75 × 27 m, towers 43 m)
 *  Nave along z; the twin-towered front is at +z.
 * ===================================================================== */
export function synagogue(k) {
  const bands = banded('#eddfbb', '#b8553a', 0.7), cream = mat(0xeee3c6), trim = mat(0xd8c7a0), roofM = faceted(0x7c8b92), gold = faceted(0xd5a23b), goldR = metal(0xf0c75a), dark = faceted(0x2f5e66);
  k.g.box(16, 0.35, 26, mat(0xcdc5b0), 0, -0.35, 0.5);
  const W = 7.0, z0 = -9.4, z1 = 7.4, L = z1 - z0, H = 5.4, mid = (z0 + z1) / 2;
  k.box(W, H, L, bands, 0, 0, mid);
  k.cornice(W, L, H - 0.1, cream, 0, mid, 0.14);
  k.gable(W + 0.3, 1.7, L + 0.1, roofM, 0, H + 0.12, mid);
  // Moorish cresting along the eaves and pilasters with little domed finials
  for (const s of [-1, 1]) {
    for (const z of line(Math.round(L / 0.55), z0 + 0.3, z1 - 0.3)) k.box(0.16, 0.34, 0.16, cream, s * (W / 2 + 0.05), H + 0.12, z, { ink: false });
    for (const z of line(6, z0 + 0.6, z1 - 0.6)) {
      k.box(0.32, H + 0.4, 0.32, cream, s * (W / 2 + 0.08), 0, z);
      k.lathe([[0.18, 0], [0.22, 0.15], [0.12, 0.42], [0, 0.66]], gold, s * (W / 2 + 0.08), H + 0.4, z, 8, { ink: 'fine' });
    }
    k.windows({ from: [s * W / 2, z0 + 2.0], to: [s * W / 2, z1 - 2.0], cols: 5, y: 0.6, face: s * Math.PI / 2, w: 0.7, h: 1.4, frame: cream });
    k.windows({ from: [s * W / 2, z0 + 2.0], to: [s * W / 2, z1 - 2.0], cols: 5, y: 2.6, face: s * Math.PI / 2, w: 0.9, h: 2.1, frame: cream });
  }
  k.panes([[0, 2.2, z0 - 0.02, Math.PI]], { w: 2.0, h: 2.0, kind: 'round', frame: cream, pad: 0.15 });
  // front: projecting centre with three portals, a rose window and the Tablets of the Law on the gable
  k.box(4.6, 6.6, 1.2, bands, 0, 0, z1 + 0.5);
  k.gable(4.8, 1.3, 1.2, cream, 0, 6.6, z1 + 0.5);
  k.windows({ from: [-1.4, z1 + 1.12], to: [1.4, z1 + 1.12], cols: 3, y: 0.2, face: 0, w: 0.9, h: 2.0, frame: cream, pad: 0.12 });
  k.panes([[0, 3.2, z1 + 1.12, 0]], { w: 2.3, h: 2.3, kind: 'round', frame: cream, pad: 0.2 });
  k.windows({ from: [-1.7, z1 + 1.12], to: [1.7, z1 + 1.12], cols: 6, y: 2.4, face: 0, w: 0.26, h: 0.6, frame: cream, pad: 0.05 });
  for (const s of [-1, 1]) k.prism(openingShape('arch', 0.42, 0.8), 0.14, cream, s * 0.24, 7.9, z1 + 0.5);
  // twin towers: banded shafts, a balcony, an arcaded drum and gilded ribbed onion domes
  for (const s of [-1, 1]) {
    const tx = s * 3.35, tz = z1 + 0.35;
    k.box(2.2, 7.2, 2.2, bands, tx, 0, tz);
    for (const [ox, oz] of [[-1.1, 1.1], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1]]) k.cyl(0.12, 0.12, 7.2, cream, tx + ox, 0, tz + oz, 8, { ink: 'fine' });
    k.panes([[tx, 1.0, tz + 1.12, 0], [tx, 3.6, tz + 1.12, 0]], { w: 0.6, h: 1.5, frame: cream });
    k.box(2.6, 0.22, 2.6, cream, tx, 7.2, tz);
    k.balustrade([tx - 1.25, tz + 1.25], [tx + 1.25, tz + 1.25], 7.42, 0.36, cream, { gap: 0.18, r: 0.035 });
    k.cyl(0.95, 0.95, 0.9, cream, tx, 7.42, tz, 12);
    k.ring(12, 0.95, 7.55, tx, tz, { w: 0.18, h: 0.55, m: dark, pad: 0.03 });
    k.cyl(1.0, 1.0, 0.1, trim, tx, 8.32, tz, 12);
    ribbedLathe(k, onionProfile(0.95), gold, goldR, tx, 8.42, tz, { n: 12, seg: 24, rib: 0.03 });
    k.sphere(0.1, goldR, tx, 11.4, tz, { ink: 'fine' });
  }
  // the memorial weeping willow in the garden beside the synagogue
  const wx = -W / 2 - 2.6, wz = -4;
  k.cyl(0.12, 0.2, 1.5, metal(0x9aa0a6), wx, 0, wz, 8);
  k.put(new THREE.IcosahedronGeometry(1.15, 1), faceted(0xc9d0d6), wx, 2.05, wz, { s: [1, 0.75, 1] });
}

/* =====================================================================
 *  Great Market Hall (≈ 150–180 × 58 m)
 *  Hall along z; the towered front on Fővám tér is at +z.
 * ===================================================================== */
export function marketHall(k) {
  const brick = mat(0xdcb76b), band = mat(0xb6532f), stone = mat(0xeee4cc), tile = zsolnay(['#e2b13a', '#b5532f', '#2d8a82', '#f2e6bf', '#3a3f6b'], 1.4), glass = lit();
  k.g.box(22, 0.35, 52, mat(0xcfc6b2), 0, -0.35, 1.5);
  const W = 14.2, z0 = -22.4, z1 = 21.6, L = z1 - z0, H = 4.6, mid = (z0 + z1) / 2;
  k.box(W, H, L, brick, 0, 0, mid);
  for (const y of [1.1, H - 0.35]) k.box(W + 0.06, 0.24, L + 0.06, band, 0, y, mid, { ink: 'fine' });
  k.cornice(W, L, H - 0.05, stone, 0, mid, 0.14);
  k.gable(W + 0.5, 4.8, L + 0.2, tile, 0, H + 0.12, mid);
  // glazed lantern along the ridge
  k.box(1.6, 0.8, L - 6, glass, 0, H + 4.3, mid, { ink: 'fine' });
  k.gable(2.1, 0.55, L - 5.8, faceted(0x6d7b80), 0, H + 5.1, mid);
  for (const s of [-1, 1]) {
    k.windows({ from: [s * W / 2, z0 + 1.6], to: [s * W / 2, z1 - 1.6], cols: 18, y: 1.45, face: s * Math.PI / 2, w: 0.85, h: 2.1, frame: stone });
    k.windows({ from: [s * W / 2, z0 + 1.6], to: [s * W / 2, z1 - 1.6], cols: 18, y: 0.25, face: s * Math.PI / 2, w: 0.8, h: 0.6, kind: 'rect', frame: stone, pad: 0.05 });
    // cross gables (dormers) down each side
    for (const z of line(7, z0 + 4, z1 - 4)) {
      k.gable(2.6, 1.6, 2.4, tile, s * (W / 2 - 0.4), H + 0.12, z, Math.PI / 2);
      k.gable(2.6, 1.6, 0.25, stone, s * (W / 2 + 0.75), H + 0.12, z, Math.PI / 2);
      k.panes([[s * (W / 2 + 0.9), H + 0.35, z, s * Math.PI / 2]], { w: 0.7, h: 0.9, frame: stone, pad: 0.06 });
    }
  }
  // back gable end
  k.panes([[0, 3.5, z0 - 0.02, Math.PI]], { w: 3.0, h: 3.0, kind: 'round', frame: stone, pad: 0.2 });
  // front: a stepped Gothic frontispiece with one huge pointed window, three portals and Zsolnay pinnacles
  const fz = z1 + 0.5, fw = 7.6;
  k.box(fw, 7.6, 1.2, brick, 0, 0, fz);
  k.box(fw + 0.06, 0.24, 1.26, band, 0, 1.1, fz, { ink: 'fine' });
  k.prism(poly([[-fw / 2, 0], [fw / 2, 0], [fw / 2, 0.9], [fw / 2 - 0.9, 0.9], [fw / 2 - 0.9, 1.9], [fw / 2 - 1.8, 1.9], [fw / 2 - 1.8, 2.9], [0.9, 2.9], [0.9, 3.4],
    [-0.9, 3.4], [-0.9, 2.9], [-fw / 2 + 1.8, 2.9], [-fw / 2 + 1.8, 1.9], [-fw / 2 + 0.9, 1.9], [-fw / 2 + 0.9, 0.9], [-fw / 2, 0.9]]), 1.2, brick, 0, 7.6, fz);
  for (const [x, y] of [[-fw / 2 + 0.45, 8.5], [fw / 2 - 0.45, 8.5], [-fw / 2 + 1.35, 9.5], [fw / 2 - 1.35, 9.5], [0, 11.0]]) k.pinnacle(x, y, fz + 0.3, 1.2, 0.14, tile);
  k.panes([[0, 2.0, fz + 0.62, 0]], { w: 4.4, h: 6.4, kind: 'pointed', frame: stone, pad: 0.26 });
  for (const x of [-1.1, 0, 1.1]) k.box(0.1, 5.2, 0.08, stone, x, 2.1, fz + 0.66, { ink: false });
  k.windows({ from: [-2.4, fz + 0.62], to: [2.4, fz + 0.62], cols: 3, y: 0.0, face: 0, w: 1.3, h: 1.8, frame: stone, pad: 0.14 });
  // corner towers with tiled spires
  for (const s of [-1, 1]) {
    const tx = s * (W / 2 + 0.3), tz = z1 + 0.1;
    k.box(2.6, 7.6, 2.6, brick, tx, 0, tz);
    for (const y of [1.1, 4.6, 7.3]) k.box(2.66, 0.24, 2.66, band, tx, y, tz, { ink: 'fine' });
    k.panes([[tx, 1.7, tz + 1.32, 0], [tx, 5.0, tz + 1.32, 0]], { w: 0.6, h: 1.6, kind: 'pointed', frame: stone });
    k.panes([[tx + s * 1.32, 1.7, tz, s * Math.PI / 2], [tx + s * 1.32, 5.0, tz, s * Math.PI / 2]], { w: 0.6, h: 1.6, kind: 'pointed', frame: stone });
    k.cornice(2.6, 2.6, 7.6, stone, tx, tz);
    k.pyramid(2.9, 2.9, 4.4, tile, tx, 7.85, tz);
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) k.pinnacle(tx + ox, 7.85, tz + oz, 1.3, 0.12, tile);
    k.pinnacle(tx, 12.2, tz, 0.9, 0.06, metal(C.gold));
  }
}

/* =====================================================================
 *  Gellért Hotel and Baths (≈ 190 × 110 m)
 *  x runs west to east: the hotel's Danube front is at +x, the baths and the wave pool behind it at -x;
 *  +z is the Kelenhegyi út side with the bath entrance dome.
 * ===================================================================== */
export function gellert(k) {
  const wall = mat(0xeee6cf), trim = mat(0xd9ccab), roofM = faceted(0x55776f), copper = faceted(C.copper), ribM = faceted(0x93c7b4), gold = metal(C.gold),
    tile = mat(0x2ea9a0), deck = mat(0xe2d9c4);
  k.g.box(54, 0.35, 32, mat(0x8fa36c), 0, -0.35, 0);
  const art = { wall, trim, roofM, roof: 'mansard', rows: 4, bay: 1.3, ww: 0.42, plinth: trim, sill: 0.5 };
  // the hotel, its long front facing the river (+x)
  wing(k, { ...art, x: 18.6, z: 0, ry: Math.PI / 2, len: 26, dep: 8.4, h: 6.2, roofH: 2.0, rows: 5 });
  // central entrance tower with a copper dome and lantern
  k.box(4.6, 8.6, 3.6, wall, 23.4, 0, 0);
  k.cornice(3.6, 4.6, 8.5, trim, 23.4, 0);
  k.panes([[25.22, 0.3, 0, Math.PI / 2]], { w: 2.4, h: 3.6, frame: trim, pad: 0.2 });
  k.windows({ from: [25.22, -1.2], to: [25.22, 1.2], cols: 3, rows: 2, dy: 1.6, y: 4.6, face: Math.PI / 2, w: 0.5, h: 1.1, frame: trim });
  k.cyl(1.7, 1.8, 1.2, wall, 23.4, 8.8, 0, 16);
  ribbedDome(k, 1.8, 2.6, copper, ribM, 23.4, 10.0, 0, { n: 12, point: 0.3, seg: 24 });
  k.cyl(0.4, 0.4, 0.9, wall, 23.4, 12.4, 0, 8);
  k.lathe([[0.45, 0], [0.5, 0.2], [0.12, 0.9], [0, 1.4]], copper, 23.4, 13.3, 0, 8);
  // corner towers of the hotel front, each under a smaller dome
  for (const s of [-1, 1]) {
    k.box(3.4, 7.6, 3.4, wall, 22.0, 0, s * 12.0);
    k.cornice(3.4, 3.4, 7.5, trim, 22.0, s * 12.0);
    k.panes([[23.72, 1.0, s * 12, Math.PI / 2], [23.72, 3.4, s * 12, Math.PI / 2], [23.72, 5.6, s * 12, Math.PI / 2]], { w: 0.9, h: 1.4, frame: trim });
    ribbedDome(k, 1.5, 2.0, copper, ribM, 22.0, 7.85, s * 12.0, { n: 8, point: 0.25, seg: 16 });
    k.lathe([[0.25, 0], [0.3, 0.2], [0, 0.9]], gold, 22.0, 9.75, s * 12.0, 8, { ink: 'fine' });
  }
  // bath wing along Kelenhegyi út with the entrance hall's glass dome and twin towers
  wing(k, { ...art, x: -2, z: 9.6, len: 32, dep: 5.6, h: 5.0, roofH: 1.6, rows: 3 });
  k.box(6.6, 6.4, 3.0, wall, 2.6, 0, 12.2);
  k.cornice(6.6, 3.0, 6.3, trim, 2.6, 12.2);
  k.panes([[2.6, 0.3, 13.72, 0]], { w: 3.2, h: 4.4, frame: trim, pad: 0.25 });
  k.cyl(3.0, 3.1, 1.2, wall, 2.6, 6.4, 9.6, 24);
  ribbedDome(k, 3.0, 2.8, faceted(0x9ec9d6), trim, 2.6, 7.6, 9.6, { n: 12, point: 0.2, seg: 24 });
  for (const s of [-1, 1]) {
    k.box(1.6, 8.0, 1.6, wall, 2.6 + s * 4.0, 0, 12.8);
    k.dome(1.0, 1.4, copper, 2.6 + s * 4.0, 8.0, 12.8, 16);
    k.lathe([[0.15, 0], [0, 0.6]], gold, 2.6 + s * 4.0, 9.35, 12.8, 6, { ink: 'fine' });
  }
  // north wing and the covered pool hall under its glass barrel roof
  wing(k, { ...art, x: -2, z: -11.2, len: 32, dep: 4.2, h: 4.4, roofH: 1.4, rows: 3 });
  k.box(14, 4.4, 9.0, wall, 0, 0, -1.4);
  k.cornice(14, 9.0, 4.3, trim, 0, -1.4);
  const vault = new THREE.CylinderGeometry(4.3, 4.3, 13.6, 24, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.55, 1);
  k.put(vault, faceted(0xa7d3df), 0, 4.45, -1.4);
  // the wave pool behind the hotel: a terrace, water, a colonnade along its north side
  k.box(16, 0.5, 15, deck, -16.4, 0, -1.2);
  k.box(13.2, 0.08, 11.6, tile, -16.4, 0.42, -1.2, { ink: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 11.2, 32, 24), toon({ color: 0x41c7c0 }, true));
  water.rotation.x = -Math.PI / 2; water.position.set(-16.4, 0.56, -1.2); water.receiveShadow = true; k.add(water);
  const pos = water.geometry.attributes.position, b0 = pos.array.slice();
  k.root.userData.tick = (t) => {
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(b0[i * 3] * 1.4 + t * 1.8) * 0.06 + Math.cos(b0[i * 3 + 1] * 0.8 + t) * 0.03);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
  };
  for (const x of line(11, -23.4, -9.4)) k.column(x, 0.5, -8.1, 2.4, 0.13, wall, 10);
  k.box(14.6, 0.35, 1.0, trim, -16.4, 2.9, -8.1);
}

/* =====================================================================
 *  Citadella and the Liberty Statue (fortress ≈ 220 × 70 m; statue 14 m on a 26 m pedestal)
 *  x runs west to east; the statue stands on the eastern bastion facing the river.
 * ===================================================================== */
export function citadella(k) {
  const wall = mat(0xc9bfa9), cap = mat(0xddd4c0), grass = mat(0x7d955c), stone = mat(0xe6dfce), bronze = metal(0x557d6b), dark = mat(0x3c3a3a);
  k.g.roof(72, 30, 64, 22, 3.0, mat(C.grass), 1.5, -3.0, 0);
  const ring = [[-28, 0], [-24.5, -6.8], [-20, -8.6], [18, -8.6], [23, -6.6], [26.2, 0], [23, 6.6], [18, 8.6], [-20, 8.6], [-24.5, 6.8]];
  const H = 3.2;
  ring.forEach(([ax, az], i) => {
    const [bx, bz] = ring[(i + 1) % ring.length], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const f = k.at((ax + bx) / 2, 0, (az + bz) / 2, ry);
    f.box(L + 1.0, H, 1.6, wall);
    f.box(L + 1.2, 0.3, 1.9, cap, 0, H);
    // gun ports, facing out of the fortress (local -z points inward for a clockwise ring)
    const n = Math.max(1, Math.floor(L / 2.4));
    f.windows({ from: [-L / 2 + 1.2, -0.82], to: [L / 2 - 1.2, -0.82], cols: n, y: 1.5, face: Math.PI, w: 0.3, h: 0.5, kind: 'rect', m: dark, frame: cap, pad: 0.06 });
  });
  // casemate barracks inside with grassed roofs, the gate, a flag
  for (const s of [-1, 1]) {
    k.box(36, 2.6, 3.2, wall, -1, 0, s * 5.6);
    k.box(36.2, 0.25, 3.4, grass, -1, 2.6, s * 5.6, { ink: 'fine' });
    k.windows({ from: [-17, s * 4.0], to: [15, s * 4.0], cols: 14, y: 0.5, face: s > 0 ? Math.PI : 0, w: 0.5, h: 1.2, frame: cap, pad: 0.06 });
  }
  k.box(42, 0.12, 8.0, mat(0xc8bea8), -1, 0, 0, { ink: false });
  k.box(4.2, 4.0, 2.4, wall, -2, 0, 8.6);
  k.cornice(4.2, 2.4, 4.0, cap, -2, 8.6);
  k.panes([[-2, 0, 9.82, 0]], { w: 1.8, h: 2.6, m: dark, frame: cap, pad: 0.18 });
  k.cyl(0.05, 0.05, 4.0, metal(C.slate), -2, 4.3, 8.6, 6);
  for (const [y, c] of [[7.6, 0xd6483f], [7.3, 0xf4f1ea], [7.0, 0x3f8a52]]) k.box(0.05, 0.3, 1.3, mat(c), -2, y, 9.25, { ink: false });
  // the Liberty Statue on the eastern bastion: terrace, stepped plinth, pedestal, the figure lifting a palm leaf
  const sx = 28.4;
  k.box(6.4, 1.0, 7.4, stone, sx, 0, 0);
  // drawn 1.35x so the statue reads at map scale
  const st = k.at(sx, 1.0, 0); st.base.scale(new THREE.Vector3(1.35, 1.35, 1.35));
  st.box(3.6, 0.8, 3.6, stone, 0, 0, 0);
  st.box(3.0, 0.6, 3.0, cap, 0, 0.8, 0);
  st.roof(2.2, 2.2, 1.5, 1.5, 5.6, stone, 0, 1.4, 0);
  st.box(1.9, 0.4, 1.9, cap, 0, 7.0, 0);
  const fig = st.at(0, 7.4, 0, Math.PI / 2);
  fig.lathe([[0.62, 0], [0.55, 0.7], [0.42, 1.6], [0.36, 2.3], [0.4, 2.7], [0.2, 2.95], [0, 3.0]], bronze, 0, 0, 0, 14, { ink: 'fine' });
  fig.sphere(0.24, bronze, 0, 3.2, 0, { ink: 'fine' });
  for (const s of [-1, 1]) fig.box(0.13, 1.4, 0.13, bronze, s * 0.28, 3.1, 0, { rz: -s * 0.22, ink: 'fine' });
  fig.put(new THREE.SphereGeometry(0.7, 12, 8), bronze, 0, 4.9, 0, { s: [0.35, 1.25, 0.12], ink: 'fine' });   // the palm leaf held overhead
  fig.box(0.7, 2.2, 0.08, bronze, 0, 0.9, -0.42, { rx: 0.2, ink: false });   // flowing cloak
  // the two companion figures at the pedestal's foot
  st.statue(-1.2, 0.8, 1.9, 1.7, bronze, { arm: 1.2 });
  st.statue(-1.2, 0.8, -1.9, 1.7, bronze, { arm: 0.6 });
}

/* =====================================================================
 *  Heroes' Square: the Millennium Monument between the Museum of Fine Arts (-x) and the Műcsarnok (+x)
 *  +z faces Andrássy Avenue.
 * ===================================================================== */
function museum(k, { x, z, ry, len, dep, h, cols, wall, roofM, mosaic }) {
  const f = k.at(x, 0, z, ry), trim = mat(0xf4eedf), fz = dep / 2;
  f.box(len + 0.6, 0.5, dep + 0.6, mat(C.stone));
  f.box(len, h, dep, wall, 0, 0.5);
  f.cornice(len, dep, h + 0.45, trim, 0, 0, 0.16);
  f.box(len - 0.8, 0.8, dep - 0.8, roofM, 0, h + 0.65);
  f.box(len * 0.45, 0.6, dep * 0.4, lit(), 0, h + 1.45, 0, { ink: 'fine' });
  const pw = cols * 0.95;
  f.box(pw + 0.8, 0.5, 2.4, mat(C.stone), 0, 0, fz + 1.2);
  portico(f, { z: fz + 1.2, w: pw, n: cols, h: h - 0.2, y: 0.5, r: 0.2, depth: 2.4, m: trim, tympanum: mosaic });
  for (const s of [-1, 1]) f.windows({ from: [s * (pw / 2 + 1.0), fz], to: [s * (len / 2 - 1.0), fz], cols: 3, y: 1.4, face: 0, w: 0.45, h: 1.6, kind: 'rect', frame: trim });
  stairs(f, pw, 3, 0.5, mat(C.stone), 0, fz + 3.5, 0.3);
}

export function millennium(k) {
  const stone = mat(0xebe2cc), trim = mat(0xf2ebd8), bronze = metal(0x4f8a73), gold = metal(C.gold), pave = mat(0xd5cbb4), sand = mat(C.sand);
  k.g.box(64, 0.3, 26, pave, 0, -0.3, 0);
  museum(k, { x: -24, z: -1, ry: Math.PI / 2, len: 22, dep: 9, h: 4.4, cols: 8, wall: mat(0xe9dfc3), roofM: faceted(0x7d8a90) });
  museum(k, { x: 24, z: -1, ry: -Math.PI / 2, len: 16, dep: 8, h: 4.0, cols: 6, wall: mat(0xe3d2ab), roofM: faceted(0x7d8a90), mosaic: metal(C.gold) });
  // the two quadrant colonnades, fourteen columns each with seven kings between them and chariot groups on the ends
  const R = 8.2, cz = 3.6, deg = (d) => (d * Math.PI) / 180;
  for (const s of [-1, 1]) {
    const angles = line(8, 26, 74);
    angles.forEach((a, i) => {
      const r = deg(a), x = s * R * Math.sin(r), z = cz - R * Math.cos(r);
      k.column(x, 0.4, z, 2.8, 0.15, stone, 10);
      if (i < angles.length - 1) {
        const r2 = deg(angles[i + 1]), x2 = s * R * Math.sin(r2), z2 = cz - R * Math.cos(r2), L = Math.hypot(x2 - x, z2 - z), ry = Math.atan2(-(z2 - z), x2 - x);
        k.box(L + 0.3, 0.55, 0.9, stone, (x + x2) / 2, 3.2, (z + z2) / 2, { ry });
        k.box(L + 0.3, 1.2, 0.1, sand, (x + x2) / 2 + Math.sin(ry) * 0.6, 0.6, (z + z2) / 2 + Math.cos(ry) * 0.6, { ry, ink: false });
        // a king on a pedestal in front of each bay
        const kr = deg((a + angles[i + 1]) / 2), kx = s * (R - 0.75) * Math.sin(kr), kz = cz - (R - 0.75) * Math.cos(kr);
        k.box(0.42, 0.7, 0.42, stone, kx, 0.4, kz);
        k.statue(kx, 1.1, kz, 1.0, bronze);
      }
    });
    k.box(R * 0.9, 0.4, 1.2, stone, 0, 0, 0, { ink: false });
    // end piers carrying the chariot groups
    for (const a of [20, 80]) {
      const r = deg(a), x = s * R * Math.sin(r), z = cz - R * Math.cos(r);
      k.box(1.4, 3.75, 1.4, stone, x, 0.4, z);
      const g = k.at(x, 4.15, z, s * r);
      g.box(0.5, 0.4, 0.7, bronze, 0, 0, 0.1);
      for (const dx of [-0.3, 0, 0.3]) g.box(0.12, 0.5, 0.5, bronze, dx, 0.1, 0.6, { ink: false });
      g.statue(0, 0.4, -0.1, 0.9, bronze, { arm: 0.8 });
    }
  }
  k.box(3 * R, 0.4, 2 * R, pave, 0, 0, cz - R / 2, { ink: false });
  // the column: platform with the seven chieftains, a Corinthian shaft, the Archangel Gabriel on a globe
  const mz = -0.4;
  k.cyl(4.0, 4.2, 0.4, sand, 0, 0, mz, 40);
  k.box(5.2, 0.6, 3.0, stone, 0, 0.4, mz);
  k.box(2.6, 1.4, 2.6, stone, 0, 0.4, mz);
  line(7, -1.9, 1.9).forEach((x, i) => k.rider(x, 1.0, mz + 1.1 - Math.abs(x) * 0.25, (x / 1.9) * 0.4, 1.15, bronze));
  k.lathe([[0.75, 0], [0.75, 0.35], [0.58, 0.5], [0.5, 0.7], [0.4, 8.6], [0.6, 8.9], [0.7, 9.3], [0.7, 9.5]], stone, 0, 1.8, mz, 20);
  k.sphere(0.38, gold, 0, 11.65, mz, { ink: 'fine' });
  k.statue(0, 11.9, mz, 1.9, gold, { wings: true, arm: 1.1 });
  // the Memorial Stone of the Heroes in front of the column
  k.box(2.4, 0.35, 1.2, mat(0x6b6f70), 0, 0, 5.4);
}

/* =====================================================================
 *  Vajdahunyad Castle: Romanesque, Gothic, Renaissance and Baroque wings around a lake
 *  +z faces the lake and the entrance bridge.
 * ===================================================================== */
function crenels(k, cx, cz, w, d, y, m) {
  const step = 0.42;
  for (const s of [-1, 1]) {
    for (const t of line(Math.max(3, Math.round(w / step / 2)), -w / 2 + 0.12, w / 2 - 0.12)) k.box(0.22, 0.32, 0.2, m, cx + t, y, cz + s * d / 2, { ink: 'fine' });
    for (const t of line(Math.max(3, Math.round(d / step / 2)), -d / 2 + 0.12, d / 2 - 0.12)) k.box(0.2, 0.32, 0.22, m, cx + s * w / 2, y, cz + t, { ink: 'fine' });
  }
}

export function vajdahunyad(k) {
  const stone = mat(0xe6d6b0), grey = mat(0xcfc3a6), ochre = mat(0xe8bf6c), trim = mat(0xf2e7cc), roofR = faceted(0xc4502f), roofD = faceted(0x6d5a74), copper = faceted(C.copper),
    gold = metal(C.gold), base = mat(C.stone);
  // the lake, the island and the stone platform
  k.g.box(34, 0.3, 24, mat(0x4fb6dd), 0, -0.6, -1.2);
  k.g.box(31, 0.3, 18.5, mat(C.grass), 0, -0.3, -1.75);
  k.box(30, 0.6, 14, base, 0, 0, -3.3);
  for (const [x, z] of [[-11, 5.6], [-7, 5.6], [7, 5.6], [11, 5.6], [-14.4, 5.0], [14.4, 5.0]]) k.tree(x, z, 1.2, 0.6);
  // Baroque palace (left), ochre with a mansard roof and a copper lantern
  wing(k, { wall: ochre, trim, roofM: roofD, roof: 'mansard', x: -9, y: 0.6, z: -5, len: 10, dep: 5, h: 3.4, roofH: 1.7, rows: 2, bay: 1.1, ww: 0.36, plinth: stone });
  k.box(3.4, 3.9, 1.3, trim, -9, 0.6, -1.9);
  k.gable(3.6, 1.0, 1.4, trim, -9, 4.5, -1.9);
  k.cyl(0.5, 0.6, 0.9, trim, -9, 5.6, -5, 12);
  k.dome(0.6, 0.8, copper, -9, 6.5, -5, 14);
  k.lathe([[0.12, 0], [0, 0.6]], gold, -9, 7.25, -5, 6, { ink: 'fine' });
  // Gothic hall at the back and the square Hunyadi tower, after the Transylvanian original
  wing(k, { wall: stone, trim, roofM: roofR, roof: 'gable', x: -0.4, y: 0.6, z: -8.6, len: 8.4, dep: 4, h: 3.2, roofH: 2.8, rows: 1, bay: 1.5, ww: 0.55, wh: 1.6, kind: 'pointed', buttress: 0.9 });
  const tx = 5.4, tz = -8.2;
  k.box(2.9, 6.6, 2.9, stone, tx, 0.6, tz);
  k.box(3.3, 0.3, 3.3, grey, tx, 7.2, tz);
  for (const [ox, oz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) { k.box(0.5, 1.5, 0.5, stone, tx + ox, 6.9, tz + oz); k.cone(0.4, 1.2, roofD, tx + ox, 8.4, tz + oz, 8); }
  k.pyramid(2.9, 2.9, 3.6, roofD, tx, 7.5, tz);
  k.lathe([[0.1, 0], [0, 0.9]], gold, tx, 11.1, tz, 6, { ink: 'fine' });
  k.panes([[tx, 2.4, tz + 1.47, 0], [tx, 4.6, tz + 1.47, 0]], { w: 0.4, h: 1.1, kind: 'pointed', frame: trim });
  // the Ják chapel (right): nave, deep Romanesque portal, two stout towers
  wing(k, { wall: stone, trim, roofM: roofR, roof: 'gable', x: 10.8, y: 0.6, z: -4.6, ry: Math.PI / 2, len: 7.4, dep: 5, h: 2.9, roofH: 1.8, rows: 1, bay: 1.4, ww: 0.4, wh: 1.2, ends: false });
  for (const s of [-1, 1]) {
    k.box(1.6, 4.8, 1.6, stone, 10.8 + s * 1.8, 0.6, -0.4);
    k.panes([[10.8 + s * 1.8, 3.4, 0.42, 0]], { w: 0.3, h: 0.8, frame: trim, pad: 0.05 });
    k.pyramid(1.7, 1.7, 2.6, roofR, 10.8 + s * 1.8, 5.4, -0.4);
  }
  for (const [i, pad] of [[0, 0.5], [1, 0.32], [2, 0.16]]) k.panes([[10.8, 0.6, -0.8 + 0.06 * i, 0]], { w: 1.2, h: 2.0, frame: i ? trim : grey, pad });
  // round bastion at the front left
  k.cyl(1.6, 1.8, 4.8, stone, -13.2, 0.6, 2.4, 22);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.box(0.3, 0.32, 0.22, stone, -13.2 + Math.sin(a) * 1.65, 5.4, 2.4 + Math.cos(a) * 1.65, { ry: a, ink: 'fine' }); }
  k.cone(1.75, 2.6, copper, -13.2, 5.5, 2.4, 22);
  k.ring(8, 1.6, 2.6, -13.2, 2.4, { w: 0.22, h: 0.6, frame: trim, pad: 0.04 });
  // gatehouse with twin turrets and the bridge across the lake
  k.box(4.2, 4.0, 2.4, stone, 0, 0.6, 2.6);
  crenels(k, 0, 2.6, 4.2, 2.4, 4.6, stone);
  k.panes([[0, 0.6, 3.82, 0]], { w: 1.6, h: 2.4, frame: grey, pad: 0.22 });
  for (const s of [-1, 1]) {
    k.cyl(0.72, 0.82, 5.4, stone, s * 2.15, 0.6, 3.0, 14);
    k.cone(0.95, 2.3, roofR, s * 2.15, 6.0, 3.0, 14);
    k.panes([[s * 2.15, 3.4, 3.82, 0]], { w: 0.25, h: 0.7, frame: trim, pad: 0.04 });
  }
  k.box(2.4, 0.4, 9.4, base, 0, 0.2, 8.5);
  for (const s of [-1, 1]) k.box(0.2, 0.5, 9.4, stone, s * 1.1, 0.6, 8.5);
}

/* =====================================================================
 *  Széchenyi Thermal Bath (≈ 180 × 135 m)
 *  Neo-Baroque wings round a courtyard of outdoor pools; the domed main front is at +z, the long axis on x.
 * ===================================================================== */
export function szechenyi(k) {
  const yellow = mat(0xf0cf6e), trim = mat(0xfaf1d8), roofM = faceted(0x5d7e74), copper = faceted(C.copper), ribM = faceted(0x9ccdb9), gold = metal(C.gold),
    deck = mat(0xe8dfca), tile = mat(0x2fb3c4);
  k.g.box(52, 0.3, 40, mat(0x8fa36c), 0, -0.3, 0);
  const baroque = { wall: yellow, trim, roofM, roof: 'mansard', rows: 2, bay: 1.35, ww: 0.55, plinth: trim, sill: 0.5 };
  // the wings: main front, the back range and the two side wings closing the courtyard
  wing(k, { ...baroque, z: 12.4, len: 44, dep: 7.6, h: 4.6, roofH: 1.8 });
  wing(k, { ...baroque, z: -14.2, len: 40, dep: 4.0, h: 3.8, roofH: 1.4 });
  for (const s of [-1, 1]) wing(k, { ...baroque, x: s * 19.6, z: -1.8, ry: Math.PI / 2, len: 20.8, dep: 4.0, h: 4.0, roofH: 1.4, ends: false });
  // the main dome over the entrance hall, with a drum, ribs and a lantern
  k.box(9, 5.8, 9.2, yellow, 0, 0, 12.6);
  k.cornice(9, 9.2, 5.7, trim, 0, 12.6);
  k.cyl(3.6, 3.7, 1.6, yellow, 0, 5.9, 12.6, 24);
  k.ring(12, 3.6, 6.15, 0, 12.6, { w: 0.55, h: 1.0, frame: trim });
  ribbedDome(k, 3.6, 3.8, copper, ribM, 0, 7.5, 12.6, { n: 12, point: 0.2, seg: 32 });
  k.cyl(0.7, 0.7, 1.1, yellow, 0, 11.0, 12.6, 12);
  k.dome(0.8, 0.9, copper, 0, 12.1, 12.6, 12);
  k.lathe([[0.15, 0], [0.2, 0.2], [0, 0.8]], gold, 0, 12.95, 12.6, 8, { ink: 'fine' });
  portico(k, { z: 17.6, w: 6.4, n: 4, h: 3.6, y: 0, r: 0.26, depth: 1.6, m: trim });
  k.panes([[0, 0, 17.22, 0]], { w: 2.2, h: 3.0, frame: trim, pad: 0.16 });
  // corner domes on the courtyard side
  for (const s of [-1, 1]) {
    const cx = s * 19.6;
    k.box(5.6, 5.4, 5.6, yellow, cx, 0, 10.6);
    k.cornice(5.6, 5.6, 5.3, trim, cx, 10.6);
    k.cyl(2.0, 2.1, 1.0, yellow, cx, 5.5, 10.6, 16);
    ribbedDome(k, 2.1, 2.4, copper, ribM, cx, 6.5, 10.6, { n: 8, point: 0.2, seg: 24 });
    k.lathe([[0.2, 0], [0.24, 0.2], [0, 0.8]], gold, cx, 8.75, 10.6, 8, { ink: 'fine' });
  }
  // courtyard: terrace and the three outdoor pools (thermal, swimming, thermal)
  k.box(34, 0.3, 20.4, deck, 0, 0, -1.4, { ink: false });
  for (const [x, w] of [[-10.8, 8], [0, 9.6], [10.8, 8]]) {
    k.box(w + 0.6, 0.12, 15.6, trim, x, 0.3, -1.4, { ink: 'fine' });
    k.box(w, 0.06, 15, tile, x, 0.38, -1.4, { ink: false });
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 14.8, 24, 32), toon({ color: 0x46cfd6 }, true));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.46, -1.4); water.receiveShadow = true; k.add(water);
  for (const x of [-10.8, 10.8]) {
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 14.8), toon({ color: 0x5fd9cf }, true));
    w2.rotation.x = -Math.PI / 2; w2.position.set(x, 0.45, -1.4); k.add(w2);
  }
  const pos = water.geometry.attributes.position, b0 = pos.array.slice();
  k.root.userData.tick = (t) => {
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(b0[i * 3] * 1.6 + t * 1.5) * 0.03 + Math.cos(b0[i * 3 + 1] * 1.2 + t * 1.1) * 0.03);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
  };
  // statues along the pool edges
  for (const x of [-15, -5.4, 5.4, 15]) k.statue(x, 0.3, 6.8, 0.9, mat(0xf4eedd));
}
