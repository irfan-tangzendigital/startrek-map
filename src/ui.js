export function initUI({ map, factions, systems }) {
  const infoPanel = document.getElementById('info-panel');
  const closeBtn = document.getElementById('info-close');
  const zoomLabel = document.getElementById('zoom-label');
  const coordsLabel = document.getElementById('coords');

  const ui = {
    setZoomLabel(scale) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    },
    setCoords({ wx, wy }) {
      const sx = pad3(Math.floor(Math.max(0, wx) / 100));
      const sy = pad3(Math.floor(Math.max(0, wy) / 100));
      coordsLabel.textContent = `SECTOR ${sx}-${sy}  ·  ${wx} , ${wy}`;
    },
    openInfo(sys) {
      if (!sys) {
        infoPanel.classList.remove('open');
        return;
      }

      const f = factions[sys.faction];
      document.getElementById('info-faction-bar').style.background = f.css;
      const tag = document.getElementById('info-faction-tag');
      tag.textContent = f.name;
      tag.style.background = `${f.css}22`;
      tag.style.border = `1px solid ${f.css}55`;
      tag.style.color = f.css;

      document.getElementById('info-name').textContent = sys.name;
      document.getElementById('info-subtitle').textContent = sys.subtitle;

      const stats = document.getElementById('info-stats');
      stats.innerHTML = '';
      const chips = [
        ['Class', sys.classification || '—'],
        ['Quadrant', sys.quadrant || '—'],
        ['Sector', sys.sector || '—'],
        ['Coords', sys.coordinates || '—'],
        ['Population', sys.population || '—'],
      ];
      chips.forEach(([label, val]) => {
        stats.insertAdjacentHTML(
          'beforeend',
          `<div class="stat-chip"><span>${label}</span>${escapeHtml(val)}</div>`,
        );
      });

      document.getElementById('info-desc').textContent = sys.desc || '';

      const evSection = document.getElementById('events-section');
      const evDiv = document.getElementById('info-events');
      if (sys.events && sys.events.length) {
        evDiv.innerHTML = sys.events
          .map(
            (e) =>
              `<div class="event-row"><div class="event-year">${escapeHtml(
                String(e.year),
              )}</div><div class="event-text">${escapeHtml(e.text)}</div></div>`,
          )
          .join('');
        evSection.style.display = '';
      } else {
        evSection.style.display = 'none';
      }

      const chSection = document.getElementById('chars-section');
      const chDiv = document.getElementById('info-chars');
      if (sys.characters && sys.characters.length) {
        chDiv.innerHTML = sys.characters.map((c) => `<div class="char-tag">${escapeHtml(c)}</div>`).join('');
        chSection.style.display = '';
      } else {
        chSection.style.display = 'none';
      }

      document.getElementById('info-shows').innerHTML = (sys.shows || [])
        .map((s) => `<div class="show-badge">${escapeHtml(s)}</div>`)
        .join('');

      document.getElementById('info-malpha').href = sys.memAlpha
        ? `https://memory-alpha.fandom.com/wiki/${sys.memAlpha}`
        : 'https://memory-alpha.fandom.com/wiki/Main_Page';

      infoPanel.classList.add('open');
    },
  };

  // Controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    map.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.35);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    map.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.74);
  });
  document.getElementById('reset-btn').addEventListener('click', () => map.resetView());

  closeBtn.addEventListener('click', () => map.setSelectedSystem(null));

  // Faction filters
  buildFactionFilters({ map, factions });

  // Search
  buildSearch({ map, factions, systems });

  return ui;
}

function buildFactionFilters({ map, factions }) {
  const list = document.getElementById('faction-list');
  list.innerHTML = '';
  Object.entries(factions).forEach(([id, f]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'faction-btn';
    btn.innerHTML = `<span class="faction-dot" style="background:${f.css}"></span>${escapeHtml(f.name)}`;
    btn.addEventListener('click', () => {
      const enabled = map.activeFactions.has(id);
      map.setFactionEnabled(id, !enabled);
      btn.classList.toggle('off', enabled);
    });
    list.appendChild(btn);
  });
}

function buildSearch({ map, factions, systems }) {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    console.log('[search] systems:', Array.isArray(systems), systems?.length);
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;

    systems
      .filter((s) => {
        const normalised = (s.name || '').toLowerCase().replaceAll(' system', '');
        const faction = (s.faction || '').toLowerCase();
        return (
          normalised.includes(q) ||
          (s.subtitle || '').toLowerCase().includes(q) ||
          (s.id || '').toLowerCase().includes(q) ||
          faction.includes(q)
        );
      })
      .slice(0, 8)
      .forEach((sys) => {
        const el = document.createElement('div');
        el.className = 'search-result';
        el.innerHTML = `<div>${escapeHtml(sys.name)}</div><div class="search-result-sub">${escapeHtml(
          factions[sys.faction]?.name ?? '',
        )}</div>`;
        el.addEventListener('click', () => {
          input.value = sys.name;
          results.innerHTML = '';
          map.flyTo(sys);
        });
        results.appendChild(el);
      });
  });

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('search-panel');
    if (!panel.contains(e.target)) results.innerHTML = '';
  });
}

function pad3(n) {
  return String(Math.max(0, n)).padStart(3, '0');
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

