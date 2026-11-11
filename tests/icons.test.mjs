import { createRequire } from 'module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { GLYPHS, LAYERS, SET, STROKES, SHIFT, iconBBox } = require('../src/ui/icon-paths.js');

test('все иконки набора имеют контур', () => {
  for (const name of SET) {
    if (STROKES[name]) {
      assert.ok(STROKES[name].d || STROKES[name].circle, name);
      continue;
    }
    const layers = LAYERS[name] || [name];
    assert.ok(layers.length, name);
    for (const id of layers) {
      assert.equal(typeof GLYPHS[id], 'string', `${name}/${id}`);
      assert.ok(GLYPHS[id].length > 10, `${name}/${id} too short`);
    }
  }
});

test('в наборе есть иконки трёх разделов дока', () => {
  for (const name of ['card', 'calendar', 'calculator']) {
    assert.ok(SET.includes(name), name);
  }
});

test('после сдвига глифы оказываются в центре viewBox 24×24', () => {
  for (const name of SET) {
    if (STROKES[name]) {
      if (STROKES[name].circle) {
        assert.equal(STROKES[name].circle.cx, 12, name);
        assert.equal(STROKES[name].circle.cy, 12, name);
      }
      continue;
    }
    const b = iconBBox(name, GLYPHS, LAYERS);
    const [dx, dy] = SHIFT[name] || [0, 0];
    assert.ok(Math.abs(b.cx + dx - 12) < 0.12, `${name} cx ${b.cx}+${dx}`);
    assert.ok(Math.abs(b.cy + dy - 12) < 0.12, `${name} cy ${b.cy}+${dy}`);
  }
});
