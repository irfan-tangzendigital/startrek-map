import { fetchStapi } from './fetch_stapi.js';
import { fetchMemoryAlpha } from './fetch_memory_alpha.js';
import { buildSystems } from './build_systems.js';

await fetchStapi();
await fetchMemoryAlpha();
await buildSystems();

