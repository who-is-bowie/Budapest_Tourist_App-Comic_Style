import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Modelling kit shared by the landmark builders in models.js.
 * Every primitive goes through a `kit`, which batches geometry per material (one draw call each, so models can
 * afford real detail) and remembers each part so the ink outline can be sized to it: big masses get a bold line,
 * pinnacles and balusters a fine one. Generators build their geometry standing on y = 0 at x = z = 0. */

export const C = {
  white: 0xf1ece0, cream: 0xe9dfc3, sand: 0xdccaa0, stone: 0xcfc7b6, rock: 0x8f887a, slate: 0x4b5058,
  red: 0xb9492f, brick: 0xb86a4b, copper: 0x67a592, copperDk: 0x4a8575, gold: 0xe0b445,
  grass: 0x7f9560, water: 0x3f7fb4, teal: 0x39b0a5, dark: 0x2b3342, iron: 0x2f3541, road: 0x4b505a,
};

/* ---------- materials ---------- */

export const INK = 0x14121a;
let glows = [];   // window materials whose emissive intensity follows the time of day
const cache = new Map();
export const resetGlows = () => { glows = []; };
export const currentGlows = () => [...glows];

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

export function toon(params, flat = false, detail = false) {
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp, ...params });
  m.flatShading = flat; m.clipShadows = true;
  m.onBeforeCompile = patch(detail);
  m.customProgramCacheKey = () => (detail ? 'toon-detail' : 'toon-plain');
  return m;
}

// roughness / metalness / envMapIntensity are accepted and ignored: toon shading has no use for them.
// Stone-like colours get block coursing; greens, blues and metals stay smooth.
export function mat(color, { roughness, metalness, envMapIntensity, flatShading, plain, ...o } = {}) {
  const key = color + JSON.stringify(o) + flatShading + plain;
  if (!cache.has(key)) {
    const c = new THREE.Color(color), natural = !(c.g > c.r * 1.02 && c.g > c.b) && !(c.b > c.r && c.b > c.g);
    cache.set(key, toon({ color, ...o }, !!flatShading, !!natural && !plain && !flatShading && !o.map && !o.emissive));
  }
  return cache.get(key);
}
export const metal = (color) => mat(color, { plain: true });
export const plain = metal;
export const faceted = (color, o = {}) => mat(color, { ...o, flatShading: true });

/** Window glass: dark by day, lit at dusk and night. */
export function lit() {
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

const texCache = new Map();
const texMat = (key, make) => { if (!texCache.has(key)) texCache.set(key, mat(0xffffff, { map: make() })); return texCache.get(key); };

/** Zsolnay roof: rows of coloured diamonds on a ground colour, as on Matthias Church and the Market Hall.
 *  UVs are in model units, so `per` is how many model units one pattern tile covers. */
export function zsolnay(cols, per = 2) {
  return texMat('zs' + cols.join() + per, () => canvasTex(128, (g, s) => {
    g.fillStyle = cols[0]; g.fillRect(0, 0, s, s);
    const n = 4, d = s / n;
    for (let r = 0; r < n * 2; r++) for (let i = 0; i <= n; i++) {
      const cx = i * d + (r % 2 ? d / 2 : 0), cy = r * d / 2;
      g.fillStyle = cols[1 + ((r + (r % 4 < 2 ? i : 0)) % (cols.length - 1))];
      g.beginPath(); g.moveTo(cx, cy - d / 2 + 2); g.lineTo(cx + d / 2 - 2, cy); g.lineTo(cx, cy + d / 2 - 2); g.lineTo(cx - d / 2 + 2, cy); g.fill();
    }
  }, [1 / per, 1 / per]));
}

/** Horizontal bands of two colours (Dohány Street Synagogue brickwork). `per` = model units per band pair. */
export function banded(a, b, per = 0.8) {
  return texMat('bd' + a + b + per, () => canvasTex(64, (g, s) => {
    g.fillStyle = a; g.fillRect(0, 0, s, s); g.fillStyle = b;
    g.fillRect(0, 0, s, s * 0.3);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, s * 0.3, s, 2);
  }, [1, 1 / per]));
}

/* ---------- geometry generators (standing on y = 0) ---------- */

const V2 = (x, y) => new THREE.Vector2(x, y);

export const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const radial = (g) => { g.userData.radial = true; return g; };
export const cylG = (rt, rb, h, seg = 24) => radial(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0));
export const sphereG = (r, ws = 16, hs = 12) => radial(new THREE.SphereGeometry(r, ws, hs));

