import { createRequire } from 'module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { GLYPHS, LAYERS, SET } = require('../src/ui/icon-paths.js');

test('все иконки набора имеют контур', () => {
  for (const name of SET) {
    const layers = LAYERS[name] || [name];
    assert.ok(layers.length, name);
    for (const id of layers) {
      assert.equal(typeof GLYPHS[id], 'string', `${name}/${id}`);
      assert.ok(GLYPHS[id].length > 10, `${name}/${id} too short`);
    }
  }
});

test('в наборе есть иконки трёх разделов дока', () => {
  for (const name of ['wallet', 'calendar', 'calculator']) {
    assert.ok(SET.includes(name), name);
  }
});
