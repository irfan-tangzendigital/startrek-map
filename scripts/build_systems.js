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

  const out = stapiRaw.map((entry) => {
    const o = overridesByName.get(normName(entry?.name));
    const merged = o
      ? { ...entry, ...o }
      : {
          uid: entry?.uid,
          name: entry?.name,
          astronomicalObjectType: entry?.astronomicalObjectType,
          quadrant: entry?.location?.name,
        };

    if (isMissingCoord(merged.x) || isMissingCoord(merged.y)) {
      const pos = generatePosition(merged);
      if (isMissingCoord(merged.x)) merged.x = pos.x;
      if (isMissingCoord(merged.y)) merged.y = pos.y;
    }

    return merged;
  });

  await writeJson(outPath, out);
  console.log(`[build_systems] wrote ${out.length} records to ${outPath}`);

  return { outPath, count: out.length };
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  buildSystems().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
