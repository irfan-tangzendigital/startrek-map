import './style.css';
import factionsArray from './data/factions.json';
import systems from './data/systems.json';
import { createMap } from './map.js';
import { initUI } from './ui.js';

const factions = Object.fromEntries(
  factionsArray.map((f) => [
    f.id,
    {
      ...f,
      color: parseInt(f.color, 16),
    },
  ]),
);

const territories = [
  { faction: 'federation', points: [760, 500, 1360, 440, 1420, 960, 1120, 1060, 780, 990] },
  { faction: 'klingon', points: [1360, 440, 1780, 360, 1870, 840, 1560, 980, 1420, 960] },
  { faction: 'romulan', points: [1100, 150, 1780, 80, 1920, 520, 1560, 560, 1200, 420] },
  { faction: 'cardassian', points: [640, 790, 960, 740, 1010, 1160, 820, 1290, 540, 1110] },
  { faction: 'ferengi', points: [490, 340, 790, 270, 830, 610, 650, 700, 410, 580] },
  { faction: 'breen', points: [700, 1060, 1010, 990, 1110, 1280, 900, 1460, 590, 1360] },
];

const mountEl = document.getElementById('app');

let ui;
const map = createMap({
  mountEl,
  factions,
  systems,
  territories,
  onSelectionChange: (sys) => ui?.openInfo(sys),
  onZoomChange: (scale) => ui?.setZoomLabel(scale),
  onCoordsChange: (coords) => ui?.setCoords(coords),
});

ui = initUI({ map, factions, systems });
