import './sector-view.css';

// Three.js r128 and OrbitControls are classic (UMD) scripts that attach to
// window.THREE, so we load them via <script> tags lazily on first open.
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

let _systems = [];
let _factions = {};
let _overlay = null;
let _faction_label_el = null;

// Three.js state (initialized on first openSectorView call)
let _three_ready = null; // Promise<void>
let _scene = null;
let _camera = null;
let _renderer = null;
let _controls = null;
let _ambient = null;
let _raycaster = null;
let _mouse = null;
let _factionObjects = null; // Group that holds all per-faction stars
let _capitalMeshes = [];
let _majorMeshes = [];
let _selectionWireframe = null;
let _onSystemSelect = null;
let _currentFactionKey = null;

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
    s.async = true;
    s.dataset.src = src;
    s.addEventListener('load', () => {
      s.dataset.loaded = 'true';
      resolve();
    });
    s.addEventListener('error', reject);
    document.head.appendChild(s);
  });
}

async function loadThree() {
  if (_three_ready) return _three_ready;
  _three_ready = (async () => {
    await injectScript(THREE_URL);
    // OrbitControls expects window.THREE to already exist.
    await injectScript(ORBIT_URL);
  })();
  return _three_ready;
}

export function initSectorView(systems, factions) {
  _systems = systems || [];
  _factions = factions || {};

  if (document.getElementById('sector-view')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sector-view';

  const header = document.createElement('div');
  header.id = 'sector-view-header';
  header.textContent = '3D SECTOR VIEW';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'sector-view-close';
  closeBtn.type = 'button';
  closeBtn.textContent = 'ESC  CLOSE';

  const factionLabel = document.createElement('div');
  factionLabel.id = 'sector-view-faction-label';

  overlay.appendChild(header);
  overlay.appendChild(closeBtn);
  overlay.appendChild(factionLabel);

  document.body.appendChild(overlay);

  _overlay = overlay;
  _faction_label_el = factionLabel;

  closeBtn.addEventListener('click', closeSectorView);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeSectorView();
  });
}

function closeSectorView() {
  if (!_overlay) return;
  _overlay.classList.remove('open');
  if (_controls) _controls.autoRotate = true;
}

function initThreeScene() {
  const THREE = window.THREE;

  _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  _renderer.setPixelRatio(window.devicePixelRatio || 1);
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _overlay.appendChild(_renderer.domElement);

  const aspect = window.innerWidth / window.innerHeight;
  _camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  _camera.position.set(0, 8, 22);

  _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
  _controls.autoRotate = true;
  _controls.autoRotateSpeed = 0.3;
  _controls.enableDamping = true;

  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x00000F);

  _ambient = new THREE.AmbientLight(0xffffff, 0.3);
  _scene.add(_ambient);

  _factionObjects = new THREE.Group();
  _scene.add(_factionObjects);

  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  window.addEventListener('resize', onResize);
  _renderer.domElement.addEventListener('click', onCanvasClick);

  animate();
}

function onResize() {
  if (!_renderer || !_camera) return;
  _camera.aspect = window.innerWidth / window.innerHeight;
  _camera.updateProjectionMatrix();
  _renderer.setSize(window.innerWidth, window.innerHeight);
}

function onCanvasClick(e) {
  if (!_overlay.classList.contains('open')) return;
  const rect = _renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, _camera);
  const targets = [..._capitalMeshes, ..._majorMeshes];
  const hits = _raycaster.intersectObjects(targets, false);
  if (!hits.length) return;
  const mesh = hits[0].object;
  const sys = mesh.userData.system;
  if (!sys) return;
  drawSelectionWireframe(mesh);
  if (typeof _onSystemSelect === 'function') _onSystemSelect(sys);
}

function drawSelectionWireframe(mesh) {
  const THREE = window.THREE;
  if (_selectionWireframe) {
    _scene.remove(_selectionWireframe);
    _selectionWireframe.geometry.dispose();
    _selectionWireframe.material.dispose();
    _selectionWireframe = null;
  }
  const baseR = mesh.userData.radius || 0.18;
  const sphere = new THREE.SphereGeometry(baseR * 1.5, 16, 12);
  const wire = new THREE.WireframeGeometry(sphere);
  const factionColor = mesh.userData.factionColor ?? 0xffffff;
  const line = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: factionColor, transparent: true, opacity: 0.7 }),
  );
  line.position.copy(mesh.position);
  _scene.add(line);
  _selectionWireframe = line;
}