/** Surface of revolution from [[radius, y], ...] bottom to top. */
export function latheG(profile, seg = 24) {
  const pts = profile.map(([r, y]) => V2(Math.max(r, 0.0001), y));
  return radial(new THREE.LatheGeometry(pts, seg));
}

/** A frustum on a w × d base narrowing to wt × dt at height h. Covers hipped roofs (dt = 0, wt = w - d),
 *  pyramids (0, 0), gable ends (wt = w, dt = 0) and mansard lower slopes (both > 0). UVs in model units. */
export function frustumG(w, d, wt, dt, h) {
  const b = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const t = [[-wt / 2, -dt / 2], [wt / 2, -dt / 2], [wt / 2, dt / 2], [-wt / 2, dt / 2]];
  const pos = [], uv = [];
  const quad = (A, B, Cc, D) => {
    // A, B on the bottom edge, D, C above them; u runs along the eave, v up the slope
    const ex = B[0] - A[0], ez = B[2] - A[2], el = Math.hypot(ex, ez) || 1;
    const U = (P) => ((P[0] - A[0]) * ex + (P[2] - A[2]) * ez) / el;
    const slope = Math.hypot(h, Math.hypot((D[0] + Cc[0]) / 2 - (A[0] + B[0]) / 2, (D[2] + Cc[2]) / 2 - (A[2] + B[2]) / 2));
    const Vv = (P) => (P[1] > 0 ? slope : 0);
    for (const P of [A, B, Cc, A, Cc, D]) { pos.push(...P); uv.push(U(P), Vv(P)); }
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad([b[i][0], 0, b[i][1]], [b[j][0], 0, b[j][1]], [t[j][0], h, t[j][1]], [t[i][0], h, t[i][1]]);
  }
  if (wt > 0 && dt > 0) for (const P of [t[0], t[2], t[1], t[0], t[3], t[2]]) { pos.push(P[0], h, P[1]); uv.push(P[0], P[1]); }
  for (const P of [b[0], b[1], b[2], b[0], b[2], b[3]]) { pos.push(P[0], 0, P[1]); uv.push(P[0], P[1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // outward winding: fix any face whose normal points inward
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - h / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (cx * n.getX(i) + cy * n.getY(i) + cz * n.getZ(i) < 0) {
      for (const a of [p, g.attributes.uv]) { const s = a.itemSize, arr = a.array; for (let k = 0; k < s; k++) { const tmp = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = tmp; } }
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A 2D shape (x across, y up) extruded `depth` along z, centred on z = 0. */
export function prismG(shape, depth, curve = 6) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curve }).translate(0, 0, -depth / 2);
}
export const poly = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };

/** Triangular roof prism: span across x, ridge along z. */
export const gableG = (span, h, len) => prismG(poly([[-span / 2, 0], [span / 2, 0], [0, h]]), len);

/** Opening outlines: 'arch' (round head), 'pointed' (Gothic), 'rect', 'round' (oculus), 'ogee'-ish 'tudor'. */
function openingPath(path, kind, x, w, y, h, ccw = true, n = 12) {
  const r = w / 2;
  const pts = [];
  if (kind === 'round') { for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + h / 2 + Math.sin(a) * r]); } }
  else {
    pts.push([x - r, y], [x + r, y]);
    if (kind === 'rect') pts.push([x + r, y + h], [x - r, y + h]);
    else if (kind === 'pointed') {
      const spring = y + h - w * 0.87, R = w * 0.9;   // two arcs whose centres sit inside the opposite jamb
      const m = Math.max(2, Math.round(n * 0.6));
      for (let i = 0; i <= m; i++) { const a = (i / m) * Math.acos((R - r) / R); pts.push([x + r - R + Math.cos(a) * R, spring + Math.sin(a) * R]); }
      for (let i = m - 1; i >= 0; i--) { const a = (i / m) * Math.acos((R - r) / R); pts.push([x - r + R - Math.cos(a) * R, spring + Math.sin(a) * R]); }
    } else {
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([x + Math.cos(a) * r, y + h - r + Math.sin(a) * r]); }
    }
  }
  if (!ccw) pts.reverse();
  pts.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
  path.closePath?.();
  return path;
}
export const openingShape = (kind, w, h, n) => openingPath(new THREE.Shape(), kind, 0, w, 0, h, true, n);

