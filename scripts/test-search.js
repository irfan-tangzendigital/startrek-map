import assert from 'node:assert/strict';
import { test } from 'node:test';
import systems from '../src/data/systems.json' with { type: 'json' };
import { normaliseName, searchSystems } from '../src/search.js';

test('normaliseName trims, lowercases, and strips a trailing system/star suffix', () => {
  assert.equal(normaliseName('  Sol system  '), 'sol');
  assert.equal(normaliseName('SOL System'), 'sol');
  assert.equal(normaliseName('sol'), 'sol');
  assert.equal(normaliseName('Wolf 359'), 'wolf 359');
  assert.equal(normaliseName('Vega star'), 'vega');
});

test("'Sol system', 'sol' and 'SOL System' resolve to Sol", () => {
  for (const query of ['Sol system', 'sol', 'SOL System']) {
    const names = searchSystems(systems, query).map((s) => s.name);
    assert.ok(names.includes('Sol'), `${JSON.stringify(query)} should include Sol, got ${JSON.stringify(names)}`);
  }
});

test('existing searches keep the same top results', () => {
  const expected = {
    sol: [
      'Fabrina solar system',
      'Sigma III solar system',
      'Sol',
      'Sol system',
      'Solais system',
      'Solais V',
      'Solarion IV',
      'Solarion system',
    ],
    vulcan: ['New Vulcan', 'Vulcan', 'Vulcan system'],
    bajor: ['Bajor', 'Bajor I', 'Bajor II', 'Bajor III', 'Bajor IV', 'Bajor IX', 'Bajor V', 'Bajor VI'],
    'wolf 359': ['Wolf 359'],
    earth: ['New Earth', 'Sol', 'Sol system'],
    "Qo'noS": ['Praxis', "Qo'noS", "Qo'noS system"],
    wolf: ['Wolf 359', 'Wolf system'],
  };
  for (const [query, names] of Object.entries(expected)) {
    assert.deepEqual(
      searchSystems(systems, query).map((s) => s.name),
      names,
      query,
    );
  }
});
