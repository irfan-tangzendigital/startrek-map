// Usage: node scripts/mark-done.mjs SA1.1 "summary of changes"
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'scripts', 'progress-data.json');
const [id, summary] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, 'utf8'));
const task = data.priorities.flatMap((p) => p.tasks).find((t) => t.id === id);
if (!task) throw new Error(`Unknown task ${id}`);
task.status = 'DONE';
if (summary) task.summary = summary;
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
execSync(`node "${join(root, 'scripts', 'gen-progress.mjs')}"`, { stdio: 'inherit' });
