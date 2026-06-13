import './style.css';
import factionsArray from './data/factions.json';
import systems from './data/systems.json';
import { initMap } from './map.js';
import { initUI } from './ui.js';
import { initSectorView } from './sector-view.js';

const factions = Object.fromEntries(
  factionsArray.map((f) => [
    f.id,
    {
      ...f,
      color: parseInt(f.color, 16),
    },
  ]),
);

let ui;

// LCARS boot overlay — plays once per browser session.
function runBootSequence(systemCount) {
  try {
    if (sessionStorage.getItem('lcars-booted')) return;
    sessionStorage.setItem('lcars-booted', '1');
  } catch {
    /* storage blocked — just play the sequence */
  }
  const stardate = (41000 + (Date.now() / 1000 / 3600 / 24 / 365.25) * 1000).toFixed(1);
  const overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  const lines = [
    [`LCARS ${stardate} — INITIALISING STELLAR CARTOGRAPHY`, 300],
    [`LOADING SYSTEM DATABASE... ${systemCount} OBJECTS`, 600],
    ['CALIBRATING FACTION TERRITORIES...', 900],
    ['STELLAR CARTOGRAPHY ONLINE', 1200],
  ];
  document.body.appendChild(overlay);
  document.body.classList.add('booting');
  for (const [text, delay] of lines) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'boot-line';
      el.textContent = text;
      overlay.appendChild(el);
    }, delay);
  }
  setTimeout(() => {
    overlay.classList.add('boot-done');
    document.body.classList.remove('booting');
    setTimeout(() => overlay.remove(), 600);
  }, 2000);
}

(async () => {
  runBootSequence(systems.length);
  const map = await initMap(systems, factions, {
    onSelect: (sys) => ui?.openInfo(sys),
    onZoomChange: (dist) => ui?.setZoomLabel(dist),
    onSystemView: (sys, planets) => ui?.openSystemView(sys, planets),
  });

  ui = initUI({ map, factions, systems });

  initSectorView(systems, factions);
})();
