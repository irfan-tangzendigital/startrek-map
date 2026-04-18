import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

function normName(s) {
  return String(s ?? '').trim().toLowerCase();
}

/** 32-bit FNV-1a hash of uid for Mulberry32 seed */
function hashUidToSeed(uid) {
  const str = String(uid ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — returns a function yielding [0, 1) */
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

const FACTION_BOUNDS = {
  federation: { xMin: 700, xMax: 1100, yMin: 380, yMax: 780 },
  klingon: { xMin: 1400, xMax: 1900, yMin: 300, yMax: 750 },
  romulan: { xMin: 1300, xMax: 1900, yMin: 80, yMax: 400 },
  cardassian: { xMin: 400, xMax: 800, yMin: 700, yMax: 1100 },
  ferengi: { xMin: 200, xMax: 600, yMin: 250, yMax: 650 },
  breen: { xMin: 500, xMax: 900, yMin: 950, yMax: 1350 },
  dominion: { xMin: 600, xMax: 1000, yMin: 800, yMax: 1200 },
  independent: { xMin: 200, xMax: 1800, yMin: 100, yMax: 1500 },
};

const QUADRANT_BOUNDS = {
  alpha: { xMin: 100, xMax: 1200, yMin: 80, yMax: 1520 },
  beta: { xMin: 1200, xMax: 2300, yMin: 80, yMax: 1520 },
  fallback: { xMin: 200, xMax: 2200, yMin: 100, yMax: 1500 },
};

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

const QUADRANT_ZONES_3D = {
  'Alpha Quadrant': { x: [-12,   0], y: [-2, +2], z: [-8, +8] },
  'Beta Quadrant':  { x: [  0, +12], y: [-2, +2], z: [-8, +8] },
};

const FALLBACK_3D = { x: [-12, +12], y: [-2, +2], z: [-8, +8] };

function normalizeFactionKey(faction) {
  const f = String(faction ?? '')
    .trim()
    .toLowerCase();
  if (!f) return null;
  if (FACTION_BOUNDS[f]) return f;
  return null;
}

function boundsFromQuadrant(quadrant) {
  const q = String(quadrant ?? '').toLowerCase();
  if (q.includes('alpha')) return QUADRANT_BOUNDS.alpha;
  if (q.includes('beta')) return QUADRANT_BOUNDS.beta;
  return null;
}

function pickBounds(system) {
  const factionKey = normalizeFactionKey(system?.faction);
  if (factionKey) return FACTION_BOUNDS[factionKey];

  const fromQ = boundsFromQuadrant(system?.quadrant);
  if (fromQ) return fromQ;

  return QUADRANT_BOUNDS.fallback;
}

/**
 * Deterministic x/y for a system (same uid → same position across runs).
 * Uses faction zones, then quadrant zones, then global fallback.
 */
export function generatePosition(system) {
  const rng = mulberry32(hashUidToSeed(system?.uid));
  const { xMin, xMax, yMin, yMax } = pickBounds(system);
  const x = xMin + rng() * (xMax - xMin);
  const y = yMin + rng() * (yMax - yMin);
  return { x: Math.round(x), y: Math.round(y) };
}

function zoneFromFaction3D(faction) {
  const f = String(faction ?? '').trim().toLowerCase();
  return FACTION_ZONES_3D[f] || null;
}

function zoneFromQuadrant3D(quadrant) {
  const q = String(quadrant ?? '').toLowerCase();
  if (q.includes('alpha')) return QUADRANT_ZONES_3D['Alpha Quadrant'];
  if (q.includes('beta')) return QUADRANT_ZONES_3D['Beta Quadrant'];
  return null;
}

/**
 * Deterministic 3D position for a system when no HYG real-star mapping is
 * available. Uses a faction zone, then a quadrant zone, then a global
 * fallback. Seeded with uid+'_3d' so positions stay stable across runs
 * and are independent of the 2D x/y generator.
 */
export function generatePos3D(system) {
  const zone =
    zoneFromFaction3D(system?.faction) ||
    zoneFromQuadrant3D(system?.quadrant) ||
    FALLBACK_3D;
  const seedInput = `${system?.uid || system?.name || ''}_3d`;
  const rng = mulberry32(hashUidToSeed(seedInput));
  return {
    x: +(zone.x[0] + rng() * (zone.x[1] - zone.x[0])).toFixed(3),
    y: +(zone.y[0] + rng() * (zone.y[1] - zone.y[0])).toFixed(3),
    z: +(zone.z[0] + rng() * (zone.z[1] - zone.z[0])).toFixed(3),
  };
}

function isMissingCoord(v) {
  return v === undefined || v === null || v === '';
}

export async function buildSystems() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const stapiPath = path.join(__dirname, 'cache', 'stapi_raw.json');
  const overridesPath = path.join(__dirname, 'overrides.json');
  const outPath = path.join(__dirname, '..', 'src', 'data', 'systems.json');

  const stapiRaw = await readJson(stapiPath);
  const overrides = await readJson(overridesPath);

  const overridesByName = new Map(
    Object.entries(overrides).map(([name, obj]) => [normName(name), obj]),
  );

  const usedOverrideNames = new Set();

  function finalize(merged) {
    if (isMissingCoord(merged.x) || isMissingCoord(merged.y)) {
      const pos = generatePosition(merged);
      if (isMissingCoord(merged.x)) merged.x = pos.x;
      if (isMissingCoord(merged.y)) merged.y = pos.y;
    }

    // 3D position — HYG real coords take priority, then generated.
    if (merged.hyg3d) {
      merged.pos3d = merged.hyg3d;
    } else {
      merged.pos3d = generatePos3D(merged);
    }

    return merged;
  }

  const out = stapiRaw.map((entry) => {
    const key = normName(entry?.name);
    const o = overridesByName.get(key);
    if (o) usedOverrideNames.add(key);
    const merged = o
      ? { ...entry, ...o }
      : {
          uid: entry?.uid,
          name: entry?.name,
          astronomicalObjectType: entry?.astronomicalObjectType,
          quadrant: entry?.location?.name,
        };

    return finalize(merged);
  });

  // Emit synthetic records for overrides whose names don't appear in STAPI
  // (e.g. "Vulcan" vs STAPI's "Vulcan system"). These carry hand-authored
  // data and/or HYG coordinates that would otherwise be dropped.
  for (const [rawName, ovr] of Object.entries(overrides)) {
    const key = normName(rawName);
    if (usedOverrideNames.has(key)) continue;
    const slug =
      (ovr.id && String(ovr.id)) ||
      rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    const synthetic = {
      uid: `override_${slug || key}`,
      name: rawName,
      astronomicalObjectType: 'STAR_SYSTEM',
      ...ovr,
    };
    out.push(finalize(synthetic));
  }

  out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  await writeJson(outPath, out);
  console.log(`[build_systems] wrote ${out.length} records to ${outPath}`);

  return { outPath, count: out.length };
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const entryUrl = new URL(
    `file://${path.resolve(process.argv[1]).replaceAll('\\', '/')}`,
  ).href;
  return import.meta.url === entryUrl;
})();

if (isMain) {
  buildSystems().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