/** A wall `len` × `h`, `depth` thick, pierced by `n` evenly spaced openings `ow` × `oh` sitting `sill` above its foot. */
export function arcadeG(len, h, depth, n, ow, oh, { kind = 'arch', sill = 0 } = {}) {
  const s = poly([[-len / 2, 0], [len / 2, 0], [len / 2, h], [-len / 2, h]]);
  const step = len / n;
  for (let i = 0; i < n; i++) s.holes.push(openingPath(new THREE.Path(), kind, -len / 2 + step * (i + 0.5), ow, sill, oh, false));
  return prismG(s, depth, 8);
}

/** Dome profile: a quarter ellipse r wide and h tall, optionally pointed (onion-free Gothic) or with a flare at the foot. */
export function domeProfile(r, h, { n = 12, point = 0, top = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI / 2, k = Math.cos(a);
    pts.push([Math.max(top, r * k * (1 - point * (1 - k) * 0.6)), h * Math.sin(a)]);
  }
  return pts;
}

/** Onion dome profile, radius r at the bulge, total height ~3.3 r. */
export const onionProfile = (r) => [[r * 0.72, 0], [r * 0.95, r * 0.35], [r, r * 0.75], [r * 0.9, r * 1.2], [r * 0.6, r * 1.65], [r * 0.25, r * 2.1], [r * 0.08, r * 2.6], [0, r * 3.1]];

/**
 * Texture coordinates in model units, so a patterned material keeps one scale on every part. Flat faces are projected
 * along their own slope (u along the eave, v up the slope); round parts (`radial`, from cylG / latheG) wrap u round the axis.
 */
function unitUVs(g, radial) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (radial) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), r = Math.max(g.boundingBox.max.x - c.x, g.boundingBox.max.z - c.z);
    for (let i = 0; i < p.count; i += 3) {
      // keep each triangle on one side of the seam
      const a0 = Math.atan2(p.getX(i) - c.x, p.getZ(i) - c.z);
      for (let j = i; j < i + 3; j++) {
        let a = Math.atan2(p.getX(j) - c.x, p.getZ(j) - c.z);
        if (a - a0 > Math.PI) a -= Math.PI * 2; else if (a0 - a > Math.PI) a += Math.PI * 2;
        const rr = Math.hypot(p.getX(j) - c.x, p.getZ(j) - c.z);
        uv.setXY(j, a * r, p.getY(j) + (r - rr));
      }
    }
    return;
  }
  for (let i = 0; i < p.count; i += 3) {
    // one projection per triangle, from its face normal
    const nx = n.getX(i) + n.getX(i + 1) + n.getX(i + 2), ny = n.getY(i) + n.getY(i + 1) + n.getY(i + 2), nz = n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2);
    const l = Math.hypot(nx, ny, nz) || 1, hz = Math.hypot(nx, nz) / l;
    for (let j = i; j < i + 3; j++) {
      const x = p.getX(j), y = p.getY(j), z = p.getZ(j);
      if (hz < 0.3) uv.setXY(j, x, z);
      else uv.setXY(j, (x * -nz + z * nx) / (hz * l), y / hz);
    }
  }
}

/* ---------- the kit ---------- */

const UP = new THREE.Vector3(0, 1, 0);
const xf = (x, y, z, o = {}) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')),
    new THREE.Vector3(...(Array.isArray(o.s) ? o.s : [o.s ?? 1, o.s ?? 1, o.s ?? 1])));
  return m;
};

const winCache = new Map();
function winGeo(kind, w, h) {
  const key = kind + w + 'x' + h;
  if (!winCache.has(key)) { const g = new THREE.ShapeGeometry(openingShape(kind, w, h, w < 0.8 ? 5 : 12), 1); g.userData.shared = true; winCache.set(key, g); }
  return winCache.get(key);
}

/**
 * kit(root) -> k. All calls take positions in the kit's local frame; `k.at(x, y, z, ry)` gives a child frame and
 * `k.g` the same frame for ground pieces (dropped on the map). Call `k.done()` once the builder is finished.
 * Primitive options `o`: ry / rx / rz (radians), s (scale or [sx, sy, sz]), ink: false (no outline) or 'fine'.
 */
