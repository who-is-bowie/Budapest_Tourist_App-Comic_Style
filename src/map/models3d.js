import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel, buildFoundation, foundationRing } from '../model3d/models.js';
import { PLACEMENT } from '../model3d/registry.js';

const SHOW_ZOOM = 14.7;      // models grow in once you are close enough to read them
const GROW_TIME = 1.1;       // seconds
const backOut = (t, s = 1.3) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

/**
 * Three.js models drawn straight into the MapLibre scene, so they sit on the map with real
 * perspective, pitch and rotation. `places` is [{ id, lng, lat }].
 */
export function createLandmarkLayer(map, places, startNight = false) {
  const entries = [];
  let enabled = true, renderer, scene, camera, hemi, sun, fill;
  // day lights are the warm sun; night swaps them for a magenta key and a cyan rim, with the windows lit
  const LOOKS = {
    day: { sky: new THREE.Color(0xfff4e0), ground: new THREE.Color(0xb9a98c), hemi: 1.25, key: new THREE.Color(0xfff1d6), keyI: 2.4, rim: new THREE.Color(0xbcd2ff), rimI: 0.7, glow: 0.35 },
    night: { sky: new THREE.Color(0x8c7bff), ground: new THREE.Color(0x2a0b5a), hemi: 0.7, key: new THREE.Color(0xff4fc3), keyI: 1.7, rim: new THREE.Color(0x35e6ff), rimI: 1.6, glow: 1.6 },
  };
  let mix = startNight ? 1 : 0, mixTarget = mix;   // 0 = day, 1 = night; eased in render()
  const glows = [];
  const applyLook = () => {
    const d = LOOKS.day, n = LOOKS.night;
    hemi.color.lerpColors(d.sky, n.sky, mix); hemi.groundColor.lerpColors(d.ground, n.ground, mix); hemi.intensity = d.hemi + (n.hemi - d.hemi) * mix;
    sun.color.lerpColors(d.key, n.key, mix); sun.intensity = d.keyI + (n.keyI - d.keyI) * mix;
    fill.color.lerpColors(d.rim, n.rim, mix); fill.intensity = d.rimI + (n.rimI - d.rimI) * mix;
    const glow = d.glow + (n.glow - d.glow) * mix;
    glows.forEach((g) => { g.emissiveIntensity = glow; });
  };
  const clock = new THREE.Clock();
  const proj = new THREE.Matrix4(), local = new THREE.Matrix4();

  const layer = {
    id: 'landmarks-3d', type: 'custom', renderingMode: '3d',

    onAdd(_, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene(); camera = new THREE.Camera();
      scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      // lights live in model space: x east, z south, y up
      hemi = new THREE.HemisphereLight(0xfff4e0, 0xb9a98c, 1.25); scene.add(hemi);
      sun = new THREE.DirectionalLight(0xfff1d6, 2.4); sun.position.set(-0.8, 1.3, 0.9); scene.add(sun);
      fill = new THREE.DirectionalLight(0xbcd2ff, 0.7); fill.position.set(0.9, 0.5, -0.7); scene.add(fill);

      for (const p of places) {
        const place = PLACEMENT[p.id]; if (!place) continue;
        const m = buildModel(p.id, { base: false });
        const box = new THREE.Box3().setFromObject(m.group), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        m.group.position.set(-c.x, -box.min.y, -c.z);
        glows.push(...m.glows);
        const metresPerUnit = place.span / Math.max(size.x, size.z);
        const holder = new THREE.Group(); holder.add(m.group);
        holder.rotation.y = ((180 - place.facing) * Math.PI) / 180;
        holder.visible = false; holder.scale.setScalar(0.0001);
        scene.add(holder);
        const sh = place.shift || [0, 0], lat = p.lat + sh[1] / 111320, lng = p.lng + sh[0] / (111320 * Math.cos((p.lat * Math.PI) / 180));
        const merc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        entries.push({ id: p.id, lng, lat, holder, tick: m.tick, merc, unit: merc.meterInMercatorCoordinateUnits() * metresPerUnit,
          span: place.span, heightM: size.y * metresPerUnit, grow: 0,
          mpu: metresPerUnit, plan: [size.x, size.z], foundation: place.foundation, sampledZoom: -1, sampledAt: 0, refined: 0, baseOffset: 0, skirt: null });
      }
      applyLook();
    },

    render(gl, matrix) {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      const show = enabled && map.getZoom() >= SHOW_ZOOM;
      const bounds = map.getBounds(), padLng = 0.01, padLat = 0.007;
      let animating = false;
      if (mix !== mixTarget) {
        mix = Math.abs(mixTarget - mix) < 0.01 ? mixTarget : mix + (mixTarget - mix) * Math.min(1, dt * 5);
        applyLook(); animating = true;
      }
      renderer.resetState();
      for (const e of entries) {
        e.grow = Math.max(0, Math.min(1, e.grow + (show ? dt : -dt * 2) / GROW_TIME));
        const inView = e.lng > bounds.getWest() - padLng && e.lng < bounds.getEast() + padLng && e.lat > bounds.getSouth() - padLat && e.lat < bounds.getNorth() + padLat;
        e.holder.visible = e.grow > 0 && inView;
        if (!e.holder.visible) continue;
        if (e.grow > 0 && e.grow < 1) animating = true;
        e.holder.scale.setScalar(Math.max(0.0001, backOut(e.grow)));
        e.tick?.(t);
      }
      // each model has its own placement, so draw them one at a time
      const live = entries.filter((e) => e.holder.visible);
      for (const e of live) {
        for (const o of live) o.holder.visible = o === e;
        // stand on the terrain; queryTerrainElevation includes the exaggeration (and is relative to the camera's
        // elevation, as is the matrix we are given), and is null until the DEM tile has loaded
        const ground = map.queryTerrainElevation([e.lng, e.lat]) ?? e.ground ?? 0;
        e.ground = ground;
        fitToSlope(e, ground);
        local.makeTranslation(e.merc.x, e.merc.y, e.merc.z + (ground + e.baseOffset) * e.merc.meterInMercatorCoordinateUnits()).scale(new THREE.Vector3(e.unit, -e.unit, e.unit)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        camera.projectionMatrix.fromArray(matrix).multiply(local);
        renderer.render(scene, camera);
      }
      for (const e of live) e.holder.visible = true;
      if (animating || live.some((e) => e.tick)) map.triggerRepaint();
    },
  };

  /**
   * Sample the ground under the model's footprint (once per DEM zoom level, so it sharpens as tiles refine). The model
   * rests a little above the middle of the slope and a stone terrace wall fills the gap below it on the downhill side.
   */
  function fitToSlope(e, centre) {
    const zoom = Math.min(15, Math.floor(map.getZoom())), now = clock.elapsedTime;
    if (e.foundation === false || !map.getTerrain()) return;
    // at full DEM detail, re-read a few times: the first read can come from coarser tiles that were still refining
    const refine = zoom === 15 && e.sampledZoom === 15 && e.refined < 4 && now - e.sampledAt > 1.5;
    if (e.sampledZoom === zoom && !refine) return;
    const N = 11, rise = [], cos = Math.cos(e.holder.rotation.y), sin = Math.sin(e.holder.rotation.y);
    const mLat = 111320, mLng = mLat * Math.cos((e.lat * Math.PI) / 180);
    // terrain height (exaggerated metres) above/below the centre at a model-space point, or null while tiles load
    const rel = (x, z) => {
      const east = (x * cos + z * sin) * e.mpu, south = (-x * sin + z * cos) * e.mpu;
      const h = map.queryTerrainElevation([e.lng + east / mLng, e.lat - south / mLat]);
      return h == null ? null : h - centre;
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const r = rel((i / (N - 1) - 0.5) * e.plan[0], (j / (N - 1) - 0.5) * e.plan[1]);
      if (r == null) return;   // tiles still loading: try again next frame
      rise.push(r);
    }
    rise.sort((a, b) => a - b);
    const base = rise[Math.floor(0.7 * (rise.length - 1))];
    // the wall's foot follows the ground round the edge of the footprint, sunk a little so it never hangs
    const ring = foundationRing(e.plan[0] * 1.04, e.plan[1] * 1.04, e.foundation === 'round'), feet = [], depths = [];
    for (const [x, z, nx, nz] of ring) {
      let foot = [x, z], d = 0.5;
      for (let k = 0; k < 4; k++) {   // the face leans out as it goes down, so look for the ground where it would land
        const r = rel(foot[0], foot[1]);
        if (r == null) return;
        d = Math.max(0.5, base - r + 1.5);
        if (k < 3) foot = [x + nx * 0.45 * d / e.mpu, z + nz * 0.45 * d / e.mpu];
      }
      feet.push(foot); depths.push(d / e.mpu);
    }
    if (refine) e.refined++;
    e.sampledZoom = zoom; e.sampledAt = now;
    e.baseOffset = base;
    if (e.skirt) { e.holder.remove(e.skirt); e.skirt.traverse((o) => o.geometry?.dispose()); e.skirt = null; }
    if (Math.max(...depths) * e.mpu < 4) return;   // DEM noise on flat ground is not worth a terrace
    e.skirt = buildFoundation(ring, feet, depths);
    e.holder.add(e.skirt);
    map.triggerRepaint();
  }

  /** Place id under a screen point, or null. Models are tested as a circle around their footprint. */
  function hit(point) {
    if (!enabled || map.getZoom() < SHOW_ZOOM) return null;
    const pitch = (map.getPitch() * Math.PI) / 180;
    let best = null, bestD = Infinity;
    for (const e of entries) {
      if (e.grow < 0.6) continue;
      const pxPerM = (512 * 2 ** map.getZoom()) / (40075016.686 * Math.cos((e.lat * Math.PI) / 180));
      const c = map.project([e.lng, e.lat]);
      const cy = c.y - e.heightM * pxPerM * 0.45 * Math.sin(pitch);
      const r = Math.max(e.span * 0.5 * pxPerM * 0.9, 14), d = Math.hypot(point.x - c.x, point.y - cy);
      if (d < r && d < bestD) { best = e.id; bestD = d; }
    }
    return best;
  }

  return {
    layer, hit, entries,
    setEnabled(on) { enabled = on; map.triggerRepaint(); },
    setNight(on) { mixTarget = on ? 1 : 0; map.triggerRepaint(); },
    isEnabled: () => enabled,
    // centres and radii (m) of the real buildings to hide underneath each model
    footprints: () => places.filter((p) => PLACEMENT[p.id]).map((p) => ({ lng: p.lng, lat: p.lat, r: PLACEMENT[p.id].hole ?? PLACEMENT[p.id].span * 0.42 })),
  };
}
