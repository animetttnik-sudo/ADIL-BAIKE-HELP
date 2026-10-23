import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickCanPlus, quickParse, quickShown, quickStep, quickValue } from '../src/lib/quickEntry.js';
import { CALC_ITEMS } from '../src/lib/calc.js';

const N = CALC_ITEMS.length;

test('порядок — строки Excel, 39 карточек', () => {
  assert.equal(N, 39);
  assert.equal(CALC_ITEMS[0].name, 'best burger');
  assert.equal(CALC_ITEMS[6].name, 'КП');
});

test('Далее идёт вперёд, на последней — Готово (done)', () => {
  assert.deepEqual(quickStep(0, 1, N), { index: 1, done: false });
  assert.deepEqual(quickStep(N - 2, 1, N), { index: N - 1, done: false });
  assert.deepEqual(quickStep(N - 1, 1, N), { index: N - 1, done: true });
});

test('Назад — к предыдущей, с первой никуда', () => {
  assert.deepEqual(quickStep(5, -1, N), { index: 4, done: false });
  assert.deepEqual(quickStep(0, -1, N), { index: 0, done: false });
});

test('проход всех карточек «Далее» подряд — 38 шагов и Готово', () => {
  let i = 0;
  let steps = 0;
  for (;;) {
    const r = quickStep(i, 1, N);
    if (r.done) break;
    i = r.index;
    steps++;
  }
  assert.equal(steps, N - 1);
  assert.equal(i, N - 1);
});

test('индекс вне диапазона прижимается, пустой список — сразу done', () => {
  assert.deepEqual(quickStep(99, -1, N), { index: N - 2, done: false });
  assert.deepEqual(quickStep(-3, 1, N), { index: 1, done: false });
  assert.equal(quickStep(0, 1, 0).done, true);
});

test('пустой ввод + Далее — значение остаётся (0, если не было)', () => {
  assert.deepEqual(quickValue([12], ''), [12]);
  assert.deepEqual(quickValue([59, 98], ''), [59, 98]);
  assert.deepEqual(quickValue(undefined, ''), [0]);
  assert.deepEqual(quickValue(7, '  '), [7]);
  assert.deepEqual(quickValue([], ''), [0]);
});

test('набранное заменяет значение, «59+98» — два подсчёта', () => {
  assert.deepEqual(quickValue([12], '40'), [40]);
  assert.deepEqual(quickValue([59, 98], '5'), [5]);
  assert.deepEqual(quickValue([1], '59+98'), [59, 98]);
  assert.deepEqual(quickValue([1], '59+'), [59]);
  assert.deepEqual(quickValue([3], '0'), [0]);
  assert.deepEqual(quickParse('+'), null);
  assert.deepEqual(quickParse('1a2'), [12]);
});

test('кнопка «+» только после числа; подпись значения', () => {
  assert.equal(quickCanPlus(''), false);
  assert.equal(quickCanPlus('59'), true);
  assert.equal(quickCanPlus('59+'), false);
  assert.equal(quickShown([59, 98]), '59 + 98 = 157');
  assert.equal(quickShown([4]), '4');
  assert.equal(quickShown(undefined), '0');
});