export function kit(root) {
  const buckets = new Map(), prims = [];

  function frame(base, ground) {
    const k = {
      root, base, ground,
      put(geo, m, x = 0, y = 0, z = 0, o = {}) {
        let g = geo.index ? geo.toNonIndexed() : geo.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups();
        g.applyMatrix4(base.clone().multiply(xf(x, y, z, o)));
        if (m.map) unitUVs(g, geo.userData.radial);
        const key = m.uuid + (ground ? ':g' : '');
        if (!buckets.has(key)) buckets.set(key, { m, ground, list: [] });
        buckets.get(key).list.push(g);
        if (o.ink !== false) prims.push({ g, ground, fine: o.ink === 'fine' });
        return g;
      },
      at(x = 0, y = 0, z = 0, ry = 0) { return frame(base.clone().multiply(xf(x, y, z, { ry })), ground); },
      get g() { return frame(base, true); },

      box(w, h, d, m, x = 0, y = 0, z = 0, o) { return k.put(boxG(w, h, d), m, x, y, z, o); },
      cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 24, o) { return k.put(cylG(rt, rb, h, seg), m, x, y, z, o); },
      cone(r, h, m, x = 0, y = 0, z = 0, seg = 24, o = {}) { return k.put(cylG(0, r, h, seg), m, x, y, z, seg === 4 ? { ry: Math.PI / 4, ...o } : o); },
      /** small spheres get few segments: they are knobs and heads */
      sphere(r, m, x = 0, y = 0, z = 0, o = {}) { const seg = o.seg ?? (o.ink === 'fine' || o.ink === false ? 8 : 14); return k.put(sphereG(r, seg, Math.ceil(seg * 0.66)), m, x, y, z, o); },
      lathe(profile, m, x = 0, y = 0, z = 0, seg = 24, o) { return k.put(latheG(profile, seg), m, x, y, z, o); },
      dome(r, h, m, x = 0, y = 0, z = 0, seg = 32, opt = {}) { return k.put(latheG(domeProfile(r, h, opt), seg), m, x, y, z); },
      roof(w, d, wt, dt, h, m, x = 0, y = 0, z = 0, o) { return k.put(frustumG(w, d, wt, dt, h), m, x, y, z, o); },
      /** hipped roof (ridge along the longer side), pitched at about h / (short side / 2) */
      hip(w, d, h, m, x = 0, y = 0, z = 0, o) { return k.roof(w, d, Math.max(0, w - d), Math.max(0, d - w), h, m, x, y, z, o); },
      pyramid(w, d, h, m, x = 0, y = 0, z = 0, o) { return k.roof(w, d, 0, 0, h, m, x, y, z, o); },
      /** two-pitch mansard: a steep lower slope `h1` stepping in by `inset`, then a low hip `h2` */
      mansard(w, d, h1, h2, inset, m, x = 0, y = 0, z = 0, o = {}) {
        k.roof(w, d, w - 2 * inset, d - 2 * inset, h1, m, x, y, z, o);
        const w2 = w - 2 * inset, d2 = d - 2 * inset;
        return k.roof(w2, d2, Math.max(0, w2 - d2), Math.max(0, d2 - w2), h2, m, x, y + h1, z, o);
      },
      gable(span, h, len, m, x = 0, y = 0, z = 0, ry = 0, o = {}) { return k.put(gableG(span, h, len), m, x, y, z, { ry, ...o }); },
      prism(shape, depth, m, x = 0, y = 0, z = 0, o) { return k.put(prismG(shape, depth), m, x, y, z, o); },
      arcade(len, h, depth, n, ow, oh, m, x = 0, y = 0, z = 0, o = {}) { return k.put(arcadeG(len, h, depth, n, ow, oh, o), m, x, y, z, o); },

      /** a thin bar between two points */
      strut(a, b, t, m, o = {}) {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
        const g = new THREE.BoxGeometry(t, len, t);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize());
        g.applyQuaternion(q).translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        return k.put(g, m, 0, 0, 0, o);
      },
      tube(pts, r, m, o = {}) {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
        return k.put(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, 6), m, 0, 0, 0, o);
      },

      /** an existing mesh (animated water etc.); ground meshes are tagged so the map drops them */
      add(mesh) { mesh.applyMatrix4(base); if (ground) mesh.userData.base = true; root.add(mesh); return mesh; },

      /**
       * Windows along a wall from [x0, z0] to [x1, z1], facing `face` (radians about y; 0 = +z), `cols` × `rows`.
       * kind: arch | pointed | rect | round. `frame`: material for a surround a little larger than the glass.
       */
      windows({ from, to, cols, y = 0.5, rows = 1, dy = 0.9, face = 0, ...o }) {
        const spots = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const t = cols === 1 ? 0.5 : c / (cols - 1);
          spots.push([from[0] + (to[0] - from[0]) * t, y + r * dy, from[1] + (to[1] - from[1]) * t, face]);
        }
        return k.panes(spots, o);
      },

      /** Windows at explicit spots [x, y, z, face]; y is the sill. Options as for `windows`. */
      panes(spots, { w = 0.3, h = 0.55, off = 0.02, kind = 'arch', frame: fm = null, pad = 0.09, m = lit() } = {}) {
        if (!spots.length) return null;
        const make = (geo, mm, o, grow) => {
          const inst = new THREE.InstancedMesh(geo, mm, spots.length), d = new THREE.Object3D();
          spots.forEach(([x, y, z, face], i) => {
            d.position.set(x + Math.sin(face) * o, y - grow, z + Math.cos(face) * o);
            d.rotation.set(0, face, 0); d.updateMatrix();
            inst.setMatrixAt(i, base.clone().multiply(d.matrix));
          });
          inst.userData.noInk = true; inst.castShadow = false; inst.receiveShadow = true;
          root.add(inst); return inst;
        };
        if (fm) make(winGeo(kind, w + pad * 2, h + pad * 2), fm, off - 0.006, pad);
        return make(winGeo(kind, w, h), m, off, 0);
      },

      /** windows round an n-sided drum of circumradius r centred on (x, z), one per face */
      ring(n, r, y, x, z, o = {}) {
        const rr = r * Math.cos(Math.PI / n), spots = [];
        for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * Math.PI * 2; spots.push([x + Math.sin(a) * rr, y, z + Math.cos(a) * rr, a]); }
        return k.panes(spots, o);
      },

      /** balustrade: plinth, little balusters and a hand rail from a to b ([x, z]) at height y */
      balustrade(a, b, y, h, m, { gap = 0.22, r = 0.05 } = {}) {
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz) - Math.PI / 2;
        const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
        k.box(len, h * 0.16, r * 3.2, m, cx, y, cz, { ry, ink: 'fine' });
        k.box(len + r, h * 0.16, r * 3.6, m, cx, y + h * 0.84, cz, { ry, ink: 'fine' });
        const n = Math.max(2, Math.floor(len / gap));
        const prof = [[r * 0.7, 0], [r * 1.25, h * 0.2], [r * 0.6, h * 0.5], [r * 0.9, h * 0.62], [r * 0.6, h * 0.68]];
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; k.lathe(prof, m, a[0] + dx * t, y + h * 0.16, a[1] + dz * t, 6, { ink: false }); }
      },

      /** Gothic pinnacle: square shaft, gablets, needle spire and a finial knob */
      pinnacle(x, y, z, h, r, m, spireM = m) {
        k.box(r * 2, h * 0.45, r * 2, m, x, y, z, { ink: 'fine' });
        k.cone(r * 1.25, h * 0.55, spireM, x, y + h * 0.45, z, 4, { ink: 'fine' });
        k.sphere(r * 0.35, spireM, x, y + h, z, { ink: false, seg: 4 });
      },

      /** a column with base and capital, `h` tall */
      column(x, y, z, h, r, m, seg = 12) {
        k.lathe([[r * 1.45, 0], [r * 1.45, h * 0.04], [r * 1.12, h * 0.07], [r, h * 0.1], [r * 0.86, h * 0.88], [r * 1.05, h * 0.92], [r * 1.5, h * 0.97], [r * 1.5, h]], m, x, y, z, seg, { ink: 'fine' });
      },

      /** stepped cornice round a w × d block at height y */
      cornice(w, d, y, m, x = 0, z = 0, t = 0.18) {
        k.box(w + t, t * 0.55, d + t, m, x, y, z);
        k.box(w + t * 2, t * 0.7, d + t * 2, m, x, y + t * 0.55, z);
      },

      /** a simple standing figure about h tall (robed body, head), or a winged one */
      statue(x, y, z, h, m, { wings = false, arm = 0 } = {}) {
        const u = h / 2.4;
        k.lathe([[0.42 * u, 0], [0.36 * u, 0.6 * u], [0.27 * u, 1.3 * u], [0.3 * u, 1.75 * u], [0.12 * u, 1.95 * u], [0, 2.0 * u]], m, x, y, z, 10, { ink: 'fine' });
        k.sphere(0.17 * u, m, x, y + 2.15 * u, z, { ink: 'fine', seg: 6 });
        if (arm) k.box(0.1 * u, 1.0 * u, 0.1 * u, m, x + 0.2 * u, y + 1.7 * u, z, { rz: -arm, ink: false });
        if (wings) for (const s of [-1, 1]) k.box(0.06 * u, 1.3 * u, 0.55 * u, m, x + s * 0.28 * u, y + 1.2 * u, z - 0.2 * u, { rz: s * 0.35, ink: false });
      },

      /** a horse and rider, nose along +z of the given heading */
      rider(x, y, z, ry, s, m) {
        const r = k.at(x, y, z, ry);
        r.box(0.26 * s, 0.3 * s, 0.7 * s, m, 0, 0.42 * s, 0, { ink: 'fine' });
        for (const [dx, dz] of [[-0.08, -0.25], [0.08, -0.25], [-0.08, 0.25], [0.08, 0.25]]) r.box(0.06 * s, 0.42 * s, 0.06 * s, m, dx * s, 0, dz * s, { ink: false });
        r.box(0.12 * s, 0.38 * s, 0.14 * s, m, 0, 0.6 * s, 0.38 * s, { rx: 0.5, ink: false });
        r.box(0.1 * s, 0.12 * s, 0.24 * s, m, 0, 0.92 * s, 0.5 * s, { ink: false });
        r.lathe([[0.1 * s, 0], [0.09 * s, 0.3 * s], [0, 0.34 * s]], m, 0, 0.72 * s, -0.04 * s, 8, { ink: false });
        r.sphere(0.07 * s, m, 0, 1.12 * s, -0.04 * s, { ink: false, seg: 5 });
      },

      /** a round-headed tree */
      tree(x, z, s = 1, y = 0) {
        k.cyl(0.07 * s, 0.1 * s, 0.6 * s, mat(0x7a5a3c), x, y, z, 6, { ink: false });
        k.put(new THREE.IcosahedronGeometry(0.55 * s, 1), faceted(0x6fb35f), x, y + 0.95 * s, z, { ink: 'fine' });
        k.put(new THREE.IcosahedronGeometry(0.38 * s, 1), faceted(0x86c86a), x + 0.18 * s, y + 1.25 * s, z + 0.1 * s, { ink: false });
      },

      /** merge everything into one mesh per material; `dropGround` leaves the ground pieces out */
      done(dropGround = false) {
        for (const { m, ground, list } of buckets.values()) {
          if (ground && dropGround) continue;
          const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.userData.kit = true; if (ground) mesh.userData.base = true;
          root.add(mesh);
        }
        return prims.filter((p) => !(p.ground && dropGround));
      },
    };
    return k;
  }
  return frame(new THREE.Matrix4(), false);
}

