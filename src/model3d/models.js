import * as THREE from 'three';
import { C, mat, kit, inked, resetGlows, currentGlows } from './kit.js';
import { parliament, budaCastle, bastion, matthias, basilica, opera, synagogue, marketHall, gellert, citadella, millennium, vajdahunyad, szechenyi } from './buildings.js';
import { chainBridge, elizabethBridge, libertyBridge, petofiBridge, rakocziBridge, margaretBridge } from './bridges.js';

/* Procedural, stylised models of Budapest's landmarks. No external assets. Cel-shaded (three flat tones) with a black
 * ink outline sized to each part, to match the comic map. The builders live in buildings.js and bridges.js and draw
 * through the kit in kit.js. Conventions: units ≈ metres / 4, front faces +z, the structure stands on y = 0 and ground
 * pieces (plazas, water, hills) sit below it. */

export const BUILDERS = {
  parliament,
  'buda-castle': budaCastle,
  'fishermans-bastion': bastion,
  'matthias-church': matthias,
  'chain-bridge': chainBridge,
  'elizabeth-bridge': elizabethBridge,
  'liberty-bridge': libertyBridge,
  'petofi-bridge': petofiBridge,
  'rakoczi-bridge': rakocziBridge,
  'margaret-bridge': margaretBridge,
  basilica,
  opera,
  synagogue,
  'market-hall': marketHall,
  'gellert-baths': gellert,
  citadella,
  'heroes-square': millennium,
  'vajdahunyad-castle': vajdahunyad,
  'szechenyi-baths': szechenyi,
};

/** Points [x, z, nx, nz] (model units, centred on 0; n = outward normal) evenly spaced round a w × d rectangle or ellipse. */
export function foundationRing(w, d, round, count = 96) {
  const pts = [], per = 2 * (w + d);
  const add = (x, z, p) => {   // normal from the gradient of a (super)ellipse through the point
    const gx = Math.sign(x) * Math.abs(x / (w / 2)) ** (p - 1), gz = Math.sign(z) * Math.abs(z / (d / 2)) ** (p - 1), l = Math.hypot(gx, gz) || 1;
    pts.push([x, z, gx / l, gz / l]);
  };
  for (let i = 0; i < count; i++) {
    if (round) { const a = -(i / count) * Math.PI * 2; add(Math.sin(a) * w / 2, Math.cos(a) * d / 2, 2); continue; }
    let t = (i / count) * per;   // walk the rectangle's edge
    if (t < w) add(-w / 2 + t, -d / 2, 12);
    else if ((t -= w) < d) add(w / 2, -d / 2 + t, 12);
    else if ((t -= d) < w) add(w / 2 - t, d / 2, 12);
    else add(-w / 2, d / 2 - (t - w), 12);
  }
  return pts;
}

/** A retaining wall with a lawn on top. The top is flat at y=0 round `ring`; each ring point has a `foot` ([x, z] model units)
 *  and a `depth` below y=0, chosen by the map layer to land on the slope. The map layer puts it under a model on a hillside so the
 *  building stands on a built-up terrace rather than hovering over the downhill side. */
export function buildFoundation(ring, feet, depths) {
  const n = ring.length, top = -0.03, side = [], lawn = [];
  const tri = (arr, ...v) => v.forEach((q) => arr.push(...q));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [ax, az] = ring[i], [bx, bz] = ring[j];
    const A = [ax, top, az], B = [bx, top, bz], FA = [feet[i][0], top - depths[i], feet[i][1]], FB = [feet[j][0], top - depths[j], feet[j][1]];
    tri(side, A, FB, FA, A, B, FB);
    tri(lawn, [0, top, 0], B, A);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...side, ...lawn], 3));
  geo.addGroup(0, side.length / 3, 0); geo.addGroup(side.length / 3, lawn.length / 3, 1);
  geo.computeVertexNormals();
  const group = new THREE.Group();
  const wall = new THREE.Mesh(geo, [mat(C.rock), mat(0xc3ee9b)]);
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);
  group.add(inked(group));
  return group;
}

/** Builds a fresh model. Returns { group, glows, tick? } — glows are window materials to light at dusk.
 *  `base: false` drops the ground pieces (hills, plinths, water) for use on the map. */
export function buildModel(id, { base = true } = {}) {
  resetGlows();
  const group = new THREE.Group(), k = kit(group);
  BUILDERS[id](k);
  const prims = k.done(!base);
  if (!base) {
    const drop = [];
    group.traverse((o) => { if (o.userData.base) drop.push(o); });
    drop.forEach((o) => o.parent.remove(o));
    if (group.userData.tickIsGround) group.userData.tick = null;
  }
  group.add(inked(group, prims));
  return { group, glows: currentGlows(), tick: group.userData.tick || null };
}
