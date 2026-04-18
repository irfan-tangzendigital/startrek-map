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

(async () => {
  const map = await initMap(systems, factions, {
    onSelect: (sys) => ui?.openInfo(sys),
    onZoomChange: (dist) => ui?.setZoomLabel(dist),
  });

  ui = initUI({ map, factions, systems });

  initSectorView(systems, factions);
})();