function animate() {
  requestAnimationFrame(animate);
  if (!_scene || !_renderer) return;

  const t = Date.now() * 0.002;
  for (let i = 0; i < _capitalMeshes.length; i++) {
    const m = _capitalMeshes[i];
    if (m.material && 'opacity' in m.material) {
      m.material.opacity = 0.85 + Math.sin(t) * 0.15;
      m.material.transparent = true;
    }
  }

  if (_controls) _controls.update();
  _renderer.render(_scene, _camera);
}

function clearFactionObjects() {
  if (!_factionObjects) return;
  const THREE = window.THREE;
  while (_factionObjects.children.length) {
    const obj = _factionObjects.children.pop();
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose?.();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
        else child.material.dispose?.();
      }
      if (child.isSprite && child.material?.map) child.material.map.dispose?.();
    });
  }
  if (_selectionWireframe) {
    _scene.remove(_selectionWireframe);
    _selectionWireframe.geometry.dispose();
    _selectionWireframe.material.dispose();
    _selectionWireframe = null;
  }
  _capitalMeshes = [];
  _majorMeshes = [];
}

function makeGlowTexture(hexColor) {
  const THREE = window.THREE;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8) & 0xff;
  const b = hexColor & 0xff;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildFactionScene(factionKey) {
  const THREE = window.THREE;
  const faction = _factions[factionKey];
  if (!faction) return;
  const factionColor = faction.color;

  const subset = _systems.filter((sys) => sys.faction === factionKey);

  const minorPositions = [];

  subset.forEach((sys) => {
    const tx = (sys.x - 1200) / 80;
    const tz = (sys.y - 800) / 80;
    const ty = mulberry32(hashStr(sys.uid || sys.id || sys.name))() * 4 - 2;

    if (sys.size === 'capital') {
      const geo = new THREE.SphereGeometry(0.18, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: factionColor, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(tx, ty, tz);
      mesh.userData = { system: sys, factionColor, radius: 0.18 };
      _factionObjects.add(mesh);
      _capitalMeshes.push(mesh);

      const spriteMat = new THREE.SpriteMaterial({
        map: makeGlowTexture(factionColor),
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.2, 1.2, 1);
      sprite.position.set(tx, ty, tz);
      _factionObjects.add(sprite);
    } else if (sys.size === 'major') {
      const geo = new THREE.SphereGeometry(0.1, 12, 12);
      const dimmed = dim(factionColor, 0.7);
      const mat = new THREE.MeshBasicMaterial({ color: dimmed });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(tx, ty, tz);
      mesh.userData = { system: sys, factionColor, radius: 0.1 };
      _factionObjects.add(mesh);
      _majorMeshes.push(mesh);
    } else {
      minorPositions.push(tx, ty, tz);
    }
  });

  if (minorPositions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(minorPositions, 3));
    const mat = new THREE.PointsMaterial({
      color: factionColor,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.4,
    });
    const points = new THREE.Points(geo, mat);
    _factionObjects.add(points);
  }
}

function dim(hexColor, amount) {
  const r = Math.round(((hexColor >> 16) & 0xff) * amount);
  const g = Math.round(((hexColor >> 8) & 0xff) * amount);
  const b = Math.round((hexColor & 0xff) * amount);
  return (r << 16) | (g << 8) | b;
}

export async function openSectorView(factionKey, onSystemSelect) {
  if (!_overlay) return;
  _onSystemSelect = onSystemSelect;
  _currentFactionKey = factionKey;

  await loadThree();
  if (!_scene) initThreeScene();

  clearFactionObjects();
  buildFactionScene(factionKey);

  const faction = _factions[factionKey];
  if (faction && _faction_label_el) {
    _faction_label_el.textContent = faction.name || '';
    _faction_label_el.style.color = faction.css || '#FFCC88';
  }

  if (_controls) {
    _controls.autoRotate = true;
    _controls.target.set(0, 0, 0);
    _controls.update();
  }

  _overlay.classList.add('open');
  onResize();
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
