import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STAPI_BASE = 'https://stapi.co/api/v1/rest';
const PAGE_SIZE = 100;
const ALLOWED_TYPES = new Set(['PLANET', 'STAR_SYSTEM', 'SPACE_STATION']);
const RATE_LIMIT_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getAstronomicalObjects(payload) {
  // STAPI usually returns `astronomicalObjects`, but be defensive.
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.astronomicalObjects)) return payload.astronomicalObjects;
  if (Array.isArray(payload.objects)) return payload.objects;
  return [];
}

function getTotalPages(payload) {
  const tp = payload?.page?.totalPages;
  return Number.isFinite(tp) ? tp : 0;
}

async function fetchPage(pageNumber) {
  const url = new URL(`${STAPI_BASE}/astronomicalObject/search`);
  url.searchParams.set('pageNumber', String(pageNumber));
  url.searchParams.set('pageSize', String(PAGE_SIZE));

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`STAPI ${res.status} ${res.statusText} for page ${pageNumber}. Body: ${body.slice(0, 500)}`);
  }
  return await res.json();
}

export async function fetchStapi() {
  let pageNumber = 0;
  let totalPages = null;
  const collected = [];

  while (totalPages === null || pageNumber < totalPages) {
    const data = await fetchPage(pageNumber);

    if (totalPages === null) {
      totalPages = getTotalPages(data);
      if (!totalPages) {
        throw new Error(`STAPI response missing page.totalPages on page ${pageNumber}`);
      }
    }

    const rows = getAstronomicalObjects(data);
    const filtered = rows.filter((r) => ALLOWED_TYPES.has(r?.astronomicalObjectType));
    collected.push(...filtered);

    console.log(
      `[fetch_stapi] page ${pageNumber + 1}/${totalPages} · collected ${collected.length}`,
    );

    pageNumber += 1;
    if (pageNumber < totalPages) await sleep(RATE_LIMIT_MS);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cacheDir = path.join(__dirname, 'cache');
  const outPath = path.join(cacheDir, 'stapi_raw.json');

  await ensureDir(cacheDir);
  await fs.writeFile(outPath, JSON.stringify(collected, null, 2), 'utf8');

  console.log(`[fetch_stapi] wrote ${collected.length} records to ${outPath}`);

  return { outPath, count: collected.length };
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  fetchStapi().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

