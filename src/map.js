import * as PIXI from 'pixi.js';

const DEFAULT_WORLD_W = 2400;
const DEFAULT_WORLD_H = 1600;

const RADII = { capital: 8, major: 5, minor: 3.5 };

export function createMap({
  mountEl,
  factions,
  systems,
  territories,
  worldWidth = DEFAULT_WORLD_W,
  worldHeight = DEFAULT_WORLD_H,
  onSelectionChange,
  onZoomChange,
  onCoordsChange,
} = {}) {
  if (!mountEl) throw new Error('createMap: mountEl is required');

  const initialScale =
    Math.min(window.innerWidth / worldWidth, window.innerHeight / worldHeight) * 0.88;

  const app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x000011,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    autoStart: true,
  });

  mountEl.appendChild(app.view);
  app.view.id = 'map-canvas';

  const world = new PIXI.Container();
  const starsFar = new PIXI.Container();
  const starsMid = new PIXI.Container();
  const bgLayer = new PIXI.Container();
  const overlayLayer = new PIXI.Container();
  const glowLayer = new PIXI.Container();
  const sysLayer = new PIXI.Container();
  const lblLayer = new PIXI.Container();
  world.addChild(bgLayer, overlayLayer, glowLayer, sysLayer, lblLayer);

  /** Parallax layers (screen space); behind `world` in z-order */
  app.stage.addChild(starsFar, starsMid, world);

  function applyWorldPerspective() {
    world.skew.x = -0.08;
    world.scale.y = world.scale.x * 0.72;
  }

  world.scale.set(initialScale);
  applyWorldPerspective();
  world.x = (app.screen.width - worldWidth * initialScale) / 2;
  world.y = (app.screen.height - worldHeight * initialScale) / 2;

  function syncParallaxStars() {
    starsFar.scale.set(world.scale.x, world.scale.y);
    starsFar.skew.x = world.skew.x;
    starsFar.skew.y = world.skew.y;
    starsFar.position.set(world.x * 0.4, world.y * 0.4);
    starsMid.scale.set(world.scale.x, world.scale.y);
    starsMid.skew.x = world.skew.x;
    starsMid.skew.y = world.skew.y;
    starsMid.position.set(world.x * 0.7, world.y * 0.7);
  }
  syncParallaxStars();

  const sysMap = {};
  const activeFactions = new Set(Object.keys(factions));
  let selectedSystem = null;
  let glowGfx = null;

  drawBackground({
    bgLayer,
    starsFar,
    starsMid,
    worldWidth,
    worldHeight,
  });
  drawTerritories({ overlayLayer, territories, factions });
  drawSystems({
    sysLayer,
    lblLayer,
    systems,
    factions,
    sysMap,
    world,
    activeFactions,
    onSelect: handleSelect,
    isSelected: (sys) => selectedSystem?.id === sys.id,
  });
  updateLabelsVisibility({ sysMap, world, activeFactions });
  if (onZoomChange) onZoomChange(world.scale.x);

  // Ensure at least one frame is rendered immediately (some environments
  // won't paint until the ticker runs).
  app.start();
  app.render();

  // Pan + zoom
  function computeZoomMin() {
    return (
      Math.min(window.innerWidth / worldWidth, window.innerHeight / worldHeight) * 0.85
    );
  }
  let zoomMin = computeZoomMin();
  const ZOOM_MAX = 4.5;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let worldStart = { x: 0, y: 0 };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  app.stage.on('pointerdown', (e) => {
    isDragging = true;
    dragStart = { x: e.global.x, y: e.global.y };
    worldStart = { x: world.x, y: world.y };
    app.view.classList.add('dragging');
  });

  app.stage.on('pointermove', (e) => {
    if (onCoordsChange) {
      const wx = Math.round((e.global.x - world.x) / world.scale.x);
      const wy = Math.round((e.global.y - world.y) / world.scale.y);
      onCoordsChange({ wx, wy });
    }
    if (!isDragging) return;
    const dx = e.global.x - dragStart.x;
    const dy = e.global.y - dragStart.y;
    world.x = worldStart.x + dx;
    world.y = worldStart.y + dy;
    syncParallaxStars();
  });

  const endDrag = () => {
    isDragging = false;
    app.view.classList.remove('dragging');
  };
  app.stage.on('pointerup', endDrag);
  app.stage.on('pointerupoutside', endDrag);

  app.view.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
    },
    { passive: false },
  );

  function zoomAt(mx, my, factor) {
    const nextScale = Math.min(ZOOM_MAX, Math.max(zoomMin, world.scale.x * factor));
    const ratio = nextScale / world.scale.x;
    world.x = mx + (world.x - mx) * ratio;
    world.y = my + (world.y - my) * ratio;
    world.scale.set(nextScale);
    applyWorldPerspective();
    syncParallaxStars();
    onZoom();
  }

  function onZoom() {
    updateLabelsVisibility({ sysMap, world, activeFactions });
    if (onZoomChange) onZoomChange(world.scale.x);
  }

  function resetView() {
    world.scale.set(initialScale);
    applyWorldPerspective();
    world.x = (app.screen.width - worldWidth * initialScale) / 2;
    world.y = (app.screen.height - worldHeight * initialScale) / 2;
    syncParallaxStars();
    onZoom();
  }

  function setFactionEnabled(id, enabled) {
    if (enabled) activeFactions.add(id);
    else activeFactions.delete(id);

    const showLabels = world.scale.x > 0.54;
    Object.values(sysMap).forEach(({ dot, lbl, data }) => {
      const visible = activeFactions.has(data.faction);
      dot.visible = visible;
      lbl.visible = visible && showLabels;
    });
  }

  function setSelectedSystem(sysOrNull) {
    if (sysOrNull === null) {
      if (selectedSystem) {
        const prev = sysMap[selectedSystem.id];
        if (prev) renderDot(prev.dot, prev.data, prev.r, false, factions);
      }
      selectedSystem = null;
      if (glowGfx) {
        glowLayer.removeChild(glowGfx);
        glowGfx = null;
      }
      if (onSelectionChange) onSelectionChange(null);
      return;
    }

    const next = typeof sysOrNull === 'string' ? sysMap[sysOrNull]?.data : sysOrNull;
    if (!next) return;

    const ref = sysMap[next.id];
    if (!ref) return;

    handleSelect(next, ref.dot, ref.r);
  }

  function handleSelect(sys, dot, r) {
    if (selectedSystem) {
      const prev = sysMap[selectedSystem.id];
      if (prev) renderDot(prev.dot, prev.data, prev.r, false, factions);
    }
    if (glowGfx) {
      glowLayer.removeChild(glowGfx);
      glowGfx = null;
    }

    if (selectedSystem?.id === sys.id) {
      selectedSystem = null;
      if (onSelectionChange) onSelectionChange(null);
      return;
    }

    selectedSystem = sys;
    renderDot(dot, sys, r, true, factions);

    const f = factions[sys.faction];
    glowGfx = new PIXI.Graphics();
    glowGfx.lineStyle(1.5, f.color, 0.5).drawCircle(0, 0, r * 3.5);
    glowGfx.x = sys.x;
    glowGfx.y = sys.y;
    glowLayer.addChild(glowGfx);

    if (onSelectionChange) onSelectionChange(sys);
  }

  function flyTo(sys, zoom = 1.8) {
    const ref = sysMap[sys.id];
    if (!ref) return;
    const x0 = world.x;
    const y0 = world.y;
    const z0 = world.scale.x;
    const x1 = app.screen.width / 2 - sys.x * zoom;
    const y1 = app.screen.height / 2 - sys.y * zoom;
    let t = 0;

    const tick = (dt) => {
      t = Math.min(t + dt / 48, 1);
      const p = easeInOut(t);
      world.x = x0 + (x1 - x0) * p;
      world.y = y0 + (y1 - y0) * p;
      world.scale.set(z0 + (zoom - z0) * p);
      applyWorldPerspective();
      syncParallaxStars();
      onZoom();
      if (t >= 1) {
        app.ticker.remove(tick);
        setSelectedSystem(sys);
      }
    };

    app.ticker.add(tick);
  }

  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    app.stage.hitArea = app.screen;
    zoomMin = computeZoomMin();
    if (world.scale.x < zoomMin) {
      world.scale.set(zoomMin);
      applyWorldPerspective();
    }
    syncParallaxStars();
  });

  return {
    app,
    world,
    sysMap,
    activeFactions,
    zoomAt,
    resetView,
    flyTo,
    setFactionEnabled,
    setSelectedSystem,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Star field over 3× world extent: x ∈ [-W, 2W], y ∈ [-H, 2H] */
function drawStarsInGraphics(gfx, count, radius, alpha, seed, worldWidth, worldHeight) {
  const rng = mulberry32(seed);
  const spanW = worldWidth * 3;
  const spanH = worldHeight * 3;
  const x0 = -worldWidth;
  const y0 = -worldHeight;
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * spanW;
    const y = y0 + rng() * spanH;
    const blueWhite = rng() < 0.12;
    const color = blueWhite ? 0xaabbff : 0xffffff;
    gfx.beginFill(color, alpha).drawCircle(x, y, radius).endFill();
  }
}

