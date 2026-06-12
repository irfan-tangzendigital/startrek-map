const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

const FACTION_ZONES_3D = {
  federation:  { clusters: [
    { x:  0.5, y: 0, z:  0.0, r: 2.6 },
    { x:  2.0, y: 0, z:  1.2, r: 1.6 },
  ]},
  klingon:     { clusters: [
    { x:  7.0, y: 0.4, z:  3.2, r: 2.8 },
    { x:  5.5, y: 0.4, z:  4.5, r: 1.6 },
  ]},
  romulan:     { clusters: [
    { x:  5.5, y: -0.3, z: -3.8, r: 2.4 },
    { x:  7.0, y: -0.3, z: -2.5, r: 1.4 },
  ]},
  cardassian:  { clusters: [
    { x: -7.5, y: 0.4, z:  5.5, r: 1.8 },  // pulled further to actual capital
    { x: -6.2, y: 0.4, z:  4.2, r: 1.0 },  // smaller trailing lobe
  ]},
  ferengi:     { clusters: [
    { x: -6.7, y: 0.3, z: -2.7, r: 1.8 },
  ]},
  breen:       { clusters: [
    { x: -5.5, y: -0.6, z:  7.5, r: 1.4 }, // distinct, below plane
  ]},
  dominion:    { clusters: [
    { x:  0.0, y: -1.5, z: 11.0, r: 2.0 }, // far Gamma Quadrant, well below plane
  ]},
  independent: null,
};

const CAPITAL_LABEL_DIST = 8;
const MAJOR_LABEL_DIST = 5;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.src = src;
    s.addEventListener('load', () => {
      s.dataset.loaded = 'true';
      resolve();
    });
    s.addEventListener('error', reject);
    document.head.appendChild(s);
  });
}

let threeReady = null;
async function loadThree() {
  if (window.THREE && window.THREE.OrbitControls) return;
  if (threeReady) return threeReady;
  threeReady = (async () => {
    await injectScript(THREE_URL);
    await injectScript(ORBIT_URL);
  })();
  return threeReady;
}

