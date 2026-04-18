import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCALE = 5;

// The HYG repo stores the CSV as Git LFS under `CURRENT/`. The `raw/` path
// returns only the LFS pointer (~133 bytes), so we use the `media/` path
// which resolves LFS and returns the actual gzipped CSV.
const HYG_URL =
  'https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v42.csv.gz';
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_CSV = path.join(CACHE_DIR, 'hyg_v42.csv');

export async function fetchHygCoords() {
  let csv;
  if (fs.existsSync(CACHE_CSV)) {
    console.log('[HYG] Using cached HYG v4.2 CSV');
    csv = fs.readFileSync(CACHE_CSV, 'utf8');
  } else {
    console.log('[HYG] Downloading HYG v4.2 database...');

    const res = await fetch(HYG_URL);
    if (!res.ok) throw new Error(`HYG fetch failed: ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    csv = zlib.gunzipSync(gz).toString('utf8');

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_CSV, csv, 'utf8');
    console.log(`[HYG] Cached CSV (${csv.length.toLocaleString()} chars) at ${CACHE_CSV}`);
  }

  const lines = csv.split('\n');
  const stripQuotes = (s) =>
    s && s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  const headers = lines[0].split(',').map((h) => stripQuotes(h.trim()));
  const idx = (name) => headers.indexOf(name);

  const iProper = idx('proper');
  const iBf = idx('bf');
  const iX = idx('x');
  const iY = idx('y');
  const iZ = idx('z');

  const byProper = {};
  const byBf = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;
    const proper = stripQuotes(cols[iProper]?.trim() ?? '');
    const bf = stripQuotes(cols[iBf]?.trim() ?? '').replace(/\s+/g, '');
    const x = parseFloat(cols[iX]);
    const y = parseFloat(cols[iY]);
    const z = parseFloat(cols[iZ]);
    if (isNaN(x)) continue;
    if (proper) byProper[proper] = { x, y, z };
    if (bf) byBf[bf] = { x, y, z };
  }

  console.log(`[HYG] Parsed ${Object.keys(byProper).length} named stars`);

  const mapping = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'hyg_mapping.json'), 'utf8'),
  );
  const overrides = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'overrides.json'), 'utf8'),
  );

  let matched = 0;
  let skipped = 0;

  for (const [systemName, mapEntry] of Object.entries(mapping)) {
    const star =
      mapEntry.match === 'proper'
        ? byProper[mapEntry.value]
        : byBf[mapEntry.value.replace(/\s+/g, '')];

    if (!star) {
      console.log(`[HYG] No match for ${systemName} (${mapEntry.value})`);
      skipped++;
      continue;
    }

    // HYG axes: x=toward galactic center, y=galactic plane, z=galactic north.
    // Three.js: X=right, Y=up, Z=toward camera.
    const tx = star.x / SCALE;
    const ty = star.z / SCALE;
    const tz = star.y / SCALE;

    if (!overrides[systemName]) {
      overrides[systemName] = {};
    }

    if (!overrides[systemName].hyg_locked) {
      overrides[systemName].hyg3d = { x: tx, y: ty, z: tz };
      overrides[systemName].hyg_source = mapEntry.note;
    }

    matched++;
    console.log(
      `[HYG] ${systemName} → (${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(
        2,
      )}) units [${mapEntry.note}]`,
    );
  }

  fs.writeFileSync(
    path.join(__dirname, 'overrides.json'),
    JSON.stringify(overrides, null, 2),
  );

  console.log(`[HYG] Done. ${matched} matched, ${skipped} skipped.`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const entryUrl = new URL(`file://${path.resolve(process.argv[1]).replaceAll('\\', '/')}`)
    .href;
  return import.meta.url === entryUrl;
})();

if (isMain) {
  fetchHygCoords().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