function drawBackground({ bgLayer, starsFar, starsMid, worldWidth, worldHeight }) {
  const starsNear = new PIXI.Container();

  const gfxFar = new PIXI.Graphics();
  drawStarsInGraphics(gfxFar, 12000, 0.4, 0.15, 111, worldWidth, worldHeight);
  starsFar.addChild(gfxFar);

  const gfxMid = new PIXI.Graphics();
  drawStarsInGraphics(gfxMid, 6000, 0.8, 0.35, 222, worldWidth, worldHeight);
  starsMid.addChild(gfxMid);

  const gfxNear = new PIXI.Graphics();
  drawStarsInGraphics(gfxNear, 1600, 1.4, 0.7, 333, worldWidth, worldHeight);
  starsNear.addChild(gfxNear);

  bgLayer.addChild(starsNear);
}

function drawTerritories({ overlayLayer, territories, factions }) {
  if (!territories?.length) return;
  territories.forEach((t) => {
    const f = factions[t.faction];
    if (!f) return;

    const pts = t.points;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i += 2) {
      cx += pts[i];
      cy += pts[i + 1];
    }
    cx /= pts.length / 2;
    cy /= pts.length / 2;
    const lbl = new PIXI.Text(
      f.short,
      new PIXI.TextStyle({
        fontFamily: 'Antonio,Courier New',
        fontSize: 25,
        fill: 0xffffff,
        letterSpacing: 5,
        fontWeight: '700',
      }),
    );
    lbl.anchor.set(0.5);
    lbl.x = cx;
    lbl.y = cy;
    lbl.alpha = 0.2;
    overlayLayer.addChild(lbl);
  });
}

