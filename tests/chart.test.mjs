import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaPath, chartPoints, chartScale, chartSeries, shortMoney, smoothPath, trendOf } from '../src/lib/chart.js';

const M = { '2026-09': { e: 30000, s: 12000 }, '2026-10': { e: 25000, s: 31000 }, '2026-11': { e: 40000, s: 10000 } };
const ks = Object.keys(M).sort();

test('ряды: заработано, расходы, баланс нарастающим итогом', () => {
  const s = chartSeries(M, ks);
  assert.deepEqual(s.green, [30000, 25000, 40000]);
  assert.deepEqual(s.red, [12000, 31000, 10000]);
  assert.deepEqual(s.blue, [18000, 12000, 42000]);
  assert.deepEqual(chartSeries(M, []), { green: [], red: [], blue: [] });
});

test('тренд последнего шага', () => {
  assert.equal(trendOf([1, 3]), 1);
  assert.equal(trendOf([3, 1]), -1);
  assert.equal(trendOf([2, 2]), 0);
  assert.equal(trendOf([5]), 0);
});

test('шкала включает ноль и все значения, сетка равномерная', () => {
  const sc = chartScale([[30000, 25000], [-4000, 100]]);
  assert.ok(sc.lo <= -4000 && sc.hi >= 30000);
  assert.ok(sc.grid.includes(0));
  for (let i = 1; i < sc.grid.length; i++) assert.equal(sc.grid[i] - sc.grid[i - 1], sc.step);
  const flat = chartScale([[0, 0]]);
  assert.ok(flat.hi > flat.lo);
});

test('точки в пределах графика; одна точка — горизонталь на всю ширину', () => {
  const pts = chartPoints([0, 50, 100], { w: 300, h: 100, lo: 0, hi: 100, padX: 10, padY: 5 });
  assert.deepEqual(pts.map((p) => p.x), [10, 150, 290]);
  assert.equal(pts[0].y, 95);
  assert.equal(pts[2].y, 5);
  const one = chartPoints([50], { w: 300, h: 100, lo: 0, hi: 100 });
  assert.equal(one.length, 2);
  assert.equal(one[0].y, one[1].y);
});

test('плавная кривая: проходит через точки, монотонна (без перелёта), длина ≥ хорды', () => {
  const pts = [{ x: 0, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 50 }];
  const p = smoothPath(pts);
  assert.ok(p.d.startsWith('M0 100'));
  assert.ok(p.d.trim().endsWith('300 50'));
  assert.ok(p.len >= 300);
  // плато 100→200 на y=0: контрольные точки не выходят за 0 (нет «горба» выше данных)
  for (const [, c1, c2] of p.segs) {
    assert.ok(c1.y >= -1e-9 && c1.y <= 100 + 1e-9);
    assert.ok(c2.y >= -1e-9 && c2.y <= 100 + 1e-9);
  }
  assert.ok(p.end.angle > 0); // в SVG y вниз: рост значения = отрицательный угол; здесь линия идёт вниз
  assert.equal(smoothPath([]).d, '');
  assert.ok(areaPath(pts, 120).endsWith('Z'));
});

test('подписи оси', () => {
  assert.equal(shortMoney(12500), '12,5к');
  assert.equal(shortMoney(-2000000), '−2м');
  assert.equal(shortMoney(800), '800');
});
