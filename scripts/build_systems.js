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
    if (o) {
      return { ...entry, ...o };
    }

    return {
      uid: entry?.uid,
      name: entry?.name,
      astronomicalObjectType: entry?.astronomicalObjectType,
      quadrant: entry?.location?.name,
    };
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

