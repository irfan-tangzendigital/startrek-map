export function normaliseName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+(?:system|star)$/, '');
}

export function searchSystems(systems, query, limit = 8) {
  const q = normaliseName(query);
  if (!q) return [];
  return systems
    .filter((s) => {
      const name = normaliseName(s.name);
      const subtitle = normaliseName(s.subtitle);
      const id = normaliseName(s.id);
      const faction = normaliseName(s.faction);
      return name.includes(q) || subtitle.includes(q) || id.includes(q) || faction.includes(q);
    })
    .slice(0, limit);
}
