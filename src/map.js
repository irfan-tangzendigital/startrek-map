const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

const FACTION_ZONES_3D = {
  federation:  { x: [-3,  +1], y: [-1, +1], z: [-3, +3] },
  klingon:     { x: [+4, +10], y: [-1, +1], z: [-2, +4] },
  romulan:     { x: [+4, +10], y: [-1, +2], z: [-6, -2] },
  cardassian:  { x: [-8,  -3], y: [-1, +1], z: [+2, +6] },
  ferengi:     { x: [-8,  -3], y: [-1, +1], z: [-4, -1] },
  breen:       { x: [-6,  -2], y: [-2,  0], z: [+4, +8] },
  dominion:    { x: [-4,   0], y: [-2,  0], z: [+3, +7] },
  independent: { x: [-12, +12], y: [-2, +2], z: [-8, +8] },
};

const CAPITAL_LABEL_DIST = 8;
const MAJOR_LABEL_DIST = 5;
const AUTOROTATE_RESUME_MS = 4000;

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
  camera.position.set(0, 40, 60);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.15;
  controls.minDistance = 0.5;
  controls.maxDistance = 120;
  controls.target.set(0, 0, 0);

  const starTex = makeStarTexture(THREE);
  buildSkybox(scene, THREE, starTex);
  buildGrid(scene, THREE);
  const factionCloudMeshes = buildFactionClouds(scene, factions, THREE, starTex);

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
    scene.add(points);
    minorMeshByFaction.set(fkey, points);
    registerFactionObj(fkey, points);
  }

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

  // Pause autoRotate on interaction, resume after idle.
  let autoRotateTimer = null;
  function bumpAutoRotate() {
    controls.autoRotate = false;
    if (autoRotateTimer) clearTimeout(autoRotateTimer);
    autoRotateTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, AUTOROTATE_RESUME_MS);
  }
  renderer.domElement.addEventListener('pointerdown', bumpAutoRotate);
  renderer.domElement.addEventListener('wheel', bumpAutoRotate, { passive: true });

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

  function updatePulse(now) {
    const pulse = 0.75 + Math.sin(now * 0.002) * 0.25;
    for (const g of capitalGroups) {
      if (g.userData.bloomInner) g.userData.bloomInner.material.opacity = pulse * 0.6;
      if (g.userData.bloomOuter) g.userData.bloomOuter.material.opacity = pulse * 0.25;
    }
    if (selectionWire) {
      selectionWire.rotation.y += 0.005;
    }
  }

  function updateLabelVisibility() {
    const camPos = camera.position;
    const tmp = new THREE.Vector3();
    for (const g of capitalGroups) {
      if (!g.userData.label) continue;
      const dist = camPos.distanceTo(g.getWorldPosition(tmp));
      g.userData.label.visible = dist < CAPITAL_LABEL_DIST && g.visible;
    }
    for (const g of majorData) {
      if (!g.userData.label) continue;
      const dist = camPos.distanceTo(g.getWorldPosition(tmp));
      g.userData.label.visible = dist < MAJOR_LABEL_DIST && g.visible;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    updateFlyTo(now);
    controls.update();
    updatePulse(Date.now());
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
    flyTo = {
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
      fromCam: camera.position.clone(),
      toCam: new THREE.Vector3(0, 40, 60),
      t0: performance.now(),
      dur: 900,
    };
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
  const N = 8000;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const rng = mulberry32(9999);

  for (let i = 0; i < N; i++) {
    // Uniform points on a sphere of radius 180.
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 180;
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const blueish = rng() < 0.12;
    const alpha = 0.3 + rng() * 0.7;
    if (blueish) {
      colors[i * 3 + 0] = 0.7 * alpha;
      colors[i * 3 + 1] = 0.8 * alpha;
      colors[i * 3 + 2] = 1.0 * alpha;
    } else {
      colors[i * 3 + 0] = alpha;
      colors[i * 3 + 1] = alpha;
      colors[i * 3 + 2] = alpha;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    map: starTex,
    alphaTest: 0.01,
  });
  scene.add(new THREE.Points(geo, mat));
}

function buildGrid(scene, THREE) {
  const grid = new THREE.GridHelper(60, 30, 0x1a3a5c, 0x0d1f30);
  grid.position.y = -0.1;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
}

function buildFactionClouds(scene, factions, THREE, starTex) {
  const cloudMeshes = new Map();
  for (const [key, faction] of Object.entries(factions)) {
    const zone = FACTION_ZONES_3D[key];
    if (!zone) continue;
    const N = 400;
    const positions = new Float32Array(N * 3);
    const rng = mulberry32(hashString(key + '_cloud'));
    for (let i = 0; i < N; i++) {
      positions[i * 3 + 0] = zone.x[0] + rng() * (zone.x[1] - zone.x[0]);
      positions[i * 3 + 1] = zone.y[0] + rng() * (zone.y[1] - zone.y[0]);
      positions[i * 3 + 2] = zone.z[0] + rng() * (zone.z[1] - zone.z[0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const innerMat = new THREE.PointsMaterial({
      color: faction.color,
      size: 0.25,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      map: starTex,
      alphaTest: 0.01,
    });
    const inner = new THREE.Points(geo, innerMat);
    scene.add(inner);

    // Soft outer halo — fewer visual points but each is large and faint.
    const outerMat = new THREE.PointsMaterial({
      color: faction.color,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      map: starTex,
      alphaTest: 0.01,
    });
    const outer = new THREE.Points(geo, outerMat);
    scene.add(outer);

    cloudMeshes.set(key, [inner, outer]);
  }
  return cloudMeshes;
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
