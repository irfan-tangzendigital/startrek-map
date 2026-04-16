import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://memory-alpha.fandom.com/api.php';
const RATE_LIMIT_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadOverrides(overridesPath) {
  const raw = await fs.readFile(overridesPath, 'utf8');
  return JSON.parse(raw);
}

async function saveOverrides(overridesPath, overrides) {
  await fs.writeFile(overridesPath, JSON.stringify(overrides, null, 2), 'utf8');
}

async function fetchIntro(slug) {
  const url = new URL(API_BASE);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', slug);
  url.searchParams.set('prop', 'extracts');
  url.searchParams.set('exintro', '1');
  url.searchParams.set('explaintext', '1');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Memory Alpha ${res.status} ${res.statusText} for "${slug}". Body: ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0];
  const extract = page?.extract;
  if (!extract || typeof extract !== 'string') return null;

  const firstPara = extract.split('\n').find((p) => p.trim().length > 0);
  return firstPara ? firstPara.trim() : null;
}

export async function fetchMemoryAlpha({ dryRun = false } = {}) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const overridesPath = path.join(__dirname, 'overrides.json');

  const overrides = await loadOverrides(overridesPath);
  const entries = Object.entries(overrides);

  let fetched = 0;
  let skipped = 0;
  let missingSlug = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const [name, data] = entries[i];

    if (!data?.memAlpha) {
      missingSlug += 1;
      continue;
    }
    if (data.desc) {
      skipped += 1;
      continue;
    }

    console.log(`[fetch_memory_alpha] ${i + 1}/${entries.length} fetching "${name}" -> ${data.memAlpha}`);
    const intro = await fetchIntro(data.memAlpha);
    if (intro) {
      overrides[name].desc = intro;
      fetched += 1;
    } else {
      console.log(`[fetch_memory_alpha] no extract for "${name}" (${data.memAlpha})`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  if (!dryRun) await saveOverrides(overridesPath, overrides);

  console.log(
    `[fetch_memory_alpha] done. fetched=${fetched} skipped(existing desc)=${skipped} missingSlug=${missingSlug}`,
  );

  return { fetched, skipped, missingSlug, overridesPath };
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  fetchMemoryAlpha().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

