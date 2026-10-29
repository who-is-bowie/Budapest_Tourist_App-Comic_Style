import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Procedural, stylised models of Budapest's landmarks. No external assets. Cel-shaded (three flat tones)
 * with a thick black ink outline added in buildModel, to match the comic map.
 * Conventions: units are loose metres/4, front faces +z, every model sits on y = 0, and every
 * builder adds its meshes to `p` roughly bottom-to-top (the viewer uses that for the build-up). */

const C = {
  white: 0xf1ece0, cream: 0xe9dfc3, sand: 0xdccaa0, stone: 0xcfc7b6, rock: 0x8f887a, slate: 0x4b5058,
  red: 0xb9492f, brick: 0xb86a4b, copper: 0x67a592, copperDk: 0x4a8575, gold: 0xe0b445,
  grass: 0x7f9560, water: 0x3f7fb4, teal: 0x39b0a5, dark: 0x2b3342,
};

/* ---------- materials ---------- */

const INK = 0x14121a;
let glows = [];   // window materials whose emissive intensity follows the time of day
const cache = new Map();

// three flat tones: shadow, mid, light
const ramp = new THREE.DataTexture(new Uint8Array([105, 190, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;

// Shared shader patch: stone coursing on walls (`detail`) and Ben-Day halftone dots in the shadow tone
const patch = (detail) => (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('void main() {', 'varying vec3 vObjPos; varying vec3 vObjNrm;\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjNrm = normal;');
  sh.fragmentShader = sh.fragmentShader
    .replace('void main() {', 'varying vec3 vObjPos; varying vec3 vObjNrm;\nvoid main() {')
    .replace('#include <color_fragment>', `#include <color_fragment>
${detail ? `{
  vec3 an = abs(vObjNrm);
  vec2 q = an.y > 0.7 ? vObjPos.xz : (an.x > an.z ? vObjPos.zy : vObjPos.xy);
  vec2 g = q / vec2(0.62, 0.3);
  g.x += mod(floor(g.y), 2.0) * 0.5;
  vec2 f = fract(g), w = max(fwidth(g), vec2(1e-4));
  float jy = 1.0 - smoothstep(0.5, 1.4, min(f.y, 1.0 - f.y) / w.y);
  float jx = 1.0 - smoothstep(0.5, 1.4, min(f.x, 1.0 - f.x) / w.x);
  float fade = 1.0 - smoothstep(0.3, 0.7, max(w.x, w.y));
  diffuseColor.rgb *= 1.0 - 0.2 * max(jx, jy) * fade;
}` : ''}`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  float dark = clamp((0.6 - lum) / 0.6, 0.0, 1.0);
  vec2 sp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 5.0;
  float dm = 1.0 - smoothstep(0.62 * sqrt(dark) - 0.12, 0.62 * sqrt(dark) + 0.03, length(fract(sp) - 0.5));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.5, 0.46, 0.6), dm * step(0.03, dark));
}`);
};

function toon(params, flat = false, detail = false) {
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp, ...params });
  m.flatShading = flat; m.clipShadows = true;
  m.onBeforeCompile = patch(detail);
  m.customProgramCacheKey = () => (detail ? 'toon-detail' : 'toon-plain');
  return m;
}

// roughness / metalness / envMapIntensity are accepted and ignored: toon shading has no use for them.
// Stone-like colours get block coursing; greens, blues and metals stay smooth.
function mat(color, { roughness, metalness, envMapIntensity, flatShading, plain, ...o } = {}) {
  const key = color + JSON.stringify(o) + flatShading + plain;
  if (!cache.has(key)) {
    const c = new THREE.Color(color), natural = !(c.g > c.r * 1.02 && c.g > c.b) && !(c.b > c.r && c.b > c.g);
    cache.set(key, toon({ color, ...o }, !!flatShading, !!natural && !plain && !flatShading && !o.map && !o.emissive));
  }
  return cache.get(key);
}
const metal = (color) => mat(color, { plain: true });
const faceted = (color, o = {}) => mat(color, { ...o, flatShading: true });

function lit() {
  if (!lit.m) lit.m = toon({ color: 0x27303f, emissive: 0xffc46b, emissiveIntensity: 0.1 });
  if (!glows.includes(lit.m)) glows.push(lit.m);
  return lit.m;
}

function canvasTex(size, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Zsolnay-style zig-zag roof tiles
function tiled(cols, repeat) {
  const tex = canvasTex(128, (g, s) => {
    g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows, step = s / 4;
    for (let r = 0; r < rows; r++) {
      g.strokeStyle = cols[r % cols.length]; g.lineWidth = h * 1.15; g.lineJoin = 'miter';
      g.beginPath();
      for (let i = 0; i <= 4; i++) { const y = r * h + h / 2 + (i % 2 ? -h * 0.42 : h * 0.42); i ? g.lineTo(i * step, y) : g.moveTo(0, y); }
      g.stroke();
    }
  }, repeat);
  return mat(0xffffff, { map: tex });
}

// Horizontal bands, as on the Dohány Street Synagogue
function banded(a, b, repeat) {
  const tex = canvasTex(64, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s); g.fillStyle = b;
    for (let y = 0; y < s; y += s / 4) g.fillRect(0, y, s, s / 8);
  }, repeat);
  return mat(0xffffff, { map: tex });
}

/* ---------- geometry helpers ---------- */

// parts tagged as ground are dropped on the map (the real terrain is there) and kept in the 3D viewer
const ground = (o) => { o.userData.base = true; return o; };
const shade = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

function add(p, geo, m, x, y, z, h) { const o = shade(new THREE.Mesh(geo, m)); o.position.set(x, y + h / 2, z); p.add(o); return o; }
const box = (p, w, h, d, m, x = 0, y = 0, z = 0) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, h);
const cyl = (p, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, h);
// pyramid / cone; rotated 45° when 4-sided so its corners align with a square base
const cone = (p, r, h, m, x = 0, y = 0, z = 0, seg = 28) => {
  const o = cyl(p, 0, r, h, m, x, y, z, seg);
  if (seg === 4) o.rotation.y = Math.PI / 4;
  return o;
};

function dome(p, r, m, x = 0, y = 0, z = 0, sy = 1, seg = 32) {
  const o = shade(new THREE.Mesh(new THREE.SphereGeometry(r, seg, 16, 0, Math.PI * 2, 0, Math.PI / 2), m));
  o.scale.y = sy; o.position.set(x, y, z); p.add(o); return o;
}

function onion(p, r, m, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const bulb = shade(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m)); bulb.scale.y = 1.25; bulb.position.y = r * 1.1;
  const tip = shade(new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 1.6, 20), m)); tip.position.y = r * 2.4;
  const ball = shade(new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 12, 8), metal(C.gold)));
  ball.position.y = r * 3.3;
  g.add(bulb, tip, ball); p.add(g); return g;
}

// Triangular roof prism: span along x, ridge along z
function gable(p, span, h, len, m, x = 0, y = 0, z = 0, rotY = 0) {
  const s = new THREE.Shape(); s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const o = shade(new THREE.Mesh(geo, m)); o.position.set(x, y, z); o.rotation.y = rotY; p.add(o); return o;
}

// Arched window shape
const archCache = new Map();
function archGeo(w, h) {
  const key = w + 'x' + h;
  if (!archCache.has(key)) {
    const r = w / 2, s = new THREE.Shape();
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
    archCache.set(key, g);
  }
  return archCache.get(key);
}

/** Row/grid of lit arched windows along a wall from [x0,z0] to [x1,z1], facing `face` (radians about y). */
function windows(p, { w = 0.3, h = 0.55, from, to, cols, y = 0.5, rows = 1, dy = 0.9, face = 0, off = 0.02, m = lit() }) {
  const n = cols * rows, inst = new THREE.InstancedMesh(archGeo(w, h), m, n), d = new THREE.Object3D();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = cols === 1 ? 0.5 : c / (cols - 1);
      d.position.set(from[0] + (to[0] - from[0]) * t + Math.sin(face) * off, y + r * dy, from[1] + (to[1] - from[1]) * t + Math.cos(face) * off);
      d.rotation.set(0, face, 0); d.updateMatrix(); inst.setMatrixAt(i++, d.matrix);
    }
  }
  p.add(inst); return inst;
}

function columns(p, n, x0, x1, z, h, r, m, y = 0) {
  for (let i = 0; i < n; i++) cyl(p, r, r * 1.08, h, m, x0 + ((x1 - x0) * i) / (n - 1), y, z, 14);
}

function steps(p, w, d, n, m, z, rise = 0.12) {
  for (let i = 0; i < n; i++) box(p, w - i * 0.1, rise, d - (i * d) / n, m, 0, i * rise, z - ((d / n) * i) / 2 + d / 2 - d / 2);
}

function pinnacles(p, pts, h, r, m, y) { for (const [x, z] of pts) cone(p, r, h, m, x, y, z, 6); }

const line = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));

/* =====================================================================
 *  Hungarian Parliament
 * ===================================================================== */
function parliament(p) {
  const wall = mat(C.white), roof = faceted(C.red, { roughness: 0.6 }), base = mat(C.stone), gold = metal(C.gold);
  const W = 17, D = 3.4;
  ground(box(p, W + 1.6, 0.35, D + 1.6, base)); ground(box(p, W + 0.8, 0.2, D + 0.8, base, 0, 0.35));
  box(p, W, 2.3, D, wall, 0, 0.55);
  // long wings with steep roofs, ridge along x
  for (const s of [-1, 1]) gable(p, D + 0.1, 1.15, 5.4, roof, s * 4.4, 2.85, 0, Math.PI / 2);
  // end pavilions
  for (const s of [-1, 1]) {
    box(p, 2.1, 3.1, D + 0.5, wall, s * (W / 2 - 0.4), 0.55);
    cone(p, 1.65, 2.4, roof, s * (W / 2 - 0.4), 3.65, 0, 4);
    cone(p, 0.12, 0.7, gold, s * (W / 2 - 0.4), 6, 0, 8);
  }
  // central hall + drum + faceted red dome
  box(p, 4.6, 3.1, 4, wall, 0, 0.55, 0.1);
  gable(p, 4.2, 1.2, 4.2, roof, 0, 3.65, 0.1, 0);
  cyl(p, 2.05, 2.15, 1.9, wall, 0, 3.0, -0.2, 16);
  windows(p, { w: 0.22, h: 0.8, from: [-0.8, 0], to: [0.8, 0], cols: 2, y: 3.35, face: 0, off: 2.02 - 0.2 });
  cyl(p, 2.3, 2.3, 0.18, base, 0, 4.9, -0.2, 16);
  dome(p, 2.0, faceted(0xa6402b, { roughness: 0.5 }), 0, 5.05, -0.2, 1.45, 16);
  cyl(p, 0.42, 0.55, 0.9, wall, 0, 7.9, -0.2, 12);
  cone(p, 0.5, 1.3, gold, 0, 8.8, -0.2, 12);
  cone(p, 0.05, 0.9, gold, 0, 10.0, -0.2, 6);
  // roofline turrets
  pinnacles(p, line(13, -7.4, 7.4).filter((x) => Math.abs(x) > 2.6).map((x) => [x, D / 2 - 0.1]), 0.8, 0.13, wall, 2.85);
  pinnacles(p, line(13, -7.4, 7.4).filter((x) => Math.abs(x) > 2.6).map((x) => [x, -D / 2 + 0.1]), 0.8, 0.13, wall, 2.85);
  for (const s of [-1, 1]) for (const z of [-1, 1]) cone(p, 0.22, 1.5, roof, s * 2.35, 3.0, z * 1.5, 8);
  // windows
  for (const s of [-1, 1]) windows(p, { from: [s * 2.6, D / 2], to: [s * 7.2, D / 2], cols: 7, y: 0.95, rows: 2, dy: 1.0, face: 0 });
  windows(p, { from: [-1.6, 2.1], to: [1.6, 2.1], cols: 3, y: 1.0, rows: 2, dy: 1.1, face: 0, w: 0.34, h: 0.75 });
  for (const s of [-1, 1]) windows(p, { from: [s * (W / 2 - 0.4), -1], to: [s * (W / 2 - 0.4), 1], cols: 2, y: 1.2, rows: 2, dy: 1.2, face: 0, off: D / 2 + 0.27 });
  windows(p, { from: [-0.5, 0], to: [0.5, 0], cols: 2, y: 0.6, h: 1.2, w: 0.5, face: 0, off: D / 2 + 0.33 });
  // river side
  for (const s of [-1, 1]) windows(p, { from: [s * 2.6, -D / 2], to: [s * 7.2, -D / 2], cols: 7, y: 0.95, rows: 2, dy: 1.0, face: Math.PI, off: -0.02 });
  windows(p, { from: [-1.6, -2.1], to: [1.6, -2.1], cols: 3, y: 1.0, rows: 2, dy: 1.1, face: Math.PI, w: 0.34, h: 0.75, off: 0 });
  steps(p, 5, 1.6, 4, base, D / 2 + 1.4, 0.1);
}

/* =====================================================================
 *  Buda Castle
 * ===================================================================== */
function budaCastle(p) {
  const wall = mat(C.cream), roof = faceted(C.copperDk, { roughness: 0.55 }), stone = mat(C.rock), gold = metal(C.gold);
  // terrace walls on the hill
  ground(cyl(p, 11, 12.5, 1.1, mat(C.grass), 0, 0, 0, 40));
  box(p, 21, 1.1, 9.4, stone, 0, 0.5, 0.4);
  for (let i = 0; i < 8; i++) box(p, 0.7, 0.5, 0.5, stone, -9.1 + i * 2.6, 1.6, 4.9);
  // main block
  box(p, 15.5, 3.4, 3.4, wall, 0, 1.6, -0.2);
  box(p, 15.9, 0.18, 3.7, mat(C.sand), 0, 5.0, -0.2);
  box(p, 15.9, 0.15, 3.7, mat(C.sand), 0, 3.0 + 0.25, -0.2);
  gable(p, 3.2, 1.0, 14.8, roof, 0, 5.1, -0.2, Math.PI / 2);
  // wings reaching forward and back
  for (const s of [-1, 1]) {
    box(p, 3.1, 3.4, 5.6, wall, s * 6.2, 1.6, 0.0);
    gable(p, 3.3, 1.2, 5.8, roof, s * 6.2, 5.0, 0, 0);
  }
  box(p, 3.2, 3.4, 7, wall, -3.4, 1.6, -4.4);
  gable(p, 3.4, 1.1, 7.2, roof, -3.4, 5.0, -4.4, 0);
  // central pavilion + dome
  box(p, 4.6, 4.1, 3.9, wall, 0, 1.6, 0.35);
  box(p, 4.8, 0.18, 4.1, mat(C.sand), 0, 5.7, 0.35);
  cyl(p, 1.55, 1.7, 1.5, wall, 0, 5.8, 0.2, 20);
  dome(p, 1.55, faceted(C.copper, { roughness: 0.45 }), 0, 7.3, 0.2, 1.1, 20);
  cyl(p, 0.3, 0.38, 0.6, wall, 0, 9.0, 0.2, 10);
  cone(p, 0.32, 0.8, gold, 0, 9.6, 0.2, 10);
  for (const s of [-1, 1]) { cone(p, 0.7, 1.2, roof, s * 1.95, 5.8, 1.9, 4); cone(p, 0.7, 1.2, roof, s * 1.95, 5.8, -1.3, 4); }
  // windows
  windows(p, { from: [-7, 1.5], to: [7, 1.5], cols: 13, y: 1.8, rows: 3, dy: 1.0, face: 0, off: 0 });
  windows(p, { from: [-1.7, 2.32], to: [1.7, 2.32], cols: 3, y: 1.9, rows: 3, dy: 1.15, face: 0, w: 0.4, h: 0.7 });
  windows(p, { from: [-4.4, 3.0], to: [-4.4, 3.0], cols: 1, y: 2.2, rows: 1, face: 0, w: 0.9, h: 1.7, off: 0 });
  // flag
  cyl(p, 0.03, 0.03, 1.2, metal(C.slate), 0, 10.2, 0.2, 6);
}

/* =====================================================================
 *  Fisherman's Bastion
 * ===================================================================== */
function bastion(p) {
  const white = mat(0xf2eee4), cap = faceted(0xc5cdcf, { roughness: 0.6 }), rock = mat(C.rock), grass = mat(C.grass);
  ground(cyl(p, 7.6, 8.8, 1.4, grass, 0, 0, -2.4, 48));
  ground(cyl(p, 7.7, 9.1, 0.5, rock, 0, 0, -2.4, 48));
  // curved terrace (annular sector)
  const R = 6.2, a0 = -1.2, a1 = 1.2, cz = -5;
  const sh = new THREE.Shape(), Ro = R + 0.7, Ri = R - 1.7, N = 40;
  for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N, x = Math.sin(a) * Ro, y = -Math.cos(a) * Ro; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / N; sh.lineTo(Math.sin(a) * Ri, -Math.cos(a) * Ri); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
  const slab = shade(new THREE.Mesh(geo, mat(C.stone))); slab.position.set(0, 1.4, cz); p.add(slab);
  // retaining wall under the terrace, so it stands on its own without the hill
  const wallGeo = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false }); wallGeo.rotateX(-Math.PI / 2);
  const retain = shade(new THREE.Mesh(wallGeo, mat(C.rock))); retain.position.set(0, 0, cz); p.add(retain);
  // terrace follows ±x after rotation; place helpers along the same arc
  const at = (a, r = R) => [Math.sin(a) * r, cz + Math.cos(a) * r];
  const angles = line(7, -1.05, 1.05);
  // parapet + arcade between towers
  for (let i = 0; i < 40; i++) {
    const a = -1.17 + (2.34 * i) / 39, [x, z] = at(a, R + 0.45);
    const b = box(p, 0.46, 0.6, 0.22, white, x, 1.9, z); b.rotation.y = a;
  }
  const arcN = 21;
  for (let i = 0; i < arcN; i++) {
    const a = -1.0 + (2.0 * i) / (arcN - 1), [x, z] = at(a, R - 0.2);
    cyl(p, 0.09, 0.1, 1.15, white, x, 1.9, z, 8);
    if (i < arcN - 1) {
      const a2 = a + 1.0 / (arcN - 1), [x2, z2] = at(a2, R - 0.2);
      const arc = dome(p, 0.28, white, (x + x2) / 2, 3.05, (z + z2) / 2, 0.55, 12); arc.rotation.x = 0; arc.rotation.y = a2;
    }
  }
  // seven towers
  angles.forEach((a, i) => {
    const [x, z] = at(a, R + 0.1), big = i === 3, r = big ? 0.95 : 0.72, h = big ? 3.0 : 2.1;
    cyl(p, r, r * 1.12, h, white, x, 1.9, z, 18);
    cyl(p, r * 1.22, r * 1.22, 0.14, white, x, 1.9 + h, z, 18);
    cone(p, r * 1.3, big ? 3.2 : 2.4, cap, x, 2.04 + h, z, 18);
    windows(p, { w: 0.16, h: 0.42, from: [x, z], to: [x, z], cols: 1, y: 2.5, face: a, off: r + 0.01 });
    cone(p, 0.05, 0.5, metal(C.gold), x, 2.04 + h + (big ? 3.2 : 2.4), z, 6);
  });
  // stairs up the middle
  for (let i = 0; i < 7; i++) box(p, 3.2 - i * 0.12, 0.2, 0.7, white, 0, 0.5 + i * 0.2, cz + R - 1.0 + (6 - i) * 0.7 + 1.2);
}

/* =====================================================================
 *  Matthias Church
 * ===================================================================== */
function matthias(p) {
  const stone = mat(0xe7e0cd), tile = tiled(['#c8562d', '#e6b43a', '#2f8a87', '#7a3b2a'], [0.5, 0.5]);
  const cobble = mat(C.rock);
  ground(cyl(p, 8.5, 9.4, 0.5, mat(0xb9b4a6), 0, 0, 0, 40));
  ground(cyl(p, 7.6, 7.8, 0.12, cobble, 0, 0.5, 0, 40));
  // nave (z is the long axis, front at +z)
  box(p, 3.2, 3.5, 8.6, stone, 0, 0.5, 0);
  gable(p, 4.0, 2.7, 8.8, tile, 0, 4.0, 0, 0);
  // apse
  const apse = cyl(p, 1.6, 1.75, 3.5, stone, 0, 0.5, -4.4, 8);
  cone(p, 1.95, 2.8, tile, 0, 4.0, -4.4, 8);
  // transept-like side chapels
  for (const s of [-1, 1]) { box(p, 1.6, 2.6, 2.4, stone, s * 2.2, 0.5, 0.6); gable(p, 1.9, 1.2, 2.6, tile, s * 2.2, 3.1, 0.6, Math.PI / 2); }
  // buttresses + tall windows
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = -3.4 + i * 1.35;
    if (Math.abs(z - 0.6) > 1.6) {
      box(p, 0.3, 3.2, 0.3, stone, s * 1.75, 0.5, z);
      cone(p, 0.2, 0.55, stone, s * 1.75, 3.7, z, 4);
    }
  }
  for (const s of [-1, 1]) windows(p, { w: 0.42, h: 1.8, from: [s * 1.62, -3.1], to: [s * 1.62, 3.1], cols: 6, y: 1.3, face: s * Math.PI / 2, off: 0 });
  // front rose window + doorway
  windows(p, { w: 0.8, h: 1.6, from: [0, 4.31], to: [0, 4.31], cols: 1, y: 0.5, face: 0, off: 0 });
  const rose = shade(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 24), mat(C.sand))); rose.position.set(0, 3.2, 4.32); p.add(rose);
  const rd = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), lit()); rd.position.set(0, 3.2, 4.33); p.add(rd);
  // the big tower (left front) with octagonal crown and tiled spire
  box(p, 2.2, 5.2, 2.2, stone, -2.5, 0.5, 3.6);
  windows(p, { w: 0.34, h: 1.0, from: [-2.5, 4.72], to: [-2.5, 4.72], cols: 1, y: 2.3, face: 0, off: 0.04 });
  windows(p, { w: 0.34, h: 1.0, from: [-2.5, 4.72], to: [-2.5, 4.72], cols: 1, y: 4.4, face: 0, off: 0.04 });
  box(p, 2.4, 0.2, 2.4, mat(C.sand), -2.5, 5.7, 3.6);
  cyl(p, 0.95, 1.05, 1.8, stone, -2.5, 5.9, 3.6, 8);
  windows(p, { w: 0.28, h: 0.9, from: [-2.5, 3.6], to: [-2.5, 3.6], cols: 1, y: 6.2, face: 0, off: 1.0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(p, 0.17, 0.2, 2.2, stone, -2.5 + sx * 1.0, 5.8, 3.6 + sz * 1.0, 8); cone(p, 0.3, 0.9, tile, -2.5 + sx * 1.0, 8.0, 3.6 + sz * 1.0, 8); }
  cone(p, 1.15, 4.4, tile, -2.5, 7.7, 3.6, 8);
  cone(p, 0.06, 0.8, metal(C.gold), -2.5, 12.1, 3.6, 6);
  // little stair turret on the right
  cyl(p, 0.55, 0.6, 3.9, stone, 2.3, 0.5, 3.9, 10);
  cone(p, 0.8, 1.8, tile, 2.3, 4.4, 3.9, 10);
}

/* =====================================================================
 *  Chain Bridge
 * ===================================================================== */
function chainBridge(p) {
  const stone = mat(0xd9d2c1), iron = metal(0x2f3541, 0.45), gold = metal(C.gold), land = mat(0x8a8d78), deck = mat(0x5a5f69);
  // river banks and piers
  for (const s of [-1, 1]) {
    box(p, 3.6, 1.2, 8.5, land, s * 8.6, 0, 0);
    box(p, 3.5, 0.25, 8.6, mat(C.stone), s * 8.6, 1.2, 0);
  }
  for (const s of [-1, 1]) box(p, 2.6, 1.4, 3.6, stone, s * 5.4, 0, 0);
  // deck
  box(p, 20.4, 0.28, 3.0, deck, 0, 1.15);
  for (const s of [-1, 1]) box(p, 20.4, 0.12, 0.14, iron, 0, 1.43, s * 1.45);
  // gate towers
  for (const tx of [-5.4, 5.4]) {
    for (const s of [-1, 1]) box(p, 0.75, 4.3, 0.9, stone, tx, 1.4, s * 1.2);
    box(p, 1.4, 1.1, 3.2, stone, tx, 3.7);
    box(p, 1.6, 0.18, 3.4, mat(C.sand), tx, 4.8);
    cone(p, 1.0, 1.0, stone, tx, 4.98, 0, 4).scale.set(1, 1, 1.9);
    box(p, 0.1, 0.1, 0.1, iron, tx, 6);
    // arch over the roadway
    const a = dome(p, 1.0, stone, tx, 1.4, 0, 1.0, 20); a.scale.set(0.6, 0.0001, 1.0);
    // lions
    for (const s of [-1, 1]) for (const d of [-1, 1]) {
      box(p, 0.55, 0.3, 0.25, mat(0xb6ad9c), tx + d * 0.9, 1.43, s * 1.75);
      const h = shade(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(0xb6ad9c))); h.position.set(tx + d * 0.9 + 0.3 * -d, 1.85, s * 1.75); p.add(h);
    }
  }
  // chains: parabolic main span + shallow side spans
  const top = 4.6, low = 1.9;
  const sag = (x) => low + (top - low) * ((x / 5.4) ** 2);
  for (const z of [-1.6, 1.6]) {
    const main = line(30, -5.4, 5.4).map((x) => new THREE.Vector3(x, sag(x), z));
    tube(p, main, 0.07, iron);
    for (const s of [-1, 1]) {
      const side = line(14, 5.4, 9.8).map((x) => new THREE.Vector3(s * x, top - (top - 1.9) * ((x - 5.4) / 4.4) ** 1.4, z));
      tube(p, side, 0.07, iron);
    }
    for (const x of line(15, -5, 5)) { const y = sag(x); box(p, 0.035, y - 1.4, 0.035, iron, x, 1.4, z); }
    for (const s of [-1, 1]) for (const x of line(5, 6.2, 9.6)) { const y = top - (top - 1.9) * ((x - 5.4) / 4.4) ** 1.4; box(p, 0.035, Math.max(0.05, y - 1.4), 0.035, iron, s * x, 1.4, z); }
  }
  // lamp posts
  for (const x of line(8, -9, 9)) for (const z of [-1.45, 1.45]) { cyl(p, 0.025, 0.03, 0.6, iron, x, 1.43, z, 6); const l = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lit())); l.position.set(x, 2.1, z); p.add(l); }
  // Danube
  const water = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 9, 48, 32), toon({ color: C.water }, true));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.25; water.receiveShadow = true; p.add(ground(water)); p.userData.tickIsGround = true;
  const pos = water.geometry.attributes.position, base = pos.array.slice();
  p.userData.tick = (t) => {
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(base[i * 3] * 0.9 + t * 1.3) * 0.05 + Math.cos(base[i * 3 + 1] * 1.1 + t) * 0.05);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
  };
}

function tube(p, pts, r, m) {
  const o = shade(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, r, 6), m), false);
  p.add(o); return o;
}

/* =====================================================================
 *  St. Stephen's Basilica
 * ===================================================================== */
function basilica(p) {
  const stone = mat(0xe8dfc9), green = faceted(0x6aa391, { roughness: 0.45 }), base = mat(C.stone), gold = metal(C.gold);
  ground(box(p, 12, 0.3, 12, base)); ground(box(p, 11.2, 0.25, 11.2, base, 0, 0.3));
  // greek-cross body
  box(p, 5.4, 3.4, 5.4, stone, 0, 0.55);
  box(p, 3.6, 2.8, 9.8, stone, 0, 0.55);
  box(p, 9.8, 2.8, 3.6, stone, 0, 0.55);
  gable(p, 3.9, 1.0, 9.9, faceted(0x8c9e96), 0, 3.35, 0, 0);
  gable(p, 3.9, 1.0, 9.9, faceted(0x8c9e96), 0, 3.35, 0, Math.PI / 2);
  // drum + dome
  cyl(p, 2.35, 2.5, 1.9, stone, 0, 3.95, 0, 16);
  windows(p, { w: 0.3, h: 1.0, from: [0, 0], to: [0, 0], cols: 1, y: 4.35, face: 0, off: 2.37 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    windows(p, { w: 0.34, h: 1.0, from: [Math.sin(a) * 2.37, Math.cos(a) * 2.37], to: [Math.sin(a) * 2.37, Math.cos(a) * 2.37], cols: 1, y: 4.45, face: a, off: 0.02 });
    cyl(p, 0.1, 0.12, 1.5, stone, Math.sin(a) * 2.5, 3.95, Math.cos(a) * 2.5, 8);
  }
  cyl(p, 2.65, 2.65, 0.2, stone, 0, 5.85, 0, 16);
  dome(p, 2.45, green, 0, 6.0, 0, 1.2, 16);
  cyl(p, 0.55, 0.7, 0.7, stone, 0, 8.9, 0, 12);
  dome(p, 0.55, green, 0, 9.6, 0, 1.0, 12);
  cyl(p, 0.03, 0.03, 0.7, gold, 0, 10.15, 0, 6); box(p, 0.3, 0.04, 0.04, gold, 0, 10.6);
  // portico + pediment
  columns(p, 6, -2.4, 2.4, 6.0, 3.0, 0.22, stone, 0.55);
  box(p, 5.8, 0.4, 1.9, stone, 0, 3.55, 5.5);
  gable(p, 5.9, 1.25, 1.9, stone, 0, 3.95, 5.4, 0);
  gable(p, 4.6, 0.9, 0.12, lit(), 0, 4.2, 6.35, 0);
  box(p, 5.4, 0.2, 1.6, base, 0, 0.55, 5.45);
  steps(p, 6.2, 1.6, 5, base, 6.0, 0.11);
  // bell towers
  for (const s of [-1, 1]) {
    box(p, 1.9, 5.4, 1.9, stone, s * 3.2, 0.55, 4.3);
    windows(p, { w: 0.36, h: 1.1, from: [s * 3.2, 5.27], to: [s * 3.2, 5.27], cols: 1, y: 3.4, face: 0, off: 0 });
    box(p, 2.1, 0.22, 2.1, mat(C.sand), s * 3.2, 5.95, 4.3);
    cyl(p, 0.7, 0.8, 0.9, stone, s * 3.2, 6.17, 4.3, 12);
    dome(p, 0.85, green, s * 3.2, 7.05, 4.3, 1.1, 14);
    cyl(p, 0.025, 0.03, 0.6, gold, s * 3.2, 7.95, 4.3, 6);
  }
  // apse
  cyl(p, 1.8, 1.9, 2.8, stone, 0, 0.55, -5.2, 12);
  cone(p, 2.0, 1.1, faceted(0x8c9e96), 0, 3.35, -5.2, 12);
}

/* =====================================================================
 *  Hungarian State Opera
 * ===================================================================== */
function opera(p) {
  const stone = mat(0xe6d9b6), rust = mat(0xd5c49c), green = faceted(C.copper, { roughness: 0.45 }), base = mat(C.stone), gold = metal(C.gold);
  ground(box(p, 15, 0.3, 11, base));
  // main volume: rusticated base + piano nobile
  box(p, 12, 2.0, 5.2, rust, 0, 0.3, 0.6);
  box(p, 12, 0.14, 5.4, stone, 0, 2.3, 0.6);
  box(p, 12, 2.2, 5.0, stone, 0, 2.44, 0.6);
  box(p, 12.3, 0.25, 5.4, stone, 0, 4.6, 0.6);
  for (let i = 0; i < 40; i++) box(p, 0.28, 0.34, 0.2, stone, -5.85 + i * 0.3, 4.85, 3.28);
  // loggia (central projection)
  box(p, 5.6, 2.0, 1.2, rust, 0, 0.3, 3.5);
  box(p, 5.6, 2.2, 1.1, stone, 0, 2.44, 3.45);
  windows(p, { w: 0.9, h: 1.7, from: [-2, 4.1], to: [2, 4.1], cols: 3, y: 0.55, face: 0, off: 0.04 });
  windows(p, { w: 0.9, h: 1.7, from: [-2, 4.03], to: [2, 4.03], cols: 3, y: 2.7, face: 0, off: 0.04 });
  gable(p, 5.9, 0.9, 1.2, stone, 0, 4.85, 3.45, 0);
  // flanking window bays
  for (const s of [-1, 1]) {
    windows(p, { w: 0.5, h: 1.2, from: [s * 3.4, 3.2], to: [s * 5.4, 3.2], cols: 3, y: 0.7, face: 0, off: 0.04 });
    windows(p, { w: 0.5, h: 1.2, from: [s * 3.4, 3.12], to: [s * 5.4, 3.12], cols: 3, y: 2.8, face: 0, off: 0.04 });
    // corner statues
    cyl(p, 0.14, 0.2, 0.9, stone, s * 5.9, 4.85, 3.2, 8);
    const st = shade(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), gold)); st.position.set(s * 5.9, 5.95, 3.2); p.add(st);
    // lion sculptures on the stair cheeks
    box(p, 0.7, 0.45, 0.4, stone, s * 3.2, 0.3, 5.1);
  }
  // auditorium dome + stage tower behind
  cyl(p, 2.3, 2.45, 0.9, stone, 0, 4.85, -0.2, 20);
  dome(p, 2.3, green, 0, 5.7, -0.2, 0.75, 20);
  cyl(p, 0.35, 0.4, 0.5, stone, 0, 7.35, -0.2, 10);
  dome(p, 0.45, gold, 0, 7.85, -0.2, 1, 10);
  box(p, 9, 8.7, 4, rust, 0, 0.3, -4.0);
  gable(p, 4.4, 1.6, 9.4, green, 0, 9.0, -4.0, Math.PI / 2);
  windows(p, { w: 0.4, h: 0.9, from: [-3.5, -1.98], to: [3.5, -1.98], cols: 6, y: 5.6, rows: 3, dy: 1.15, face: 0, off: 0 });
  // stairs
  steps(p, 5.0, 1.8, 6, base, 5.2, 0.1);
}

/* =====================================================================
 *  Dohány Street Synagogue
 * ===================================================================== */
function synagogue(p) {
  const bands = banded('#efe3c4', '#b95a3c', [1, 1.6]), bandsT = banded('#efe3c4', '#b95a3c', [1.2, 3.2]), cream = mat(0xece1c3), copper = metal(0xc79a3b, 0.35);
  const base = mat(C.stone);
  ground(box(p, 11, 0.3, 14, base));
  // nave behind
  box(p, 5.6, 4.2, 9.2, bands, 0, 0.3, -3);
  gable(p, 6.0, 1.6, 9.4, mat(0x8d9aa0, { roughness: 0.6 }), 0, 4.5, -3, 0);
  windows(p, { w: 0.5, h: 1.6, from: [-2.81, -6], to: [-2.81, 0], cols: 4, y: 1.4, face: -Math.PI / 2, off: 0 });
  windows(p, { w: 0.5, h: 1.6, from: [2.81, -6], to: [2.81, 0], cols: 4, y: 1.4, face: Math.PI / 2, off: 0 });
  // facade between towers
  box(p, 5.4, 5.6, 1.8, bands, 0, 0.3, 2.6);
  gable(p, 5.4, 1.4, 1.8, cream, 0, 5.9, 2.6, 0);
  const ring = shade(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 12, 32), copper)); ring.position.set(0, 4.1, 3.52); p.add(ring);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), lit()); rose.position.set(0, 4.1, 3.53); p.add(rose);
  windows(p, { w: 0.9, h: 1.8, from: [-1.5, 3.5], to: [1.5, 3.5], cols: 3, y: 0.45, face: 0, off: 0.02 });
  windows(p, { w: 0.4, h: 0.9, from: [-1.9, 3.5], to: [1.9, 3.5], cols: 4, y: 2.7, face: 0, off: 0.02 });
  for (let i = 0; i < 9; i++) cyl(p, 0.07, 0.07, 0.5, cream, -1.9 + i * 0.475, 5.3, 3.55, 8);
  // twin towers with onion domes
  for (const s of [-1, 1]) {
    box(p, 2.1, 6.2, 2.3, bandsT, s * 3.3, 0.3, 2.7);
    windows(p, { w: 0.5, h: 1.3, from: [s * 3.3, 3.86], to: [s * 3.3, 3.86], cols: 1, y: 1.0, face: 0, off: 0 });
    windows(p, { w: 0.4, h: 1.0, from: [s * 3.3, 3.86], to: [s * 3.3, 3.86], cols: 1, y: 3.2, face: 0, off: 0 });
    box(p, 2.35, 0.22, 2.55, cream, s * 3.3, 6.5, 2.7);
    cyl(p, 0.85, 0.95, 0.9, cream, s * 3.3, 6.7, 2.7, 8);
    windows(p, { w: 0.3, h: 0.6, from: [s * 3.3, 2.7], to: [s * 3.3, 2.7], cols: 1, y: 6.85, face: 0, off: 0.95 });
    onion(p, 0.95, copper, s * 3.3, 7.6, 2.7);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cone(p, 0.17, 0.6, copper, s * 3.3 + sx * 0.95, 6.7, 2.7 + sz * 1.1, 8);
  }
}

/* =====================================================================
 *  Great Market Hall
 * ===================================================================== */
function marketHall(p) {
  const brick = mat(0xd8b24c), band = mat(0xb5532f), roofM = tiled(['#d9a52e', '#b5532f', '#2d8a82', '#f0e2b0'], [0.45, 0.45]), base = mat(C.stone);
  ground(box(p, 16, 0.3, 11, base));
  // long hall
  box(p, 14.6, 3.1, 6.6, brick, 0, 0.3, -0.2);
  box(p, 14.8, 0.28, 6.8, band, 0, 3.0, -0.2);
  gable(p, 7.0, 2.6, 14.6, roofM, 0, 3.4, -0.2, Math.PI / 2);
  // glazed monitor on the roof ridge
  box(p, 14.0, 0.7, 1.3, lit(), 0, 5.7, -0.2);
  windows(p, { w: 0.5, h: 1.5, from: [-6.2, 3.05], to: [6.2, 3.05], cols: 9, y: 0.7, face: 0, off: 0 });
  windows(p, { w: 0.5, h: 1.5, from: [-6.2, -3.5], to: [6.2, -3.5], cols: 9, y: 0.7, face: Math.PI, off: 0 });
  // central tower-gable
  box(p, 4.4, 4.6, 1.8, brick, 0, 0.3, 3.2);
  box(p, 4.6, 0.25, 2.0, band, 0, 4.7, 3.2);
  gable(p, 4.6, 1.8, 2.0, roofM, 0, 4.95, 3.2, 0);
  windows(p, { w: 1.5, h: 3.1, from: [0, 4.14], to: [0, 4.14], cols: 1, y: 0.9, face: 0, off: 0.02 });
  windows(p, { w: 0.5, h: 1.0, from: [-1.7, 4.14], to: [1.7, 4.14], cols: 2, y: 1.2, face: 0, off: 0.02 });
  windows(p, { w: 0.5, h: 0.9, from: [-1.5, 4.14], to: [1.5, 4.14], cols: 3, y: 4.0, face: 0, off: 0.02 });
  // corner towers with pointed spires
  for (const s of [-1, 1]) {
    box(p, 1.9, 4.2, 1.9, brick, s * 6.4, 0.3, 3.0);
    box(p, 2.1, 0.22, 2.1, band, s * 6.4, 4.3, 3.0);
    cone(p, 1.3, 3.2, roofM, s * 6.4, 4.5, 3.0, 4);
    windows(p, { w: 0.42, h: 1.0, from: [s * 6.4, 3.96], to: [s * 6.4, 3.96], cols: 1, y: 2.4, face: 0, off: 0 });
    windows(p, { w: 0.42, h: 1.0, from: [s * 6.4, 3.96], to: [s * 6.4, 3.96], cols: 1, y: 0.8, face: 0, off: 0 });
  }
  // awnings with produce crates
  for (let i = 0; i < 5; i++) box(p, 1.5, 0.12, 0.7, mat([0xd6483f, 0x2a9d8f, 0xe0a526, 0x8a4fd1, 0xe07a1f][i]), -4 + i * 2, 0.9, 3.9).rotation.x = 0.25;
}

/* =====================================================================
 *  Gellért Baths
 * ===================================================================== */
function gellert(p) {
  const stone = mat(0xe9e0c8), roofG = faceted(C.copperDk, { roughness: 0.5 }), base = mat(C.stone), gold = metal(C.gold), tile = mat(0x2ea9a0, { roughness: 0.3, metalness: 0.1 });
  ground(box(p, 17, 0.3, 13, base));
  // pool terrace with shimmering water
  box(p, 9.5, 0.4, 5.2, mat(0xd8d0bd), 0, 0.3, 4.2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 4.2, 32, 16), toon({ color: 0x35c6bd }, true));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.68, 4.2); water.receiveShadow = true; p.add(water);
  const pos = water.geometry.attributes.position, b0 = pos.array.slice();
  p.userData.tick = (t) => { for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(b0[i * 3] * 1.7 + t * 1.6) * 0.025 + Math.cos(b0[i * 3 + 1] * 2 + t * 1.2) * 0.025); pos.needsUpdate = true; water.geometry.computeVertexNormals(); };
  for (let i = 0; i < 6; i++) cyl(p, 0.09, 0.11, 0.9, stone, -4.2 + i * 1.68, 0.7, 6.6, 8);
  // central hall
  box(p, 6.4, 4.8, 4.2, stone, 0, 0.3, -0.5);
  const arch = new THREE.Mesh(archGeo(2.6, 3.6), lit()); arch.position.set(0, 0.35, 1.62); p.add(arch);
  windows(p, { w: 0.55, h: 1.1, from: [-2.5, 1.62], to: [2.5, 1.62], cols: 5, y: 3.2, face: 0, off: 0 });
  box(p, 6.7, 0.22, 4.5, mat(C.sand), 0, 5.1, -0.5);
  gable(p, 6.6, 1.7, 4.4, roofG, 0, 5.3, -0.5, Math.PI / 2);
  cyl(p, 1.2, 1.3, 0.9, stone, 0, 5.3, -0.5, 16);
  dome(p, 1.25, faceted(C.copper, { roughness: 0.4 }), 0, 6.2, -0.5, 1.15, 16);
  cone(p, 0.12, 0.8, gold, 0, 7.6, -0.5, 8);
  // wings
  for (const s of [-1, 1]) {
    box(p, 4.8, 3.8, 5.4, stone, s * 5.2, 0.3, -0.4);
    windows(p, { w: 0.5, h: 1.0, from: [s * 3.4, 2.3], to: [s * 7.0, 2.3], cols: 5, y: 0.8, rows: 3, dy: 1.05, face: 0, off: 0 });
    box(p, 5.0, 0.2, 5.6, mat(C.sand), s * 5.2, 4.1, -0.4);
    gable(p, 5.2, 1.4, 5.5, roofG, s * 5.2, 4.3, -0.4, 0);
    // towers with domes
    box(p, 1.6, 5.5, 1.6, stone, s * 7.7, 0.3, 2.1);
    windows(p, { w: 0.4, h: 0.9, from: [s * 7.7, 2.92], to: [s * 7.7, 2.92], cols: 1, y: 3.5, face: 0, off: 0 });
    dome(p, 1.0, faceted(C.copper, { roughness: 0.4 }), s * 7.7, 5.8, 2.1, 1.2, 14);
    cone(p, 0.08, 0.6, gold, s * 7.7, 7.0, 2.1, 6);
  }
  // mosaic band
  box(p, 6.5, 0.18, 0.05, tile, 0, 4.55, 1.62);
}

/* =====================================================================
 *  Citadella & Liberty Statue
 * ===================================================================== */
function citadella(p) {
  const wall = mat(0xbdb4a2), grass = mat(C.grass), stone = mat(0xe3dccb), bronze = metal(0x547c69, 0.35);
  ground(cyl(p, 8, 10.2, 1.8, grass, 0, 0, 0, 48));
  ground(cyl(p, 8.1, 8.6, 0.6, mat(C.rock), 0, 0, 0, 48));
  // star-shaped fortress walls
  const N = 6, R = 6.0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    const ax = Math.sin(a) * R, az = Math.cos(a) * R, bx = Math.sin(b) * R, bz = Math.cos(b) * R;
    const len = Math.hypot(bx - ax, bz - az), o = box(p, len + 0.5, 1.7, 0.9, wall, (ax + bx) / 2, 1.8, (az + bz) / 2);
    o.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    // bastion at each corner
    cyl(p, 0.95, 1.15, 2.1, wall, ax, 1.8, az, 6);
    cone(p, 1.05, 0.55, mat(0x777066), ax, 3.9, az, 6);
    const mid = (a + b) / 2;
    windows(p, { w: 0.2, h: 0.55, from: [Math.sin(mid) * (R * 0.866 + 0.47), Math.cos(mid) * (R * 0.866 + 0.47)], to: [Math.sin(mid) * (R * 0.866 + 0.47), Math.cos(mid) * (R * 0.866 + 0.47)], cols: 1, y: 2.5, face: mid, off: 0 });
  }
  // inner courtyard floor
  cyl(p, 5.1, 5.1, 0.12, mat(0xcfc7b6), 0, 3.4, 0, 6);
  // plinth and pedestal
  cyl(p, 1.9, 2.3, 0.7, stone, 0, 3.5, 0, 4).rotation.y = Math.PI / 4;
  cyl(p, 0.95, 1.5, 4.4, stone, 0, 4.2, 0, 4).rotation.y = Math.PI / 4;
  cyl(p, 1.1, 1.0, 0.3, stone, 0, 8.6, 0, 4).rotation.y = Math.PI / 4;
  // the Liberty figure: robed body, raised arms, palm leaf
  const fig = new THREE.Group(); fig.position.y = 8.9; fig.scale.setScalar(1.35); p.add(fig);
  const prof = [[0.0, 0], [0.62, 0], [0.5, 0.5], [0.38, 1.1], [0.3, 1.7], [0.34, 2.1], [0.26, 2.3], [0.0, 2.3]].map(([x, y]) => new THREE.Vector2(x, y));
  fig.add(shade(new THREE.Mesh(new THREE.LatheGeometry(prof, 18), bronze)));
  const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), bronze)); head.position.set(0, 2.5, 0); fig.add(head);
  for (const s of [-1, 1]) { const arm = cyl(fig, 0.07, 0.09, 1.1, bronze, s * 0.15, 1.65, 0, 8); arm.rotation.z = s * 0.18; }
  const palm = shade(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), bronze)); palm.scale.set(0.55, 1.3, 0.12); palm.position.set(0, 3.3, 0); fig.add(palm);
  cyl(fig, 0.035, 0.04, 0.8, bronze, 0, 2.6, 0, 6);
  const cloak = shade(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.7, 3), bronze)); cloak.position.set(0, 1.3, -0.35); cloak.rotation.x = -0.28; fig.add(cloak);
  // small sculptures at the pedestal
  for (const [x, z] of [[1.55, 0], [-1.55, 0]]) { cyl(p, 0.2, 0.28, 0.9, bronze, x, 4.2, z, 8); const h = shade(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bronze)); h.position.set(x, 5.2, z); p.add(h); }
}

/* =====================================================================
 *  Heroes' Square: the Millennium Monument between the two museums
 *  Front (+z) faces Andrássy Avenue; the Museum of Fine Arts stands on the left, the Műcsarnok on the right.
 * ===================================================================== */
function hall(p, { x, z, rotY, len, dep, h, cols, wall, roof, band }) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; p.add(g);
  const trim = mat(0xf2ecdc), f = dep / 2, pw = cols * 0.62, stone = mat(C.stone);
  box(g, len + 0.6, 0.3, dep + 0.6, stone);
  box(g, len, h, dep, wall, 0, 0.3);
  box(g, len + 0.3, 0.22, dep + 0.3, trim, 0, h + 0.3);
  box(g, len - 0.6, 0.5, dep - 0.6, roof, 0, h + 0.52);
  box(g, len * 0.5, 0.35, 1.0, lit(), 0, h + 1.02);
  // temple portico facing the square
  box(g, pw + 0.5, 0.18, 1.6, stone, 0, 0.3, f + 0.8);
  for (const cx of line(cols, -pw / 2, pw / 2)) cyl(g, 0.12, 0.14, h - 0.35, trim, cx, 0.48, f + 1.3, 12);
  box(g, pw + 0.5, 0.35, 1.8, trim, 0, h + 0.13, f + 0.9);
  gable(g, pw + 0.5, 1.0, 1.8, trim, 0, h + 0.48, f + 0.9, 0);
  if (band) box(g, pw, 0.3, 0.06, metal(C.gold), 0, h - 0.5, f + 0.03);
  for (const s of [-1, 1]) windows(g, { w: 0.3, h: 0.7, from: [s * (pw / 2 + 0.7), f], to: [s * (len / 2 - 0.9), f], cols: 3, y: 0.85, rows: 2, dy: 0.95, face: 0, off: 0.02 });
}

function equestrian(p, x, z, rotY, m) {
  const g = new THREE.Group(); g.position.set(x, 0.35, z); g.rotation.y = rotY; p.add(g);
  box(g, 0.2, 0.26, 0.55, m, 0, 0.3);                        // horse body, nose along +z
  for (const [dx, dz] of [[-0.06, -0.2], [0.06, -0.2], [-0.06, 0.2], [0.06, 0.2]]) cyl(g, 0.025, 0.03, 0.3, m, dx, 0, dz, 6);
  box(g, 0.1, 0.3, 0.12, m, 0, 0.45, 0.3).rotation.x = -0.4;  // neck and head
  cyl(g, 0.07, 0.09, 0.3, m, 0, 0.55, -0.02, 8);              // rider
  const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m)); head.position.set(0, 0.92, -0.02); g.add(head);
}

function millennium(p) {
  const stone = mat(0xe8dfc9), bronze = mat(0x4f8a73), gold = metal(C.gold), dark = mat(0xcfc4aa), sand = mat(C.sand);
  ground(box(p, 30, 0.1, 14, dark, 0, 0, 0));
  hall(p, { x: -22.5, z: 0, rotY: Math.PI / 2, len: 15, dep: 8, h: 2.5, cols: 8, wall: mat(0xe9dfc3), roof: mat(0x7d8a90) });
  hall(p, { x: 22.5, z: 0, rotY: -Math.PI / 2, len: 13, dep: 7.4, h: 2.3, cols: 6, wall: mat(0xe3d3ad), roof: mat(0x7d8a90), band: true });
  // the two colonnades curve round the back of the square, each topped by seven kings
  const R = 7.5, cz = 3.5, arc = (r, s) => line(8, 22, 66).map((a) => [s * r * Math.sin((a * Math.PI) / 180), cz - r * Math.cos((a * Math.PI) / 180)]);
  const run = (pts, h, d, y, m) => pts.slice(1).forEach(([bx, bz], i) => {
    const [x, z] = pts[i], o = box(p, Math.hypot(bx - x, bz - z) + 0.05, h, d, m, (x + bx) / 2, y, (z + bz) / 2);
    o.rotation.y = Math.atan2(bx - x, bz - z) + Math.PI / 2;
  });
  for (const s of [-1, 1]) {
    const pts = arc(R, s);
    run(pts, 0.2, 0.9, 0, dark);
    run(arc(R + 0.55, s), 1.7, 0.18, 0.2, sand);
    run(pts, 0.3, 0.55, 1.8, stone);
    for (const [x, z] of pts) {
      cyl(p, 0.11, 0.13, 1.6, stone, x, 0.2, z, 12);
      box(p, 0.34, 0.24, 0.34, stone, x, 2.1, z);
      cyl(p, 0.1, 0.16, 0.55, bronze, x, 2.34, z, 8);
      const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bronze)); head.position.set(x, 3.0, z); p.add(head);
    }
  }
  // central platform, pedestal, column and Archangel Gabriel
  cyl(p, 3.5, 3.7, 0.35, dark, 0, 0, -1.5, 40);
  cyl(p, 3.0, 3.2, 0.12, sand, 0, 0.35, -1.5, 40);
  box(p, 2.4, 0.8, 2.4, stone, 0, 0.47, -1.5);
  cyl(p, 0.42, 0.52, 2.7, stone, 0, 1.27, -1.5, 22);
  cyl(p, 0.64, 0.46, 0.32, stone, 0, 3.97, -1.5, 22);
  cyl(p, 0.17, 0.26, 0.8, gold, 0, 4.29, -1.5, 10);
  const gab = shade(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), gold)); gab.position.set(0, 5.2, -1.5); p.add(gab);
  for (const s of [-1, 1]) { const w = box(p, 0.7, 0.42, 0.05, gold, s * 0.38, 4.5, -1.5); w.rotation.z = s * -0.45; }
  cyl(p, 0.02, 0.02, 0.6, gold, 0.28, 4.4, -1.5, 5);
  // the seven chieftains on horseback around the foot of the column
  line(7, -72, 72).forEach((a, i) => {
    const r = (a * Math.PI) / 180;
    equestrian(p, 2.45 * Math.sin(r), -1.5 + 2.45 * Math.cos(r), r, bronze);
  });
}

/* =====================================================================
 *  Vajdahunyad Castle: Romanesque, Gothic, Renaissance and Baroque wings around a lake
 *  Front (+z) faces the lake and the entrance bridge.
 * ===================================================================== */
function crenels(p, cx, cz, w, y, m) {
  const n = Math.max(4, Math.round(w / 0.45)), step = w / n;
  for (let i = 0; i < n; i += 2) {
    const t = -w / 2 + step * (i + 0.5);
    for (const s of [-1, 1]) { box(p, step * 0.8, 0.3, 0.2, m, cx + t, y, cz + s * w / 2); box(p, 0.2, 0.3, step * 0.8, m, cx + s * w / 2, y, cz + t); }
  }
}

function tree(p, x, z, k = 1) {
  cyl(p, 0.08 * k, 0.12 * k, 0.7 * k, mat(0x7a5a3c), x, 0.2, z, 6);
  cone(p, 0.65 * k, 1.2 * k, mat(0x5fb86a), x, 0.8 * k, z, 8);
  cone(p, 0.5 * k, 1.0 * k, mat(0x76cf78), x, 1.5 * k, z, 8);
}

function vajdahunyad(p) {
  const stone = mat(0xe6d6b0), ochre = mat(0xe8bf6c), roofR = faceted(0xc4502f), roofD = faceted(0x6d5a74), copper = faceted(C.copper), base = mat(C.stone), gold = metal(C.gold);
  // moat, island and the stone platform the castle stands on
  ground(box(p, 33, 0.12, 22, mat(0x4fc3e8), 0, 0, -1.2));
  ground(box(p, 31, 0.3, 18.5, base, 0, 0, -1.75));
  ground(box(p, 29.6, 0.32, 17.1, mat(C.grass), 0, 0, -1.75));
  box(p, 30, 0.6, 13.5, base, 0, 0.1, -3.3);
  for (const [x, z] of [[-11, 5.7], [-7, 5.7], [7, 5.7], [11, 5.7], [-14.5, 5.2], [14.5, 5.2]]) tree(p, x, z, 1.15);
  // Baroque mansion (left wing) with mansard roof and a copper lantern
  box(p, 10, 3.2, 5, ochre, -9, 0.7, -5);
  box(p, 10.3, 0.2, 5.3, stone, -9, 3.9, -5);
  gable(p, 5.4, 1.5, 10.4, roofD, -9, 4.1, -5, Math.PI / 2);
  box(p, 3.2, 3.7, 1.3, stone, -9, 0.7, -2.4);
  gable(p, 3.5, 1.0, 1.4, stone, -9, 4.4, -2.4, 0);
  cyl(p, 0.5, 0.6, 0.8, stone, -9, 5.4, -5, 12);
  dome(p, 0.55, copper, -9, 6.2, -5, 1.3, 14);
  cone(p, 0.07, 0.6, gold, -9, 6.9, -5, 6);
  windows(p, { w: 0.34, h: 0.75, from: [-13.4, -2.5], to: [-4.6, -2.5], cols: 8, y: 1.3, rows: 2, dy: 1.15, face: 0, off: 0.02 });
  windows(p, { w: 0.4, h: 0.8, from: [-9.9, -1.74], to: [-8.1, -1.74], cols: 3, y: 1.4, rows: 2, dy: 1.3, face: 0, off: 0.02 });
  // Gothic hall at the back and the square Hunyadi tower
  box(p, 8.4, 3.0, 4, stone, -0.4, 0.7, -8.4);
  gable(p, 4.4, 2.7, 8.4, roofR, -0.4, 3.7, -8.4, Math.PI / 2);
  windows(p, { w: 0.5, h: 1.5, from: [-3.6, -6.38], to: [2.8, -6.38], cols: 5, y: 1.2, face: 0, off: 0 });
  box(p, 2.8, 6.0, 2.8, stone, 5.4, 0.7, -8.2);
  box(p, 3.1, 0.25, 3.1, base, 5.4, 6.55, -8.2);
  crenels(p, 5.4, -8.2, 3.1, 6.8, stone);
  cone(p, 2.15, 3.4, roofD, 5.4, 6.8, -8.2, 4);
  cone(p, 0.07, 0.8, gold, 5.4, 10.2, -8.2, 6);
  windows(p, { w: 0.3, h: 0.9, from: [5.4, -6.78], to: [5.4, -6.78], cols: 1, y: 4.0, face: 0, off: 0 });
  windows(p, { w: 0.3, h: 0.9, from: [5.4, -6.78], to: [5.4, -6.78], cols: 1, y: 2.3, face: 0, off: 0 });
  // Ják-style chapel (right wing): nave, round-arched portal and two stout towers
  box(p, 5, 2.7, 7.4, stone, 10.8, 0.7, -4.5);
  gable(p, 5.3, 1.7, 7.5, roofR, 10.8, 3.4, -4.5, 0);
  for (const s of [-1, 1]) {
    box(p, 1.5, 4.4, 1.5, stone, 10.8 + s * 1.75, 0.7, -0.35);
    cone(p, 1.15, 2.6, roofR, 10.8 + s * 1.75, 5.1, -0.35, 4);
    windows(p, { w: 0.3, h: 0.8, from: [10.8 + s * 1.75, 0.4], to: [10.8 + s * 1.75, 0.4], cols: 1, y: 3.2, face: 0, off: 0.02 });
  }
  const portal = new THREE.Mesh(archGeo(1.3, 2.1), lit()); portal.position.set(10.8, 0.7, -0.78); p.add(portal);
  // round bastion at the front-left corner
  cyl(p, 1.55, 1.75, 4.6, stone, -13.2, 0.7, 2.4, 22);
  crenels(p, -13.2, 2.4, 2.4, 5.3, stone);
  cone(p, 1.7, 2.6, copper, -13.2, 5.3, 2.4, 22);
  // main gatehouse with twin turrets, and the bridge across the lake
  box(p, 4, 3.8, 2.4, stone, 0, 0.7, 2.6);
  box(p, 4.3, 0.25, 2.7, base, 0, 4.5, 2.6);
  crenels(p, 0, 2.6, 4.0, 4.75, stone);
  const gate = new THREE.Mesh(archGeo(1.6, 2.4), lit()); gate.position.set(0, 0.7, 3.84); p.add(gate);
  for (const s of [-1, 1]) {
    cyl(p, 0.7, 0.82, 5.2, stone, s * 2.1, 0.7, 3.0, 14);
    cone(p, 0.95, 2.2, roofR, s * 2.1, 5.9, 3.0, 14);
    windows(p, { w: 0.25, h: 0.7, from: [s * 2.1, 3.84], to: [s * 2.1, 3.84], cols: 1, y: 3.4, face: 0, off: 0 });
  }
  box(p, 2.4, 0.4, 9.4, base, 0, 0.3, 8.5);
  for (const s of [-1, 1]) box(p, 0.2, 0.5, 9.4, stone, s * 1.1, 0.7, 8.5);
}

/* =====================================================================
 *  The other Danube bridges: Elizabeth, Liberty, Petőfi, Rákóczi, Margaret
 *  Each runs along x with the Buda end at -x; the map layer turns x to the bridge's real heading.
 *  Heights are stretched about 1.8x so the structures read from the air.
 * ===================================================================== */

/** A thin bar between two points [x, y, z]. */
function strut(p, a, b, t, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const o = shade(new THREE.Mesh(new THREE.BoxGeometry(t, A.distanceTo(B), t), m), false);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  p.add(o); return o;
}

/** A stretch of river with a gentle swell. Ground, so the map drops it (and its animation). */
function danube(p, w, d, cz = 0) {
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 48, 32), toon({ color: C.water }, true));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.25, cz); water.receiveShadow = true; p.add(ground(water)); p.userData.tickIsGround = true;
  const pos = water.geometry.attributes.position, base = pos.array.slice();
  p.userData.tick = (t) => {
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(base[i * 3] * 0.9 + t * 1.3) * 0.05 + Math.cos(base[i * 3 + 1] * 1.1 + t) * 0.05);
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
  };
}

/** A pair of quays either side of the river, from |x| = from to |x| = to. */
function quays(p, from, to, depth = 9, thick = 1.0) {
  for (const s of [-1, 1]) {
    ground(box(p, to - from, thick, depth, mat(0x8a8d78), s * (from + to) / 2, 0, 0));
    ground(box(p, to - from, 0.2, depth, mat(C.stone), s * (from + to) / 2, thick, 0));
  }
}

function lampPost(p, x, y, z, h = 0.6) {
  cyl(p, 0.025, 0.03, h, metal(0x2f3541), x, y, z, 6);
  const l = shade(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lit())); l.position.set(x, y + h + 0.06, z); p.add(l);
}

/* ---------- Elizabeth Bridge: one white suspension span, tower to tower ---------- */
function elizabethBridge(p) {
  const white = metal(0xf4f2ea), road = metal(0x4b505a), stone = mat(0xd9d2c1);
  const L = 11, T = 8.45, H = 6.1, deckY = 1.0, zc = 1.4, top = H - 0.15;
  danube(p, 2 * T, 9); quays(p, T, L + 1.6);
  // deck, stiffening girders, abutments
  box(p, 2 * L, 0.26, 2.5, road, 0, deckY);
  for (const s of [-1, 1]) { box(p, 2 * L, 0.42, 0.14, white, 0, deckY - 0.08, s * 1.2); box(p, 0.8, 1.2, 3.4, stone, s * (L - 0.4), 0); }
  // pylons: two slim legs joined by cross beams, standing on the quays
  for (const tx of [-T, T]) {
    box(p, 1.2, 1.2, 3.5, stone, tx, 0);
    for (const s of [-1, 1]) { box(p, 0.36, H - 1.2, 0.36, white, tx, 1.2, s * zc); cyl(p, 0.12, 0.2, 0.3, metal(C.gold), tx, H, s * zc, 8); }
    box(p, 0.3, 0.3, 2 * zc + 0.36, white, tx, H - 0.45);
    box(p, 0.26, 0.2, 2 * zc, white, tx, 3.6);
  }
  // cables: a catenary between the pylons, straighter back-stays to the abutments, hangers on the main span
  const sag = (x) => 1.9 + (top - 1.9) * (x / T) ** 2;
  for (const z of [-zc, zc]) {
    tube(p, line(36, -T, T).map((x) => new THREE.Vector3(x, sag(x), z)), 0.07, white);
    for (const s of [-1, 1]) tube(p, line(14, T, L - 0.3).map((x) => new THREE.Vector3(s * x, top - (top - 1.35) * ((x - T) / (L - 0.3 - T)) ** 1.15, z)), 0.07, white);
    for (const x of line(17, -T + 0.5, T - 0.5)) box(p, 0.03, sag(x) - 1.3, 0.03, white, x, 1.3, z);
  }
  for (const x of line(9, -9.5, 9.5)) for (const z of [-1.1, 1.1]) lampPost(p, x, 1.26, z, 0.5);
}

/* ---------- Liberty Bridge: green cantilever truss, four pylons crowned with turul birds ---------- */
function libertyBridge(p) {
  const green = metal(0x6fa35a), road = metal(0x4b505a), stone = mat(0xd9d2c1), gold = metal(C.gold);
  const L = 10, P = 5.25, zt = 1.6, deckY = 1.0, chordY = deckY + 0.3;
  danube(p, 2 * P + 2, 9); quays(p, P + 1, L + 1.6);
  // top chord is highest over the piers, dips mid-span and slopes down to the abutments
  const yt = (x) => { const a = Math.abs(x); return a <= P ? 2.3 + 2.0 * (a / P) ** 2 : 4.3 - 2.4 * ((a - P) / (L - P)) ** 1.3; };
  box(p, 2 * L, 0.28, 2.9, road, 0, deckY);
  for (const s of [-1, 1]) { box(p, 2.2, 1.0, 3.8, stone, s * P, 0); box(p, 0.9, 1.0, 3.4, stone, s * (L - 0.4), 0); }
  for (const z of [-zt, zt]) {
    box(p, 2 * L, 0.22, 0.16, green, 0, deckY + 0.28, z);
    tube(p, line(41, -L, L).map((x) => new THREE.Vector3(x, yt(x), z)), 0.1, green);
    const xs = line(33, -L, L);
    xs.forEach((x, i) => {
      strut(p, [x, chordY + 0.1, z], [x, yt(x), z], 0.06, green);
      if (i === xs.length - 1) return;
      const n = xs[i + 1], flip = (x + n) / 2 > 0;
      strut(p, [flip ? n : x, chordY + 0.1, z], [flip ? x : n, yt(flip ? x : n), z], 0.045, green);
    });
  }
  // pylons with a turul bird on each
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * P, z = sz * zt;
    box(p, 0.62, 4.4, 0.62, green, x, deckY, z);
    box(p, 0.86, 0.2, 0.86, stone, x, deckY + 4.4, z);
    cyl(p, 0.08, 0.15, 0.4, gold, x, deckY + 4.6, z, 8);
    const head = shade(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), gold)); head.position.set(x, deckY + 5.1, z); p.add(head);
    for (const w of [-1, 1]) { const wing = box(p, 0.14, 0.04, 0.5, gold, x, deckY + 4.82, z + w * 0.28); wing.rotation.x = w * 0.55; }
  }
  box(p, 0.3, 0.3, 2 * zt, green, P, yt(P) - 0.2); box(p, 0.3, 0.3, 2 * zt, green, -P, yt(P) - 0.2);
  for (const x of line(7, -8, 8)) for (const z of [-1.3, 1.3]) lampPost(p, x, deckY + 0.28, z, 0.45);
}

/* ---------- Petőfi Bridge: three steel deck-truss spans, deepest over the river piers ---------- */
function petofiBridge(p) {
  const steel = metal(0x7f9a8c), road = metal(0x4b505a), stone = mat(0xd9d2c1);
  const L = 12, P = 3.6, zt = 1.75, deckY = 1.8;
  const depth = (x) => 0.42 + 0.7 * Math.exp(-(((Math.abs(x) - P) / 1.1) ** 2));
  danube(p, 2 * (P + 3.4), 9); quays(p, P + 3.4, L + 1.6);
  box(p, 2 * L, 0.22, 3.9, road, 0, deckY);
  for (const s of [-1, 1]) { box(p, 1.1, deckY - 1.12, 3.9, stone, s * P, 0); box(p, 1.0, deckY - 0.4, 3.9, stone, s * (L - 0.5), 0); box(p, 2 * L, 0.1, 0.1, steel, 0, deckY + 0.22, s * 1.95); }
  for (const z of [-zt, zt]) {
    box(p, 2 * L, 0.2, 0.2, steel, 0, deckY - 0.2, z);
    tube(p, line(61, -L, L).map((x) => new THREE.Vector3(x, deckY - depth(x), z)), 0.08, steel);
    const xs = line(49, -L, L);
    xs.forEach((x, i) => {
      strut(p, [x, deckY - depth(x), z], [x, deckY - 0.1, z], 0.05, steel);
      if (i < xs.length - 1) { const n = xs[i + 1]; i % 2 ? strut(p, [x, deckY - depth(x), z], [n, deckY - 0.1, z], 0.04, steel) : strut(p, [x, deckY - 0.1, z], [n, deckY - depth(n), z], 0.04, steel); }
    });
  }
  for (const x of line(17, -L + 1, L - 1)) box(p, 0.14, 0.1, 2 * zt, steel, x, deckY - depth(x) - 0.04);
  for (const x of line(9, -10, 10)) for (const z of [-1.95, 1.95]) lampPost(p, x, deckY + 0.22, z, 0.9);
}

/* ---------- Rákóczi Bridge: a slim modern box girder, haunched over slender river piers ---------- */
function rakocziBridge(p) {
  const girder = metal(0xaab6bf), road = metal(0x4b505a), conc = metal(0xc9c9c4), steel = metal(0x2f3541);
  const L = 12, piers = [-7.5, -2.5, 2.5, 7.5], deckY = 1.7, W = 4.0;
  const depth = (x) => 0.3 + 0.62 * piers.reduce((s, px) => s + Math.exp(-(((x - px) / 1.35) ** 2)), 0);
  danube(p, 20, 9); quays(p, 10, L + 1.6);
  // the girder as a side profile extruded across the roadway
  const prof = new THREE.Shape(); prof.moveTo(-L, deckY); prof.lineTo(L, deckY);
  for (const x of line(97, L, -L)) prof.lineTo(x, deckY - depth(x));
  prof.closePath();
  const geo = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: false }); geo.translate(0, 0, -W / 2);
  p.add(shade(new THREE.Mesh(geo, girder)));
  box(p, 2 * L, 0.1, W + 0.4, road, 0, deckY);
  for (const z of [-(W / 2 + 0.15), W / 2 + 0.15, 0]) box(p, 2 * L, 0.18, z ? 0.1 : 0.14, conc, 0, deckY + 0.1, z);
  for (const px of piers) for (const z of [-1.0, 1.0]) cyl(p, 0.28, 0.34, deckY - depth(px), conc, px, 0, z, 14);
  for (const s of [-1, 1]) box(p, 1.0, deckY - 0.28, W + 0.4, mat(C.stone), s * (L - 0.5), 0);
  // tall twin-arm lamps down the median
  for (const x of line(11, -10.5, 10.5)) {
    cyl(p, 0.035, 0.05, 1.5, steel, x, deckY + 0.18, 0, 8);
    box(p, 0.05, 0.05, 1.5, steel, x, deckY + 1.66, 0);
    for (const z of [-0.7, 0.7]) { const l = shade(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lit())); l.position.set(x, deckY + 1.6, z); p.add(l); }
  }
}

/* ---------- Margaret Bridge: two iron-arch arms meeting at a bend over the river, with a spur to the island ---------- */
function margaretBridge(p) {
  const iron = metal(0x6c7a86), road = metal(0x4b505a), stone = mat(0xd9d2c1), gold = metal(C.gold);
  const deckY = 1.2, W = 2.5;
  const B = [-12, 0], A = [-1.8, -3.24], P = [12, 0], S = [-2.08, -6.44];   // Buda end, the bend, Pest end, island end
  danube(p, 24.6, 12, -3.2); quays(p, 12.3, 14.4, 6);
  ground(box(p, 4.2, 0.9, 3.4, mat(C.grass), S[0], 0, S[1] - 2.5));
  /** One straight arm from `a` to `b`: stone piers with round cutwaters, shallow iron arches under the deck, rails and lamp steles. */
  function arm(a, b, spans, w) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), g = new THREE.Group();
    g.position.set(a[0], 0, a[1]); g.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); g.updateMatrix();
    box(g, len, 0.26, w, road, len / 2, deckY);
    for (const s of [-1, 1]) box(g, len, 0.16, 0.08, iron, len / 2, deckY + 0.26, s * w / 2);
    const xs = line(spans + 1, 0, len);
    xs.forEach((x, i) => {
      if (i > 0 && i < spans) {
        box(g, 0.9, deckY, w + 0.4, stone, x, 0, 0);
        for (const s of [-1, 1]) cyl(g, 0.45, 0.45, deckY, stone, x, 0, s * (w + 0.4) / 2, 14);
      }
      for (const s of [-1, 1]) {   // lamp stele on each pier and end
        box(g, 0.3, 0.8, 0.3, stone, x, deckY + 0.26, s * (w / 2 + 0.05)); box(g, 0.4, 0.1, 0.4, stone, x, deckY + 1.06, s * (w / 2 + 0.05));
        const l = shade(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lit())); l.position.set(x, deckY + 1.32, s * (w / 2 + 0.05)); g.add(l);
      }
    });
    for (let j = 0; j < spans; j++) {
      const x0 = xs[j] + 0.45, x1 = xs[j + 1] - 0.45, y = (x) => 0.55 + 0.5 * 4 * ((x - x0) / (x1 - x0)) * (1 - (x - x0) / (x1 - x0));
      for (const s of [-1, 1]) {
        const z = s * (w / 2 - 0.1);
        tube(g, line(15, x0, x1).map((x) => new THREE.Vector3(x, y(x), z)), 0.07, iron);
        for (const x of line(Math.max(4, Math.round((x1 - x0) / 0.45)), x0 + 0.2, x1 - 0.2)) box(g, 0.04, deckY - y(x), 0.04, iron, x, y(x), z);
      }
    }
    for (const c of [...g.children]) { c.applyMatrix4(g.matrix); p.add(c); }
  }
  arm(B, A, 3, W); arm(A, P, 3, W); arm(A, S, 1, 1.6);
  // the drum pier at the bend, with a tall column and gold finial
  cyl(p, 1.1, 1.2, deckY, stone, A[0], 0, A[1], 28);
  cyl(p, 0.22, 0.28, 2.2, stone, A[0], deckY + 0.26, A[1], 12); cone(p, 0.24, 0.5, gold, A[0], deckY + 2.46, A[1], 10);
  for (const s of [-1, 1]) box(p, 1.1, deckY, W + 0.6, stone, s * 11.7, 0);
}

/* ---------- registry ---------- */

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
};

// One merged "inverted hull": every mesh pushed out along smoothed normals and drawn back-faces only, in black
const inkMat = (thick) => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normalize(normal) * ${thick.toFixed(4)};`); };
  m.customProgramCacheKey = () => 'ink' + thick.toFixed(4);
  return m;
};

function inked(group) {
  group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g = toCreasedNormals(g, Math.PI);
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  const hull = new THREE.Mesh(mergeGeometries(geos, false), inkMat(0.0055 * Math.max(size.x, size.z)));
  hull.userData.ink = true; hull.castShadow = hull.receiveShadow = false; hull.frustumCulled = false;
  return hull;
}

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
  group.add(shade(new THREE.Mesh(geo, [mat(C.rock), mat(0xc3ee9b)])));
  group.add(inked(group));
  return group;
}

/** Builds a fresh model. Returns { group, glows, tick? } — glows are window materials to light at dusk.
 *  `base: false` drops the ground pieces (hills, plinths, water) for use on the map. */
export function buildModel(id, { base = true } = {}) {
  glows = [];
  const group = new THREE.Group();
  BUILDERS[id](group);
  if (!base) {
    const drop = [];
    group.traverse((o) => { if (o.userData.base) drop.push(o); });
    drop.forEach((o) => o.parent.remove(o));
    if (group.userData.tickIsGround) group.userData.tick = null;
  }
  group.add(inked(group));
  return { group, glows: [...glows], tick: group.userData.tick || null };
}
