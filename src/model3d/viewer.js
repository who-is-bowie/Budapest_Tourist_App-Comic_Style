import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel } from './models.js';
import { MODELS, MODEL_IDS } from './registry.js';

/* Timings and moods live here so they are easy to tweak. */
const CONFIG = {
  buildTime: 5.6,          // seconds for the model to rise out of the plinth, floor by floor
  introTime: 5.6,          // camera orbit, runs alongside the build
  modelSize: 10,           // longest side after normalising
  fov: 34,
  autoRotate: 0.45,        // deg-ish; stops while you drag, resumes after idle
  idleResume: 3500,        // ms
  moods: {
    day:   { sky: ['#8dbbe8', '#eaf2f8'], hemi: [0xd4e6ff, 0x9a937f, 0.95], sun: [0xfff0d4, 3.1, [9, 15, 10]], rim: [0x9fc2ff, 0.5], glow: 0.08, exposure: 0.95, ring: 0.5 },
    dusk:  { sky: ['#2f3d7a', '#f0a07a'], hemi: [0xb8a9ff, 0x5b4a55, 0.6],  sun: [0xffb070, 2.6, [-11, 5, 9]], rim: [0x7da6ff, 1.3], glow: 1.0,  exposure: 1.0,  ring: 1.4 },
    night: { sky: ['#050816', '#1b2850'], hemi: [0x4a6aaa, 0x14171f, 0.42], sun: [0x8aa4ff, 0.7, [-7, 12, 7]],  rim: [0x4f6fd0, 0.7], glow: 2.2,  exposure: 1.15, ring: 2.2 },
  },
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t, s = 1.2) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const $ = (id) => document.getElementById(id);

