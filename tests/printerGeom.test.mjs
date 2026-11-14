import test from 'node:test';
import assert from 'node:assert/strict';
import { printerGeom } from '../src/lib/printerGeom.js';

const base = { screenH: 844, safeTop: 54, bottomPad: 28, actionsH: 118, gapAbove: 12, btnH: 56 };

test('кнопка опускается к блоку «Скачать / Отмена»', () => {
  const g = printerGeom({ ...base, paperH: 300, originY: 200 });
  assert.equal(g.destY, 844 - 28 - 118 - 12 - 56);
  assert.equal(g.travel, g.destY - 200);
  assert.equal(g.ejectH, 300);
  assert.equal(g.scrollable, false);
  assert.equal(g.ready, true);
});

test('длинный чек ограничен окном и прокручивается', () => {
  const g = printerGeom({ ...base, paperH: 2000, originY: 300 });
  assert.equal(g.ejectH, g.maxEject);
  assert.equal(g.maxEject, g.destY - 54);
  assert.equal(g.scrollable, true);
});

test('ещё не измерен — не готов, окно максимальное', () => {
  const g = printerGeom({ ...base });
  assert.equal(g.ready, false);
  assert.equal(g.ejectH, g.maxEject);
  assert.equal(g.travel, 0);
});

test('маленький экран: кнопка не уезжает под верх', () => {
  const g = printerGeom({ ...base, screenH: 300, paperH: 100, originY: 100 });
  assert.equal(g.destY, 54 + 80);
  assert.ok(g.maxEject >= 1);
});

test('высота окна не зависит от того, где нажали', () => {
  const a = printerGeom({ ...base, paperH: 500, originY: 120 });
  const b = printerGeom({ ...base, paperH: 500, originY: 610 });
  assert.equal(a.ejectH, b.ejectH);
});