/* ---------- ink ---------- */

const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();

/** Push a copy of g out along its smoothed normals by t: drawn back-faces only, it reads as an ink line. */
function shell(g, t) {
  let s = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(s.attributes)) if (name !== 'position' && name !== 'normal') s.deleteAttribute(name);
  if (!s.attributes.normal) s.computeVertexNormals();
  s = toCreasedNormals(s, Math.PI);
  const p = s.attributes.position, n = s.attributes.normal;
  for (let i = 0; i < p.count; i++) { tmpV.set(n.getX(i), n.getY(i), n.getZ(i)).normalize().multiplyScalar(t); p.setXYZ(i, p.getX(i) + tmpV.x, p.getY(i) + tmpV.y, p.getZ(i) + tmpV.z); }
  s.deleteAttribute('normal');
  return s;
}

/**
 * One merged ink hull for a model. Kit parts (`prims`) get a line weight that follows their own size, so a spire
 * stays a spire; other meshes in the group (water, foundations) get the full weight.
 */
export function inked(group, prims = []) {
  group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const T = 0.0048 * Math.max(size.x, size.z);
  const geos = [];
  for (const { g, fine } of prims) {
    g.computeBoundingBox(); tmpBox.copy(g.boundingBox).getSize(tmpV);
    const small = Math.min(tmpV.x, tmpV.y, tmpV.z), mid = [tmpV.x, tmpV.y, tmpV.z].sort((a, b) => a - b)[1];
    let t = Math.min(T, Math.max(T * 0.22, 0.12 * small + 0.04 * mid));
    if (fine) t = Math.min(t, T * 0.4);
    geos.push(shell(g, t));
  }
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.kit || o.userData.ink || o.userData.noInk) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geos.push(shell(g, T));
  });
  const hull = new THREE.Mesh(mergeGeometries(geos, false), inkMat);
  hull.userData.ink = true; hull.castShadow = hull.receiveShadow = false; hull.frustumCulled = false;
  return hull;
}
