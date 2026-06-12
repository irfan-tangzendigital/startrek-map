// Regenerates PROGRESS.html (repo root) from scripts/progress-data.json.
// Usage: node scripts/gen-progress.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'scripts', 'progress-data.json'), 'utf8'));

const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const allTasks = data.priorities.flatMap((p) => p.tasks);
const doneTotal = allTasks.filter((t) => t.status === 'DONE').length;

const badge = (status) => {
  const cls = status === 'DONE' ? 'done' : status === 'IN PROGRESS' ? 'wip' : 'todo';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
};

const bar = (done, total, color) => `
  <div class="bar"><div class="bar-fill" style="width:${Math.round((done / total) * 100)}%;background:${color}"></div>
  <span class="bar-label">${done} / ${total}</span></div>`;

const taskRow = (t) => `
  <div class="task">
    <div class="task-head">
      <span class="said">${esc(t.id)}</span>
      <span class="task-title">${esc(t.title)}</span>
      ${badge(t.status)}
    </div>
    ${
      t.status === 'DONE' && t.summary
        ? `<details class="detail"><summary>CHANGE LOG</summary><div class="detail-body">${esc(
            t.summary,
          )}${
            t.screenshot
              ? `<img src="${esc(t.screenshot)}" alt="${esc(t.id)} screenshot">`
              : '<div class="shot-placeholder">NO VISUAL RECORD</div>'
          }</div></details>`
        : ''
    }
  </div>`;

const prioritySection = (p) => {
  const done = p.tasks.filter((t) => t.status === 'DONE').length;
  return `
  <section class="priority">
    <div class="p-header" style="border-color:${p.color}">
      <div class="p-pill" style="background:${p.color}"></div>
      <h2 style="color:${p.color}">PRIORITY ${p.id} — ${esc(p.title)}</h2>
    </div>
    ${bar(done, p.tasks.length, p.color)}
    ${p.tasks.map(taskRow).join('')}
  </section>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stellar Cartography — Enhancement Progress</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Antonio:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #050510; color: #FFCCAA; font-family: 'Antonio', sans-serif; padding: 32px 24px 60px; max-width: 980px; margin: 0 auto; }
  h1 { color: #FF9900; font-size: 28px; letter-spacing: .12em; border-bottom: 3px solid #FF9900; padding-bottom: 10px; margin-bottom: 18px; }
  h2 { font-size: 20px; letter-spacing: .1em; }
  .bar { position: relative; height: 22px; background: #11111f; border-radius: 11px; overflow: hidden; margin: 10px 0 16px; border: 1px solid #222238; }
  .bar-fill { height: 100%; border-radius: 11px; transition: width .3s; }
  .bar-label { position: absolute; right: 12px; top: 2px; font-family: 'Share Tech Mono', monospace; font-size: 13px; color: #fff; }
  .priority { margin-top: 36px; }
  .p-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid; padding-bottom: 8px; }
  .p-pill { width: 44px; height: 18px; border-radius: 9px 4px 4px 9px; }
  .task { background: #0a0a18; border: 1px solid #1b1b30; border-radius: 4px 14px 14px 4px; margin-bottom: 8px; padding: 10px 14px; }
  .task-head { display: flex; align-items: center; gap: 12px; }
  .said { font-family: 'Share Tech Mono', monospace; color: #99CCFF; font-size: 13px; min-width: 52px; }
  .task-title { flex: 1; font-size: 16px; letter-spacing: .04em; }
  .badge { font-family: 'Share Tech Mono', monospace; font-size: 11px; padding: 3px 10px; border-radius: 100px; letter-spacing: .1em; }
  .badge.todo { background: #222; color: #888; }
  .badge.wip { background: #443300; color: #FFCC00; }
  .badge.done { background: #003311; color: #33DD77; }
  details.detail { margin-top: 8px; }
  details.detail summary { cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #FF9900; letter-spacing: .15em; }
  .detail-body { font-family: 'Share Tech Mono', monospace; font-size: 12.5px; line-height: 1.6; color: #BBAA99; padding: 8px 4px 2px; white-space: pre-wrap; }
  .detail-body img { display: block; max-width: 100%; margin-top: 8px; border: 1px solid #333; border-radius: 4px; }
  .shot-placeholder { margin-top: 8px; border: 1px dashed #333; border-radius: 4px; padding: 8px; color: #444; font-size: 11px; letter-spacing: .12em; }
  footer { margin-top: 40px; font-family: 'Share Tech Mono', monospace; font-size: 12px; color: #555577; letter-spacing: .08em; border-top: 1px solid #1b1b30; padding-top: 12px; }
</style>
</head>
<body>
  <h1>★ STELLAR CARTOGRAPHY — ENHANCEMENT PROGRESS</h1>
  <div style="font-family:'Share Tech Mono',monospace;font-size:13px;color:#99CCFF">OVERALL COMPLETION</div>
  ${bar(doneTotal, allTasks.length, '#FF9900')}
  ${data.priorities.map(prioritySection).join('')}
  <footer>LAST UPDATED: ${new Date().toISOString()}</footer>
</body>
</html>
`;

writeFileSync(join(root, 'PROGRESS.html'), html);
console.log(`PROGRESS.html written — ${doneTotal}/${allTasks.length} done`);