function drawSystems({
  sysLayer,
  lblLayer,
  systems,
  factions,
  sysMap,
  world,
  activeFactions,
  onSelect,
  isSelected,
}) {
  systems.forEach((sys) => {
    const r = RADII[sys.size] || 4;
    const dot = new PIXI.Graphics();
    renderDot(dot, sys, r, false, factions);
    dot.x = sys.x;
    dot.y = sys.y;
    dot.eventMode = 'static';
    dot.cursor = 'pointer';
    dot.on('pointerover', () => {
      if (isSelected?.(sys)) return;
      renderDot(dot, sys, r, true, factions);
    });
    dot.on('pointerout', () => {
      if (isSelected?.(sys)) return;
      renderDot(dot, sys, r, false, factions);
    });
    dot.on('pointerdown', (e) => {
      e.stopPropagation();
      onSelect?.(sys, dot, r);
    });

    const lbl = new PIXI.Text(
      sys.name,
      new PIXI.TextStyle({
        fontFamily: 'Antonio,Courier New',
        fontSize: 12,
        fill: factions[sys.faction]?.color ?? 0xffffff,
        letterSpacing: 1.4,
      }),
    );
    lbl.anchor.set(0, 0.5);
    lbl.x = sys.x + r + 5;
    lbl.y = sys.y;
    lbl.visible = world.scale.x > 0.54 && activeFactions.has(sys.faction);

    sysLayer.addChild(dot);
    lblLayer.addChild(lbl);
    sysMap[sys.id] = { dot, lbl, data: sys, r };
  });
}

function renderDot(g, sys, r, hover, factions) {
  const f = factions[sys.faction];
  g.clear();
  if (!f) return;

  if (sys.size === 'capital') {
    const s = hover ? r * 1.6 : r;
    g.beginFill(f.color, hover ? 1 : 0.92)
      .moveTo(0, -s * 1.45)
      .lineTo(s, 0)
      .lineTo(0, s * 1.45)
      .lineTo(-s, 0)
      .closePath()
      .endFill();
    g.lineStyle(0.5, 0xffffff, 0.3)
      .moveTo(0, -s * 1.45)
      .lineTo(s, 0)
      .lineTo(0, s * 1.45)
      .lineTo(-s, 0)
      .closePath();
  } else {
    const rad = hover ? r * 1.45 : r;
    g.beginFill(f.color, hover ? 1 : 0.87).drawCircle(0, 0, rad).endFill();
    if (sys.size === 'major') g.lineStyle(0.5, 0xffffff, 0.25).drawCircle(0, 0, rad);
  }
}

function updateLabelsVisibility({ sysMap, world, activeFactions }) {
  const show = world.scale.x > 0.54;
  Object.values(sysMap).forEach(({ lbl, data, dot }) => {
    const enabled = activeFactions.has(data.faction);
    dot.visible = enabled;
    lbl.visible = enabled && show;
  });
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

