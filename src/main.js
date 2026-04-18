import './style.css';
import factionsArray from './data/factions.json';
import systems from './data/systems.json';
import { createMap } from './map.js';
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

const mountEl = document.getElementById('app');

let ui;
const map = createMap({
  mountEl,
  factions,
  systems,
  onSelectionChange: (sys) => ui?.openInfo(sys),
  onZoomChange: (scale) => ui?.setZoomLabel(scale),
  onCoordsChange: (coords) => ui?.setCoords(coords),
});

ui = initUI({ map, factions, systems });

initSectorView(systems, factions);