function hashString(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

function makeBloomTexture(hex) {
  const THREE = window.THREE;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeLabelSprite(text) {
  const THREE = window.THREE;
  const pad = 24;
  const fontSize = 48;
  const h = 128;
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${fontSize}px Antonio, sans-serif`;
  const measured = Math.ceil(measureCtx.measureText(text).width);
  // 512 × 128 minimum — enough resolution for crisp rendering at close zoom.
  // Grows wider for long names so the 48px glyphs never get scaled down.
  const w = Math.max(512, measured + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px Antonio, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  const scaleFactor = 0.003;
  sprite.scale.set(w * scaleFactor, h * scaleFactor, 1);
  sprite.userData.sizeCanvas = { w, h };
  return sprite;
}

export async function initMap(systems, factions, callbacks = {}) {
  await loadThree();
  const THREE = window.THREE;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x00000f);
  const mount = document.getElementById('app');
  mount.appendChild(renderer.domElement);
  renderer.domElement.id = 'map-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.01,
    2000,
  );
  camera.position.set(0, 18, 28);

  const clock = new THREE.Clock();
  // Animated object registries — animate() iterates these directly so we
  // never have to scene.traverse() per frame.
  const pulseObjects = [];
  const capitalOrbiters = [];
  const twinkleObjects = [];

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Ambient motion is handled by tickIdleDrift below, not OrbitControls.
  controls.autoRotate = false;
  controls.minDistance = 0.05;
  controls.maxDistance = 24.5; // 24.5 units × 16.3 ≈ 400 ly
  controls.target.set(0, 0, 0);

  const starTex = makeStarTexture(THREE);
  buildSkybox(scene, THREE, starTex);
  buildGrid(scene, THREE);
  buildQuadrantDivider(scene, THREE);
  buildQuadrantWatermarks(scene, THREE);
  buildNeutralZone(scene, THREE, factions);
  const factionCloudMeshes = buildFactionClouds(scene, factions, THREE, starTex);
  for (const layers of factionCloudMeshes.values()) {
    for (const layer of layers) {
      if (layer.userData.animType) pulseObjects.push(layer);
    }
  }
  const factionLabelSprites = buildFactionLabels(scene, factions, THREE);

  const capitalMeshes = [];
  const majorMeshes = [];
  const capitalGroups = [];
  const majorData = [];
  const factionObjectsByKey = new Map();
  for (const key of Object.keys(factions)) factionObjectsByKey.set(key, []);
  factionObjectsByKey.set('__unknown__', []);

  function registerFactionObj(factionKey, obj) {
    const bucket = factionObjectsByKey.get(factionKey) || factionObjectsByKey.get('__unknown__');
    bucket.push(obj);
  }

  const minorByFaction = new Map();
  const minorMeshByFaction = new Map();

  for (const sys of systems) {
    if (!sys.pos3d) continue;
    const fkey = sys.faction || '__unknown__';
    const faction = factions[fkey] || factions.independent || { color: 0xaaaaaa, css: '#AAAAAA' };
    const color = faction.color;

    if (sys.size === 'capital') {
      const group = buildCapitalGroup(sys, color, THREE);
      scene.add(group);
      capitalMeshes.push(group.userData.core);
      capitalGroups.push(group);
      registerFactionObj(fkey, group);
    } else if (sys.size === 'major') {
      const group = buildMajorGroup(sys, color, THREE);
      scene.add(group);
      majorMeshes.push(group.userData.core);
      majorData.push(group);
      registerFactionObj(fkey, group);
    } else {
      if (!minorByFaction.has(fkey)) minorByFaction.set(fkey, []);
      minorByFaction.get(fkey).push({ sys, color });
    }
  }

  for (const [fkey, entries] of minorByFaction.entries()) {
    const positions = new Float32Array(entries.length * 3);
    const colors = new Float32Array(entries.length * 3);
    for (let i = 0; i < entries.length; i++) {
      const { sys, color } = entries[i];
      positions[i * 3 + 0] = sys.pos3d.x;
      positions[i * 3 + 1] = sys.pos3d.y;
      positions[i * 3 + 2] = sys.pos3d.z;
      const rgb = hexToRgb(color);
      colors[i * 3 + 0] = rgb.r;
      colors[i * 3 + 1] = rgb.g;
      colors[i * 3 + 2] = rgb.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      map: starTex,
      alphaTest: 0.01,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.userData.animType = 'minorCloud';
    points.userData.baseOpacity = 0.55;
    points.userData.twinklePhase = mulberry32(hashString(fkey))() * Math.PI * 2;
    twinkleObjects.push(points);
    scene.add(points);
    minorMeshByFaction.set(fkey, points);
    registerFactionObj(fkey, points);
  }

  capitalOrbiters.push(
    ...buildCapitalOrbiters(scene, systems, factions, THREE, registerFactionObj),
  );

  const activeFactions = new Set(Object.keys(factions));

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let selectedSystem = null;
  let selectionWire = null;

  function clearSelectionWire() {
    if (selectionWire) {
      scene.remove(selectionWire);
      selectionWire.geometry.dispose();
      selectionWire.material.dispose();
      selectionWire = null;
    }
  }

  function drawSelectionWire(mesh, color, baseR) {
    clearSelectionWire();
    const geo = new THREE.SphereGeometry(baseR * 1.5, 16, 12);
    const wire = new THREE.WireframeGeometry(geo);
    const line = new THREE.LineSegments(
      wire,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    line.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
    scene.add(line);
    selectionWire = line;
  }

  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([...capitalMeshes, ...majorMeshes], false);
    if (!hits.length) return;
    const mesh = hits[0].object;
    const sys = mesh.userData.system;
    if (!sys) return;
    const faction = factions[sys.faction] || factions.independent;
    drawSelectionWire(mesh, faction.color, mesh.userData.radius || 0.18);
    selectedSystem = sys;
    callbacks.onSelect?.(sys);
  });

  // Idle camera drift: after 6s without interaction, slowly orbit the galaxy
  // (0.06 rad/s ≈ one full revolution every ~105 seconds).
  let lastInteraction = Date.now();
  const IDLE_DRIFT_DELAY_MS = 6000;
  const IDLE_DRIFT_SPEED = 0.06;
  const driftAxis = new THREE.Vector3(0, 1, 0);
  function bumpAutoRotate() {
    lastInteraction = Date.now();
  }
  renderer.domElement.addEventListener('pointerdown', bumpAutoRotate);
  renderer.domElement.addEventListener('wheel', bumpAutoRotate, { passive: true });

  function tickIdleDrift(delta) {
    if (flyTo || Date.now() - lastInteraction < IDLE_DRIFT_DELAY_MS) return;
    // Rotate the camera about the target's vertical axis — preserves the
    // current zoom radius and elevation rather than snapping to a fixed orbit.
    camera.position.sub(controls.target);
    camera.position.applyAxisAngle(driftAxis, delta * IDLE_DRIFT_SPEED);
    camera.position.add(controls.target);
    camera.lookAt(controls.target);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Fly-to state
  let flyTo = null;

  function startFlyTo(sys) {
    if (!sys?.pos3d) return;
    flyTo = {
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(sys.pos3d.x, sys.pos3d.y, sys.pos3d.z),
      fromCam: camera.position.clone(),
      toCam: new THREE.Vector3(sys.pos3d.x, sys.pos3d.y, sys.pos3d.z).add(
        new THREE.Vector3(0, 2, 4),
      ),
      t0: performance.now(),
      dur: 1500,
    };
    bumpAutoRotate();
  }

  function updateFlyTo(now) {
    if (!flyTo) return;
    const t = Math.min(1, (now - flyTo.t0) / flyTo.dur);
    controls.target.lerpVectors(flyTo.fromTarget, flyTo.toTarget, t);
    camera.position.lerpVectors(flyTo.fromCam, flyTo.toCam, t);
    if (t >= 1) flyTo = null;
  }

  function updatePulse(t) {
    // 0.9 rad/s — quicker than the 0.35 rad/s cloud breath so capitals read
    // as active beacons, but far calmer than the old 2 rad/s strobe.
    const pulse = 0.75 + Math.sin(t * 0.9) * 0.25;
    for (const g of capitalGroups) {
      if (g.userData.bloomInner) g.userData.bloomInner.material.opacity = pulse * 0.6;
      if (g.userData.bloomOuter) g.userData.bloomOuter.material.opacity = pulse * 0.25;
    }
    if (selectionWire) {
      selectionWire.rotation.y += 0.005;
    }
  }

  // Breathing opacity for faction cloud layers (and any other registered
  // pulse object). 0.35 rad/s ≈ an 18-second breath cycle.
  function updateAmbient(t) {
    for (const obj of pulseObjects) {
      const u = obj.userData;
      obj.material.opacity = u.baseOpacity + u.amplitude * Math.sin(t * 0.35 + u.phase);
    }
    // Minor/STAPI Points only — capitals and majors are untouched.
    for (const obj of twinkleObjects) {
      const u = obj.userData;
      obj.material.opacity = u.baseOpacity + 0.05 * Math.sin(t * 1.8 + u.twinklePhase);
    }
    for (const o of capitalOrbiters) {
      const a = t * o.speed + o.phase;
      o.mesh.position.set(
        o.cx + o.radius * Math.cos(a),
        o.cy + 0.05 * Math.sin(t * o.speed * 2 + o.phase),
        o.cz + o.radius * Math.sin(a),
      );
    }
  }

  function updateLabelVisibility() {
    // System groups are direct scene children, so local position === world
    // position — no per-frame getWorldPosition/Vector3 allocations needed.
    const camPos = camera.position;
    for (const g of capitalGroups) {
      if (!g.userData.label) continue;
      g.userData.label.visible = camPos.distanceTo(g.position) < CAPITAL_LABEL_DIST && g.visible;
    }
    for (const g of majorData) {
      if (!g.userData.label) continue;
      g.userData.label.visible = camPos.distanceTo(g.position) < MAJOR_LABEL_DIST && g.visible;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    // getDelta() must be the single clock advance per frame; elapsedTime is
    // refreshed by it, so read t from the property rather than getElapsedTime().
    const delta = clock.getDelta();
    const t = clock.elapsedTime;
    tickIdleDrift(delta);
    updateAmbient(t);
    const now = performance.now();
    updateFlyTo(now);
    controls.update();
    updatePulse(t);
    updateLabelVisibility();
    renderer.render(scene, camera);
    callbacks.onZoomChange?.(camera.position.distanceTo(controls.target));
  }
  animate();

  function setFactionVisible(factionKey, visible) {
    if (visible) activeFactions.add(factionKey);
    else activeFactions.delete(factionKey);

    const objs = factionObjectsByKey.get(factionKey) || [];
    for (const obj of objs) obj.visible = visible;
    const cloudLayers = factionCloudMeshes.get(factionKey);
    if (cloudLayers) {
      for (const layer of cloudLayers) layer.visible = visible;
    }
  }

  function flyToSystem(sys) {
    startFlyTo(sys);
  }

  function resetView() {
    flyTo = null;
    camera.position.set(0, 18, 28);
    controls.target.set(0, 0, 0);
    controls.update();
    bumpAutoRotate();
  }

  // OrbitControls r128 keeps dollyIn/dollyOut as private closures, so we
  // step the camera toward/away from the target directly and clamp to the
  // control distance range.
  function zoomIn() {
    const dir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .multiplyScalar(1 - 1 / 1.5);
    camera.position.sub(dir);
    const dist = camera.position.distanceTo(controls.target);
    if (dist < controls.minDistance) {
      camera.position.copy(controls.target).addScaledVector(
        new THREE.Vector3().subVectors(camera.position, controls.target).normalize(),
        controls.minDistance,
      );
    }
    controls.update();
    bumpAutoRotate();
  }

  function zoomOut() {
    const dir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .multiplyScalar(1 - 1 / 1.5);
    camera.position.add(dir);
    const dist = camera.position.distanceTo(controls.target);
    if (dist > controls.maxDistance) {
      camera.position.copy(controls.target).addScaledVector(
        new THREE.Vector3().subVectors(camera.position, controls.target).normalize(),
        controls.maxDistance,
      );
    }
    controls.update();
    bumpAutoRotate();
  }

  function zoomAtScreen(_sx, _sy, factor) {
    // Dolly the camera toward/away from the orbit target. `factor > 1` zooms
    // in (moves camera closer), `factor < 1` zooms out.
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    const newDist = Math.min(
      controls.maxDistance,
      Math.max(controls.minDistance, dir.length() / factor),
    );
    dir.setLength(newDist);
    camera.position.copy(controls.target).add(dir);
    bumpAutoRotate();
  }

  function setSelectedSystem(sysOrNull) {
    if (sysOrNull === null || sysOrNull === undefined) {
      clearSelectionWire();
      selectedSystem = null;
      callbacks.onSelect?.(null);
      return;
    }
    const mesh = [...capitalMeshes, ...majorMeshes].find(
      (m) => m.userData.system === sysOrNull || m.userData.system?.id === sysOrNull.id,
    );
    if (!mesh) {
      selectedSystem = sysOrNull;
      callbacks.onSelect?.(sysOrNull);
      return;
    }
    const faction = factions[sysOrNull.faction] || factions.independent;
    drawSelectionWire(mesh, faction.color, mesh.userData.radius || 0.18);
    selectedSystem = sysOrNull;
    callbacks.onSelect?.(sysOrNull);
  }

  return {
    activeFactions,
    setFactionVisible,
    setFactionEnabled: setFactionVisible,
    flyToSystem,
    flyTo: flyToSystem,
    resetView,
    zoomIn,
    zoomOut,
    zoomAt: zoomAtScreen,
    setSelectedSystem,
    get selectedSystem() {
      return selectedSystem;
    },
  };
}

// Keep the previous factory name working for any downstream imports.
export const createMap = initMap;

function makeStarTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function buildSkybox(scene, THREE, starTex) {
  const positions = [];
  const colors = [];
  const rng = mulberry32(9999);

  for (let i = 0; i < 8000; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = 250;
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    );
    const blue = rng() < 0.12;
    const v = 0.4 + rng() * 0.6;
    colors.push(blue ? 0.7 * v : v, blue ? 0.8 * v : v, blue ? v : v * 0.9);
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // sizeAttenuation: false makes `size` a raw gl_PointSize in GPU pixels,
  // so stars stay a constant screen size at every zoom level. 0.8 px was
  // subpixel on most displays (WebGL drops those), so 2 px gives a reliably
  // visible dot that still reads like a distant star.
  const starMat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    map: starTex,
    alphaTest: 0.01,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
  });

  const skybox = new THREE.Points(starGeo, starMat);
  skybox.frustumCulled = false;
  skybox.renderOrder = -10;
  scene.add(skybox);
}

// Galactic meridian — the Alpha/Beta quadrant boundary at X = 0.
function buildQuadrantDivider(scene, THREE) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -15),
    new THREE.Vector3(0, 0, 15),
  ]);
  const mat = new THREE.LineBasicMaterial({
    color: 0x334466,
    transparent: true,
    opacity: 0.3,
  });
  scene.add(new THREE.Line(geo, mat));
}

// Large near-invisible quadrant name watermarks hovering over the plane.
function buildQuadrantWatermarks(scene, THREE) {
  const entries = [
    { text: 'ALPHA QUADRANT', x: -4, y: 0.5, z: 0 },
    { text: 'BETA QUADRANT', x: 6, y: 0.5, z: 0 },
  ];
  for (const { text, x, y, z } of entries) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 170;
      const ctx = canvas.getContext('2d');
      ctx.font = '110px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#99AACC';
      ctx.fillText(text, 512, 85);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.06, depthWrite: false }),
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(12, 2, 1);
      scene.add(sprite);
    } catch {
      /* watermark skipped */
    }
  }
}

// Romulan Neutral Zone — dotted boundary between Federation and Romulan
// space, rendered as small spheres for visibility at map zoom.
function buildNeutralZone(scene, THREE, factions) {
  try {
    const path = [
      new THREE.Vector3(2, 0, -1),
      new THREE.Vector3(4, 0, -2),
      new THREE.Vector3(5.5, 0, -3),
    ];
    const fedColor = new THREE.Color(factions?.federation?.color ?? 0x3377ff);
    const romColor = new THREE.Color(factions?.romulan?.color ?? 0x229933);
    const totalLen =
      path[0].distanceTo(path[1]) + path[1].distanceTo(path[2]);
    const STEP = 0.35;
    const geo = new THREE.SphereGeometry(0.05, 6, 6);
    for (let d = 0; d <= totalLen; d += STEP) {
      const segLen = path[0].distanceTo(path[1]);
      const pos =
        d <= segLen
          ? new THREE.Vector3().lerpVectors(path[0], path[1], d / segLen)
          : new THREE.Vector3().lerpVectors(
              path[1],
              path[2],
              (d - segLen) / path[1].distanceTo(path[2]),
            );
      const color = fedColor.clone().lerp(romColor, d / totalLen);
      const marker = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }),
      );
      marker.position.copy(pos);
      scene.add(marker);
    }
  } catch {
    /* neutral zone skipped */
  }
}

function buildGrid(scene, THREE) {
  const grid = new THREE.GridHelper(60, 30, 0x1a3a5c, 0x0d1f30);
  grid.position.y = -0.1;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
}

// ─── BUILD FACTION CLOUDS (replace existing function) ────────────────────────
function buildFactionClouds(scene, factions, THREE, starTex) {
  const cloudMeshes = new Map();

  for (const [key, faction] of Object.entries(factions)) {
    const zone = FACTION_ZONES_3D[key];
    if (!zone || !zone.clusters) continue;

    const color = faction.color;
    const layers = [];

    for (const cluster of zone.clusters) {
      const { x: cx, y: cy, z: cz, r } = cluster;

      // ── Layer 1: Dense core ──────────────────────────────────────────────
      // Tight sphere of points, higher opacity = readable faction region
      const CORE_N = 300;
      const corePos = new Float32Array(CORE_N * 3);
      const rng1 = mulberry32(hashString(key + cx + '_core'));
      for (let i = 0; i < CORE_N; i++) {
        // Uniform sphere distribution
        const u = rng1(), v = rng1(), w = rng1();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const rad = r * 0.6 * Math.cbrt(w); // concentrate toward centre
        corePos[i * 3 + 0] = cx + rad * Math.sin(phi) * Math.cos(theta);
        corePos[i * 3 + 1] = cy + rad * 0.25 * Math.sin(phi) * Math.sin(theta); // flatten Y
        corePos[i * 3 + 2] = cz + rad * Math.sin(phi) * Math.cos(theta + 1.2);
      }
      const coreGeo = new THREE.BufferGeometry();
      coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(corePos, 3));
      const coreMat = new THREE.PointsMaterial({
        color, size: 0.18, sizeAttenuation: true,
        transparent: true, opacity: 0.22,
        depthWrite: false, map: starTex, alphaTest: 0.01,
      });
      const core = new THREE.Points(coreGeo, coreMat);
      core.userData.animType = 'cloudCore';
      core.userData.baseOpacity = 0.22;
      core.userData.amplitude = 0.05;
      core.userData.phase = (hashString(key) % 628) / 100;
      scene.add(core);
      layers.push(core);

      // ── Layer 2: Soft nebula halo ────────────────────────────────────────
      // Wider scatter, fades at edges
      const HALO_N = 200;
      const haloPos = new Float32Array(HALO_N * 3);
      const rng2 = mulberry32(hashString(key + cx + '_halo'));
      for (let i = 0; i < HALO_N; i++) {
        const u = rng2(), v = rng2(), w = rng2();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const rad = r * (0.6 + 0.4 * w); // outer shell only
        haloPos[i * 3 + 0] = cx + rad * Math.sin(phi) * Math.cos(theta);
        haloPos[i * 3 + 1] = cy + rad * 0.2 * Math.sin(phi) * Math.sin(theta);
        haloPos[i * 3 + 2] = cz + rad * Math.sin(phi) * Math.cos(theta + 1.2);
      }
      const haloGeo = new THREE.BufferGeometry();
      haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3));
      const haloMat = new THREE.PointsMaterial({
        color, size: 0.5, sizeAttenuation: true,
        transparent: true, opacity: 0.07,
        depthWrite: false, map: starTex, alphaTest: 0.01,
      });
      const halo = new THREE.Points(haloGeo, haloMat);
      halo.userData.animType = 'cloudHalo';
      halo.userData.baseOpacity = 0.07;
      halo.userData.amplitude = 0.02;
      halo.userData.phase = (hashString(key) % 628) / 100;
      scene.add(halo);
      layers.push(halo);

      // ── Layer 3: Border shimmer ring ────────────────────────────────────
      // Points on the surface of the sphere only — creates a visible edge
      const RING_N = 120;
      const ringPos = new Float32Array(RING_N * 3);
      const rng3 = mulberry32(hashString(key + cx + '_ring'));
      for (let i = 0; i < RING_N; i++) {
        const u = rng3(), v = rng3();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const rad = r * (0.92 + 0.08 * rng3()); // surface shell only
        ringPos[i * 3 + 0] = cx + rad * Math.sin(phi) * Math.cos(theta);
        ringPos[i * 3 + 1] = cy + rad * 0.15 * Math.sin(phi) * Math.sin(theta);
        ringPos[i * 3 + 2] = cz + rad * Math.sin(phi) * Math.cos(theta + 1.2);
      }
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3));
      const ringMat = new THREE.PointsMaterial({
        color, size: 0.28, sizeAttenuation: true,
        transparent: true, opacity: 0.35, // noticeably brighter — this IS the border
        depthWrite: false, map: starTex, alphaTest: 0.01,
      });
      const ring = new THREE.Points(ringGeo, ringMat);
      ring.userData.animType = 'cloudRing';
      ring.userData.baseOpacity = 0.35;
      ring.userData.amplitude = 0.08;
      // +2.0 rad so the border shimmers out of sync with the core breath.
      ring.userData.phase = (hashString(key) % 628) / 100 + 2.0;
      scene.add(ring);
      layers.push(ring);
    }

    cloudMeshes.set(key, layers);
  }

  return cloudMeshes;
}

// Floating faction-abbreviation sprites above each territory's primary cluster.
const FACTION_LABEL_POS = {
  federation:  { x: 0.5,  y: 1.8, z: 0.0  },
  klingon:     { x: 7.0,  y: 2.0, z: 3.2  },
  romulan:     { x: 5.5,  y: 1.8, z: -3.8 },
  cardassian:  { x: -7.2, y: 2.0, z: 5.2  },
  ferengi:     { x: -6.7, y: 1.8, z: -2.7 },
  breen:       { x: -5.5, y: 1.6, z: 7.5  },
  dominion:    { x: -1.0, y: 1.6, z: 9.5  },
};

function buildFactionLabels(scene, factions, THREE) {
  const sprites = new Map();
  for (const [key, pos] of Object.entries(FACTION_LABEL_POS)) {
    const faction = factions[key];
    if (!faction) continue;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 52px Antonio, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = faction.css || '#FFFFFF';
      ctx.shadowBlur = 18;
      ctx.fillStyle = faction.css || '#FFFFFF';
      ctx.fillText(faction.short || key.toUpperCase(), 256, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.scale.set(4.0, 1.0, 1.0);
      sprite.userData.baseScale = { x: 4.0, y: 1.0 };
      scene.add(sprite);
      sprites.set(key, sprite);
    } catch {
      /* label skipped — map still renders */
    }
  }
  return sprites;
}

// One small glowing satellite per capital system, orbiting in the XZ plane
// with a slight Y bob. Returns orbiter records consumed by the animate loop.
function buildCapitalOrbiters(scene, systems, factions, THREE, registerFactionObj) {
  const orbiters = [];
  try {
    for (const sys of systems) {
      if (sys?.size !== 'capital' || !sys.pos3d) continue;
      const fkey = sys.faction || '__unknown__';
      const faction = factions[fkey] || factions.independent || { color: 0xaaaaaa };
      const rng = mulberry32(hashString(sys.name || sys.id || 'capital'));
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 6, 6),
        new THREE.MeshBasicMaterial({ color: faction.color }),
      );
      scene.add(mesh);
      registerFactionObj?.(fkey, mesh);
      orbiters.push({
        mesh,
        cx: sys.pos3d.x,
        cy: sys.pos3d.y,
        cz: sys.pos3d.z,
        radius: 0.32,
        speed: 0.25 + rng() * 0.2,
        phase: rng() * Math.PI * 2,
      });
    }
  } catch {
    /* missing data fields — render map without orbiters */
  }
  return orbiters;
}

function buildCapitalGroup(sys, color, THREE) {
  const group = new THREE.Group();
  group.position.set(sys.pos3d.x, sys.pos3d.y, sys.pos3d.z);

  const coreGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.userData = { system: sys, radius: 0.18, factionColor: color };
  group.add(core);

  const bloomTex = makeBloomTexture(color);

  const bloomInner = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: bloomTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  bloomInner.scale.set(1.4, 1.4, 1);
  group.add(bloomInner);

  const bloomOuter = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: bloomTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.3,
    }),
  );
  bloomOuter.scale.set(2.8, 2.8, 1);
  group.add(bloomOuter);

  const ringGeo = new THREE.RingGeometry(0.28, 0.32, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = (75 * Math.PI) / 180;
  group.add(ring);

  const label = makeLabelSprite(sys.name || 'Unknown');
  label.position.set(0, 0.6, 0);
  label.visible = false;
  group.add(label);

  group.userData = {
    system: sys,
    core,
    bloomInner,
    bloomOuter,
    ring,
    label,
  };

  return group;
}

function buildMajorGroup(sys, color, THREE) {
  const group = new THREE.Group();
  group.position.set(sys.pos3d.x, sys.pos3d.y, sys.pos3d.z);

  const coreGeo = new THREE.SphereGeometry(0.1, 10, 10);
  const dimColor = dimHex(color, 0.75);
  const coreMat = new THREE.MeshBasicMaterial({ color: dimColor });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.userData = { system: sys, radius: 0.1, factionColor: color };
  group.add(core);

  const bloom = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeBloomTexture(color),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    }),
  );
  bloom.scale.set(1.0, 1.0, 1);
  group.add(bloom);

  const label = makeLabelSprite(sys.name || 'Unknown');
  label.position.set(0, 0.35, 0);
  label.visible = false;
  group.add(label);

  group.userData = { system: sys, core, label };

  return group;
}

function dimHex(hex, amount) {
  const r = Math.round(((hex >> 16) & 0xff) * amount);
  const g = Math.round(((hex >> 8) & 0xff) * amount);
  const b = Math.round((hex & 0xff) * amount);
  return (r << 16) | (g << 8) | b;
}