export function createViewer({ byId, state, subscribe, actions }) {
  const root = $('viewer'), host = $('v-canvas');
  let renderer, scene, camera, controls, hemi, sun, rim, ring, plinthRing, raf = 0, clock = new THREE.Clock();
  let scan = null, current = null, holder = null, model = null, buildStart = 0, introStart = 0, introFrom = null, introTo = null;
  let mood = document.documentElement.dataset.theme === 'night' ? 'night' : 'dusk', moodFrom = null, moodT = 1, lastInput = 0, opener = null, disposed = false, unsub = null;
  const look = new THREE.Vector3();
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // keeps everything below clip.constant

  /* ---------- renderer & scene (created once, on first open) ---------- */

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1.5), 2));   // supersample on 1x screens so lines stay crisp
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.1, 200);
    hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    rim = new THREE.DirectionalLight(0x88aaff, 1); rim.position.set(-14, 8, -12);
    scene.add(hemi, sun, sun.target, rim);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.485;
    controls.addEventListener('start', () => { lastInput = performance.now(); controls.autoRotate = false; hideHint(); });
    controls.addEventListener('end', () => { lastInput = performance.now(); });

    new ResizeObserver(resize).observe(host);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!root.hidden) start(); });
    renderer.domElement.addEventListener('dblclick', () => reframe(true));
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); });
    renderer.domElement.addEventListener('webglcontextrestored', () => start());
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole model in view on tall (phone) screens
    camera.fov = w / h < 0.8 ? CONFIG.fov * 1.35 : CONFIG.fov;
    camera.updateProjectionMatrix();
  }

  /* ---------- moods (day / dusk / night) ---------- */

  const col = (hex) => new THREE.Color(hex);
  const tmp = new THREE.Color();
  function applyMood(a, b, t) {
    const L = (x, y) => x + (y - x) * t;
    const lc = (ca, cb) => tmp.copy(col(ca)).lerp(col(cb), t).getHex();
    hemi.color.set(lc(a.hemi[0], b.hemi[0])); hemi.groundColor.set(lc(a.hemi[1], b.hemi[1])); hemi.intensity = L(a.hemi[2], b.hemi[2]);
    sun.color.set(lc(a.sun[0], b.sun[0])); sun.intensity = L(a.sun[1], b.sun[1]);
    sun.position.set(L(a.sun[2][0], b.sun[2][0]), L(a.sun[2][1], b.sun[2][1]), L(a.sun[2][2], b.sun[2][2]));
    rim.color.set(lc(a.rim[0], b.rim[0])); rim.intensity = L(a.rim[1], b.rim[1]);
    renderer.toneMappingExposure = L(a.exposure, b.exposure);
    const glow = L(a.glow, b.glow);
    model?.glows.forEach((m) => { m.emissiveIntensity = glow; });
    if (plinthRing) plinthRing.material.emissiveIntensity = L(a.ring, b.ring);
    root.style.setProperty('--sky-a', '#' + tmp.copy(col(a.sky[0])).lerp(col(b.sky[0]), t).getHexString());
    root.style.setProperty('--sky-b', '#' + tmp.copy(col(a.sky[1])).lerp(col(b.sky[1]), t).getHexString());
  }

  function setMood(name, instant = false) {
    const target = CONFIG.moods[name];
    moodFrom = CONFIG.moods[mood];
    mood = name; moodT = instant || reduceMotion() ? 1 : 0;
    if (moodT === 1) applyMood(target, target, 1);
    document.querySelectorAll('#v-tod button').forEach((b) => {
      const on = b.dataset.mood === name; b.setAttribute('aria-checked', on); b.classList.toggle('on', on);
    });
  }

  /* ---------- model loading ---------- */

  function clearModel() {
    if (!holder) return;
    scene.remove(holder);
    holder.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.(); });
    holder = model = plinthRing = scan = null;
  }

  function load(id) {
    clearModel();
    current = id;
    model = buildModel(id);
    const accent = col(MODELS[id].accent);

    // normalise size, centre on x/z, sit on y = 0
    const box = new THREE.Box3().setFromObject(model.group);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const s = Math.min(CONFIG.modelSize / Math.max(size.x, size.z), (CONFIG.modelSize * 0.95) / size.y);
    model.group.position.set(-center.x, -box.min.y, -center.z);
    const inner = new THREE.Group(); inner.add(model.group); inner.scale.setScalar(s);
    holder = new THREE.Group(); holder.add(inner);

    // diorama plinth
    const half = Math.hypot(size.x, size.z) * 0.5 * s;
    const R = Math.max(5.2, half * 1.1);
    const side = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.7 });
    const topM = new THREE.MeshStandardMaterial({ color: 0xcdc6b6, roughness: 0.95 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, 0.7, 72), [side, topM, side]);
    plinth.position.y = -0.35; plinth.receiveShadow = true;
    plinthRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.015, 0.035, 8, 120), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1, roughness: 0.3 }));
    plinthRing.rotation.x = Math.PI / 2; plinthRing.position.y = -0.62;
    holder.add(plinth, plinthRing);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.71; floor.receiveShadow = true; holder.add(floor);
    scene.add(holder);

    // the model is revealed by a clipping plane that rises through it; a glowing ring marks the build line
    scan = new THREE.Mesh(new THREE.TorusGeometry(half * 1.04, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffe45e }));
    scan.rotation.x = Math.PI / 2; scan.visible = false; holder.add(scan);
    const instant = reduceMotion();
    buildStart = performance.now();

    // camera framing
    framing = { r: Math.max(R, half), half: R, h: size.y * s };
    look.set(0, framing.h * 0.38, 0);
    controls.target.copy(look);
    controls.minDistance = framing.half * 0.8; controls.maxDistance = framing.half * 6;
    reframe(false, instant);
    controls.autoRotate = false; lastInput = performance.now() - CONFIG.idleResume + 600;
    sun.shadow.camera.left = -R - 1; sun.shadow.camera.right = R + 1; sun.shadow.camera.top = R + 1; sun.shadow.camera.bottom = -R - 1;
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(0, 0, 0);
    setMood(mood, true);
    updateInfo();
  }

  let framing = { r: 6, h: 6 };
  function heroPosition() {
    // distance at which the plinth fits horizontally and the model fits vertically
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((framing.h * 0.62 + framing.half * 0.5) / t, (framing.half * 1.02) / (t * camera.aspect)) * 1.08;
    const az = Math.PI * 0.2, el = 0.34;
    return new THREE.Vector3(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist + framing.h * 0.38, Math.cos(az) * Math.cos(el) * dist);
  }
  // Intro sweeps in from a high, wide arc to the hero angle; `again` replays it as a quick re-centre.
  function reframe(again, instant = false) {
    introTo = heroPosition();
    const dur = again ? 1.1 : CONFIG.introTime;
    if (instant) { camera.position.copy(introTo); introFrom = null; controls.enabled = true; controls.update(); return; }
    introFrom = again ? camera.position.clone() : startPosition(introTo);
    introStart = performance.now(); introDur = dur * 1000; controls.enabled = false;
    camera.position.copy(introFrom);
  }
  let introDur = 3200;
  // the orbit starts ~150° round from the hero angle, higher and further out, and settles in as the build finishes
  function startPosition(to) {
    const a = to.clone().sub(look), r = Math.hypot(a.x, a.z), ang = Math.atan2(a.x, a.z) - 2.6;
    return new THREE.Vector3(Math.sin(ang) * r * 1.45 + look.x, look.y + a.y * 1.8 + framing.r * 0.5, Math.cos(ang) * r * 1.45 + look.z);
  }

  /* ---------- loop ---------- */

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

    // build-up: the clip plane rises from the plinth to the top of the model (ease in and out)
    const k = Math.min(1, (now - buildStart) / 1000 / CONFIG.buildTime);
    if (scan) {
      const building = k < 1 && !reduceMotion();
      if (building) {
        const e = k * k * (3 - 2 * k), y = 0.02 + e * (framing.h + 0.8);
        clip.constant = y; renderer.clippingPlanes = [clip];
        scan.position.y = y - 0.06; scan.visible = true; scan.rotation.z = k * 6;
      } else if (scan.visible) { renderer.clippingPlanes = []; scan.visible = false; }
    }

    // camera intro
    if (introFrom) {
      const k = Math.min(1, (now - introStart) / introDur), e = easeInOut(k);
      // travel on an arc: interpolate in polar form around the target
      const a = introFrom.clone().sub(look), b = introTo.clone().sub(look);
      const ra = Math.hypot(a.x, a.z), rb = Math.hypot(b.x, b.z);
      let aa = Math.atan2(a.x, a.z), ab = Math.atan2(b.x, b.z);
      let d = ab - aa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const ang = aa + d * e, r = ra + (rb - ra) * e;
      camera.position.set(Math.sin(ang) * r, look.y + a.y + (b.y - a.y) * e, Math.cos(ang) * r).add(new THREE.Vector3(look.x, 0, look.z));
      camera.lookAt(look);
      if (k >= 1) { introFrom = null; controls.enabled = true; controls.update(); lastInput = performance.now() - CONFIG.idleResume + 900; }
    } else {
      if (!reduceMotion() && performance.now() - lastInput > CONFIG.idleResume) { controls.autoRotate = true; controls.autoRotateSpeed = CONFIG.autoRotate; }
      controls.update();
    }

    if (moodT < 1) { moodT = Math.min(1, moodT + dt / 1.1); applyMood(moodFrom, CONFIG.moods[mood], easeInOut(moodT)); if (moodT >= 1) moodFrom = CONFIG.moods[mood]; }
    // gentle window flicker at dusk and night
    if (model && CONFIG.moods[mood].glow > 0.5) model.glows.forEach((m) => { m.emissiveIntensity = CONFIG.moods[mood].glow * (0.96 + Math.sin(t * 2.3) * 0.04); });
    model?.tick?.(t);
    renderer.render(scene, camera);
  }

  function start() { if (!raf && !disposed) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---------- panel UI ---------- */

  const hideHint = () => { $('v-hint').classList.add('gone'); };

  function updateInfo() {
    const m = MODELS[current], place = byId[current];
    $('v-title').textContent = m.title;
    $('v-tag').textContent = m.tagline;
    $('v-blurb').textContent = place?.blurb || '';
    $('v-facts').replaceChildren(...m.facts.map((f) => Object.assign(document.createElement('li'), { textContent: f })));
    root.style.setProperty('--v-accent', m.accent);
    const i = ids().indexOf(current), list = ids();
    $('v-count').textContent = `${i + 1} / ${list.length}`;
    $('v-prev').title = `Previous: ${MODELS[list[(i + list.length - 1) % list.length]].title}`;
    $('v-next').title = `Next: ${MODELS[list[(i + 1) % list.length]].title}`;
    refreshTourButton();
  }

  const ids = () => MODEL_IDS.filter((id) => byId[id]);

  function refreshTourButton() {
    if (!current) return;
    const inTour = state.stops.includes(current);
    const b = $('v-add');
    b.textContent = inTour ? '✓ In your tour' : '+ Add to tour';
    b.classList.toggle('ghost', inTour);
    b.setAttribute('aria-pressed', inTour);
  }

  function go(delta) {
    const list = ids(), i = list.indexOf(current);
    show(list[(i + delta + list.length) % list.length]);
  }

  function show(id) {
    root.classList.add('swap');
    setTimeout(() => { load(id); root.classList.remove('swap'); }, 160);
    history.replaceState(null, '', `?view=${id}`);
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $('v-close').addEventListener('click', close);
    $('v-prev').addEventListener('click', () => go(-1));
    $('v-next').addEventListener('click', () => go(1));
    $('v-add').addEventListener('click', () => actions.toggleStop(current, { keepFocus: true }));
    $('v-map').addEventListener('click', () => { const id = current; close(); actions.focus(id, { fly: true }); });
    $('v-reset').addEventListener('click', () => reframe(true));
    document.querySelectorAll('#v-tod button').forEach((b) => b.addEventListener('click', () => setMood(b.dataset.mood)));
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    root.addEventListener('keydown', onKey);
    unsub = subscribe((patch) => { if ('stops' in patch) refreshTourButton(); });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Tab') {   // keep focus inside the dialog
      const f = [...root.querySelectorAll('button:not([disabled])')];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function open(id) {
    if (!MODELS[id] || !byId[id]) return;
    wire();
    opener = document.activeElement;
    if (!renderer) {
      try { init(); } catch (err) {
        console.error(err);
        root.hidden = false; root.classList.add('nogl'); $('v-title').textContent = MODELS[id].title; $('v-tag').textContent = '3D view needs WebGL, which this browser has turned off.';
        wire(); return;
      }
    }
    root.hidden = false;
    document.body.classList.add('viewing');
    requestAnimationFrame(() => { root.classList.add('in'); });
    $('v-hint').classList.remove('gone');
    resize();
    load(id);
    start();
    history.replaceState(null, '', `?view=${id}`);
    $('v-close').focus({ preventScroll: true });
  }

  function close() {
    root.classList.remove('in');
    document.body.classList.remove('viewing');
    stop();
    setTimeout(() => { if (!root.classList.contains('in')) root.hidden = true; }, 260);
    history.replaceState(null, '', location.pathname);
    opener?.focus?.({ preventScroll: true });
  }

  return { open, close, isOpen: () => !root.hidden && root.classList.contains('in') };
}
